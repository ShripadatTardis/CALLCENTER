// Session 7.11 — multi-customer theme configuration verification.
//
// Covers exactly the brief's §10 checklist: default/explicit VoiceForce
// selection, KATON selection, unknown-customer rejection, schema
// validation for both configs, light/dark generation for both, no stale
// CSS after switching customers, VoiceForce baseline reproduction, and
// no cross-customer configuration leakage. Same esbuild-bundle-then-
// import convention every other *-verify.mjs script in this repo
// already uses (see voiceforce-baseline-roundtrip-verify.mjs).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const indexCssPath = join(repoRoot, 'src', 'index.css');
const generatorPath = join(repoRoot, '.tooling', 'scripts', 'generate-theme-css.mjs');
const bundleDir = mkdtempSync(join(tmpdir(), 'cc-theme-multi-verify-'));
const bundlePath = join(bundleDir, 'bundle.mjs');

await build({
  entryPoints: [join(repoRoot, '.tooling', 'scripts', 'generate-theme-css.entry.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundlePath,
});

const { voiceForceThemeConfigSchema, voiceforceBaselineConfig, katonConfig, generateRootDeclarations, generateDarkDeclarations } =
  await import(`file://${bundlePath.replace(/\\/g, '/')}`);

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

// --- 1. Schema validation for both configurations -------------------
const vfValidation = voiceForceThemeConfigSchema.safeParse(voiceforceBaselineConfig);
check('VoiceForce config validates against the shared schema', vfValidation.success, vfValidation.success ? undefined : JSON.stringify(vfValidation.error?.format()));

const katonValidation = voiceForceThemeConfigSchema.safeParse(katonConfig);
check('KATON config validates against the SAME shared schema', katonValidation.success, katonValidation.success ? undefined : JSON.stringify(katonValidation.error?.format()));

check('KATON config has a distinct meta.id from VoiceForce', katonConfig.meta.id === 'katon' && voiceforceBaselineConfig.meta.id === 'voiceforce');

// --- 2. Light/dark generation for both configurations, no empty values
for (const [name, cfg] of [['voiceforce', voiceforceBaselineConfig], ['katon', katonConfig]]) {
  const root = generateRootDeclarations(cfg);
  const dark = generateDarkDeclarations(cfg);
  const empty = [...root, ...dark].filter((d) => d.value === '' || d.value == null);
  check(`${name}: generates both :root and .dark declarations with no empty values`, root.length > 0 && dark.length > 0 && empty.length === 0, empty.map((d) => d.name).join(', '));
}

// --- 3. No cross-customer configuration leakage ----------------------
const vfRoot = generateRootDeclarations(voiceforceBaselineConfig);
const katonRoot = generateRootDeclarations(katonConfig);
const vfBg = vfRoot.find((d) => d.name === '--background')?.value;
const katonBg = katonRoot.find((d) => d.name === '--background')?.value;
check('VoiceForce and KATON generate genuinely different --background values (configs are not aliased/shared by reference)', vfBg !== katonBg, `voiceforce=${vfBg} katon=${katonBg}`);

const vfPrimary = vfRoot.find((d) => d.name === '--primary')?.value;
const katonPrimary = katonRoot.find((d) => d.name === '--primary')?.value;
check('VoiceForce and KATON generate genuinely different --primary values', vfPrimary !== katonPrimary, `voiceforce=${vfPrimary} katon=${katonPrimary}`);

// --- 3b. Session 16.4.3.1 — dialog-size role generates for both configs
for (const [name, root] of [['voiceforce', vfRoot], ['katon', katonRoot]]) {
  const width = root.find((d) => d.name === '--dialog-large-width')?.value;
  const height = root.find((d) => d.name === '--dialog-large-height')?.value;
  const maxWidth = root.find((d) => d.name === '--dialog-large-max-width')?.value;
  const maxHeight = root.find((d) => d.name === '--dialog-large-max-height')?.value;
  check(
    `${name}: --dialog-large-width/-height/-max-width/-max-height are all real, non-empty values`,
    width === '80vw' && height === '80vh' && Boolean(maxWidth) && Boolean(maxHeight),
    `width=${width} height=${height} maxWidth=${maxWidth} maxHeight=${maxHeight}`,
  );
}

// --- 4. Decision-3 compliance: no curriculum-specific component exists
// Scoped to components/pages only — src/theme/configs/*.config.ts
// LEGITIMATELY documents these excluded elements in prose (explaining
// why they're not implemented, per decision 3's own requirement), which
// would otherwise false-positive this check.
const componentsDir = join(repoRoot, 'src', 'components');
const pagesDir = join(repoRoot, 'src', 'pages');
function grepTree(dir, pattern) {
  const hits = [];
  const { readdirSync, statSync } = require('node:fs');
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) hits.push(...grepTree(full, pattern));
    else if (/\.tsx?$/.test(entry)) {
      const text = readFileSync(full, 'utf8');
      if (pattern.test(text)) hits.push(full);
    }
  }
  return hits;
}
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const provenanceHits = [...grepTree(componentsDir, /provenance.?tag|from.the.book|added.by.the.system/i), ...grepTree(pagesDir, /provenance.?tag|from.the.book|added.by.the.system/i)];
const workflowStageHits = [...grepTree(componentsDir, /workflow.?stage.?indicator|WorkflowStage/), ...grepTree(pagesDir, /workflow.?stage.?indicator|WorkflowStage/)];
check('No provenance dashed-border tag component exists anywhere (decision 3)', provenanceHits.length === 0, provenanceHits.join(', '));
check('No workflow/progress-stage indicator component exists anywhere (decision 3)', workflowStageHits.length === 0, workflowStageHits.join(', '));

