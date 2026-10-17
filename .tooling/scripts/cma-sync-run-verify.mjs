// CMA Synchronization — Manual UI Control. Deterministic coverage of the
// real compiled pure logic in src/server/cma/cmaSyncRun.ts (via esbuild,
// not a reimplementation): default-lookback-with-overlap computation,
// explicit-lookback override, and status-transition classification. The
// concurrency lock (the migration's partial unique index +
// call_center_cma_sync_runs_start) and the real session-authenticated
// endpoint wiring are verified against a real disposable PostgreSQL
// instance and by reading the real api/admin.ts source — see
// docs/SESSION_CMA_SYNC_MANUAL_UI_CONTROL.md, "Tests performed" for
// exactly what ran where.

import fs from 'node:fs';
import { computeManualSyncWindow, classifySyncOutcome, CMA_SYNC_INITIAL_LOOKBACK_MS } from '../tmp/cmaSyncRun.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

const NOW = new Date('2026-10-26T12:00:00.000Z');

// --- computeManualSyncWindow: since_last_success + overlap ---
const sinceLastSuccess = computeManualSyncWindow('2026-10-26T10:00:00.000Z', null, NOW);
assert('since_last_success: startedTo is now', sinceLastSuccess.startedTo, NOW.toISOString());
assert('since_last_success: lookbackMode', sinceLastSuccess.lookbackMode, 'since_last_success');
assert(
  'since_last_success: startedFrom is lastSuccess minus the 20-minute overlap (not exactly lastSuccess)',
  sinceLastSuccess.startedFrom,
  '2026-10-26T09:40:00.000Z',
);

// --- computeManualSyncWindow: explicit lookback always wins, even with a last-success present ---
const explicitOverride = computeManualSyncWindow('2026-10-26T10:00:00.000Z', 6, NOW);
assert('explicit lookback overrides last-success default: lookbackMode', explicitOverride.lookbackMode, 'explicit');
assert('explicit lookback overrides last-success default: startedFrom is now minus 6h', explicitOverride.startedFrom, '2026-10-26T06:00:00.000Z');

// --- computeManualSyncWindow: never run before, no explicit lookback -> initial default ---
const neverRun = computeManualSyncWindow(null, null, NOW);
assert('never run: lookbackMode', neverRun.lookbackMode, 'explicit');
assert(
  'never run: startedFrom is now minus the 24h initial-lookback default',
  new Date(neverRun.startedTo).getTime() - new Date(neverRun.startedFrom).getTime(),
  CMA_SYNC_INITIAL_LOOKBACK_MS,
);

// --- computeManualSyncWindow: explicit lookback of 0 is honored (not treated as "no override") ---
const explicitZero = computeManualSyncWindow('2026-10-26T10:00:00.000Z', 0, NOW);
assert('explicit lookback of 0 is honored, not treated as missing', explicitZero, { startedFrom: NOW.toISOString(), startedTo: NOW.toISOString(), lookbackMode: 'explicit' });

// --- classifySyncOutcome ---
function tick({ callInserted = 0, callUpdated = 0, callFailed = [], chatInserted = 0, chatUpdated = 0, chatFailed = [] }) {
  const call = { inserted: callInserted, updated: callUpdated, failed: callFailed, synced: callInserted + callUpdated };
  const chat = { inserted: chatInserted, updated: chatUpdated, failed: chatFailed, synced: chatInserted + chatUpdated };
  return { call, chat, totalSynced: call.synced + chat.synced, totalFailed: callFailed.length + chatFailed.length };
}

assert('classifySyncOutcome: zero failures -> success', classifySyncOutcome(tick({ callInserted: 5, chatInserted: 2 })), 'success');
assert(
  'classifySyncOutcome: some synced, some failed -> partial',
  classifySyncOutcome(tick({ callInserted: 5, callFailed: [{ interactionId: 'x', error: 'boom' }] })),
  'partial',
);
assert(
  'classifySyncOutcome: zero synced, all failed -> failed',
  classifySyncOutcome(tick({ callFailed: [{ interactionId: 'x', error: 'boom' }], chatFailed: [{ interactionId: 'y', error: 'boom' }] })),
  'failed',
);
assert('classifySyncOutcome: nothing processed at all (zero rows in window) -> success, not falsely failed', classifySyncOutcome(tick({})), 'success');

// --- Real session-authenticated endpoint wiring — read the real api/admin.ts source, never reimplemented. ---
const adminSrc = fs.readFileSync(new URL('../../api/admin.ts', import.meta.url), 'utf8');
assert(
  'handleCmaSyncGet gates on the real cma.sync.manage permission (requirePermission, never requireAdminToken)',
  /async function handleCmaSyncGet[\s\S]{0,200}requirePermission\(req, res, 'cma\.sync\.manage'\)/.test(adminSrc),
  true,
);
assert(
  'handleCmaSyncPost gates on the real cma.sync.manage permission',
  /async function handleCmaSyncPost[\s\S]{0,400}requirePermission\(req, res, 'cma\.sync\.manage'\)/.test(adminSrc),
  true,
);
assert(
  'the cmaSync resource dispatcher is wired into the exported route',
  /resource === 'cmaSync'/.test(adminSrc),
  true,
);
assert(
  'the manual sync handler reuses runManualCmaSync (the existing cmaPoll-wrapping orchestration), never a separate sync path',
  /runManualCmaSync\(supabase, user\.id, lookbackHours/.test(adminSrc),
  true,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
