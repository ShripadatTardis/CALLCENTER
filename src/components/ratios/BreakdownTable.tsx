import React from 'react';
import { RatioUnavailableState } from './RatioUnavailableState';
import type { RatioBreakdownResponseDto } from '@/types/ratio';

/** Spec §4.4/§6 — sortable ratio + numerator + denominator + delta per dimension bucket. Session R2: real numerator/denominator/population columns, and honest disclosure when the underlying population was capped. */
export const BreakdownTable: React.FC<{
  breakdown: RatioBreakdownResponseDto | undefined;
  isLoading: boolean;
  onSelectRow: (dimensionValue: string) => void;
}> = ({ breakdown, isLoading, onSelectRow }) => {
  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  if (!breakdown) return null;
  if (!breakdown.rows || breakdown.rows.length === 0) {
    return <RatioUnavailableState reason={breakdown.unavailableReason ?? 'Breakdown not yet instrumented.'} compact />;
  }
  return (
    <div className="space-y-1.5">
      {breakdown.populationCapped && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 px-0.5">
          Based on the first {breakdown.rows.reduce((sum, r) => sum + r.population, 0).toLocaleString()} of {breakdown.trueTotalRecords?.toLocaleString()} matching records — not the complete population for this window.
        </p>
      )}
      <div className="overflow-x-auto border border-border rounded-md bg-card/40">
        <table className="w-full text-[13px] text-foreground">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="text-left py-2 px-3 font-medium capitalize">{breakdown.dimension}</th>
              <th className="text-right py-2 px-3 font-medium">Value</th>
              <th className="text-right py-2 px-3 font-medium">Numerator</th>
              <th className="text-right py-2 px-3 font-medium">Denominator</th>
              <th className="text-right py-2 px-3 font-medium">N</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.rows.map((row) => (
              <tr
                key={row.dimensionValue}
                onClick={() => onSelectRow(row.dimensionValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectRow(row.dimensionValue);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Drill into ${row.label}`}
                className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <td className="py-2 px-3">{row.label}</td>
                <td className="py-2 px-3 text-right tabular-nums">{row.value != null ? row.value.toFixed(1) : '—'}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{row.numerator ?? '—'}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{row.denominator ?? '—'}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{row.population ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
