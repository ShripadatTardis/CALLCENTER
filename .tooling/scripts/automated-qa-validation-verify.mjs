// Session 16.3 — evidence validation, against the REAL compiled
// src/lib/automatedQaValidation.ts (via esbuild, not a reimplementation).
import { validateAutomatedObservations, validateUnassessableParameters, allCanonicalParameterCodesCovered, detectCrossArrayContradiction, isPlaceholderUnassessabilityReason, detectPlaceholderUnassessability } from '../tmp/automatedQaValidation.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

const validTurnIds = new Set(['t1', 't2', 't3']);

// 1. A clean (eligible, no-problem) observation is accepted.
{
  const r = validateAutomatedObservations(
    [{ parameter_code: 'task_progression_rate', primary_turn_id: 't1', value: 'PASS' }],
    validTurnIds,
  );
  assert('clean PASS observation accepted', r.accepted.length, 1);
  assert('clean observation requires no reason_code', r.accepted[0].reasonCode, null);
}

// 2. An exception observation with a valid reason code is accepted.
{
  const r = validateAutomatedObservations(
    [{ parameter_code: 'repetition_loop_rate', primary_turn_id: 't2', value: 'ISSUE', reason_code: 'AGENT_REPEATED_ANSWER', evidence_turn_ids: ['t1'] }],
    validTurnIds,
  );
  assert('exception observation with valid reason accepted', r.accepted.length, 1);
  assert('evidence_turn_ids preserved', r.accepted[0].evidenceTurnIds, ['t1']);
}

// 3. Unknown parameter_code rejected.
{
  const r = validateAutomatedObservations([{ parameter_code: 'not_a_real_parameter', primary_turn_id: 't1', value: 'PASS' }], validTurnIds);
  assert('unknown parameter_code rejected', r.accepted.length, 0);
  assert('unknown parameter_code reported', r.rejected.length, 1);
}

// 4. Value not allowed for that parameter rejected.
{
  const r = validateAutomatedObservations([{ parameter_code: 'task_progression_rate', primary_turn_id: 't1', value: 'GROUNDED' }], validTurnIds);
  assert('value invalid for parameter rejected', r.accepted.length, 0);
}

// 5. Fabricated primary_turn_id rejected, never silently repaired.
{
  const r = validateAutomatedObservations([{ parameter_code: 'task_progression_rate', primary_turn_id: 'fabricated-99', value: 'PASS' }], validTurnIds);
  assert('fabricated primary_turn_id rejected', r.accepted.length, 0);
  assert('fabricated turn id surfaced in rejection reason', r.rejected[0].reason.includes('fabricated-99'), true);
}

// 6. Fabricated evidence_turn_ids rejected.
{
  const r = validateAutomatedObservations(
    [{ parameter_code: 'repetition_loop_rate', primary_turn_id: 't1', value: 'ISSUE', reason_code: 'AGENT_REPEATED_ANSWER', evidence_turn_ids: ['ghost'] }],
    validTurnIds,
  );
  assert('fabricated evidence_turn_id rejected', r.accepted.length, 0);
}

// 7. Missing reason_code on a problem value rejected.
{
  const r = validateAutomatedObservations([{ parameter_code: 'context_continuity_rate', primary_turn_id: 't1', value: 'FAIL' }], validTurnIds);
  assert('FAIL without reason_code rejected', r.accepted.length, 0);
}

// 8. Invalid reason_code for the parameter rejected.
{
  const r = validateAutomatedObservations(
    [{ parameter_code: 'context_continuity_rate', primary_turn_id: 't1', value: 'FAIL', reason_code: 'AGENT_REPEATED_ANSWER' }],
    validTurnIds,
  );
  assert('reason_code belonging to a different parameter rejected', r.accepted.length, 0);
}

// 9. CANNOT_VERIFY on response_grounding_rate is a valid, acceptable value (data gap, not a quality failure — enforced downstream by ratios, not relaxed here).
{
  const r = validateAutomatedObservations(
    [{ parameter_code: 'response_grounding_rate', primary_turn_id: 't1', value: 'CANNOT_VERIFY', reason_code: 'CANNOT_VERIFY_SOURCE' }],
    validTurnIds,
  );
  assert('CANNOT_VERIFY with its own reason code accepted', r.accepted.length, 1);
}

// 10. Duplicate/contradictory observation for the same opportunity rejected (first wins).
{
  const r = validateAutomatedObservations(
    [
      { parameter_code: 'task_progression_rate', primary_turn_id: 't1', value: 'PASS' },
      { parameter_code: 'task_progression_rate', primary_turn_id: 't1', value: 'FAIL', reason_code: 'IRRELEVANT_RESPONSE' },
    ],
    validTurnIds,
  );
  assert('first observation for an opportunity wins', r.accepted.length, 1);
  assert('first observation value preserved', r.accepted[0].value, 'PASS');
  assert('the contradictory duplicate is rejected, not silently merged', r.rejected.length, 1);
}

