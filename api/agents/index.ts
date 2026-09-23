import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, withErrorBoundary } from '../_voicebot.js';

/**
 * GET /api/agents -> GET {VOICEBOT_BASE_URL}/api/v1/agents
 *
 * Contract confirmed via live verification (2026-09-23) — see
 * src/types/api/agents.ts for the response shape. X-API-Key auth is
 * confirmed required (this proxy attaches it, same as the other routes).
 */
export default withErrorBoundary(async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  const { baseUrl } = getBackendConfig();
  await proxyRequest(res, `${baseUrl}/api/v1/agents`, { method: 'GET' });
});
