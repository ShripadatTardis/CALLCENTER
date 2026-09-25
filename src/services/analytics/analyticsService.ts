import { request } from '@/services/transport/httpClient';
import type { AnalyticsMetricsQueryDto, AnalyticsMetricsResponseDto } from '@/types/api/analytics';
import { mapAnalyticsMetrics, mapAnalyticsSnapshot, type AnalyticsMetrics, type AnalyticsSnapshot } from './analyticsMapper';

export async function fetchAnalyticsMetrics(query: AnalyticsMetricsQueryDto = {}): Promise<AnalyticsMetrics> {
  const dto = await request<AnalyticsMetricsResponseDto>('/analytics/metrics', {
    method: 'GET',
    query: query as Record<string, string | number | boolean | undefined>,
  });
  return mapAnalyticsMetrics(dto);
}

/** Session 7 — full snapshot (metrics + charts + outcomes + calls_by_agent + aht_distribution). */
export async function fetchAnalyticsSnapshot(query: AnalyticsMetricsQueryDto = {}): Promise<AnalyticsSnapshot> {
  const dto = await request<AnalyticsMetricsResponseDto>('/analytics/metrics', {
    method: 'GET',
    query: query as Record<string, string | number | boolean | undefined>,
  });
  return mapAnalyticsSnapshot(dto);
}
