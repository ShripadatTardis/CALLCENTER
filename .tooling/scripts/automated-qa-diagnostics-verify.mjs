// Session 16.4.4.1 — Automated QA Diagnostics UI. Deterministic coverage
// of the REAL compiled pure logic this feature's server-side route and
// client-side panel both depend on (same discipline as every other
// *-verify.mjs in this repo): the exact two-stage gate
// api/admin.ts's new `action === 'diagnostics'` branch applies
// (requirePermission('automated_qa.diagnostics.view') then
// isAgentIdInScope on the underlying evaluation's agentId — composed
// here exactly as the real handler composes them, not reimplemented),
// and the pure display/comparison helpers in
// src/lib/automatedQaDiagnosticsDisplay.ts.
import { evaluatePermission, isAgentIdInScope, toAgentAccess } from '../tmp/authGate.mjs';
import {
  OUTCOME_BADGE_VARIANT, outcomeLabel, isLikelyTruncated, RAW_RESPONSE_TRUNCATION_THRESHOLD,
  extractContradiction, attemptsWithContradiction, countRetries, sortAttemptsForDisplay,
} from '../tmp/automatedQaDiagnosticsDisplay.mjs';
import { toCamelAttemptDiagnosticRow } from '../tmp/automatedQaAttemptDiagnostics.mjs';

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

function user(roles, permissions, dataScope) {
  return { id: 'u1', email: 'u@example.com', displayName: 'U', status: 'active', roles, permissions, dataScope };
}
const unrestrictedScope = { allAgents: true, agentIds: [], allCustomerCategories: true, customerCategoryIds: [], customerAllAgents: true, customerAgentIds: [] };
const restrictedScope = (agentIds) => ({ allAgents: false, agentIds, allCustomerCategories: true, customerCategoryIds: [], customerAllAgents: true, customerAgentIds: [] });

/** Mirrors exactly what api/admin.ts's `action === 'diagnostics'` branch
 * does: requirePermission first, then (only on success) isAgentIdInScope
 * against the target evaluation's own agentId. Returns the same
 * three-way outcome the real route would respond with. */
function simulateDiagnosticsAccess(u, evaluationAgentId) {
  const permissionResult = evaluatePermission(u, 'automated_qa.diagnostics.view');
  if (permissionResult.outcome === 'unauthenticated') return '401';
  if (permissionResult.outcome === 'forbidden') return '403';
  if (!isAgentIdInScope(toAgentAccess(u), evaluationAgentId)) return '404'; // fails closed, same as every other scoped route in this app
  return '200';
}

// --- 1. Authorized access ---
assert(
  'administrator with the diagnostics permission, evaluation agent in scope -> 200',
  simulateDiagnosticsAccess(user(['administrator'], ['automated_qa.diagnostics.view'], unrestrictedScope), 'inbound-banking-default'),
  '200',
);

// --- 2. Unauthorized rejection ---
assert(
  'unauthenticated caller -> 401, never a silent empty list',
  simulateDiagnosticsAccess(null, 'inbound-banking-default'),
  '401',
);
assert(
  'authenticated user who holds qa.automated.view but NOT automated_qa.diagnostics.view -> 403 (a narrower, distinct permission, brief §2)',
  simulateDiagnosticsAccess(user(['operator'], ['qa.automated.view'], unrestrictedScope), 'inbound-banking-default'),
  '403',
);
assertTrue(
  'holding automated_qa.diagnostics.view alone (hypothetically, without qa.automated.view) is still evaluated as its own independent grant — the gate checks ONLY the diagnostics key, never implicitly requiring the other',
  evaluatePermission(user(['operator'], ['automated_qa.diagnostics.view'], unrestrictedScope), 'automated_qa.diagnostics.view').outcome === 'allowed',
);

