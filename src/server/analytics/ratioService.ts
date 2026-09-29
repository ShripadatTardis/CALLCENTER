import { getBackendRatioDefinition } from './ratioRegistry.js';
import { callPopulationProvider } from './callPopulationProvider.js';
import { CallDataFetchError, fetchCompleteCallPopulation, previousDateWindow, rangeToDateWindow } from './callPopulationFetcher.js';
import { computeComparison } from './ratioMath.js';
import { groupByDimension } from './ratioDimensions.js';
import type { AggregationProvider, ProviderFilters } from './aggregationProvider.js';
import type {
  RatioBreakdownResponseDto,
  RatioDriverResponseDto,
  RatioFilterState,
  RatioInteractionsResponseDto,
  RatioRuntimeState,
  RatioSummaryDto,
  RatioTrendResponseDto,
  RatioUnit,
} from '../../types/ratio.js';

/**
 * Session R4.3 — classifies a caught fetch failure into the two
 * user-visible runtime states that distinguish "Call Centre answered
 * but rejected us" from "Call Centre is genuinely unreachable" (see
 * CallDataFetchError's own doc comment for why this distinction
 * matters). Returns a safe, human-readable reason that includes the
 * raw status code when known — never response body/headers/secrets.
 */
function classifyFetchFailure(err: unknown): { runtimeState: RatioRuntimeState; httpStatus: number | null; reason: string } {
  if (err instanceof CallDataFetchError && err.kind === 'rejected') {
    return {
      runtimeState: 'upstream_rejected',
      httpStatus: err.status,
      reason: `Call Centre rejected this request (HTTP ${err.status}). This is a request-contract problem, not an outage.`,
    };
  }
  return {
    runtimeState: 'upstream_unavailable',
    httpStatus: err instanceof CallDataFetchError ? err.status : null,
    reason: 'Call Centre is currently unreachable — this may be a transient connectivity issue.',
  };
}

/**
 * Ratio / Analytics Service — the ONLY place that turns an
 * AggregationProvider's raw result into a ratio's public
 * summary/trend/breakdown/driver/interactions DTO.
 * api/analytics/metrics.ts's `resource=ratios` branch is a thin
 * transport wrapper around these functions; no business logic lives
 * there.
 *
 * Session R3: this file now depends on the AggregationProvider
 * interface (aggregationProvider.ts) rather than orchestrating
 * fetch+compute inline — `provider` below is the only place that
 * decides WHICH provider runs. Swapping in a future backend-native
 * provider is a one-line change here; nothing else in this file, the
 * API route, or the Ratio Explorer needs to change.
 *
 * Implemented ratios (R2: fcr, escalation_rate, aht; R3 adds
 * resolution_rate, successful_resolution_time). completion_rate
 * remains explicitly unavailable — see ratioRegistry.ts's
 * eligibilityNote and docs/SESSION_R3_RATIO_FACT_DERIVED_AND_AGGREGATION_CONTRACT.md.
 * Every other ratio still returns the R1 "not yet instrumented" shape.
 */

const provider: AggregationProvider = callPopulationProvider;

const IMPLEMENTED_RATIOS = new Set(['fcr', 'escalation_rate', 'aht', 'resolution_rate', 'successful_resolution_time']);
const UNIT_FOR: Record<string, RatioUnit> = {
  fcr: 'percent',
  escalation_rate: 'percent',
  resolution_rate: 'percent',
  aht: 'seconds',
  successful_resolution_time: 'seconds',
};
const PERCENT_RATIOS = new Set(['fcr', 'escalation_rate', 'resolution_rate']);

