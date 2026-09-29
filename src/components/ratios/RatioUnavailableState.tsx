import React from 'react';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RatioRuntimeState } from '@/types/ratio';

/**
 * The one shared "no live value" visual — reused by RatioHero, RatioTrend,
 * BreakdownTable, DriverPanel, InteractionTable.
 *
 * Session R4.3 — previously rendered every non-live state identically
 * (AlertTriangle + generic box), which made "no data in this window"
 * (benign, expected) look exactly like "the backend rejected/lost our
 * request" (a real problem). Now varies tone by `runtimeState`:
 * `no_data`/`not_instrumented` use a neutral Info icon and never look
 * like an application failure; `upstream_rejected`/`upstream_unavailable`
 * use the amber AlertTriangle treatment and, when `onRetry` is supplied,
 * a Retry action for the transient case. `runtimeState` is optional so
 * callers that only have a reason string (no DTO yet) still render sanely.
 */
export const RatioUnavailableState: React.FC<{
  reason: string;
  runtimeState?: RatioRuntimeState;
  httpStatus?: number | null;
  onRetry?: () => void;
  compact?: boolean;
}> = ({ reason, runtimeState, httpStatus, onRetry, compact }) => {
  const isProblem = runtimeState === 'upstream_rejected' || runtimeState === 'upstream_unavailable';
  const Icon = isProblem ? AlertTriangle : Info;

  return (
    <div
      className={`border rounded-md text-center flex flex-col items-center gap-1.5 ${
        isProblem ? 'border-amber-300/60 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/20' : 'border-border bg-card/40'
      } ${compact ? 'p-4 text-xs' : 'p-8 text-sm'}`}
    >
      <Icon
        size={compact ? 14 : 18}
        className={isProblem ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}
        aria-hidden="true"
      />
      <span className={isProblem ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}>
        {reason}
        {runtimeState === 'upstream_rejected' && httpStatus != null && ` (HTTP ${httpStatus})`}
      </span>
      {isProblem && onRetry && (
        <Button size="sm" variant="outline" className="mt-1 h-7 text-xs gap-1.5" onClick={onRetry}>
          <RefreshCw size={12} aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
};
