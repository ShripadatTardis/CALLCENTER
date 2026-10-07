import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { callsKeys } from '@/services/calls/callsKeys';
import { fetchCallMetrics } from '@/services/calls/callsService';
import type { CallMetricsQueryDto } from '@/types/api/callMetrics';
import type { CallTechnicalPerformance } from '@/lib/callMetricsFormat';
import type { Interaction } from '@/types/interaction';

/**
 * Session 15.4 — the one Call Metrics row for a single, already-loaded
 * voice interaction. Bounded, not a population fetch (brief §3): dated
 * to the call's own start day and searched by its own call_sid, never
 * the full table. Voice-only (Call Metrics has no chat concept) —
 * disabled entirely for a chat interaction or one with no interactionId.
 * `search` narrows the upstream result but is a substring match across
 * every field (documented), so the exact call_sid === row.callSid check
 * still happens client-side before this is treated as a match — never
 * trust search's own boundary for an exact-identity join.
 */
export function useCallMetricsForInteraction(interaction: Interaction | null | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const isVoice = interaction?.channel === 'voice';
  const callDate = interaction?.startTime ? interaction.startTime.slice(0, 10) : undefined;

  const query: CallMetricsQueryDto = {
    date_from: callDate,
    date_to: callDate,
    search: interaction?.interactionId,
    page_size: 5,
  };

  const result = useQuery({
    queryKey: [...callsKeys.metricsList(query), role],
    queryFn: () => fetchCallMetrics(query, role),
    enabled: Boolean(isVoice && interaction?.interactionId && callDate),
  });

  const row: CallTechnicalPerformance | undefined = result.data?.rows.find((r) => r.callSid === interaction?.interactionId);

  return { data: row ?? null, isLoading: result.isLoading, isError: result.isError };
}

/**
 * Session 15.4 — a bounded batch of recent Call Metrics rows for
 * client-side correlation (Agent Detail's per-agent technical-
 * performance aggregation, Analytics' scoped-view tile). page_size
 * matches the existing 100-row bound AgentDetail already applies to its
 * own call population (useAgentDetail.ts) — not a new, larger fetch.
 */
export function useCallMetricsBulk(query: CallMetricsQueryDto, enabled = true) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  return useQuery({
    queryKey: [...callsKeys.metricsList(query), role],
    queryFn: () => fetchCallMetrics(query, role),
    enabled,
  });
}
