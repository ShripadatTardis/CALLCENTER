import { useQuery } from '@tanstack/react-query';
import { interactionTraceKeys } from '@/services/interactionTrace/interactionTraceKeys';
import { fetchInteractionTrace } from '@/services/interactionTrace/interactionTraceService';
import type { InteractionTraceChannel } from '@/types/api/interactionTrace';

/**
 * Fetches GET /api/calls/data?resource=trace (channel 'call') or
 * GET /api/chat/logs?resource=trace (channel 'chat'). Session 16.4.3.
 *
 * Deliberately lazy (`enabled` defaults to false) — the panel this feeds
 * is a collapsed-by-default, progressive-disclosure section (brief §6),
 * so the trace is only fetched once a viewer actually expands it, not on
 * every Interaction Detail open. No `refetchInterval`/polling: the brief
 * explicitly calls for avoiding aggressive polling on an in-progress
 * trace; a manual refresh (`refetch()`) is exposed instead, the same
 * on-demand-refresh shape useInteractionTranscript already uses for its
 * non-poll mode. Uses the shared QueryClient's default staleTime/retry
 * policy (src/lib/queryClient.ts) — no 4xx retries (so a 404/409/422
 * never retry-storms), a couple of retries on a 502.
 */
export function useInteractionTrace(
  interactionId: string | undefined,
  channel: InteractionTraceChannel,
  { enabled = false }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: interactionTraceKeys.detail(interactionId ?? '', channel),
    queryFn: () => fetchInteractionTrace(interactionId as string, channel),
    enabled: enabled && Boolean(interactionId),
  });
}
