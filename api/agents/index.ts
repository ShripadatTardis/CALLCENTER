import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest } from '../_voicebot';

/**
 * GET /api/agents -> GET {VOICEBOT_BASE_URL}/api/v1/agents
 *
 * PROVISIONAL, see src/types/api/agents.ts. Assumes the same X-API-Key
 * auth as the other endpoints (undocumented assumption, not fact) and
 * a flat, unpaginated response. A 401 here should be treated as
 * informative (confirms auth is required) rather than a bug. Revise
 * once the Swagger spec at /api/v1/openapi.yaml is reachable — attempted
 * during Session 1, the whole demo host returned 502 at the time.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  const { baseUrl } = getBackendConfig();
  await proxyRequest(res, `${baseUrl}/api/v1/agents`, { method: 'GET' });
}
