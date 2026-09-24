import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, withErrorBoundary, noStore } from '../_voicebot.js';
import { getClientSuppliedRole } from '../_customer360.js';
import { supabaseChatRepository } from '../../src/server/chat/supabaseChatRepository.js';
import type { ChatRequestDto, ChatResponseDto } from '../../src/types/api/chat.js';

/**
 * POST /api/chat — send one Chat turn (plan §7). Proxies
 * POST /api/v1/chat (X-API-Key attached server-side, same as every
 * other proxy route), then persists both the user message and the AI
 * response as two call_center.chat_messages rows under one
 * call_center.chat_sessions row (created on first turn, touched on
 * every subsequent one — keyed on the upstream session_id).
 *
 * If the upstream call fails, nothing is persisted and the clean error
 * is relayed as-is (plan §12) — no gotcha-remapping invented, unlike
 * Trigger Call's documented "200 with {error}" quirk, since no
 * equivalent is documented for /chat.
 *
 * If the upstream call succeeds but persistence fails, the AI's
 * response is still returned to the operator (`persisted: false`) —
 * the turn itself did not fail, only the save did (plan §12).
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }

  noStore(res);

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
});
