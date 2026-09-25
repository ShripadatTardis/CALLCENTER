import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, withErrorBoundary, noStore, requireAdminToken, readIntQuery } from '../_customer360.js';
import { getBackendConfig } from '../_voicebot.js';
import { runBackfillBatch } from '../../src/server/customer360/backfillJob.js';
import { runReconciliation } from '../../src/server/customer360/reconcileJob.js';
import type { AgentsResponseDto } from '../../src/types/api/agents.js';

/**
 * POST /api/customers/admin?action=backfill|reconcile|seedCategories —
 * consolidated internal/admin Customer 360 jobs (plan §5/§6/§16/§17).
 *
 * Originally three separate route files (backfill.ts, reconcile.ts,
 * seedCategories.ts). Merged into one during Session 4.5's
 * implementation after discovering the Vercel Hobby plan's 12-
 * serverless-function-per-deployment limit — Session 4 alone already
 * used exactly 12, leaving zero headroom for Session 4.5's new Chat
 * routes. These three are the lowest-traffic, most mechanically similar
 * routes (all POST, admin-token-gated, rarely invoked), so consolidating
 * them was the smallest-blast-radius way to free capacity without
 * touching anything Session 1-3.5 built. No behavior changed — same
 * three jobs, same admin-token gate, same request/response shapes, just
 * one fewer physical function file. Callers now pass `?action=...`.
 */
async function handleBackfill(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cursor = readIntQuery(req, 'cursor', 1);
  const batchSize = readIntQuery(req, 'batchSize', 5);
  const result = await runBackfillBatch(repo, source, cursor, batchSize);
  res.status(200).json(result);
}

async function handleReconcile(req: VercelRequest, res: VercelResponse): Promise<void> {
  const maxPages = readIntQuery(req, 'maxPages', 2);
  const result = await runReconciliation(repo, source, maxPages);
  res.status(200).json(result);
}

async function handleSeedCategories(_req: VercelRequest, res: VercelResponse): Promise<void> {
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
}

/**
 * Vercel Cron only ever issues a GET request and cannot set custom
 * headers — it can't drive the normal POST + X-Admin-Token admin path
 * above. Vercel's own documented mechanism for authenticating its own
 * Cron requests is a `CRON_SECRET` env var: when set, Vercel
 * automatically attaches `Authorization: Bearer <CRON_SECRET>` to every
 * Cron invocation of this deployment. This check accepts ONLY that,
 * ONLY for GET, and ONLY for action=reconcile — the one job safe/cheap
 * enough to run unattended on a schedule (see vercel.json's `crons`
 * entry). Manual/admin invocation of any action, including reconcile,
 * still requires the existing POST + X-Admin-Token path — this is a
 * narrow, additive authentication path for the scheduler adapter only,
 * not a replacement for it.
 */
function isAuthorizedCronRequest(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  const action = (Array.isArray(req.query.action) ? req.query.action[0] : req.query.action) ?? '';

  if (req.method === 'GET' && action === 'reconcile') {
    if (!isAuthorizedCronRequest(req)) {
      res.status(401).json({ detail: 'Invalid or missing cron authorization' });
      return;
    }
    noStore(res);
    await handleReconcile(req, res);
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }
  if (!requireAdminToken(req, res)) return;

  noStore(res);

  switch (action) {
    case 'backfill':
      await handleBackfill(req, res);
      return;
    case 'reconcile':
      await handleReconcile(req, res);
      return;
    case 'seedCategories':
      await handleSeedCategories(req, res);
      return;
    default:
      res.status(400).json({ detail: 'Unknown or missing ?action= — use backfill, reconcile, or seedCategories' });
  }
});
