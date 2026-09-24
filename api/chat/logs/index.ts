import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, readIntQuery } from '../../_customer360.js';
import { supabaseChatRepository } from '../../../src/server/chat/supabaseChatRepository.js';
import type { ChatSessionRecord } from '../../../src/server/chat/types.js';
import type { ChatSessionSummary } from '../../../src/types/chat.js';

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

/** GET /api/chat/logs — paginated historical Chat session list (plan §7/§11). Not category/role-filtered — see plan §11. */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }

  noStore(res);

  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);

  const { rows, totalCount } = await supabaseChatRepository.listSessions({ page, pageSize });
  res.status(200).json({ data: rows.map(toSummary), pagination: { page, pageSize, totalCount } });
});