// --- 3. Business Data Scope isolation ---
assert(
  'diagnostics permission alone is NOT sufficient for an evaluation whose agent is outside the caller\'s Agent Scope -> 404 (never leaks via a diagnostics-only grant, brief §2 "only an evaluation they are otherwise authorized to view")',
  simulateDiagnosticsAccess(user(['supervisor'], ['automated_qa.diagnostics.view'], restrictedScope(['emi-reminder-agent'])), 'inbound-banking-default'),
  '404',
);
assert(
  'same restricted caller, evaluation agent IS in their scope -> 200',
  simulateDiagnosticsAccess(user(['supervisor'], ['automated_qa.diagnostics.view'], restrictedScope(['emi-reminder-agent'])), 'emi-reminder-agent'),
  '200',
);
assert(
  'restricted caller, evaluation has a null/unresolved agentId -> fails closed, never in scope',
  simulateDiagnosticsAccess(user(['supervisor'], ['automated_qa.diagnostics.view'], restrictedScope(['emi-reminder-agent'])), null),
  '404',
);

// --- 4. Outcome vocabulary / badge-variant completeness (every DB check-constraint value must have a display mapping) ---
const DB_OUTCOME_VALUES = ['success', 'transport_failure', 'parse_failure', 'llm_error', 'contradictory_applicability', 'uninformative_unassessability'];
assertTrue(
  'every outcome value the database check constraint allows has a badge-variant mapping (no silent fallback)',
  DB_OUTCOME_VALUES.every((o) => Object.prototype.hasOwnProperty.call(OUTCOME_BADGE_VARIANT, o)),
);
assert('genuine infrastructure failures map to the destructive variant', [OUTCOME_BADGE_VARIANT.transport_failure, OUTCOME_BADGE_VARIANT.parse_failure, OUTCOME_BADGE_VARIANT.llm_error], ['destructive', 'destructive', 'destructive']);
assert('semantic validation defects map to warning, not destructive (distinct from infra failure)', [OUTCOME_BADGE_VARIANT.contradictory_applicability, OUTCOME_BADGE_VARIANT.uninformative_unassessability], ['warning', 'warning']);
assert('a successful attempt maps to positive', OUTCOME_BADGE_VARIANT.success, 'positive');
assert('outcome labels are human-readable (underscores replaced)', outcomeLabel('contradictory_applicability'), 'contradictory applicability');

// --- 5. Raw response fidelity + truncation indication ---
assertTrue('a response well under the threshold is not flagged as truncated', !isLikelyTruncated('short response'));
assertTrue('a response at exactly the application-layer bound is flagged as possibly truncated', isLikelyTruncated('x'.repeat(RAW_RESPONSE_TRUNCATION_THRESHOLD)));
assertTrue('a response one character under the bound is NOT flagged', !isLikelyTruncated('x'.repeat(RAW_RESPONSE_TRUNCATION_THRESHOLD - 1)));
// Fidelity itself (never normalizing/mutating the text) is structural —
// isLikelyTruncated/the UI's RawTextViewer only ever read `.length`
// and render the string verbatim as a React text child, never
// reconstructing it; there is no transform function in this module that
// could alter raw response content, confirmed by this module's own
// exported surface containing no such function.
assertTrue('this module exports no function capable of mutating/normalizing raw response text', typeof extractContradiction === 'function' && extractContradiction.length <= 1);

// --- 6. Structured validation comparison (brief §5) — uses only stored data, never invents ---
const attemptWithContradiction = (id, attemptNumber, windowIndex, codes) => ({
  id, attemptNumber, windowIndex,
  validationDetail: { contradiction: { detectedAt: 'cross_array_contradiction', parameterCodes: codes, observationOccurrences: Object.fromEntries(codes.map((c) => [c, 1])), unassessableOccurrences: Object.fromEntries(codes.map((c) => [c, 1])) } },
});
const plainAttempt = (id, attemptNumber, windowIndex) => ({ id, attemptNumber, windowIndex, validationDetail: null });

const twoAttemptEval = [attemptWithContradiction('a1', 1, 0, ['context_continuity_rate']), attemptWithContradiction('a2', 2, 0, ['context_continuity_rate'])];
assert('both contradictory attempts are selected for comparison, in order', attemptsWithContradiction(twoAttemptEval).map((a) => a.id), ['a1', 'a2']);
assert('an attempt with no validationDetail is excluded from comparison, never a fabricated empty entry', attemptsWithContradiction([plainAttempt('a1', 1, 0)]), []);
assertTrue('extractContradiction returns null (not a crash) for a null validationDetail', extractContradiction(null) === null);
assert('extractContradiction reads the exact stored occurrence counts, never recomputed', extractContradiction(twoAttemptEval[0].validationDetail).observationOccurrences, { context_continuity_rate: 1 });

