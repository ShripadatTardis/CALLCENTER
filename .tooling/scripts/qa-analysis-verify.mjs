import {
  filterFindings, filterReviews, reviewedInteractionsCount, computeCoveragePopulation, computeCoverageRate,
  reasonCodeDistribution, reasonCodeAffectedInteractions, agentAggregation, trendBuckets, interactionOutcomeAggregation,
} from '../tmp/qaAnalysis.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function finding(overrides) {
  return {
    id: 'f1', reviewId: 'r1', parameterCode: 'context_continuity_rate', value: 'PASS',
    reasonCode: null, primaryTurnId: 't1', evidenceTurnIds: [], note: null, createdAt: '2026-10-01T00:00:00Z',
    channel: 'voice', agentId: 'agent-a', interactionId: 'int-1', reviewerUserId: 'user-1', submittedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}
function review(overrides) {
  return {
    id: 'r1', interactionId: 'int-1', channel: 'voice', agentId: 'agent-a', reviewerUserId: 'user-1',
    status: 'submitted', startedAt: '2026-10-01T00:00:00Z', submittedAt: '2026-10-01T00:05:00Z',
    requestCompletion: null, fcr: null, humanAssistanceRequired: null, businessOutcome: null,
    ...overrides,
  };
}

// --- §12 filters ---

const findings = [
  finding({ id: 'f1', channel: 'voice', agentId: 'agent-a', submittedAt: '2026-10-01T00:00:00Z' }),
  finding({ id: 'f2', channel: 'chat', agentId: 'agent-b', submittedAt: '2026-10-05T00:00:00Z' }),
];
assert('filterFindings by channel', filterFindings(findings, { channel: 'chat' }).map((f) => f.id), ['f2']);
assert('filterFindings by agentId', filterFindings(findings, { agentId: 'agent-a' }).map((f) => f.id), ['f1']);
assert('filterFindings by date range', filterFindings(findings, { dateFrom: '2026-10-03', dateTo: '2026-10-10' }).map((f) => f.id), ['f2']);

// --- §10 duplicate/revision policy: coverage dedups by interaction,
// parameter ratios (tested via qa-review-verify.mjs's computeQaRatios)
// do not. ---

const reviews = [
  review({ id: 'r1', interactionId: 'int-1', channel: 'voice', status: 'submitted' }),
  review({ id: 'r2', interactionId: 'int-1', channel: 'voice', status: 'submitted', reviewerUserId: 'user-2' }), // calibration: 2nd independent review of the SAME interaction
  review({ id: 'r3', interactionId: 'int-2', channel: 'voice', status: 'submitted' }),
  review({ id: 'r4', interactionId: 'int-3', channel: 'voice', status: 'in_progress' }),
];
assert('reviewedInteractionsCount dedups 2 submitted reviews of the same interaction to 1', reviewedInteractionsCount(reviews), 2);
assert('computeCoveragePopulation: 3 submitted, 1 in_progress, 2 distinct reviewed interactions', computeCoveragePopulation(reviews, []), {
  submittedReviewsCount: 3, inProgressReviewsCount: 1, reviewedInteractionsCount: 2, findingsCount: 0,
});
assert('computeCoverageRate: no eligible population -> null, never 0%', computeCoverageRate(2, 0), null);
assert('computeCoverageRate: null eligible -> null', computeCoverageRate(2, null), null);
assert('computeCoverageRate: real denominator', computeCoverageRate(2, 8), 0.25);

// --- §15 reason-code distribution: finding-count unit, not interaction-count. ---

const reasonFindings = [
  finding({ id: 'f1', parameterCode: 'context_continuity_rate', value: 'FAIL', reasonCode: 'PREVIOUS_INFORMATION_IGNORED', interactionId: 'int-1' }),
  finding({ id: 'f2', parameterCode: 'context_continuity_rate', value: 'FAIL', reasonCode: 'PREVIOUS_INFORMATION_IGNORED', interactionId: 'int-1' }), // same interaction, 2nd finding
  finding({ id: 'f3', parameterCode: 'context_continuity_rate', value: 'FAIL', reasonCode: 'PREVIOUS_INFORMATION_IGNORED', interactionId: 'int-2' }),
  finding({ id: 'f4', parameterCode: 'context_continuity_rate', value: 'PASS', reasonCode: null }), // clean, never counted (no reason code)
];
assert('reasonCodeDistribution counts FINDINGS (3), not deduped by interaction', reasonCodeDistribution(reasonFindings)[0].count, 3);
assert('reasonCodeAffectedInteractions counts DISTINCT interactions (2), the different unit', reasonCodeAffectedInteractions(reasonFindings, 'context_continuity_rate', 'PREVIOUS_INFORMATION_IGNORED'), 2);
assert('a clean finding (no reasonCode) never appears in the distribution', reasonCodeDistribution(reasonFindings).reduce((n, r) => n + r.count, 0), 3);

