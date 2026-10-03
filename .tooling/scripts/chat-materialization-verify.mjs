// Session 13.2 — deterministic verification of corrected Chat →
// Customer360 materialization, against the REAL compiled
// src/server/customer360/chatInteractionSource.ts (via esbuild, not a
// reimplementation).

import { mapRow } from '../tmp/chatInteractionSource.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function baseDto(overrides = {}) {
  return {
    session_id: 'chat-test-1',
    agent_id: 'emi-reminder-agent',
    agent_name: 'EMI Reminder',
    customer_id: 'CIF00123',
    contact_id: null,
    caller_name: 'Test Customer',
    phone_number: '+911234567890',
    is_bank_customer: true,
    channel: 'chat',
    status: 'completed',
    authenticated: true,
    message_count: 4,
    history_doc_id: null,
    intent: 'EMI Payment',
    confidence: 0.9,
    data_source: 'llm',
    detection_method: 'keyword',
    latency_ms: 120,
    started_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:02:30.000Z',
    ...overrides,
  };
}

// --- durationSeconds: computed from started_at/updated_at, same formula as ChatSessionDetailDialog.tsx's "Session span" ---
assert('durationSeconds computed from timestamps (150s)', mapRow(baseDto())?.durationSeconds, 150);
assert('durationSeconds 0 when updated_at === started_at', mapRow(baseDto({ updated_at: '2026-10-01T10:00:00.000Z' }))?.durationSeconds, 0);
assert(
  'durationSeconds never negative (clamped)',
  mapRow(baseDto({ started_at: '2026-10-01T10:05:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' }))?.durationSeconds,
  0,
);

// --- campaignName: passed through from the resolved param, never fabricated ---
assert('campaignName set when resolved', mapRow(baseDto(), null, 'Loan Support')?.campaignName, 'Loan Support');
assert('campaignName null when not resolved (no campaign link)', mapRow(baseDto())?.campaignName, null);

// --- outcome/sentimentScore/escalationTrigger/direction: remain null — no legitimate source exists ---
const mapped = mapRow(baseDto());
assert('outcome remains null (status is not a business outcome)', mapped.outcome, null);
assert('sentimentScore remains null (no Chat API field)', mapped.sentimentScore, null);
assert('escalationTrigger remains null (no Chat API field)', mapped.escalationTrigger, null);
assert('direction remains null (chat has no inbound/outbound concept)', mapped.direction, null);

// --- existing behavior unchanged: no identity signal -> null row ---
assert(
  'no identity signal (no phone, no customer_id, no preferredCustomerId) -> null',
  mapRow(baseDto({ phone_number: null, customer_id: null })),
  null,
);
assert(
  'preferredCustomerId alone is sufficient identity signal',
  mapRow(baseDto({ phone_number: null, customer_id: null }), 'customer-360-id-abc') !== null,
  true,
);

// --- other already-correct fields unaffected by this session's changes ---
assert('intent passed through unchanged', mapped.intent, 'EMI Payment');
assert('wasAuthenticated passed through unchanged', mapped.wasAuthenticated, true);
assert('channel is always chat', mapped.channel, 'chat');
assert('recordingAvailable always false for chat', mapped.recordingAvailable, false);

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
