import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAgents } from './useAgents';
import { useCallData } from '@/hooks/calls/useCallData';
import { useCallMetricsBulk } from '@/hooks/calls/useCallMetrics';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { fetchChatLogs } from '@/services/chat/chatService';
import {
  computeAgentCallMetrics,
  computeAgentCallTechnicalPerformance,
  computeAgentChatMetrics,
  computeAgentCampaignOutcomeSummary,
} from '@/services/agents/agentPerformanceAggregator';
import { buildCallMetricsByInteractionId } from '@/lib/callMetricsCorrelation';

/**
 * Composes the real /agents roster with already-existing calls/chat/
 * campaign hooks, filtered and aggregated client-side by agentId — no
 * new serverless route (docs/CALL_CENTRE_SESSION6_AGENTS_QUALITY_PLAN.md
 * §18/§19). Bounded to the most recent 100 calls/chats (same page_size
 * ceiling the backend documents for /chat/sessions, applied consistently
 * to /call-data too), matching this app's existing "bounded, not a full
 * historical scan" convention (e.g. Customer 360 progressive
 * materialization's bounded first-fetch, §7 of this session's plan).
 */
export function useAgentDetail(agentId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  const agentsQuery = useAgents();
  const callsQuery = useCallData({ page_size: 100 });
  const campaignsQuery = useCampaigns({ pageSize: 100 });

  const chatQuery = useQuery({
    queryKey: ['chat', 'logs', 'byAgent', agentId, role],
    queryFn: () => fetchChatLogs(role, { agentId, pageSize: 100 }),
    enabled: Boolean(user) && Boolean(agentId),
  });

  const agent = agentsQuery.data?.agents.find((a) => a.agentId === agentId) ?? null;

  const callInteractions = (callsQuery.data?.interactions ?? []).filter((i) => i.agentId === agentId);
  const chatSessions = chatQuery.data?.data ?? [];
  const agentCampaigns = (campaignsQuery.data?.data ?? []).filter((c) => c.agentId === agentId);

  const callMetrics = computeAgentCallMetrics(callInteractions);
  const chatMetrics = computeAgentChatMetrics(chatSessions);
  const campaignOutcomes = computeAgentCampaignOutcomeSummary(agentCampaigns);

  // Session 15.4 — real Voice technical-performance, correlated from
  // this agent's own call population above (never a separate, wider
  // fetch). Dated to exactly the span of this agent's own interactions
  // so the bounded call-metrics fetch actually has a chance of covering
  // them, rather than silently defaulting to "today only" when this
  // agent's recent calls span multiple days.
  const interactionDates = callInteractions.map((i) => i.startTime.slice(0, 10)).filter(Boolean).sort();
  const dateFrom = interactionDates[0];
  const dateTo = interactionDates[interactionDates.length - 1];
  const technicalPerformanceQuery = useCallMetricsBulk(
    { date_from: dateFrom, date_to: dateTo, page_size: 100 },
    Boolean(dateFrom && dateTo),
  );
  const metricsByInteractionId = buildCallMetricsByInteractionId(technicalPerformanceQuery.data?.rows ?? []);
  const technicalPerformance = computeAgentCallTechnicalPerformance(callInteractions, metricsByInteractionId);

  return {
    agent,
    callInteractions,
    chatSessions,
    agentCampaigns,
    callMetrics,
    chatMetrics,
    campaignOutcomes,
    technicalPerformance,
    isLoading: agentsQuery.isLoading || callsQuery.isLoading || chatQuery.isLoading || campaignsQuery.isLoading,
    isError: agentsQuery.isError || callsQuery.isError || chatQuery.isError || campaignsQuery.isError,
  };
}
