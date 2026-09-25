import { useClassification } from '@/hooks/classification/useClassification';
import { useCallData } from '@/hooks/calls/useCallData';
import { useAnalyticsSnapshot } from './useAnalyticsSnapshot';
import { computeScopedVoiceMetrics } from '@/services/analytics/scopedAnalyticsAggregator';
import type { AnalyticsMetricsQueryDto } from '@/types/api/analytics';
import type { CallDataQueryDto } from '@/types/api/calls';

/**
 * Session 7 §5 — the central authorization branch. All-access roles get
 * the real GLOBAL /analytics/metrics snapshot directly (correct and
 * honest — their authorized universe IS the global one). Scoped roles
 * never see that global snapshot; they get metrics derived only from
 * their own server-authorized call-data sample (api/calls/data.ts's
 * Session 6.2 filtering) via scopedAnalyticsAggregator, with an explicit
 * sample size so the UI never implies a true window total.
 */
export function useVoiceAnalytics(analyticsQuery: AnalyticsMetricsQueryDto, callQuery: CallDataQueryDto = {}) {
  const classification = useClassification();
  const isAllAccess = classification.data?.allCategories === true;

  const snapshot = useAnalyticsSnapshot(analyticsQuery);
  const scopedSample = useCallData(
    { page_size: 100, ...callQuery },
    { refetchInterval: undefined },
  );

  const scoped =
    !isAllAccess && scopedSample.data
      ? computeScopedVoiceMetrics(scopedSample.data.interactions, classification.agentsById)
      : null;

  return {
    isAllAccess,
    isLoading: classification.isLoading || (isAllAccess ? snapshot.isLoading : scopedSample.isLoading),
    isError: isAllAccess ? snapshot.isError : scopedSample.isError,
    error: isAllAccess ? snapshot.error : scopedSample.error,
    global: isAllAccess ? snapshot.data ?? null : null,
    scoped,
    agentsById: classification.agentsById,
    classification: classification.data,
  };
}
