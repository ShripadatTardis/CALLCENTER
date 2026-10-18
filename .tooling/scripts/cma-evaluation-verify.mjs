// CMA-3A — Central Calculation & Evaluation Engine. Deterministic
// coverage of the real compiled pipeline logic in
// src/server/cma/cmaEvaluation.ts (via esbuild, not a reimplementation)
// against a hand-written fake Supabase client whose `.rpc()` is
// scripted per test. This covers governance short-circuiting, dimension
// validation, scope narrowing, and response shaping — everything that
// does NOT require a real Postgres aggregation. The actual SQL RPC
// (call_center_cma_evaluate_measure)'s correctness against known
// interaction facts is validated separately against a real disposable
// PostgreSQL instance — see docs/SESSION_CMA_3A_CALCULATION_ENGINE.md,
// "Database verification," for that run's account; it is NOT re-run
// here, since this script intentionally never touches a real database.

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
};

const BASE_FACTS = {
  'RES-01': [{ baseFact: { id: 'FACT-OUTCOME' }, role: 'numerator' }],
  'AGENT-SENT-01': [], // deliberately missing FACT-SENTIMENT-SCORE -> registry/algorithm drift test
};

const DIMENSIONS = {
  'RES-01': [{ id: 'agent' }, { id: 'channel' }, { id: 'campaign' }, { id: 'time' }, { id: 'outcome' }],
  'AGENT-SENT-01': [{ id: 'agent' }, { id: 'channel' }, { id: 'campaign' }, { id: 'time' }],
};

function makeFakeSupabase({ rpcScenario = {}, onCall } = {}) {
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
      if (fn === 'call_center_cma_evaluate_measure') {
        if (typeof rpcScenario === 'function') return { data: rpcScenario(args), error: null };
        return { data: rpcScenario, error: null };
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

console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