// --- 5. End-to-end CLI behavior: default/explicit/unknown selection,
//        no stale CSS after switching, VoiceForce baseline reproduction
const originalIndexCss = readFileSync(indexCssPath, 'utf8');
const backupPath = join(bundleDir, 'index.css.backup');
copyFileSync(indexCssPath, backupPath);

try {
  // Default (no flag) selects voiceforce.
  execFileSync(process.execPath, [generatorPath], { cwd: repoRoot, encoding: 'utf8' });
  const afterDefault = readFileSync(indexCssPath, 'utf8');
  check('CLI with no --theme flag defaults to voiceforce (no diff from current committed baseline)', afterDefault === originalIndexCss);

  // Explicit voiceforce selection reproduces the identical baseline.
  execFileSync(process.execPath, [generatorPath, '--theme=voiceforce'], { cwd: repoRoot, encoding: 'utf8' });
  const afterExplicitVf = readFileSync(indexCssPath, 'utf8');
  check('CLI with --theme=voiceforce reproduces the exact same baseline as the default', afterExplicitVf === originalIndexCss);

  // KATON selection produces real, different output.
  execFileSync(process.execPath, [generatorPath, '--theme=katon'], { cwd: repoRoot, encoding: 'utf8' });
  const afterKaton = readFileSync(indexCssPath, 'utf8');
  check('CLI with --theme=katon produces output DIFFERENT from the VoiceForce baseline', afterKaton !== originalIndexCss);
  check('KATON-generated CSS contains KATON\'s real --background value', afterKaton.includes('--background: 207 36% 95%')); // hsl() of KATON's real "Ground" hex #EEF3F7

  // Switching back to voiceforce reproduces the original byte-for-byte —
  // no stale KATON values left behind.
  execFileSync(process.execPath, [generatorPath, '--theme=voiceforce'], { cwd: repoRoot, encoding: 'utf8' });
  const afterSwitchBack = readFileSync(indexCssPath, 'utf8');
  check('Switching KATON -> voiceforce reproduces the ORIGINAL VoiceForce baseline byte-for-byte (no stale CSS)', afterSwitchBack === originalIndexCss);

  // Unknown theme is rejected with a non-zero exit, and does NOT touch index.css.
  let unknownRejected = false;
  let unknownExitCode = 0;
  try {
    execFileSync(process.execPath, [generatorPath, '--theme=nonexistent-customer'], { cwd: repoRoot, encoding: 'utf8' });
  } catch (err) {
    unknownRejected = true;
    unknownExitCode = err.status;
  }
  check('Unknown customer configuration is rejected with a non-zero exit code', unknownRejected && unknownExitCode !== 0);
  const afterUnknownAttempt = readFileSync(indexCssPath, 'utf8');
  check('A rejected unknown-customer attempt leaves src/index.css untouched', afterUnknownAttempt === afterSwitchBack);

  // VITE_THEME env var also works (not just --theme=).
  execFileSync(process.execPath, [generatorPath], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, VITE_THEME: 'katon' } });
  const afterEnvKaton = readFileSync(indexCssPath, 'utf8');
  check('VITE_THEME=katon env var also selects the KATON configuration', afterEnvKaton === afterKaton);
} finally {
  // Always restore the real, committed VoiceForce baseline — this
  // script must never leave the working tree on a non-default config.
  copyFileSync(backupPath, indexCssPath);
  const restored = readFileSync(indexCssPath, 'utf8');
  check('Script restored src/index.css to its original committed VoiceForce state before exiting', restored === originalIndexCss);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
