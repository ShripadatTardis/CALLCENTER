// Session 16.3 — evaluation orchestration, against the REAL compiled
// src/server/qa/automatedQaEvaluator.ts (via esbuild, not a
// reimplementation). global.fetch is stubbed deterministically per
// test — this exercises retry/merge/windowing/failure behavior
// end-to-end without a live network call (the live API is separately
// exercised in the session's live-verification pass).
import { evaluateInteraction } from '../tmp/automatedQaEvaluator.mjs';

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
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
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
  // 1. Short conversation -> single window, clean + exception observations both persisted.
  // The LLM sees/returns the SHORT alias ("T2"), never the real long turn
  // id — regression test for the 2026-10-12 live failure where a 7B model
  // asked to echo a verbose "interactionId:timestamp:speaker" id back per
  // observation reliably ran past any reasonable output budget. The real
  // id must still be what's persisted (de-aliased before storage).
  {
    const turns = [
      turn('8d4ea4f4-2433-4475-b1f4-00646cb62c60:2026-10-12T10:46:11.317212+00:00:customer', 'customer', 'Is a passport enough for ID?'),
      turn('8d4ea4f4-2433-4475-b1f4-00646cb62c60:2026-10-12T10:46:11.317212+00:00:ai', 'agent', 'Yes, a passport works.'),
    ];
    let capturedUserPrompt = null;
    const result = await withStubbedFetch(
      (_n, _url, opts) => {
        capturedUserPrompt = JSON.parse(opts.body).user_prompt;
        return llmSuccess({
          requestId: 'r1',
          observations: [
            { parameter_code: 'task_progression_rate', primary_turn_id: 'T2', value: 'PASS' },
            { parameter_code: 'context_continuity_rate', primary_turn_id: 'T2', value: 'FAIL', reason_code: 'PREVIOUS_INFORMATION_IGNORED' },
          ],
        });
      },
      () => evaluateInteraction(turns),
    );
    assert('short conversation -> exactly 1 window', result.windowCount, 1);
    assert('short conversation -> status completed', result.status, 'completed');
    assert('both a clean and an exception observation are persisted (not exceptions-only)', result.observations.length, 2);
    assertTrue('the real (long) turn id is what gets persisted, not the alias', result.observations.every((o) => o.primaryTurnId === turns[1].turnId));
    assertTrue('the prompt shown to the LLM uses the short alias, never the real long turn id', capturedUserPrompt.includes('[T2]') && !capturedUserPrompt.includes(turns[1].turnId));
    assert('evaluationCompleteness is COMPLETE when every window succeeds', result.evaluationCompleteness, 'COMPLETE');
    assertTrue('modelId captured from the response', result.modelId === 'Qwen/Qwen2.5-7B-Instruct-AWQ');
    assert('token usage summed from the response', result.tokenUsage, { promptTokens: 100, completionTokens: 20 });
  }

  // 2. Long conversation -> multiple windows, observations merged, repetition_loop_rate caveat added.
  {
    const longText = 'x'.repeat(2000);
    const turns = Array.from({ length: 20 }, (_, i) => turn(`t${i}`, i % 2 === 0 ? 'customer' : 'agent', longText));
    const result = await withStubbedFetch(
      (n) => llmSuccess({ requestId: `r${n}`, observations: [{ parameter_code: 'task_progression_rate', primary_turn_id: 'T1', value: 'PASS' }] }),
      () => evaluateInteraction(turns),
    );
    assertTrue('long conversation splits into multiple windows', result.windowCount > 1);
    assertTrue('every window issues its own request_id', result.requestIds.length === result.windowCount);
    assertTrue('repetition_loop_rate gets a cross-window visibility caveat, not silently assumed clean', result.unassessableParameters.some((u) => u.parameterCode === 'repetition_loop_rate'));
    assert('evaluated turn ids cover the whole interaction when every window succeeds', result.evaluatedTurnIds.length, turns.length);
  }

  // 3. Retryable error (rate_limited) succeeds on retry.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      (n) => (n === 1 ? llmError('rate_limited') : llmSuccess({ requestId: 'r2', observations: [] })),
      () => evaluateInteraction(turns),
    );
    assert('a rate_limited error is retried and the window still succeeds', result.status, 'completed');
  }

  // 3b. output_truncated is deterministic, not transient — the orchestrator
  // retries with an escalated max_output_tokens (not a generic backoff
  // retry) rather than giving up immediately, per the API's own error
  // message ("Increase max_output_tokens"). Regression test for the real
  // live-verification failure on 2026-10-12.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const sentMaxOutputTokens = [];
    const result = await withStubbedFetch(
      (n, _url, opts) => {
        sentMaxOutputTokens.push(JSON.parse(opts.body).max_output_tokens);
        return n === 1 ? llmError('output_truncated') : llmSuccess({ requestId: 'r2', observations: [] });
      },
      () => evaluateInteraction(turns),
    );
    assert('an output_truncated error is retried (not treated as permanent) and the window still succeeds', result.status, 'completed');
    assertTrue('the retry escalates max_output_tokens above the first attempt', sentMaxOutputTokens[1] > sentMaxOutputTokens[0]);
  }

  // 3c. output_truncated retried every attempt still fails closed — never silently "completed" with no observations.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      () => llmError('output_truncated'),
      (getCallCount) => evaluateInteraction(turns).then((r) => ({ r, calls: getCallCount() })),
    );
    assert('output_truncated exhausting all retries still reports failed', result.r.status, 'failed');
    assertTrue('output_truncated retries are bounded, not infinite', result.calls <= 3);
  }

  // 4. Permanent validation error (invalid_request) is never retried — fails immediately.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      () => llmError('invalid_request'),
      (getCallCount) => evaluateInteraction(turns).then((r) => ({ r, calls: getCallCount() })),
    );
    assert('a permanent validation error is called exactly once, never retried', result.calls, 1);
    assert('a fully failed single-window evaluation reports status failed', result.r.status, 'failed');
    assert('the error code is preserved for diagnostics', result.r.errorCode, 'invalid_request');
  }

  // 5. One window fails after exhausting retries, another succeeds -> partial, not silently complete.
  {
    const turns1 = [turn('t1', 'agent', 'a'.repeat(50))];
    const result = await withStubbedFetch(
      () => llmError('llm_unavailable'),
      () => evaluateInteraction(turns1),
    );
    assert('all-windows-failed interaction is reported failed, never silently "completed"', result.status, 'failed');
    assertTrue('a failed evaluation never reports a fabricated COMPLETE coverage', result.evaluationCompleteness !== 'COMPLETE' || result.evaluatedTurnIds.length === 0);
  }

  // 6. Session 16.3.5 — a cross-array contradiction (same parameter in
  // both observations and unassessable_parameters) on the FIRST attempt
  // is rejected and retried once with the explicit consistency
  // instruction; if the retry response is clean, it's persisted.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const sentPrompts = [];
    const result = await withStubbedFetch(
      (n, _url, opts) => {
        sentPrompts.push(JSON.parse(opts.body).user_prompt);
        if (n === 1) {
          // T1 appears in BOTH collections — contradictory.
          return llmSuccess({
            requestId: 'r1',
            observations: [{ parameter_code: 'context_continuity_rate', primary_turn_id: 'T1', value: 'PASS' }],
            unassessable: [{ parameter_code: 'context_continuity_rate', reason: 'not applicable' }],
          });
        }
        // Retry: clean, no contradiction.
        return llmSuccess({ requestId: 'r2', observations: [{ parameter_code: 'task_progression_rate', primary_turn_id: 'T1', value: 'PASS' }] });
      },
      () => evaluateInteraction(turns),
    );
    assert('contradiction resolved on retry -> evaluation completes', result.status, 'completed');
    assert('only the retry (clean) observation is persisted, not the contradictory one', result.observations.length, 1);
    assert('the persisted observation is from the retry, not the first (rejected) attempt', result.observations[0].parameterCode, 'task_progression_rate');
    assertTrue('the retry prompt carries the explicit consistency correction', sentPrompts[1].includes('CORRECTION REQUIRED'));
    assertTrue('the first attempt prompt does NOT carry the correction (only appended on retry)', !sentPrompts[0].includes('CORRECTION REQUIRED'));
  }

  // 7. Session 16.3.5 — contradiction persists even after the one retry:
  // never guess which side is correct, never silently drop one side —
  // fail the evaluation closed with a diagnosable error, no observations
  // persisted at all for that window.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      () => llmSuccess({
        requestId: 'r',
        observations: [{ parameter_code: 'context_continuity_rate', primary_turn_id: 'T1', value: 'PASS' }],
        unassessable: [{ parameter_code: 'context_continuity_rate', reason: 'not applicable' }],
      }),
      (getCallCount) => evaluateInteraction(turns).then((r) => ({ r, calls: getCallCount() })),
    );
    assert('a contradiction that persists after the retry fails the evaluation', result.r.status, 'failed');
    assert('the error code identifies the contradiction specifically', result.r.errorCode, 'contradictory_applicability');
    assertTrue('the error message names the conflicting parameter', result.r.errorMessage.includes('context_continuity_rate'));
    assert('no misleading observations are persisted from a failed-closed contradiction', result.r.observations.length, 0);
    assert('the contradiction retry is bounded — exactly 2 calls, never more', result.calls, 2);
  }

  // 8. A valid response with legitimately disjoint observations/
  // unassessable_parameters (the normal, non-contradictory case) is
  // persisted on the very first attempt — the contradiction check must
  // never produce a false positive for honest N/A + real findings.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      (n) => llmSuccess({
        requestId: `r${n}`,
        observations: [{ parameter_code: 'task_progression_rate', primary_turn_id: 'T1', value: 'PASS' }],
        unassessable: [{ parameter_code: 'reference_resolution_accuracy', reason: 'no references to resolve' }],
      }),
      (getCallCount) => evaluateInteraction(turns).then((r) => ({ r, calls: getCallCount() })),
    );
    assert('disjoint observations/unassessable are accepted on the first attempt, no retry needed', result.calls, 1);
    assert('valid non-contradictory evaluation completes', result.r.status, 'completed');
    assert('the real observation is persisted', result.r.observations.length, 1);
    assert('the real unassessable entry is persisted too', result.r.unassessableParameters.some((u) => u.parameterCode === 'reference_resolution_accuracy'), true);
  }

  // 9. Session 16.3.8 (A2) — the retry prompt now names the exact
  // conflicting parameter code(s), not just a generic "you contradicted
  // yourself" instruction (the 16.3.6 fix target).
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const sentPrompts = [];
    await withStubbedFetch(
      (n, _url, opts) => {
        sentPrompts.push(JSON.parse(opts.body).user_prompt);
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
    assertTrue('the retry prompt names the exact conflicting parameter code', sentPrompts[1].includes('context_continuity_rate'));
    assertTrue('the retry prompt instructs preserving other, non-conflicting assessments', /unchanged|not part of this conflict/i.test(sentPrompts[1]));
  }

  // 10. Session 16.3.8 (A4) — a genuine all-N/A response with real,
  // parameter-specific reasons is accepted as-is on the first attempt.
  // An all-N/A result is never itself treated as invalid.
  {
    const turns = [turn('t1', 'agent', 'Thank you, goodbye.')];
    const result = await withStubbedFetch(
      (n) => llmSuccess({
        requestId: `r${n}`,
        observations: [],
        unassessable: [
          { parameter_code: 'context_continuity_rate', reason: 'This was the agent\'s only turn, a closing remark with nothing established earlier to carry forward.' },
          { parameter_code: 'task_progression_rate', reason: 'A purely social closing turn — there was no task left to progress.' },
        ],
      }),
      (getCallCount) => evaluateInteraction(turns).then((r) => ({ r, calls: getCallCount() })),
    );
    assert('a genuine all-N/A response with meaningful reasons is accepted on the first attempt', result.calls, 1);
    assert('the evaluation completes, not fails, for a legitimate all-N/A result', result.r.status, 'completed');
    assert('both meaningful unassessable entries are preserved', result.r.unassessableParameters.length, 2);
  }

  // 11. Session 16.3.8 (A4) — an all-N/A response with PLACEHOLDER
  // reasons (the exact shape of evaluation cbaa9075) is rejected and
  // retried once with a targeted correction; a retry that supplies real
  // reasons is then accepted.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const sentPrompts = [];
    const result = await withStubbedFetch(
      (n, _url, opts) => {
        sentPrompts.push(JSON.parse(opts.body).user_prompt);
        if (n === 1) {
          return llmSuccess({
            requestId: 'r1',
            observations: [],
            unassessable: [
              { parameter_code: 'context_continuity_rate', reason: 'N_A' },
              { parameter_code: 'task_progression_rate', reason: 'N_A' },
            ],
          });
        }
        return llmSuccess({
          requestId: 'r2',
          observations: [],
          unassessable: [
            { parameter_code: 'context_continuity_rate', reason: 'Agent\'s first and only turn — nothing established earlier to carry forward.' },
            { parameter_code: 'task_progression_rate', reason: 'Purely a greeting turn, no task was underway yet.' },
          ],
        });
      },
      () => evaluateInteraction(turns),
    );
    assert('placeholder-reason all-N/A response is rejected, then accepted after a corrected retry', result.status, 'completed');
    assert('the corrected (real-reason) entries are what gets persisted', result.unassessableParameters.every((u) => u.reason !== 'N_A'), true);
    assertTrue('the retry prompt carries the placeholder-reason correction, naming the codes', sentPrompts[1].includes('CORRECTION REQUIRED') && sentPrompts[1].includes('context_continuity_rate') && sentPrompts[1].includes('task_progression_rate'));
    assertTrue('the first attempt prompt does not pre-empt with the correction', !sentPrompts[0].includes('CORRECTION REQUIRED'));
  }

  // 12. Session 16.3.8 (A4) — placeholder reasons that persist even
  // after the one retry fail the window closed, never silently accepted
  // and never manufacturing fake observations to compensate.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      () => llmSuccess({ requestId: 'r', observations: [], unassessable: [{ parameter_code: 'context_continuity_rate', reason: 'NA' }] }),
      (getCallCount) => evaluateInteraction(turns).then((r) => ({ r, calls: getCallCount() })),
    );
    assert('persistent placeholder reasons fail the evaluation', result.r.status, 'failed');
    assert('the error code identifies the uninformative-unassessability defect specifically', result.r.errorCode, 'uninformative_unassessability');
    assert('no observations are fabricated to compensate for the rejected response', result.r.observations.length, 0);
    assert('the placeholder-reason retry is bounded — exactly 2 calls, never more', result.calls, 2);
  }

  // 13. Session 16.3.8 (A5) — a retry response that resolves the
  // original contradiction but introduces a NEW invalid condition
  // (placeholder reasons) is still rejected — the evaluator never treats
  // "the retry changed something" as proof the retry is now trustworthy;
  // it fully revalidates the retry response from scratch.
  {
    const turns = [turn('t1', 'agent', 'hi')];
    const result = await withStubbedFetch(
      (n) => {
        if (n === 1) {
          // First attempt: contradiction.
          return llmSuccess({
            requestId: 'r1',
            observations: [{ parameter_code: 'context_continuity_rate', primary_turn_id: 'T1', value: 'PASS' }],
            unassessable: [{ parameter_code: 'context_continuity_rate', reason: 'not applicable' }],
          });
        }
        // Retry: contradiction resolved, but now a placeholder reason.
        return llmSuccess({ requestId: 'r2', observations: [], unassessable: [{ parameter_code: 'context_continuity_rate', reason: '-' }] });
      },
      (getCallCount) => evaluateInteraction(turns).then((r) => ({ r, calls: getCallCount() })),
    );
    assert('a retry introducing a new invalid condition is still rejected, not blindly trusted', result.r.status, 'failed');
    assert('the second (placeholder-reason) defect is the one surfaced, since the first was resolved', result.r.errorCode, 'uninformative_unassessability');
    // Contradiction retry (call 2) + placeholder retry (call 3) each
    // consume one slot of the SAME shared retry budget — never a second,
    // independent retry loop — so this caps at 3 calls total, not 2 and
    // never unbounded.
    assert('the retry-introduces-a-new-defect case is still bounded to the shared retry budget, not unlimited', result.calls, 3);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

test();
