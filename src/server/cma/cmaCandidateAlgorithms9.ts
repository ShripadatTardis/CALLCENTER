// Session 9 — FCR-03 / ESC-03 / AHT-03 CANDIDATE algorithm definitions.
//
// Deliberately NOT merged into CMA_ALGORITHM_REGISTRY
// (cmaEvaluationAlgorithms.ts). That registry is what
// src/server/cma/cmaEvaluation.ts actually consults for every real
// evaluateCmaMeasure() call — a canonical id this file defines but the
// real registry does not list remains unreachable through the governed
// application path and still returns `{ kind: 'not_yet_governed' }`,
// exactly as it did before this session (see
// docs/CMA_BUSINESS_DEFINITION_DECISIONS.md §6). This file exists only
// so the three candidate definitions have one explicit, typed,
// independently-testable home — reused by
// .tooling/scripts/session9-fcr-esc-aht-verify.mjs — rather than living
// only as a comment or only inside the (also not-applied-to-production)
// migration supabase/migrations/20261114000000_cma_fcr_esc_aht_candidates.sql.
//
// Each definition reuses, unchanged, the exact formula already
// implemented and independently verified in
// src/server/analytics/ratioMath.ts (computeFcr / computeEscalationRate
// / computeAht) — this file does not invent a new definition, it gives
// the already-decided-in-code formula a CMA-shaped candidate home so it
// can be exercised through the same evaluation-engine RPC shape as every
// other canonical measure, for accuracy testing only.
//
// To promote any of these to authoritative: (1) record explicit business
// approval (Part I of docs/SESSION_9_FCR_ESC_AHT_CMA_OWNERSHIP.md), (2)
// add the entry to CMA_ALGORITHM_REGISTRY, (3) apply
// 20261114000000_cma_fcr_esc_aht_candidates.sql (or its then-current
// equivalent) to production, (4) flip governed_algorithm_status from
// 'pending_decision' to 'decided' in the governance registry. None of
// those four steps happened this session.

import type { CmaAlgorithmDefinition } from './cmaEvaluationAlgorithms.js';
import { selectCmaEvidencePath, type CmaEvidencePath } from './cmaEvidencePathSelector.js';

export const CMA_CANDIDATE_ALGORITHMS_SESSION_9: Readonly<Record<string, CmaAlgorithmDefinition>> = {
  'CANON-FIRST-CONTACT-RES': {
    canonicalMeasureId: 'CANON-FIRST-CONTACT-RES', unit: 'percent', sourceFamily: 'interaction', rpc: 'call_center_cma_evaluate_measure',
    expectedBaseFactIds: ['FACT-FCR'],
    eligiblePopulationDescription:
      "FCR-03 (candidate): every voice interaction in the window is eligible (denominator = all fetched calls); " +
      'numerator = count where the stored fcr field is true. fcr=null (indeterminate) is counted in the ' +
      'denominator but never the numerator — it is a classification the Voice API did not supply, not a ' +
      'verified "not first-contact-resolved" result, so it is never silently coerced into either bucket\'s ' +
      'headline meaning, consistent with how the already-deployed computeFcr() in ratioMath.ts treats it.',
  },
  'CANON-ESC-RATE': {
    canonicalMeasureId: 'CANON-ESC-RATE', unit: 'percent', sourceFamily: 'interaction', rpc: 'call_center_cma_evaluate_measure',
    expectedBaseFactIds: ['FACT-OUTCOME'],
    eligiblePopulationDescription:
      "ESC-03 (candidate): denominator = voice interactions in the window with a determinate outcome " +
      "('resolved' or 'escalated' only); numerator = count where outcome='escalated'. An indeterminate " +
      '(null) outcome is excluded from the denominator entirely — never silently counted as either resolved ' +
      'or escalated.',
  },
  'CANON-AVG-HANDLE-TIME': {
    canonicalMeasureId: 'CANON-AVG-HANDLE-TIME', unit: 'seconds', sourceFamily: 'interaction', rpc: 'call_center_cma_evaluate_measure',
    expectedBaseFactIds: ['FACT-DURATION-SECONDS'],
    eligiblePopulationDescription:
      'AHT-03 (candidate): every voice interaction in the window with a finite, non-stale duration_seconds ' +
      '(< 14400s / 4h — the same stale-duration guard CANON-SUCCESSFUL-RES-TIME already uses), regardless of ' +
      'outcome. numerator = sum of those durations; value = mean.',
  },
};

// ---------------------------------------------------------------------
// ESC-03 evidence-path demonstration (Part D/F) — reuses the EXISTING
// selectCmaEvidencePath() decision function (cmaEvidencePathSelector.ts,
// Session 6) unchanged; introduces no new LLM client, no new evidence
// engine. This shows, for one voice interaction's "was this call
// escalated" fact, which of the brief's fast/verify/derive/unsupported
// paths ESC-03 would take — it does not itself call an LLM (no `verify`
// function is invoked here), consistent with the brief's explicit
// "avoid unnecessary new LLM evaluation" instruction for a measure that
// remains pending_decision.
// ---------------------------------------------------------------------

export interface EscalationOccurredEvidenceInput {
  interactionId: string;
  /** The stored outcome field — 'resolved' | 'escalated' | null (indeterminate). */
  outcome: 'resolved' | 'escalated' | null;
  escalationTrigger: string | null;
  /** True only when a real transcript/context is actually available for this interaction. */
  verificationContextAvailable: boolean;
}

/**
 * Determines the evidence path ESC-03 would take for one interaction's
 * "was this call escalated" fact — never the fact's value itself (this
 * function performs no LLM call and returns no escalation determination;
 * it answers only "which path"). The already-decided ESC-03 denominator
 * (handledCalls in ratioMath.ts) already excludes outcome=null rows
 * entirely, so in practice every ELIGIBLE ESC-03 row takes fast_path
 * (outcome is present and, by construction, not contradicted by a
 * missing trigger — escalation_trigger absence is not itself a
 * contradiction, see cmaEscalationEvidence.ts's own escalationExecuted/
 * escalationRequested distinction). This function exists to make that
 * routing decision explicit and testable per interaction, and to prove
 * — for the interactions ESC-03's denominator EXCLUDES (outcome=null) —
 * that they are routed to verification_required or unsupported_inference,
 * never silently treated as resolved or escalated.
 */
export function selectEscalationOccurredEvidencePath(input: EscalationOccurredEvidenceInput): CmaEvidencePath {
  const determinate = input.outcome === 'resolved' || input.outcome === 'escalated';
  return selectCmaEvidencePath({
    apiFindingPresent: determinate,
    apiFindingOrigin: 'voiceforce_api',
    // A non-null escalation_trigger on a 'resolved' outcome is the one
    // genuine contradiction this fact can have (requested but not
    // executed) — anything else determinate is internally consistent.
    apiFindingConsistentWithOtherFacts: determinate
      ? !(input.outcome === 'resolved' && Boolean(input.escalationTrigger))
      : undefined,
    deterministicallyDerivable: false, // "was this call escalated" is never computable from duration/sentiment alone
    verificationContextAvailable: input.verificationContextAvailable,
    requiresConversationalInterpretation: true,
  });
}
