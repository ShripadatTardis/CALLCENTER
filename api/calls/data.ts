import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, readReqQuery } from '../_voicebot';

/**
 * GET /api/calls/data -> GET {VOICEBOT_BASE_URL}/api/v1/call-data
 *
 * Passes through pagination/filter query params as-is (status,
 * direction, outcome, date_from, date_to, search, min_duration,
 * max_duration, page, page_size) — no renaming at this layer; renaming
 * happens in the frontend mapper (src/services/calls/callsMapper.ts).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  const { baseUrl } = getBackendConfig();
  const query = readReqQuery(req);
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl}/api/v1/call-data${search ? `?${search}` : ''}`;

  await proxyRequest(res, url, { method: 'GET' });
}
