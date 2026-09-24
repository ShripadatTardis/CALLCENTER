
import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isApiError } from '@/services/transport/errors';

interface QueryErrorBannerProps {
  error: unknown;
  onRetry: () => void;
  /** True when we still have previously-fetched data to show below this banner. */
  hasStaleData?: boolean;
  isFetching?: boolean;
}

/**
 * Session 3.5: a real upstream outage (the demo backend intermittently
 * returns 502) must never be presented as "0 calls" / "0 agents" — that
 * silently implies a real, empty operational state. This banner is the
 * shared way every live screen surfaces "the backend is unreachable
 * right now" distinctly from "there is genuinely no data", with a
 * retry action, while the screen below keeps rendering whatever data
 * is still cached from the last successful fetch (TanStack Query keeps
 * `data` populated across a failed refetch by default — this banner
 * only decides what to show ABOVE that data, never clears it).
 */
export const QueryErrorBanner: React.FC<QueryErrorBannerProps> = ({
  error,
  onRetry,
  hasStaleData,
  isFetching,
}) => {
  const message = isApiError(error)
    ? error.status === 502 || error.status === 503 || error.status === 0
      ? 'The backend service is temporarily unavailable.'
      : error.message
    : 'Something went wrong loading live data.';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {message}
          {hasStaleData && ' Showing the last data we had.'}
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={isFetching} className="shrink-0">
        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
        Retry
      </Button>
    </div>
  );
};
