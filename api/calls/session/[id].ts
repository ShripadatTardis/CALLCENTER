import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, methodNotAllowed, proxyRequest, withErrorBoundary } from '../../_voicebot.js';
import { resolveAccessForAuthenticatedUser } from '../../_auth.js';

/**
 * GET /api/calls/session/:id -> GET {VOICEBOT_BASE_URL}/api/v1/sessions/{session_id}
 *
 * Session 14.3 — closes a confirmed direct-ID bypass: this route
 * previously had zero authorization of any kind. The documented upstream
 * Session Transcript response (SessionTranscriptResponseDto) has no
 * agent_id field at all, and session_id/call_id/call_sid are NOT
 * guaranteed to be the same literal value across the Voice Agent API's
 * own endpoints (a known, already-documented upstream inconsistency —
 * see callsMapper.ts) — so there is no reliable way to attribute this
 * session to an agent for a scope-restricted caller. Rather than build a
 * fragile heuristic lookup, this fails closed: only a caller with
 * unrestricted Agent Scope (allCategories/'all') may fetch a single
 * session by id. A scope-restricted role would need a confirmed
 * attribution path before this could be safely narrowed further — a
 * documented limitation, not a silent gap.
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

  const access = await resolveAccessForAuthenticatedUser(req, 'agent');
  if (!(access.allCategories || access.authorizedAgentIds === 'all')) {
    res.status(404).json({ detail: 'Call session not found' });
    return;
  }

  const { baseUrl } = getBackendConfig();
  await proxyRequest(res, `${baseUrl}/api/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
});
