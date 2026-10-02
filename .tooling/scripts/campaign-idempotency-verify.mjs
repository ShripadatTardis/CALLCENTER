// Session 12.4 — deterministic verification of idempotent Campaign
// triggering and pre-dial local validation, against the REAL compiled
// src/server/campaigns/campaignRunner.ts (via esbuild, not a
// reimplementation). Uses an in-memory fake CampaignRepository and a
// capturing fake CallBackendAdapter — no real HTTP call, no real
// database, no real telephone call.

import { runCampaignBatch } from '../tmp/campaignRunner.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// Same shape as EMI Reminder's real, live-confirmed contract (3 required + 5 optional fields).
const emiContract = {
  agentId: 'emi-reminder-agent',
  agentName: 'EMI Reminder',
  expectedInputFields: [
    { fieldCode: 'customer_name', displayName: 'Customer Name', dataType: 'string', required: true },
    { fieldCode: 'emi_amount', displayName: 'EMI Amount', dataType: 'decimal', required: true },
    { fieldCode: 'emi_due_date', displayName: 'EMI Due Date', dataType: 'date', required: true, format: 'YYYY-MM-DD' },
    { fieldCode: 'loan_type', displayName: 'Loan Type', dataType: 'string', required: false },
  ],
  expectedOutcomes: [],
  outputFields: [],
  contractSource: 'partner_api',
  contractCompleteness: 'complete',
};

function makeFakeRepo({ targets, mappings, contract }) {
  const executions = [];
  let nextExecId = 1;
  return {
    async selectRunnableTargets() {
      return targets;
    },
    async getCampaign() {
      return { agentContractSnapshot: contract, mappings };
    },
    async createExecution(targetId, now, requestPayloadSnapshot) {
      const exec = { id: `exec-${nextExecId++}`, campaignTargetId: targetId, status: 'triggering', requestPayloadSnapshot };
      executions.push(exec);
      return exec;
    },
    async markExecutionTriggered(executionId, callSid) {
      const e = executions.find((x) => x.id === executionId);
      e.status = 'triggered';
      e.callSid = callSid;
    },
    async markExecutionFailed(executionId, errorDetail) {
      const e = executions.find((x) => x.id === executionId);
      e.status = 'failed';
      e.errorDetail = errorDetail;
    },
    executions,
  };
}

function makeFakeBackend(behavior) {
  const calls = [];
  return {
    calls,
    async triggerCall(payload, idempotencyKey) {
      calls.push({ payload, idempotencyKey });
      return behavior(payload, idempotencyKey);
    },
  };
}

const baseTarget = {
  id: 't1',
  campaignId: 'c1',
  campaignAgentId: 'emi-reminder-agent',
  contactRawValue: '+919930647652',
  sourceCustomerRef: null,
  sourceAttributes: { emi_amount_raw: '5200', due_date_raw: '2026-10-15', customer_name_raw: 'Shripad' },
};

const mappings = [
  { agentInputFieldCode: 'customer_name', sourceType: 'csv', sourceField: 'customer_name_raw', required: true, dataType: 'string' },
  { agentInputFieldCode: 'emi_amount', sourceType: 'csv', sourceField: 'emi_amount_raw', required: true, dataType: 'decimal' },
  { agentInputFieldCode: 'emi_due_date', sourceType: 'csv', sourceField: 'due_date_raw', required: true, dataType: 'date' },
];

// 1. Fully mapped target -> real trigger call with agent_inputs built from mappings, never hardcoded.
{
  const repo = makeFakeRepo({ targets: [baseTarget], mappings, contract: emiContract });
  const backend = makeFakeBackend(() => ({ success: true, call_sid: 'CA-fixture-1', status: 'queued' }));
  const result = await runCampaignBatch(repo, backend, 5);
  assert('fully mapped: processed/triggered/failed', result, { processed: 1, triggered: 1, failed: 0 });
  assert('fully mapped: agent_inputs built from mapping, not hardcoded', backend.calls[0].payload.agent_inputs, {
    customer_name: 'Shripad',
    emi_amount: '5200',
    emi_due_date: '2026-10-15',
  });
  assert('fully mapped: to_phone_number/agent_id set from target', {
    to_phone_number: backend.calls[0].payload.to_phone_number,
    agent_id: backend.calls[0].payload.agent_id,
  }, { to_phone_number: '+919930647652', agent_id: 'emi-reminder-agent' });
  assert('fully mapped: idempotency key === execution.id', backend.calls[0].idempotencyKey, repo.executions[0].id);
}

