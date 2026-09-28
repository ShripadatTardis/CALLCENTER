import React from 'react';
import { RatioAvailabilityBadge } from './RatioAvailabilityBadge';
import { RatioUnavailableState } from './RatioUnavailableState';
import type { FrontendRatioDefinition } from '@/types/ratio';
import type { RatioSummaryDto } from '@/types/ratio';

function formatValue(value: number | null, unit: RatioSummaryDto['unit']): string {
  if (value === null) return '—';
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'seconds') {
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}m ${s}s`;
  }
  if (unit === 'currency') return `$${value.toFixed(2)}`;
  return String(value);
}

/**
 * Spec §4.2/§13 — ratio name, current value, comparison delta (pp for
 * percent ratios, never misleading relative %), definition, formula,
 * numerator, denominator, population N, freshness, availability.
 */
export const RatioHero: React.FC<{
  definition: FrontendRatioDefinition;
  summary: RatioSummaryDto | undefined;
  isLoading: boolean;
  isError: boolean;
}> = ({ definition, summary: rawSummary, isLoading, isError }) => {
  // Defensive: treat a malformed (non-object) response the same as "no
  // data" rather than letting a later field access crash — see
  // RatioAvailabilityBadge's identical guard for why this matters under
  // an environment where /api/* doesn't actually exist yet.
  const summary = rawSummary && typeof rawSummary === 'object' ? rawSummary : undefined;
  return (
    <div className="border border-border rounded-md bg-card/40 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-foreground">{definition.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{definition.description}</p>
        </div>
        {summary && <RatioAvailabilityBadge availability={summary.availability} />}
      </div>

      {isLoading && <div className="text-sm text-muted-foreground py-2">Loading…</div>}
      {isError && !isLoading && <RatioUnavailableState reason="Could not load this ratio right now." compact />}

      {!isLoading && !isError && summary && summary.value !== null && (
        <div className="flex items-end gap-4 flex-wrap">
          <div className="text-3xl font-semibold tabular-nums text-foreground">{formatValue(summary.value, summary.unit)}</div>
          {summary.comparison?.delta != null && (
            <div className={`text-sm tabular-nums pb-1 ${summary.comparison.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {summary.comparison.delta >= 0 ? '+' : ''}
              {summary.comparison.delta.toFixed(1)}
              {summary.comparison.isPercentagePoints ? ' pp' : ''} vs previous
            </div>
          )}
        </div>
      )}

      {!isLoading && !isError && summary && summary.value === null && (
        <RatioUnavailableState reason={summary.unavailableReason ?? 'Not yet instrumented.'} />
      )}

      {/* Spec §5 "Explainability" — formula/definition stay visible regardless of availability; numerator/denominator/N/freshness only appear once a real value exists. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
        <span>Formula: {definition.formulaText}</span>
        {summary && summary.value !== null && summary.numerator != null && <span>Numerator: {summary.numerator.toLocaleString()}</span>}
        {summary && summary.value !== null && summary.denominator != null && <span>Denominator: {summary.denominator.toLocaleString()}</span>}
        {summary && summary.value !== null && summary.population != null && <span>N = {summary.population.toLocaleString()}</span>}
        {summary && summary.value !== null && summary.dataFreshness && <span>As of {new Date(summary.dataFreshness).toLocaleString()}</span>}
      </div>

      <p className="text-[11px] text-muted-foreground pt-1">{definition.helpText}</p>
    </div>
  );
};
