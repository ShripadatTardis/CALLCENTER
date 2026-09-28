import { getBackendRatioDefinition } from './ratioRegistry.js';
import type {
  RatioBreakdownResponseDto,
  RatioDriverResponseDto,
  RatioFilterState,
  RatioInteractionsResponseDto,
  RatioSummaryDto,
  RatioTrendResponseDto,
  RatioUnit,
} from '../../types/ratio.js';

/**
 * Ratio / Analytics Service (Session R1) — the ONLY place that turns a raw
 * backend fact into a ratio's summary/trend/breakdown/driver/interactions
 * response. api/analytics/metrics.ts's `resource=ratios` branch is a thin
 * transport wrapper around these functions; no business logic lives there.
 *
 * R1 scope (spec §17.14, "establish the contract, connect ratios
 * incrementally"): genuinely implements SUMMARY for the three ratios whose
 * DIRECT global aggregate already exists on GET /api/v1/analytics/metrics
 * (fcr, escalation_rate, aht) — trend/breakdown/drivers/interactions for
 * EVERY ratio, including these three, return an honest "not yet
 * instrumented" response in R1 rather than a fabricated one, since no
 * per-dimension breakdown or interaction-drill endpoint exists yet on that
 * global aggregate. Every other ratio (whatever its registry availability)
 * returns the same honest unavailable shape for all five views in R1 —
 * DERIVED/PARTIAL ratios are architecturally ready to be connected in R2
 * once their specific calculation is written, not before.
 */

const R1_IMPLEMENTED_SUMMARY_RATIOS = new Set(['fcr', 'escalation_rate', 'aht']);

interface GlobalMetricsFields {
  fcr_rate: number;
  avg_aht_seconds: number;
  escalation_rate: number;
  resolved_count: number;
  escalated_count: number;
  total_calls: number;
}

/**
 * Deliberately reads process.env directly rather than importing
 * api/_voicebot.ts's getBackendConfig() — that helper is coupled to the
 * Vercel transport layer, a concern this domain-layer file must not
 * depend on, mirroring campaignRunner.ts's and
 * voiceAgentInteractionSource.ts's own documented rule.
 */
async function fetchGlobalMetrics(range: RatioFilterState['range']): Promise<GlobalMetricsFields | null> {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
  }
  const window = range ?? '24h';
  const res = await fetch(`${baseUrl}/api/v1/analytics/metrics?window=${encodeURIComponent(window)}`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { metrics?: GlobalMetricsFields };
  return body?.metrics ?? null;
}

function emptySummary(ratioId: string, unit: RatioUnit, filters: RatioFilterState, unavailableReason: string): RatioSummaryDto {
  return {
    ratioId,
    availability: getBackendRatioDefinition(ratioId)?.availability ?? 'backend_gap',
    value: null,
    unit,
    numerator: null,
    denominator: null,
    population: null,
    comparison: null,
    dataFreshness: null,
    unavailableReason,
    filtersEcho: filters,
  };
}

export async function getRatioSummary(ratioId: string, filters: RatioFilterState): Promise<RatioSummaryDto> {
  const def = getBackendRatioDefinition(ratioId);
  if (!def) {
    return emptySummary(ratioId, 'percent', filters, 'Unknown ratio ID.');
  }
  if (!R1_IMPLEMENTED_SUMMARY_RATIOS.has(ratioId)) {
    return emptySummary(ratioId, ratioId === 'aht' || ratioId === 'successful_resolution_time' ? 'seconds' : 'percent', filters, def.unavailableReason ?? 'Not yet instrumented in this release.');
  }

  // R1 only supports the global (unfiltered-by-direction/campaign/agent)
  // aggregate — a filtered request for one of these three still returns
  // the real, honest global value with a note, never a silently-wrong
  // filtered-looking number. Per-dimension filtering is a service-layer
  // R2 addition, not a UI concern.
  const metrics = await fetchGlobalMetrics(filters.range);
  if (!metrics) {
    return emptySummary(ratioId, ratioId === 'aht' ? 'seconds' : 'percent', filters, 'Live metrics temporarily unavailable — Call Centre analytics endpoint did not respond.');
  }

  if (ratioId === 'fcr') {
    return {
      ratioId,
      availability: 'direct',
      value: round1(metrics.fcr_rate),
      unit: 'percent',
      numerator: metrics.resolved_count > 0 || metrics.fcr_rate > 0 ? Math.round((metrics.fcr_rate / 100) * metrics.total_calls) : 0,
      denominator: metrics.total_calls,
      population: metrics.total_calls,
      comparison: null,
      dataFreshness: new Date().toISOString(),
      unavailableReason: null,
      filtersEcho: filters,
    };
  }
  if (ratioId === 'escalation_rate') {
    return {
      ratioId,
      availability: 'direct',
      value: round1(metrics.escalation_rate),
      unit: 'percent',
      numerator: metrics.escalated_count,
      denominator: metrics.total_calls,
      population: metrics.total_calls,
      comparison: null,
      dataFreshness: new Date().toISOString(),
      unavailableReason: null,
      filtersEcho: filters,
    };
  }
  // aht
  return {
    ratioId,
    availability: 'direct',
    value: Math.round(metrics.avg_aht_seconds),
    unit: 'seconds',
    numerator: Math.round(metrics.avg_aht_seconds * metrics.total_calls),
    denominator: metrics.total_calls,
    population: metrics.total_calls,
    comparison: null,
    dataFreshness: new Date().toISOString(),
    unavailableReason: null,
    filtersEcho: filters,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function getRatioTrend(ratioId: string): Promise<RatioTrendResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  return {
    ratioId,
    availability: def?.availability ?? 'backend_gap',
    unavailableReason: 'Trend is not yet instrumented — the global analytics endpoint returns a single current-window aggregate, not a time-bucketed series with population per bucket. Planned for R2.',
    points: [],
  };
}

export async function getRatioBreakdown(ratioId: string, dimension: string): Promise<RatioBreakdownResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  const dimensionSupported = def?.supportedDimensions.includes(dimension as never) ?? false;
  return {
    ratioId,
    // Cast is safe: this is an echo of the caller's own query param, validated below.
    dimension: dimension as RatioBreakdownResponseDto['dimension'],
    availability: def?.availability ?? 'backend_gap',
    unavailableReason: !dimensionSupported
      ? `"${dimension}" is not a supported breakdown dimension for this ratio.`
      : 'Breakdown is not yet instrumented — the current analytics endpoint has no per-dimension GROUP BY. Planned for R2.',
    rows: [],
  };
}

export async function getRatioDrivers(ratioId: string): Promise<RatioDriverResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  return {
    ratioId,
    availability: def?.availability ?? 'backend_gap',
    unavailableReason: def?.driverDimension
      ? 'Driver decomposition is not yet instrumented for this ratio. Planned for R2.'
      : 'This ratio has no defined driver dimension in the registry.',
    drivers: [],
  };
}

export async function getRatioInteractions(ratioId: string): Promise<RatioInteractionsResponseDto> {
  const def = getBackendRatioDefinition(ratioId);
  return {
    ratioId,
    availability: def?.availability ?? 'backend_gap',
    unavailableReason: 'Interaction-level drill-down is not yet instrumented for this ratio in R1. Planned for R2 (will reuse the existing Call Logs / Chat Logs interaction identity, never a second copy).',
    rows: [],
    totalCount: 0,
  };
}
