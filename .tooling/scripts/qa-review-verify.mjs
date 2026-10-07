import { computeVoiceTurnId } from '../tmp/qaTurnIdentity.mjs';
import { voiceTurnsFromTranscript, chatTurnsFromMessages, qaReviewableTurns } from '../tmp/qaConversation.mjs';
import { computeTier1Applicability, goodNextAutoFindings } from '../tmp/qaApplicability.mjs';
import { QA_PARAMETERS, QA_PARAMETER_CODES, QA_TIER_1_PARAMETERS, requiresReasonCode, isValidReasonCode, isValidResultValue } from '../tmp/qaParameters.mjs';
import { computeQaRatios } from '../tmp/qaRatios.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// --- Voice turn identity: deterministic, never raw array position ---

const entriesA = [
  { timestamp: '2026-10-01T10:00:00.123456Z', speaker: 'customer', text: 'hi' },
  { timestamp: '2026-10-01T10:00:01.123456Z', speaker: 'agent', text: 'hello' },
];
const idsA = computeVoiceTurnId('int-1', entriesA);
assert('voice turn ids are stable across an identical re-fetch', idsA, computeVoiceTurnId('int-1', entriesA));

const entriesCollision = [
  { timestamp: '2026-10-01T10:00:00.000000Z', speaker: 'agent', text: 'first' },
  { timestamp: '2026-10-01T10:00:00.000000Z', speaker: 'agent', text: 'second' },
];
const idsCollision = computeVoiceTurnId('int-2', entriesCollision);
assert('same (timestamp, speaker) collision produces two distinct ids', idsCollision[0] !== idsCollision[1], true);
assert('collision-breaker index never changes the first occurrence\'s id', idsCollision[0], 'int-2:2026-10-01T10:00:00.000000Z:agent');

// If a turn is deleted from the middle and the array re-indexed, ids for
// the SURVIVING turns (keyed by their own timestamp+speaker) must be
// unchanged — proving identity isn't derived from array position.
const reordered = [entriesA[1]];
assert('turn id does not shift when an earlier turn is removed (not position-derived)', computeVoiceTurnId('int-1', reordered)[0], idsA[1]);

// --- Turn role normalization (voice 'ai'/'agent' both -> 'agent') ---

const voiceTurns = voiceTurnsFromTranscript('int-3', [
  { timestamp: '2026-10-01T10:00:00Z', speaker: 'customer', text: 'c1' },
  { timestamp: '2026-10-01T10:00:01Z', speaker: 'ai', text: 'a1' },
  { timestamp: '2026-10-01T10:00:02Z', speaker: 'customer', text: 'c2' },
  { timestamp: '2026-10-01T10:00:03Z', speaker: 'agent', text: 'a2' },
]);
assert('voice roles collapse to agent/customer only', voiceTurns.map((t) => t.role), ['customer', 'agent', 'customer', 'agent']);
assert('reviewable turns = agent turns only (customer turns are evidence-only, never independently reviewed)', qaReviewableTurns(voiceTurns).length, 2);

const chatTurns = chatTurnsFromMessages([
  { id: 'sess-1', role: 'user', text: 'hi', timestamp: '2026-10-01T10:00:00Z' },
  { id: 'sess-2', role: 'ai', text: 'hello', timestamp: '2026-10-01T10:00:01Z' },
]);
assert('chat roles map user->customer, ai->agent', chatTurns.map((t) => t.role), ['customer', 'agent']);
assert('chat turn id reuses the already-deterministic ChatMessage.id, unchanged', chatTurns[0].turnId, 'sess-1');

// --- Applicability model: structural Tier-1 rules, never NLP/heuristic ---

const appTurns = [
  { turnId: 'c1', role: 'customer' },
  { turnId: 'a1', role: 'agent' },
  { turnId: 'c2', role: 'customer' },
  { turnId: 'a2', role: 'agent' },
];
const app = computeTier1Applicability(appTurns);
assert('first agent turn is structurally first', app.get('a1').isFirstAgentTurn, true);
assert('second agent turn is not the first', app.get('a2').isFirstAgentTurn, false);
assert('first agent turn responds to the first customer turn (follow-up has no meaning yet)', app.get('a1').respondingToFirstCustomerTurn, true);
assert('second agent turn (after the 2nd customer turn) is a real follow-up', app.get('a2').respondingToFirstCustomerTurn, false);

