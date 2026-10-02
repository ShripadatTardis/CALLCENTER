// Session R2 — deterministic ratio math verification, per the prompt's
// explicit validation section. Imports the REAL compiled
// src/server/analytics/ratioMath.ts (via esbuild, see the
// npx esbuild ... command in the session report) — this is not a
// reimplementation, it exercises the actual shipped calculation
// functions against synthetic fixtures. No network/live backend needed.

import { computeFcr, computeEscalationRate, computeAht, computeResolutionRate, computeSuccessfulResolutionTime } from '../tmp/ratioMath.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// FCR: 8/10 = 80%
{
  const calls = Array.from({ length: 10 }, (_, i) => ({ fcr: i < 8 }));
  assert('FCR 8/10', computeFcr(calls), { value: 80, numerator: 8, denominator: 10 });
}

// Escalation: 2/10 = 20%
{
  const calls = [
    ...Array.from({ length: 2 }, () => ({ outcome: 'escalated' })),
    ...Array.from({ length: 8 }, () => ({ outcome: 'resolved' })),
  ];
  assert('Escalation 2/10', computeEscalationRate(calls), { value: 20, numerator: 2, denominator: 10 });
}

// AHT: (30+60+90)/3 = 60s
{
  const calls = [{ duration_seconds: 30 }, { duration_seconds: 60 }, { duration_seconds: 90 }];
  assert('AHT (30+60+90)/3', computeAht(calls), { value: 60, numerator: 180, denominator: 3 });
}

// 0/10 = legitimate 0%
{
  const calls = Array.from({ length: 10 }, () => ({ fcr: false }));
  assert('FCR 0/10 legitimate zero', computeFcr(calls), { value: 0, numerator: 0, denominator: 10 });
}

// 0 eligible = null/no-data
{
  assert('FCR 0 eligible -> null', computeFcr([]), { value: null, numerator: 0, denominator: 0 });
  assert('Escalation 0 eligible -> null (no determinate outcome)', computeEscalationRate([{ outcome: 'active' }, { outcome: '' }]), {
    value: null, numerator: 0, denominator: 0,
  });
  assert('AHT 0 eligible -> null', computeAht([{ duration_seconds: undefined }]), { value: null, numerator: 0, denominator: 0 });
}

// AHT excludes stale durations (>= 4h), matching Session 11.7's Agent Detail fix
{
  const calls = [{ duration_seconds: 30 }, { duration_seconds: 60 }, { duration_seconds: 90 }, { duration_seconds: 999999 }];
  assert('AHT excludes stale duration row', computeAht(calls), { value: 60, numerator: 180, denominator: 3 });
}

// Filtering changes numerator/denominator correctly — a breakdown-style subset
{
  const calls = [
    { fcr: true, intent: 'balance' },
    { fcr: false, intent: 'balance' },
    { fcr: true, intent: 'dispute' },
  ];
  const balanceOnly = calls.filter((c) => c.intent === 'balance');
  assert('Filtering by intent=balance changes denominator to 2', computeFcr(balanceOnly), { value: 50, numerator: 1, denominator: 2 });
  const disputeOnly = calls.filter((c) => c.intent === 'dispute');
  assert('Filtering by intent=dispute changes denominator to 1', computeFcr(disputeOnly), { value: 100, numerator: 1, denominator: 1 });
}

// --- Session R3: Resolution Rate ---

// Resolution Rate: 8 resolved / 10 determinate = 80%
{
  const calls = [
    ...Array.from({ length: 8 }, () => ({ outcome: 'resolved' })),
    ...Array.from({ length: 2 }, () => ({ outcome: 'escalated' })),
  ];
  assert('Resolution Rate 8/10', computeResolutionRate(calls), { value: 80, numerator: 8, denominator: 10 });
}

// Resolution Rate: 0 resolved / 10 determinate = legitimate 0%
{
  const calls = Array.from({ length: 10 }, () => ({ outcome: 'escalated' }));
  assert('Resolution Rate 0/10 legitimate zero', computeResolutionRate(calls), { value: 0, numerator: 0, denominator: 10 });
}

// Resolution Rate: no determinate outcomes -> null/no data
{
  const calls = [{ outcome: 'active' }, { outcome: '' }, { outcome: undefined }];
  assert('Resolution Rate no determinate outcomes -> null', computeResolutionRate(calls), { value: null, numerator: 0, denominator: 0 });
}

// --- Session R3: Successful Resolution Time ---

// resolved valid durations 30, 60, 90 -> 60 seconds
{
  const calls = [
    { outcome: 'resolved', duration_seconds: 30 },
    { outcome: 'resolved', duration_seconds: 60 },
    { outcome: 'resolved', duration_seconds: 90 },
  ];
  assert('Successful Resolution Time (30+60+90)/3', computeSuccessfulResolutionTime(calls), { value: 60, numerator: 180, denominator: 3 });
}

// non-resolved interactions do not affect numerator/denominator
{
  const calls = [
    { outcome: 'resolved', duration_seconds: 30 },
    { outcome: 'resolved', duration_seconds: 60 },
    { outcome: 'resolved', duration_seconds: 90 },
    { outcome: 'escalated', duration_seconds: 99999 }, // would wildly skew the average if incorrectly included
  ];
  assert('Successful Resolution Time excludes non-resolved calls', computeSuccessfulResolutionTime(calls), { value: 60, numerator: 180, denominator: 3 });
}

// stale durations are excluded using the SAME R2 rule
{
  const calls = [
    { outcome: 'resolved', duration_seconds: 30 },
    { outcome: 'resolved', duration_seconds: 60 },
    { outcome: 'resolved', duration_seconds: 90 },
    { outcome: 'resolved', duration_seconds: 999999 }, // stale, must be excluded
  ];
  assert('Successful Resolution Time excludes stale duration', computeSuccessfulResolutionTime(calls), { value: 60, numerator: 180, denominator: 3 });
}

// 0 eligible (no resolved calls at all) -> null
{
  assert('Successful Resolution Time 0 eligible -> null', computeSuccessfulResolutionTime([{ outcome: 'escalated', duration_seconds: 30 }]), {
    value: null, numerator: 0, denominator: 0,
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
