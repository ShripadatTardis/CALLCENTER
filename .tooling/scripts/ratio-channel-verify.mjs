// Session 13.6 (DEC-RATIO-01) — deterministic verification of channel
// provenance on Ratio Explorer's drill-through rows, against the REAL
// compiled src/server/analytics/callPopulationProvider.ts (via esbuild).
//
// Finding confirmed this session: callPopulationProvider.ts is the ONLY
// AggregationProvider implementation ratioService.ts uses, and its sole
// population source is GET /api/v1/call-data (Voice-only). There is no
// Chat-backed population anywhere in the repository today. channel:
// 'voice' is therefore accurate, not a misclassification — this suite
// proves the mapping function never manufactures a 'chat' row and always
// carries a real phoneNumber for the proven phone+call_sid drill-through
// lookup (src/lib/callLookup.ts).

import { mapCallToInteractionRef } from '../tmp/callPopulationProvider.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// A real-shaped Voice call-data row retains channel: 'voice' and carries its real phone/call_id.
{
  const call = {
    call_id: 'call-sid-abc123',
    caller_number: '+919145782844',
    start_time: '2026-10-01T10:00:00Z',
    ai_agent_name: 'EMI Reminder',
    ai_agent_id: 'emi-reminder-agent',
    intent: 'Emi Payment',
    outcome: 'resolved',
  };
  const ref = mapCallToInteractionRef(call);
  assert('Voice row: channel is voice', ref.channel, 'voice');
  assert('Voice row: interactionId is the real call_sid', ref.interactionId, 'call-sid-abc123');
  assert('Voice row: phoneNumber is the real caller_number (for phone+call_sid lookup)', ref.phoneNumber, '+919145782844');
  assert('Voice row: agentLabel prefers ai_agent_name', ref.agentLabel, 'EMI Reminder');
}

// agentLabel falls back to ai_agent_id when ai_agent_name is absent — no fabricated label.
{
  const call = { call_id: 'c2', caller_number: '+10000000000', start_time: '2026-10-01T10:00:00Z', ai_agent_name: '', ai_agent_id: 'emi-reminder-agent', intent: '', outcome: '' };
  const ref = mapCallToInteractionRef(call);
  assert('Voice row: agentLabel falls back to ai_agent_id', ref.agentLabel, 'emi-reminder-agent');
  assert('Voice row: empty intent -> null, never empty string', ref.intent, null);
  assert('Voice row: empty outcome -> null, never empty string', ref.outcome, null);
}

// No code path in this mapper can ever produce 'chat' — the literal is hardcoded because the
// provider genuinely has no Chat-backed population; this is the architectural finding, not a bug.
{
  const call = { call_id: 'c3', caller_number: '+10000000000', start_time: '2026-10-01T10:00:00Z', ai_agent_name: null, ai_agent_id: null, intent: null, outcome: null };
  const ref = mapCallToInteractionRef(call);
  assert('Mapper never produces channel: chat (no Chat population source exists)', ref.channel, 'voice');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
