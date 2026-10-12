// Session 16.3 follow-up — live verification against the real Generic
// Local LLM endpoint found it returns a platform-level 404 (FastAPI's
// own `{"detail":"Not Found"}`, not the documented contract's error
// shape) for the documented /api/v1/llm/generate path on this
// deployment, which silently produced a FAILED evaluation with
// error_code/error_message both null — undiagnosable. This tests the
// fix in src/server/qa/genericLlmClient.ts (via esbuild, not a
// reimplementation): any non-2xx response that doesn't carry the
// documented contract's own `error_code` field synthesizes a
// diagnosable `http_error` instead.
import { callGenericLlm } from '../tmp/genericLlmClient.mjs';

process.env.VOICEBOT_BASE_URL = 'https://stub.invalid';
process.env.VOICEBOT_API_KEY = 'stub-key';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

async function withStubbedFetch(response, run) {
  const original = global.fetch;
  global.fetch = async () => response;
  try {
    return await run();
  } finally {
    global.fetch = original;
  }
}

async function test() {
  // The exact shape found live: HTTP 404, body {"detail":"Not Found"} — no error_code field.
  {
    const res = await withStubbedFetch(
      { ok: false, status: 404, text: async () => JSON.stringify({ detail: 'Not Found' }) },
      () => callGenericLlm({ requestId: 'r1', userPrompt: 'x', jsonSchema: {} }),
    );
    assert('a platform-level 404 with no documented error_code produces a diagnosable error, not null/null', res.errorCode, 'http_error');
    assertTrue('the HTTP status and detail are captured in the message', res.errorMessage.includes('404') && res.errorMessage.includes('Not Found'));
    assert('such an error is never treated as success', res.success, false);
  }

  // A documented-contract error response (HTTP 200, success:false, real error_code) still passes through unchanged.
  {
    const res = await withStubbedFetch(
      { ok: true, status: 200, text: async () => JSON.stringify({ success: false, request_id: 'r2', output: null, model_id: 'm', finish_reason: 'error', latency_ms: null, usage: { prompt_tokens: null, completion_tokens: null }, error_code: 'rate_limited', error_message: 'too many' }) },
      () => callGenericLlm({ requestId: 'r2', userPrompt: 'x', jsonSchema: {} }),
    );
    assert('a real documented error_code is preserved exactly, not overwritten by the fallback', res.errorCode, 'rate_limited');
  }

  // A non-JSON body on a non-2xx response is still handled (pre-existing path, unaffected by the fix).
  {
    const res = await withStubbedFetch(
      { ok: false, status: 502, text: async () => '<html>Bad Gateway</html>' },
      () => callGenericLlm({ requestId: 'r3', userPrompt: 'x', jsonSchema: {} }),
    );
    assert('non-JSON error body still produces a diagnosable error_code', res.errorCode, 'invalid_model_output');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

function assertTrue(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  cond ? pass++ : fail++;
}

test();
