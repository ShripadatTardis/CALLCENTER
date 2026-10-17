import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCmaSyncStatus, startCmaSync, type CmaSyncStatus } from '@/services/cma/cmaSyncService';

export const cmaSyncKeys = {
  status: ['cmaSync', 'status'] as const,
};

/** Polls every 3s while the latest run is `running`, matching the existing short-lived-status-poll convention (useInteractionTranscript.ts) — a UI refresh, not a new backend scheduler. */
const POLL_INTERVAL_MS = 3000;

export function useCmaSyncStatus() {
  return useQuery({
    queryKey: cmaSyncKeys.status,
    queryFn: fetchCmaSyncStatus,
    refetchInterval: (query) => {
      const data = query.state.data as CmaSyncStatus | undefined;
      return data?.latest?.status === 'running' ? POLL_INTERVAL_MS : false;
    },
  });
}

export function useStartCmaSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lookbackHours?: number) => startCmaSync(lookbackHours),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cmaSyncKeys.status });
    },
  });
}
