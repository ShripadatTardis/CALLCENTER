import { getBackendRatioDefinition } from './ratioRegistry.js';
import { fetchCompleteCallPopulation, rangeToDateWindow, previousDateWindow } from './callPopulationFetcher.js';
import { RATIO_CALCULATORS, computeComparison } from './ratioMath.js';
import { computeBreakdownRows, computeTrendPoints, bucketGranularity, groupByDimension } from './ratioDimensions.js';
import type {
  RatioBreakdownResponseDto,
  RatioDriverResponseDto,
  RatioFilterState,
  RatioInteractionRefDto,
  RatioInteractionsResponseDto,
  RatioSummaryDto,
  RatioTrendResponseDto,
  RatioUnit,
} from '../../types/ratio.js';
import type { CallDataEntryDto } from '../../types/api/calls.js';

/**
 * Ratio / Analytics Service — the ONLY place that turns a raw backend
 * fact into a ratio's summary/trend/breakdown/driver/interactions
 * response. api/analytics/metrics.ts's `resource=ratios` branch is a
 * thin transport wrapper around these functions; no business logic
 * lives there.
 *
 * Session R2 scope: FCR, Escalation Rate, and AHT are now genuinely
 * implemented end-to-end (summary/trend/breakdown/interactions, plus
 * drivers for escalation_rate only) over the COMPLETE qualifying call
 * population, fetched server-side via
 * src/server/analytics/callPopulationFetcher.ts — never a single page,
 * never browser-side aggregation. Every other ratio (whatever its
 * registry classification) still returns the same honest R1 "not yet
 * instrumented" shape for every view — this session does not touch
 * them, per the prompt's explicit "do not implement the remaining
 * ratios" boundary.
 */

const R2_IMPLEMENTED_RATIOS = new Set(['fcr', 'escalation_rate', 'aht']);
const UNIT_FOR: Record<string, RatioUnit> = { fcr: 'percent', escalation_rate: 'percent', aht: 'seconds' };

function emptySummary(ratioId: string, filters: RatioFilterState, unavailableReason: string): RatioSummaryDto {
  return {
    ratioId,
    availability: getBackendRatioDefinition(ratioId)?.availability ?? 'backend_gap',
    value: null,
    unit: UNIT_FOR[ratioId] ?? 'percent',
    numerator: null,
    denominator: null,
    population: null,
    comparison: null,
    dataFreshness: null,
    unavailableReason,
    filtersEcho: filters,
    populationCapped: false,
    trueTotalRecords: null,
  };
}

/**
 * Applies the breakdown/breakdownValue filter (a dimension not natively
 * supported by the call-data query API — intent/agent/campaign) on an
 * already-fetched population, server-side. direction/outcome ARE native
 * query params and are applied by callPopulationFetcher itself before
 * this ever runs, so filtering here is only for the remaining
 * dimensions — never a second copy of server-side filtering for the
 * same field.
 */
function applyDrillFilter(calls: CallDataEntryDto[], filters: RatioFilterState): CallDataEntryDto[] {
  if (!filters.breakdown || !filters.breakdownValue) return calls;
  if (filters.breakdown === 'direction' || filters.breakdown === 'outcome') return calls; // already applied server-side by the population fetch
  const value = filters.breakdownValue;
  return calls.filter((c) => {
    switch (filters.breakdown) {
      case 'intent':
        return c.intent === value;
      case 'agent':
        return (c.ai_agent_name || c.ai_agent_id) === value;
      case 'campaign':
        return c.campaign_name === value;
      case 'escalation_reason':
        return c.escalation_trigger === value;
      default:
        return true;
    }
  });
}

async function fetchPopulationForFilters(filters: RatioFilterState) {
  const { dateFrom, dateTo } = rangeToDateWindow(filters.range);
  const result = await fetchCompleteCallPopulation({
    dateFrom,
    dateTo,
    direction: filters.direction,
    outcome: filters.breakdown === 'outcome' && filters.breakdownValue ? (filters.breakdownValue as never) : undefined,
  });
  return { ...result, calls: applyDrillFilter(result.calls, filters), dateFrom, dateTo };
}

