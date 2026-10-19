// Session 7 Part D — connects the already-deployed Session 6 evidence
// foundation (cmaEvidenceTypes.ts, cmaEvidencePathSelector.ts,
// cmaEscalationEvidence.ts) and the Part C transcript-evidence cache to
// real interaction records: decides whether a transcript is even
// needed before fetching one, evaluates the fact, and persists the
// resulting finding via the deployed cma_interaction_evidence RPCs.
//
// Deliberately does NOT change `evaluateEscalationReasonEvidence` or
// any existing CMA calculation — this module is glue, not a new
// evaluator. Written against injected deps (same pattern as every
// other CMA module in this session) so the orchestration logic is
// fully unit-testable without a real Supabase client, real network
// call, or real LLM call.

import {
  evaluateEscalationReasonEvidence,
  ESCALATION_REASON_FACT_ID,
  type EscalationReasonVerificationResult,
} from './cmaEscalationEvidence.js';
import {
  getOrFetchTranscriptEvidence,
  type CmaTranscriptEvidenceDeps,
  type CmaTranscriptEvidenceTurn,
} from './cmaTranscriptEvidenceCache.js';
import type { CmaInteractionEvidenceFinding } from './cmaEvidenceTypes.js';
import type { VoiceTurnLike } from '../../lib/qaTurnIdentity.js';

export interface EscalationReasonSourceRow {
  interactionId: string;
  outcome: string | null;
  escalationTrigger: string | null;
}

export interface CmaEvidencePersistResult {
  id: string;
  supersededId: string | null;
}

export type CmaEvidencePersister = (finding: CmaInteractionEvidenceFinding) => Promise<CmaEvidencePersistResult>;

export type CmaEvidenceActiveFetcher = (
  interactionId: string,
  interactionType: 'call' | 'chat',
  factId: string,
) => Promise<{ id: string } | null>;

/**
 * The targeted-verification question, given the FULL transcript turns
 * (with text — unlike `VoiceTurnLike`, which only carries
 * timestamp/speaker for turn-id computation). Kept as a separate
 * injected dependency, rather than baked into a pre-built
 * `EscalationReasonVerifier`, specifically so the orchestrator — which
 * is the one place that has both the stripped `VoiceTurnLike[]` (for
 * `evaluateEscalationReasonEvidence`) and the full text turns (for the
 * actual LLM question) in scope at once — can close over the right
 * transcript without a second lookup.
 */
export type CmaEscalationLlmAsker = (
  interactionId: string,
  outcome: string | null,
  escalationTrigger: string | null,
  transcript: CmaTranscriptEvidenceTurn[],
) => Promise<EscalationReasonVerificationResult | null>;

export interface EvaluateEscalationReasonDeps {
  transcriptDeps: CmaTranscriptEvidenceDeps;
  askLlm: CmaEscalationLlmAsker;
  getActiveEvidence: CmaEvidenceActiveFetcher;
  persist: CmaEvidencePersister;
}

export interface EvaluateEscalationReasonOutcome {
  finding: CmaInteractionEvidenceFinding;
  persistedId: string;
  supersededId: string | null;
  /** Whether a transcript fetch was even attempted — false for ineligible rows and clean fast-path rows, which never need one (brief: "no requirement to invoke [fetch] where structured evidence already establishes the fact"). */
  transcriptFetchAttempted: boolean;
}

/**
 * Pure — decides, from structured facts alone, whether this row could
 * possibly need a transcript. Mirrors (does not duplicate the decision
 * logic of) `evaluateEscalationReasonEvidence`'s own internal
 * fast-path/ineligible checks, so the orchestrator never fetches a
 * transcript for a row the evaluator would resolve from the API fact
 * alone.
 */
export function escalationReasonNeedsTranscript(row: EscalationReasonSourceRow): boolean {
  const escalationExecuted = row.outcome === 'escalated';
  const escalationRequested = Boolean(row.escalationTrigger && row.escalationTrigger.trim().length > 0);
  const eligible = escalationExecuted || escalationRequested;
  const isCleanFastPath = escalationRequested && escalationExecuted;
  return eligible && !isCleanFastPath;
}

