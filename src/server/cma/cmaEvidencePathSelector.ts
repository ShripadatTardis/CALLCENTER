// Session 6 — evaluation-path selection (brief Part B §2-§5), as a pure,
// reusable decision function. Every reference/future interaction-fact
// evaluator should go through this instead of re-deriving its own
// fast/verify/derive logic ad hoc.

import type { CmaEvidenceOrigin } from './cmaEvidenceTypes.js';

export type CmaEvidencePath =
  | { kind: 'fast_path' }
  | { kind: 'verification_required'; reason: string }
  | { kind: 'derivation_deterministic' }
  | { kind: 'unsupported_inference'; reason: string }; // brief §6: never infer a fact the evidence genuinely can't support, even via LLM

export interface CmaEvidenceAssessmentInput {
  /** Does an existing API/DB finding exist for this fact at all? */
  apiFindingPresent: boolean;
  /** Where that finding (if present) came from. */
  apiFindingOrigin?: CmaEvidenceOrigin;
  /** Is the present finding internally consistent with other known structured facts (e.g. escalation_trigger present but outcome != 'escalated')? Undefined when there's nothing to check it against. */
  apiFindingConsistentWithOtherFacts?: boolean;
  /** Can this fact be fully computed from stored structured data alone (no conversational interpretation needed)? */
  deterministicallyDerivable: boolean;
  /** Is there transcript/context evidence available to support a targeted LLM verification if one is needed? */
  verificationContextAvailable: boolean;
  /** Does genuinely resolving this fact require understanding free-form conversational content (as opposed to a structured field/aggregate)? */
  requiresConversationalInterpretation: boolean;
}

/**
 * Selects exactly one evaluation path per the brief's own sequence
 * (API analysis + stored evidence -> assessment -> fast/verify/derive).
 * Deliberately conservative: an inconsistency between two structured
 * facts (e.g. a requested-but-not-executed escalation) is NEVER
 * silently resolved by picking one side — it always routes to
 * verification (if context exists) or unsupported_inference (if it
 * doesn't), never fast_path.
 */
export function selectCmaEvidencePath(input: CmaEvidenceAssessmentInput): CmaEvidencePath {
  if (input.apiFindingPresent && input.apiFindingConsistentWithOtherFacts !== false) {
    return { kind: 'fast_path' };
  }

  if (input.apiFindingPresent && input.apiFindingConsistentWithOtherFacts === false) {
    return input.verificationContextAvailable
      ? { kind: 'verification_required', reason: 'api_finding_contradicts_other_structured_facts' }
      : { kind: 'unsupported_inference', reason: 'contradictory_evidence_with_no_verification_context' };
  }

  if (!input.apiFindingPresent && input.deterministicallyDerivable && !input.requiresConversationalInterpretation) {
    return { kind: 'derivation_deterministic' };
  }

  if (!input.apiFindingPresent && input.requiresConversationalInterpretation) {
    return input.verificationContextAvailable
      ? { kind: 'verification_required', reason: 'no_structured_finding_requires_conversational_interpretation' }
      : { kind: 'unsupported_inference', reason: 'no_structured_finding_and_no_verification_context' };
  }

  return { kind: 'unsupported_inference', reason: 'no_evidence_path_available' };
}
