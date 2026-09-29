import type {
  InteractionEventType,
  NewInteractionEvent,
  InteractionEventValidationResult,
} from '../../types/interactionEvent.js';

/**
 * Session R5 — pure, deterministic validation for the ingestion contract
 * (§9: "If an HTTP ingestion endpoint is implemented, validate: required
 * fields, event type, interaction ID, timestamp, latency, success/
 * status, metadata shape. Reject malformed events. Do not silently
 * manufacture missing timestamps or interaction IDs.").
 *
 * This is the ONE place that decides whether a submitted event is
 * acceptable — reused by whatever ingestion mechanism R6 eventually
 * builds (HTTP endpoint or internal service call), never duplicated.
 */

const EVENT_TYPES: readonly InteractionEventType[] = [
  'intent_detected',
  'authentication',
  'knowledge_retrieval',
  'tool_call',
  'fallback',
  'conversation_recovery',
  'guardrail_intervention',
  'escalation',
  'human_transfer',
];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidIsoTimestamp(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

export function validateInteractionEvent(input: unknown): InteractionEventValidationResult {
  const errors: InteractionEventValidationResult['errors'] = [];

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: [{ field: '(root)', reason: 'Event must be a JSON object.' }] };
  }
  const e = input as Partial<NewInteractionEvent> & Record<string, unknown>;

  if (!isNonEmptyString(e.eventId)) {
    errors.push({ field: 'eventId', reason: 'Required, non-empty string. Never manufactured server-side — a missing eventId is rejected, not generated.' });
  }
  if (!isNonEmptyString(e.interactionId)) {
    errors.push({ field: 'interactionId', reason: 'Required, non-empty string. Never manufactured — a missing interactionId is rejected, not inferred.' });
  }
  if (!isValidIsoTimestamp(e.eventTime)) {
    errors.push({ field: 'eventTime', reason: 'Required, must be a parseable timestamp representing when the event actually occurred (not ingestion time).' });
  }
  if (!isNonEmptyString(e.eventType) || !EVENT_TYPES.includes(e.eventType as InteractionEventType)) {
    errors.push({ field: 'eventType', reason: `Required, must be one of: ${EVENT_TYPES.join(', ')}.` });
  }

  if (e.success !== undefined && e.success !== null && typeof e.success !== 'boolean') {
    errors.push({ field: 'success', reason: 'Must be boolean or null when present.' });
  }
  if (e.latencyMs !== undefined) {
    if (typeof e.latencyMs !== 'number' || !Number.isFinite(e.latencyMs) || e.latencyMs < 0) {
      errors.push({ field: 'latencyMs', reason: 'Must be a non-negative finite number when present — never fabricated from unrelated timestamps.' });
    }
  }
  if (e.toolName !== undefined && !isNonEmptyString(e.toolName)) {
    errors.push({ field: 'toolName', reason: 'Must be a non-empty string when present.' });
  }
  if (e.errorCode !== undefined && !isNonEmptyString(e.errorCode)) {
    errors.push({ field: 'errorCode', reason: 'Must be a non-empty string when present.' });
  }
  if (e.metadata !== undefined) {
    if (typeof e.metadata !== 'object' || e.metadata === null || Array.isArray(e.metadata)) {
      errors.push({ field: 'metadata', reason: 'Must be a plain JSON object when present.' });
    } else {
      // Privacy guard (§15) — a defensive check, not exhaustive PII
      // detection: reject the most obvious accidental leaks of exactly
      // the field names §15 names as forbidden, rather than silently
      // accepting them into a supposedly domain-neutral telemetry
      // payload.
      const forbiddenKeys = ['phone_number', 'phoneNumber', 'account_number', 'accountNumber', 'customer_name', 'customerName', 'password', 'credential', 'ssn', 'transcript', 'raw_transcript'];
      const foundForbidden = Object.keys(e.metadata as Record<string, unknown>).filter((k) => forbiddenKeys.includes(k));
      if (foundForbidden.length > 0) {
        errors.push({ field: 'metadata', reason: `metadata must not carry PII/secret/transcript-shaped keys: ${foundForbidden.join(', ')}.` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateInteractionEventBatch(inputs: unknown[]): InteractionEventValidationResult[] {
  return inputs.map(validateInteractionEvent);
}