function emptySummary(
  ratioId: string,
  filters: RatioFilterState,
  unavailableReason: string,
  runtimeState: RatioRuntimeState,
  httpStatus: number | null = null,
): RatioSummaryDto {
  return {
    ratioId,
    availability: getBackendRatioDefinition(ratioId)?.availability ?? 'backend_gap',
    runtimeState,
    httpStatus,
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

export async function getRatioSummary(ratioId: string, filters: RatioFilterState): Promise<RatioSummaryDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def) return emptySummary(ratioId, filters, 'Unknown ratio ID.', 'not_instrumented');
  if (!IMPLEMENTED_RATIOS.has(ratioId)) {
    return emptySummary(ratioId, filters, def.unavailableReason ?? 'Not yet instrumented in this release.', 'not_instrumented');
  }

  let result: Awaited<ReturnType<AggregationProvider['getSummary']>>;
  try {
    result = await provider.getSummary(ratioId, filters);
  } catch (err) {
    const { runtimeState, httpStatus, reason } = classifyFetchFailure(err);
    return emptySummary(ratioId, filters, reason, runtimeState, httpStatus);
  }

  let comparison = null;
  try {
    const { dateFrom, dateTo } = rangeToDateWindow(filters.range);
    const prevWindow = previousDateWindow(dateFrom, dateTo);
    const prevFilters: ProviderFilters = { ...filters, dateOverride: prevWindow };
    const prevResult = await provider.getSummary(ratioId, prevFilters);
    comparison = computeComparison(result.value, prevResult.value, PERCENT_RATIOS.has(ratioId));
  } catch {
    comparison = null; // a real previous-period fetch failure -> no comparison, never a fabricated one
  }

  const hasData = result.denominator !== 0;
  return {
    ratioId,
    availability: 'direct',
    runtimeState: hasData ? 'live' : 'no_data',
    httpStatus: null,
    value: result.value,
    unit: UNIT_FOR[ratioId],
    numerator: result.numerator,
    denominator: result.denominator,
    population: result.population,
    comparison,
    dataFreshness: new Date().toISOString(),
    unavailableReason: hasData ? null : 'No qualifying interactions in this window.',
    filtersEcho: filters,
    populationCapped: result.capped,
    trueTotalRecords: result.trueTotalRecords,
  };
}