export async function getRatioSummary(ratioId: string, filters: RatioFilterState): Promise<RatioSummaryDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def) return emptySummary(ratioId, filters, 'Unknown ratio ID.');
  if (!R2_IMPLEMENTED_RATIOS.has(ratioId)) {
    return emptySummary(ratioId, filters, def.unavailableReason ?? 'Not yet instrumented in this release.');
  }

  let population: Awaited<ReturnType<typeof fetchPopulationForFilters>>;
  try {
    population = await fetchPopulationForFilters(filters);
  } catch {
    return emptySummary(ratioId, filters, 'Live call data temporarily unavailable — Call Centre did not respond.');
  }

  const calculate = RATIO_CALCULATORS[ratioId];
  const agg = calculate(population.calls);

  let comparison = null;
  const prevWindow = previousDateWindow(population.dateFrom, population.dateTo);
  try {
    const prevResult = await fetchCompleteCallPopulation({
      dateFrom: prevWindow.dateFrom,
      dateTo: prevWindow.dateTo,
      direction: filters.direction,
    });
    const prevAgg = calculate(applyDrillFilter(prevResult.calls, filters));
    comparison = computeComparison(agg.value, prevAgg.value, UNIT_FOR[ratioId] === 'percent');
  } catch {
    comparison = null; // a real previous-period fetch failure -> no comparison, never a fabricated one
  }

  return {
    ratioId,
    availability: 'direct',
    value: agg.value,
    unit: UNIT_FOR[ratioId],
    numerator: agg.numerator,
    denominator: agg.denominator,
    population: population.calls.length,
    comparison,
    dataFreshness: new Date().toISOString(),
    unavailableReason: agg.denominator === 0 ? 'No qualifying interactions in this window.' : null,
    filtersEcho: filters,
    populationCapped: population.capped,
    trueTotalRecords: population.trueTotalRecords,
  };
}

