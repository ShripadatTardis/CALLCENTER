// Session 15.4 — deterministic verification of the Call Metrics
// integration, against the REAL compiled modules via esbuild (not a
// reimplementation): src/lib/callMetricsFormat.ts,
// src/lib/callMetricsCorrelation.ts, and
// src/services/agents/agentPerformanceAggregator.ts's new
// computeAgentCallTechnicalPerformance. Covers the brief's §12 required
// list (items 1-4, 7, 9-13; items 5/6/14 are live/manual verification,
// covered in the closure report instead — pagination/filter forwarding
// and upstream-error handling are thin proxy plumbing in api/calls/data.ts
// with no pure logic to unit test beyond what's already covered here,
// and "existing Call Detail behavior unaffected" is a live-UI check).

import { mapCallMetricsRow, formatCallMetricMs } from '../tmp/callMetricsFormat.mjs';
import { buildCallMetricsByInteractionId, filterCallMetricsRowsByAuthorizedAgents } from '../tmp/callMetricsCorrelation.mjs';
import { computeAgentCallTechnicalPerformance } from '../tmp/agentPerformanceAggregator.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// 1. DTO/parser accepts the documented complete row (the docx sample).
{
  const dto = {
    call_sid: 'aad881f7-f167-4cad-bf6d-1901898203dc',
    start_time: '2026-10-06T11:23:14.933738+05:30',
    recorded_at: '2026-10-06T11:26:00.059060+05:30',
    agent: 'Inbound Banking Assistant',
    direction: 'inbound',
    duration_seconds: 134,
    concurrent_users: 1,
    stt_ms: 73,
    llm_ttft_ms: 108,
    llm_ms: 248,
    tts_ttfb_ms: 536,
    turn_ms: 770,
    tool_ms: 0.21,
    rag_ms: 38.54,
    orchestrator_ms: 165,
    turns: 14,
  };
  const mapped = mapCallMetricsRow(dto);
  assert('complete row: callSid mapped', mapped.callSid, dto.call_sid);
  assert('complete row: turnMs mapped', mapped.turnMs, 770);
  assert('complete row: toolMs preserves 2-decimal value, not rounded/dropped', mapped.toolMs, 0.21);
  assert('complete row: turns mapped', mapped.turns, 14);
  assert('complete row: agentDisplayName is the display string, not an id', mapped.agentDisplayName, 'Inbound Banking Assistant');
}

// 2. Nullable latency fields preserved as null (an in-progress/unanswered call).
{
  const dto = {
    call_sid: 'c1', start_time: '2026-10-06T00:00:00+05:30', recorded_at: null,
    agent: 'Banking Assistant', direction: 'inbound', duration_seconds: null,
    concurrent_users: 2, stt_ms: null, llm_ttft_ms: null, llm_ms: null,
    tts_ttfb_ms: null, turn_ms: null, tool_ms: null, rag_ms: null,
    orchestrator_ms: null, turns: null,
  };
  const mapped = mapCallMetricsRow(dto);
  assert('unfinished call: every latency field stays null, not 0', [mapped.sttMs, mapped.llmMs, mapped.turnMs, mapped.orchestratorMs], [null, null, null, null]);
  assert('unfinished call: formatted as "Not available yet" (recordedAt null), never "0 ms"', formatCallMetricMs(mapped.turnMs, { recordedAt: mapped.recordedAt }), 'Not available yet');
}

// 3. tool_ms null is NOT converted to zero — "Not used", distinct from "Not available".
{
  const formatted = formatCallMetricMs(null, { recordedAt: '2026-10-06T00:00:00+05:30', notUsedWhenNull: true, decimals: 2 });
  assert('tool_ms null on a COMPLETED call -> "Not used", never "0.00 ms"', formatted, 'Not used');
}

// 4. rag_ms null is NOT converted to zero — same "Not used" treatment.
{
  const formatted = formatCallMetricMs(null, { recordedAt: '2026-10-06T00:00:00+05:30', notUsedWhenNull: true, decimals: 2 });
  assert('rag_ms null on a COMPLETED call -> "Not used", never "0.00 ms"', formatted, 'Not used');
  const genericFormatted = formatCallMetricMs(null, { recordedAt: '2026-10-06T00:00:00+05:30' });
  assert('a non-tool/RAG field null on a completed call -> "Not available" (not "Not used" — only tool_ms/rag_ms get that reason)', genericFormatted, 'Not available');
}

// 7. Exact Call Metrics <-> Call Data id correlation — call_sid equality only, never phone/timestamp.
{
  const rows = [
    mapCallMetricsRow({ call_sid: 'A', start_time: 't', recorded_at: 't', agent: 'X', direction: 'inbound', duration_seconds: 1, concurrent_users: 1, stt_ms: 1, llm_ttft_ms: 1, llm_ms: 1, tts_ttfb_ms: 1, turn_ms: 1, tool_ms: null, rag_ms: null, orchestrator_ms: 1, turns: 1 }),
    mapCallMetricsRow({ call_sid: 'B', start_time: 't', recorded_at: 't', agent: 'X', direction: 'inbound', duration_seconds: 1, concurrent_users: 1, stt_ms: 2, llm_ttft_ms: 2, llm_ms: 2, tts_ttfb_ms: 2, turn_ms: 2, tool_ms: null, rag_ms: null, orchestrator_ms: 2, turns: 1 }),
  ];
  const byId = buildCallMetricsByInteractionId(rows);
  assert('correlation map keyed by exact call_sid', byId.get('A')?.turnMs, 1);
  assert('no entry for an id that was never in the Call Metrics response (never fuzzy-matched)', byId.get('C'), undefined);
}

