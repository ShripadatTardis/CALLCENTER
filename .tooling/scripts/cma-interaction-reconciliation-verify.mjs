// Session CMA-1A — deterministic coverage of the REAL compiled pure
// logic in src/server/cma/interactionReconciliation.ts (via esbuild,
// not a reimplementation — same discipline as every other
// *-verify.mjs in this repo). The sync RPC's own upsert/merge
// semantics live in Postgres (public.call_center_sync_interaction) and
// cannot be exercised without a live database — those are verified
// instead by direct hand-tracing against the real migration SQL and
// the real production schema confirmed via Supabase MCP (see
// docs/SESSION_CMA_1A_INTERACTION_BASE_FACTS.md, "Synchronization RPC
// behaviour" and "Tests executed and results" sections). This file
// covers exactly the pure, synchronous JS this session added:
// reconciliation drift math.

import { computeReconciliationDrift, computeInclusiveDateWindowBounds, CALL_DATA_SOURCE } from '../tmp/cmaInteractionReconciliation.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// --- CMA-1A.1 regression guard: the real column value, never the ---
// --- pre-existing 'voice'/'chat' checkpoint-source label. ---

assert('CALL_DATA_SOURCE is the real customer_interactions.source value, never the checkpoint-source label', CALL_DATA_SOURCE, 'call-data');

// --- computeReconciliationDrift: the local-vs-upstream comparison. ---

assert(
  'local matches upstream exactly -> matches: true, delta: 0',
  computeReconciliationDrift(CALL_DATA_SOURCE, '2026-01-01', '2026-01-31', 756, 756),
  { source: 'call-data', startedFrom: '2026-01-01', startedTo: '2026-01-31', localTotal: 756, upstreamTotal: 756, delta: 0, deltaRatio: 0, matches: true },
);

assert(
  'local behind upstream (the Phase 3 626-vs-756 shape) -> positive delta, matches: false',
  computeReconciliationDrift(CALL_DATA_SOURCE, '2026-01-01', '2026-01-31', 626, 756),
  { source: 'call-data', startedFrom: '2026-01-01', startedTo: '2026-01-31', localTotal: 626, upstreamTotal: 756, delta: 130, deltaRatio: 130 / 756, matches: false },
);

assert(
  'local AHEAD of upstream (should never happen, but the sign must stay informative, not clamped) -> negative delta',
  computeReconciliationDrift(CALL_DATA_SOURCE, '2026-01-01', '2026-01-31', 800, 756),
  { source: 'call-data', startedFrom: '2026-01-01', startedTo: '2026-01-31', localTotal: 800, upstreamTotal: 756, delta: -44, deltaRatio: -44 / 756, matches: false },
);

assert(
  'zero upstream population -> deltaRatio is null, never a divide-by-zero NaN or a misleading 0',
  computeReconciliationDrift(CALL_DATA_SOURCE, '2026-01-01', '2026-01-01', 0, 0),
  { source: 'call-data', startedFrom: '2026-01-01', startedTo: '2026-01-01', localTotal: 0, upstreamTotal: 0, delta: 0, deltaRatio: null, matches: true },
);

assert(
  'local non-zero but upstream zero -> deltaRatio null (not division by zero), matches false',
  computeReconciliationDrift(CALL_DATA_SOURCE, '2026-01-01', '2026-01-01', 5, 0),
  { source: 'call-data', startedFrom: '2026-01-01', startedTo: '2026-01-01', localTotal: 5, upstreamTotal: 0, delta: -5, deltaRatio: null, matches: false },
);

// --- computeInclusiveDateWindowBounds: CMA-1A.1's date-boundary fix. ---
// Upstream's date_from/date_to are inclusive-both-ends calendar dates;
// the local RPC's p_started_to is now an EXCLUSIVE upper bound, so a
// single calendar day must become [thatDay 00:00Z, nextDay 00:00Z).

assert(
  'single day window -> upper bound is midnight of the NEXT day, not the same day (CMA-1A.1 off-by-one fix)',
  computeInclusiveDateWindowBounds('2026-01-15', '2026-01-15'),
  { startedFrom: '2026-01-15T00:00:00.000Z', startedTo: '2026-01-16T00:00:00.000Z' },
);

assert(
  'multi-day window -> inclusive "to" day fully covered by the exclusive upper bound',
  computeInclusiveDateWindowBounds('2026-01-01', '2026-01-31'),
  { startedFrom: '2026-01-01T00:00:00.000Z', startedTo: '2026-02-01T00:00:00.000Z' },
);

assert(
  'month-end rollover handled by native Date arithmetic, not manual day-count math',
  computeInclusiveDateWindowBounds('2026-02-01', '2026-02-28'),
  { startedFrom: '2026-02-01T00:00:00.000Z', startedTo: '2026-03-01T00:00:00.000Z' },
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
