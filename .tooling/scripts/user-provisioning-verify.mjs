import { getAppOrigin } from '../tmp/adminRoute.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

const ORIGINAL = {
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
};
function clearEnv() {
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
}
function restoreEnv() {
  if (ORIGINAL.VERCEL_PROJECT_PRODUCTION_URL === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = ORIGINAL.VERCEL_PROJECT_PRODUCTION_URL;
  if (ORIGINAL.VERCEL_URL === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = ORIGINAL.VERCEL_URL;
}

// --- getAppOrigin: the invite redirectTo base. Session 14.2's whole
// point was not repeating the Session 14.1 hardcoded-localhost problem
// — this proves the resolution order is deterministic and environment-
// aware, never a single hardcoded value. ---

clearEnv();
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'callcenter-three-livid.vercel.app';
process.env.VERCEL_URL = 'callcenter-abc123-preview.vercel.app';
assert('prefers VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL when both are set', getAppOrigin(), 'https://callcenter-three-livid.vercel.app');

clearEnv();
process.env.VERCEL_URL = 'callcenter-abc123-preview.vercel.app';
assert('falls back to VERCEL_URL (e.g. a preview deployment) when production URL is unset', getAppOrigin(), 'https://callcenter-abc123-preview.vercel.app');

clearEnv();
assert('falls back to the real local dev origin (port 8080, not a guessed one) when neither Vercel var is set', getAppOrigin(), 'http://localhost:8080');

restoreEnv();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
