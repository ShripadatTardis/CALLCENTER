/**
 * Session 12.4 — the Agents API contract was upgraded to expose the full
 * agent contract (expected_input_fields/expected_outcomes/output_fields),
 * confirmed live against the real, deployed `GET /api/v1/agents` response
 * (via this app's own proxy) — not copied from the session prompt's
 * illustrative example. The live response for `emi-reminder-agent`
 * genuinely declares 3 required inputs (customer_name, emi_amount,
 * emi_due_date) plus 5 further OPTIONAL inputs the prompt's own example
 * didn't mention (loan_type, loan_reference_last4, late_fee,
 * instalments_remaining, total_outstanding), 10 real expected_outcomes,
 * and 3 real output_fields. `inbound-banking-default` (the inbound
 * default agent) genuinely returns all three arrays EMPTY — a real,
 * complete fact about that agent (it has no campaign-driven inputs by
 * design), never treated as "missing"/"legacy" data.
 *
 * Previous (Session 1, 2026-09-23) confirmation only found agent_id/
 * display_name/persona_name/direction/language/is_default — this
 * supersedes that, additively (every previously-confirmed field is
 * unchanged).
 */
export interface AgentInputFieldDto {
  field_code: string;
  display_name: string;
  data_type: string;
  required: boolean;
  description: string;
  allowed_values: string[];
  /** e.g. "YYYY-MM-DD" for a date field. Empty string when not applicable — never omitted/undefined, matches the live response's own shape. */
  format: string;
}

export interface AgentOutcomeDto {
  outcome_code: string;
  display_name: string;
  description: string;
}

export interface AgentOutputFieldDto {
  field_code: string;
  display_name: string;
  data_type: string;
  nullable: boolean;
  description: string;
}

export interface AgentSummaryDto {
  agent_id: string;
  /** Internal/short name — distinct from display_name, confirmed present on the live response. */
  agent_name: string;
  display_name: string;
  persona_name: string;
  /** Observed values: "inbound" | "outbound" — kept as string since no other values are confirmed. */
  direction: string;
  /** Observed value: "active" — kept as string since no other values (e.g. a disabled/retired agent) have been observed live. */
  status: string;
  description: string;
  language: string;
  is_default: boolean;
  expected_input_fields: AgentInputFieldDto[];
  expected_outcomes: AgentOutcomeDto[];
  output_fields: AgentOutputFieldDto[];
}

export interface AgentsResponseDto {
  success: boolean;
  default_agent_id: string;
  agents: AgentSummaryDto[];
}
