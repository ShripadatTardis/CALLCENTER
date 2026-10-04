import { deriveLegacyRole, LEGACY_ROLE_PRIORITY } from '../tmp/legacyRole.mjs';
import { evaluatePermission } from '../tmp/authGate.mjs';
import { ACTION_PERMISSIONS, GET_ACTIONS, ADMIN_ACTIONS } from '../tmp/campaignsActionPermissions.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function activeUser(roles, permissions) {
  return { id: 'u1', email: 'u@example.com', displayName: 'U', status: 'active', roles, permissions };
}

// --- evaluatePermission: the real server-side gate's pure decision logic ---

assert('unauthenticated (null user) -> unauthenticated', evaluatePermission(null, 'dashboard.view'), { outcome: 'unauthenticated' });

assert(
  'permitted user with the exact permission -> allowed',
  evaluatePermission(activeUser(['operator'], ['dashboard.view', 'calls.initiate']), 'calls.initiate'),
  { outcome: 'allowed' },
);

assert(
  'authenticated user without the permission -> forbidden (never a 401)',
  evaluatePermission(activeUser(['analyst'], ['dashboard.view']), 'campaigns.create'),
  { outcome: 'forbidden' },
);

assert(
  'inactive user -> unauthenticated even if permissions array still lists it',
  evaluatePermission({ id: 'u2', email: 'x@example.com', displayName: null, status: 'inactive', roles: ['administrator'], permissions: ['dashboard.view'] }, 'dashboard.view'),
  { outcome: 'unauthenticated' },
);

assert(
  'unknown/unrecognized permission key fails closed -> forbidden, never allowed',
  evaluatePermission(activeUser(['administrator'], ['dashboard.view', 'users.manage']), 'not_a_real_permission.key'),
  { outcome: 'forbidden' },
);

assert(
  'empty effective-permission set -> forbidden for any key',
  evaluatePermission(activeUser([], []), 'dashboard.view'),
  { outcome: 'forbidden' },
);

assert(
  'multiple-role union: permission granted via a second role is honored',
  evaluatePermission(activeUser(['analyst', 'operator'], ['dashboard.view', 'analytics.view', 'calls.initiate']), 'calls.initiate'),
  { outcome: 'allowed' },
);

// --- deriveLegacyRole: compatibility-only, highest-priority role wins ---

assert('deriveLegacyRole: administrator beats every other role', deriveLegacyRole(['read_only', 'administrator', 'operator']), 'administrator');
assert('deriveLegacyRole: supervisor beats operator/analyst/qa_reviewer/read_only', deriveLegacyRole(['read_only', 'supervisor', 'analyst']), 'supervisor');
assert('deriveLegacyRole: single role returned as-is', deriveLegacyRole(['qa_reviewer']), 'qa_reviewer');
assert('deriveLegacyRole: no roles -> unauthenticated, never fabricated', deriveLegacyRole([]), 'unauthenticated');
assert('LEGACY_ROLE_PRIORITY has exactly the 6 seeded role codes, no more/fewer', LEGACY_ROLE_PRIORITY, ['administrator', 'supervisor', 'operator', 'analyst', 'qa_reviewer', 'read_only']);

// --- Campaign route permission map: every mutating action is covered,
// every GET/admin action is deliberately absent (different gate) ---

const EXPECTED_MUTATING_ACTIONS = [
  'create', 'importTargets', 'setInputMappings', 'start', 'pause', 'resume', 'stop',
  'retryTarget', 'scheduleFollowup', 'createConfigurationVersion', 'updateDraftConfiguration',
  'skipTarget', 'holdTarget', 'releaseHold', 'amendTarget', 'addTargets',
];
assert(
  'ACTION_PERMISSIONS covers exactly the known mutating campaign actions',
  Object.keys(ACTION_PERMISSIONS).sort(),
  [...EXPECTED_MUTATING_ACTIONS].sort(),
);

const overlapWithGet = Object.keys(ACTION_PERMISSIONS).filter((a) => GET_ACTIONS.has(a));
assert('no mutating action is also a GET action (would bypass the permission gate)', overlapWithGet, []);

const overlapWithAdmin = Object.keys(ACTION_PERMISSIONS).filter((a) => ADMIN_ACTIONS.has(a));
assert('no mutating action overlaps the separately-gated admin/cron actions', overlapWithAdmin, []);

assert('start/resume both require campaigns.start/resume (distinct, not conflated)', [ACTION_PERMISSIONS.start, ACTION_PERMISSIONS.resume], ['campaigns.start', 'campaigns.resume']);
assert('every campaigns.targets.manage action is a real target-mutation action', ['retryTarget', 'skipTarget', 'holdTarget', 'releaseHold', 'amendTarget', 'addTargets'].every((a) => ACTION_PERMISSIONS[a] === 'campaigns.targets.manage'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
