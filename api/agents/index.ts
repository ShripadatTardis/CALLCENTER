import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, noStore, proxyRequest, withErrorBoundary } from '../_voicebot.js';
import { repo } from '../_customer360.js';
import { resolveAccessForAuthenticatedUser } from '../_auth.js';

/**
 * GET /api/agents -> GET {VOICEBOT_BASE_URL}/api/v1/agents
 *
 * Contract confirmed via live verification (2026-09-23) — see
 * src/types/api/agents.ts for the response shape. X-API-Key auth is
 * confirmed required (this proxy attaches it, same as the other routes).
 *
 * GET /api/agents?action=classification (Session 6.2) — returns the
 * current role's authorized Domain -> Category -> agentIds tree, reusing
 * the exact same category/role primitives Customer 360 already proved
 * (customer360_categories / customer360_category_agents /
 * role_customer360_categories / role_customer360_access via
 * resolveAccessForAuthenticatedUser, Session 14.3) — no new authorization model, no new tables.
 * Consolidated onto this existing route rather than a new file to keep
 * the Vercel function count unchanged (plan §19).
 *
 * "Domain" is not a persisted entity anywhere in this schema today
 * (audited: no domain table exists) — it is a single, hardcoded UI-level
 * label for now (see DEFAULT_DOMAIN below), shaped so a future session
 * can introduce a real `domains` table without changing this response's
 * consumers (they already read `domain` as an opaque string).
 */
const DEFAULT_DOMAIN = 'Banking & Financial Services';

export interface ClassificationCategoryDto {
  id: string;
  name: string;
  agentIds: string[];
}

export interface ClassificationResponseDto {
  domain: string;
  allCategories: boolean;
  categories: ClassificationCategoryDto[];
}

async function handleClassification(req: VercelRequest, res: VercelResponse): Promise<void> {
  noStore(res);
  // Session 14.3 — Agent Scope, from the verified authenticated user.
  const access = await resolveAccessForAuthenticatedUser(req, 'agent');
  const [allCategories, categoryAgentMap] = await Promise.all([repo.listCategories(), repo.getCategoryAgentMap()]);

  const agentIdsByCategory = new Map<string, string[]>();
  for (const [agentId, categoryId] of categoryAgentMap.entries()) {
    if (!access.allCategories && access.authorizedAgentIds !== 'all' && !access.authorizedAgentIds.includes(agentId)) {
      continue;
    }
    const list = agentIdsByCategory.get(categoryId) ?? [];
    list.push(agentId);
    agentIdsByCategory.set(categoryId, list);
  }

  const categories: ClassificationCategoryDto[] = allCategories
    .filter((c) => c.active && agentIdsByCategory.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, agentIds: agentIdsByCategory.get(c.id) ?? [] }));

  const body: ClassificationResponseDto = { domain: DEFAULT_DOMAIN, allCategories: access.allCategories, categories };
  res.status(200).json(body);
}

export default withErrorBoundary(async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  if (req.query.action === 'classification') {
    await handleClassification(req, res);
    return;
  }

  const { baseUrl } = getBackendConfig();
  await proxyRequest(res, `${baseUrl}/api/v1/agents`, { method: 'GET' });
});
