/**
 * DTOs for the Voice Agent backend's Interaction Trace endpoints
 * (GET /api/v1/interaction-trace/call/{id}, GET /api/v1/interaction-trace/chat/{id}),
 * typed directly from the supplied Interaction_Trace_API.docx reference
 * doc (Session 16.4.3). Mirrors the wire shape exactly (snake_case field
 * names as documented, same DTO -> UI model boundary rule as
 * src/types/api/calls.ts) — see that file's header for the convention.
 *
 * Both endpoints return the identical response shape; only the upstream
 * path (and therefore which id-space is valid) differs.
 *
 * "Not yet recorded" per the doc: `frame_context.reason` and
 * `escalation_event` are documented fields that are currently ALWAYS
 * null on every real response. They are typed here anyway (never
 * omitted) so this contract does not need to change when the backend
 * starts populating them — only real data arriving, no shape change.
 */

export type InteractionStatus = 'completed' | 'in_progress' | 'failed';

export type PromptType = 'tool' | 'rag' | 'rag_tool' | 'session_data' | 'system';

export type ToolCallErrorCode =
  | 'timeout'
  | 'exception'
  | 'tool_disabled'
  | 'auth_required'
  | 'missing_parameters'
  | 'not_found'
  | 'tool_error';

export interface ToolCallDto {
  tool_call_id: string;
  tool_name: string;
  event_time: string;
  parameters: Record<string, unknown>;
  result: Record<string, unknown> | null;
  success: boolean;
  error_code: ToolCallErrorCode | null;
  error_message: string | null;
  latency_ms: number | null;
  reference_id: string | null;
}

export interface RagReferenceDto {
  reference_id: string;
  source_category: string | null;
  text: string;
  relevance_score: number | null;
}

export interface RagCallDto {
  rag_call_id: string;
  event_time: string;
  success: boolean;
  query: string | null;
  references: RagReferenceDto[];
  latency_ms: number | null;
  error_message: string | null;
}

export interface FrameDto {
  frame_id: string;
  intent: string;
  tool: string | null;
  selected: Record<string, unknown> | null;
}

export type RouterDecisionType = 'new' | 'continue' | 'clarify';

/** gate | coref | llm | ce | classifier_meta | fallback | `${string}_rag_override` — kept as a plain string since the override family is open-ended per the doc. */
export type RouterDecisionSource = string;

export interface RouterDecisionDto {
  type: RouterDecisionType;
  target_frame_id: string | null;
  source: RouterDecisionSource;
  confidence: number | null;
  reason: string | null;
}

export type SlotFillStatus = 'no_pending' | 'resolved' | 'no_match_requeued' | 'malformed_pending';

export interface CrossToolRerouteDto {
  from: string;
  to: string;
  frame_id: string;
  reason: string;
}

export interface SoftContinuationDto {
  frame_id: string;
  carried: Record<string, unknown> | null;
  /** Observed in sample responses; not individually documented in the field table — surfaced as-is, never synthesized when absent. */
  swapped?: boolean;
}

export type FinalPlanAction =
  | 'tool_exec'
  | 'tool_exec_multi'
  | 'rag_query'
  | 'guidance'
  | 'auth_gate'
  | 'direct_response'
  | 'clarify'
  | 'action_flow';

export interface FinalPlanDto {
  action: FinalPlanAction;
  tool_name: string | null;
  tool_call_id: string | null;
  rag_call_id: string | null;
  parameters: Record<string, unknown> | null;
}

export interface FrameContextDto {
  available: boolean;
  /** not_applicable | not_captured | null. Documented as "currently always null" (not yet recorded). */
  reason: string | null;
  active_frames: FrameDto[] | null;
  router_decision: RouterDecisionDto | null;
  slot_fill_status: SlotFillStatus | null;
  cross_tool_reroute: CrossToolRerouteDto | null;
  soft_continuation: SoftContinuationDto | null;
  final_plan: FinalPlanDto | null;
}

export interface AuthenticationEventDto {
  event_id: string;
  event_time: string;
  method: string;
  success: boolean;
  error_code: string | null;
  latency_ms: number | null;
}

/** Documented as "currently always null" (not yet recorded) — typed for forward compatibility, never fabricated client-side. */
export interface EscalationEventDto {
  event_id: string;
  event_time: string;
  reason: string | null;
  destination: string | null;
}

export interface CustomerFeedbackEventDto {
  event_id: string;
  event_time: string;
  raw_value: string;
  parsed_score: number;
}

export type GuardrailEventType = 'response_validation' | 'outbound_response_validation' | 'pii_scrub';
export type GuardrailEventAction = 'replaced_with_fallback' | 'sanitized' | 'flagged' | 'rewritten';

export interface GuardrailEventDto {
  event_id: string;
  event_time: string;
  type: GuardrailEventType;
  action: GuardrailEventAction;
  detail: string | null;
}

export interface InteractionTraceTurnDto {
  turn_id: string;
  turn_sequence: number;
  turn_time: string;
  customer_utterance: string;
  bot_utterance: string;
  prompt_type: PromptType;
  tool_calls: ToolCallDto[];
  rag_calls: RagCallDto[];
  frame_context: FrameContextDto;
  authentication_event: AuthenticationEventDto | null;
  escalation_event: EscalationEventDto | null;
  customer_feedback_event: CustomerFeedbackEventDto | null;
  guardrail_event: GuardrailEventDto | null;
}

export interface InteractionTraceResponseDto {
  success: true;
  interaction_id: string;
  trace_version: string;
  interaction_status: InteractionStatus | null;
  turns: InteractionTraceTurnDto[];
}

export type InteractionTraceErrorCode =
  | 'trace_not_found'
  | 'trace_not_ready'
  | 'invalid_interaction_id'
  | 'trace_store_unavailable'
  | 'unauthorized'
  | 'forbidden';

export interface InteractionTraceErrorDto {
  success: false;
  error: InteractionTraceErrorCode | string;
  message: string;
}

export type InteractionTraceChannel = 'call' | 'chat';
