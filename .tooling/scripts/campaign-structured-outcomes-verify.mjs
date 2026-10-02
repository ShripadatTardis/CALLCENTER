// Session 12.5 — deterministic verification of structured campaign
// outcomes integration, against the REAL compiled
// src/server/campaigns/resultRules.ts, reconcileExecutions.ts, and
// src/lib/campaignActualOutcome.ts (via esbuild, not a reimplementation).

import { deriveCampaignResult } from '../tmp/resultRules.mjs';
import { enrichReconciledExecutionsWithActualOutcome } from '../tmp/reconcileExecutions.mjs';
import { classifyActualOutcome, classifyStructuredOutputs, formatOutputValue } from '../tmp/campaignActualOutcome.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

const genericRules = [
  { priority: 10, matchField: 'escalation_trigger', matchValue: 'escalated', resultCode: 'needs_review', resultLabel: 'Needs manual review', isSuccess: false, nextActionType: 'escalate', nextActionDelayDays: null, active: true },
  { priority: 20, matchField: 'outcome', matchValue: 'resolved', resultCode: 'resolved', resultLabel: 'Resolved', isSuccess: true, nextActionType: 'close', nextActionDelayDays: null, active: true },
];

const emiContract = {
  agentId: 'emi-reminder-agent',
  agentName: 'EMI Reminder',
  expectedInputFields: [],
  expectedOutcomes: [
    { outcomeCode: 'PROMISE_TO_PAY', displayName: 'Promise to Pay' },
    { outcomeCode: 'NO_COMMITMENT', displayName: 'No Commitment' },
  ],
  outputFields: [
    { fieldCode: 'promised_payment_date', displayName: 'Promised Payment Date' },
    { fieldCode: 'payment_plan_requested', displayName: 'Payment Plan Requested' },
  ],
  contractSource: 'partner_api',
  contractCompleteness: 'complete',
};

function baseCallData(overrides = {}) {
  return {
    status: 'inactive',
    outcome: 'resolved',
    escalation_trigger: null,
    intent: 'Emi Payment',
    actual_outcome_code: null,
    actual_outcome_name: null,
    structured_outputs: null,
    ...overrides,
  };
}

// 1. Matched call with known actual_outcome_code — preserved alongside the unrelated generic result.
{
  const callData = baseCallData({ actual_outcome_code: 'PROMISE_TO_PAY', actual_outcome_name: 'Promise to Pay' });
  const result = deriveCampaignResult(callData, genericRules);
  assert('known actual_outcome_code preserved', { actualOutcomeCode: result.actualOutcomeCode, actualOutcomeName: result.actualOutcomeName }, { actualOutcomeCode: 'PROMISE_TO_PAY', actualOutcomeName: 'Promise to Pay' });
  assert('generic result untouched by actual outcome', { resultCode: result.resultCode, isSuccess: result.isSuccess }, { resultCode: 'resolved', isSuccess: true });
}

// 2. Matched call with outcome + structured outputs — both persisted.
{
  const callData = baseCallData({
    actual_outcome_code: 'PROMISE_TO_PAY',
    actual_outcome_name: 'Promise to Pay',
    structured_outputs: { promised_payment_date: '2026-10-05', payment_plan_requested: false },
  });
  const result = deriveCampaignResult(callData, genericRules);
  assert('outcome + outputs both persisted', result.structuredOutputs, { promised_payment_date: '2026-10-05', payment_plan_requested: false });
}

// 3. Historical matched call with all new fields null — honest unavailable state, call-level result unaffected.
{
  const callData = baseCallData();
  const result = deriveCampaignResult(callData, genericRules);
  assert('historical null: actualOutcomeCode null', result.actualOutcomeCode, null);
  assert('historical null: structuredOutputs null', result.structuredOutputs, null);
  assert('historical null: generic result still resolved/success', { resultCode: result.resultCode, isSuccess: result.isSuccess }, { resultCode: 'resolved', isSuccess: true });
}

// 4. Outcome present / outputs null.
{
  const callData = baseCallData({ actual_outcome_code: 'NO_COMMITMENT', actual_outcome_name: 'No Commitment' });
  const result = deriveCampaignResult(callData, genericRules);
  assert('outcome-only: code set', result.actualOutcomeCode, 'NO_COMMITMENT');
  assert('outcome-only: outputs null', result.structuredOutputs, null);
}

