import { QA_PARAMETERS, type QaParameterCode, type QaResultValue } from './qaParameters';
import type { QaAutoFinding } from './qaApplicability';

/**
 * Session 16.1.1 — pure logic for the redesigned exception-based Flag
 * Issue editor (callCprompt 96 16.1.1). Opening "Flag Issue" must show
 * only "what is wrong with this turn", never a full nine-parameter
 * questionnaire — these functions are the decision logic the component
 * renders, kept pure/testable per this codebase's convention.
 */

export interface QaExceptionFinding {
  parameterCode: QaParameterCode;
  value: QaResultValue;
  reasonCode: string | null;
  evidenceTurnIds: string[];
  note: string | null;
}

/**
 * The value a parameter takes when the reviewer selects it as an
 * exception, where this is unambiguous (§6: "Do not make the reviewer
 * redundantly state Flag → Context Continuity → FAIL when FAIL is
 * already implied"). Returns null when the parameter genuinely has more
 * than one meaningful exception state (response_grounding_rate: both
 * NOT_GROUNDED and CANNOT_VERIFY are "problem" values in the ratio
 * sense, but mean different things to a reviewer) — the UI must ask in
 * that one case only.
 */
export function inferredExceptionValue(code: QaParameterCode): QaResultValue | null {
  const problemValues = QA_PARAMETERS[code].problemValues;
  return problemValues.length === 1 ? problemValues[0] : null;
}

/**
 * §7 — Response Grounding's CANNOT_VERIFY means "supporting evidence
 * unavailable to check", not a quality failure. It still structurally
 * lives in `problemValues` (so the ratio calculator correctly excludes
 * it from the denominator, qaRatios.ts), but the UI/turn-status layer
 * must not present it as adverse. Every other problem value for every
 * other parameter IS adverse.
 */
export function isAdverseValue(code: QaParameterCode, value: QaResultValue): boolean {
  if (code === 'response_grounding_rate' && value === 'CANNOT_VERIFY') return false;
  return QA_PARAMETERS[code].problemValues.includes(value);
}

/** A finding whose value is the parameter's own clean/pass value is not an exception — used to decide whether a previously-saved finding should re-open as a selected chip when editing (§13). */
export function isExceptionFinding(code: QaParameterCode, value: QaResultValue): boolean {
  return value !== QA_PARAMETERS[code].cleanValue;
}

/**
 * §9 — "The current Agent turn is already the primary turn and should
 * not normally require the reviewer to re-select it as evidence."
 * Evidence choices are every other turn in the conversation.
 */
export function evidenceChoices<T extends { turnId: string }>(allTurns: T[], primaryTurnId: string): T[] {
  return allTurns.filter((t) => t.turnId !== primaryTurnId);
}

/**
 * §3/§6 — "Unreviewed ≠ PASS" stays true even though Flag Issue's UI no
 * longer shows a form for every Tier-1 parameter: any Tier-1 parameter
 * the reviewer did NOT explicitly touch in this Flag session still gets
 * its structural auto-clean finding merged in (the same one Good+Next
 * always records), so the measurement contract's denominators are
 * exactly as complete as before — the UX hides the complexity, the
 * underlying persisted data does not get thinner. A Tier-1 parameter
 * the reviewer DID explicitly select keeps the reviewer's own value,
 * never silently overwritten by the auto-clean one.
 */
export function mergeFlagFindings(explicit: QaExceptionFinding[], tier1Auto: QaAutoFinding[]): QaExceptionFinding[] {
  const explicitCodes = new Set(explicit.map((f) => f.parameterCode));
  const autoFindings: QaExceptionFinding[] = tier1Auto
    .filter((f) => !explicitCodes.has(f.parameterCode))
    .map((f) => ({ parameterCode: f.parameterCode, value: f.value, reasonCode: null, evidenceTurnIds: [], note: null }));
  return [...explicit, ...autoFindings];
}

/**
 * The turn_reviews status a Flag Issue save should persist, derived from
 * only the reviewer's OWN explicit selections (never the merged-in
 * Tier-1 auto-clean findings, which can never make a turn "flagged" on
 * their own) and never adverse-only-because-CANNOT_VERIFY (§7).
 */
export function turnStatusForExplicitFindings(explicit: QaExceptionFinding[]): 'good' | 'flagged' {
  return explicit.some((f) => isAdverseValue(f.parameterCode, f.value)) ? 'flagged' : 'good';
}

/** SNAKE_CASE reason code -> "Sentence case" reviewer-facing label (§5: "Agent repeated answer" for AGENT_REPEATED_ANSWER). Generic, no per-code lookup table — the canonical codes are already named clearly enough for this transform to read naturally. */
export function humanizeReasonCode(code: string): string {
  if (code === 'OTHER') return 'Other';
  const words = code.toLowerCase().split('_');
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + ' ' + words.slice(1).join(' ');
}
