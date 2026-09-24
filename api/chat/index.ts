import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, withErrorBoundary, noStore } from '../_voicebot.js';
import { getClientSuppliedRole } from '../_customer360.js';
import { supabaseChatRepository } from '../../src/server/chat/supabaseChatRepository.js';
import type { ChatRequestDto, ChatResponseDto } from '../../src/types/api/chat.js';

/**
 * POST /api/chat — send one Chat turn (plan §7). Split from the
 * sub-paths below (api/chat/[...route].ts) into its own literal file —
 * Vercel's optional catch-all ([[...route]].ts) did not correctly match
 * the zero-segment root path in this deployment (confirmed live: the
 * root POST 404'd and GET /api/chat/logs fell into the root handler
 * instead of the logs one), so the root and the sub-paths are now two
 * separate, more conventional route files instead of one exotic one.
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
