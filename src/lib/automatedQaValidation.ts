import { QA_PARAMETER_CODES, QA_PARAMETERS, requiresReasonCode, isValidReasonCode, isValidResultValue, type QaParameterCode, type QaResultValue } from './qaParameters.js';

/**
 * Session 16.3 — evidence validation (brief §10). Every automated
 * observation is validated BEFORE persistence; an invalid observation is
 * rejected (with a reason, for diagnostics) and never silently repaired
 * — a fabricated turn id must never be "corrected" into a real one.
 */

export interface RawAutomatedObservation {
  parameter_code?: unknown;
  primary_turn_id?: unknown;
  value?: unknown;
  reason_code?: unknown;
  evidence_turn_ids?: unknown;
  explanation?: unknown;
}

export interface AutomatedQaObservationInput {
  parameterCode: QaParameterCode;
  value: QaResultValue;
  primaryTurnId: string;
  evidenceTurnIds: string[];
  reasonCode: string | null;
  explanation: string | null;
}

export interface RejectedObservation {
  raw: unknown;
  reason: string;
}

export interface ValidationResult {
  accepted: AutomatedQaObservationInput[];
  rejected: RejectedObservation[];
}

function isQaParameterCode(x: unknown): x is QaParameterCode {
  return typeof x === 'string' && (QA_PARAMETER_CODES as string[]).includes(x);
}

/**
 * Validates one window's raw `observations` array against the canonical
 * vocabulary and that window's own evaluated turn ids. Duplicate or
 * contradictory observations for the same (parameter_code,
 * primary_turn_id) opportunity are rejected (brief §10: "No contradictory
 * values for the same measurement opportunity. No duplicated measurement
 * opportunities.") — the FIRST one accepted wins, the rest are rejected
 * with a diagnostic reason, never silently merged.
 */
export function validateAutomatedObservations(
  raw: unknown,
  validTurnIds: ReadonlySet<string>,
): ValidationResult {
  const accepted: AutomatedQaObservationInput[] = [];
  const rejected: RejectedObservation[] = [];
  const seenOpportunities = new Set<string>();

  if (!Array.isArray(raw)) {
    return { accepted, rejected: [{ raw, reason: 'observations is not an array' }] };
  }

  for (const entry of raw as RawAutomatedObservation[]) {
    const parameterCode = entry?.parameter_code;
    const primaryTurnId = entry?.primary_turn_id;
    const value = entry?.value;
    const reasonCode = entry?.reason_code;
    const evidenceTurnIdsRaw = entry?.evidence_turn_ids;
    const explanation = entry?.explanation;

    if (!isQaParameterCode(parameterCode)) {
      rejected.push({ raw: entry, reason: `unknown parameter_code: ${String(parameterCode)}` });
      continue;
    }
    if (typeof value !== 'string' || !isValidResultValue(parameterCode, value)) {
      rejected.push({ raw: entry, reason: `value "${String(value)}" is not allowed for ${parameterCode}` });
      continue;
    }
    if (typeof primaryTurnId !== 'string' || !validTurnIds.has(primaryTurnId)) {
      rejected.push({ raw: entry, reason: `primary_turn_id "${String(primaryTurnId)}" does not exist in the evaluated transcript snapshot` });
      continue;
    }
    const evidenceTurnIds = Array.isArray(evidenceTurnIdsRaw)
      ? evidenceTurnIdsRaw.filter((t): t is string => typeof t === 'string')
      : [];
    const fabricatedEvidence = evidenceTurnIds.find((t) => !validTurnIds.has(t));
    if (fabricatedEvidence) {
      rejected.push({ raw: entry, reason: `evidence_turn_ids references "${fabricatedEvidence}", which does not exist in the evaluated transcript snapshot` });
      continue;
    }
    const needsReason = requiresReasonCode(parameterCode, value as QaResultValue);
    // CANNOT_VERIFY on response_grounding_rate is a problem value by
    // construction (QA_PARAMETERS.problemValues) but is explicitly NOT a
    // quality failure (brief §6/§7) — it still requires a reason_code
    // from the parameter's own vocabulary like any other problem value,
    // since "CANNOT_VERIFY_SOURCE" is itself one of response_grounding_rate's
    // reason codes; the "not a failure" distinction is enforced downstream
    // by the ratio calculation (qaRatios.ts), not by relaxing validation here.
    if (needsReason) {
      if (typeof reasonCode !== 'string' || !isValidReasonCode(parameterCode, reasonCode)) {
        rejected.push({ raw: entry, reason: `reason_code "${String(reasonCode)}" is required and must belong to ${parameterCode}'s vocabulary for value "${value}"` });
        continue;
      }
    }

    const opportunityKey = `${parameterCode}:${primaryTurnId}`;
    if (seenOpportunities.has(opportunityKey)) {
      rejected.push({ raw: entry, reason: `duplicate/contradictory observation for the same opportunity (${opportunityKey}) — first accepted observation wins` });
      continue;
    }
    seenOpportunities.add(opportunityKey);

    accepted.push({
      parameterCode,
      value: value as QaResultValue,
      primaryTurnId,
      evidenceTurnIds,
      reasonCode: needsReason ? (reasonCode as string) : null,
      explanation: typeof explanation === 'string' ? explanation.slice(0, 300) : null,
    });
  }

  return { accepted, rejected };
}

export interface RawUnassessableParameter {
  parameter_code?: unknown;
  reason?: unknown;
}

export interface UnassessableParameter {
  parameterCode: QaParameterCode;
  reason: string;
}

export function validateUnassessableParameters(raw: unknown): UnassessableParameter[] {
  if (!Array.isArray(raw)) return [];
  const out: UnassessableParameter[] = [];
  for (const entry of raw as RawUnassessableParameter[]) {
    if (isQaParameterCode(entry?.parameter_code) && typeof entry?.reason === 'string') {
      out.push({ parameterCode: entry.parameter_code, reason: entry.reason.slice(0, 200) });
    }
  }
  return out;
}

/** Sanity check used by the orchestrator before touching persistence: does this reference the real parameter dictionary, not a parallel copy? Prevents silent drift if qaParameters.ts is ever restructured. */
export function allCanonicalParameterCodesCovered(codes: readonly string[]): boolean {
  return QA_PARAMETER_CODES.every((c) => codes.includes(c)) && Object.keys(QA_PARAMETERS).length === QA_PARAMETER_CODES.length;
}
