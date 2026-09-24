import { request } from '@/services/transport/httpClient';
import type { AnalyticsMetricsQueryDto, AnalyticsMetricsResponseDto } from '@/types/api/analytics';
import { mapAnalyticsMetrics, type AnalyticsMetrics } from './analyticsMapper';

export async function fetchAnalyticsMetrics(query: AnalyticsMetricsQueryDto = {}): Promise<AnalyticsMetrics> {
  const dto = await request<AnalyticsMetricsResponseDto>('/analytics/metrics', {
    method: 'GET',
    query: query as Record<string, string | number | boolean | undefined>,
  });
  return mapAnalyticsMetrics(dto);
}
