/**
 * DTOs for the Voice Agent backend's Call Metrics endpoint
 * (GET /api/v1/analytics/call-metrics), typed directly from the
 * supplied Call_Metrics_API.docx reference doc. Mirrors the wire shape
 * exactly (snake_case field names as documented) — see
 * src/types/api/calls.ts's header comment for the same DTO -> UI model
 * boundary rule this follows.
 *
 * Session 15.4 — identifier reconciliation CONFIRMED: call_sid here is
 * documented as "the call_sid returned by POST /api/v1/call", and this
 * codebase already has independently, empirically proven
 * (src/server/campaigns/reconcileExecutions.ts, CORRELATION_MODE=
 * call_sid_equals_call_id, Sessions 12.2A/12.2B) that this same value
 * equals call-data's own `call_id`. Confirmed again this session by
 * cross-referencing a real Call Metrics export against this project's
 * own already-reconciled campaign_executions row for the same call
 * (exact call_sid + microsecond-precision start_time + phone number
 * match). This is the authoritative join key for every per-call
 * correlation in callMetricsCorrelation.ts.
 */

export type CallMetricsSortField =
  | 'start_time'
  | 'recorded_at'
  | 'concurrent_users'
  | 'duration_seconds'
  | 'stt_ms'
  | 'llm_ttft_ms'
  | 'llm_ms'
  | 'tts_ttfb_ms'
  | 'turn_ms'
  | 'tool_ms'
  | 'rag_ms'
  | 'orchestrator_ms';

export interface CallMetricsQueryDto {
  /** YYYY-MM-DD, inclusive, interpreted in the display timezone (Asia/Kolkata by default), not UTC. Defaults to today when both date_from/date_to are omitted. */
  date_from?: string;
  /** YYYY-MM-DD, inclusive (applied as < date_to + 1 day upstream). */
  date_to?: string;
  direction?: 'inbound' | 'outbound';
  search?: string;
  sort?: CallMetricsSortField;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  /** 1-100. */
  page_size?: number;
}

/**
 * One row per call. Every *_ms field is `number | null` — null is a
 * real, honest state (call not yet completed/answered, or — for
 * tool_ms/rag_ms specifically — no tool call / no KB lookup occurred on
 * that call), never to be coerced to 0. See
 * src/lib/callMetricsFormat.ts for the shared formatter that preserves
 * this distinction in every UI consumer.
 */
export interface CallMetricsRowDto {
  call_sid: string;
  start_time: string;
  recorded_at: string | null;
  /** Display string only ("Banking Assistant" default) — never a stable agent id. Never used for authorization or aggregation identity; see callMetricsCorrelation.ts. */
  agent: string;
  direction: 'inbound' | 'outbound';
  duration_seconds: number | null;
  concurrent_users: number;
  stt_ms: number | null;
  llm_ttft_ms: number | null;
  llm_ms: number | null;
  tts_ttfb_ms: number | null;
  turn_ms: number | null;
  tool_ms: number | null;
  rag_ms: number | null;
  orchestrator_ms: number | null;
  turns: number | null;
}

export interface CallMetricsResponseDto {
  success: boolean;
  data: {
    rows: CallMetricsRowDto[];
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}
