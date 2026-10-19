// Session 6 — CMA Conversation-Aware Measurement Foundation.
//
// The minimum interaction-level evidence contract (brief Part C §7),
// generalized from the shape call_center.automated_qa_evaluations/
// automated_qa_observations already use (finding + evidence + validation
// status + evaluator/version + timestamps + supersession) rather than
// inventing a new one. QA's tables stay QA-specific (parameter_code
// vocabulary, turn-shape findings); this contract is for arbitrary
// CMA-relevant interaction facts (e.g. escalation reason, eventually
// Trace-API-informed facts) that are not QA parameters.
//
// Deliberately small: this is a typed contract plus pure functions, not
// a new conversation knowledge graph (brief §7: "do not create a
// general-purpose conversation knowledge graph").

/** Where a finding's underlying observation originated. */
export type CmaEvidenceOrigin = 'voiceforce_api' | 'qa_evaluation' | 'derived';

/** How this specific finding was produced. */
export type CmaEvaluationMethod =
  | 'fast_path' // an existing, sufficiently-supported API/DB finding, accepted without a new LLM call
  | 'verification_llm' // a targeted, structured LLM call resolved an ambiguous/missing finding
  | 'derivation_deterministic' // computed purely from stored structured facts, no LLM involved
  | 'unresolved'; // no method could establish the fact; recorded honestly as unknown

/** Whether the underlying evidence actually supports a value, and how confidently. */
export type CmaValidationStatus = 'validated' | 'contradicted' | 'insufficient' | 'unresolved';

/** Whether this interaction is even eligible for this fact at all (e.g. a non-escalated call is ineligible for "escalation reason"). */
export type CmaEligibility = 'eligible' | 'ineligible' | 'indeterminate';

export interface CmaEvidenceSourceObservation {
  origin: CmaEvidenceOrigin;
  /** The raw observed value this finding was derived from, kept verbatim for audit (never re-interpreted silently later). */
  raw: unknown;
}

/**
 * One governed finding about one fact of one interaction. Mirrors
 * automated_qa_evaluations' provenance discipline (model/prompt/contract
 * version, evaluated-at timestamp, supersession) but is NOT a QA
 * record — `factId` names an arbitrary CMA-relevant fact (e.g.
 * 'escalation_reason'), not a qaParameters.ts parameter_code.
 */
export interface CmaInteractionEvidenceFinding {
  interactionId: string;
  interactionType: 'call' | 'chat';
  factId: string;
  eligibility: CmaEligibility;
  /** null when ineligible, indeterminate, or unresolved — never a fabricated placeholder value. */
  value: string | number | boolean | null;
  sourceObservation: CmaEvidenceSourceObservation | null;
  /** Turn ids, field names, or other citations supporting `value` — never empty for a 'validated' finding. */
  evidenceRefs: string[];
  validationStatus: CmaValidationStatus;
  /** 0-1 when known (e.g. an LLM-reported confidence); null when the method doesn't produce one (fast_path's deterministic acceptance is confidence 1, not null). */
  confidence: number | null;
  evaluationMethod: CmaEvaluationMethod;
  /** e.g. 'deterministic-v1' for fast-path/derivation, or '{modelId}:{promptVersion}' for verification_llm — never blank. */
  evaluatorVersion: string;
  evaluatedAt: string;
  /** Set when this finding replaces an earlier one for the same (interactionId, factId) — e.g. new evidence arrived, or evaluatorVersion changed. Never a destructive overwrite; the contract is additive-with-supersession. */
  supersedesEvaluationId: string | null;
  /** A note explaining a contradiction or an unresolved outcome, for human review — never used to fabricate a value. */
  note: string | null;
}

/** A deterministic evaluation id — same (interactionId, factId, evaluatorVersion, normalized inputs) must always produce the same id, so re-running the same assessment is idempotent (brief §15: "repeat processing/idempotency"). */
export function computeEvidenceEvaluationId(
  interactionId: string,
  factId: string,
  evaluatorVersion: string,
  normalizedInputsJson: string,
): string {
  // A simple, dependency-free stable hash (FNV-1a) — this id is a
  // dedup/idempotency key, not a security token, so cryptographic
  // strength is not required.
  const input = `${interactionId}|${factId}|${evaluatorVersion}|${normalizedInputsJson}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
