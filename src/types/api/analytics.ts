/**
 * DTOs for GET /api/v1/analytics/metrics.
 *
 * CORRECTED against a real live response (2026-09-24, Session 3
 * verification) — the actual shape is
 * `{success, filters, metrics: {...}, charts: {...}, outcomes,
 * calls_by_agent, aht_distribution}`, not the `data`-wrapped or flat
 * shape assumed from the Swagger summary alone. Only `metrics` is
 * typed/consumed here for Session 3's Dashboard scope; `charts`,
 * `outcomes`, `calls_by_agent`, and `aht_distribution` are real,
 * observed, richer capabilities (including avg_intent_accuracy,
 * live_concurrent_calls, peak_concurrency, avg/p95 turn latency) not
 * consumed yet — left for a future session's scope, not implemented
 * speculatively now.
 */
export interface AnalyticsMetricsQueryDto {
  date_from?: string;
  date_to?: string;
}

export interface AnalyticsMetricsFields {
  total_calls: number;
  fcr_rate: number;
  avg_aht_seconds: number;
  escalation_rate: number;
  resolved_count: number;
  escalated_count: number;
}

export interface AnalyticsMetricsResponseDto {
  success: boolean;
  metrics: AnalyticsMetricsFields;
}
