import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, withErrorBoundary, noStore } from '../_voicebot.js';
import { getClientSuppliedRole, readIntQuery } from '../_customer360.js';
import { supabaseChatRepository } from '../../src/server/chat/supabaseChatRepository.js';
import type { ChatMessageRecord, ChatSessionRecord } from '../../src/server/chat/types.js';
import type { ChatDataSource, ChatRequestDto, ChatResponseDto } from '../../src/types/api/chat.js';
import type { ChatMessage, ChatSessionSummary } from '../../src/types/chat.js';

/**
 * Single consolidated Chat function, covering everything under
 * /api/chat/* — plan §7/§17 originally specified 4 separate route
 * files (api/chat/index.ts, close.ts, logs/index.ts, logs/[id]/index.ts);
 * consolidated into one Vercel optional-catch-all function during
 * implementation after discovering the Vercel Hobby plan's 12-serverless-
 * function-per-deployment limit (Session 4 already used exactly 12;
 * adding 4 more silently failed deployment at the "Deploying outputs"
 * stage, past the build step, with no per-file error). This is a
 * transport-layer/deployment-adapter detail only (plan §0.3's logical/
 * deployment split, carried over from Session 4) — every logical
 * behavior described in the plan is unchanged; only how many physical
 * Vercel function files implement it changed.
 *
 * Routes:
 *   POST /api/chat              — send a turn
 *   POST /api/chat/close        — close a session
 *   GET  /api/chat/logs         — list sessions
 *   GET  /api/chat/logs/{id}    — one session + its messages
 */

function toSummary(s: ChatSessionRecord): ChatSessionSummary {
  return {
    id: s.id,
    upstreamSessionId: s.upstreamSessionId,
    startedAt: s.startedAt,
    lastActivityAt: s.lastActivityAt,
    status: s.status,
    messageCount: s.messageCount,
    latestIntent: s.latestIntent,
    latestConfidence: s.latestConfidence,
    latestAuthenticated: s.latestAuthenticated,
    latestDataSource: (s.latestDataSource as ChatDataSource) ?? null,
    latestDetectionMethod: s.latestDetectionMethod,
    latestLatencyMs: s.latestLatencyMs,
    customerId: s.customerId,
    agentId: s.agentId,
  };
}

function toMessage(m: ChatMessageRecord): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    text: m.rawText,
    timestamp: m.createdAt,
    metadata:
      m.role === 'ai'
        ? {
            dataSource: m.dataSource as ChatDataSource,
            authenticated: Boolean(m.authenticated),
            intent: m.intent,
            confidence: m.confidence,
            detectionMethod: m.detectionMethod,
            latencyMs: m.latencyMs,
          }
        : undefined,
  };
}

async function handleSend(req: VercelRequest, res: VercelResponse): Promise<void> {
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

async function handleClose(req: VercelRequest, res: VercelResponse): Promise<void> {
  const chatSessionId = (req.body as { chatSessionId?: string } | undefined)?.chatSessionId;
  if (!chatSessionId) {
    res.status(400).json({ detail: 'chatSessionId is required' });
    return;
  }
  await supabaseChatRepository.closeSession(chatSessionId);
  res.status(200).json({ ok: true });
}

async function handleListLogs(req: VercelRequest, res: VercelResponse): Promise<void> {
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);
  const { rows, totalCount } = await supabaseChatRepository.listSessions({ page, pageSize });
  res.status(200).json({ data: rows.map(toSummary), pagination: { page, pageSize, totalCount } });
}

async function handleGetLog(id: string, res: VercelResponse): Promise<void> {
  const session = await supabaseChatRepository.getSession(id);
  if (!session) {
    res.status(404).json({ detail: 'Chat session not found' });
    return;
  }
  const messages = await supabaseChatRepository.listMessages(id);
  res.status(200).json({ session: toSummary(session), messages: messages.map(toMessage) });
}

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);

  const raw = req.query.route;
  const route = Array.isArray(raw) ? raw : raw ? [raw] : [];

  if (route.length === 0) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ detail: 'Method not allowed. Use POST.' });
      return;
    }
    await handleSend(req, res);
    return;
  }

  if (route.length === 1 && route[0] === 'close') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ detail: 'Method not allowed. Use POST.' });
      return;
    }
    await handleClose(req, res);
    return;
  }

  if (route.length === 1 && route[0] === 'logs') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ detail: 'Method not allowed. Use GET.' });
      return;
    }
    await handleListLogs(req, res);
    return;
  }

  if (route.length === 2 && route[0] === 'logs') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ detail: 'Method not allowed. Use GET.' });
      return;
    }
    await handleGetLog(route[1], res);
    return;
  }

  res.status(404).json({ detail: 'Not found' });
});
