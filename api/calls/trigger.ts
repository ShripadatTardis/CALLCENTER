import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest } from '../_voicebot';

/**
 * POST /api/calls/trigger -> POST {VOICEBOT_BASE_URL}/api/v1/call
 *
 * Re-implements the documented Trigger Call gotcha: the upstream
 * returns HTTP 200 even on gateway-side failure, with an `error` key in
 * the JSON body (e.g. {"error": "to_phone is required"}). This handler
 * inspects for that and re-emits it as a non-2xx status (502), so the
 * frontend transport layer only ever has to check HTTP status.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  if (typeof req.body?.to_phone_number !== 'string' || !req.body.to_phone_number.trim()) {
    res.status(422).json({ detail: 'to_phone_number is required' });
    return;
  }

  const { baseUrl } = getBackendConfig();

  await proxyRequest(
    res,
    `${baseUrl}/api/v1/call`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    },
    (status, body) => {
      if (
        status === 200 &&
        body &&
        typeof body === 'object' &&
        'error' in (body as Record<string, unknown>)
      ) {
        return { status: 502, body };
      }
      return { status, body };
    },
  );
}