export async function getRatioTrend(ratioId: string, filters: RatioFilterState): Promise<RatioTrendResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def || !R2_IMPLEMENTED_RATIOS.has(ratioId)) {
    return {
      ratioId,
      availability: def?.availability ?? 'backend_gap',
      unavailableReason: def?.unavailableReason ?? 'Trend not yet instrumented for this ratio.',
      points: [],
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  let population: Awaited<ReturnType<typeof fetchPopulationForFilters>>;
  try {
    population = await fetchPopulationForFilters(filters);
  } catch {
    return {
      ratioId,
      availability: 'direct',
      unavailableReason: 'Live call data temporarily unavailable — Call Centre did not respond.',
      points: [],
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  const points = computeTrendPoints(ratioId, population.calls, bucketGranularity(filters.range));
  return {
    ratioId,
    availability: 'direct',
    unavailableReason: points.length === 0 ? 'No qualifying interactions in this window.' : null,
    points,
    populationCapped: population.capped,
    trueTotalRecords: population.trueTotalRecords,
  };
}

export async function getRatioBreakdown(ratioId: string, dimension: string, filters: RatioFilterState): Promise<RatioBreakdownResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  const dimensionSupported = def?.supportedDimensions.includes(dimension as never) ?? false;
  const dim = dimension as RatioBreakdownResponseDto['dimension'];

  if (!def || !dimensionSupported) {
    return {
      ratioId,
      dimension: dim,
      availability: def?.availability ?? 'backend_gap',
      unavailableReason: `"${dimension}" is not a supported breakdown dimension for this ratio.`,
      rows: [],
      populationCapped: false,
      trueTotalRecords: null,
    };
  }
  if (!R2_IMPLEMENTED_RATIOS.has(ratioId)) {
    return {
      ratioId,
      dimension: dim,
      availability: def.availability,
      unavailableReason: def.unavailableReason ?? 'Breakdown not yet instrumented for this ratio.',
      rows: [],
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  let population: Awaited<ReturnType<typeof fetchPopulationForFilters>>;
  try {
    population = await fetchPopulationForFilters(filters);
  } catch {
    return {
      ratioId,
      dimension: dim,
      availability: 'direct',
      unavailableReason: 'Live call data temporarily unavailable — Call Centre did not respond.',
      rows: [],
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  const rows = computeBreakdownRows(ratioId, population.calls, dim);
  return {
    ratioId,
    dimension: dim,
    availability: 'direct',
    unavailableReason: rows.length === 0 ? 'No qualifying interactions carry this dimension in this window.' : null,
    rows,
    populationCapped: population.capped,
    trueTotalRecords: population.trueTotalRecords,
  };
}

export async function getRatioDrivers(ratioId: string, filters: RatioFilterState): Promise<RatioDriverResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def?.driverDimension) {
    return { ratioId, availability: def?.availability ?? 'backend_gap', unavailableReason: 'This ratio has no defined driver dimension in the registry.', drivers: [] };
  }
  // R2: only Escalation Rate has a driver dimension implemented (escalation_reason, from the raw escalation_trigger field — no invented taxonomy).
  if (ratioId !== 'escalation_rate') {
    return { ratioId, availability: def.availability, unavailableReason: def.unavailableReason ?? 'Driver decomposition not yet instrumented for this ratio.', drivers: [] };
  }

  let population: Awaited<ReturnType<typeof fetchPopulationForFilters>>;
  try {
    population = await fetchPopulationForFilters(filters);
  } catch {
    return { ratioId, availability: 'direct', unavailableReason: 'Live call data temporarily unavailable — Call Centre did not respond.', drivers: [] };
  }

  const escalated = population.calls.filter((c) => c.outcome === 'escalated');
  const groups = groupByDimension(escalated, 'escalation_reason');
  const total = escalated.length;
  const drivers = Array.from(groups.entries())
    .map(([reason, calls]) => ({ driverId: reason, label: reason, count: calls.length, share: total > 0 ? Math.round((calls.length / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    ratioId,
    availability: 'direct',
    unavailableReason:
      drivers.length === 0
        ? total === 0
          ? 'No escalations in this window.'
          : 'escalation_trigger is not populated on the escalated interactions in this window — the field exists but carries no structured value here.'
        : null,
    drivers,
  };
}

function toInteractionRef(call: CallDataEntryDto): RatioInteractionRefDto {
  return {
    interactionId: call.call_id,
    channel: 'voice',
    timestamp: call.start_time,
    agentLabel: call.ai_agent_name || call.ai_agent_id || null,
    intent: call.intent || null,
    outcome: call.outcome || null,
  };
}

export async function getRatioInteractions(
  ratioId: string,
  filters: RatioFilterState,
  page: number,
  pageSize: number,
): Promise<RatioInteractionsResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def || !R2_IMPLEMENTED_RATIOS.has(ratioId)) {
    return {
      ratioId,
      availability: def?.availability ?? 'backend_gap',
      unavailableReason: def?.unavailableReason ?? 'Interaction-level drill-down not yet instrumented for this ratio.',
      rows: [],
      totalCount: 0,
      page,
      pageSize,
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  let population: Awaited<ReturnType<typeof fetchPopulationForFilters>>;
  try {
    population = await fetchPopulationForFilters(filters);
  } catch {
    return {
      ratioId,
      availability: 'direct',
      unavailableReason: 'Live call data temporarily unavailable — Call Centre did not respond.',
      rows: [],
      totalCount: 0,
      page,
      pageSize,
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  // Filtered to exactly the same eligibility rule as the ratio itself,
  // so "the interactions behind this number" is literally true, not an
  // approximation — e.g. AHT's interaction list excludes stale-duration
  // rows the same way computeAht does.
  const eligible =
    ratioId === 'fcr'
      ? population.calls
      : ratioId === 'escalation_rate'
        ? population.calls.filter((c) => c.outcome === 'resolved' || c.outcome === 'escalated')
        : population.calls.filter((c) => typeof c.duration_seconds === 'number' && Number.isFinite(c.duration_seconds));

  const start = (page - 1) * pageSize;
  const rows = eligible.slice(start, start + pageSize).map(toInteractionRef);

  return {
    ratioId,
    availability: 'direct',
    unavailableReason: eligible.length === 0 ? 'No qualifying interactions in this window.' : null,
    rows,
    totalCount: eligible.length,
    page,
    pageSize,
    populationCapped: population.capped,
    trueTotalRecords: population.trueTotalRecords,
  };
}
