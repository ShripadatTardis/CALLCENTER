// Session 16.4 — Human QA vs Automated QA comparison engine, against the
// REAL compiled src/lib/qaComparison.ts (via esbuild, not a
// reimplementation).
import {
  isEligibleHumanReview, isEligibleAutomatedEvaluation, findPairCandidates,
  transcriptComparability, compareParameter, compareAssessments, summarizeComparisons,
  applicabilityMismatchConcentration, judgmentDisagreementConcentration, coverageDivergence, promptVersionComparison,
} from '../tmp/qaComparison.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
function assertTrue(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  cond ? pass++ : fail++;
}

// --- B1: pairing eligibility ---
assert('submitted review is eligible', isEligibleHumanReview('submitted'), true);
assert('in_progress (draft) review is NOT eligible', isEligibleHumanReview('in_progress'), false);
assert('completed evaluation is eligible', isEligibleAutomatedEvaluation('completed'), true);
assert('partial evaluation is eligible (real, if incomplete, coverage)', isEligibleAutomatedEvaluation('partial'), true);
assert('queued evaluation is NOT eligible', isEligibleAutomatedEvaluation('queued'), false);
assert('running evaluation is NOT eligible', isEligibleAutomatedEvaluation('running'), false);
assert('failed evaluation is NOT eligible', isEligibleAutomatedEvaluation('failed'), false);

// --- B1/B2: findPairCandidates ---
{
  const reviews = [
    { id: 'r1', interactionId: 'i1', channel: 'voice', agentId: 'a1', status: 'submitted', submittedAt: '2026-10-01T00:00:00Z' },
    { id: 'r2', interactionId: 'i2', channel: 'voice', agentId: 'a1', status: 'in_progress', submittedAt: null },
  ];
  const evaluations = [
    { id: 'e1', interactionId: 'i1', channel: 'voice', agentId: 'a1', status: 'completed', completedAt: '2026-10-01T01:00:00Z', createdAt: '2026-10-01T00:50:00Z', promptVersion: 'v1', modelId: 'm' },
    { id: 'e2', interactionId: 'i2', channel: 'voice', agentId: 'a1', status: 'completed', completedAt: '2026-10-01T01:00:00Z', createdAt: '2026-10-01T00:50:00Z', promptVersion: 'v1', modelId: 'm' },
    { id: 'e3', interactionId: 'i3', channel: 'voice', agentId: 'a1', status: 'completed', completedAt: '2026-10-01T01:00:00Z', createdAt: '2026-10-01T00:50:00Z', promptVersion: 'v1', modelId: 'm' },
  ];
  const candidates = findPairCandidates(reviews, evaluations);
  assert('only the interaction with BOTH an eligible review and evaluation becomes a candidate', candidates.map((c) => c.interactionId), ['i1']);
  assertTrue('different interaction ids are correctly NOT paired together', !candidates.some((c) => c.interactionId === 'i2' || c.interactionId === 'i3'));
  assert('a draft (in_progress) review never produces a pair even with a completed evaluation', candidates.length, 1);
}

// --- B3: transcript comparability ---
assert('matching hashes -> matched', transcriptComparability('h1', 'h1'), 'matched');
assert('different hashes -> mismatch', transcriptComparability('h1', 'h2'), 'mismatch');
assert('missing human hash -> unknown (never fabricated as matched)', transcriptComparability(null, 'h2'), 'unknown');
assert('missing both hashes -> unknown', transcriptComparability(null, null), 'unknown');

