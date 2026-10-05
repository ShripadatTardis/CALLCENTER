// Session 15.2 (Part A) — deterministic verification of the stale
// cross-version Input Mapping correctness fix, against the REAL
// compiled src/lib/campaignConfigurationDiff.ts (via esbuild, not a
// reimplementation). Covers the brief's required invariant list:
// 1. current configuration loads current-version mappings;
// 2. superseded mappings cannot leak into current Settings;
// 3. historical version display uses its own mappings;
// 4. version transition does not rewrite historical mappings.
// (5. execution/version provenance is covered separately by
// campaign-configuration-versioning-verify.mjs's governing-config
// resolver tests — unaffected by this fix, not duplicated here.)

import { selectCurrentVersionMappings, buildConfigurationVersionViews } from '../tmp/campaignConfigurationDiff.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// The exact defect shape: a campaign with 2 configuration versions where
// the SAME agent input field (emi_amount) was mapped to a DIFFERENT
// source field in each version, plus a field only present in v2. This is
// campaign.mappings as the API actually returns it — the full,
// unfiltered, cross-version row history (every row ever inserted across
// every version), never pre-filtered to "current" by the backend.
const crossVersionMappings = [
  { id: 'm1', campaignId: 'c1', agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number', required: true, dataType: 'string', configurationVersionId: 'v1-id' },
  { id: 'm2', campaignId: 'c1', agentInputFieldCode: 'emi_amount', sourceType: 'csv', sourceField: 'old_amount_column', required: true, dataType: 'decimal', configurationVersionId: 'v1-id' },
  { id: 'm3', campaignId: 'c1', agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number', required: true, dataType: 'string', configurationVersionId: 'v2-id' },
  { id: 'm4', campaignId: 'c1', agentInputFieldCode: 'emi_amount', sourceType: 'csv', sourceField: 'new_amount_column', required: true, dataType: 'decimal', configurationVersionId: 'v2-id' },
  { id: 'm5', campaignId: 'c1', agentInputFieldCode: 'due_date', sourceType: 'csv', sourceField: 'due_date_column', required: false, dataType: 'date', configurationVersionId: 'v2-id' },
];

// 1 + 2. Selecting the CURRENT (active) version's mappings returns ONLY
// v2's own rows — the superseded v1 row for emi_amount (old_amount_column)
// must not leak in, and the field present only in v2 is included.
{
  const current = selectCurrentVersionMappings(crossVersionMappings, 'v2-id');
  const byField = Object.fromEntries(current.map((m) => [m.agentInputFieldCode, m.sourceField]));
  assert('current-version selection: exactly 3 rows (no cross-version duplicates)', current.length, 3);
  assert('current-version selection: emi_amount resolves to v2 value, not stale v1 value', byField.emi_amount, 'new_amount_column');
  assert('current-version selection: due_date (v2-only field) present', byField.due_date, 'due_date_column');
  assert('current-version selection: no row from v1 leaks in', current.some((m) => m.configurationVersionId === 'v1-id'), false);
}

// 3 + 4. Selecting a HISTORICAL (superseded) version's mappings returns
// ONLY that version's own rows, unaffected by v2 having since been
// created — the superseded version's data is not rewritten and does not
// pick up the newer version's values.
{
  const historical = selectCurrentVersionMappings(crossVersionMappings, 'v1-id');
  const byField = Object.fromEntries(historical.map((m) => [m.agentInputFieldCode, m.sourceField]));
  assert('historical-version selection: exactly 2 rows (v1 never had due_date)', historical.length, 2);
  assert('historical-version selection: emi_amount keeps its OWN (old) value, not v2\'s', byField.emi_amount, 'old_amount_column');
  assert('historical-version selection: due_date (v2-only field) absent from v1\'s view', byField.due_date, undefined);
}

// Never-versioned draft/legacy campaign: configurationVersionId is null
// on every row, and the "current version id" for a draft is also null
// (campaign.mappings has no active configuration_versions row yet) —
// the same null-to-null match the dialog's expectedCurrentVersionId
// prop produces for a draft campaign.
{
  const draftMappings = [
    { id: 'd1', campaignId: 'c2', agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number', required: true, dataType: 'string', configurationVersionId: null },
  ];
  const current = selectCurrentVersionMappings(draftMappings, null);
  assert('draft/never-versioned campaign: null currentVersionId selects the null-tagged rows', current.length, 1);
}

// Cross-check against buildConfigurationVersionViews (already-trusted,
// already-tested Configuration History path) — confirms both consumers
// of campaign.mappings now agree on which rows belong to which version,
// closing the exact inconsistency that caused the defect (History always
// filtered correctly; Settings previously did not filter at all).
{
  const versions = [
    { id: 'v1-id', campaignId: 'c1', versionNumber: 1, status: 'superseded', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: null, outcomePolicySnapshot: null, createdAt: '2026-01-01T00:00:00Z', createdBy: 'actor-1', changeReason: null, previousVersionId: null },
    { id: 'v2-id', campaignId: 'c1', versionNumber: 2, status: 'active', agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: null, outcomePolicySnapshot: null, createdAt: '2026-02-01T00:00:00Z', createdBy: 'actor-1', changeReason: 'Updated EMI amount source', previousVersionId: 'v1-id' },
  ];
  const views = buildConfigurationVersionViews(versions, crossVersionMappings, {
    agentId: 'emi-reminder-agent', agentName: 'EMI Reminder', agentContractSnapshot: null, outcomePolicySnapshot: null, createdAt: '2026-02-01T00:00:00Z', createdBy: 'actor-1',
  });
  const v2View = views.find((v) => v.id === 'v2-id');
  const v1View = views.find((v) => v.id === 'v1-id');
  const v2Mapping = selectCurrentVersionMappings(crossVersionMappings, 'v2-id');
  const v1Mapping = selectCurrentVersionMappings(crossVersionMappings, 'v1-id');
  assert('buildConfigurationVersionViews v2 mappings match selectCurrentVersionMappings(v2)', v2View.mappings, v2Mapping);
  assert('buildConfigurationVersionViews v1 mappings match selectCurrentVersionMappings(v1)', v1View.mappings, v1Mapping);
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
