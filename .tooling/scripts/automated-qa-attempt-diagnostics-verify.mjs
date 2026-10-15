// Session 16.4.4 — Automated QA attempt diagnostics. Deterministic
// coverage of the REAL compiled modules (via esbuild, not a
// reimplementation — same discipline as every other *-verify.mjs in
// this repo): src/server/qa/automatedQaEvaluator.ts's new `attempts`
// output, and src/lib/automatedQaAttemptDiagnostics.ts's pure helpers.
// global.fetch is stubbed deterministically per test, same pattern as
// automated-qa-evaluator-verify.mjs — no live LLM call required.
import { evaluateInteraction } from '../tmp/automatedQaEvaluator.mjs';
import { boundRawResponse, RAW_RESPONSE_MAX_CHARS, countRawParameterOccurrences, persistAttemptDiagnosticsSafely } from '../tmp/automatedQaAttemptDiagnostics.mjs';

process.env.VOICEBOT_BASE_URL = 'https://stub.invalid';
process.env.VOICEBOT_API_KEY = 'stub-key';

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

function turn(id, role, text) {
  return { turnId: id, role, speakerLabel: role === 'agent' ? 'AI' : 'Customer', timestamp: '2026-10-07T10:00:00Z', text };
}

function jsonResponse(body) {
  const text = JSON.stringify(body);
  return { ok: true, status: 200, text: async () => text };
}

function llmSuccess({ requestId, observations = [], unassessable = [] }) {
  return jsonResponse({
    success: true, request_id: requestId,
    output: { interaction_assessment: { summary: 's', evaluation_completeness: 'COMPLETE' }, observations, unassessable_parameters: unassessable },
    model_id: 'Qwen/Qwen2.5-7B-Instruct-AWQ', finish_reason: 'stop', latency_ms: 64,
    usage: { prompt_tokens: 100, completion_tokens: 20 }, error_code: null, error_message: null,
  });
}

function llmError(errorCode) {
  return jsonResponse({
    success: false, request_id: 'x', output: null, model_id: 'Qwen/Qwen2.5-7B-Instruct-AWQ',
    finish_reason: 'error', latency_ms: null, usage: { prompt_tokens: null, completion_tokens: null },
    error_code: errorCode, error_message: `stub ${errorCode}`,
  });
}

async function withStubbedFetch(impl, run) {
  const original = global.fetch;
  let callCount = 0;
  global.fetch = async (...args) => { callCount += 1; return impl(callCount, ...args); };
  try {
    return await run(() => callCount);
  } finally {
    global.fetch = original;
  }
}

