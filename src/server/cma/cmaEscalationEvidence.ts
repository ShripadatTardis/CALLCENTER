// Session 6 — reference implementation (brief Part E §14) of the
// API-informed, selectively LLM-assisted evaluation flow, for exactly
// ONE fact: `escalation_reason` on voice interactions.
//
// Chosen per the brief's own selection criteria:
// - Real, already-persisted API evidence exists (escalation_trigger,
//   non-null on 38/761 real production rows — confirmed this session,
//   not assumed).
// - It directly demonstrates the brief's explicit warning (§6): "Do not
//   confuse a requested escalation with an executed transfer" — a call
//   can carry a non-null escalation_trigger without outcome='escalated'
//   (escalation requested/attempted but not actually executed), which
//   this evaluator treats as a genuine contradiction, never silently
//   resolved.
// - Demonstrates fast-path reuse (trigger present + consistent),
//   verification (trigger missing, transcript available),
//   unsupported-inference refusal (trigger missing, no transcript), and
//   idempotent/versioned re-evaluation — the full brief §15 test list.
//
// This module does NOT change any existing CMA calculation, does NOT
// activate CANON-ESC-RATE (still pending_decision), and does NOT call
// a real LLM by default in any test — `verify` is injected by the
// caller (production code wires it to callGenericLlm; tests inject a
// deterministic mock).

import {
  type CmaInteractionEvidenceFinding,
  type CmaEvaluationMethod,
  computeEvidenceEvaluationId,
} from './cmaEvidenceTypes.js';
import { selectCmaEvidencePath } from './cmaEvidencePathSelector.js';
import { computeVoiceTurnId, type VoiceTurnLike } from '../../lib/qaTurnIdentity.js';

export const ESCALATION_REASON_FACT_ID = 'escalation_reason';
export const ESCALATION_REASON_EVALUATOR_VERSION_DETERMINISTIC = 'deterministic-v1';

export interface EscalationReasonInteractionInput {
  interactionId: string;
  outcome: string | null;
  escalationTrigger: string | null;
  /** Only supplied when a verification call may be needed; omitted entirely when no transcript was fetched (brief §15: "missing transcript"). */
  transcript?: VoiceTurnLike[];
  /** The prior finding this re-evaluation should supersede, if any (brief §15: "source updates and evaluation versions"). */
  priorEvaluationId?: string;
}

export interface EscalationReasonVerificationResult {
  /** A short category, or 'unresolved' if the model itself could not determine one — never fabricated. */
  reasonCategory: string;
  confidence: number;
  /** Turn indices (0-based) the model cites as evidence — validated against the real transcript before being trusted. */
  evidenceTurnIndices: number[];
}

export type EscalationReasonVerifier = (
  interactionId: string,
  transcript: VoiceTurnLike[],
) => Promise<EscalationReasonVerificationResult | null>; // null = the verifier itself failed/errored

const KNOWN_REASON_CATEGORIES = new Set([
  'customer_requested_human',
  'agent_unable_to_resolve',
  'policy_required_escalation',
  'technical_failure',
  'unresolved',
]);

function normalizedInputsJson(input: EscalationReasonInteractionInput): string {
  return JSON.stringify({ outcome: input.outcome, escalationTrigger: input.escalationTrigger });
}

function makeFinding(
  input: EscalationReasonInteractionInput,
  partial: Omit<CmaInteractionEvidenceFinding, 'interactionId' | 'interactionType' | 'factId' | 'evaluatedAt' | 'supersedesEvaluationId'>,
): CmaInteractionEvidenceFinding {
  return {
    interactionId: input.interactionId,
    interactionType: 'call',
    factId: ESCALATION_REASON_FACT_ID,
    evaluatedAt: new Date().toISOString(),
    supersedesEvaluationId: input.priorEvaluationId ?? null,
    ...partial,
  };
}

/**
 * Evaluates `escalation_reason` for one voice interaction, following
 * the brief's fast-path/verification/derivation sequence. Never calls
 * `verify` unless the evidence genuinely requires it (brief §9: "no
 * requirement to invoke an LLM where structured evidence already
 * establishes the fact").
 */
