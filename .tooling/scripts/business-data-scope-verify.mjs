import { isAgentIdInScope, toAgentAccess, toCustomerAccess } from '../tmp/authGate.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function user(dataScope) {
  return { id: 'u1', email: 'u@example.com', displayName: 'U', status: 'active', roles: ['operator'], permissions: [], dataScope };
}

// --- isAgentIdInScope: the pure decision logic enforced on every
// individual-resource route (Call session detail, Campaign get/mutate,
// Chat session detail, Initiate Call's submitted agent_id). ---

assert(
  'allCategories=true -> every agent id is in scope, including null/undefined',
  [isAgentIdInScope({ role: 'r', allCategories: true, authorizedAgentIds: [] }, 'any-agent'), isAgentIdInScope({ role: 'r', allCategories: true, authorizedAgentIds: [] }, null)],
  [true, true],
);

assert(
  "authorizedAgentIds === 'all' -> every agent id is in scope",
  isAgentIdInScope({ role: 'r', allCategories: false, authorizedAgentIds: 'all' }, 'any-agent'),
  true,
);

assert(
  'restricted list: agent present -> in scope',
  isAgentIdInScope({ role: 'r', allCategories: false, authorizedAgentIds: ['emi-reminder-agent'] }, 'emi-reminder-agent'),
  true,
);

assert(
  'restricted list: agent absent -> NOT in scope (the direct-ID-bypass case this session closes)',
  isAgentIdInScope({ role: 'r', allCategories: false, authorizedAgentIds: ['emi-reminder-agent'] }, 'forex-transaction-agent'),
  false,
);

assert(
  'restricted empty list + null/undefined agentId -> fails closed, never in scope',
  [isAgentIdInScope({ role: 'r', allCategories: false, authorizedAgentIds: [] }, null), isAgentIdInScope({ role: 'r', allCategories: false, authorizedAgentIds: [] }, undefined)],
  [false, false],
);

// --- toAgentAccess / toCustomerAccess: the two independent scope views
// derived from one resolved dataScope. Agent Scope must never be
// derived FROM Customer Category Scope (and vice versa) — this proves
// they can genuinely differ. ---

const mixedUser = user({
  allAgents: false,
  agentIds: ['emi-reminder-agent'],
  allCustomerCategories: true,
  customerCategoryIds: [],
  customerAllAgents: true,
  customerAgentIds: [],
});

assert(
  'toAgentAccess reflects Agent Scope only (restricted here)',
  toAgentAccess(mixedUser),
  { role: 'u1', allCategories: false, authorizedAgentIds: ['emi-reminder-agent'] },
);

assert(
  'toCustomerAccess reflects Customer Category Scope only (unrestricted here) — genuinely independent of the restricted Agent Scope above',
  toCustomerAccess(mixedUser),
  { role: 'u1', allCategories: true, authorizedAgentIds: 'all' },
);

const fullyOpenUser = user({
  allAgents: true, agentIds: [], allCustomerCategories: true, customerCategoryIds: [], customerAllAgents: true, customerAgentIds: [],
});
assert('administrator-like dataScope -> both views unrestricted', [toAgentAccess(fullyOpenUser).authorizedAgentIds, toCustomerAccess(fullyOpenUser).authorizedAgentIds], ['all', 'all']);

const fullyRestrictedUser = user({
  allAgents: false, agentIds: [], allCustomerCategories: false, customerCategoryIds: [], customerAllAgents: false, customerAgentIds: [],
});
assert(
  'a role with explicit empty scope (not all, zero items) fails closed on both dimensions',
  [isAgentIdInScope(toAgentAccess(fullyRestrictedUser), 'any-agent'), isAgentIdInScope(toCustomerAccess(fullyRestrictedUser), 'any-agent')],
  [false, false],
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
