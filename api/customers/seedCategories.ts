import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, withErrorBoundary, noStore, requireAdminToken } from '../_customer360.js';
import { getBackendConfig } from '../_voicebot.js';
import type { AgentsResponseDto } from '../../src/types/api/agents.js';

/**
 * POST /api/customers/seedCategories — one-time (or re-run-when-a-new-
 * agent-appears) seed for Customer 360 categories, per plan §17: reads
 * the live GET /agents response and creates one category per agent not
 * already mapped, named after the agent's display_name. Never overwrites
 * an existing mapping (see supabaseCustomerRepository.upsertCategoryForAgent),
 * so an administrator's later rename/consolidation is never clobbered by
 * a re-run. Admin-token gated, same as backfill/reconcile.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }
  if (!requireAdminToken(req, res)) return;

  noStore(res);

  const { baseUrl, apiKey } = getBackendConfig();
  const upstream = await fetch(`${baseUrl}/api/v1/agents`, { headers: { 'X-API-Key': apiKey } });
  const text = await upstream.text();
  if (!upstream.ok) {
    res.status(502).json({ detail: `Upstream /agents request failed: ${upstream.status} ${text}` });
    return;
  }
  const dto = JSON.parse(text) as AgentsResponseDto;

  const created: string[] = [];
  const skipped: string[] = [];
  const existingMap = await repo.getCategoryAgentMap();

  for (const agent of dto.agents) {
    if (existingMap.has(agent.agent_id)) {
      skipped.push(agent.agent_id);
      continue;
    }
    await repo.upsertCategoryForAgent(agent.agent_id, agent.display_name);
    created.push(agent.agent_id);
  }

  res.status(200).json({ created, skipped, totalAgents: dto.agents.length });
});