const autoFirst = goodNextAutoFindings(app.get('a1'));
assert('Good+Next on the first agent turn never fabricates Context Continuity or Follow-up Understanding', autoFirst.map((f) => f.parameterCode).sort(), ['task_progression_rate']);

const autoSecond = goodNextAutoFindings(app.get('a2'));
assert('Good+Next on a later agent turn records all three Tier-1 parameters', autoSecond.map((f) => f.parameterCode).sort(), ['context_continuity_rate', 'followup_understanding_rate', 'task_progression_rate'].sort());
assert('Good+Next auto-findings are always PASS (the clean value), never fabricated as anything else', autoSecond.every((f) => f.value === 'PASS'), true);

// --- "unreviewed is not PASS": Tier-2 parameters are NEVER auto-recorded ---

assert('Tier-1 set is exactly the three structural parameters', [...QA_TIER_1_PARAMETERS].sort(), ['context_continuity_rate', 'followup_understanding_rate', 'task_progression_rate'].sort());
const tier2Codes = QA_PARAMETER_CODES.filter((c) => QA_PARAMETERS[c].tier === 2);
assert('Tier-2 parameters never appear in a Good+Next auto-finding set', tier2Codes.some((c) => autoSecond.map((f) => f.parameterCode).includes(c)), false);

// --- Reason code / result value validation ---

assert('a problem value requires a reason code', requiresReasonCode('context_continuity_rate', 'FAIL'), true);
assert('the clean value never requires a reason code', requiresReasonCode('context_continuity_rate', 'PASS'), false);
assert('a reason code must belong to its own parameter\'s vocabulary', isValidReasonCode('context_continuity_rate', 'AGENT_REPEATED_QUESTION'), false);
assert('N_A is a valid result value for every parameter', QA_PARAMETER_CODES.every((c) => isValidResultValue(c, 'N_A')), true);

// --- Ratio math: numerator/denominator/exclusions per the Measurement Contract ---

const findings = [
  { reviewId: 'r1', parameterCode: 'context_continuity_rate', value: 'PASS' },
  { reviewId: 'r1', parameterCode: 'context_continuity_rate', value: 'FAIL' },
  { reviewId: 'r1', parameterCode: 'context_continuity_rate', value: 'N_A' },
];
const ccRatio = computeQaRatios(findings).context_continuity_rate;
assert('N_A is excluded from both numerator and denominator', ccRatio, { parameterCode: 'context_continuity_rate', numerator: 1, denominator: 2, rate: 0.5 });

const groundingFindings = [
  { reviewId: 'r1', parameterCode: 'response_grounding_rate', value: 'GROUNDED' },
  { reviewId: 'r1', parameterCode: 'response_grounding_rate', value: 'NOT_GROUNDED' },
  { reviewId: 'r1', parameterCode: 'response_grounding_rate', value: 'CANNOT_VERIFY' },
  { reviewId: 'r1', parameterCode: 'response_grounding_rate', value: 'N_A' },
];
const groundingRatio = computeQaRatios(groundingFindings).response_grounding_rate;
assert('response_grounding_rate denominator excludes BOTH CANNOT_VERIFY and N_A', groundingRatio, { parameterCode: 'response_grounding_rate', numerator: 1, denominator: 2, rate: 0.5 });

const repetitionFindings = [
  { reviewId: 'r1', parameterCode: 'repetition_loop_rate', value: 'ISSUE' },
  { reviewId: 'r1', parameterCode: 'repetition_loop_rate', value: 'NO_ISSUE' }, // same review, 2nd turn — must not double count the review
  { reviewId: 'r2', parameterCode: 'repetition_loop_rate', value: 'NO_ISSUE' },
];
const repetitionRatio = computeQaRatios(repetitionFindings).repetition_loop_rate;
assert('repetition_loop_rate rolls up to INTERACTION level — one review with any ISSUE counts once, not per-turn', repetitionRatio, { parameterCode: 'repetition_loop_rate', numerator: 1, denominator: 2, rate: 0.5 });

const emptyRatio = computeQaRatios([]).customer_correction_rate;
assert('zero eligible findings -> rate is null, never fabricated as 0%', emptyRatio.rate, null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
