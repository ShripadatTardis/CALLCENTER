import { QA_PARAMETER_CODES, type QaParameterCode, type QaResultValue } from './qaParameters.js';
import { computeQaRatios, type QaRatioResult } from './qaRatios.js';
import { computeAutomatedQaRatios } from './automatedQaRatios.js';
import type { QaReview, QaFinding, QaChannel, QaReviewStatus } from '@/services/qa/qaService';
import type { AutomatedQaEvaluation, AutomatedQaObservation, AutomatedQaStatus } from '@/services/qa/automatedQaService';

/**
 * Session 16.4 — Human QA vs Automated QA comparison engine. Pure,
 * deterministic, no DB/LLM access — operates entirely over already-
 * persisted Human QA review/finding rows and Automated QA evaluation/
 * observation rows, reusing the EXACT same ratio engine both sides
 * already use (computeQaRatios / computeAutomatedQaRatios) rather than
 * inventing a second measurement formula. See
 * docs/QA_CALIBRATION_COMPARISON.md for the full methodology writeup.
 *
 * Turn-level correspondence is possible (not manufactured) because both
 * sides compute turn ids via the SAME functions
 * (docs/AUTOMATED_QA_EVALUATION_ARCHITECTURE.md "Transcript identity
 * strategy" — the automated evaluator reuses Human QA's own turn-identity
 * mapping). A shared `primary_turn_id` on both a qa_finding and an
 * automated_qa_observation is therefore a REAL correspondence, not an
 * assumption — but it does not by itself prove the two assessments saw
 * an identical transcript (see transcriptComparability below).
 */

// ---------------------------------------------------------------------
// B1 — Pairing eligibility
// ---------------------------------------------------------------------

export function isEligibleHumanReview(status: QaReviewStatus): boolean {
  return status === 'submitted';
}

/**
 * `partial` is included — a partial evaluation still has real,
 * independently-covered observations for whichever windows succeeded;
 * excluding it would discard genuine, usable evidence. Only `queued`/
 * `running` (no result yet) and `failed` (no usable result) are
 * ineligible, per the brief's explicit list.
 */
export function isEligibleAutomatedEvaluation(status: AutomatedQaStatus): boolean {
  return status === 'completed' || status === 'partial';
}

// ---------------------------------------------------------------------
// B2 — Pair candidates across a bulk-fetched population (for the
// Calibration dashboard's summary/insights — never assumes the LATEST
// of each side is automatically "the" comparison pair; callers choose
// which review/evaluation version to pair).
// ---------------------------------------------------------------------

export interface QaPopulationReviewLike {
  id: string;
  interactionId: string;
  channel: QaChannel;
  agentId: string;
  status: QaReviewStatus;
  submittedAt: string | null;
  reviewerUserId: string;
}

export interface QaPopulationEvaluationLike {
  id: string;
  interactionId: string;
  channel: QaChannel;
  agentId: string;
  status: AutomatedQaStatus;
  completedAt: string | null;
  createdAt: string;
  promptVersion: string;
  modelId: string | null;
}

export interface QaPairCandidate {
  interactionId: string;
  channel: QaChannel;
  agentId: string;
  reviews: QaPopulationReviewLike[]; // eligible (submitted), newest first
  evaluations: QaPopulationEvaluationLike[]; // eligible (completed/partial), newest first
}

function sortDesc<T>(items: T[], key: (t: T) => string | null): T[] {
  return [...items].sort((a, b) => (key(b) ?? '').localeCompare(key(a) ?? ''));
}

/** Groups by (channel, interactionId); only interactions with AT LEAST ONE eligible review AND ONE eligible evaluation are returned — brief's explicit "requires one of each" pairing rule. */
export function findPairCandidates(
  reviews: QaPopulationReviewLike[],
  evaluations: QaPopulationEvaluationLike[],
): QaPairCandidate[] {
  const byKey = new Map<string, { reviews: QaPopulationReviewLike[]; evaluations: QaPopulationEvaluationLike[]; agentId: string; channel: QaChannel; interactionId: string }>();
  for (const r of reviews) {
    if (!isEligibleHumanReview(r.status)) continue;
    const key = `${r.channel}:${r.interactionId}`;
    const entry = byKey.get(key) ?? { reviews: [], evaluations: [], agentId: r.agentId, channel: r.channel, interactionId: r.interactionId };
    entry.reviews.push(r);
    byKey.set(key, entry);
  }
  for (const e of evaluations) {
    if (!isEligibleAutomatedEvaluation(e.status)) continue;
    const key = `${e.channel}:${e.interactionId}`;
    const entry = byKey.get(key);
    if (!entry) continue; // no eligible review for this interaction — not a candidate
    entry.evaluations.push(e);
  }
  return Array.from(byKey.values())
    .filter((e) => e.reviews.length > 0 && e.evaluations.length > 0)
    .map((e) => ({
      interactionId: e.interactionId,
      channel: e.channel,
      agentId: e.agentId,
      reviews: sortDesc(e.reviews, (r) => r.submittedAt),
      evaluations: sortDesc(e.evaluations, (ev) => ev.completedAt ?? ev.createdAt),
    }));
}

