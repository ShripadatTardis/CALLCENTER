// Session 13.3 — deterministic verification of the shared, agent-agnostic
// contract-input helpers, against the REAL compiled
// src/lib/agentContractInputs.ts (via esbuild, not a reimplementation).
// Covers §21's required list: dynamic required/optional string,
// decimal/integer/date coercion, empty required value, unknown field
// type behavior, zero-input agent, undeclared-value exclusion, payload
// construction, and null/partial contract.

import {
  validateAgentContractInputs,
  buildDeclaredAgentInputs,
  coerceInputValue,
  isFieldSatisfied,
} from '../tmp/agentContractInputs.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// Real, live-confirmed EMI Reminder contract shape (src/types/api/agents.ts header comment).
const emiContract = {
  agentId: 'emi-reminder-agent',
  agentName: 'EMI Reminder',
  expectedInputFields: [
    { fieldCode: 'customer_name', displayName: 'Customer Name', dataType: 'string', required: true, description: 'Name the agent greets.' },
    { fieldCode: 'emi_amount', displayName: 'EMI Amount', dataType: 'decimal', required: true },
    { fieldCode: 'emi_due_date', displayName: 'EMI Due Date', dataType: 'date', required: true, format: 'YYYY-MM-DD' },
    { fieldCode: 'loan_type', displayName: 'Loan Type', dataType: 'string', required: false },
    { fieldCode: 'instalments_remaining', displayName: 'Instalments Remaining', dataType: 'integer', required: false },
  ],
  expectedOutcomes: [],
  outputFields: [],
  contractSource: 'partner_api',
  contractCompleteness: 'complete',
};

const zeroInputContract = {
  agentId: 'inbound-banking-default',
  agentName: 'Inbound Banking Assistant',
  expectedInputFields: [],
  expectedOutcomes: [],
  outputFields: [],
  contractSource: 'partner_api',
  contractCompleteness: 'complete',
};

// --- coercion: decimal/integer/date/string, unknown type falls through to raw string ---
assert('coerce decimal', coerceInputValue({ dataType: 'decimal' }, '1234.50'), 1234.5);
assert('coerce decimal non-numeric falls back to raw', coerceInputValue({ dataType: 'decimal' }, 'abc'), 'abc');
assert('coerce integer', coerceInputValue({ dataType: 'integer' }, '7'), 7);
assert('coerce integer rejects non-integer (falls back to raw)', coerceInputValue({ dataType: 'integer' }, '7.5'), '7.5');
assert('coerce date stays raw string (YYYY-MM-DD from <input type=date>)', coerceInputValue({ dataType: 'date' }, '2026-10-05'), '2026-10-05');
assert('coerce string stays raw', coerceInputValue({ dataType: 'string' }, 'hello'), 'hello');
assert('coerce unknown/unsupported data_type falls through to raw string', coerceInputValue({ dataType: 'some_future_type' }, 'x'), 'x');
assert('coerce boolean', coerceInputValue({ dataType: 'boolean' }, 'true'), true);
assert('coerce empty string stays empty (not NaN/0)', coerceInputValue({ dataType: 'decimal' }, ''), '');

// --- isFieldSatisfied ---
assert('optional field always satisfied when empty', isFieldSatisfied({ required: false }, undefined), true);
assert('required field empty string -> not satisfied', isFieldSatisfied({ required: true }, ''), false);
assert('required field whitespace-only -> not satisfied', isFieldSatisfied({ required: true }, '   '), false);
assert('required field with real value -> satisfied', isFieldSatisfied({ required: true }, 'Preethy'), true);
assert('required numeric 0 -> satisfied (0 is a real value, not empty)', isFieldSatisfied({ required: true }, 0), true);

// --- validateAgentContractInputs ---
assert(
  'all three required EMI fields missing -> invalid, all three listed',
  validateAgentContractInputs(emiContract, {}),
  { isValid: false, missingRequiredFieldCodes: ['customer_name', 'emi_amount', 'emi_due_date'] },
);
assert(
  'required fields filled, optional empty -> valid',
  validateAgentContractInputs(emiContract, { customer_name: 'Preethy', emi_amount: 750, emi_due_date: '2026-10-02' }).isValid,
  true,
);
assert('null contract -> trivially valid (no fields to satisfy)', validateAgentContractInputs(null, {}), { isValid: true, missingRequiredFieldCodes: [] });
assert('zero-input contract -> trivially valid', validateAgentContractInputs(zeroInputContract, {}), { isValid: true, missingRequiredFieldCodes: [] });

// --- buildDeclaredAgentInputs ---
assert(
  'only declared, non-empty fields included; undeclared value excluded',
  buildDeclaredAgentInputs(emiContract, { customer_name: 'Preethy', emi_amount: 750, some_undeclared_field: 'should not appear', loan_type: '' }),
  { customer_name: 'Preethy', emi_amount: 750 },
);
assert('zero-input contract -> undefined (never {})', buildDeclaredAgentInputs(zeroInputContract, { anything: 'x' }), undefined);
assert('null contract -> undefined', buildDeclaredAgentInputs(null, { anything: 'x' }), undefined);
assert('no values resolved for any declared field -> undefined (never {})', buildDeclaredAgentInputs(emiContract, {}), undefined);
assert(
  'all declared optional/required fields populated -> full payload, no key loss',
  buildDeclaredAgentInputs(emiContract, {
    customer_name: 'Preethy',
    emi_amount: 750,
    emi_due_date: '2026-10-02',
    loan_type: 'vehicle loan',
    instalments_remaining: 6,
  }),
  { customer_name: 'Preethy', emi_amount: 750, emi_due_date: '2026-10-02', loan_type: 'vehicle loan', instalments_remaining: 6 },
);

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
