import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, readIntQuery } from '../_customer360.js';
import { supabaseChatRepository } from '../../src/server/chat/supabaseChatRepository.js';
import type { ChatMessageRecord, ChatSessionRecord } from '../../src/server/chat/types.js';
import type { ChatDataSource } from '../../src/types/api/chat.js';
import type { ChatMessage, ChatSessionSummary } from '../../src/types/chat.js';

/**
 * Standard (non-optional) Vercel catch-all — matches /api/chat/<1+ segments>
 * only; the zero-segment root (POST /api/chat) is its own file,
 * api/chat/index.ts, since the optional-catch-all form did not route
 * correctly in this deployment (see that file's comment).
 *
 * Routes:
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

async function handleListLogs(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);
  const { rows, totalCount } = await supabaseChatRepository.listSessions({ page, pageSize });
  res.status(200).json({ data: rows.map(toSummary), pagination: { page, pageSize, totalCount } });
}

async function handleGetLog(id: string, req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }
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

  // This deployment's builder delivers the catch-all segment under the
  // literal query key "...route" (including the ellipsis), not the
  // documented "route" — confirmed via a live diagnostic. Reading both
  // keys defensively in case that ever changes.
  const raw = req.query['...route'] ?? req.query.route;
  const route = Array.isArray(raw) ? raw : raw ? [raw] : [];

  if (req.query.debug === '1') {
    res.status(200).json({ url: req.url, query: req.query, parsedRoute: route });
    return;
  }

  if (route.length === 1 && route[0] === 'close') {
    await handleClose(req, res);
    return;
  }
  if (route.length === 1 && route[0] === 'logs') {
    await handleListLogs(req, res);
    return;
  }
  if (route.length === 2 && route[0] === 'logs') {
    await handleGetLog(route[1], req, res);
    return;
  }

  res.status(404).json({ detail: 'Not found' });
});