// 9/10. Agent aggregation uses stable call-data agent_id, not the metrics row's display-string `agent`; unauthorized agent/call metrics never exposed.
{
  const rawRows = [
    { call_sid: 'call-agent-a-1', start_time: 't', recorded_at: 't', agent: 'Banking Assistant', direction: 'inbound', duration_seconds: 1, concurrent_users: 1, stt_ms: 10, llm_ttft_ms: 10, llm_ms: 10, tts_ttfb_ms: 10, turn_ms: 10, tool_ms: null, rag_ms: null, orchestrator_ms: 10, turns: 1 },
    { call_sid: 'call-agent-b-1', start_time: 't', recorded_at: 't', agent: 'Banking Assistant', direction: 'inbound', duration_seconds: 1, concurrent_users: 1, stt_ms: 999, llm_ttft_ms: 999, llm_ms: 999, tts_ttfb_ms: 999, turn_ms: 999, tool_ms: null, rag_ms: null, orchestrator_ms: 999, turns: 1 },
  ];
  // Both rows share the SAME display-string `agent` ("Banking Assistant")
  // but belong to two DIFFERENT real agents per call-data's stable id —
  // exactly the scenario the brief warns about (never aggregate/authorize
  // by display-name matching).
  const agentIdByCallId = new Map([
    ['call-agent-a-1', 'agent-a'],
    ['call-agent-b-1', 'agent-b'],
  ]);
  const filtered = filterCallMetricsRowsByAuthorizedAgents(rawRows, agentIdByCallId, ['agent-a']);
  assert('scoped to agent-a only: agent-b row dropped despite identical display-string `agent`', filtered.map((r) => r.call_sid), ['call-agent-a-1']);

  const unresolvable = filterCallMetricsRowsByAuthorizedAgents(
    [{ ...rawRows[0], call_sid: 'call-unknown' }],
    new Map(), // no call-data correlation found for this call_sid at all
    ['agent-a'],
  );
  assert('a row that cannot be correlated to ANY call-data record is dropped (fail-closed), never passed through', unresolvable, []);
}

// 11/12. Averages exclude nulls; no eligible population produces null, never 0.
{
  const interactions = [
    { interactionId: 'x1' }, { interactionId: 'x2' }, { interactionId: 'x3' },
  ];
  const metricsByInteractionId = new Map([
    ['x1', { callSid: 'x1', turnMs: 100, toolMs: 5, ragMs: null, sttMs: 10, llmTtftMs: 10, llmMs: 10, ttsTtfbMs: 10, orchestratorMs: 10 }],
    ['x2', { callSid: 'x2', turnMs: 200, toolMs: null, ragMs: null, sttMs: 20, llmTtftMs: 20, llmMs: 20, ttsTtfbMs: 20, orchestratorMs: 20 }],
    // x3 has no correlated Call Metrics row at all.
  ]);
  const agg = computeAgentCallTechnicalPerformance(interactions, metricsByInteractionId);
  assert('avgTurnMs averages only matched calls (100,200)/2 = 150', agg.avgTurnMs, 150);
  assert('avgToolMs averages ONLY the one call where a tool actually ran (5), not diluted by the null', agg.avgToolMs, 5);
  assert('matchedCallCount counts only correlated calls (2 of 3)', agg.matchedCallCount, 2);

  const noEligible = computeAgentCallTechnicalPerformance(
    [{ interactionId: 'y1' }],
    new Map([['y1', { callSid: 'y1', turnMs: null, toolMs: null, ragMs: null, sttMs: null, llmTtftMs: null, llmMs: null, ttsTtfbMs: null, orchestratorMs: null }]]),
  );
  assert('no eligible (all-null) population -> avgTurnMs is null, never 0', noEligible.avgTurnMs, null);
  assert('no eligible (all-null) population -> avgRagMs is null, never 0', noEligible.avgRagMs, null);
}

// 13. Voice/Chat latency is never blended — computeAgentCallTechnicalPerformance only ever reads Voice interactions/Call Metrics rows; it has no chat-session input at all.
{
  // A chat-only interaction set (no entries in metricsByInteractionId,
  // since Call Metrics has no concept of chat) must never silently
  // average in anything — confirms the function has no implicit
  // chat-latency fallback.
  const chatOnly = computeAgentCallTechnicalPerformance([{ interactionId: 'chat-1' }, { interactionId: 'chat-2' }], new Map());
  assert('a chat-only interaction set correlates to zero matched calls, no blended figure fabricated', chatOnly.matchedCallCount, 0);
  assert('avgTurnMs for a chat-only set is null, never a Chat-derived number', chatOnly.avgTurnMs, null);
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
