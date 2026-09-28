import React from 'react';
import { RatioUnavailableState } from './RatioUnavailableState';
import type { RatioTrendResponseDto } from '@/types/ratio';

/** Spec §4.3 — default visualization is a time trend; never shown without population. R1: architecture + honest unavailable state (see src/server/analytics/ratioService.ts's R1 scope note). */
export const RatioTrend: React.FC<{ trend: RatioTrendResponseDto | undefined; isLoading: boolean }> = ({ trend, isLoading }) => (
  <section>
    <h2 className="text-[13px] font-semibold text-foreground mb-1.5 px-0.5">Trend</h2>
    {isLoading ? (
      <div className="text-sm text-muted-foreground p-4">Loading…</div>
    ) : trend?.points && trend.points.length > 0 ? (
      <div className="border border-border rounded-md bg-card/40 p-3 text-xs text-muted-foreground">
        {trend.points.length} data point(s) — chart rendering is a future increment once trend data exists.
      </div>
    ) : (
      <RatioUnavailableState reason={trend?.unavailableReason ?? 'Trend not yet instrumented.'} />
    )}
  </section>
);
