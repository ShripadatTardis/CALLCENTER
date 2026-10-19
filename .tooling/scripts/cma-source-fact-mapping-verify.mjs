// Session 7 — deterministic coverage of the real compiled DTO->SourceInteraction
// mapping for `fcr`/`intentConfidence` (src/server/customer360/voiceAgentInteractionSource.ts
// mapEntry, src/server/customer360/chatInteractionSource.ts mapRow), via esbuild,
// never a reimplementation. This is the Session 7 Part B fix: these two fields
// are real, documented, currently-returned fields on the Voice API's
// /call-data response (fcr: boolean, intent_accuracy: 0-100) — Session 6
// mischaracterized them as "don't exist upstream"; the real gap was only
// that cmaSyncMapping.ts's payload builder never forwarded them (see
// cma-interaction-synchronization-verify.mjs for that half of the fix).

import { mapEntry } from '../tmp/voiceAgentInteractionSource.mjs';
import { mapRow } from '../tmp/chatInteractionSource.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function baseDto(overrides = {}) {
  return {
    call_id: 'CAxxx1',
    status: 'inactive',
    caller_name: 'Jane Doe',
    caller_number: '+15551234567',
    from_phone_number: '+15551234567',
    agent_id: 'agent-1',
    direction: 'inbound',
    outcome: 'resolved',
    fcr: true,
    aht_seconds: 120,
    intent_accuracy: 92,
    intent: 'balance_inquiry',
    sentiment: 'positive',
    sentiment_score: 0.8,
    campaign_name: null,
    tags: [],
    transcript_summary: '',
    timestamp: '2026-01-15T10:00:00.000Z',
    start_time: '2026-01-15T10:00:00.000Z',
    stage: 'completed',
    duration_seconds: 120,
    channel: 'voice',
    ai_agent_id: 'ai-agent-1',
    ai_agent_name: 'AI Agent One',
    context: '',
    escalation_trigger: null,
    transcript_doc_id: null,
    voice_record_url: null,
    was_authenticated: true,
    is_bank_customer: true,
    analysis: { sentiment_trend: 'stable', key_topics: [], resolution_status: 'resolved', confidence_score: 0.9 },
    detailed_transcript: [],
    actual_outcome_code: null,
    actual_outcome_name: null,
    ...overrides,
  };
}

// 1. intent_accuracy is documented 0-100; mapped value must be rescaled to
//    0-1 to match this schema's existing "score" convention (sentimentScore).
{
  const row = mapEntry(baseDto({ intent_accuracy: 92 }));
  assert('intent_accuracy 92 (0-100 scale) rescales to 0.92 (0-1 scale)', row.intentConfidence, 0.92);
}
{
  const row = mapEntry(baseDto({ intent_accuracy: 0 }));
  assert('intent_accuracy 0 rescales to 0, not treated as missing', row.intentConfidence, 0);
}
{
  const row = mapEntry(baseDto({ intent_accuracy: 100 }));
  assert('intent_accuracy 100 rescales to 1', row.intentConfidence, 1);
}

// 2. fcr maps through as-is (already boolean, no rescaling needed).
{
  const row = mapEntry(baseDto({ fcr: true }));
  assert('fcr: true maps straight through', row.fcr, true);
}
{
  const row = mapEntry(baseDto({ fcr: false }));
  assert('fcr: false maps straight through (not coerced to null)', row.fcr, false);
}

// 3. Non-boolean/non-number values from an unexpected upstream response are
//    preserved as an honest null, never guessed or defaulted.
{
  const row = mapEntry(baseDto({ fcr: undefined }));
  assert('fcr missing/undefined on the DTO -> null, never fabricated', row.fcr, null);
}
{
  const row = mapEntry(baseDto({ intent_accuracy: undefined }));
  assert('intent_accuracy missing/undefined on the DTO -> null, never fabricated', row.intentConfidence, null);
}
{
  const row = mapEntry(baseDto({ intent_accuracy: null }));
  assert('intent_accuracy explicitly null on the DTO -> null, never coerced to 0', row.intentConfidence, null);
}

// 4. Chat has no fcr/intent_accuracy equivalent — always null, never fabricated.
{
  const row = mapRow({
    session_id: 'chat-1',
    phone_number: '+15559876543',
    customer_id: null,
    agent_id: 'agent-2',
    agent_name: 'Agent Two',
    started_at: '2026-01-16T08:00:00.000Z',
    updated_at: '2026-01-16T08:05:00.000Z',
    intent: 'general_inquiry',
    authenticated: false,
  });
  assert('chat mapRow: fcr is always null (no API equivalent)', row.fcr, null);
  assert('chat mapRow: intentConfidence is always null (no API equivalent)', row.intentConfidence, null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