// --- §18 agent aggregation: each agent's ratio keeps its own denominator. ---

const agentFindings = [
  finding({ id: 'f1', agentId: 'agent-a', parameterCode: 'task_progression_rate', value: 'PASS' }),
  finding({ id: 'f2', agentId: 'agent-a', parameterCode: 'task_progression_rate', value: 'FAIL' }),
  finding({ id: 'f3', agentId: 'agent-b', parameterCode: 'task_progression_rate', value: 'PASS' }),
];
const agentReviews = [
  review({ id: 'r1', agentId: 'agent-a', status: 'submitted', interactionId: 'int-1' }),
  review({ id: 'r2', agentId: 'agent-b', status: 'submitted', interactionId: 'int-2' }),
];
const agg = agentAggregation(agentFindings, agentReviews);
assert('agent-a task_progression_rate: 1/2 (its own findings only)', agg.find((a) => a.agentId === 'agent-a').ratios.task_progression_rate, { parameterCode: 'task_progression_rate', numerator: 1, denominator: 2, rate: 0.5 });
assert('agent-b task_progression_rate: 1/1, not polluted by agent-a\'s findings', agg.find((a) => a.agentId === 'agent-b').ratios.task_progression_rate, { parameterCode: 'task_progression_rate', numerator: 1, denominator: 1, rate: 1 });

// --- §17 trends: a period with no eligible observations is absent /
// null-rate, never a fabricated 0%; no interpolation of missing periods. ---

const trendFindings = [
  finding({ id: 'f1', parameterCode: 'task_progression_rate', value: 'PASS', submittedAt: '2026-10-05T00:00:00Z' }),
  finding({ id: 'f2', parameterCode: 'task_progression_rate', value: 'FAIL', submittedAt: '2026-10-06T00:00:00Z' }),
  finding({ id: 'f3', parameterCode: 'task_progression_rate', value: 'PASS', submittedAt: '2026-11-02T00:00:00Z' }), // a later, separate month
];
const monthly = trendBuckets(trendFindings, [], 'task_progression_rate', 'month');
assert('trendBuckets produces exactly the 2 months that actually have data (no interpolated gap month)', monthly.map((b) => b.periodStart), ['2026-10-01', '2026-11-01']);
assert('October bucket: 1 PASS / 2 total', monthly[0].rate, 0.5);
assert('November bucket: 1/1', monthly[1].rate, 1);

const weekly = trendBuckets([finding({ submittedAt: '2026-10-07T00:00:00Z', parameterCode: 'task_progression_rate', value: 'PASS' })], [], 'task_progression_rate', 'week');
assert('weekly bucket starts on the Monday of that week (2026-10-07 is a Wednesday -> Monday 2026-10-05)', weekly[0].periodStart, '2026-10-05');

// --- §19 interaction-level outcomes: PARTIAL/CANNOT_DETERMINE are their
// own buckets, never folded into YES; in_progress reviews excluded. ---

const outcomeReviews = [
  review({ id: 'r1', status: 'submitted', requestCompletion: 'YES' }),
  review({ id: 'r2', status: 'submitted', requestCompletion: 'PARTIAL' }),
  review({ id: 'r3', status: 'submitted', requestCompletion: null }), // reviewer never set it
  review({ id: 'r4', status: 'in_progress', requestCompletion: 'YES' }), // must be excluded — not submitted
];
const outcomes = interactionOutcomeAggregation(outcomeReviews);
assert('PARTIAL is its own bucket, not folded into YES', outcomes.requestCompletion.counts, { YES: 1, PARTIAL: 1 });
assert('an unset conclusion is counted as notSet, not silently defaulted to any value', outcomes.requestCompletion.notSet, 1);
assert('in_progress reviews are excluded from the submitted-only total (3, not 4)', outcomes.requestCompletion.total, 3);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
