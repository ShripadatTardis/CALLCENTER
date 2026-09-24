import { useQuery } from '@tanstack/react-query';
import { analyticsKeys } from '@/services/analytics/analyticsKeys';
import { fetchAnalyticsMetrics } from '@/services/analytics/analyticsService';
import type { AnalyticsMetricsQueryDto } from '@/types/api/analytics';

export function useAnalyticsMetrics(query: AnalyticsMetricsQueryDto = {}) {
  return useQuery({
    queryKey: analyticsKeys.metrics(query),
    queryFn: () => fetchAnalyticsMetrics(query),
  });
}