/**
 * Evaluates `escalation_reason` for one real interaction and persists
 * the result through the deployed evidence RPCs. Idempotent and
 * evaluation-versioned: looks up the current active finding first
 * (if any) and supersedes it explicitly via `priorEvaluationId`,
 * exactly as `cmaEscalationEvidence.ts`'s own supersession contract
 * requires.
 */
export async function evaluateAndPersistEscalationReason(
  row: EscalationReasonSourceRow,
  deps: EvaluateEscalationReasonDeps,
): Promise<EvaluateEscalationReasonOutcome> {
  const needsTranscript = escalationReasonNeedsTranscript(row);

  let transcript: VoiceTurnLike[] | undefined;
  let fullTurns: CmaTranscriptEvidenceTurn[] = [];
  let transcriptFetchAttempted = false;

  if (needsTranscript) {
    transcriptFetchAttempted = true;
    const evidence = await getOrFetchTranscriptEvidence(row.interactionId, 'call', deps.transcriptDeps);
    if (evidence.fetchStatus === 'available' && evidence.turns.length > 0) {
      fullTurns = evidence.turns;
      transcript = evidence.turns.map((t) => ({ timestamp: t.timestamp, speaker: t.speaker }));
    }
    // 'unavailable'/'incomplete' -> transcript stays undefined, which
    // evaluateEscalationReasonEvidence already treats as "missing
    // transcript" (brief §15's own documented case), never fabricated.
  }

  // Closes over `fullTurns` (captured above, with real text) rather
  // than reconstructing it from the stripped VoiceTurnLike[]
  // `evaluateEscalationReasonEvidence` passes back in — that stripped
  // shape deliberately has no `text` field to ask an LLM a real
  // question with.
  const verify = async (interactionId: string): Promise<EscalationReasonVerificationResult | null> =>
    deps.askLlm(interactionId, row.outcome, row.escalationTrigger, fullTurns);

  const priorActive = await deps.getActiveEvidence(row.interactionId, 'call', ESCALATION_REASON_FACT_ID);

  const finding = await evaluateEscalationReasonEvidence(
    {
      interactionId: row.interactionId,
      outcome: row.outcome,
      escalationTrigger: row.escalationTrigger,
      transcript,
      priorEvaluationId: priorActive?.id,
    },
    verify,
  );

  const { id, supersededId } = await deps.persist(finding);

  return { finding, persistedId: id, supersededId, transcriptFetchAttempted };
}

// =====================================================================
// Production wiring (not exercised by the deterministic test suite —
// requires a real SupabaseClient).
// =====================================================================

export interface CmaEvidenceSupabaseLike {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export function makeSupabaseEvidencePersister(supabase: CmaEvidenceSupabaseLike): CmaEvidencePersister {
  return async (finding) => {
    const { data, error } = await supabase.rpc('call_center_cma_evidence_upsert', {
      p_interaction_id: finding.interactionId,
      p_interaction_type: finding.interactionType,
      p_fact_id: finding.factId,
      p_eligibility: finding.eligibility,
      p_value: finding.value,
      p_source_origin: finding.sourceObservation?.origin ?? null,
      p_source_raw: finding.sourceObservation?.raw ?? null,
      p_evidence_refs: finding.evidenceRefs,
      p_validation_status: finding.validationStatus,
      p_confidence: finding.confidence,
      p_evaluation_method: finding.evaluationMethod,
      p_evaluator_version: finding.evaluatorVersion,
      p_note: finding.note,
    });
    if (error) throw new Error(`call_center_cma_evidence_upsert failed: ${error.message}`);
    const row = (data as Array<{ id: string; superseded_id: string | null }>)?.[0];
    if (!row) throw new Error('call_center_cma_evidence_upsert returned no row');
    return { id: row.id, supersededId: row.superseded_id };
  };
}

export function makeSupabaseActiveEvidenceFetcher(supabase: CmaEvidenceSupabaseLike): CmaEvidenceActiveFetcher {
  return async (interactionId, interactionType, factId) => {
    const { data, error } = await supabase.rpc('call_center_cma_evidence_get_active', {
      p_interaction_id: interactionId,
      p_interaction_type: interactionType,
      p_fact_id: factId,
    });
    if (error) throw new Error(`call_center_cma_evidence_get_active failed: ${error.message}`);
    const rows = (data as Array<{ id: string }>) ?? [];
    return rows.length > 0 ? { id: rows[0].id } : null;
  };
}
