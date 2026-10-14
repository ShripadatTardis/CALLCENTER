// Session 7.7 — build-time theme generation.
//
// Bundles the REAL compiled src/theme/schema.ts + voiceforce.config.ts
// + generateCssVariables.ts (via esbuild, same convention every
// *-verify.mjs script in this repo already uses — not a
// reimplementation), validates the active config against the schema,
// generates the `:root`/`.dark` CSS custom property declarations, and
// writes them into src/index.css between the
// GENERATED-THEME-VARIABLES marker comments this script also owns.
//
// Fails the build (non-zero exit) if the config does not validate, or
// if any declaration resolves to an empty value — per the explicit
// instruction to fail loudly on invalid/missing values rather than
// silently substitute anything.
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

const { voiceForceThemeConfigSchema, voiceforceBaselineConfig, generateRootDeclarations, generateDarkDeclarations, renderDeclarationBlock } =
  await import(`file://${bundlePath.replace(/\\/g, '/')}`);

const validation = voiceForceThemeConfigSchema.safeParse(voiceforceBaselineConfig);
if (!validation.success) {
  console.error('FAIL: active theme configuration does not validate against the schema.');
  console.error(validation.error.format());
  process.exit(1);
}

// The active configuration — per Session 7.4's decision 8, VoiceForce
// is the explicit default. No KATON config exists yet; there is
// nothing to select between.
const activeConfig = voiceforceBaselineConfig;

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
  '',
  '    /* Not generated — radii/cards migration is deferred to a later session. */',
  '    --radius: 0.5rem;',
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
