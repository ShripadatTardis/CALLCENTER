// Session 13.4 (DEC-CAMP-01) — deterministic verification of
// buildConfigurationVersionViews / diffConfigurationVersions against the
// REAL compiled src/lib/campaignConfigurationDiff.ts (via esbuild, not a
// reimplementation). Covers the §8 required list: v1 only, v1 -> v2,
// multiple versions, Agent change, Input Mapping change, Outcome Mapping
// change, unchanged data not reported as changed, legacy campaign without
// configuration versions, and legacy rule handling (exercised at the
// component level, not here — rules are plain passthrough, no derived
// logic to unit test).

import { buildConfigurationVersionViews, diffConfigurationVersions } from '../tmp/campaignConfigurationDiff.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

const contractV1 = {
  agentId: 'emi-reminder-agent',
  agentName: 'EMI Reminder',
  expectedInputFields: [{ fieldCode: 'customer_name', displayName: 'Customer Name', dataType: 'string', required: true }],
  expectedOutcomes: [{ outcomeCode: 'opted_out', displayName: 'Opted Out' }],
  outputFields: [],
  contractSource: 'partner_api',
  contractCompleteness: 'complete',
};
const contractV2 = {
  ...contractV1,
  expectedInputFields: [
    ...contractV1.expectedInputFields,
    { fieldCode: 'emi_amount', displayName: 'EMI Amount', dataType: 'decimal', required: true },
  ],
};

