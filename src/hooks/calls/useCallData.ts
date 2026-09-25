import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
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
 *
 * Session 6.2: sends the current session's role so the server can apply
 * category authorization (see api/calls/data.ts) — included in the
 * query key so switching role never serves another role's cached page.
 */
export function useCallData(query: CallDataQueryDto = {}, options: UseCallDataOptions = {}) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  return useQuery({
    queryKey: [...callsKeys.list(query), role],
    queryFn: () => fetchCallData(query, role),
    refetchInterval: options.refetchInterval,
  });
}
