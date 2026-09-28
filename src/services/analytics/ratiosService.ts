import { request } from '@/services/transport/httpClient';
import type {
  RatioBreakdownResponseDto,
  RatioDriverResponseDto,
  RatioFilterState,
  RatioInteractionsResponseDto,
  RatioSummaryDto,
  RatioTrendResponseDto,
} from '@/types/ratio';

/**
 * Frontend service layer for the generic Ratio Explorer API family
 * (Session R1). Calls the existing /api/analytics/metrics endpoint's
 * `resource=ratios` dispatch branch — see api/analytics/metrics.ts for
 * why this reuses that file rather than adding a new one.
 *
 * Every function here takes the same RatioFilterState shape the URL/drill
 * state model (src/lib/ratios/ratioFilterState.ts) already produces —
 * no DTO field name leaks past this file into a hook or component.
 */

function filtersQuery(filters: RatioFilterState): Record<string, string | undefined> {
  return {
    range: filters.range,
    direction: filters.direction,
    channel: filters.channel,
    domain: filters.domain,
    campaign: filters.campaign,
    agent: filters.agent,
    intent: filters.intent,
    breakdown: filters.breakdown,
    breakdownValue: filters.breakdownValue,
    driver: filters.driver,
  };
}

export async function fetchRatioSummary(ratioId: string, filters: RatioFilterState): Promise<RatioSummaryDto> {
  return request<RatioSummaryDto>('/analytics/metrics', {
    method: 'GET',
    query: { resource: 'ratios', ratioId, view: 'summary', ...filtersQuery(filters) },
  });
}

export async function fetchRatioTrend(ratioId: string, filters: RatioFilterState): Promise<RatioTrendResponseDto> {
  return request<RatioTrendResponseDto>('/analytics/metrics', {
    method: 'GET',
    query: { resource: 'ratios', ratioId, view: 'trend', ...filtersQuery(filters) },
  });
}

export async function fetchRatioBreakdown(ratioId: string, by: string, filters: RatioFilterState): Promise<RatioBreakdownResponseDto> {
  return request<RatioBreakdownResponseDto>('/analytics/metrics', {
    method: 'GET',
    query: { resource: 'ratios', ratioId, view: 'breakdown', by, ...filtersQuery(filters) },
  });
}

export async function fetchRatioDrivers(ratioId: string, filters: RatioFilterState): Promise<RatioDriverResponseDto> {
  return request<RatioDriverResponseDto>('/analytics/metrics', {
    method: 'GET',
    query: { resource: 'ratios', ratioId, view: 'drivers', ...filtersQuery(filters) },
  });
}

export async function fetchRatioInteractions(
  ratioId: string,
  filters: RatioFilterState,
  page: number,
  pageSize: number,
): Promise<RatioInteractionsResponseDto> {
  return request<RatioInteractionsResponseDto>('/analytics/metrics', {
    method: 'GET',
    query: { resource: 'ratios', ratioId, view: 'interactions', page, pageSize, ...filtersQuery(filters) },
  });
}
