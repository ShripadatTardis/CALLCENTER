import type { AgentOutcomeDefinition, AgentOutputField, CallAgentContract } from '@/types/campaign';

/**
 * Session 12.5 §5/§6/§8 — pure, deterministic classification of a
 * reconciled target's agent-specific actual outcome against the
 * campaign's own immutable agent-contract snapshot. Never reads
 * transcript, summary, generic callOutcome, intent, sentiment, or FCR —
 * only the three raw backend fields the authoritatively matched call
 * already carried (actualOutcomeCode, actualOutcomeName,
 * structuredOutputs) and the contract captured at campaign-creation
 * time. This is intentionally display logic only; it never writes
 * anything back and never influences reconciliation or campaign
 * success-rate statistics.
 */

export type ActualOutcomeAvailability =
  | 'unavailable' // actualOutcomeCode is null — historical/legacy call, or a call with no business outcome yet
  | 'known' // actualOutcomeCode matches a code the captured contract declares
  | 'unrecognized'; // actualOutcomeCode is present but the captured contract doesn't declare it (contract drift, or no contract captured)

export interface ClassifiedActualOutcome {
  availability: ActualOutcomeAvailability;
  code: string | null;
  /** Prefers the backend's own actualOutcomeName; falls back to the contract's declared displayName when the backend name is missing but the code is recognized. */
  displayName: string | null;
  definition: AgentOutcomeDefinition | null;
}

export function classifyActualOutcome(
  contract: CallAgentContract | null,
  actualOutcomeCode: string | null,
  actualOutcomeName: string | null,
): ClassifiedActualOutcome {
  if (!actualOutcomeCode) {
    return { availability: 'unavailable', code: null, displayName: null, definition: null };
  }
  const definition = contract?.expectedOutcomes.find((o) => o.outcomeCode === actualOutcomeCode) ?? null;
  if (!definition) {
    return { availability: 'unrecognized', code: actualOutcomeCode, displayName: actualOutcomeName ?? null, definition: null };
  }
  return { availability: 'known', code: actualOutcomeCode, displayName: actualOutcomeName ?? definition.displayName, definition };
}

export interface ClassifiedOutputField {
  fieldCode: string;
  /** Contract displayName when recognized; a readable fallback built from the field code otherwise (e.g. "promised_payment_date" -> "Promised payment date"). */
  displayName: string;
  value: unknown;
  known: boolean;
  definition: AgentOutputField | null;
}

function fallbackDisplayName(fieldCode: string): string {
  const spaced = fieldCode.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Preserves every raw key the backend returned, in the order the
 * contract declares them first (for a stable, readable render order),
 * followed by any unrecognized keys the backend returned that the
 * captured contract doesn't declare — never silently dropped.
 */
export function classifyStructuredOutputs(
  contract: CallAgentContract | null,
  structuredOutputs: Record<string, unknown> | null,
): ClassifiedOutputField[] {
  if (!structuredOutputs) return [];

  const declared = contract?.outputFields ?? [];
  const remainingKeys = new Set(Object.keys(structuredOutputs));
  const result: ClassifiedOutputField[] = [];

  for (const field of declared) {
    if (!remainingKeys.has(field.fieldCode)) continue;
    result.push({
      fieldCode: field.fieldCode,
      displayName: field.displayName,
      value: structuredOutputs[field.fieldCode],
      known: true,
      definition: field,
    });
    remainingKeys.delete(field.fieldCode);
  }

  for (const fieldCode of remainingKeys) {
    result.push({
      fieldCode,
      displayName: fallbackDisplayName(fieldCode),
      value: structuredOutputs[fieldCode],
      known: false,
      definition: null,
    });
  }

  return result;
}

/** Renders a structured-output value readably without exposing raw JSON as the primary UX (§8) — booleans/null get a plain-English form, everything else falls back to a safe string/JSON representation. */
export function formatOutputValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
