import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { RatioUnavailableState } from './RatioUnavailableState';
import type { RatioTrendResponseDto } from '@/types/ratio';

/**
 * Spec §4.3 — default visualization is a time trend; never shown without
 * population. Session R2: real bucketed points from
 * src/server/analytics/ratioDimensions.ts's computeTrendPoints, rendered
 * with the ALREADY-installed `recharts` (no new charting library, per
 * the R2 "do not introduce another chart framework" boundary). The
 * tooltip surfaces numerator/denominator/population per point, matching
 * spec's "never show a ratio trend without its population."
 */
export const RatioTrend: React.FC<{ trend: RatioTrendResponseDto | undefined; isLoading: boolean }> = ({ trend, isLoading }) => {
  if (isLoading) {
    return (
      <section>
        <h2 className="text-[13px] font-semibold text-foreground mb-1.5 px-0.5">Trend</h2>
        <div className="text-sm text-muted-foreground p-4">Loading…</div>
      </section>
    );
  }

  const points = trend?.points ?? [];

  return (
    <section>
      <h2 className="text-[13px] font-semibold text-foreground mb-1.5 px-0.5">Trend</h2>
      {trend?.populationCapped && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-1.5 px-0.5">
          Based on a capped subset of {trend.trueTotalRecords?.toLocaleString()} matching records — the trend below is not computed from the complete population for this window.
        </p>
      )}
      {points.length > 0 ? (
        <div className="border border-border rounded-md bg-card/40 p-3">
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={points} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof points)[number];
                    return (
                      <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-md">
                        <div className="font-medium">{label}</div>
                        <div>Value: {p.value != null ? p.value.toFixed(1) : '—'}</div>
                        <div>Numerator: {p.numerator ?? '—'}</div>
                        <div>Denominator: {p.denominator ?? '—'}</div>
                        <div>N = {p.population ?? '—'}</div>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="currentColor" className="text-primary" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Spec §21 "charts must have textual equivalents" — a native, keyboard-operable <details> disclosure, not just a hover-only tooltip. */}
          <details className="mt-2 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none">View as table ({points.length} point{points.length === 1 ? '' : 's'})</summary>
            <table className="w-full mt-1.5">
              <thead>
                <tr className="text-left border-b border-border/60">
                  <th className="py-1 pr-3 font-medium">Bucket</th>
                  <th className="py-1 pr-3 font-medium text-right">Value</th>
                  <th className="py-1 pr-3 font-medium text-right">Numerator</th>
                  <th className="py-1 pr-3 font-medium text-right">Denominator</th>
                  <th className="py-1 font-medium text-right">N</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.bucket} className="border-b border-border/40 last:border-b-0">
                    <td className="py-1 pr-3">{p.bucket}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{p.value != null ? p.value.toFixed(1) : '—'}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{p.numerator ?? '—'}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{p.denominator ?? '—'}</td>
                    <td className="py-1 text-right tabular-nums">{p.population ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ) : (
        <RatioUnavailableState reason={trend?.unavailableReason ?? 'Trend not yet instrumented.'} />
      )}
    </section>
  );
};