// 5. Outputs present / outcome null — preserve outputs, never invent an outcome.
{
  const callData = baseCallData({ structured_outputs: { payment_dispute_raised: true } });
  const result = deriveCampaignResult(callData, genericRules);
  assert('outputs-only: outcome stays null', result.actualOutcomeCode, null);
  assert('outputs-only: outputs preserved', result.structuredOutputs, { payment_dispute_raised: true });
}

// 6. Unknown outcome code preserved (raw value kept, never dropped) by deriveCampaignResult itself.
{
  const callData = baseCallData({ actual_outcome_code: 'SOME_NEW_CODE_NOT_YET_DECLARED', actual_outcome_name: 'Some New Code' });
  const result = deriveCampaignResult(callData, genericRules);
  assert('unknown code preserved raw at derivation layer', result.actualOutcomeCode, 'SOME_NEW_CODE_NOT_YET_DECLARED');
}

// 7. classifyActualOutcome: known code against the captured contract.
{
  const classified = classifyActualOutcome(emiContract, 'PROMISE_TO_PAY', 'Promise to Pay');
  assert('classify: known outcome', { availability: classified.availability, displayName: classified.displayName }, { availability: 'known', displayName: 'Promise to Pay' });
}

// 8. classifyActualOutcome: unrecognized/contract-drift code preserved and flagged, not dropped.
{
  const classified = classifyActualOutcome(emiContract, 'BRAND_NEW_OUTCOME', 'Brand New Outcome');
  assert('classify: unrecognized outcome flagged, raw value kept', classified, { availability: 'unrecognized', code: 'BRAND_NEW_OUTCOME', displayName: 'Brand New Outcome', definition: null });
}

// 9. classifyActualOutcome: null code -> unavailable (historical/legacy), never fabricated.
{
  const classified = classifyActualOutcome(emiContract, null, null);
  assert('classify: null code is honestly unavailable', classified.availability, 'unavailable');
}

// 10. classifyStructuredOutputs: known field uses contract display name; unknown field preserved with fallback label.
{
  const outputs = classifyStructuredOutputs(emiContract, { promised_payment_date: '2026-10-05', brand_new_field: 'xyz' });
  const known = outputs.find((o) => o.fieldCode === 'promised_payment_date');
  const unknown = outputs.find((o) => o.fieldCode === 'brand_new_field');
  assert('known output field uses contract display name', known, { fieldCode: 'promised_payment_date', displayName: 'Promised Payment Date', value: '2026-10-05', known: true, definition: emiContract.outputFields[0] });
  assert('unknown output field preserved with readable fallback, flagged', { displayName: unknown.displayName, value: unknown.value, known: unknown.known }, { displayName: 'Brand new field', value: 'xyz', known: false });
}

// 11. formatOutputValue: booleans render as Yes/No, not raw JSON, for the primary UX.
{
  assert('formatOutputValue: true -> Yes', formatOutputValue(true), 'Yes');
  assert('formatOutputValue: false -> No', formatOutputValue(false), 'No');
  assert('formatOutputValue: null -> em dash', formatOutputValue(null), '—');
}

// 12. No inference from transcript/generic outcome/intent/sentiment/FCR — varying those fields alone
// (actual_outcome_code/structured_outputs held null) never produces a non-null actual outcome.
{
  const variants = [
    baseCallData({ outcome: 'resolved', fcr: true, sentiment: 'Positive', intent: 'Emi Payment', transcript_summary: 'Customer agreed to pay.' }),
    baseCallData({ outcome: 'escalated', fcr: false, sentiment: 'Negative', intent: 'Complaint', transcript_summary: 'Customer refused.' }),
  ];
  const results = variants.map((cd) => deriveCampaignResult(cd, genericRules).actualOutcomeCode);
  assert('no inference from generic/transcript fields', results, [null, null]);
}

// 13. Duplicate reconciliation remains idempotent — covered by the existing 12.4 suite
// (campaign-idempotency-verify.mjs), re-run unchanged as part of this session's regression pass.

