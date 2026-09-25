import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useClassification } from '@/hooks/classification/useClassification';
import { fetchChatLogs } from '@/services/chat/chatService';
import { computeScopedChatMetrics } from '@/services/analytics/scopedAnalyticsAggregator';

/**
 * Session 7 §6/§9 — Chat has no aggregate-metrics endpoint and no
 * date-window query param at all (confirmed absent from the documented
 * contract), so every role — all-access or scoped — gets metrics
 * derived client-side over a bounded, server-authorized page of
 * GET /api/v1/chat/sessions (api/chat/logs.ts already applies Session
 * 6.2's category filtering for scoped roles; all-access sees every
 * session). This is never a true time-windowed aggregate — the caller
 * must label it "N of M sessions" using `totalMatchingFilter`.
 */
export function useChatAnalytics(opts: { agentId?: string; status?: string } = {}) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const classification = useClassification();

  const sessionsQuery = useQuery({
    queryKey: ['analytics', 'chat', role, opts],
    queryFn: () => fetchChatLogs(role, { page: 1, pageSize: 100, agentId: opts.agentId, status: opts.status }),
    enabled: Boolean(user),
  });

  const metrics = sessionsQuery.data
    ? computeScopedChatMetrics(sessionsQuery.data.data, sessionsQuery.data.pagination.totalCount, classification.agentsById)
    : null;

  return {
    isLoading: sessionsQuery.isLoading || classification.isLoading,
    isError: sessionsQuery.isError,
    error: sessionsQuery.error,
    metrics,
    source: sessionsQuery.data?.source ?? null,
  };
}