// --- v1 only (never versioned) ---
const v1Only = buildConfigurationVersionViews(
  [],
  [{ id: 'm1', campaignId: 'c1', agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number', required: true, dataType: 'string', configurationVersionId: null }],
  { agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: null, createdAt: '2026-01-01T00:00:00Z', createdBy: 'ops' },
);
assert('v1-only: synthesizes exactly one synthetic current view', v1Only.length, 1);
assert('v1-only: isSynthetic true', v1Only[0].isSynthetic, true);
assert('v1-only: mapping with null configurationVersionId included', v1Only[0].mappings.length, 1);
assert('v1-only: diff against null prev is empty', diffConfigurationVersions(null, v1Only[0]), []);

// --- v1 -> v2 (real versions), Agent unchanged, Input Mapping added ---
const versions = [
  { id: 'v1', campaignId: 'c1', versionNumber: 1, status: 'superseded', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: null, createdAt: '2026-01-01T00:00:00Z', createdBy: 'ops', changeReason: null, previousVersionId: null },
  { id: 'v2', campaignId: 'c1', versionNumber: 2, status: 'active', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV2, outcomePolicySnapshot: null, createdAt: '2026-02-01T00:00:00Z', createdBy: 'ops', changeReason: 'added EMI amount mapping', previousVersionId: 'v1' },
];
const mappings = [
  { id: 'm1', campaignId: 'c1', agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number', required: true, dataType: 'string', configurationVersionId: 'v1' },
  { id: 'm2', campaignId: 'c1', agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number', required: true, dataType: 'string', configurationVersionId: 'v2' },
  { id: 'm3', campaignId: 'c1', agentInputFieldCode: 'emi_amount', sourceType: 'csv', sourceField: 'emi_col', required: true, dataType: 'decimal', configurationVersionId: 'v2' },
];
const views = buildConfigurationVersionViews(versions, mappings, {
  agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV2, outcomePolicySnapshot: null, createdAt: '2026-02-01T00:00:00Z', createdBy: 'ops',
});
assert('multiple versions: sorted desc by versionNumber', views.map((v) => v.versionNumber), [2, 1]);
assert('v2 is Current (active)', views[0].status, 'active');
assert('v1 is Superseded', views[1].status, 'superseded');
assert('v2 mappings scoped correctly (2 rows)', views[0].mappings.length, 2);
assert('v1 mappings scoped correctly (1 row)', views[1].mappings.length, 1);

const diffV1ToV2 = diffConfigurationVersions(views[1], views[0]);
assert('v1->v2: no Agent change reported (same agent)', diffV1ToV2.some((d) => d.area === 'agent'), false);
assert('v1->v2: Agent Contract changed detected', diffV1ToV2.some((d) => d.area === 'contract'), true);
assert('v1->v2: Input Mapping added detected for emi_amount', diffV1ToV2.some((d) => d.area === 'inputMapping' && d.description.includes('added: emi_amount')), true);
assert('v1->v2: customer_name mapping NOT reported as changed (identical)', diffV1ToV2.some((d) => d.description.includes('customer_name')), false);

// --- Agent change ---
const versionsAgentChange = [
  { id: 'a1', campaignId: 'c2', versionNumber: 1, status: 'superseded', agentId: 'inbound-banking-default', agentName: 'Inbound Banking Assistant', agentContractSnapshot: null, outcomePolicySnapshot: null, createdAt: '2026-01-01T00:00:00Z', createdBy: null, changeReason: null, previousVersionId: null },
  { id: 'a2', campaignId: 'c2', versionNumber: 2, status: 'active', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: null, createdAt: '2026-01-02T00:00:00Z', createdBy: null, changeReason: 'switched to EMI agent', previousVersionId: 'a1' },
];
const agentChangeViews = buildConfigurationVersionViews(versionsAgentChange, [], { agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: null, createdAt: '2026-01-02T00:00:00Z', createdBy: null });
const agentDiff = diffConfigurationVersions(agentChangeViews[1], agentChangeViews[0]);
assert('Agent change detected', agentDiff.find((d) => d.area === 'agent')?.description, 'Agent changed: Inbound Banking Assistant → EMI Reminder');

// --- Outcome Mapping change ---
const policyA = { mappings: [{ agentOutcomeCode: 'opted_out', campaignClassificationCode: 'UNSUCCESSFUL', nextActionType: null }], capturedAt: '2026-01-01T00:00:00Z' };
const policyB = { mappings: [{ agentOutcomeCode: 'opted_out', campaignClassificationCode: 'DECLINED', nextActionType: 'close' }], capturedAt: '2026-01-02T00:00:00Z' };
const outcomeVersions = [
  { id: 'o1', campaignId: 'c3', versionNumber: 1, status: 'superseded', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: policyA, createdAt: '2026-01-01T00:00:00Z', createdBy: null, changeReason: null, previousVersionId: null },
  { id: 'o2', campaignId: 'c3', versionNumber: 2, status: 'active', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: policyB, createdAt: '2026-01-02T00:00:00Z', createdBy: null, changeReason: 'reclassified', previousVersionId: 'o1' },
];
const outcomeViews = buildConfigurationVersionViews(outcomeVersions, [], { agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: policyB, createdAt: '2026-01-02T00:00:00Z', createdBy: null });
const outcomeDiff = diffConfigurationVersions(outcomeViews[1], outcomeViews[0]);
assert('Outcome Mapping changed detected', outcomeDiff.some((d) => d.area === 'outcomeMapping' && d.description.includes('UNSUCCESSFUL → DECLINED')), true);
assert('No contract/agent/inputMapping noise on outcome-only change', outcomeDiff.filter((d) => d.area !== 'outcomeMapping').length, 0);

// --- Fully identical consecutive versions -> empty diff (unchanged data not reported as changed) ---
const identicalVersions = [
  { id: 'i1', campaignId: 'c4', versionNumber: 1, status: 'superseded', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: policyA, createdAt: '2026-01-01T00:00:00Z', createdBy: null, changeReason: null, previousVersionId: null },
  { id: 'i2', campaignId: 'c4', versionNumber: 2, status: 'active', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: policyA, createdAt: '2026-01-02T00:00:00Z', createdBy: null, changeReason: 'outcome-policy-only resave, no actual change', previousVersionId: 'i1' },
];
const identicalMappings = [
  { id: 'im1', campaignId: 'c4', agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number', required: true, dataType: 'string', configurationVersionId: 'i1' },
  { id: 'im2', campaignId: 'c4', agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number', required: true, dataType: 'string', configurationVersionId: 'i2' },
];
const identicalViews = buildConfigurationVersionViews(identicalVersions, identicalMappings, { agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: contractV1, outcomePolicySnapshot: policyA, createdAt: '2026-01-02T00:00:00Z', createdBy: null });
assert('identical consecutive versions -> empty diff', diffConfigurationVersions(identicalViews[1], identicalViews[0]), []);

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
