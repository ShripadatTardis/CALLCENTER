import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, withErrorBoundary } from '../_voicebot.js';
import { requirePermission, recordAuditEvent } from '../_auth.js';

/**
 * POST /api/calls/trigger -> POST {VOICEBOT_BASE_URL}/api/v1/call
 *
 * Re-implements the documented Trigger Call gotcha: the upstream
 * returns HTTP 200 even on gateway-side failure, with an `error` key in
 * the JSON body (e.g. {"error": "to_phone is required"}). This handler
 * inspects for that and re-emits it as a non-2xx status (502), so the
 * frontend transport layer only ever has to check HTTP status.
 */
export default withErrorBoundary(async (req, res) => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  const user = await requirePermission(req, res, 'calls.initiate');
  if (!user) return;

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

  await recordAuditEvent({
    actorType: 'user',
    actorUserId: user.id,
    action: 'call.initiated',
    resourceType: 'call',
    resourceId: null,
    result: res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'error',
    metadata: { toPhoneNumber: req.body.to_phone_number },
    source: 'api/calls/trigger',
  });
});
