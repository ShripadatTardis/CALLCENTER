/**
 * DTOs for the Voice Agent backend's calls domain, typed directly from
 * the vendor's reference docs (Trigger Call API, Session Transcript API,
 * Call Data API). All three endpoints are fully documented with complete
 * request/response schemas — nothing here is speculative.
 *
 * These types mirror the wire shape exactly (snake_case field names as
 * documented). Never import these types outside `src/types/api/` and
 * the corresponding mapper in `src/services/calls/callsMapper.ts` — see
 * that file for the DTO -> UI model boundary rule.
 */

// ---------------------------------------------------------------------
// POST /api/v1/call (Trigger Call)
// ---------------------------------------------------------------------

/**
 * Session 12.4 — `agent_inputs` added per the upgraded, currently
 * documented Trigger Call contract: a flat object of the selected
 * agent's declared `expected_input_fields[]` field_code -> value. The
 * backend validates (before dialing) unknown/inactive agent_id, missing
 * required input, wrong input type/format, and undeclared input —
 * Call Centre never re-implements that validation as its own source of
 * truth, only enough local checking to avoid dialing a target it can
 * already tell is incomplete (see triggerCallPayload.ts). Omitting both
 * `agent_id` and `agent_inputs` retains the documented legacy/
 * default-agent behavior unchanged — this field is optional and never
 * sent as an empty object for an agent that declares zero expected
 * input fields (e.g. the inbound default agent).
 */
export interface TriggerCallRequestDto {
  to_phone_number: string;
  /** Stored on the record only — does NOT change the actual Twilio caller ID. */
  from_phone_number?: string;
  english_accent?: 'british' | 'indian' | 'nigerian';
  voice_name?: string;
  agent_id?: string;
  /** Bank CIF/CRM ID, when known. */
  customer_id?: string;
  agent_inputs?: Record<string, unknown>;
}

export interface TriggerCallResponseDto {
  success: boolean;
  call_sid: string;
  status: string;
}

// ---------------------------------------------------------------------
// GET /api/v1/sessions/{session_id} (Session Transcript)
// ---------------------------------------------------------------------

export interface SessionInteractionEntryDto {
  number: number;
  user_message: string;
  bot_response: string;
  timestamp: string;
}

export interface SessionTranscriptResponseDto {
  success: boolean;
  session_id: string;
  type: 'voice';
  status: 'active' | 'completed';
  interactions: SessionInteractionEntryDto[];
  total_interactions: number;
}

// ---------------------------------------------------------------------
// GET /api/v1/call-data (Call Data)
// ---------------------------------------------------------------------

export interface CallDataQueryDto {
  status?: 'active' | 'inactive' | 'completed';
  direction?: 'inbound' | 'outbound';
  outcome?: 'resolved' | 'escalated';
  /** YYYY-MM-DD, inclusive, interpreted in the display timezone (not UTC). */
  date_from?: string;
  /** YYYY-MM-DD, inclusive. */
  date_to?: string;
  search?: string;
  min_duration?: number;
  max_duration?: number;
  page?: number;
  page_size?: number;
}

export interface CallDataSummaryDto {
  active_calls: number;
  connecting_calls: number;
  escalated_calls: number;
  avg_handle_time_seconds: number;
  transfers_today: number;
  total_calls: number;
  fcr_rate: number;
  avg_aht_seconds: number;
  avg_intent_accuracy: number;
  escalation_rate: number;
  resolved_count: number;
  escalated_count: number;
}

export interface DetailedTranscriptEntryDto {
  timestamp: string;
  speaker: string;
  text: string;
  sentiment: string;
  confidence: number;
}

export interface CallAnalysisDto {
  sentiment_trend: string;
  key_topics: string[];
  resolution_status: string;
  confidence_score: number;
}

export interface CallDataEntryDto {
  call_id: string;
  status: 'active' | 'inactive';
  caller_name: string;
  caller_number: string;
  from_phone_number: string;
  agent_id: string | null;
  /** Confirmed present on every call-data row via live verification (2026-09-23). */
  direction: 'inbound' | 'outbound';
  outcome: string;
  fcr: boolean;
  aht_seconds: number;
  intent_accuracy: number;
  intent: string;
  sentiment: string;
  sentiment_score: number;
  campaign_name: string;
  tags: string[];
  transcript_summary: string;
  timestamp: string;
  start_time: string;
  stage: string;
  duration_seconds: number;
  channel: 'voice';
  ai_agent_id: string;
  ai_agent_name: string;
  context: string;
  escalation_trigger: string | null;
  transcript_doc_id: string | null;
  voice_record_url: string | null;
  was_authenticated: boolean | null;
  is_bank_customer: boolean;
  analysis: CallAnalysisDto;
  detailed_transcript: DetailedTranscriptEntryDto[];
  /**
   * Session 12.4 — newly observed on the live response (confirmed
   * against Phase E's proven call plus a full 689-record scan of every
   * other real call in this dataset): the schema now HAS a slot for the
   * agent's actual, classified outcome (per the agent's own
   * expected_outcomes[] contract — see types/api/agents.ts), but it is
   * `null` on every single real record observed, including today's own
   * proven call. **Not yet a usable data source** — do not derive a
   * Campaign result from this field until it is confirmed populated for
   * a real interaction. See docs/SESSION_12_4_DYNAMIC_AGENT_CONTRACTS_AND_IDEMPOTENCY.md §8.
   */
  actual_outcome_code: string | null;
  actual_outcome_name: string | null;
  /** Same status as actual_outcome_code/actual_outcome_name above — the agent's declared output_fields[] values, schema present, never yet populated. */
  structured_outputs: Record<string, unknown> | null;
}

export interface CallDataPaginationDto {
  page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
}

export interface CallDataResponseDto {
  success: boolean;
  data: {
    summary: CallDataSummaryDto;
    calls: CallDataEntryDto[];
    pagination: CallDataPaginationDto;
  };
}
