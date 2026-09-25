import { useQuery } from '@tanstack/react-query';
import { analyticsKeys } from '@/services/analytics/analyticsKeys';
import { fetchAnalyticsSnapshot } from '@/services/analytics/analyticsService';
import type { AnalyticsMetricsQueryDto } from '@/types/api/analytics';

/**
 * Session 7 — the full /analytics/metrics response (metrics + charts +
 * outcomes + calls_by_agent + aht_distribution). This endpoint has no
 * agent_id/category_id/domain filter (plan §5), so its values are
 * GLOBAL — callers must gate display on the current role being
 * all-access (useClassification().allCategories) before showing these
 * numbers directly; a scoped role must not render this hook's data as
 * its own totals. See src/services/analytics/scopedAnalyticsAggregator.ts
 * for the scoped-role alternative.
 */
export function useAnalyticsSnapshot(query: AnalyticsMetricsQueryDto = {}) {
  return useQuery({
    queryKey: analyticsKeys.snapshot(query),
    queryFn: () => fetchAnalyticsSnapshot(query),
  });
}
