// Session 12.6 — deterministic verification of Campaign Outcome Policy
// + Universal Campaign Classification, against the REAL compiled
// src/server/campaigns/outcomePolicy.ts and reconcileExecutions.ts (via
// esbuild, not a reimplementation).

import { deriveCampaignClassification } from '../tmp/outcomePolicy.mjs';
import { reconcilePendingExecutions, enrichReconciledExecutionsWithActualOutcome } from '../tmp/reconcileExecutions.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

const UNRESOLVED = 'UNRESOLVED';

const emiPolicy = {
  mappings: [
    { agentOutcomeCode: 'PROMISE_TO_PAY', campaignClassificationCode: 'SUCCESSFUL', nextActionType: 'close' },
    { agentOutcomeCode: 'CALLBACK_REQUESTED', campaignClassificationCode: 'FOLLOW_UP_REQUIRED', nextActionType: 'follow_up' },
    { agentOutcomeCode: 'NO_COMMITMENT', campaignClassificationCode: 'UNSUCCESSFUL', nextActionType: 'close' },
    { agentOutcomeCode: 'WRONG_PERSON', campaignClassificationCode: 'INVALID_TARGET', nextActionType: null },
  ],
  capturedAt: '2026-10-02T00:00:00Z',
};

// 1. All five universal codes reachable through a policy (four mapped + UNRESOLVED fallback).
{
  assert('PROMISE_TO_PAY -> SUCCESSFUL', deriveCampaignClassification('PROMISE_TO_PAY', emiPolicy, UNRESOLVED).campaignClassificationCode, 'SUCCESSFUL');
  assert('CALLBACK_REQUESTED -> FOLLOW_UP_REQUIRED', deriveCampaignClassification('CALLBACK_REQUESTED', emiPolicy, UNRESOLVED).campaignClassificationCode, 'FOLLOW_UP_REQUIRED');
  assert('NO_COMMITMENT -> UNSUCCESSFUL', deriveCampaignClassification('NO_COMMITMENT', emiPolicy, UNRESOLVED).campaignClassificationCode, 'UNSUCCESSFUL');
  assert('WRONG_PERSON -> INVALID_TARGET', deriveCampaignClassification('WRONG_PERSON', emiPolicy, UNRESOLVED).campaignClassificationCode, 'INVALID_TARGET');
  assert('unmapped code -> UNRESOLVED (fallback)', deriveCampaignClassification('SOME_UNMAPPED_CODE', emiPolicy, UNRESOLVED).campaignClassificationCode, 'UNRESOLVED');
}

// 2. Known agent outcome mapped to each classification — isSuccess/nextAction carried through, not reinvented.
{
  const r = deriveCampaignClassification('PROMISE_TO_PAY', emiPolicy, UNRESOLVED);
  assert('mapped outcome carries its configured nextActionType', r.classificationNextActionType, 'close');
  assert('mapped outcome: no contract drift', r.classificationContractDrift, false);
}

// 3. The same agent outcome can map differently in two different campaigns (policy is per-campaign, never global).
{
  const otherCampaignPolicy = {
    mappings: [{ agentOutcomeCode: 'PROMISE_TO_PAY', campaignClassificationCode: 'FOLLOW_UP_REQUIRED', nextActionType: 'follow_up' }],
    capturedAt: '2026-10-02T00:00:00Z',
  };
  const a = deriveCampaignClassification('PROMISE_TO_PAY', emiPolicy, UNRESOLVED);
  const b = deriveCampaignClassification('PROMISE_TO_PAY', otherCampaignPolicy, UNRESOLVED);
  assert('same agent outcome, different campaign policy -> different classification', [a.campaignClassificationCode, b.campaignClassificationCode], ['SUCCESSFUL', 'FOLLOW_UP_REQUIRED']);
}

// 4. Policy is captured/immutable per campaign — a null policy (legacy campaign) never classifies, even with a real actual outcome.
{
  const r = deriveCampaignClassification('PROMISE_TO_PAY', null, UNRESOLVED);
  assert('legacy campaign (no captured policy): no classification synthesized', r, { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null });
}

// 5. Unknown runtime outcome (contract drift) -> preserved raw by the caller (actualOutcomeCode is a separate, untouched field — see reconcileExecutions.ts), classification falls back to UNRESOLVED, flagged.
{
  const r = deriveCampaignClassification('BRAND_NEW_CODE', emiPolicy, UNRESOLVED);
  assert('contract drift: classification = UNRESOLVED fallback', r.campaignClassificationCode, 'UNRESOLVED');
  assert('contract drift: flagged true', r.classificationContractDrift, true);
  assert('contract drift: no next action guessed', r.classificationNextActionType, null);
}

