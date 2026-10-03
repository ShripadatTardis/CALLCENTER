// Session 13.2 — deterministic verification of CALL-01's preserved
// Voice backend fields, against the REAL compiled
// src/services/calls/callsMapper.ts (via esbuild, not a reimplementation).

import { mapCallDataEntryToInteraction } from '../tmp/callsMapper.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function baseDto(overrides = {}) {
  return {
    call_id: 'call-test-1',
    status: 'inactive',
    caller_name: 'Preethy',
    caller_number: '+917019225475',
    from_phone_number: '',
    agent_id: 'emi-reminder-agent',
    direction: 'outbound',
    outcome: 'resolved',
    fcr: true,
    aht_seconds: 53,
    intent_accuracy: 95,
    intent: 'Emi Payment',
    sentiment: 'Positive',
    sentiment_score: 0.8,
    campaign_name: 'Loan Support',
    tags: ['EMI Payment'],
    transcript_summary: 'Summary.',
    timestamp: '2026-10-01T11:49:46.346553+00:00',
    start_time: '2026-10-01T11:49:46.346553+00:00',
    stage: 'completed',
    duration_seconds: 53,
    channel: 'voice',
    ai_agent_id: 'emi-reminder-agent',
    ai_agent_name: 'EMI Reminder',
    context: 'Handling EMI Payment Inquiry',
    escalation_trigger: null,
    transcript_doc_id: 'transcript:call-test-1',
    voice_record_url: null,
    was_authenticated: null,
    is_bank_customer: true,
    analysis: { sentiment_trend: 'positive', key_topics: [], resolution_status: 'resolved', confidence_score: 95 },
    detailed_transcript: [],
    actual_outcome_code: null,
    actual_outcome_name: null,
    structured_outputs: null,
    ...overrides,
  };
}

// --- historical/null call: every newly-preserved field stays undefined, nothing fabricated ---
const historical = mapCallDataEntryToInteraction(baseDto());
assert('historical: actualOutcomeCode undefined', historical.actualOutcomeCode, undefined);
assert('historical: actualOutcomeName undefined', historical.actualOutcomeName, undefined);
assert('historical: structuredOutputs undefined', historical.structuredOutputs, undefined);
assert('historical: transcriptDocId still preserved even when outcome is null (independent field)', historical.transcriptDocId, 'transcript:call-test-1');
assert('historical: context preserved', historical.context, 'Handling EMI Payment Inquiry');
assert('historical: isBankCustomer preserved (true)', historical.isBankCustomer, true);

// --- populated call: real backend structured-outcome fields preserved exactly, no key loss, no mutation ---
const populated = mapCallDataEntryToInteraction(
  baseDto({
    actual_outcome_code: 'PROMISE_TO_PAY',
    actual_outcome_name: 'Promise to Pay',
    structured_outputs: { promised_payment_date: '2026-10-05', payment_dispute_raised: false, payment_plan_requested: false },
  }),
);
assert('populated: actualOutcomeCode preserved', populated.actualOutcomeCode, 'PROMISE_TO_PAY');
assert('populated: actualOutcomeName preserved', populated.actualOutcomeName, 'Promise to Pay');
assert(
  'populated: structuredOutputs preserved with no key loss/mutation',
  populated.structuredOutputs,
  { promised_payment_date: '2026-10-05', payment_dispute_raised: false, payment_plan_requested: false },
);

// --- is_bank_customer: false must never be coerced, only genuine null/undefined should map to undefined ---
assert('isBankCustomer false preserved as false (not coerced)', mapCallDataEntryToInteraction(baseDto({ is_bank_customer: false })).isBankCustomer, false);
assert('isBankCustomer null -> undefined (never defaulted to false)', mapCallDataEntryToInteraction(baseDto({ is_bank_customer: null })).isBankCustomer, undefined);

// --- transcript_doc_id / context: null-safe ---
assert('transcriptDocId null -> undefined', mapCallDataEntryToInteraction(baseDto({ transcript_doc_id: null })).transcriptDocId, undefined);
assert('context empty string -> undefined (not an empty-string value)', mapCallDataEntryToInteraction(baseDto({ context: '' })).context, undefined);

// --- Chat-sourced Interaction never gets Voice-only fields (cross-channel model safety, §24) ---
// callsMapper.ts is Voice-only by construction (no chat DTO path exists here) — verified by
// confirming no chat-mapping function exists in this module that could set these fields.
import * as callsMapperModule from '../tmp/callsMapper.mjs';
assert(
  'callsMapper exports only Voice-shaped mapping functions (no Chat mapper present to leak Voice-only fields)',
  Object.keys(callsMapperModule).sort(),
  ['mapCallDataEntryToInteraction', 'mapCallDataSummary', 'mapSessionTranscriptToInteraction', 'mapTriggerCallResponse'],
);

// --- analysis.* untouched (§23 — do not touch, confirm it still maps exactly as before) ---
assert(
  'analysis.* mapping unchanged',
  populated.analysis,
  { sentimentTrend: 'positive', keyTopics: [], resolutionStatus: 'resolved', confidenceScore: 95 },
);

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
