/**
 * DTOs for GET /api/v1/analytics/metrics.
 *
 * Session 7: expanded from Session 3's minimal 6-field slice to the
 * full confirmed contract (docs/Analytics_Metrics_API.docx,
 * docs/CALL_CENTRE_SESSION7_ANALYTICS_REPORTS_PLAN.md §3/§4) — additive
 * only, existing consumers (Dashboard's useAnalyticsMetrics) keep working
 * unchanged since every previously-typed field is untouched.
 *
 * `window` takes precedence over `date_from`/`date_to` when both are
 * sent — the UI must only ever send one or the other (plan §10/§14).
 */
export interface AnalyticsMetricsQueryDto {
  window?: '1h' | '6h' | '12h' | '24h' | '7d' | '30d';
  direction?: 'inbound' | 'outbound';
  /** YYYY-MM-DD, inclusive, interpreted in the display timezone (not UTC). Ignored when `window` is set. */
  date_from?: string;
  /** YYYY-MM-DD, inclusive. Ignored when `window` is set. */
  date_to?: string;
}

export interface AnalyticsMetricsFields {
  /** Completed calls only — never the dashboard "Total Calls" figure. */
  total_calls: number;
  /** All calls started in the window, any outcome — the dashboard-style "Total Calls" figure. */
  calls_in_window: number;
  fcr_rate: number;
  avg_aht_seconds: number;
  escalation_rate: number;
  resolved_count: number;
  escalated_count: number;
  /** 0-100 scale. */
  avg_intent_accuracy: number;
  /** Not window-scoped — reflects calls in progress right now. */
  live_concurrent_calls: number;
  /** Window-scoped. */
  peak_concurrency: number;
  avg_turn_latency_ms: number;
  p95_turn_latency_ms: number;
}

export interface AnalyticsFiltersEchoDto {
  window: string | null;
  direction: string | null;
  date_from: string | null;
  date_to: string | null;
}

export interface AnalyticsTimeSeriesPointDto {
  t: string;
  [key: string]: string | number | null;
}

export interface AnalyticsChartsDto {
  call_volume: Array<{ t: string; started: number }>;
  latency_over_time: Array<{ t: string; avg_ms: number | null }>;
  concurrency: Array<{ t: string; concurrent: number }>;
}

export interface AnalyticsOutcomeDto {
  name: string;
  value: number;
}

export interface AnalyticsCallsByAgentDto {
  agent: string;
  count: number;
}

export interface AnalyticsAhtDistributionDto {
  bucket: string;
  count: number;
}

export interface AnalyticsMetricsResponseDto {
  success: boolean;
  filters?: AnalyticsFiltersEchoDto;
  metrics: AnalyticsMetricsFields;
  charts?: AnalyticsChartsDto;
  outcomes?: AnalyticsOutcomeDto[];
  calls_by_agent?: AnalyticsCallsByAgentDto[];
  aht_distribution?: AnalyticsAhtDistributionDto[];
}
