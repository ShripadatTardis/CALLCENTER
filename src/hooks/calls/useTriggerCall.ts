import { useMutation, useQueryClient } from '@tanstack/react-query';
import { callsKeys } from '@/services/calls/callsKeys';
import { triggerCall } from '@/services/calls/callsService';

/**
 * Places a live outbound call via POST /api/calls/trigger. On success,
 * invalidates the calls list broadly (not a specific filter set) so the
 * newly-triggered call surfaces in Call Logs / Recent Calls on their
 * next fetch, per the Session 2 plan (no separate localStorage/history
 * store — the live list is the system of record).
 */
export function useTriggerCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerCall,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: callsKeys.lists() });
    },
  });
}
