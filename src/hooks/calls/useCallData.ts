import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { callsKeys } from '@/services/calls/callsKeys';
import { fetchCallData, type CallDataResult } from '@/services/calls/callsService';
import type { CallDataQueryDto } from '@/types/api/calls';

interface UseCallDataOptions {
  refetchInterval?: UseQueryOptions<CallDataResult>['refetchInterval'];
}

/**
 * Live call-data list — the single source for Call Logs, Live View
 * (via useLiveCallData, Session 3), Dashboard (Session 3), and Initiate
 * Call's "Recent Calls" panel (a small, unfiltered call of this same
 * hook — see useInitiateCall.ts). Replaces every industry-generated
 * mock call log.
 */
export function useCallData(query: CallDataQueryDto = {}, options: UseCallDataOptions = {}) {
  return useQuery({
    queryKey: callsKeys.list(query),
    queryFn: () => fetchCallData(query),
    refetchInterval: options.refetchInterval,
  });
}