// 11. Non-array input rejected wholesale.
{
  const r = validateAutomatedObservations('not-an-array', validTurnIds);
  assert('non-array observations rejected wholesale', r.accepted.length, 0);
}

// 12. unassessable_parameters: well-formed entries accepted, malformed dropped.
{
  const r = validateUnassessableParameters([
    { parameter_code: 'response_grounding_rate', reason: 'No source evidence available.' },
    { parameter_code: 'bogus', reason: 'x' },
    { parameter_code: 'reference_resolution_accuracy' },
  ]);
  assert('only the well-formed unassessable entry survives', r.length, 1);
  assert('well-formed entry parameter_code preserved', r[0].parameterCode, 'response_grounding_rate');
}

// 13. Session 16.3.5 — cross-array contradiction detection. A parameter
// must never appear in both observations and unassessable_parameters in
// the same response (found live: PASS/100% for a parameter the model's
// own unassessable_parameters entry called "not applicable").
{
  const conflicts = detectCrossArrayContradiction(
    [{ parameterCode: 'context_continuity_rate' }, { parameterCode: 'task_progression_rate' }],
    [{ parameterCode: 'context_continuity_rate' }, { parameterCode: 'reference_resolution_accuracy' }],
  );
  assert('detects the parameter present in both collections', conflicts, ['context_continuity_rate']);
}
{
  const conflicts = detectCrossArrayContradiction(
    [{ parameterCode: 'task_progression_rate' }],
    [{ parameterCode: 'reference_resolution_accuracy' }],
  );
  assert('no conflicts when the two collections are disjoint', conflicts, []);
}
{
  const conflicts = detectCrossArrayContradiction([], []);
  assert('no conflicts on two empty collections', conflicts, []);
}
{
  const conflicts = detectCrossArrayContradiction(
    [{ parameterCode: 'context_continuity_rate' }, { parameterCode: 'followup_understanding_rate' }],
    [{ parameterCode: 'context_continuity_rate' }, { parameterCode: 'followup_understanding_rate' }, { parameterCode: 'task_progression_rate' }],
  );
  assert('detects multiple simultaneous conflicts', conflicts.sort(), ['context_continuity_rate', 'followup_understanding_rate']);
}

// 14. Session 16.3.8 (A4) — placeholder unassessability-reason
// detection (evaluation cbaa9075: zero observations, nine unassessable
// entries, every reason literally "N_A").
assert('placeholder reason "N_A" detected', isPlaceholderUnassessabilityReason('N_A'), true);
assert('placeholder reason "NA" detected', isPlaceholderUnassessabilityReason('NA'), true);
assert('placeholder reason "-" detected', isPlaceholderUnassessabilityReason('-'), true);
assert('placeholder reason "" (empty) detected', isPlaceholderUnassessabilityReason(''), true);
assert('placeholder reason "n/a" (lowercase, slash) detected', isPlaceholderUnassessabilityReason('n/a'), true);
assert('whitespace-only reason detected as placeholder', isPlaceholderUnassessabilityReason('   '), true);
assert('a real, specific reason is NOT flagged as placeholder', isPlaceholderUnassessabilityReason('The agent never asked a clarifying question in this conversation.'), false);
assert('a short but genuinely specific reason is NOT flagged merely for brevity', isPlaceholderUnassessabilityReason('No reference was made in this call.'), false);
{
  const codes = detectPlaceholderUnassessability([
    { parameterCode: 'context_continuity_rate', reason: 'N_A' },
    { parameterCode: 'task_progression_rate', reason: 'The agent never progressed the task because the call ended immediately.' },
    { parameterCode: 'reference_resolution_accuracy', reason: '-' },
  ]);
  assert('only placeholder-reason entries are flagged, real ones are not', codes.sort(), ['context_continuity_rate', 'reference_resolution_accuracy']);
}
{
  const codes = detectPlaceholderUnassessability([
    { parameterCode: 'context_continuity_rate', reason: 'This was the agent\'s first turn, so nothing could be carried forward.' },
  ]);
  assert('a genuine all-N/A entry with a real reason is never flagged', codes, []);
}

assert('canonical parameter codes sanity check passes against the real dictionary', allCanonicalParameterCodesCovered([
  'context_continuity_rate', 'followup_understanding_rate', 'reference_resolution_accuracy', 'task_progression_rate',
  'unnecessary_clarification_rate', 'repetition_loop_rate', 'customer_correction_rate', 'conversation_recovery_rate', 'response_grounding_rate',
]), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
