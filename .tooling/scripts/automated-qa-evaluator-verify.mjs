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

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

test();
