// Session 7.7 — confirms src/index.css's generated block is currently
// in sync with src/theme/configs/voiceforce.config.ts. This is a drift
// detector: if someone hand-edits index.css's generated block, or
// changes the config without regenerating, this fails loudly rather
// than letting the two silently diverge (the exact "two competing
// sources of truth" Session 7.7's own constraints forbid).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const indexCssPath = new URL('../../src/index.css', import.meta.url);

const before = readFileSync(indexCssPath, 'utf8');
const output = execFileSync(process.execPath, ['.tooling/scripts/generate-theme-css.mjs'], { cwd: repoRoot, encoding: 'utf8' });
const after = readFileSync(indexCssPath, 'utf8');

if (before !== after) {
  console.error('FAIL: src/index.css was NOT in sync with src/theme/configs/voiceforce.config.ts — the generator just rewrote it.');
  console.error('This means index.css was hand-edited, or the config changed without running `npm run generate:theme`.');
  console.error(output);
  process.exit(1);
}

console.log('PASS: src/index.css generated block is in sync with src/theme/configs/voiceforce.config.ts (no drift).');
console.log(`${1} passed, 0 failed`);