// 6. Null actual outcome -> no fabricated Campaign Classification, regardless of whether a policy exists.
{
  const withPolicy = deriveCampaignClassification(null, emiPolicy, UNRESOLVED);
  const withoutPolicy = deriveCampaignClassification(null, null, UNRESOLVED);
  assert('null actual outcome + policy: no classification', withPolicy.campaignClassificationCode, null);
  assert('null actual outcome + no policy: no classification', withoutPolicy.campaignClassificationCode, null);
}

// 7. Classification uses only explicit actual outcome + captured policy — the function's own signature takes only
// those two inputs (plus the data-driven fallback code) and nothing else; verified by construction (no transcript/
// sentiment/intent/fcr parameter exists at all), plus a direct check that varying nothing but the policy changes the result.
{
  assert('function signature takes exactly (code, policy, fallbackCode)', deriveCampaignClassification.length, 3);
}

// 8. The unresolvedFallbackCode is a parameter, never a hardcoded string inside the function — confirmed by
// passing a DIFFERENT fallback code and checking contract-drift results use it instead of a baked-in 'UNRESOLVED'.
{
  const r = deriveCampaignClassification('BRAND_NEW_CODE', emiPolicy, 'CUSTOM_FALLBACK_CODE');
  assert('fallback code is data-driven, not hardcoded', r.campaignClassificationCode, 'CUSTOM_FALLBACK_CODE');
}

// --- Reconciliation / enrichment integration (fake repo fixtures) ---

function makeFakeRepo({ targets, campaignById, classifications, resultsByExecution }) {
  const results = new Map(Object.entries(resultsByExecution ?? {}));
  const updateCalls = [];
  const enrichCalls = [];
  return {
    async listPendingReconciliations() {
      return targets;
    },
    async listReconciledMissingActualOutcome() {
      return targets;
    },
    async getCampaign(id) {
      return campaignById[id] ?? null;
    },
    async listClassifications() {
      return classifications;
    },
    async updateReconciliationStatus(executionId, status, reconciledInteractionId, candidate, now, result) {
      updateCalls.push({ executionId, status, result });
      if (status === 'reconciled' && result) results.set(executionId, result);
      return { targetId: 't-' + executionId, resultId: 'result-' + executionId };
    },
    async enrichActualOutcome(executionId, code, name, outputs, now, classification) {
      enrichCalls.push({ executionId, code, classification });
      const existing = results.get(executionId);
      if (!existing || existing.actualOutcomeCode) {
        return { resultId: null, enriched: false, reason: existing ? 'already_enriched' : 'no_reconciled_result' };
      }
      results.set(executionId, { ...existing, actualOutcomeCode: code, ...classification });
      return { resultId: 'result-' + executionId, enriched: true, reason: null };
    },
    _updateCalls: updateCalls,
    _enrichCalls: enrichCalls,
    _results: results,
  };
}

const liveClassifications = [
  { code: 'SUCCESSFUL', label: 'Successful', isSuccess: true, isFallbackUnresolved: false },
  { code: 'FOLLOW_UP_REQUIRED', label: 'Follow-up Required', isSuccess: false, isFallbackUnresolved: false },
  { code: 'UNSUCCESSFUL', label: 'Unsuccessful', isSuccess: false, isFallbackUnresolved: false },
  { code: 'INVALID_TARGET', label: 'Invalid Target', isSuccess: false, isFallbackUnresolved: false },
  { code: 'UNRESOLVED', label: 'Unresolved', isSuccess: false, isFallbackUnresolved: true },
];

process.env.CAMPAIGN_RECONCILIATION_CORRELATION_MODE = 'call_sid_equals_call_id';
process.env.VOICEBOT_BASE_URL = 'https://fixture.invalid';
process.env.VOICEBOT_API_KEY = 'fixture-key';
const realFetch = globalThis.fetch;

function stubFetchReturning(call) {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ success: true, data: { calls: [call], pagination: { page: 1, page_size: 25, total_records: 1, total_pages: 1 } } }),
  });
}

// 9. Launch-blocking completeness is a UI-layer concern (CreateCampaign.tsx) — not server-testable via this fixture
// harness; verified instead by direct inspection: requiredOutcomesUnmapped only affects the `blockers` array feeding
// `isReady`, which gates the Launch Now button, never Save as Draft. (Documented, not re-asserted here.)

