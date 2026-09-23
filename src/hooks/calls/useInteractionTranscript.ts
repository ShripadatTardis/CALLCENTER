import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { callsKeys } from '@/services/calls/callsKeys';
import { fetchSessionTranscript } from '@/services/calls/callsService';

const POLL_INTERVAL_MS = 3000;
/**
 * UI safety cap only (Session 2 guardrail). If the interaction is still
 * active once this elapses, aggressive polling stops gracefully — this
 * does NOT mark the interaction as failed or completed, and does not
 * disable manual refresh (`refetch()` below is unaffected).
 */
const MAX_POLL_MS = 60_000;

interface UseInteractionTranscriptOptions {
  enabled?: boolean;
  /** Poll every 3s until the fetched status is 'completed' or the 60s safety cap is reached. */
  poll?: boolean;
}

/**
 * Fetches GET /api/calls/session/{id}. Used both for the on-demand
 * Interaction Detail refresh (poll: false) and the short post-trigger
 * status poll on Initiate Call (poll: true) — see Session 2 plan §5/§6.
 */
export function useInteractionTranscript(
  interactionId: string | undefined,
  { enabled = true, poll = false }: UseInteractionTranscriptOptions = {},
) {
  const pollStartedAt = useRef<number | null>(null);

  // Reset the poll window whenever we start polling a (new) interaction,
  // so the 60s cap is measured from this poll's start, not a stale one.
  useEffect(() => {
    if (poll) {
      pollStartedAt.current = Date.now();
    } else {
      pollStartedAt.current = null;
    }
  }, [interactionId, poll]);

  const query = useQuery({
    queryKey: callsKeys.session(interactionId ?? ''),
    queryFn: () => fetchSessionTranscript(interactionId as string),
    enabled: enabled && Boolean(interactionId),
    refetchInterval: poll
      ? (q) => {
          const status = q.state.data?.status;
          if (status === 'completed') return false;
          const startedAt = pollStartedAt.current ?? Date.now();
          if (Date.now() - startedAt >= MAX_POLL_MS) return false;
          return POLL_INTERVAL_MS;
        }
      : false,
  });

  const elapsed = pollStartedAt.current ? Date.now() - pollStartedAt.current : 0;
  const isPollingCapped = poll && elapsed >= MAX_POLL_MS && query.data?.status !== 'completed';

  return { ...query, isPollingCapped };
}
