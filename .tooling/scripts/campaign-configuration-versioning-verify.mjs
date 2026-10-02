// Session 12.7 — deterministic verification of makeGoverningConfigResolver
// (reconcileExecutions.ts), against the REAL compiled module via esbuild —
// not a reimplementation. Covers items 3/4/5/26 of the 12.7 deterministic
// test list: an execution's own configurationVersionId (not the campaign's
// current/live snapshot) determines which agent/outcome-policy governs its
// classification, with a clean fallback to the live campaign for
// legacy/never-versioned executions.

import { makeGoverningConfigResolver } from '../tmp/reconcileExecutions.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function makeFakeRepo({ liveCampaign, versions }) {
  let getCampaignCalls = 0;
  let getVersionCalls = 0;
  return {
    calls: () => ({ getCampaignCalls, getVersionCalls }),
    async getCampaign(id) {
      getCampaignCalls++;
      return liveCampaign;
    },
    async getConfigurationVersion(versionId) {
      getVersionCalls++;
      return versions[versionId] ?? null;
    },
  };
}

// 1. Legacy/never-versioned execution (configurationVersionId null) falls back to the live campaign snapshot — unchanged pre-12.7 behavior.
{
  const repo = makeFakeRepo({
    liveCampaign: { rules: [{ id: 'r1' }], agentId: 'agent-live', agentName: 'Live Agent', outcomePolicySnapshot: { mappings: [], capturedAt: 'now' } },
    versions: {},
  });
  const resolve = makeGoverningConfigResolver(repo);
  const result = resolve('campaign-1', null);
  result.then((r) => {
    assert('legacy execution (null version) uses live campaign agentId', r.agentId, 'agent-live');
  });
}

// 2/3. Two executions of the SAME campaign with DIFFERENT configurationVersionId resolve to their OWN version's snapshot, not the live/current one — the core §16/§17 provenance guarantee.
{
  const v1 = { agentId: 'agent-v1', agentName: 'Agent V1', outcomePolicySnapshot: { mappings: [{ agentOutcomeCode: 'X', campaignClassificationCode: 'A', nextActionType: null }], capturedAt: 't1' } };
  const v2 = { agentId: 'agent-v2', agentName: 'Agent V2', outcomePolicySnapshot: { mappings: [{ agentOutcomeCode: 'X', campaignClassificationCode: 'B', nextActionType: null }], capturedAt: 't2' } };
  const repo = makeFakeRepo({
    liveCampaign: { rules: [], agentId: 'agent-v2', agentName: 'Agent V2', outcomePolicySnapshot: v2.outcomePolicySnapshot },
    versions: { 'v1-id': v1, 'v2-id': v2 },
  });
  const resolve = makeGoverningConfigResolver(repo);
  Promise.all([resolve('campaign-1', 'v1-id'), resolve('campaign-1', 'v2-id')]).then(([r1, r2]) => {
    assert('old execution resolves OLD version agentId (not live)', r1.agentId, 'agent-v1');
    assert('new execution resolves NEW version agentId', r2.agentId, 'agent-v2');
    assert('old execution outcome policy maps X -> A (old policy)', r1.outcomePolicySnapshot.mappings[0].campaignClassificationCode, 'A');
    assert('new execution outcome policy maps X -> B (new policy), same code different result', r2.outcomePolicySnapshot.mappings[0].campaignClassificationCode, 'B');
  });
}

// 4. Generic campaign_result_rules remain UNVERSIONED (always from the live campaign) — §6/§18 scope decision, regardless of which configuration version governed classification.
{
  const repo = makeFakeRepo({
    liveCampaign: { rules: [{ id: 'live-rule' }], agentId: 'agent-live', agentName: null, outcomePolicySnapshot: null },
    versions: { 'v1-id': { agentId: 'agent-v1', agentName: null, outcomePolicySnapshot: null } },
  });
  const resolve = makeGoverningConfigResolver(repo);
  resolve('campaign-1', 'v1-id').then((r) => {
    assert('rules always come from the live campaign, never versioned', r.rules, [{ id: 'live-rule' }]);
  });
}

// 5. A version id that fails to resolve (shouldn't happen once stamped) falls back to the live campaign honestly, never throws/fabricates.
{
  const repo = makeFakeRepo({
    liveCampaign: { rules: [], agentId: 'agent-live', agentName: 'Live', outcomePolicySnapshot: null },
    versions: {},
  });
  const resolve = makeGoverningConfigResolver(repo);
  resolve('campaign-1', 'nonexistent-version-id').then((r) => {
    assert('unresolvable version id falls back to live campaign', r.agentId, 'agent-live');
  });
}

// 6. Per-run caching: resolving the same versionId twice SEQUENTIALLY (the
// real usage pattern — reconcilePendingExecutions awaits each execution in
// turn inside a for-loop, never concurrently) only fetches it once.
{
  const repo = makeFakeRepo({
    liveCampaign: { rules: [], agentId: 'agent-live', agentName: null, outcomePolicySnapshot: null },
    versions: { 'v1-id': { agentId: 'agent-v1', agentName: null, outcomePolicySnapshot: null } },
  });
  const resolve = makeGoverningConfigResolver(repo);
  (async () => {
    await resolve('campaign-1', 'v1-id');
    await resolve('campaign-1', 'v1-id');
    assert('version lookup is cached per run (fetched once for two sequential calls)', repo.calls().getVersionCalls, 1);
  })();
}

setTimeout(() => {
  console.log(`\n${pass}/${pass + fail} passed.`);
  if (fail > 0) process.exit(1);
}, 100);