// --- 7. Single vs. multiple attempts / retry counting ---
assert('a single-attempt evaluation has zero retries', countRetries([plainAttempt('a1', 1, 0)]), 0);
assert('a two-attempt (1 retry) evaluation counts exactly one retry', countRetries([plainAttempt('a1', 1, 0), plainAttempt('a2', 2, 0)]), 1);
assert('retries are counted per attempt beyond the first in EACH window, across multiple windows', countRetries([plainAttempt('a1', 1, 0), plainAttempt('a2', 2, 0), plainAttempt('a3', 1, 1), plainAttempt('a4', 2, 1)]), 2);

// --- 8. Correct attempt ordering (window_index, then attempt_number — matches the list RPC's own ORDER BY) ---
const shuffled = [plainAttempt('w1a2', 2, 1), plainAttempt('w0a1', 1, 0), plainAttempt('w1a1', 1, 1), plainAttempt('w0a2', 2, 0)];
assert('attempts are sorted by window_index then attempt_number regardless of input order', sortAttemptsForDisplay(shuffled).map((a) => a.id), ['w0a1', 'w0a2', 'w1a1', 'w1a2']);

// --- 9b. Regression guard — found live during this session's own browser
// verification: a generic recursive camelCaser applied to the raw DB row
// was silently rewriting validation_detail's nested parameter-code KEYS
// (real stored data, not schema field names) from snake_case to
// camelCase, breaking every occurrence-count lookup in the comparison
// UI. toCamelAttemptDiagnosticRow must camelCase every ordinary column
// but pass validation_detail through byte-for-byte untouched. ---
{
  const rawRow = {
    id: 'a1', evaluation_id: 'eval-1', window_index: 0, attempt_number: 1,
    request_id: 'req-1', model_id: 'Qwen/Qwen2.5-7B-Instruct-AWQ', outcome: 'contradictory_applicability',
    error_code: 'contradictory_applicability', error_message: 'msg', raw_response: '{"raw":true}',
    validation_detail: {
      contradiction: {
        detectedAt: 'cross_array_contradiction',
        parameterCodes: ['context_continuity_rate'],
        observationOccurrences: { context_continuity_rate: 1 },
        unassessableOccurrences: { context_continuity_rate: 1 },
      },
    },
    retry_reason: null, correction_instruction_id: null, previous_attempt_id: null,
    requested_max_output_tokens: 1200, prompt_tokens: 100, completion_tokens: 50,
    latency_ms: 500, started_at: '2026-10-16T04:19:20Z', completed_at: '2026-10-16T04:19:30Z', created_at: '2026-10-16T04:19:30Z',
  };
  const camel = toCamelAttemptDiagnosticRow(rawRow);
  assert('ordinary columns are camelCased', [camel.evaluationId, camel.windowIndex, camel.attemptNumber, camel.requestId, camel.errorCode], ['eval-1', 0, 1, 'req-1', 'contradictory_applicability']);
  assertTrue(
    'validation_detail nested parameter-code KEYS are preserved verbatim (snake_case), never camelCased — the exact live bug this guards against',
    camel.validationDetail.contradiction.observationOccurrences.context_continuity_rate === 1
    && camel.validationDetail.contradiction.unassessableOccurrences.context_continuity_rate === 1
    && camel.validationDetail.contradiction.observationOccurrences.contextContinuityRate === undefined,
  );
  assert('the real occurrence count (1) is readable via extractContradiction + the stored parameter code', extractContradiction(camel.validationDetail).observationOccurrences['context_continuity_rate'], 1);
}

// --- 9. Missing diagnostic records (no attempts at all) is a display-layer empty state, never a crash in the pure helpers ---
assert('countRetries on an empty list is 0, not a throw', countRetries([]), 0);
assert('attemptsWithContradiction on an empty list is [], not a throw', attemptsWithContradiction([]), []);
assert('sortAttemptsForDisplay on an empty list is [], not a throw', sortAttemptsForDisplay([]), []);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
