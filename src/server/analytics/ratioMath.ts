import type { CallDataEntryDto } from '../../types/api/calls.js';
import { isStaleDuration } from '../../lib/format.js';
import type { RatioComparison } from '../../types/ratio.js';

/**
 * Sessions R2/R3 — pure, deterministic ratio calculation over a REAL,
 * already-fetched population of call-data rows. No network, no
 * randomness, no rounding of a percentage back into a fake integer
 * count. Every function here is directly unit-testable (see
 * .tooling/scripts/ratio-math-verify.mjs) precisely so the maths can be
 * verified without the live backend.
 *
 * Eligibility rules (documented here, the ONE place they're defined —
 * src/server/analytics/ratioRegistry.ts's eligibilityNote strings must
 * match these exactly, and src/server/analytics/ratioService.ts's
 * interaction-drill eligibility reuses `eligiblePopulation()` below
 * rather than re-deriving its own filter, per R3's explicit "the
 * interaction list must use the exact same eligibility logic as its
 * summary calculation" requirement):
 *
 * FCR: denominator = every fetched call (fcr is a required, always-present
 *      boolean field per CallDataEntryDto — there is no "not evaluated"
 *      state on this field today). numerator = calls where fcr === true.
 * Escalation Rate / Resolution Rate: denominator = "handled" calls,
 *      defined as calls with a determinate outcome
 *      (outcome === 'resolved' || 'escalated' — a call with neither is
 *      not yet a settled interaction and is excluded, not silently
 *      classified either way). Escalation numerator = outcome ===
 *      'escalated'; Resolution numerator = outcome === 'resolved'. Both
 *      ratios share the exact same "handled" population by construction
 *      (handledCalls()) — this is the SAME eligibility rule established
 *      for Escalation Rate in R2, reused for Resolution Rate in R3, not
 *      a second independent definition.
 * AHT: denominator = calls with a finite, non-stale duration_seconds
 *      (reuses the EXACT isStaleDuration() 4-hour guard already
 *      established and fixed for Agent Detail in Session 11.7 — the same
 *      dirty-demo-data class of row is excluded the same way everywhere
 *      in this product). numerator = sum of those durations.
 * Successful Resolution Time: denominator = resolved calls (outcome ===
 *      'resolved') with a finite, non-stale duration — i.e. the
 *      intersection of Resolution Rate's numerator population and AHT's
 *      duration-validity rule, reusing BOTH existing rules rather than
 *      inventing a third. numerator = sum of those durations.
 *
 * Completion Rate is deliberately NOT implemented in R3 — see
 * docs/SESSION_R3_RATIO_FACT_DERIVED_AND_AGGREGATION_CONTRACT.md. No
 * repository evidence (live-verified or otherwise) confirms the real
 * value set of CallDataEntryDto.stage (every existing reference to a
 * 'connecting'|'in-progress'|'complete'|'escalated' stage enum traces
 * back to Lovable-era MOCK data files, never a live-verified real
 * response), so a connected-vs-completed split cannot be defensibly
 * built from it.
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

/** The shared "handled" population — a call with a determinate outcome. Established for Escalation Rate in R2; reused, not redefined, for Resolution Rate in R3. */
function handledCalls(calls: CallDataEntryDto[]): CallDataEntryDto[] {
  return calls.filter((c) => c.outcome === 'resolved' || c.outcome === 'escalated');
}

/** The shared "valid, non-stale duration" filter — established for AHT in R2; reused, not redefined, for Successful Resolution Time in R3. */
function withValidDuration(calls: CallDataEntryDto[]): CallDataEntryDto[] {
  return calls.filter((c) => typeof c.duration_seconds === 'number' && Number.isFinite(c.duration_seconds) && !isStaleDuration(c.duration_seconds));
}

export function computeFcr(calls: CallDataEntryDto[]): RatioAggregate {
  const denominator = calls.length;
  const numerator = calls.filter((c) => c.fcr === true).length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}

export function computeEscalationRate(calls: CallDataEntryDto[]): RatioAggregate {
  const handled = handledCalls(calls);
  const denominator = handled.length;
  const numerator = handled.filter((c) => c.outcome === 'escalated').length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}

/** R3 — denominator/numerator both drawn from the SAME "handled" population Escalation Rate already uses. */
export function computeResolutionRate(calls: CallDataEntryDto[]): RatioAggregate {
  const handled = handledCalls(calls);
  const denominator = handled.length;
  const numerator = handled.filter((c) => c.outcome === 'resolved').length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}

export function computeAht(calls: CallDataEntryDto[]): RatioAggregate {
  const durations = withValidDuration(calls).map((c) => c.duration_seconds);
  const denominator = durations.length;
  const numerator = durations.reduce((sum, d) => sum + d, 0);
  const value = denominator === 0 ? null : Math.round(numerator / denominator);
  return { value, numerator: Math.round(numerator), denominator };
}

/** R3 — intersection of Resolution Rate's numerator population (outcome === 'resolved') and AHT's duration-validity rule. Non-resolved interactions never enter numerator or denominator. */
export function computeSuccessfulResolutionTime(calls: CallDataEntryDto[]): RatioAggregate {
  const resolved = calls.filter((c) => c.outcome === 'resolved');
  const durations = withValidDuration(resolved).map((c) => c.duration_seconds);
  const denominator = durations.length;
  const numerator = durations.reduce((sum, d) => sum + d, 0);
  const value = denominator === 0 ? null : Math.round(numerator / denominator);
  return { value, numerator: Math.round(numerator), denominator };
}

export const RATIO_CALCULATORS: Record<string, (calls: CallDataEntryDto[]) => RatioAggregate> = {
  fcr: computeFcr,
  escalation_rate: computeEscalationRate,
  resolution_rate: computeResolutionRate,
  aht: computeAht,
  successful_resolution_time: computeSuccessfulResolutionTime,
};

/**
 * The exact population a ratio's interaction drill-down must show —
 * kept in lockstep with each calculator's own denominator population
 * (not `calls.filter(...)` re-derived ad hoc per call site), per R3 §8's
 * "the interaction list must use the exact same eligibility logic as
 * its summary calculation."
 */
export const RATIO_ELIGIBLE_POPULATION: Record<string, (calls: CallDataEntryDto[]) => CallDataEntryDto[]> = {
  fcr: (calls) => calls,
  escalation_rate: handledCalls,
  resolution_rate: handledCalls,
  aht: withValidDuration,
  successful_resolution_time: (calls) => withValidDuration(calls.filter((c) => c.outcome === 'resolved')),
};

/** Real equal-length previous-period comparison — pp for percent ratios, plain delta (seconds) for time ratios. Never computed when either side is null (no data). */
export function computeComparison(current: number | null, previous: number | null, isPercent: boolean): RatioComparison | null {
  if (current === null || previous === null) return null;
  return {
    previousValue: previous,
    delta: Math.round((current - previous) * 10) / 10,
    isPercentagePoints: isPercent,
  };
}
