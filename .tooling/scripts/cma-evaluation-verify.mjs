// CMA-3A/3B — Central Calculation & Evaluation Engine. Deterministic
// coverage of the real compiled pipeline logic in
// src/server/cma/cmaEvaluation.ts (via esbuild, not a reimplementation)
// against a hand-written fake Supabase client whose `.rpc()` is
// scripted per test. This covers governance short-circuiting, dimension
// validation, scope narrowing, and response shaping — everything that
// does NOT require a real Postgres aggregation. Each new RPC's actual
// SQL correctness against known facts is validated separately against a
// real disposable PostgreSQL instance — see
// docs/SESSION_CMA_3B_CALCULATION_CATALOGUE.md, "Database verification,"
// for that run's account; it is NOT re-run here, since this script
// intentionally never touches a real database.

import { evaluateCmaMeasure } from '../tmp/cmaEvaluation.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
function assertTrue(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` -- ${detail ?? ''}`}`);
  cond ? pass++ : fail++;
}

// --- fixture canonical measures, mirroring real production rows ---
const CANON = {
  'CANON-RES-RATE': { id: 'CANON-RES-RATE', canonical_name: 'Resolution Rate', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'RES-01' },
  'CANON-AVG-SENT-SCORE': { id: 'CANON-AVG-SENT-SCORE', canonical_name: 'Avg Sentiment Score', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'AGENT-SENT-01' },
  'CANON-ESC-RATE': { id: 'CANON-ESC-RATE', canonical_name: 'Escalation Rate', measure_class: 'business_measure', governed_algorithm_status: 'pending_decision', migration_reference_measure_id: 'ESC-03' },
  'CANON-NPS-CAMPAIGNS': { id: 'CANON-NPS-CAMPAIGNS', canonical_name: 'NPS Campaigns', measure_class: 'mock_indicator', governed_algorithm_status: 'mock', migration_reference_measure_id: null },
  'CANON-CONTACT-RATE': { id: 'CANON-CONTACT-RATE', canonical_name: 'Contact Rate', measure_class: 'business_measure', governed_algorithm_status: 'unimplemented', migration_reference_measure_id: null },
  'CANON-CAMPAIGN-TARGET-COUNT': { id: 'CANON-CAMPAIGN-TARGET-COUNT', canonical_name: 'Campaign Target Count', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'CAMP-01' },
  'CANON-INTENT-CONFIDENCE': { id: 'CANON-INTENT-CONFIDENCE', canonical_name: 'Intent Confidence', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'INTCONF-01' },
  'CANON-CONTEXT-CONTINUITY-RATE': { id: 'CANON-CONTEXT-CONTINUITY-RATE', canonical_name: 'Context Continuity Rate', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'QA-CC-01' },
  'CANON-REPETITION-LOOP-RATE': { id: 'CANON-REPETITION-LOOP-RATE', canonical_name: 'Repetition Loop Rate', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'QA-RLR-01' },
  'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI': { id: 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI', canonical_name: 'Campaign Success Count / Rate (raw classification)', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'CAMP-02' },
  'CANON-CHAT-SESSION-SPAN': { id: 'CANON-CHAT-SESSION-SPAN', canonical_name: 'Chat Session Span', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'CHAT-SPAN-01' },
  'CANON-ACTION-REQUIRED-QUEUE-ITEMS': { id: 'CANON-ACTION-REQUIRED-QUEUE-ITEMS', canonical_name: 'Action Required Queue Items', measure_class: 'business_measure', governed_algorithm_status: 'decided', migration_reference_measure_id: 'ACTION-01' },
};

const BASE_FACTS = {
  'RES-01': [{ baseFact: { id: 'FACT-OUTCOME' }, role: 'numerator' }],
  'AGENT-SENT-01': [], // deliberately missing FACT-SENTIMENT-SCORE -> registry/algorithm drift test
  'INTCONF-01': [{ baseFact: { id: 'FACT-INTENT-CONFIDENCE' }, role: 'numerator' }],
};

// [CMA-3B.1] Mirrors the real, corrected production cma_measure_dimensions rows this session
// verified live and corrected (removing 'channel' from CAMP-*/CHAT-SPAN-01/ACTION-01 and
// 'outcome' from ACTION-01, neither factually supported by their real tables; CHAT-SPAN-01 and
// ACTION-01 keep their real 'campaign' relationship, now matched by a runtime extension).
const DIMENSIONS = {
  'RES-01': [{ id: 'agent' }, { id: 'channel' }, { id: 'campaign' }, { id: 'time' }, { id: 'outcome' }],
  'AGENT-SENT-01': [{ id: 'agent' }, { id: 'channel' }, { id: 'campaign' }, { id: 'time' }],
  'INTCONF-01': [{ id: 'agent' }, { id: 'channel' }, { id: 'campaign' }, { id: 'time' }],
  'QA-CC-01': [{ id: 'agent' }, { id: 'channel' }, { id: 'time' }],
  'QA-RLR-01': [{ id: 'agent' }, { id: 'channel' }, { id: 'time' }],
  'CAMP-01': [{ id: 'agent' }, { id: 'campaign' }, { id: 'time' }],
  'CAMP-02': [{ id: 'agent' }, { id: 'campaign' }, { id: 'time' }],
  'CHAT-SPAN-01': [{ id: 'agent' }, { id: 'campaign' }, { id: 'time' }],
  'ACTION-01': [{ id: 'agent' }, { id: 'campaign' }, { id: 'time' }],
};

const CALCULATION_RPC_NAMES = [
  'call_center_cma_evaluate_measure', 'call_center_cma_evaluate_qa_measure',
  'call_center_cma_evaluate_campaign_measure', 'call_center_cma_evaluate_chat_measure',
  'call_center_cma_evaluate_action_measure',
];

function makeFakeSupabase({ rpcScenario = {}, rpcScenarios, onCall } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (onCall) onCall(fn, args);
      if (fn === 'call_center_cma_canonical_measure_get') {
        return { data: CANON[args.p_canonical_id] ?? null, error: null };
      }
      if (fn === 'call_center_cma_measure_base_facts_list') {
        return { data: BASE_FACTS[args.p_measure_id] ?? [], error: null };
      }
      if (fn === 'call_center_cma_measure_dimensions_list') {
        return { data: DIMENSIONS[args.p_measure_id] ?? [], error: null };
      }
      if (CALCULATION_RPC_NAMES.includes(fn)) {
        // rpcScenarios: a map keyed by rpc name, for tests that exercise more than one
        // calculation RPC in the same scenario; falls back to the single `rpcScenario`
        // (CMA-3A's own convention) when only one RPC is relevant.
        const scenario = rpcScenarios ? rpcScenarios[fn] : rpcScenario;
        if (typeof scenario === 'function') return { data: scenario(args), error: null };
        return { data: scenario ?? {}, error: null };
      }
      throw new Error(`unexpected rpc: ${fn}`);
    },
  };
}

const WINDOW = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' };
const ALL_ACCESS = { allCategories: true, authorizedAgentIds: 'all' };
const SCOPED_ACCESS = { allCategories: false, authorizedAgentIds: ['agent-a', 'agent-b'] };

// --- 1. Unfiltered authorized calculation ---
{
  const supabase = makeFakeSupabase({ rpcScenario: { status: 'ok', population: 10, numerator: 7, denominator: 10 } });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW }, ALL_ACCESS);
  assert('1. unfiltered: algorithmStatus', result.algorithmStatus, 'decided');
  assert('1. unfiltered: resolvedMeasureId', result.resolvedMeasureId, 'RES-01');
  assert('1. unfiltered: value result', result.groups[0].result, { kind: 'value', value: 70, unit: 'percent' });
  assert('1. unfiltered: scopeApplied', result.scopeApplied, { allAgents: true, agentIds: 'all' });
}

// --- 2. Agent-filtered calculation (authorized agent) ---
{
  let capturedArgs = null;
  const supabase = makeFakeSupabase({
    rpcScenario: { status: 'ok', population: 4, numerator: 3, denominator: 4 },
    onCall: (fn, args) => { if (fn === 'call_center_cma_evaluate_measure') capturedArgs = args; },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW, filters: { agent: 'agent-a' } }, SCOPED_ACCESS);
  assert('2. agent-filtered: value result', result.groups[0].result, { kind: 'value', value: 75, unit: 'percent' });
  assert('2. agent-filtered: appliedFilters', result.appliedFilters, { agent: 'agent-a' });
  assert('2. agent-filtered: RPC received the filter + the full authorized scope (not narrowed to just the filter)', [capturedArgs.p_filter_agent_id, capturedArgs.p_all_agents, capturedArgs.p_authorized_agent_ids], ['agent-a', false, ['agent-a', 'agent-b']]);
}

// --- 3. Channel-filtered calculation ---
{
  let capturedArgs = null;
  const supabase = makeFakeSupabase({
    rpcScenario: { status: 'ok', population: 2, numerator: 1, denominator: 2 },
    onCall: (fn, args) => { if (fn === 'call_center_cma_evaluate_measure') capturedArgs = args; },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW, filters: { channel: 'voice' } }, ALL_ACCESS);
  assert('3. channel-filtered: RPC received p_filter_channel', capturedArgs.p_filter_channel, 'voice');
  assert('3. channel-filtered: appliedFilters', result.appliedFilters, { channel: 'voice' });
}

// --- 4. Valid grouped calculation ---
{
  const supabase = makeFakeSupabase({
    rpcScenario: { status: 'ok', groups: [{ key: 'agent-a', population: 5, numerator: 4, denominator: 5 }, { key: 'agent-b', population: 3, numerator: 1, denominator: 3 }] },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW, groupBy: 'agent' }, ALL_ACCESS);
  assert('4. grouped: two groups returned', result.groups.length, 2);
  assert('4. grouped: group 1 key+value', [result.groups[0].groupKey, result.groups[0].result], ['agent-a', { kind: 'value', value: 80, unit: 'percent' }]);
  assert('4. grouped: group 2 key+value', [result.groups[1].groupKey, result.groups[1].result], ['agent-b', { kind: 'value', value: 33.3, unit: 'percent' }]);
  assert('4. grouped: dataCompleteness.populationSize sums every group', result.dataCompleteness.populationSize, 8);
}

// --- 5. Unsupported dimension rejection ---
{
  const supabase = makeFakeSupabase({ rpcScenario: { status: 'ok', population: 0, numerator: 0, denominator: 0 } });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW, filters: { outcome: 'resolved' } }, ALL_ACCESS);
  assertTrue('5. unsupported dimension: rejected before any RPC evaluate call', result.groups[0].result.kind === 'unsupported_dimension' && !supabase.calls.some((c) => c.fn === 'call_center_cma_evaluate_measure'));
}

// --- 6. Unauthorized scope rejection ---
{
  const supabase = makeFakeSupabase({ rpcScenario: { status: 'ok', population: 99, numerator: 99, denominator: 99 } });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW, filters: { agent: 'agent-outside-scope' } }, SCOPED_ACCESS);
  assertTrue('6. unauthorized filter: rejected, never reaches the database', result.groups[0].result.kind === 'unauthorized_filter' && !supabase.calls.some((c) => c.fn === 'call_center_cma_evaluate_measure'));
}

// --- 7. Pending-definition rejection ---
{
  const supabase = makeFakeSupabase({ rpcScenario: { status: 'ok', population: 1, numerator: 1, denominator: 1 } });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-ESC-RATE', window: WINDOW }, ALL_ACCESS);
  assert('7. pending_decision: algorithmStatus', result.algorithmStatus, 'pending_decision');
  assert('7. pending_decision: result kind', result.groups[0].result, { kind: 'not_yet_governed' });
  assert('7. pending_decision: migration reference is surfaced for traceability, never executed', result.resolvedMeasureId, 'ESC-03');
  assertTrue('7. pending_decision: never reaches the database', !supabase.calls.some((c) => c.fn === 'call_center_cma_evaluate_measure'));
}

// --- 8. Zero-interaction / zero-denominator handling ---
{
  const supabase = makeFakeSupabase({ rpcScenario: { status: 'ok', population: 0, numerator: null, denominator: 0 } });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW }, ALL_ACCESS);
  assert('8. zero eligible interactions: result kind (never fabricated as 0%)', result.groups[0].result, { kind: 'zero_denominator', displayAs: 'null' });
}

// --- 9. Missing-fact handling (registry/algorithm drift: the registry no longer records a
// base fact this algorithm expects for its resolved occurrence) ---
{
  const supabase = makeFakeSupabase({ rpcScenario: { status: 'ok', population: 1, numerator: 1, denominator: 1 } });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-AVG-SENT-SCORE', window: WINDOW }, ALL_ACCESS);
  assert('9. missing required facts: result kind', result.groups[0].result.kind, 'missing_required_facts');
  assertTrue('9. missing required facts: never reaches the database', !supabase.calls.some((c) => c.fn === 'call_center_cma_evaluate_measure'));
}

// --- 10. Repeated evaluation returns the same result ---
{
  const supabase = makeFakeSupabase({ rpcScenario: { status: 'ok', population: 10, numerator: 7, denominator: 10 } });
  const r1 = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW }, ALL_ACCESS);
  const r2 = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW }, ALL_ACCESS);
  const strip = (r) => { const { evaluatedAt, ...rest } = r; return rest; };
  assert('10. repeated evaluation: identical results (evaluatedAt excluded)', strip(r1), strip(r2));
}

// --- extra: not_found ---
{
  const supabase = makeFakeSupabase({ rpcScenario: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-DOES-NOT-EXIST', window: WINDOW }, ALL_ACCESS);
  assert('extra: unknown canonical measure id -> not_found', result.groups[0].result.kind, 'not_found');
}

// --- extra: mock measure never evaluated as real ---
{
  const supabase = makeFakeSupabase({ rpcScenario: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-NPS-CAMPAIGNS', window: WINDOW }, ALL_ACCESS);
  assert('extra: mock indicator -> mock kind, never value', result.groups[0].result.kind, 'mock');
}

// --- extra: unimplemented measure ---
{
  const supabase = makeFakeSupabase({ rpcScenario: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CONTACT-RATE', window: WINDOW }, ALL_ACCESS);
  assert('extra: unimplemented registry status -> unimplemented kind', result.groups[0].result.kind, 'unimplemented');
}

// ===================== CMA-3B: new source families =====================

// --- CMA-3B 1. 'interaction' family extended: CANON-INTENT-CONFIDENCE dispatches to the SAME
// RPC as CMA-3A's 4 measures, with the correct canonical id. ---
{
  let capturedRpc = null;
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_measure: { status: 'ok', population: 4, numerator: 2.8, denominator: 4 } },
    onCall: (fn) => { capturedRpc = fn; },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-INTENT-CONFIDENCE', window: WINDOW }, ALL_ACCESS);
  assert('CMA-3B.1 intent confidence: dispatches to the interaction RPC', capturedRpc, 'call_center_cma_evaluate_measure');
  assert('CMA-3B.1 intent confidence: value (score unit, 2 decimals)', result.groups[0].result, { kind: 'value', value: 0.7, unit: 'score' });
}

// --- CMA-3B 2. 'qa' family: dispatches to the qa RPC, percent unit. ---
{
  let capturedRpc = null, capturedArgs = null;
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_qa_measure: { status: 'ok', population: 4, numerator: 3, denominator: 4 } },
    onCall: (fn, args) => { capturedRpc = fn; capturedArgs = args; },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CONTEXT-CONTINUITY-RATE', window: WINDOW, filters: { channel: 'voice' } }, ALL_ACCESS);
  assert('CMA-3B.2 qa family: dispatches to the qa RPC', capturedRpc, 'call_center_cma_evaluate_qa_measure');
  assert('CMA-3B.2 qa family: value', result.groups[0].result, { kind: 'value', value: 75, unit: 'percent' });
  assertTrue('CMA-3B.2 qa family: the qa RPC never receives a p_filter_campaign_id argument (not part of its real signature)', !('p_filter_campaign_id' in capturedArgs));
}

// --- CMA-3B 3. 'qa' family: a campaign filter is rejected for a qa-backed measure (qa's
// supportedDimensions is ['agent','channel'] only — no 'campaign'). ---
{
  const supabase = makeFakeSupabase({ rpcScenarios: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CONTEXT-CONTINUITY-RATE', window: WINDOW, filters: { campaign: 'some-campaign-id' } }, ALL_ACCESS);
  assertTrue('CMA-3B.3 qa family rejects an unsupported campaign filter before touching the database', !supabase.calls.some((c) => c.fn === 'call_center_cma_evaluate_qa_measure'));
  assert('CMA-3B.3 qa family rejects an unsupported campaign filter: result kind', result.groups[0].result.kind, 'unsupported_dimension');
}

// --- Session 4D. QA population selector: defaults to 'combined' when omitted (byte-for-byte
// unchanged behavior for every pre-existing caller). ---
{
  let capturedArgs = null;
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_qa_measure: { status: 'ok', population: 4, numerator: 3, denominator: 4 } },
    onCall: (fn, args) => { capturedArgs = args; },
  });
  await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CONTEXT-CONTINUITY-RATE', window: WINDOW }, ALL_ACCESS);
  assert("Session 4D qa population selector: defaults to 'combined' when omitted", capturedArgs.p_population, 'combined');
}

// --- Session 4D. QA population selector: 'human' is passed through to the RPC untouched. ---
{
  let capturedArgs = null;
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_qa_measure: { status: 'ok', population: 2, numerator: 2, denominator: 2 } },
    onCall: (fn, args) => { capturedArgs = args; },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CONTEXT-CONTINUITY-RATE', window: WINDOW, qaPopulation: 'human' }, ALL_ACCESS);
  assert("Session 4D qa population selector: 'human' passed through", capturedArgs.p_population, 'human');
  assert('Session 4D qa population selector: value computed from the (mocked) human-only RPC result', result.groups[0].result, { kind: 'value', value: 100, unit: 'percent' });
}

// --- Session 4D. QA population selector: rejected for a non-QA measure, never reaches the database. ---
{
  const supabase = makeFakeSupabase({ rpcScenarios: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-RES-RATE', window: WINDOW, qaPopulation: 'human' }, ALL_ACCESS);
  assertTrue('Session 4D qa population selector: rejected for a non-QA measure before touching the database', !supabase.calls.some((c) => c.fn === 'call_center_cma_evaluate_measure'));
  assert('Session 4D qa population selector: rejected for a non-QA measure: result kind', result.groups[0].result.kind, 'unsupported');
}

// --- Session 4D. QA population selector: an invalid value is rejected before touching the database. ---
{
  const supabase = makeFakeSupabase({ rpcScenarios: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CONTEXT-CONTINUITY-RATE', window: WINDOW, qaPopulation: 'both' }, ALL_ACCESS);
  assertTrue('Session 4D qa population selector: invalid value rejected before touching the database', !supabase.calls.some((c) => c.fn === 'call_center_cma_evaluate_qa_measure'));
  assert('Session 4D qa population selector: invalid value: result kind', result.groups[0].result.kind, 'unsupported');
}

// --- CMA-3B 4. 'campaign' family: count unit never reports zero_denominator for a real zero count. ---
{
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_campaign_measure: { status: 'ok', population: 0, numerator: 0, denominator: 0 } },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CAMPAIGN-TARGET-COUNT', window: WINDOW }, ALL_ACCESS);
  assert('CMA-3B.4 campaign count: a genuine zero count is a real value, not zero_denominator', result.groups[0].result, { kind: 'value', value: 0, unit: 'count' });
}

// --- CMA-3B 5. 'campaign' family: grouped by campaign (a dimension no other family supports). ---
{
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_campaign_measure: { status: 'ok', groups: [{ key: 'camp-1', population: 5, numerator: 5, denominator: 5 }] } },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI', window: WINDOW, groupBy: 'campaign' }, ALL_ACCESS);
  assert('CMA-3B.5 campaign family: groupBy campaign works', result.groups[0].groupKey, 'camp-1');
}

// --- CMA-3B 6. 'chat' family: dispatches to the chat RPC, seconds unit, agent-only dimensions. ---
{
  let capturedRpc = null;
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_chat_measure: { status: 'ok', population: 3, numerator: 1080, denominator: 3 } },
    onCall: (fn) => { capturedRpc = fn; },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CHAT-SESSION-SPAN', window: WINDOW }, ALL_ACCESS);
  assert('CMA-3B.6 chat family: dispatches to the chat RPC', capturedRpc, 'call_center_cma_evaluate_chat_measure');
  assert('CMA-3B.6 chat family: value', result.groups[0].result, { kind: 'value', value: 360, unit: 'seconds' });
}

// --- CMA-3B 7. 'chat' family: a channel filter is rejected (chat has no 'channel' column to filter by in this engine's model). ---
{
  const supabase = makeFakeSupabase({ rpcScenarios: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CHAT-SESSION-SPAN', window: WINDOW, filters: { channel: 'voice' } }, ALL_ACCESS);
  assert('CMA-3B.7 chat family rejects a channel filter (not in its supportedDimensions)', result.groups[0].result.kind, 'unsupported_dimension');
}

// --- CMA-3B 8. 'action' family: dispatches to the action RPC, count unit. ---
{
  let capturedRpc = null;
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_action_measure: { status: 'ok', population: 3, numerator: 3, denominator: 3 } },
    onCall: (fn) => { capturedRpc = fn; },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-ACTION-REQUIRED-QUEUE-ITEMS', window: WINDOW }, ALL_ACCESS);
  assert('CMA-3B.8 action family: dispatches to the action RPC', capturedRpc, 'call_center_cma_evaluate_action_measure');
  assert('CMA-3B.8 action family: raw count value', result.groups[0].result, { kind: 'value', value: 3, unit: 'count' });
}

// --- CMA-3B 9. Unauthorized agent filter is rejected before the database for a non-interaction family too (scope enforcement is family-agnostic). ---
{
  const scopedAccess = { allCategories: false, authorizedAgentIds: ['agent-a'] };
  const supabase = makeFakeSupabase({ rpcScenarios: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CHAT-SESSION-SPAN', window: WINDOW, filters: { agent: 'agent-outside-scope' } }, scopedAccess);
  assertTrue('CMA-3B.9 unauthorized agent filter rejected for the chat family too, never reaches the database', result.groups[0].result.kind === 'unauthorized_filter' && !supabase.calls.some((c) => c.fn === 'call_center_cma_evaluate_chat_measure'));
}

// ===================== CMA-3B.1: dimension governance correction =====================

// --- CMA-3B.1 1. The CMA Dimensions Registry is now the sole authority for ALL families —
// querying it is proven mandatory even for a non-interaction family (previously skipped). ---
{
  let dimensionsRpcCalled = false;
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_qa_measure: { status: 'ok', population: 4, numerator: 3, denominator: 4 } },
    onCall: (fn) => { if (fn === 'call_center_cma_measure_dimensions_list') dimensionsRpcCalled = true; },
  });
  await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CONTEXT-CONTINUITY-RATE', window: WINDOW, filters: { agent: 'agent-a' } }, ALL_ACCESS);
  assertTrue('CMA-3B.1.1 the qa family (non-interaction) now consults the real dimensions registry, not an in-code duplicate', dimensionsRpcCalled);
}

// --- CMA-3B.1 2. campaign dimension now WORKS for the chat family (the fix) — previously this
// would have been wrongly rejected by the old in-code supportedDimensions array (['agent'] only). ---
{
  let capturedArgs = null;
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_chat_measure: { status: 'ok', population: 2, numerator: 240, denominator: 2 } },
    onCall: (fn, args) => { if (fn === 'call_center_cma_evaluate_chat_measure') capturedArgs = args; },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CHAT-SESSION-SPAN', window: WINDOW, filters: { campaign: 'camp-1' } }, ALL_ACCESS);
  assert('CMA-3B.1.2 chat family now accepts a campaign filter (matches the registry\'s real, correct claim)', result.groups[0].result, { kind: 'value', value: 120, unit: 'seconds' });
  assert('CMA-3B.1.2 the chat RPC receives p_filter_campaign_id', capturedArgs.p_filter_campaign_id, 'camp-1');
}

// --- CMA-3B.1 3. campaign dimension now WORKS for the action family too (same fix). ---
{
  const supabase = makeFakeSupabase({
    rpcScenarios: { call_center_cma_evaluate_action_measure: { status: 'ok', population: 5, numerator: 5, denominator: 5 } },
  });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-ACTION-REQUIRED-QUEUE-ITEMS', window: WINDOW, filters: { campaign: 'camp-1' } }, ALL_ACCESS);
  assert('CMA-3B.1.3 action family now accepts a campaign filter', result.groups[0].result, { kind: 'value', value: 5, unit: 'count' });
}

// --- CMA-3B.1 4. channel is still correctly rejected for campaign/chat/action families (the
// registry's prior, unsupported claim was removed — this proves the removal took effect, not
// just that it was never checked). ---
{
  const supabase = makeFakeSupabase({ rpcScenarios: {} });
  const result = await evaluateCmaMeasure(supabase, { canonicalMeasureId: 'CANON-CAMPAIGN-TARGET-COUNT', window: WINDOW, filters: { channel: 'voice' } }, ALL_ACCESS);
  assert('CMA-3B.1.4 campaign family still rejects channel (the unsupported registry relationship was removed, not left in place)', result.groups[0].result.kind, 'unsupported_dimension');
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
