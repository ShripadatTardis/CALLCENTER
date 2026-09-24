import { useCallData } from './useCallData';

const LIVE_POLL_INTERVAL_MS = 4000;

/**
 * Polls call-data?status=active while mounted. TanStack Query's
 * refetchInterval automatically stops when the component using this
 * hook unmounts (e.g. navigating away from Live View) — no manual
 * cleanup needed beyond the hook's own lifecycle.
 */
export function useLiveCallData() {
  return useCallData({ status: 'active' }, { refetchInterval: LIVE_POLL_INTERVAL_MS });
}
