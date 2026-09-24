import type { AnalyticsMetricsQueryDto } from '@/types/api/analytics';

export const analyticsKeys = {
  all: ['analytics'] as const,
  metrics: (query: AnalyticsMetricsQueryDto) => [...analyticsKeys.all, 'metrics', query] as const,
};
