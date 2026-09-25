import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAgents } from './useAgents';
import { useCallData } from '@/hooks/calls/useCallData';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { fetchChatLogs } from '@/services/chat/chatService';
import {
  computeAgentCallMetrics,
  computeAgentChatMetrics,
  computeAgentCampaignOutcomeSummary,
} from '@/services/agents/agentPerformanceAggregator';

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

  return {
    agent,
    callInteractions,
    chatSessions,
    agentCampaigns,
    callMetrics,
    chatMetrics,
    campaignOutcomes,
    isLoading: agentsQuery.isLoading || callsQuery.isLoading || chatQuery.isLoading || campaignsQuery.isLoading,
    isError: agentsQuery.isError || callsQuery.isError || chatQuery.isError || campaignsQuery.isError,
  };
}
