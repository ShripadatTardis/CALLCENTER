import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, withErrorBoundary } from '../../_voicebot.js';

/**
 * GET /api/calls/session/:id -> GET {VOICEBOT_BASE_URL}/api/v1/sessions/{session_id}
 */
export default withErrorBoundary(async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  const id = req.query.id;
  const sessionId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : undefined;
  if (!sessionId) {
    res.status(422).json({ detail: 'session id is required' });
    return;
  }

  const { baseUrl } = getBackendConfig();
  await proxyRequest(res, `${baseUrl}/api/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
});
