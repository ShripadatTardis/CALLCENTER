import {
  inferredExceptionValue, isAdverseValue, isExceptionFinding, evidenceChoices,
  mergeFlagFindings, turnStatusForExplicitFindings, humanizeReasonCode,
} from '../tmp/qaExceptionEditor.mjs';
import { QA_PARAMETER_CODES, QA_PARAMETERS } from '../tmp/qaParameters.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// --- Session 16.1.1: Flag Issue must not re-ask a value that is already
// implied by selecting the parameter as an exception (§6). ---

assert('context_continuity_rate (single problem value) infers FAIL', inferredExceptionValue('context_continuity_rate'), 'FAIL');
assert('repetition_loop_rate (single problem value) infers ISSUE', inferredExceptionValue('repetition_loop_rate'), 'ISSUE');
assert('conversation_recovery_rate (single problem value) infers UNSUCCESSFUL', inferredExceptionValue('conversation_recovery_rate'), 'UNSUCCESSFUL');
assert('response_grounding_rate (TWO problem values) cannot be inferred — UI must ask', inferredExceptionValue('response_grounding_rate'), null);
assert('every non-grounding parameter has exactly one problem value (inferrable)', QA_PARAMETER_CODES.filter((c) => c !== 'response_grounding_rate').every((c) => inferredExceptionValue(c) !== null), true);

// --- §7: CANNOT_VERIFY is a data gap, never a quality failure. ---

assert('response_grounding_rate NOT_GROUNDED is adverse', isAdverseValue('response_grounding_rate', 'NOT_GROUNDED'), true);
assert('response_grounding_rate CANNOT_VERIFY is NOT adverse (data gap, not a failure)', isAdverseValue('response_grounding_rate', 'CANNOT_VERIFY'), false);
assert('context_continuity_rate FAIL is adverse', isAdverseValue('context_continuity_rate', 'FAIL'), true);
assert('context_continuity_rate PASS is not adverse', isAdverseValue('context_continuity_rate', 'PASS'), false);

// --- §13: only genuine exceptions (value !== clean) should re-open as a
// selected chip when editing a previously-reviewed turn. ---

assert('a clean (PASS) finding is not an exception finding', isExceptionFinding('task_progression_rate', 'PASS'), false);
assert('a FAIL finding is an exception finding', isExceptionFinding('task_progression_rate', 'FAIL'), true);
assert('an N_A override is an exception finding (applicability override, still worth re-showing)', isExceptionFinding('task_progression_rate', 'N_A'), true);

// --- §9: the primary (current) turn is never its own supporting evidence. ---

const turns = [{ turnId: 't1' }, { turnId: 't2' }, { turnId: 't3' }];
assert('evidenceChoices excludes the primary turn', evidenceChoices(turns, 't2').map((t) => t.turnId), ['t1', 't3']);

// --- §3/§6: "Unreviewed ≠ PASS" survives the redesign — Tier-1 params the
// reviewer did not touch still get their auto-clean finding merged in. ---

const tier1Auto = [
  { parameterCode: 'context_continuity_rate', value: 'PASS' },
  { parameterCode: 'followup_understanding_rate', value: 'PASS' },
  { parameterCode: 'task_progression_rate', value: 'PASS' },
];
const explicitOne = [{ parameterCode: 'repetition_loop_rate', value: 'ISSUE', reasonCode: 'AGENT_REPEATED_ANSWER', evidenceTurnIds: ['t2'], note: null }];
const merged = mergeFlagFindings(explicitOne, tier1Auto);
assert('merge includes the 1 explicit exception plus the 3 untouched Tier-1 auto-clean findings', merged.length, 4);
assert('the explicit finding is preserved exactly (not overwritten)', merged.find((f) => f.parameterCode === 'repetition_loop_rate'), explicitOne[0]);
assert('an untouched Tier-1 param gets its auto-clean value, not dropped', merged.find((f) => f.parameterCode === 'task_progression_rate').value, 'PASS');

const explicitOverridesTier1 = [{ parameterCode: 'context_continuity_rate', value: 'FAIL', reasonCode: 'WRONG_CONTEXT_CARRIED_FORWARD', evidenceTurnIds: [], note: null }];
const mergedOverride = mergeFlagFindings(explicitOverridesTier1, tier1Auto);
assert('a Tier-1 param the reviewer DID explicitly flag keeps the reviewer value, never the auto-clean one', mergedOverride.find((f) => f.parameterCode === 'context_continuity_rate').value, 'FAIL');
assert('the other 2 untouched Tier-1 params still get merged in', mergedOverride.length, 3);

// --- turn status derivation — only the reviewer's OWN selections decide
// flagged vs. good; CANNOT_VERIFY alone never flags a turn. ---

assert('an adverse explicit finding -> flagged', turnStatusForExplicitFindings([{ parameterCode: 'repetition_loop_rate', value: 'ISSUE' }]), 'flagged');
assert('a CANNOT_VERIFY-only explicit finding -> good, not flagged (§7)', turnStatusForExplicitFindings([{ parameterCode: 'response_grounding_rate', value: 'CANNOT_VERIFY' }]), 'good');
assert('no explicit findings -> good', turnStatusForExplicitFindings([]), 'good');

// --- §5: reason codes render as readable reviewer-facing labels. ---

assert('AGENT_REPEATED_ANSWER humanizes to "Agent repeated answer"', humanizeReasonCode('AGENT_REPEATED_ANSWER'), 'Agent repeated answer');
assert('OTHER humanizes to "Other"', humanizeReasonCode('OTHER'), 'Other');
assert('every canonical reason code across all 9 parameters humanizes without throwing', QA_PARAMETER_CODES.every((c) => QA_PARAMETERS[c].reasonCodes.every((r) => typeof humanizeReasonCode(r) === 'string' && humanizeReasonCode(r).length > 0)), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
