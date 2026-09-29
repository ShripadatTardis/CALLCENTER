/**
 * Session R5 — the canonical InteractionEvent contract. ONE authoritative
 * definition, shared by frontend and backend (no duplicate copies) —
 * mirrors the same convention already established for src/types/ratio.ts.
 *
 * Principle (locked, do not violate in a future session): FACTS = what
 * happened. RATIOS = what it means. This file and its backing table
 * store facts only — never a calculated rate/percentage/aggregate.
 *
 * Domain-neutral by design: no banking-specific column exists anywhere
 * here. Anything provider/tool/domain-specific belongs in `metadata`.
 */

/**
 * Controlled taxonomy (§4) — deliberately small. Collapses the 11
 * candidate concepts the spec named into fewer event TYPES, each
 * carrying a uniform `success` field, rather than one event type per
 * outcome (e.g. `authentication_attempt`/`authentication_success`/
 * `authentication_failure` become ONE `authentication` type + `success:
 * boolean | null`, per the spec's own worked example). Extending this
 * union is additive and safe — event rows are typed `text` at the
 * database layer specifically so a new type never requires a migration,
 * only a contract/documentation update.
 */
export type InteractionEventType =
  | 'intent_detected'
  | 'authentication'
  | 'knowledge_retrieval'
  | 'tool_call'
  | 'fallback'
  | 'conversation_recovery'
  | 'guardrail_intervention'
  | 'escalation'
  | 'human_transfer';

/**
 * §12 — success/failure semantics. `null` means "not applicable to this
 * event type" (e.g. `escalation`, `guardrail_intervention` — the event
 * occurring IS the fact, there is no separate pass/fail state), never
 * "unknown" or "failed" by default. A future ratio calculator must
 * treat `null` as excluded-from-eligibility, exactly the same
 * null-vs-false discipline already established for Ratio calculations
 * (src/server/analytics/ratioMath.ts's 0-vs-null rule) — never coerced
 * to `false`.
 */
export type InteractionEventSuccess = boolean | null;

export interface InteractionEvent {
  /** Stable external identity for this exact event — see "Idempotency" in the session report for how this is sourced/enforced. */
  eventId: string;
  /**
   * The SAME external interaction identity already used throughout this
   * product (Call Centre's own call_id for voice, the chat session's
   * upstream identifier for chat) — matches
   * call_center.customer_interactions.interaction_id exactly (a `text`
   * external identity, deliberately NOT a hard foreign key to that
   * table's own uuid `id`, since events may arrive before or during an
   * interaction that hasn't been materialized into customer_interactions
   * yet — see the session report's storage design note).
   */
  interactionId: string;
  /** Occurrence time — when the event actually happened, per the producing system. NEVER ingestion/insert time. Ordering/analysis must sort by this field, not by arrival order (see "Event ordering" in the session report). */
  eventTime: string;
  eventType: InteractionEventType;
  /** Optional human-readable operation label where useful beyond the type alone (e.g. "balance_lookup" for a tool_call whose tool_name says the same thing more specifically — usually redundant with tool_name and left undefined). */
  eventName?: string;
  success: InteractionEventSuccess;
  errorCode?: string;
  errorMessage?: string;
  /** Duration of the operation THIS event represents — never derived from unrelated timestamps. Undefined when the producing system can't supply it. */
  latencyMs?: number;
  /** Only meaningful for tool_call (and optionally knowledge_retrieval) — the specific tool/function/API invoked. */
  toolName?: string;
  /** The AI provider/vendor responsible for this event, where relevant (e.g. which LLM/retrieval service) — optional, never required. */
  provider?: string;
  /** The specific model identifier, where relevant — optional, never required. */
  model?: string;
  /**
   * Extensible, provider/tool-specific payload. Never a substitute for a
   * first-class field a future ratio actually needs to filter/group by
   * (see the session report's "Metadata policy") and never a full
   * transcript body (§15 privacy — existing transcript/session storage
   * remains authoritative for conversation evidence).
   */
  metadata?: Record<string, unknown>;
  /** Ingestion time — when this event was recorded by Call Centre, distinct from eventTime. Set server-side, never supplied by the producer. */
  ingestedAt?: string;
}

/** The shape a producer submits — eventId/interactionId/eventTime/eventType are required; everything else is optional exactly as on InteractionEvent. ingestedAt is never accepted from a producer — always set server-side. */
export type NewInteractionEvent = Omit<InteractionEvent, 'ingestedAt'>;

export interface InteractionEventQueryFilter {
  interactionId?: string;
  eventType?: InteractionEventType;
  toolName?: string;
  success?: boolean;
  eventTimeFrom?: string;
  eventTimeTo?: string;
}

/** A validation failure for one submitted event — never silently dropped, always reported (see "Ingestion contract" — reject malformed events, don't manufacture missing fields). */
export interface InteractionEventValidationError {
  field: string;
  reason: string;
}

export interface InteractionEventValidationResult {
  valid: boolean;
  errors: InteractionEventValidationError[];
}
