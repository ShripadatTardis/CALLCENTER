/**
 * DTOs for GET /api/v1/analytics/metrics, confirmed via Swagger
 * (2026-09-24 reconciliation — see docs/CALL_CENTRE_BACKEND_CAPABILITY_RECONCILIATION.md).
 *
 * This endpoint is date-ranged-only (no status/direction/outcome/search
 * filters, unlike call-data) and aggregates over COMPLETED calls only —
 * it has no active-call count. Active Calls must keep coming from
 * call-data's summary, not this endpoint.
 *
 * Only the fields explicitly confirmed are typed here — no padding with
 * guessed metrics (e.g. no CSAT, no per-stage timing — both confirmed
 * absent in the reconciliation pass).
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

/**
 * Whether the response wraps the metrics in a `data` envelope (like
 * call-data does) or returns them flat (like the agents/trigger-call
 * responses do inconsistently) was not specified in what was confirmed.
 * Typed permissively here; the service layer unwraps defensively at
 * runtime rather than assuming one shape. Revise once directly observed.
 */
export type AnalyticsMetricsResponseDto =
  | (AnalyticsMetricsFields & { success?: boolean })
  | { success: boolean; data: AnalyticsMetricsFields };
