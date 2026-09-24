import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore } from '../../../_voicebot.js';
import { supabaseChatRepository } from '../../../../src/server/chat/supabaseChatRepository.js';
import type { ChatMessageRecord, ChatSessionRecord } from '../../../../src/server/chat/types.js';
import type { ChatDataSource } from '../../../../src/types/api/chat.js';
import type { ChatMessage, ChatSessionSummary } from '../../../../src/types/chat.js';

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
    latestDataSource: (s.latestDataSource as ChatSessionSummary['latestDataSource']) ?? null,
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

/** GET /api/chat/logs/{id} — one Chat Session's summary + full ordered conversation (plan §7/§11). */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }

  noStore(res);

  const id = req.query.id as string;
  const session = await supabaseChatRepository.getSession(id);
  if (!session) {
    res.status(404).json({ detail: 'Chat session not found' });
    return;
  }

  const messages = await supabaseChatRepository.listMessages(id);
  res.status(200).json({ session: toSummary(session), messages: messages.map(toMessage) });
});
