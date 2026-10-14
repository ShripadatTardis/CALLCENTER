// Session 7.7 — build-time theme generation.
// Session 7.11 — extended with multi-customer configuration selection.
//
// Bundles the REAL compiled src/theme/schema.ts + every customer config
// + generateCssVariables.ts (via esbuild, same convention every
// *-verify.mjs script in this repo already uses — not a
// reimplementation), validates the SELECTED config against the schema,
// generates the `:root`/`.dark` CSS custom property declarations, and
// writes them into src/index.css between the
// GENERATED-THEME-VARIABLES marker comments this script also owns.
//
// Fails the build (non-zero exit) if the config does not validate, or
// if any declaration resolves to an empty value — per the explicit
// instruction to fail loudly on invalid/missing values rather than
// silently substitute anything.
//
// Customer selection (Session 7.11): explicit, deterministic, validated.
//   node .tooling/scripts/generate-theme-css.mjs                 -> voiceforce (default)
//   node .tooling/scripts/generate-theme-css.mjs --theme=katon    -> katon
//   VITE_THEME=katon node .tooling/scripts/generate-theme-css.mjs -> katon
// A `--theme=` CLI flag takes precedence over VITE_THEME if both are
// set (CLI flag exists specifically so npm scripts work identically on
// Windows and POSIX shells without needing cross-env or shell-specific
// env-var syntax). An unrecognized theme id is a hard, non-zero-exit
// failure — never a silent fallback to a default.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const indexCssPath = join(repoRoot, 'src', 'index.css');
const bundleDir = mkdtempSync(join(tmpdir(), 'cc-theme-gen-'));
const bundlePath = join(bundleDir, 'bundle.mjs');

await build({
  entryPoints: [join(repoRoot, '.tooling', 'scripts', 'generate-theme-css.entry.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundlePath,
});

const { voiceForceThemeConfigSchema, voiceforceBaselineConfig, katonConfig, generateRootDeclarations, generateDarkDeclarations, renderDeclarationBlock } =
  await import(`file://${bundlePath.replace(/\\/g, '/')}`);

// Session 7.11 — the customer-configuration registry. Adding a future
// customer is adding one entry here plus one new config file — never a
// change to any consuming screen/component (the brief's own onboarding
// acceptance criterion).
const THEME_REGISTRY = {
  voiceforce: voiceforceBaselineConfig,
  katon: katonConfig,
};

const cliThemeArg = process.argv.find((a) => a.startsWith('--theme='));
const requestedTheme = (cliThemeArg ? cliThemeArg.slice('--theme='.length) : process.env.VITE_THEME) || 'voiceforce';

if (!Object.prototype.hasOwnProperty.call(THEME_REGISTRY, requestedTheme)) {
  console.error(`FAIL: unknown customer configuration "${requestedTheme}". Known configurations: ${Object.keys(THEME_REGISTRY).join(', ')}.`);
  process.exit(1);
}

const activeConfig = THEME_REGISTRY[requestedTheme];

const validation = voiceForceThemeConfigSchema.safeParse(activeConfig);
if (!validation.success) {
  console.error(`FAIL: "${requestedTheme}" theme configuration does not validate against the schema.`);
  console.error(validation.error.format());
  process.exit(1);
}

console.log(`Generating theme CSS for customer configuration: "${requestedTheme}".`);

const rootDeclarations = generateRootDeclarations(activeConfig);
const darkDeclarations = generateDarkDeclarations(activeConfig);

const empty = [...rootDeclarations, ...darkDeclarations].filter((d) => d.value === '' || d.value == null);
if (empty.length > 0) {
  console.error('FAIL: the following generated CSS custom properties resolved to an empty value — refusing to silently substitute:');
  for (const d of empty) console.error(`  ${d.name} (${d.comment})`);
  process.exit(1);
}

const generated = [
  '  /* GENERATED-THEME-VARIABLES:START — do not hand-edit between these markers.',
  '     Run `npm run generate:theme` after changing src/theme/configs/voiceforce.config.ts.',
  '     Source: src/theme/generateCssVariables.ts + src/theme/configs/voiceforce.config.ts. */',
  '  :root {',
  renderDeclarationBlock(rootDeclarations, '    '),
  '',
  '    /* Preserved verbatim — not sourced from the config. Session 7.6.3',
  '       confirmed (grep) these are consumed only by the unused',
  '       src/components/ui/sidebar.tsx primitive, which nothing imports. */',
  '    --sidebar-primary: 199 89% 48%;',
  '    --sidebar-primary-foreground: 0 0% 100%;',
  '    --sidebar-accent-foreground: 240 5.9% 10%;',
  '    --sidebar-ring: 217.2 91.2% 59.8%;',
  '  }',
  '',
  '  .dark {',
  renderDeclarationBlock(darkDeclarations, '    '),
  '',
  '    --sidebar-primary: 199 89% 48%;',
  '    --sidebar-primary-foreground: 0 0% 100%;',
  '    --sidebar-accent-foreground: 210 40% 98%;',
  '    --sidebar-ring: 199 89% 48%;',
  '  }',
  '  /* GENERATED-THEME-VARIABLES:END */',
].join('\n');

const current = readFileSync(indexCssPath, 'utf8');
const startMarker = '  /* GENERATED-THEME-VARIABLES:START';
const endMarker = '  /* GENERATED-THEME-VARIABLES:END */';
const startIdx = current.indexOf(startMarker);
const endIdx = current.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('FAIL: src/index.css is missing the GENERATED-THEME-VARIABLES marker comments. Refusing to guess where to write.');
  process.exit(1);
}

const next = current.slice(0, startIdx) + generated + current.slice(endIdx + endMarker.length);

if (next === current) {
  console.log('Theme CSS already up to date — no change written.');
} else {
  writeFileSync(indexCssPath, next, 'utf8');
  console.log(`Theme CSS regenerated: ${rootDeclarations.length} :root + ${darkDeclarations.length} .dark declarations written to src/index.css.`);
}
