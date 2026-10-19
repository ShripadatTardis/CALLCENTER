// Session CMA-1B, corrected CMA-1B.1 — deterministic coverage of the
// real compiled pure logic in src/server/cma/cmaSyncMapping.ts, the pure
// window-filter helper in src/server/cma/cmaSync.ts
// (`filterRowsInWindow`), and the pure diff functions in
// src/server/cma/cmaIdReconciliation.ts (via esbuild, same discipline as
// every other *-verify.mjs in this repo: the real compiled source, never
// a reimplementation). The DB/network-calling orchestration
// (syncCallWindow/syncChatWindow in cmaSync.ts, cmaBackfill.ts,
// runCmaPollingTick in cmaPolling.ts, and the two runCma*IdReconciliation
// functions) is verified instead by direct hand-tracing against the real
// code plus, where noted, execution against a real disposable PostgreSQL
// instance (including a genuine re-run-the-same-window-twice idempotency
// proof) and reading of the real upstream Call/Chat API contracts — see
// docs/SESSION_CMA_1B_INTERACTION_SYNCHRONIZATION.md, "Tests performed"
// for exactly what ran where.

import { buildCmaSyncPayload } from '../tmp/cmaSyncMapping.mjs';
import { filterRowsInWindow } from '../tmp/cmaSync.mjs';
import { diffInteractionIds, detectStaleFacts } from '../tmp/cmaIdReconciliation.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// --- buildCmaSyncPayload: a full SourceInteraction snapshot maps to ---
// --- every field the sync RPC accepts EXCEPT customerId/contactPointId/ ---
// --- campaignId, which must never appear at all. fcr/intentConfidence ---
// --- ARE included as of Session 7 (corrects the Session 6 finding that ---
// --- these fields don't exist upstream — they do; the gap was only in ---
// --- this payload builder, confirmed against the real documented API). ---

const fullCallRow = {
  interactionId: 'call-001',
  channel: 'voice',
  phoneNumber: '+15551234567',
  externalCustomerId: null,
  direction: 'inbound',
  agentId: 'agent-1',
  agentDisplayName: 'Agent One',
  startedAt: '2026-01-15T10:00:00.000Z',
  durationSeconds: 120,
  intent: 'balance_inquiry',
  outcome: 'resolved',
  sentimentScore: 0.8,
  wasAuthenticated: true,
  escalationTrigger: null,
  campaignName: null,
  recordingAvailable: true,
  source: 'call-data',
  fcr: true,
  intentConfidence: 0.92,
};

const callPayload = buildCmaSyncPayload(fullCallRow);

assert('buildCmaSyncPayload maps every SourceInteraction field the RPC accepts, including fcr/intentConfidence', callPayload, {
  source: 'call-data',
  interactionId: 'call-001',
  startedAt: '2026-01-15T10:00:00.000Z',
  channel: 'voice',
  direction: 'inbound',
  agentId: 'agent-1',
  agentDisplayName: 'Agent One',
  durationSeconds: 120,
  intent: 'balance_inquiry',
  outcome: 'resolved',
  sentimentScore: 0.8,
  wasAuthenticated: true,
  escalationTrigger: null,
  campaignName: null,
  recordingAvailable: true,
  fcr: true,
  intentConfidence: 0.92,
});

assert(
  'buildCmaSyncPayload NEVER includes customerId/contactPointId/campaignId — CMA sync does no identity resolution and SourceInteraction has none of these fields to fabricate',
  ['customerId', 'contactPointId', 'campaignId'].every((k) => !(k in callPayload)),
  true,
);

const nullFcrCallRow = { ...fullCallRow, interactionId: 'call-002', fcr: null, intentConfidence: null };
assert(
  'buildCmaSyncPayload: a genuinely-null fcr/intentConfidence (upstream has no value right now) is sent as an explicit null, never omitted or fabricated',
  buildCmaSyncPayload(nullFcrCallRow).fcr === null && buildCmaSyncPayload(nullFcrCallRow).intentConfidence === null,
  true,
);

const nullyChatRow = {
  interactionId: 'chat-sess-1',
  channel: 'chat',
  phoneNumber: '+15559876543',
  externalCustomerId: 'ext-cif-1',
  preferredCustomerId: null,
  direction: null,
  agentId: 'agent-2',
  agentDisplayName: 'Agent Two',
  startedAt: '2026-01-16T08:00:00.000Z',
  durationSeconds: 45,
  intent: 'general_inquiry',
  outcome: null, // genuinely absent from the Chat API contract (chatInteractionSource.ts's own documented finding)
  sentimentScore: null,
  wasAuthenticated: false,
  escalationTrigger: null,
  campaignName: 'spring-promo',
  recordingAvailable: false,
  source: 'chat-sessions',
  fcr: null,
  intentConfidence: null,
};

assert(
  'buildCmaSyncPayload for a Chat row: a genuinely-null outcome/sentimentScore/escalationTrigger/fcr/intentConfidence is sent as an explicit null (overwrite), never fabricated into a fake value',
  buildCmaSyncPayload(nullyChatRow),
  {
    source: 'chat-sessions',
    interactionId: 'chat-sess-1',
    startedAt: '2026-01-16T08:00:00.000Z',
    channel: 'chat',
    direction: null,
    agentId: 'agent-2',
    agentDisplayName: 'Agent Two',
    durationSeconds: 45,
    intent: 'general_inquiry',
    outcome: null,
    sentimentScore: null,
    wasAuthenticated: false,
    escalationTrigger: null,
    campaignName: 'spring-promo',
    recordingAvailable: false,
    fcr: null,
    intentConfidence: null,
  },
);

// --- diffInteractionIds: pure ID-set comparison. ---

