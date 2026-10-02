// Session 12.4.1 — deterministic verification of
// validateMappingSourceUniqueness AND the pre-existing validateInputMapping,
// against the REAL compiled src/server/campaigns/inputMapping.ts (via
// esbuild, not a reimplementation).

import { validateInputMapping, validateMappingSourceUniqueness } from '../tmp/inputMapping.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// 1. Duplicate CSV source rejected.
{
  const mappings = [
    { agentInputFieldCode: 'customer_name', sourceType: 'csv', sourceField: 'customerReference' },
    { agentInputFieldCode: 'emi_amount', sourceType: 'csv', sourceField: 'customerReference' },
  ];
  const result = validateMappingSourceUniqueness(mappings);
  assert('duplicate CSV source rejected', result, { valid: false, duplicateSourceKeys: ['csv:customerReference'] });
}

// 2. Duplicate Customer 360 source rejected.
{
  const mappings = [
    { agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number' },
    { agentInputFieldCode: 'emi_amount', sourceType: 'customer360', sourceField: 'phone_number' },
  ];
  const result = validateMappingSourceUniqueness(mappings);
  assert('duplicate Customer360 source rejected', result, { valid: false, duplicateSourceKeys: ['customer360:phone_number'] });
}

// 3. Different CSV columns accepted.
{
  const mappings = [
    { agentInputFieldCode: 'customer_name', sourceType: 'csv', sourceField: 'nameCol' },
    { agentInputFieldCode: 'emi_amount', sourceType: 'csv', sourceField: 'amountCol' },
  ];
  assert('different CSV columns accepted', validateMappingSourceUniqueness(mappings), { valid: true, duplicateSourceKeys: [] });
}

// 4. Different Customer360 fields accepted.
{
  const mappings = [
    { agentInputFieldCode: 'customer_name', sourceType: 'customer360', sourceField: 'phone_number' },
    { agentInputFieldCode: 'loan_reference_last4', sourceType: 'customer360', sourceField: 'customer_id' },
  ];
  assert('different Customer360 fields accepted', validateMappingSourceUniqueness(mappings), { valid: true, duplicateSourceKeys: [] });
}

// 5. Same apparent field/label across different source types does not collide (csv:phone vs customer360:phone).
{
  const mappings = [
    { agentInputFieldCode: 'customer_name', sourceType: 'csv', sourceField: 'phone' },
    { agentInputFieldCode: 'loan_type', sourceType: 'customer360', sourceField: 'phone' },
  ];
  assert('same label, different source type — no collision', validateMappingSourceUniqueness(mappings), { valid: true, duplicateSourceKeys: [] });
}

// 6. Removing/changing a mapping releases the source for reuse.
{
  const before = [
    { agentInputFieldCode: 'customer_name', sourceType: 'csv', sourceField: 'customerReference' },
    { agentInputFieldCode: 'emi_amount', sourceType: 'csv', sourceField: 'customerReference' },
  ];
  assert('before change: duplicate detected', validateMappingSourceUniqueness(before).valid, false);
  const after = [
    { agentInputFieldCode: 'customer_name', sourceType: 'csv', sourceField: 'customerReference' },
    { agentInputFieldCode: 'emi_amount', sourceType: 'csv', sourceField: 'differentColumn' }, // changed
  ];
  assert('after change: source released, no duplicate', validateMappingSourceUniqueness(after), { valid: true, duplicateSourceKeys: [] });
}

// 7. Multiple simultaneous duplicate groups are all reported.
{
  const mappings = [
    { agentInputFieldCode: 'a', sourceType: 'csv', sourceField: 'col1' },
    { agentInputFieldCode: 'b', sourceType: 'csv', sourceField: 'col1' },
    { agentInputFieldCode: 'c', sourceType: 'customer360', sourceField: 'phone_number' },
    { agentInputFieldCode: 'd', sourceType: 'customer360', sourceField: 'phone_number' },
  ];
  const result = validateMappingSourceUniqueness(mappings);
  assert('multiple duplicate groups all reported', result, { valid: false, duplicateSourceKeys: ['csv:col1', 'customer360:phone_number'] });
}

// 8. Existing required-field validation (validateInputMapping) remains intact and unaffected by this change.
{
  const contract = {
    agentId: 'emi-reminder-agent',
    expectedInputFields: [
      { fieldCode: 'customer_name', required: true },
      { fieldCode: 'emi_amount', required: true },
      { fieldCode: 'loan_type', required: false },
    ],
  };
  const mappings = [{ agentInputFieldCode: 'customer_name', sourceType: 'csv', sourceField: 'nameCol', required: true }];
  const result = validateInputMapping(contract, mappings);
  assert('existing required-field validation intact', result, { valid: false, missingRequiredFieldCodes: ['emi_amount'] });
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) process.exit(1);
