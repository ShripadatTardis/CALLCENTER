import { useQuery } from '@tanstack/react-query';
import { callsKeys } from '@/services/calls/callsKeys';
import { fetchCallData } from '@/services/calls/callsService';
import type { CallDataQueryDto } from '@/types/api/calls';

/**
 * Live call-data list — the single source for Call Logs, Live View
 * (Session 3), Dashboard (Session 3), and Initiate Call's "Recent
 * Calls" panel (a small, unfiltered call of this same hook — see
 * useInitiateCall.ts). Replaces every industry-generated mock call log.
 */
export function useCallData(query: CallDataQueryDto = {}) {
  return useQuery({
    queryKey: callsKeys.list(query),
    queryFn: () => fetchCallData(query),
  });
}
