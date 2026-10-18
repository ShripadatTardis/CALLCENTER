import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
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
import { useCmaMeasure } from '@/hooks/cma/useCmaMeasure';
import { agentPerformanceCmaWindow } from '@/lib/cma/cmaWindow';
import type { CmaMeasureValue } from '@/types/cma';

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
/**
 * Session 4D — a real, authorization-aware result for the two measures
 * now sourced from CMA (never "loading forever", never a raw CMA kind
 * string leaking to the UI unexplained).
 */
export type AgentCmaMeasureState =
  | { kind: 'unauthorized' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | CmaMeasureValue;

export function useAgentDetail(agentId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const canUseCma = hasPermission(user, 'cma.evaluate');

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

  // Session 4D — CANON-AVG-SENT-SCORE / CANON-INTENT-CONFIDENCE are now
  // CMA-authoritative, per-agent and properly windowed (see
  // agentPerformanceCmaWindow's doc comment for why 90 days), replacing
  // the previous bounded-100-calls-GLOBAL-then-client-filtered sample
  // that could badly under-represent a lower-volume agent. Per this
  // session's explicit instruction, there is NO fallback to that old
  // sampling method for viewers without `cma.evaluate` — it was flagged
  // as a real population mismatch, not merely "less authoritative," so
  // reverting to it would mean knowingly showing a wrong number again.
  // Viewers without the permission see an honest "unauthorized" state
  // instead (never the old figure, never a fabricated one).
  // Memoized deliberately: agentPerformanceCmaWindow() reads `Date.now()`, so calling it
  // unmemoized on every render produces a new `from`/`to` ISO string (and therefore a new
  // useCmaMeasure query key) on every single render — which starts a brand-new request before
  // the previous one can ever resolve, so the UI never leaves its loading state. Stable for the
  // life of this hook instance (eslint-disable: deliberately empty deps — a fresh window should
  // only be computed on remount/agent change, never merely because something else re-rendered).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cmaWindow = useMemo(() => agentPerformanceCmaWindow(), [agentId]);
  const sentimentCmaQuery = useCmaMeasure(canUseCma && Boolean(agentId), {
    canonicalMeasureId: 'CANON-AVG-SENT-SCORE',
    window: { from: cmaWindow.from, to: cmaWindow.to },
    filters: { agent: agentId },
  });
  const intentConfidenceCmaQuery = useCmaMeasure(canUseCma && Boolean(agentId), {
    canonicalMeasureId: 'CANON-INTENT-CONFIDENCE',
    window: { from: cmaWindow.from, to: cmaWindow.to },
    filters: { agent: agentId },
  });

  const toCmaMeasureState = (q: typeof sentimentCmaQuery): AgentCmaMeasureState => {
    if (!canUseCma) return { kind: 'unauthorized' };
    if (q.isLoading) return { kind: 'loading' };
    if (q.isError) return { kind: 'error' };
    const result = q.data?.groups[0]?.result;
    return result ?? { kind: 'error' };
  };

  const sentimentCma = toCmaMeasureState(sentimentCmaQuery);
  const intentConfidenceCma = toCmaMeasureState(intentConfidenceCmaQuery);

  return {
    agent,
    callInteractions,
    chatSessions,
    agentCampaigns,
    callMetrics,
    chatMetrics,
    campaignOutcomes,
    technicalPerformance,
    sentimentCma,
    intentConfidenceCma,
    cmaWindowDays: cmaWindow.days,
    isLoading: agentsQuery.isLoading || callsQuery.isLoading || chatQuery.isLoading || campaignsQuery.isLoading,
    isError: agentsQuery.isError || callsQuery.isError || chatQuery.isError || campaignsQuery.isError,
  };
}