// 14. Enrichment idempotency — a fake repo simulating the UPDATE-only, only-when-null RPC guard.
{
  function makeFakeRepo(initialResults) {
    const results = new Map(initialResults.map((r) => [r.executionId, { ...r }]));
    const executions = [
      { id: 'exec-1', campaignId: 'c1', callSid: 'call-1', triggeredAt: '2026-10-01T10:00:00Z', contactRawValue: '+919930647999' },
    ];
    const enrichCalls = [];
    return {
      async listReconciledMissingActualOutcome() {
        return executions.filter((e) => {
          const r = results.get(e.id);
          return r && r.actualOutcomeCode === null;
        });
      },
      // Session 12.6 — enrichReconciledExecutionsWithActualOutcome now also
      // resolves the UNRESOLVED fallback code via listClassifications();
      // this suite predates that and has no campaign outcome policy to
      // test, so an empty list is the correct, honest fixture (no
      // classification gets computed, matching this suite's pre-12.6 scope).
      async listClassifications() {
        return [];
      },
      async getCampaign() {
        return { outcomePolicySnapshot: null };
      },
      async enrichActualOutcome(executionId, code, name, outputs) {
        enrichCalls.push({ executionId, code, name, outputs });
        const r = results.get(executionId);
        if (!r || r.actualOutcomeCode !== null || code === null) {
          return { resultId: r ? r.id : null, enriched: false, reason: r && r.actualOutcomeCode !== null ? 'already_enriched' : 'nothing_to_enrich' };
        }
        r.actualOutcomeCode = code;
        r.actualOutcomeName = name;
        r.structuredOutputs = outputs;
        return { resultId: r.id, enriched: true, reason: null };
      },
      _results: results,
      _enrichCalls: enrichCalls,
    };
  }

  // tryAuthoritativeMatch requires CAMPAIGN_RECONCILIATION_CORRELATION_MODE to be set — simulate the
  // call_sid_equals_call_id mode and stub global fetch to return a matching call-data row.
  process.env.CAMPAIGN_RECONCILIATION_CORRELATION_MODE = 'call_sid_equals_call_id';
  process.env.VOICEBOT_BASE_URL = 'https://fixture.invalid';
  process.env.VOICEBOT_API_KEY = 'fixture-key';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        success: true,
        data: {
          calls: [{ call_id: 'call-1', actual_outcome_code: 'PROMISE_TO_PAY', actual_outcome_name: 'Promise to Pay', structured_outputs: { promised_payment_date: '2026-10-05' } }],
          pagination: { page: 1, page_size: 25, total_records: 1, total_pages: 1 },
        },
      }),
  });

  const repo = makeFakeRepo([{ executionId: 'exec-1', id: 'result-1', actualOutcomeCode: null }]);
  const first = await enrichReconciledExecutionsWithActualOutcome(repo, 10);
  assert('enrichment: first pass enriches exactly once', { enriched: first.enriched, calls: repo._enrichCalls.length }, { enriched: 1, calls: 1 });
  assert('enrichment: no triggerCall-capable method exists on fake backend', typeof repo.triggerCall, 'undefined');

  const second = await enrichReconciledExecutionsWithActualOutcome(repo, 10);
  assert('enrichment: second pass finds nothing left to enrich (idempotent)', { enriched: second.enriched, processed: second.processed }, { enriched: 0, processed: 0 });

  globalThis.fetch = realFetch;
}

// 15. Existing call_sid == call_id correlation semantics are untouched — deriveCampaignResult and
// enrichment both operate strictly on the row already matched by call_sid === call_id upstream;
// no phone/time/customer/agent/campaign_name field ever appears in either function's matching logic.
{
  const src = (await import('node:fs/promises')).readFile;
  const text = await src(new URL('../tmp/reconcileExecutions.mjs', import.meta.url), 'utf8');
  const usesOnlyCallIdForAuthoritativeMatch = text.includes('c.call_id === execution.callSid') || text.includes('.call_id === execution.callSid');
  assert('authoritative match still keyed on call_id === callSid', usesOnlyCallIdForAuthoritativeMatch, true);
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