// 2. Missing a required mapping -> NEVER dialled, execution marked failed with a diagnostic reason.
{
  const partialMappings = mappings.filter((m) => m.agentInputFieldCode !== 'emi_due_date'); // drop a required field
  const repo = makeFakeRepo({ targets: [baseTarget], mappings: partialMappings, contract: emiContract });
  const backend = makeFakeBackend(() => ({ success: true, call_sid: 'SHOULD-NOT-BE-CALLED', status: 'queued' }));
  const result = await runCampaignBatch(repo, backend, 5);
  assert('missing required: no dial attempted', backend.calls.length, 0);
  assert('missing required: processed/triggered/failed', result, { processed: 1, triggered: 0, failed: 1 });
  assert('missing required: execution marked failed', repo.executions[0].status, 'failed');
  assert('missing required: diagnostic reason names the missing field', repo.executions[0].errorDetail.includes('emi_due_date'), true);
}

// 3. Undeclared mapping (a mapping for a field the contract doesn't declare) -> never sent to the backend.
{
  const mappingsWithUndeclared = [...mappings, { agentInputFieldCode: 'not_a_real_field', sourceType: 'csv', sourceField: 'customer_name_raw', required: false, dataType: 'string' }];
  const repo = makeFakeRepo({ targets: [baseTarget], mappings: mappingsWithUndeclared, contract: emiContract });
  const backend = makeFakeBackend(() => ({ success: true, call_sid: 'CA-fixture-3', status: 'queued' }));
  await runCampaignBatch(repo, backend, 5);
  assert('undeclared field never sent', 'not_a_real_field' in backend.calls[0].payload.agent_inputs, false);
}

// 4. Agent with zero expected input fields -> agent_inputs omitted entirely (legacy/default-agent behavior preserved).
{
  const inboundContract = { ...emiContract, expectedInputFields: [] };
  const repo = makeFakeRepo({ targets: [{ ...baseTarget, campaignAgentId: 'inbound-banking-default' }], mappings: [], contract: inboundContract });
  const backend = makeFakeBackend(() => ({ success: true, call_sid: 'CA-fixture-4', status: 'queued' }));
  await runCampaignBatch(repo, backend, 5);
  assert('zero expected fields: agent_inputs omitted', 'agent_inputs' in backend.calls[0].payload, false);
}

// 5. No contract at all (null) -> identical legacy shape, agent_inputs never present.
{
  const repo = makeFakeRepo({ targets: [baseTarget], mappings: [], contract: null });
  const backend = makeFakeBackend(() => ({ success: true, call_sid: 'CA-fixture-5', status: 'queued' }));
  await runCampaignBatch(repo, backend, 5);
  assert('null contract: agent_inputs omitted (legacy shape)', 'agent_inputs' in backend.calls[0].payload, false);
}

// 6. Idempotency key stability across a genuinely NEW attempt (a second execution row = a second, different key).
{
  const repo = makeFakeRepo({ targets: [baseTarget, { ...baseTarget, id: 't1-retry' }], mappings, contract: emiContract });
  const backend = makeFakeBackend(() => ({ success: true, call_sid: 'CA-fixture-6', status: 'queued' }));
  await runCampaignBatch(repo, backend, 5);
  const [key1, key2] = backend.calls.map((c) => c.idempotencyKey);
  assert('two distinct execution attempts get two distinct keys', key1 !== key2, true);
}

// 7. A 409 idempotency-conflict response is classified distinctly and never treated as success.
{
  const repo = makeFakeRepo({ targets: [baseTarget], mappings, contract: emiContract });
  const backend = {
    calls: [],
    async triggerCall(payload, idempotencyKey) {
      this.calls.push({ payload, idempotencyKey });
      const err = new Error('simulated 409');
      err.status = 409;
      throw new Error('Trigger Call idempotency conflict: the same Idempotency-Key was reused with a different request body — no call was placed. {"error":"idempotency_key_conflict"}');
    },
  };
  const result = await runCampaignBatch(repo, backend, 5);
  assert('409 conflict: never counted as triggered', result.triggered, 0);
  assert('409 conflict: execution marked failed, not left ambiguous', repo.executions[0].status, 'failed');
  assert('409 conflict: diagnostic reason mentions idempotency, not a generic message', repo.executions[0].errorDetail.includes('idempotency'), true);
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
