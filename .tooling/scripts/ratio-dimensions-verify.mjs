import { computeBreakdownRows, computeTrendPoints, bucketGranularity } from '../tmp/ratioDimensions.mjs';

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

const calls = [
  { fcr: true, intent: 'balance', outcome: 'resolved', duration_seconds: 30, start_time: '2026-09-01T10:00:00Z' },
  { fcr: false, intent: 'balance', outcome: 'escalated', duration_seconds: 60, start_time: '2026-09-01T11:00:00Z' },
  { fcr: true, intent: 'dispute', outcome: 'resolved', duration_seconds: 90, start_time: '2026-09-02T10:00:00Z' },
];

const rows = computeBreakdownRows('fcr', calls, 'intent');
assert(
  'breakdown by intent groups correctly',
  rows.map((r) => ({ label: r.label, numerator: r.numerator, denominator: r.denominator, population: r.population })),
  [
    { label: 'balance', numerator: 1, denominator: 2, population: 2 },
    { label: 'dispute', numerator: 1, denominator: 1, population: 1 },
  ],
);

assert('bucketGranularity 7d -> day', bucketGranularity('7d'), 'day');
assert('bucketGranularity 24h -> hour', bucketGranularity('24h'), 'hour');

const points = computeTrendPoints('escalation_rate', calls, 'day');
assert(
  'trend buckets by day correctly',
  points.map((p) => ({ bucket: p.bucket, numerator: p.numerator, denominator: p.denominator })),
  [
    { bucket: '2026-09-01', numerator: 1, denominator: 2 },
    { bucket: '2026-09-02', numerator: 0, denominator: 1 },
  ],
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
