import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, readReqQuery, withErrorBoundary } from '../_voicebot.js';

/**
 * GET /api/analytics/metrics -> GET {VOICEBOT_BASE_URL}/api/v1/analytics/metrics
 *
 * Date-ranged-only (date_from/date_to), aggregates over completed calls.
 * No active-call count here — Active Calls stays sourced from call-data.
 */
export default withErrorBoundary(async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  const { baseUrl } = getBackendConfig();
  const query = readReqQuery(req);
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl}/api/v1/analytics/metrics${search ? `?${search}` : ''}`;

  await proxyRequest(res, url, { method: 'GET' });
});
