import type { CallDataEntryDto } from '../../types/api/calls.js';
import type { RatioDimension } from '../../types/ratio.js';
import { RATIO_CALCULATORS } from './ratioMath.js';
import type { RatioBreakdownRowDto, RatioTrendPointDto } from '../../types/ratio.js';

/**
 * Session R2 — real per-call field extraction for breakdown grouping and
 * trend bucketing. Every value below is read directly from
 * CallDataEntryDto's confirmed real fields — nothing invented, no
 * taxonomy imposed on top of what the backend actually returns (e.g.
 * escalation_trigger's raw string value is used as-is for Drivers, per
 * the R2 prompt's explicit "do not invent an escalation taxonomy" rule).
 */
export function dimensionValue(call: CallDataEntryDto, dimension: RatioDimension): string | null {
  switch (dimension) {
    case 'intent':
      return call.intent || null;
    case 'agent':
      return call.ai_agent_name || call.ai_agent_id || null;
    case 'campaign':
      return call.campaign_name || null;
    case 'outcome':
      return call.outcome || null;
    case 'direction':
      return call.direction || null;
    case 'escalation_reason':
      return call.escalation_trigger || null;
    default:
      return null;
  }
}

export function groupByDimension(calls: CallDataEntryDto[], dimension: RatioDimension): Map<string, CallDataEntryDto[]> {
  const groups = new Map<string, CallDataEntryDto[]>();
  for (const call of calls) {
    const value = dimensionValue(call, dimension);
    if (value === null) continue; // never invent an "Unknown" bucket — omit calls lacking the dimension, don't fabricate a group for them
    const list = groups.get(value) ?? [];
    list.push(call);
    groups.set(value, list);
  }
  return groups;
}

export function computeBreakdownRows(ratioId: string, calls: CallDataEntryDto[], dimension: RatioDimension): RatioBreakdownRowDto[] {
  const calculate = RATIO_CALCULATORS[ratioId];
  if (!calculate) return [];
  const groups = groupByDimension(calls, dimension);
  const rows: RatioBreakdownRowDto[] = [];
  for (const [value, groupCalls] of groups) {
    const agg = calculate(groupCalls);
    rows.push({
      dimension,
      dimensionValue: value,
      label: value,
      value: agg.value,
      numerator: agg.numerator,
      denominator: agg.denominator,
      population: groupCalls.length,
      comparison: null,
    });
  }
  // Largest population first — the operationally interesting rows lead.
  // population is typed number | null (RatioBreakdownRowDto allows an
  // "unknown population" state elsewhere in the system) even though
  // this function always sets it to a real groupCalls.length above —
  // the ?? 0 only guards the type, it never actually fires here.
  return rows.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
}

/** Hourly buckets for short ranges, daily buckets otherwise — a sensible granularity for the selected range, per the R2 prompt. */
export function bucketGranularity(range: string | undefined): 'hour' | 'day' {
  return range === '7d' || range === '30d' ? 'day' : 'hour';
}

function bucketKey(startTime: string, granularity: 'hour' | 'day'): string {
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const iso = d.toISOString();
  return granularity === 'hour' ? iso.slice(0, 13) + ':00' : iso.slice(0, 10);
}

export function computeTrendPoints(ratioId: string, calls: CallDataEntryDto[], granularity: 'hour' | 'day'): RatioTrendPointDto[] {
  const calculate = RATIO_CALCULATORS[ratioId];
  if (!calculate) return [];
  const buckets = new Map<string, CallDataEntryDto[]>();
  for (const call of calls) {
    if (!call.start_time) continue;
    const key = bucketKey(call.start_time, granularity);
    if (key === 'unknown') continue;
    const list = buckets.get(key) ?? [];
    list.push(call);
    buckets.set(key, list);
  }
  const points: RatioTrendPointDto[] = [];
  for (const [bucket, bucketCalls] of buckets) {
    const agg = calculate(bucketCalls);
    points.push({ bucket, value: agg.value, numerator: agg.numerator, denominator: agg.denominator, population: bucketCalls.length });
  }
  return points.sort((a, b) => a.bucket.localeCompare(b.bucket));
}