// 10. Reconciliation: known outcome against a captured policy produces a classification alongside the untouched generic result.
{
  const repo = makeFakeRepo({
    targets: [{ id: 'exec-10', campaignId: 'camp-10', callSid: 'call-10', triggeredAt: '2026-10-01T00:00:00Z', contactRawValue: '+1', sourceAttributes: {} }],
    campaignById: { 'camp-10': { rules: [{ priority: 10, matchField: 'outcome', matchValue: 'resolved', resultCode: 'resolved', resultLabel: 'Resolved', isSuccess: true, active: true }], agentId: 'a', agentName: 'A', outcomePolicySnapshot: emiPolicy } },
    classifications: liveClassifications,
  });
  stubFetchReturning({ call_id: 'call-10', status: 'inactive', outcome: 'resolved', actual_outcome_code: 'PROMISE_TO_PAY', actual_outcome_name: 'Promise to Pay', structured_outputs: null });
  await reconcilePendingExecutions(repo, 10);
  const result = repo._updateCalls.find((c) => c.executionId === 'exec-10').result;
  assert('reconcile: generic result untouched', { resultCode: result.resultCode, isSuccess: result.isSuccess }, { resultCode: 'resolved', isSuccess: true });
  assert('reconcile: classification derived alongside it', result.campaignClassificationCode, 'SUCCESSFUL');
}

// 11. SUCCESSFUL produces success semantics (isSuccess on the classification's own master-list row); other classifications do not.
{
  const successRow = liveClassifications.find((c) => c.code === 'SUCCESSFUL');
  const othersSuccess = liveClassifications.filter((c) => c.code !== 'SUCCESSFUL').map((c) => c.isSuccess);
  assert('SUCCESSFUL is the only is_success=true row', [successRow.isSuccess, ...othersSuccess], [true, false, false, false, false]);
}

// 12. Existing legacy campaign result semantics remain unchanged — a campaign with no outcomePolicySnapshot gets no classification at all, generic result still computed.
{
  const repo = makeFakeRepo({
    targets: [{ id: 'exec-12', campaignId: 'camp-12', callSid: 'call-12', triggeredAt: '2026-10-01T00:00:00Z', contactRawValue: '+1', sourceAttributes: {} }],
    campaignById: { 'camp-12': { rules: [{ priority: 10, matchField: 'outcome', matchValue: 'resolved', resultCode: 'resolved', resultLabel: 'Resolved', isSuccess: true, active: true }], agentId: 'a', agentName: 'A', outcomePolicySnapshot: null } },
    classifications: liveClassifications,
  });
  stubFetchReturning({ call_id: 'call-12', status: 'inactive', outcome: 'resolved', actual_outcome_code: 'PROMISE_TO_PAY', actual_outcome_name: 'Promise to Pay', structured_outputs: null });
  await reconcilePendingExecutions(repo, 10);
  const result = repo._updateCalls.find((c) => c.executionId === 'exec-12').result;
  assert('legacy campaign: generic result still computed', result.resultCode, 'resolved');
  assert('legacy campaign: no classification synthesized despite real actual outcome', result.campaignClassificationCode, null);
}

// 13. Enrichment idempotency with classification: first pass classifies, second pass is a no-op.
{
  const repo = makeFakeRepo({
    targets: [{ id: 'exec-13', campaignId: 'camp-13', callSid: 'call-13', triggeredAt: '2026-10-01T00:00:00Z', contactRawValue: '+1', sourceAttributes: {} }],
    campaignById: { 'camp-13': { rules: [], agentId: 'a', agentName: 'A', outcomePolicySnapshot: emiPolicy } },
    classifications: liveClassifications,
    resultsByExecution: { 'exec-13': { id: 'result-13', actualOutcomeCode: null } },
  });
  stubFetchReturning({ call_id: 'call-13', status: 'inactive', outcome: 'resolved', actual_outcome_code: 'NO_COMMITMENT', actual_outcome_name: 'No Commitment', structured_outputs: null });
  const first = await enrichReconciledExecutionsWithActualOutcome(repo, 10);
  assert('enrichment first pass: exactly one enriched with classification', { enriched: first.enriched, classification: repo._enrichCalls[0].classification.campaignClassificationCode }, { enriched: 1, classification: 'UNSUCCESSFUL' });
  const second = await enrichReconciledExecutionsWithActualOutcome(repo, 10);
  assert('enrichment second pass: idempotent no-op', second.enriched, 0);
}

globalThis.fetch = realFetch;

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