// --- C1: classification ---
function ratio(numerator, denominator) {
  return { parameterCode: 'task_progression_rate', numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

{
  // Agreement: both assessed the same turn, same value.
  const human = [{ primaryTurnId: 't1', value: 'PASS' }];
  const automated = [{ primaryTurnId: 't1', value: 'PASS' }];
  const r = compareParameter('task_progression_rate', human, automated, ratio(1, 1), ratio(1, 1));
  assert('agreement classification', r.classification, 'agreement');
  assert('one turn compared', r.turnComparisons.length, 1);
  assertTrue('the compared turn agrees', r.turnComparisons[0].agree);
}
{
  // Disagreement: same turn, different value.
  const human = [{ primaryTurnId: 't1', value: 'PASS' }];
  const automated = [{ primaryTurnId: 't1', value: 'FAIL' }];
  const r = compareParameter('task_progression_rate', human, automated, ratio(1, 1), ratio(0, 1));
  assert('disagreement classification', r.classification, 'disagreement');
  assertTrue('the compared turn does not agree', !r.turnComparisons[0].agree);
}
{
  // Applicability mismatch: human has eligible observations, automated has none.
  const r = compareParameter('task_progression_rate', [{ primaryTurnId: 't1', value: 'PASS' }], [], ratio(1, 1), ratio(0, 0));
  assert('applicability mismatch when automated denominator is 0 but human is not', r.classification, 'applicability_mismatch');
}
{
  // Reverse applicability mismatch.
  const r = compareParameter('task_progression_rate', [], [{ primaryTurnId: 't1', value: 'PASS' }], ratio(0, 0), ratio(1, 1));
  assert('applicability mismatch when human denominator is 0 but automated is not', r.classification, 'applicability_mismatch');
}
{
  // Both not applicable.
  const r = compareParameter('task_progression_rate', [], [], ratio(0, 0), ratio(0, 0));
  assert('both not applicable when both denominators are 0', r.classification, 'both_not_applicable');
}
{
  // Not comparable: both applicable, but on disjoint turns.
  const human = [{ primaryTurnId: 't1', value: 'PASS' }];
  const automated = [{ primaryTurnId: 't2', value: 'PASS' }];
  const r = compareParameter('task_progression_rate', human, automated, ratio(1, 1), ratio(1, 1));
  assert('not comparable when both are applicable but on non-overlapping turns', r.classification, 'not_comparable');
  assert('the human-only turn is surfaced as coverage, not silently dropped', r.humanOnlyTurnIds, ['t1']);
  assert('the automated-only turn is surfaced as coverage, not silently dropped', r.automatedOnlyTurnIds, ['t2']);
}
{
  // CANNOT_VERIFY handling (C5) — never automatically agreement/disagreement.
  const human = [{ primaryTurnId: 't1', value: 'GROUNDED' }];
  const automated = [{ primaryTurnId: 't1', value: 'CANNOT_VERIFY' }];
  const r = compareParameter('response_grounding_rate', human, automated, ratio(1, 1), ratio(0, 0));
  assertTrue('a CANNOT_VERIFY turn is excluded from the agree/disagree tally', r.turnComparisons[0].cannotVerifyInvolved);
  assert('the CANNOT_VERIFY turn id is tracked separately', r.cannotVerifyTurnIds, ['t1']);
}
{
  // Lower-is-better directionality is preserved via the supplied ratio (not recomputed here) — this test confirms compareParameter does not invert or reinterpret the ratio it's given.
  const lowerBetterRatio = { parameterCode: 'unnecessary_clarification_rate', numerator: 3, denominator: 5, rate: 0.6 };
  const r = compareParameter('unnecessary_clarification_rate', [{ primaryTurnId: 't1', value: 'ISSUE' }], [{ primaryTurnId: 't1', value: 'ISSUE' }], lowerBetterRatio, lowerBetterRatio);
  assert('lower-is-better ratio numerator/denominator pass through unchanged', r.human, lowerBetterRatio);
  assert('a shared ISSUE value on both sides is still an agreement (issue agreement, not inverted into a "good" reading)', r.classification, 'agreement');
}
{
  // Missing evidence: human has a finding, automated has none at all for this parameter (empty observation list).
  const r = compareParameter('task_progression_rate', [{ primaryTurnId: 't1', value: 'PASS' }], [], ratio(1, 1), ratio(0, 0));
  assert('missing automated evidence is applicability_mismatch, not silently ignored', r.classification, 'applicability_mismatch');
}
{
  // Empty datasets entirely.
  const r = compareParameter('task_progression_rate', [], [], ratio(0, 0), ratio(0, 0));
  assert('two empty datasets -> both_not_applicable, never a crash or fabricated agreement', r.classification, 'both_not_applicable');
}

// --- C: compareAssessments (full review/evaluation pair, all 9 params + N_A exclusion + evaluation.observations undefined safety) ---
{
  const review = {
    id: 'rev-1',
    findings: [
      { id: 'f1', reviewId: 'rev-1', parameterCode: 'task_progression_rate', value: 'PASS', primaryTurnId: 't1', evidenceTurnIds: [], reasonCode: null, note: null, createdAt: '' },
      { id: 'f2', reviewId: 'rev-1', parameterCode: 'context_continuity_rate', value: 'N_A', primaryTurnId: 't1', evidenceTurnIds: [], reasonCode: null, note: null, createdAt: '' },
    ],
  };
  const evaluation = {
    id: 'eval-1', transcriptHash: 'h1',
    observations: [
      { id: 'o1', evaluationId: 'eval-1', parameterCode: 'task_progression_rate', value: 'PASS', primaryTurnId: 't1', evidenceTurnIds: [], reasonCode: null, explanation: null, createdAt: '' },
    ],
  };
  const result = compareAssessments(review, evaluation);
  assert('all 9 canonical parameters present in the result', Object.keys(result.parameters).sort(), [
    'context_continuity_rate', 'conversation_recovery_rate', 'customer_correction_rate', 'followup_understanding_rate',
    'reference_resolution_accuracy', 'repetition_loop_rate', 'response_grounding_rate', 'task_progression_rate', 'unnecessary_clarification_rate',
  ]);
  assert('task_progression_rate agrees (both PASS on t1)', result.parameters.task_progression_rate.classification, 'agreement');
  assert('an N_A human finding is excluded from applicability — both_not_applicable, not a false applicability_mismatch', result.parameters.context_continuity_rate.classification, 'both_not_applicable');
  assert('transcript comparability is unknown (Human QA has no persisted hash today)', result.transcriptComparability, 'unknown');
}
{
  // No mutation of original evaluations/reviews.
  const review = { id: 'rev-2', findings: [{ id: 'f1', reviewId: 'rev-2', parameterCode: 'task_progression_rate', value: 'PASS', primaryTurnId: 't1', evidenceTurnIds: [], reasonCode: null, note: null, createdAt: '' }] };
  const evaluation = { id: 'eval-2', transcriptHash: null, observations: [{ id: 'o1', evaluationId: 'eval-2', parameterCode: 'task_progression_rate', value: 'PASS', primaryTurnId: 't1', evidenceTurnIds: [], reasonCode: null, explanation: null, createdAt: '' }] };
  const reviewSnapshot = JSON.stringify(review);
  const evaluationSnapshot = JSON.stringify(evaluation);
  compareAssessments(review, evaluation);
  assert('the input review object is never mutated', JSON.stringify(review), reviewSnapshot);
  assert('the input evaluation object is never mutated', JSON.stringify(evaluation), evaluationSnapshot);
}

// --- D1: summarizeComparisons ---
{
  const candidates = [{ interactionId: 'i1' }, { interactionId: 'i2' }];
  const comparisons = [
    { transcriptComparability: 'unknown', parameters: Object.fromEntries(['context_continuity_rate', 'followup_understanding_rate', 'reference_resolution_accuracy', 'task_progression_rate', 'unnecessary_clarification_rate', 'repetition_loop_rate', 'customer_correction_rate', 'conversation_recovery_rate', 'response_grounding_rate'].map((c) => [c, { classification: 'agreement' }])) },
  ];
  const summary = summarizeComparisons(candidates, comparisons);
  assert('pairedInteractionsCount reflects candidate count, not comparison count', summary.pairedInteractionsCount, 2);
  assert('eligiblePairsCount reflects comparison count', summary.eligiblePairsCount, 1);
  assert('validatedComparablePairsCount is 0 when transcript comparability is unknown for every pair', summary.validatedComparablePairsCount, 0);
  assert('agreement count sums across all 9 parameter cells of the one comparison', summary.classificationCounts.agreement, 9);
  assert('totalCells = comparisons x 9 parameters', summary.totalCells, 9);
}
{
  const comparisons = [{ transcriptComparability: 'matched', parameters: Object.fromEntries(['context_continuity_rate', 'followup_understanding_rate', 'reference_resolution_accuracy', 'task_progression_rate', 'unnecessary_clarification_rate', 'repetition_loop_rate', 'customer_correction_rate', 'conversation_recovery_rate', 'response_grounding_rate'].map((c) => [c, { classification: 'agreement' }])) }];
  const summary = summarizeComparisons([{ interactionId: 'i1' }], comparisons);
  assert('validatedComparablePairsCount counts a matched-transcript pair', summary.validatedComparablePairsCount, 1);
}

// --- Part E: insights ---
function fullComparison(overrides) {
  const base = Object.fromEntries(['context_continuity_rate', 'followup_understanding_rate', 'reference_resolution_accuracy', 'task_progression_rate', 'unnecessary_clarification_rate', 'repetition_loop_rate', 'customer_correction_rate', 'conversation_recovery_rate', 'response_grounding_rate'].map((c) => [c, { classification: 'agreement', human: { denominator: 1 }, automated: { denominator: 1 } }]));
  return { ...base, ...overrides };
}
{
  const comparisons = [
    { parameters: fullComparison({ task_progression_rate: { classification: 'applicability_mismatch', human: { denominator: 1 }, automated: { denominator: 0 } } }) },
    { parameters: fullComparison({ task_progression_rate: { classification: 'applicability_mismatch', human: { denominator: 1 }, automated: { denominator: 0 } } }) },
    { parameters: fullComparison() },
  ];
  const insight = applicabilityMismatchConcentration(comparisons);
  assert('applicability mismatch concentration finds task_progression_rate with count 2', insight.find((r) => r.parameterCode === 'task_progression_rate'), { parameterCode: 'task_progression_rate', count: 2, ofPairs: 3 });
  assertTrue('a parameter with zero mismatches is not listed', !insight.some((r) => r.parameterCode === 'followup_understanding_rate'));
}
{
  const comparisons = [
    { parameters: fullComparison({ response_grounding_rate: { classification: 'disagreement', human: { denominator: 1 }, automated: { denominator: 1 } } }) },
  ];
  const insight = judgmentDisagreementConcentration(comparisons);
  assert('judgment disagreement concentration finds response_grounding_rate', insight, [{ parameterCode: 'response_grounding_rate', count: 1, ofPairs: 1 }]);
}
{
  const comparisons = [
    { parameters: fullComparison({ task_progression_rate: { classification: 'agreement', human: { denominator: 2 }, automated: { denominator: 5 } } }) },
  ];
  const divergence = coverageDivergence(comparisons).find((r) => r.parameterCode === 'task_progression_rate');
  assert('coverage divergence computes automated-minus-human mean difference', divergence.meanDenominatorDifference, 3);
  assert('coverage divergence pairsCompared only counts pairs where BOTH sides had eligible observations', divergence.pairsCompared, 1);
}
{
  // Prompt-version comparison only includes cells with a real agreement/disagreement judgment — never blends in applicability_mismatch/not_comparable/both_not_applicable cells.
  const comparisons = [
    { promptVersion: 'v1', comparison: { parameters: fullComparison({ task_progression_rate: { classification: 'agreement', human: { denominator: 1 }, automated: { denominator: 1 } } }) } },
    { promptVersion: 'v2', comparison: { parameters: fullComparison({ task_progression_rate: { classification: 'disagreement', human: { denominator: 1 }, automated: { denominator: 1 } } }) } },
    { promptVersion: 'v2', comparison: { parameters: fullComparison({ task_progression_rate: { classification: 'applicability_mismatch', human: { denominator: 1 }, automated: { denominator: 0 } } }) } },
  ];
  const rows = promptVersionComparison(comparisons).filter((r) => r.parameterCode === 'task_progression_rate');
  const v1 = rows.find((r) => r.promptVersion === 'v1');
  const v2 = rows.find((r) => r.promptVersion === 'v2');
  assert('v1 has 1 comparable pair, 0 disagreements', v1, { parameterCode: 'task_progression_rate', promptVersion: 'v1', comparablePairs: 1, disagreementCount: 0 });
  assert('v2 counts only the real disagreement cell, excludes the applicability_mismatch cell from comparablePairs', v2, { parameterCode: 'task_progression_rate', promptVersion: 'v2', comparablePairs: 1, disagreementCount: 1 });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
