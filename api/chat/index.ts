import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, withErrorBoundary, noStore } from '../_voicebot.js';
import { getClientSuppliedRole } from '../_customer360.js';
import { supabaseChatRepository } from '../../src/server/chat/supabaseChatRepository.js';
import type { ChatRequestDto, ChatResponseDto } from '../../src/types/api/chat.js';

/**
 * POST /api/chat                    — send one Chat turn (plan §7)
 * POST /api/chat?action=close       — close a session (plan §7/§9)
 *
 * Both on this one literal file, dispatched by a query param, rather
 * than a separate /close path file. This deployment's dynamic-segment
 * routing proved unreliable for BOTH the optional catch-all
 * ([[...route]].ts, matched the wrong branch) and the standard catch-all
 * ([...route].ts, only matched exactly one path segment and delivered
 * it under the literal query key "...route" instead of "route",
 * confirmed via a live diagnostic) — so Chat's remaining routes use
 * literal paths + query-param dispatch instead of path segments, which
 * is what's actually been proven reliable in this environment. This
 * also keeps the total Vercel function count within the confirmed
 * 12-function Hobby-plan ceiling (see docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md §17).
 */
async function handleClose(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }
  const chatSessionId = (req.body as { chatSessionId?: string } | undefined)?.chatSessionId;
  if (!chatSessionId) {
    res.status(400).json({ detail: 'chatSessionId is required' });
    return;
  }
  await supabaseChatRepository.closeSession(chatSessionId);
  res.status(200).json({ ok: true });
}

async function handleSend(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }

  const body = req.body as ChatRequestDto | undefined;
  const message = body?.message;
  if (!message || typeof message !== 'string') {
    res.status(400).json({ detail: 'message is required' });
    return;
  }
  const sessionId = typeof body?.session_id === 'string' ? body.session_id : undefined;

  const { baseUrl, apiKey } = getBackendConfig();
  const upstream = await fetch(`${baseUrl}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  const text = await upstream.text();
  let parsedBody: unknown;
  try {
    parsedBody = text ? JSON.parse(text) : undefined;
  } catch {
    parsedBody = text;
  }

  if (!upstream.ok) {
    res.status(upstream.status).json(parsedBody);
    return;
  }

  const dto = parsedBody as ChatResponseDto;
  const now = new Date().toISOString();
  const role = getClientSuppliedRole(req);

  let chatSessionId: string | null = null;
  let persisted = true;
  try {
    if (!dto.session_id) throw new Error('Upstream /chat response had no session_id to persist against');
    const session = await supabaseChatRepository.createOrTouchSession(dto.session_id, now, role);
    chatSessionId = session.id;
    await supabaseChatRepository.appendMessage(chatSessionId, { role: 'user', rawText: message, now });
    await supabaseChatRepository.appendMessage(chatSessionId, {
      role: 'ai',
      rawText: dto.response,
      now,
      intent: dto.intent,
      confidence: dto.confidence,
      authenticated: dto.authenticated,
      dataSource: dto.data_source,
      detectionMethod: dto.detection_method,
      latencyMs: dto.latency_ms,
    });
  } catch (err) {
    persisted = false;
    console.error('Chat persistence failed (turn still returned to operator):', err);
  }

  res.status(200).json({ ...dto, chatSessionId, persisted });
}

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  if (action === 'close') {
    await handleClose(req, res);
    return;
  }
  await handleSend(req, res);
});