export async function evaluateEscalationReasonEvidence(
  input: EscalationReasonInteractionInput,
  verify: EscalationReasonVerifier,
): Promise<CmaInteractionEvidenceFinding> {
  const escalationExecuted = input.outcome === 'escalated';
  const escalationRequested = Boolean(input.escalationTrigger && input.escalationTrigger.trim().length > 0);

  // Not eligible at all: no escalation was requested or executed, so
  // "escalation reason" has nothing to explain. Never fabricated as 0
  // or an empty string — simply excluded from the population, same
  // honesty rule every CMA measure already follows for ineligible rows.
  if (!escalationExecuted && !escalationRequested) {
    return makeFinding(input, {
      eligibility: 'ineligible',
      value: null,
      sourceObservation: null,
      evidenceRefs: [],
      validationStatus: 'validated',
      confidence: 1,
      evaluationMethod: 'derivation_deterministic',
      evaluatorVersion: ESCALATION_REASON_EVALUATOR_VERSION_DETERMINISTIC,
      note: null,
    });
  }

  const path = selectCmaEvidencePath({
    apiFindingPresent: escalationRequested,
    apiFindingOrigin: 'voiceforce_api',
    apiFindingConsistentWithOtherFacts: escalationRequested ? escalationExecuted : undefined,
    deterministicallyDerivable: false, // escalation reason is never computable from outcome alone
    verificationContextAvailable: Boolean(input.transcript && input.transcript.length > 0),
    requiresConversationalInterpretation: true,
  });

  if (path.kind === 'fast_path') {
    // escalationRequested && escalationExecuted — the API's own
    // structured field is accepted without a new LLM call.
    return makeFinding(input, {
      eligibility: 'eligible',
      value: input.escalationTrigger,
      sourceObservation: { origin: 'voiceforce_api', raw: input.escalationTrigger },
      evidenceRefs: ['escalation_trigger'],
      validationStatus: 'validated',
      confidence: 1,
      evaluationMethod: 'fast_path',
      evaluatorVersion: ESCALATION_REASON_EVALUATOR_VERSION_DETERMINISTIC,
      note: null,
    });
  }

  if (path.kind === 'unsupported_inference') {
    // Either: (a) a contradictory requested-but-not-executed escalation
    // with no transcript to resolve it, or (b) outcome='escalated' with
    // no trigger and no transcript. Both are reported honestly as
    // unresolved — never guessed, never defaulted to either side.
    const note =
      path.reason === 'contradictory_evidence_with_no_verification_context'
        ? 'escalation_trigger present but outcome != escalated (requested, not confirmed executed) — no transcript available to resolve which is correct'
        : 'outcome=escalated with no escalation_trigger and no transcript available for verification';
    return makeFinding(input, {
      eligibility: escalationRequested && !escalationExecuted ? 'indeterminate' : 'eligible',
      value: null,
      sourceObservation: escalationRequested ? { origin: 'voiceforce_api', raw: input.escalationTrigger } : null,
      evidenceRefs: [],
      validationStatus: 'insufficient',
      confidence: null,
      evaluationMethod: 'unresolved',
      evaluatorVersion: ESCALATION_REASON_EVALUATOR_VERSION_DETERMINISTIC,
      note,
    });
  }

  // path.kind === 'verification_required' — either a genuine
  // contradiction (trigger present, outcome != escalated) or a missing
  // trigger, both with a transcript available. A focused, structured
  // question only — never "analyse this conversation and provide all
  // metrics" (brief §4).
  const verification = await verify(input.interactionId, input.transcript!);
  const turnIds = computeVoiceTurnId(input.interactionId, input.transcript!);

  if (!verification || !KNOWN_REASON_CATEGORIES.has(verification.reasonCategory) || verification.reasonCategory === 'unresolved') {
    return makeFinding(input, {
      eligibility: 'indeterminate',
      value: null,
      sourceObservation: escalationRequested ? { origin: 'voiceforce_api', raw: input.escalationTrigger } : null,
      evidenceRefs: [],
      validationStatus: 'unresolved',
      confidence: verification?.confidence ?? null,
      evaluationMethod: 'verification_llm' as CmaEvaluationMethod,
      evaluatorVersion: 'targeted-verification-v1',
      note: verification ? 'verifier returned an unrecognized or unresolved category' : 'verifier call failed or returned no result',
    });
  }

  // Validate cited evidence actually exists in the real transcript —
  // never trust a model-cited turn reference blindly.
  const validIndices = verification.evidenceTurnIndices.filter((i) => i >= 0 && i < turnIds.length);
  if (validIndices.length === 0) {
    return makeFinding(input, {
      eligibility: 'indeterminate',
      value: null,
      sourceObservation: escalationRequested ? { origin: 'voiceforce_api', raw: input.escalationTrigger } : null,
      evidenceRefs: [],
      validationStatus: 'unresolved',
      confidence: verification.confidence,
      evaluationMethod: 'verification_llm',
      evaluatorVersion: 'targeted-verification-v1',
      note: 'verifier cited no valid transcript turns for its finding — rejected rather than trusted blindly',
    });
  }

  const contradicted = escalationRequested && !escalationExecuted;
  return makeFinding(input, {
    eligibility: 'eligible',
    value: verification.reasonCategory,
    sourceObservation: { origin: 'derived', raw: verification },
    evidenceRefs: validIndices.map((i) => turnIds[i]),
    validationStatus: contradicted ? 'contradicted' : 'validated',
    confidence: verification.confidence,
    evaluationMethod: 'verification_llm',
    evaluatorVersion: 'targeted-verification-v1',
    note: contradicted
      ? 'resolved via transcript despite escalation_trigger/outcome disagreement — recorded as contradicted, not silently merged'
      : null,
  });
}

/** Deterministic idempotency key for one evaluation attempt — same inputs always produce the same id (brief §15: "repeat processing/idempotency"). */
export function computeEscalationReasonEvaluationId(input: EscalationReasonInteractionInput, evaluatorVersion: string): string {
  return computeEvidenceEvaluationId(input.interactionId, ESCALATION_REASON_FACT_ID, evaluatorVersion, normalizedInputsJson(input));
}