// ---------------------------------------------------------------------
// B3 — Transcript comparability. Human QA (call_center.qa_reviews) does
// NOT persist a transcript snapshot/hash today (confirmed by schema
// audit — see docs/QA_CALIBRATION_COMPARISON.md "Known limitations").
// This function is written to handle a real hash on both sides so it
// needs no change if that gap is closed later; until then it always
// returns 'unknown' for every pair — never fabricated as 'matched'.
// ---------------------------------------------------------------------

export type TranscriptComparability = 'matched' | 'mismatch' | 'unknown';

export function transcriptComparability(humanTranscriptHash: string | null, automatedTranscriptHash: string | null): TranscriptComparability {
  if (!humanTranscriptHash || !automatedTranscriptHash) return 'unknown';
  return humanTranscriptHash === automatedTranscriptHash ? 'matched' : 'mismatch';
}

// ---------------------------------------------------------------------
// C — Per-parameter comparison
// ---------------------------------------------------------------------

export type ComparisonClassification = 'agreement' | 'disagreement' | 'applicability_mismatch' | 'both_not_applicable' | 'not_comparable';

export interface TurnComparison {
  turnId: string;
  humanValue: QaResultValue;
  automatedValue: QaResultValue;
  /** True when either side's value is CANNOT_VERIFY on this turn — per brief C5, never counted toward agreement or disagreement. */
  cannotVerifyInvolved: boolean;
  /** Only meaningful when !cannotVerifyInvolved. */
  agree: boolean;
}

export interface ParameterComparison {
  parameterCode: QaParameterCode;
  classification: ComparisonClassification;
  reason: string;
  human: QaRatioResult;
  automated: QaRatioResult;
  /** Turns BOTH sides recorded a real (non-N_A) observation for — a verified, not manufactured, correspondence (see module header). */
  turnComparisons: TurnComparison[];
  /** Turns excluded from turnComparisons because CANNOT_VERIFY was involved on either side. */
  cannotVerifyTurnIds: string[];
  /** Human assessed this turn for this parameter; Automated did not (or vice versa) — surfaced as coverage difference, never silently dropped. */
  humanOnlyTurnIds: string[];
  automatedOnlyTurnIds: string[];
}

function byTurn(items: { primaryTurnId: string; value: QaResultValue }[]): Map<string, QaResultValue> {
  const map = new Map<string, QaResultValue>();
  for (const item of items) {
    if (item.value === 'N_A') continue; // not a real judgment — same exclusion computeQaRatios already applies
    if (!map.has(item.primaryTurnId)) map.set(item.primaryTurnId, item.value);
  }
  return map;
}

