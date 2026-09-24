import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, readIntQuery } from '../_customer360.js';
import { supabaseChatRepository } from '../../src/server/chat/supabaseChatRepository.js';
import type { ChatMessageRecord, ChatSessionRecord } from '../../src/server/chat/types.js';
import type { ChatDataSource } from '../../src/types/api/chat.js';
import type { ChatMessage, ChatSessionSummary } from '../../src/types/chat.js';

/**
 * GET /api/chat/logs            — paginated session list (plan §7/§11)
 * GET /api/chat/logs?id={id}    — one session + its ordered messages
 *
 * One literal file, list vs. detail dispatched by the presence of an
 * `id` query param, rather than a `/logs/{id}` path segment — see
 * api/chat/index.ts's comment for why path-segment dynamic routing was
 * abandoned for Chat in this deployment.
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

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }

  noStore(res);

  if (req.query.debug === '1') {
    res.status(200).json({ url: req.url, query: req.query });
    return;
  }

  const idRaw = req.query.id;
  const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;

  if (id) {
    const session = await supabaseChatRepository.getSession(id);
    if (!session) {
      res.status(404).json({ detail: 'Chat session not found' });
      return;
    }
    const messages = await supabaseChatRepository.listMessages(id);
    res.status(200).json({ session: toSummary(session), messages: messages.map(toMessage) });
    return;
  }

  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);
  const { rows, totalCount } = await supabaseChatRepository.listSessions({ page, pageSize });
  res.status(200).json({ data: rows.map(toSummary), pagination: { page, pageSize, totalCount } });
});