export async function getRatioTrend(ratioId: string, filters: RatioFilterState): Promise<RatioTrendResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def || !IMPLEMENTED_RATIOS.has(ratioId)) {
    return {
      ratioId,
      availability: def?.availability ?? 'backend_gap',
      runtimeState: 'not_instrumented',
      httpStatus: null,
      unavailableReason: def?.unavailableReason ?? 'Trend not yet instrumented for this ratio.',
      points: [],
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  const granularity = filters.range === '7d' || filters.range === '30d' ? 'day' : 'hour';
  let result: Awaited<ReturnType<AggregationProvider['getTrend']>>;
  try {
    result = await provider.getTrend(ratioId, filters, granularity);
  } catch (err) {
    const { runtimeState, httpStatus, reason } = classifyFetchFailure(err);
    return { ratioId, availability: 'direct', runtimeState, httpStatus, unavailableReason: reason, points: [], populationCapped: false, trueTotalRecords: null };
  }

  const hasData = result.points.length > 0;
  return {
    ratioId,
    availability: 'direct',
    runtimeState: hasData ? 'live' : 'no_data',
    httpStatus: null,
    unavailableReason: hasData ? null : 'No qualifying interactions in this window.',
    points: result.points,
    populationCapped: result.capped,
    trueTotalRecords: result.trueTotalRecords,
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
      runtimeState: 'not_instrumented',
      httpStatus: null,
      unavailableReason: `"${dimension}" is not a supported breakdown dimension for this ratio.`,
      rows: [],
      populationCapped: false,
      trueTotalRecords: null,
    };
  }
  if (!IMPLEMENTED_RATIOS.has(ratioId)) {
    return {
      ratioId,
      dimension: dim,
      availability: def.availability,
      runtimeState: 'not_instrumented',
      httpStatus: null,
      unavailableReason: def.unavailableReason ?? 'Breakdown not yet instrumented for this ratio.',
      rows: [],
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  let result: Awaited<ReturnType<AggregationProvider['getBreakdown']>>;
  try {
    result = await provider.getBreakdown(ratioId, filters, dim);
  } catch (err) {
    const { runtimeState, httpStatus, reason } = classifyFetchFailure(err);
    return { ratioId, dimension: dim, availability: 'direct', runtimeState, httpStatus, unavailableReason: reason, rows: [], populationCapped: false, trueTotalRecords: null };
  }

  const hasData = result.rows.length > 0;
  return {
    ratioId,
    dimension: dim,
    availability: 'direct',
    runtimeState: hasData ? 'live' : 'no_data',
    httpStatus: null,
    unavailableReason: hasData ? null : 'No qualifying interactions carry this dimension in this window.',
    rows: result.rows.map((r) => ({ dimension: dim, dimensionValue: r.dimensionValue, label: r.label, value: r.value, numerator: r.numerator, denominator: r.denominator, population: r.population, comparison: null })),
    populationCapped: result.capped,
    trueTotalRecords: result.trueTotalRecords,
  };
}

/**
 * Drivers is deliberately NOT part of the AggregationProvider contract
 * (spec §10 only lists summary/trend/breakdown/interactions) — it stays
 * a Ratio-Service-level concern that reads the raw population directly,
 * exactly as it did in R2, since it's a one-ratio special case
 * (Escalation Rate only), not a generic operation every ratio needs.
 */
export async function getRatioDrivers(ratioId: string, filters: RatioFilterState): Promise<RatioDriverResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def?.driverDimension) {
    return { ratioId, availability: def?.availability ?? 'backend_gap', runtimeState: 'not_instrumented', httpStatus: null, unavailableReason: 'This ratio has no defined driver dimension in the registry.', drivers: [] };
  }
  if (ratioId !== 'escalation_rate') {
    return { ratioId, availability: def.availability, runtimeState: 'not_instrumented', httpStatus: null, unavailableReason: def.unavailableReason ?? 'Driver decomposition not yet instrumented for this ratio.', drivers: [] };
  }

  const { dateFrom, dateTo } = rangeToDateWindow(filters.range);
  let population: Awaited<ReturnType<typeof fetchCompleteCallPopulation>>;
  try {
    population = await fetchCompleteCallPopulation({ dateFrom, dateTo, direction: filters.direction });
  } catch (err) {
    const { runtimeState, httpStatus, reason } = classifyFetchFailure(err);
    return { ratioId, availability: 'direct', runtimeState, httpStatus, unavailableReason: reason, drivers: [] };
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
    runtimeState: drivers.length === 0 ? 'no_data' : 'live',
    httpStatus: null,
    unavailableReason:
      drivers.length === 0
        ? total === 0
          ? 'No escalations in this window.'
          : 'escalation_trigger is not populated on the escalated interactions in this window — the field exists but carries no structured value here.'
        : null,
    drivers,
  };
}

export async function getRatioInteractions(
  ratioId: string,
  filters: RatioFilterState,
  page: number,
  pageSize: number,
): Promise<RatioInteractionsResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def || !IMPLEMENTED_RATIOS.has(ratioId)) {
    return {
      ratioId,
      availability: def?.availability ?? 'backend_gap',
      runtimeState: 'not_instrumented',
      httpStatus: null,
      unavailableReason: def?.unavailableReason ?? 'Interaction-level drill-down not yet instrumented for this ratio.',
      rows: [],
      totalCount: 0,
      page,
      pageSize,
      populationCapped: false,
      trueTotalRecords: null,
    };
  }

  let result: Awaited<ReturnType<AggregationProvider['getInteractions']>>;
  try {
    result = await provider.getInteractions(ratioId, filters, page, pageSize);
  } catch (err) {
    const { runtimeState, httpStatus, reason } = classifyFetchFailure(err);
    return { ratioId, availability: 'direct', runtimeState, httpStatus, unavailableReason: reason, rows: [], totalCount: 0, page, pageSize, populationCapped: false, trueTotalRecords: null };
  }

  const hasData = result.totalCount > 0;
  return {
    ratioId,
    availability: 'direct',
    runtimeState: hasData ? 'live' : 'no_data',
    httpStatus: null,
    unavailableReason: hasData ? null : 'No qualifying interactions in this window.',
    rows: result.rows,
    totalCount: result.totalCount,
    page,
    pageSize,
    populationCapped: result.capped,
    trueTotalRecords: result.trueTotalRecords,
  };
}
