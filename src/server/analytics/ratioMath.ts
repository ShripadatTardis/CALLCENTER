import type { CallDataEntryDto } from '../../types/api/calls.js';
import { isStaleDuration } from '../../lib/format.js';
import type { RatioComparison } from '../../types/ratio.js';

/**
 * Session R2 — pure, deterministic ratio calculation over a REAL, already-
 * fetched population of call-data rows. No network, no randomness, no
 * rounding of a percentage back into a fake integer count. Every function
 * here is directly unit-testable (see
 * .tooling/scripts/ratio-math-verify.mjs) precisely so the maths can be
 * verified without the live backend.
 *
 * Eligibility rules (documented here, the ONE place they're defined —
 * src/server/analytics/ratioRegistry.ts's eligibilityNote strings must
 * match these exactly):
 *
 * FCR: denominator = every fetched call (fcr is a required, always-present
 *      boolean field per CallDataEntryDto — there is no "not evaluated"
 *      state on this field today). numerator = calls where fcr === true.
 * Escalation Rate: denominator = "handled" calls, defined as calls with a
 *      determinate outcome (outcome === 'resolved' || 'escalated' — a call
 *      with neither is not yet a settled interaction and is excluded, not
 *      counted as a non-escalation). numerator = outcome === 'escalated'.
 * AHT: denominator = calls with a finite, non-stale duration_seconds
 *      (reuses the EXACT isStaleDuration() 4-hour guard already
 *      established and fixed for Agent Detail in Session 11.7 — the same
 *      dirty-demo-data class of row is excluded the same way everywhere
 *      in this product). numerator = sum of those durations.
 */

export interface RatioAggregate {
  value: number | null;
  numerator: number;
  denominator: number;
}

/** 0 numerator + valid (>0) denominator is a legitimate 0%, never null. 0 denominator is genuinely "no data" — null, not 0%. */
function rateOrNull(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal place
}

export function computeFcr(calls: CallDataEntryDto[]): RatioAggregate {
  const denominator = calls.length;
  const numerator = calls.filter((c) => c.fcr === true).length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}

export function computeEscalationRate(calls: CallDataEntryDto[]): RatioAggregate {
  const handled = calls.filter((c) => c.outcome === 'resolved' || c.outcome === 'escalated');
  const denominator = handled.length;
  const numerator = handled.filter((c) => c.outcome === 'escalated').length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}

export function computeAht(calls: CallDataEntryDto[]): RatioAggregate {
  const durations = calls
    .map((c) => c.duration_seconds)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && !isStaleDuration(d));
  const denominator = durations.length;
  const numerator = durations.reduce((sum, d) => sum + d, 0);
  const value = denominator === 0 ? null : Math.round(numerator / denominator);
  return { value, numerator: Math.round(numerator), denominator };
}

export const RATIO_CALCULATORS: Record<string, (calls: CallDataEntryDto[]) => RatioAggregate> = {
  fcr: computeFcr,
  escalation_rate: computeEscalationRate,
  aht: computeAht,
};

/** Real equal-length previous-period comparison — pp for percent ratios, plain delta (seconds) for AHT. Never computed when either side is null (no data). */
export function computeComparison(current: number | null, previous: number | null, isPercent: boolean): RatioComparison | null {
  if (current === null || previous === null) return null;
  return {
    previousValue: previous,
    delta: Math.round((current - previous) * 10) / 10,
    isPercentagePoints: isPercent,
  };
}
