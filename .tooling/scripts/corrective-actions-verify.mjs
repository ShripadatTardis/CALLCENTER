// Session 16.5 — Corrective Action Management. Deterministic coverage
// of the REAL compiled pure logic in api/admin.ts (via esbuild, same
// discipline as action-items-verify.mjs). The CA lifecycle/ownership/
// linking/bulk-verification rules themselves live in the Postgres RPCs
// (public.call_center_corrective_action*), which cannot be exercised
// without a live database — those are documented instead in
// docs/SESSION_16_5_CORRECTIVE_ACTION_MANAGEMENT.md's SQL-level
// verification section (status NOT VERIFIED pending migration
// application — see that doc). This file covers exactly the pure,
// synchronous JS this session added: HTTP-status mapping for every RPC
// error code, and the Business Data Scope arg derivation.

import { mapCorrectiveActionError, toCorrectiveActionScopeArgs } from '../tmp/adminRoute.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// --- mapCorrectiveActionError: every raise-exception code the
// migration's RPCs can produce must map to the right HTTP status. ---

assert('corrective_action_not_found -> 404', mapCorrectiveActionError('corrective_action_not_found'), 404);
assert('corrective_action_group_not_found -> 404', mapCorrectiveActionError('corrective_action_group_not_found'), 404);
assert('not_a_member_of_group -> 404', mapCorrectiveActionError('not_a_member_of_group'), 404);
assert('assignment_not_permitted -> 403 (ownership gate)', mapCorrectiveActionError('assignment_not_permitted'), 403);
assert('ownership_required -> 403', mapCorrectiveActionError('ownership_required'), 403);
assert('assignee_inactive_or_not_found -> 422', mapCorrectiveActionError('assignee_inactive_or_not_found'), 422);
assert('assignee_out_of_scope -> 422', mapCorrectiveActionError('assignee_out_of_scope'), 422);
assert('agent_out_of_scope -> 422 (brief §15 — scope isolation at CA creation)', mapCorrectiveActionError('agent_out_of_scope'), 422);
assert('invalid_status_transition -> 422 (centrally-enforced lifecycle)', mapCorrectiveActionError('invalid_status_transition'), 422);
assert('invalid_role -> 422', mapCorrectiveActionError('invalid_role'), 422);
assert('invalid_verification_result -> 422', mapCorrectiveActionError('invalid_verification_result'), 422);
assert('title_and_description_required -> 422 (manual creation with no QA reference still validates minimally)', mapCorrectiveActionError('title_and_description_required'), 422);
assert('title_required -> 422 (group creation)', mapCorrectiveActionError('title_required'), 422);
assert('cancellation_reason_required -> 422 (brief §5 — cancellation always requires a reason)', mapCorrectiveActionError('cancellation_reason_required'), 422);
assert('administrative_closure_reason_required -> 422', mapCorrectiveActionError('administrative_closure_reason_required'), 422);
assert('resolution_summary_required -> 422', mapCorrectiveActionError('resolution_summary_required'), 422);
assert('not_eligible_for_verification -> 422', mapCorrectiveActionError('not_eligible_for_verification'), 422);
assert('cross_tenant_link_rejected -> 422 (brief §9 — cross-tenant linking prohibited)', mapCorrectiveActionError('cross_tenant_link_rejected'), 422);
assert('already_in_another_group -> 422 (brief §4.2 — one active group per CA)', mapCorrectiveActionError('already_in_another_group'), 422);
assert('an unrecognized message falls back to 500, never guessed as something more specific', mapCorrectiveActionError('something_unexpected'), 500);
assert(
  'a real Postgres error wrapper message is matched by substring, not exact equality',
  mapCorrectiveActionError('corrective_action_not_found: 11111111-1111-1111-1111-111111111111'),
  404,
);

// --- toCorrectiveActionScopeArgs: identical Business Data Scope
// derivation as Session 15's toActionScopeArgs — allAgents true when
// the caller's dataScope grants either dimension unrestricted. ---

assert(
  'allCategories true -> allAgents true, authorizedAgentIds empty',
  toCorrectiveActionScopeArgs({ role: 'administrator', allCategories: true, authorizedAgentIds: ['a1'] }),
  { allAgents: true, authorizedAgentIds: [] },
);
assert(
  "authorizedAgentIds === 'all' -> allAgents true",
  toCorrectiveActionScopeArgs({ role: 'supervisor', allCategories: false, authorizedAgentIds: 'all' }),
  { allAgents: true, authorizedAgentIds: [] },
);
assert(
  'a restricted scope passes its real agent id list through unchanged',
  toCorrectiveActionScopeArgs({ role: 'operator', allCategories: false, authorizedAgentIds: ['agent-1', 'agent-2'] }),
  { allAgents: false, authorizedAgentIds: ['agent-1', 'agent-2'] },
);
assert(
  'an empty restricted scope -> allAgents false, no ids (sees only agent-less CAs)',
  toCorrectiveActionScopeArgs({ role: 'read_only', allCategories: false, authorizedAgentIds: [] }),
  { allAgents: false, authorizedAgentIds: [] },
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