export function compareParameter(
  parameterCode: QaParameterCode,
  humanFindingsForParameter: Pick<QaFinding, 'primaryTurnId' | 'value'>[],
  automatedObservationsForParameter: Pick<AutomatedQaObservation, 'primaryTurnId' | 'value'>[],
  humanRatio: QaRatioResult,
  automatedRatio: QaRatioResult,
): ParameterComparison {
  const humanMap = byTurn(humanFindingsForParameter);
  const automatedMap = byTurn(automatedObservationsForParameter);

  const turnComparisons: TurnComparison[] = [];
  const cannotVerifyTurnIds: string[] = [];
  const humanOnlyTurnIds: string[] = [];
  const automatedOnlyTurnIds: string[] = [];

  for (const [turnId, humanValue] of humanMap) {
    const automatedValue = automatedMap.get(turnId);
    if (automatedValue === undefined) {
      humanOnlyTurnIds.push(turnId);
      continue;
    }
    const cannotVerifyInvolved = humanValue === 'CANNOT_VERIFY' || automatedValue === 'CANNOT_VERIFY';
    if (cannotVerifyInvolved) {
      cannotVerifyTurnIds.push(turnId);
    }
    turnComparisons.push({ turnId, humanValue, automatedValue, cannotVerifyInvolved, agree: !cannotVerifyInvolved && humanValue === automatedValue });
  }
  for (const turnId of automatedMap.keys()) {
    if (!humanMap.has(turnId)) automatedOnlyTurnIds.push(turnId);
  }

  const comparableTurns = turnComparisons.filter((t) => !t.cannotVerifyInvolved);

  let classification: ComparisonClassification;
  let reason: string;

  if (humanRatio.denominator === 0 && automatedRatio.denominator === 0) {
    classification = 'both_not_applicable';
    reason = 'Neither Human QA nor Automated QA found an eligible assessment opportunity for this parameter on this interaction.';
  } else if (humanRatio.denominator === 0 || automatedRatio.denominator === 0) {
    classification = 'applicability_mismatch';
    reason = humanRatio.denominator === 0
      ? 'Human QA recorded no eligible opportunity for this parameter, but Automated QA assessed at least one turn.'
      : 'Automated QA recorded no eligible opportunity for this parameter, but Human QA assessed at least one turn.';
  } else if (comparableTurns.length === 0) {
    classification = 'not_comparable';
    reason = turnComparisons.length > 0
      ? 'Both sides assessed this parameter, but every overlapping turn involved a CANNOT_VERIFY result — no defensible agreement/disagreement call can be made.'
      : 'Both sides assessed this parameter, but on entirely different turns — there is no overlapping evidence to compare directly.';
  } else if (comparableTurns.every((t) => t.agree)) {
    classification = 'agreement';
    reason = `Both sides reached the same judgment on all ${comparableTurns.length} overlapping turn(s) assessed.`;
  } else {
    const disagreeing = comparableTurns.filter((t) => !t.agree).length;
    classification = 'disagreement';
    reason = `${disagreeing} of ${comparableTurns.length} overlapping turn(s) received different judgments from Human QA and Automated QA.`;
  }

  return {
    parameterCode, classification, reason, human: humanRatio, automated: automatedRatio,
    turnComparisons, cannotVerifyTurnIds, humanOnlyTurnIds, automatedOnlyTurnIds,
  };
}

export interface QaComparisonResult {
  reviewId: string;
  evaluationId: string;
  transcriptComparability: TranscriptComparability;
  parameters: Record<QaParameterCode, ParameterComparison>;
}

/** The full nine-parameter comparison for one specific (review, evaluation) pair — the version selectors determine which pair this is, never assumed to be "the latest." */
export function compareAssessments(review: QaReview, evaluation: AutomatedQaEvaluation): QaComparisonResult {
  const humanRatios = computeQaRatios(review.findings.map((f) => ({ reviewId: review.id, parameterCode: f.parameterCode, value: f.value })));
  const automatedRatios = computeAutomatedQaRatios(evaluation.observations?.map((o) => ({ evaluationId: evaluation.id, parameterCode: o.parameterCode, value: o.value })) ?? []);

  const parameters = {} as Record<QaParameterCode, ParameterComparison>;
  for (const code of QA_PARAMETER_CODES) {
    const humanForParam = review.findings.filter((f) => f.parameterCode === code);
    const automatedForParam = (evaluation.observations ?? []).filter((o) => o.parameterCode === code);
    parameters[code] = compareParameter(code, humanForParam, automatedForParam, humanRatios[code], automatedRatios[code]);
  }

  return {
    reviewId: review.id,
    evaluationId: evaluation.id,
    // Human QA has no persisted transcript hash today (see module
    // header) — this is always 'unknown' until that gap is closed, by
    // construction, never guessed from matching interaction ids.
    transcriptComparability: transcriptComparability(null, evaluation.transcriptHash ?? null),
    parameters,
  };
}

// ---------------------------------------------------------------------
// D1 — Summary counts across a batch of already-computed comparisons.
// ---------------------------------------------------------------------

export interface QaCalibrationSummary {
  pairedInteractionsCount: number;
  eligiblePairsCount: number;
  validatedComparablePairsCount: number;
  classificationCounts: Record<ComparisonClassification, number>;
  /** Total (pair, parameter) cells considered — the denominator behind classificationCounts. */
  totalCells: number;
}