assert(
  'diffInteractionIds: exact match -> both lists empty',
  diffInteractionIds(['a', 'b', 'c'], ['a', 'b', 'c']),
  { missingLocally: [], unexpectedLocally: [] },
);

assert(
  'diffInteractionIds: upstream has one local does not -> missingLocally',
  diffInteractionIds(['a', 'b'], ['a', 'b', 'c']),
  { missingLocally: ['c'], unexpectedLocally: [] },
);

assert(
  'diffInteractionIds: local has one upstream does not (e.g. a stale/deleted-upstream or test artifact row) -> unexpectedLocally',
  diffInteractionIds(['a', 'b', 'd'], ['a', 'b']),
  { missingLocally: [], unexpectedLocally: ['d'] },
);

assert(
  'diffInteractionIds: both directions simultaneously',
  diffInteractionIds(['a', 'x'], ['a', 'y']),
  { missingLocally: ['y'], unexpectedLocally: ['x'] },
);

assert(
  'diffInteractionIds: empty upstream, non-empty local -> everything unexpectedLocally',
  diffInteractionIds(['a'], []),
  { missingLocally: [], unexpectedLocally: ['a'] },
);

// --- detectStaleFacts: pure tracked-mutable-fact comparison, ID-matched rows only. ---

assert(
  'detectStaleFacts: identical facts on both sides -> no findings',
  detectStaleFacts(
    [{ interactionId: 'a', outcome: 'resolved', durationSeconds: 60, escalationTrigger: null }],
    [{ interactionId: 'a', outcome: 'resolved', durationSeconds: 60, escalationTrigger: null }],
  ),
  [],
);

assert(
  'detectStaleFacts: outcome changed upstream (local is stale) -> one finding, correct field/values',
  detectStaleFacts(
    [{ interactionId: 'a', outcome: 'resolved', durationSeconds: 60, escalationTrigger: null }],
    [{ interactionId: 'a', outcome: 'escalated', durationSeconds: 60, escalationTrigger: null }],
  ),
  [{ interactionId: 'a', field: 'outcome', localValue: 'resolved', upstreamValue: 'escalated' }],
);

assert(
  'detectStaleFacts: duration changed (an in-progress call ticking up) -> one finding',
  detectStaleFacts(
    [{ interactionId: 'a', outcome: null, durationSeconds: 30, escalationTrigger: null }],
    [{ interactionId: 'a', outcome: null, durationSeconds: 45, escalationTrigger: null }],
  ),
  [{ interactionId: 'a', field: 'durationSeconds', localValue: 30, upstreamValue: 45 }],
);

assert(
  'detectStaleFacts: multiple fields changed on the same row -> multiple findings for that one interactionId',
  detectStaleFacts(
    [{ interactionId: 'a', outcome: 'resolved', durationSeconds: 60, escalationTrigger: null }],
    [{ interactionId: 'a', outcome: 'escalated', durationSeconds: 90, escalationTrigger: 'timeout' }],
  ),
  [
    { interactionId: 'a', field: 'outcome', localValue: 'resolved', upstreamValue: 'escalated' },
    { interactionId: 'a', field: 'durationSeconds', localValue: 60, upstreamValue: 90 },
    { interactionId: 'a', field: 'escalationTrigger', localValue: null, upstreamValue: 'timeout' },
  ],
);

assert(
  'detectStaleFacts: an ID present only locally (no upstream match) is silently skipped — diffInteractionIds already reports it as unexpectedLocally, not double-reported here',
  detectStaleFacts(
    [{ interactionId: 'local-only', outcome: 'resolved', durationSeconds: 60, escalationTrigger: null }],
    [],
  ),
  [],
);

// --- CMA-1B.1: filterRowsInWindow — the ordering-independent window ---
// --- filter Chat sync applies client-side (no server-side date filter ---
// --- exists upstream for Chat; see cmaSync.ts module header). Proves ---
// --- the filter is a pure half-open [startedFrom, startedTo) test on ---
// --- each row's startedAt, with NO dependency on page position/order. ---

const rowA = { interactionId: 'a', startedAt: '2026-01-10T00:00:00.000Z' };
const rowB = { interactionId: 'b', startedAt: '2026-01-10T12:00:00.000Z' };
const rowC = { interactionId: 'c', startedAt: '2026-01-11T00:00:00.000Z' }; // exactly on the exclusive upper bound
const rowD = { interactionId: 'd', startedAt: '2026-01-09T23:59:59.999Z' }; // just before the inclusive lower bound... actually just before

assert(
  'filterRowsInWindow: rows inside [from, to) kept, the boundary-exclusive row and the before-window row dropped — order of input rows is irrelevant to the result',
  filterRowsInWindow([rowC, rowA, rowD, rowB], '2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z').map((r) => r.interactionId),
  ['a', 'b'],
);

assert(
  'filterRowsInWindow: a row exactly at startedFrom is included (lower bound inclusive)',
  filterRowsInWindow([rowA], '2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z').map((r) => r.interactionId),
  ['a'],
);

assert(
  'filterRowsInWindow: a row exactly at startedTo is excluded (upper bound exclusive — half-open [from, to))',
  filterRowsInWindow([rowC], '2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z').map((r) => r.interactionId),
  [],
);

assert(
  'filterRowsInWindow: empty input -> empty output',
  filterRowsInWindow([], '2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z'),
  [],
);

assert(
  'filterRowsInWindow: reversing input row order never changes which rows match — the filter is position-independent by construction',
  filterRowsInWindow([rowB, rowA, rowC, rowD], '2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z').map((r) => r.interactionId).sort(),
  filterRowsInWindow([rowA, rowB, rowC, rowD], '2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z').map((r) => r.interactionId).sort(),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