async function test() {
  // 1. Single successful attempt -> exactly one attempt record, outcome
  // 'success', distinct attemptId/requestId, correct window association.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      (n) => llmSuccess({ requestId: `r${n}`, observations: [{ parameter_code: 'task_progression_rate', primary_turn_id: 'T1', value: 'PASS' }] }),
      () => evaluateInteraction(turns),
    );
    assert('exactly one attempt recorded for a single-attempt window', result.attempts.length, 1);
    assert('the attempt outcome is success', result.attempts[0].outcome, 'success');
    assert('attemptNumber starts at 1', result.attempts[0].attemptNumber, 1);
    assert('windowIndex is recorded', result.attempts[0].windowIndex, 0);
    assertTrue('attemptId is a real uuid-shaped string', /^[0-9a-f-]{36}$/i.test(result.attempts[0].attemptId));
    assert('retryReason is null for the first attempt', result.attempts[0].retryReason, null);
    assert('previousAttemptId is null for the first attempt', result.attempts[0].previousAttemptId, null);
    assertTrue('raw response text is captured verbatim', result.attempts[0].rawResponseText.includes('task_progression_rate'));
  }

  // 2. Validation failure (contradiction) followed by a successful retry
  // -> two distinguishable attempt records, linked, with distinct
  // request/attempt ids and the correction instruction identified.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      (n) => {
        if (n === 1) {
          return llmSuccess({
            requestId: 'r1',
            observations: [{ parameter_code: 'context_continuity_rate', primary_turn_id: 'T1', value: 'PASS' }],
            unassessable: [{ parameter_code: 'context_continuity_rate', reason: 'not applicable' }],
          });
        }
        return llmSuccess({ requestId: 'r2', observations: [{ parameter_code: 'task_progression_rate', primary_turn_id: 'T1', value: 'PASS' }] });
      },
      () => evaluateInteraction(turns),
    );
    assert('an evaluation with one retry has exactly two distinguishable attempt records', result.attempts.length, 2);
    const [a1, a2] = result.attempts;
    assert('the first attempt is the contradiction', a1.outcome, 'contradictory_applicability');
    assert('the second attempt succeeds', a2.outcome, 'success');
    assertTrue('the two attempts have distinct attemptIds', a1.attemptId !== a2.attemptId);
    assertTrue('the two attempts have distinct requestIds', a1.requestId !== a2.requestId);
    assert('attempt numbers are 1 and 2 within the window', [a1.attemptNumber, a2.attemptNumber], [1, 2]);
    assert('the retry is linked to its parent via previousAttemptId', a2.previousAttemptId, a1.attemptId);
    assert('the retry records why it happened', a2.retryReason, 'contradictory_applicability');
    assert('the retry records which correction instruction was used', a2.correctionInstructionId, 'consistency_retry_v1');
    assertTrue('the contradiction attempt records the exact conflicting parameter code', a1.validationDetail.contradiction.parameterCodes.includes('context_continuity_rate'));
    assert('occurrence counts in the raw observations array are recorded', a1.validationDetail.contradiction.observationOccurrences.context_continuity_rate, 1);
    assert('occurrence counts in the raw unassessable_parameters array are recorded', a1.validationDetail.contradiction.unassessableOccurrences.context_continuity_rate, 1);
    assert('the contradiction attempt detected it at the cross-array-contradiction stage', a1.validationDetail.contradiction.detectedAt, 'cross_array_contradiction');
  }

  // 3. Validation failure followed by a FAILED retry (placeholder
  // unassessability persisting) -> two attempt records, both failed,
  // correctly linked, no observations fabricated.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      () => llmSuccess({ requestId: 'r', observations: [], unassessable: [{ parameter_code: 'context_continuity_rate', reason: 'NA' }] }),
      () => evaluateInteraction(turns),
    );
    assert('two attempts recorded (initial + the one placeholder retry)', result.attempts.length, 2);
    assert('both attempts are the placeholder-unassessability defect', result.attempts.map((a) => a.outcome), ['uninformative_unassessability', 'uninformative_unassessability']);
    assert('the second attempt is linked to the first', result.attempts[1].previousAttemptId, result.attempts[0].attemptId);
    assert('the second attempt records the placeholder correction id', result.attempts[1].correctionInstructionId, 'placeholder_retry_v1');
    assertTrue('the placeholder detail names the exact parameter code', result.attempts[0].validationDetail.placeholder.parameterCodes.includes('context_continuity_rate'));
    assert('the evaluation itself still fails closed, no observations fabricated', result.status, 'failed');
  }

  // 4. Transport failure (network_error) -> classified as transport_failure, no raw response captured (never received a body).
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      () => { throw new Error('ECONNRESET'); },
      () => evaluateInteraction(turns),
    );
    assertTrue('at least one attempt is recorded for a transport failure', result.attempts.length >= 1);
    assert('the outcome is classified as a transport failure', result.attempts[0].outcome, 'transport_failure');
    assert('no raw response text exists for a transport-level failure', result.attempts[0].rawResponseText, null);
    assert('the error code is preserved', result.attempts[0].errorCode, 'network_error');
  }

  // 5. Malformed (non-JSON) response -> classified as parse_failure, raw response text preserved verbatim (not normalized away).
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      () => ({ ok: true, status: 200, text: async () => 'not actually json {{{' }),
      () => evaluateInteraction(turns),
    );
    assert('the outcome is classified as a parse failure', result.attempts[0].outcome, 'parse_failure');
    assert('the raw malformed body is preserved verbatim, not normalized', result.attempts[0].rawResponseText, 'not actually json {{{');
  }

  // 6. Correct window association across a multi-window evaluation —
  // each window's attempts carry that window's own windowIndex.
  {
    const longText = 'x'.repeat(2000);
    const turns = Array.from({ length: 20 }, (_, i) => turn(`t${i}`, i % 2 === 0 ? 'customer' : 'agent', longText));
    const result = await withStubbedFetch(
      (n) => llmSuccess({ requestId: `r${n}`, observations: [{ parameter_code: 'task_progression_rate', primary_turn_id: 'T1', value: 'PASS' }] }),
      () => evaluateInteraction(turns),
    );
    assertTrue('multiple windows produce multiple attempts', result.attempts.length === result.windowCount);
    const windowIndexes = new Set(result.attempts.map((a) => a.windowIndex));
    assert('every window has a distinct windowIndex represented', windowIndexes.size, result.windowCount);
  }

  // 7. Existing evaluation persistence/business fields are unchanged by
  // the new attempts field — same values as before this session for an
  // identical scenario (regression guard against #6 inventing new
  // evaluation outcomes or weakening validation).
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      (n) => llmSuccess({ requestId: `r${n}`, observations: [{ parameter_code: 'task_progression_rate', primary_turn_id: 'T1', value: 'PASS' }] }),
      () => evaluateInteraction(turns),
    );
    assert('status unaffected by attempt diagnostics', result.status, 'completed');
    assert('observations unaffected', result.observations.length, 1);
    assert('every request id is still distinct, fixing the historical duplicate-id defect', new Set(result.requestIds).size, result.requestIds.length);
  }

  // 8. Individually-rejected observation entries (bad turn id) are
  // preserved as diagnostics without changing enforcement — the entry
  // is still dropped from the real observations, but now diagnosable.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      () => llmSuccess({
        requestId: 'r1',
        observations: [
          { parameter_code: 'task_progression_rate', primary_turn_id: 'T99', value: 'PASS' },
          { parameter_code: 'context_continuity_rate', primary_turn_id: 'T1', value: 'PASS' },
        ],
      }),
      () => evaluateInteraction(turns),
    );
    assert('the bad-turn-id entry is still dropped from real observations (enforcement unchanged)', result.observations.length, 1);
    assert('the rejection is preserved for diagnosis on the attempt record', result.attempts[0].validationDetail.rejectedObservations.length, 1);
  }

  // --- Pure helpers (src/lib/automatedQaAttemptDiagnostics.ts) ---

  // 9. Raw response bounding — long text is truncated with a marker, short text is untouched.
  {
    const short = 'a short response';
    assert('short raw response is untouched', boundRawResponse(short), short);
    assert('null stays null', boundRawResponse(null), null);
    const long = 'x'.repeat(RAW_RESPONSE_MAX_CHARS + 500);
    const bounded = boundRawResponse(long);
    assertTrue('a long raw response is truncated to the bound plus a marker', bounded.length < long.length && bounded.includes('truncated'));
    assertTrue('the truncated prefix is preserved verbatim up to the bound', bounded.startsWith('x'.repeat(RAW_RESPONSE_MAX_CHARS)));
  }

  // 10. countRawParameterOccurrences — counts only the requested codes, ignores unrelated entries.
  {
    const raw = [{ parameter_code: 'a' }, { parameter_code: 'a' }, { parameter_code: 'b' }, { parameter_code: 'c' }, 'not-an-object', null];
    assert('counts occurrences per requested code only', countRawParameterOccurrences(raw, ['a', 'b']), { a: 2, b: 1 });
    assert('non-array input returns zero counts, never throws', countRawParameterOccurrences(null, ['a']), { a: 0 });
  }

  // 11. Diagnostic-storage failure resilience — persistAttemptDiagnosticsSafely never throws/rejects, whether the write rejects, resolves with an error, or succeeds; a no-attempts call is a no-op.
  {
    const r1 = await persistAttemptDiagnosticsSafely(async () => { throw new Error('connection reset'); }, 'eval-1', [{ a: 1 }], 'now');
    assert('a write that throws resolves to a safe not-ok result, never rejects', r1, { ok: false, error: 'connection reset' });

    const r2 = await persistAttemptDiagnosticsSafely(async () => ({ error: { message: 'relation does not exist' } }), 'eval-1', [{ a: 1 }], 'now');
    assert('a write that resolves with an error resolves to a safe not-ok result', r2, { ok: false, error: 'relation does not exist' });

    let called = false;
    const r3 = await persistAttemptDiagnosticsSafely(async () => { called = true; return { error: null }; }, 'eval-1', [{ a: 1 }], 'now');
    assert('a successful write resolves ok', r3, { ok: true, error: null });
    assertTrue('the write function is actually invoked when there are attempts', called);

    let calledForEmpty = false;
    const r4 = await persistAttemptDiagnosticsSafely(async () => { calledForEmpty = true; return { error: null }; }, 'eval-1', [], 'now');
    assert('an empty attempts array is a safe no-op', r4, { ok: true, error: null });
    assertTrue('the write function is never invoked for an empty attempts array', !calledForEmpty);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

test();
