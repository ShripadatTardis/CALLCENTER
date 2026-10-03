import type { AgentInputField, CallAgentContract } from '@/types/campaign';

/**
 * Session 13.3 — pure, dependency-free helpers shared by every direct
 * contract-value-entry consumer (currently: Initiate Call; Chat Console
 * does not use these — see docs/SESSION_13_3_AGENT_DETAIL_CONTRACT_EXPOSURE.md
 * §"Chat API capability finding"). Deliberately mirrors
 * src/server/campaigns/triggerCallPayload.ts's exact declared-field
 * discipline (never send a field the contract doesn't declare; omit
 * `agent_inputs` entirely rather than `{}` when nothing applies) so the
 * direct-call path and the Campaign Runner agree on what `agent_inputs`
 * means — not a second, incompatible interpretation of the same
 * Session 12.4 contract.
 */

export type AgentInputValues = Record<string, unknown>;

/** No validation rule is invented beyond "required means non-empty" — the contract itself declares no pattern/range fields today (see src/types/api/agents.ts). */
export function isFieldSatisfied(field: AgentInputField, value: unknown): boolean {
  if (!field.required) return true;
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function validateAgentContractInputs(
  contract: CallAgentContract | null,
  values: AgentInputValues,
): { isValid: boolean; missingRequiredFieldCodes: string[] } {
  const fields = contract?.expectedInputFields ?? [];
  const missingRequiredFieldCodes = fields.filter((f) => !isFieldSatisfied(f, values[f.fieldCode])).map((f) => f.fieldCode);
  return { isValid: missingRequiredFieldCodes.length === 0, missingRequiredFieldCodes };
}

/**
 * Builds the exact `agent_inputs` object the Trigger Call request should
 * carry: only declared field codes, only non-empty values, `undefined`
 * (never `{}`) when the contract declares zero inputs or nothing
 * resolved — the same "preserves legacy/default-agent behavior" rule
 * triggerCallPayload.ts already documents for the Campaign Runner path.
 */
export function buildDeclaredAgentInputs(
  contract: CallAgentContract | null,
  values: AgentInputValues,
): Record<string, unknown> | undefined {
  const declaredFieldCodes = new Set((contract?.expectedInputFields ?? []).map((f) => f.fieldCode));
  if (declaredFieldCodes.size === 0) return undefined;
  const out: Record<string, unknown> = {};
  let hasAny = false;
  for (const [code, value] of Object.entries(values)) {
    if (!declaredFieldCodes.has(code)) continue; // never send an undeclared field
    if (value === undefined || value === null || value === '') continue; // an empty optional value is "not provided", not an empty string sent to the agent
    out[code] = value;
    hasAny = true;
  }
  return hasAny ? out : undefined;
}

/**
 * String-input-event -> typed-value coercion for the generic data types
 * the current live contract actually declares (string/decimal/integer/
 * date) — see src/types/api/agents.ts's live-confirmed set. Any other/
 * future data_type falls through to the raw string (fallback: §3's
 * "do not assume this is the complete type set" — render, never drop,
 * an unrecognized type as free text rather than crashing or hiding it).
 */
export function coerceInputValue(field: AgentInputField, raw: string): unknown {
  if (raw === '') return '';
  switch (field.dataType) {
    case 'integer': {
      const n = Number(raw);
      return Number.isInteger(n) ? n : raw;
    }
    case 'decimal': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    case 'boolean':
      return raw === 'true';
    default:
      return raw;
  }
}

/** Only reset/retain decision this session makes: a full reset on agent change (§10 — "prefer correctness over clever value retention"), never a field-by-field heuristic carry-over. */
export function resetInputsForNewContract(): AgentInputValues {
  return {};
}
