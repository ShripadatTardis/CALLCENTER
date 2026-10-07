import { useClassification } from '@/hooks/classification/useClassification';
import { useCallData } from '@/hooks/calls/useCallData';
import { useCallMetricsBulk } from '@/hooks/calls/useCallMetrics';
import { useAnalyticsSnapshot } from './useAnalyticsSnapshot';
import { computeScopedVoiceMetrics } from '@/services/analytics/scopedAnalyticsAggregator';
import { buildCallMetricsByInteractionId } from '@/lib/callMetricsCorrelation';
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

  // Session 15.4 — dated to exactly the span of the scoped sample's own
  // interactions, same bounded-correlation approach as Agent Detail
  // (useAgentDetail.ts) — never a separate, wider fetch.
  const sampleDates = (scopedSample.data?.interactions ?? []).map((i) => i.startTime.slice(0, 10)).filter(Boolean).sort();
  const dateFrom = sampleDates[0];
  const dateTo = sampleDates[sampleDates.length - 1];
  const technicalPerformanceSample = useCallMetricsBulk(
    { date_from: dateFrom, date_to: dateTo, page_size: 100 },
    !isAllAccess && Boolean(dateFrom && dateTo),
  );

  const scoped =
    !isAllAccess && scopedSample.data
      ? computeScopedVoiceMetrics(
          scopedSample.data.interactions,
          classification.agentsById,
          buildCallMetricsByInteractionId(technicalPerformanceSample.data?.rows ?? []),
        )
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
