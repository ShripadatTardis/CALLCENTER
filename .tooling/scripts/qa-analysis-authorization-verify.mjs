import { qaReviewViewAuthorized } from '../tmp/adminRoute.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// --- Session 16.2 §16/§21 — evidence drill-down authorization. ---

assert(
  'owner can view their own review regardless of status (in_progress)',
  qaReviewViewAuthorized({ ownerUserId: 'u1', callerUserId: 'u1', status: 'in_progress', callerHasAnalyticsPermission: false }),
  true,
);
assert(
  'owner can view their own review regardless of status (submitted)',
  qaReviewViewAuthorized({ ownerUserId: 'u1', callerUserId: 'u1', status: 'submitted', callerHasAnalyticsPermission: false }),
  true,
);
assert(
  'an analyst (qa.analytics.view) CAN view another reviewer\'s SUBMITTED review — the drill-down this session exists for',
  qaReviewViewAuthorized({ ownerUserId: 'u1', callerUserId: 'u2', status: 'submitted', callerHasAnalyticsPermission: true }),
  true,
);
assert(
  'an analyst CANNOT view another reviewer\'s IN-PROGRESS (private draft) review — submitted-only, never a draft',
  qaReviewViewAuthorized({ ownerUserId: 'u1', callerUserId: 'u2', status: 'in_progress', callerHasAnalyticsPermission: true }),
  false,
);
assert(
  'a non-owner WITHOUT qa.analytics.view cannot view a submitted review that isn\'t theirs (mere qa.review is not enough — §21)',
  qaReviewViewAuthorized({ ownerUserId: 'u1', callerUserId: 'u2', status: 'submitted', callerHasAnalyticsPermission: false }),
  false,
);
assert(
  'a non-owner without qa.analytics.view cannot view an in-progress review either (double-denied)',
  qaReviewViewAuthorized({ ownerUserId: 'u1', callerUserId: 'u2', status: 'in_progress', callerHasAnalyticsPermission: false }),
  false,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
