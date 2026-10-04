// Session 15 — Action Required. Deterministic coverage of the REAL
// compiled pure logic in api/admin.ts (via esbuild, not a
// reimplementation — same discipline as every other *-verify.mjs in
// this repo). Ownership/idempotency/scope enforcement itself lives in
// the Postgres RPCs (public.call_center_action_items_*), which cannot
// be exercised without a live database — those are proven instead by
// direct SQL verification against the real project (see
// docs/SESSION_15_DASHBOARD_ACTION_REQUIRED.md's "SQL-level
// verification" section for that evidence). This file covers exactly
// the pure, synchronous JS this session added: HTTP-status mapping for
// RPC error codes, and the anti-flood bootstrap-window math.

import { mapActionItemError, actionItemBootstrapWindow } from '../tmp/adminRoute.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// --- mapActionItemError: translates the RPCs' raise-exception codes to
// the right HTTP status, so a client sees 404 for "doesn't exist", 403
// for a real authorization/ownership denial, 422 for an invalid value,
// and 500 only for something genuinely unrecognized. ---

assert('action_item_not_found -> 404', mapActionItemError('action_item_not_found'), 404);
assert('assignment_not_permitted -> 403 (ownership gate)', mapActionItemError('assignment_not_permitted'), 403);
assert('ownership_required -> 403 (progress/resolve ownership gate)', mapActionItemError('ownership_required'), 403);
assert('assignee_inactive_or_not_found -> 422', mapActionItemError('assignee_inactive_or_not_found'), 422);
assert('assignee_out_of_scope -> 422', mapActionItemError('assignee_out_of_scope'), 422);
assert('invalid_status_transition -> 422', mapActionItemError('invalid_status_transition'), 422);
assert('an unrecognized message falls back to 500, never guessed as something more specific', mapActionItemError('something_unexpected'), 500);
assert(
  'a real Postgres error wrapper message is matched by substring, not exact equality',
  mapActionItemError('duplicate key value violates... assignee_out_of_scope ...'),
  422,
);

// --- actionItemBootstrapWindow: the deliberate anti-flood rule (plan
// §11) — a 30-day rolling lookback, computed from "now", not a fixed
// historical date that would silently narrow over time. ---

const window30 = actionItemBootstrapWindow(30);
const fromMs = new Date(window30.dateFrom).getTime();
const toMs = new Date(window30.dateTo).getTime();
const spanDays = Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000));
assert('30-day window spans exactly 30 days', spanDays, 30);
assert('dateTo is today (UTC date)', window30.dateTo, new Date().toISOString().slice(0, 10));

const window7 = actionItemBootstrapWindow(7);
const span7Days = Math.round((new Date(window7.dateTo).getTime() - new Date(window7.dateFrom).getTime()) / (24 * 60 * 60 * 1000));
assert('a different window size is honored, not hardcoded to 30', span7Days, 7);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