export function summarizeComparisons(candidates: QaPairCandidate[], comparisons: QaComparisonResult[]): QaCalibrationSummary {
  const classificationCounts: Record<ComparisonClassification, number> = {
    agreement: 0, disagreement: 0, applicability_mismatch: 0, both_not_applicable: 0, not_comparable: 0,
  };
  let totalCells = 0;
  let validatedComparablePairsCount = 0;
  for (const c of comparisons) {
    if (c.transcriptComparability === 'matched') validatedComparablePairsCount += 1;
    for (const code of QA_PARAMETER_CODES) {
      classificationCounts[c.parameters[code].classification] += 1;
      totalCells += 1;
    }
  }
  return {
    pairedInteractionsCount: candidates.length,
    eligiblePairsCount: comparisons.length,
    validatedComparablePairsCount,
    classificationCounts,
    totalCells,
  };
}

// ---------------------------------------------------------------------
// Part E — Calibration insights. Purely descriptive counts over an
// already-computed comparison batch — never an automatic correctness
// verdict (brief's explicit restriction).
// ---------------------------------------------------------------------

export interface QaParameterInsightRow {
  parameterCode: QaParameterCode;
  count: number;
  ofPairs: number;
}

function concentrationByParameter(comparisons: QaComparisonResult[], classification: ComparisonClassification): QaParameterInsightRow[] {
  return QA_PARAMETER_CODES.map((code) => ({
    parameterCode: code,
    count: comparisons.filter((c) => c.parameters[code].classification === classification).length,
    ofPairs: comparisons.length,
  })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}

/** A parameter Automated QA frequently marks not-applicable while Human QA does assess it. */
export function applicabilityMismatchConcentration(comparisons: QaComparisonResult[]): QaParameterInsightRow[] {
  return concentrationByParameter(comparisons, 'applicability_mismatch');
}

/** A parameter where both assess an opportunity but frequently disagree. */
export function judgmentDisagreementConcentration(comparisons: QaComparisonResult[]): QaParameterInsightRow[] {
  return concentrationByParameter(comparisons, 'disagreement');
}

export interface QaCoverageDivergenceRow {
  parameterCode: QaParameterCode;
  pairsCompared: number;
  /** Mean (automated denominator - human denominator) across pairs where BOTH had at least 1 eligible observation. Positive = Automated finds more eligible opportunities on average; negative = fewer. */
  meanDenominatorDifference: number;
}

export function coverageDivergence(comparisons: QaComparisonResult[]): QaCoverageDivergenceRow[] {
  return QA_PARAMETER_CODES.map((code) => {
    const both = comparisons
      .map((c) => c.parameters[code])
      .filter((p) => p.human.denominator > 0 && p.automated.denominator > 0);
    const meanDenominatorDifference = both.length === 0
      ? 0
      : both.reduce((sum, p) => sum + (p.automated.denominator - p.human.denominator), 0) / both.length;
    return { parameterCode: code, pairsCompared: both.length, meanDenominatorDifference };
  }).filter((r) => r.pairsCompared > 0);
}

export interface QaPromptVersionComparisonRow {
  parameterCode: QaParameterCode;
  promptVersion: string;
  comparablePairs: number; // pairs with a non-cannot-verify-only, overlapping-evidence comparison
  disagreementCount: number;
}

/**
 * Compare disagreement patterns across prompt versions — ONLY where
 * comparable evidence exists (comparablePairs > 0), and only ever
 * descriptive. The caller's UI must not present this as "prompt vX is
 * better" — see docs/QA_CALIBRATION_COMPARISON.md and the brief's
 * explicit restriction against that claim.
 */
export function promptVersionComparison(
  comparisons: Array<{ promptVersion: string; comparison: QaComparisonResult }>,
): QaPromptVersionComparisonRow[] {
  const rows: QaPromptVersionComparisonRow[] = [];
  for (const code of QA_PARAMETER_CODES) {
    const byVersion = new Map<string, { comparable: number; disagree: number }>();
    for (const { promptVersion, comparison } of comparisons) {
      const p = comparison.parameters[code];
      if (p.classification !== 'agreement' && p.classification !== 'disagreement') continue; // only cells where a real judgment comparison was possible
      const entry = byVersion.get(promptVersion) ?? { comparable: 0, disagree: 0 };
      entry.comparable += 1;
      if (p.classification === 'disagreement') entry.disagree += 1;
      byVersion.set(promptVersion, entry);
    }
    for (const [promptVersion, entry] of byVersion) {
      if (entry.comparable === 0) continue;
      rows.push({ parameterCode: code, promptVersion, comparablePairs: entry.comparable, disagreementCount: entry.disagree });
    }
  }
  return rows;
}
