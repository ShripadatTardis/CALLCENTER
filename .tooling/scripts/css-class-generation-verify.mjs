// Session 7.10.1 — automates the exact lesson this session learned the
// hard way: a syntactically-plausible Tailwind arbitrary-value class
// (e.g. `text-[length:var(--type-pageTitle-size)]`) can be completely
// inert if nothing in the source tree contains that literal string —
// Tailwind's JIT scanner does static text matching, it does not
// execute src/lib/typography.ts. A first implementation attempt built
// these classes via a shared helper function that interpolated the
// role name at runtime; every class silently produced zero CSS, and
// every typography role rendered with no explicit size at all. This
// script runs a real production build and asserts that the CSS rules
// this session's new tokens depend on actually exist in the output —
// not just that the config/schema validate, which the round-trip and
// multi-customer scripts already cover, but which cannot by itself
// prove Tailwind emitted real styles for any given class string.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const distDir = join(repoRoot, 'dist');

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS ${label}`);
    passed++;
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

console.log('Running a real production build to verify generated CSS (this takes ~15s)...');
execFileSync('npm', ['run', 'build'], { cwd: repoRoot, encoding: 'utf8', shell: true });

const cssFile = readdirSync(join(distDir, 'assets')).find((f) => f.endsWith('.css'));
if (!cssFile) {
  console.error('FAIL: no CSS file found in dist/assets after build.');
  process.exit(1);
}
const css = readFileSync(join(distDir, 'assets', cssFile), 'utf8');

// --- Typography roles: every role must have a REAL font-size rule ----
const TYPOGRAPHY_ROLES = [
  'pageTitle', 'pageDescription', 'sectionTitle', 'subsectionTitle', 'cardTitle',
  'body', 'bodySecondary', 'metadata', 'label', 'metricValue', 'metricLabel',
  'tableHeader', 'tableBody', 'microLabel', 'denseTableHeader',
  // Session 7.10.2
  'denseBody', 'denseHeading', 'microCaption', 'bodyMuted', 'fieldLabelMicro', 'panelLabel',
];
for (const role of TYPOGRAPHY_ROLES) {
  const sizeRulePattern = new RegExp(`\\.text-\\\\\\[length\\\\:var\\\\\\(--type-${role}-size\\\\\\)\\\\\\]\\{font-size:var\\(--type-${role}-size\\)\\}`);
  check(`typography.${role}: a real font-size rule exists in the built CSS (not just the :root variable declaration)`, sizeRulePattern.test(css));
  const weightRulePattern = new RegExp(`\\.\\\\\\[font-weight\\\\:var\\\\\\(--type-${role}-weight\\\\\\)\\\\\\]\\{font-weight:var\\(--type-${role}-weight\\)\\}`);
  check(`typography.${role}: a real font-weight rule exists in the built CSS`, weightRulePattern.test(css));
}

// --- Status colour roles: every role must have real border/fill rules
const STATUS_ROLES = ['positive', 'caution', 'negative', 'pending', 'neutral'];
for (const role of STATUS_ROLES) {
  const borderRulePattern = new RegExp(`\\.border-\\\\\\[var\\\\\\(--status-${role}-border\\\\\\)\\\\\\]\\{border-color:var\\(--status-${role}-border\\)\\}`);
  check(`status.${role}: a real border-color rule exists in the built CSS`, borderRulePattern.test(css));
}

// --- :root variable declarations are also present (the other half of
// the chain — a rule referencing an undeclared variable would compute
// to nothing even if the class itself is syntactically real) ---------
for (const role of TYPOGRAPHY_ROLES) {
  check(`--type-${role}-size is declared in :root`, css.includes(`--type-${role}-size:`));
}
for (const role of STATUS_ROLES) {
  check(`--status-${role}-border is declared in :root`, css.includes(`--status-${role}-border:`));
}

rmSync(distDir, { recursive: true, force: true });
check('dist/ cleaned up after verification', true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
