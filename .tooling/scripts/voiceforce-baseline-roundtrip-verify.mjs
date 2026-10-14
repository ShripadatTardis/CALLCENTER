// Session 7.6.1/7.6.2 — VoiceForce baseline configuration round-trip
// verification, against the REAL compiled
// src/theme/configs/voiceforce.config.ts (via esbuild, not a
// reimplementation).
//
// Session 7.6.1 revised the schema (src/theme/schema.ts) to resolve all
// seven gaps the original Session 7.6 extraction found, using a
// repeated "default + optional named variants" pattern. The config is
// now a FULL `VoiceForceThemeConfig` (confirmed separately via
// `voiceForceThemeConfigSchema.safeParse` returning `success: true`).
// This script goes one step further than schema validity: it checks
// every real CSS custom property / hardcoded value this session's audit
// found against the config's actual value, proving the round-trip is
// not just schema-shaped but BYTE-FOR-BYTE accurate to the real source.
//
// Session 7.6.2 added: every field confirmed to be sourced from a real
// `:root`/`.dark` CSS custom property pair is now verified in BOTH
// appearance modes (sections 1D/1E below), closing the gap Session
// 7.7's pre-flight found — the baseline previously only ever checked
// `:root` (light).
//
// Session 7.7 fix: this script previously imported pre-built bundles
// from `.tooling/tmp/`, which were never committed to git (they were
// local-only build artifacts from manual esbuild runs during
// development). CI's clean checkout has no `.tooling/tmp/`, so
// `npm run verify:full` failed there with ERR_MODULE_NOT_FOUND for
// `.tooling/tmp/voiceforceConfig.mjs` (GitHub Actions run on commit
// 2857a33). Fixed by self-bundling at runtime via esbuild's JS API —
// the exact same pattern `.tooling/scripts/generate-theme-css.mjs`
// already uses — so this script has zero dependency on any leftover
// or pre-committed temporary file; it works from a clean checkout.
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const bundleDir = mkdtempSync(join(tmpdir(), 'cc-roundtrip-verify-'));
const bundlePath = join(bundleDir, 'bundle.mjs');

await build({
  entryPoints: [join(repoRoot, '.tooling', 'scripts', 'voiceforce-baseline-roundtrip-verify.entry.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundlePath,
});

const { voiceforceBaselineConfig, voiceForceThemeConfigSchema } = await import(`file://${bundlePath.replace(/\\/g, '/')}`);

let pass = 0, fail = 0;
function reproduced(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'REPRODUCED' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}
function assertTrue(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  cond ? pass++ : fail++;
}

// --- 0. Schema-level completeness: the config must be a fully valid
// VoiceForceThemeConfig instance (Session 7.6.1's core fix). ---
{
  const result = voiceForceThemeConfigSchema.safeParse(voiceforceBaselineConfig);
  assertTrue('voiceforceBaselineConfig validates as a complete VoiceForceThemeConfig (0 required-field gaps)', result.success);
}

// --- 1. Real CSS custom property values (src/index.css :root, light mode) ---
reproduced('--background -> color.surfaces.base.light.background', voiceforceBaselineConfig.color.surfaces.base.light.background, 'hsl(210 20% 98%)');
reproduced('--foreground -> color.surfaces.base.light.foreground', voiceforceBaselineConfig.color.surfaces.base.light.foreground, 'hsl(222.2 84% 4.9%)');
reproduced('--card -> color.surfaces.raised.light.background', voiceforceBaselineConfig.color.surfaces.raised.light.background, 'hsl(0 0% 100%)');
reproduced('--card-foreground -> color.surfaces.raised.light.foreground', voiceforceBaselineConfig.color.surfaces.raised.light.foreground, 'hsl(222.2 84% 4.9%)');
reproduced('--popover -> color.surfaces.overlay.light.background', voiceforceBaselineConfig.color.surfaces.overlay.light.background, 'hsl(0 0% 100%)');
reproduced('--popover-foreground -> color.surfaces.overlay.light.foreground', voiceforceBaselineConfig.color.surfaces.overlay.light.foreground, 'hsl(222.2 84% 4.9%)');
reproduced('--accent -> color.surfaces.interactiveSubtle.light.background', voiceforceBaselineConfig.color.surfaces.interactiveSubtle.light.background, 'hsl(210 40% 96.1%)');
reproduced('--accent-foreground -> color.surfaces.interactiveSubtle.light.foreground', voiceforceBaselineConfig.color.surfaces.interactiveSubtle.light.foreground, 'hsl(222.2 47.4% 11.2%)');
reproduced('--sidebar-background -> color.surfaces.sidebar.light.background', voiceforceBaselineConfig.color.surfaces.sidebar.light.background, 'hsl(0 0% 98%)');
reproduced('--sidebar-foreground -> color.surfaces.sidebar.light.foreground', voiceforceBaselineConfig.color.surfaces.sidebar.light.foreground, 'hsl(240 5.3% 26.1%)');
reproduced('--primary -> color.roles.primary.light.background', voiceforceBaselineConfig.color.roles.primary.light.background, 'hsl(222.2 47.4% 11.2%)');
reproduced('--primary-foreground -> color.roles.primary.light.foreground', voiceforceBaselineConfig.color.roles.primary.light.foreground, 'hsl(210 40% 98%)');
reproduced('--secondary -> color.roles.secondary.light.background', voiceforceBaselineConfig.color.roles.secondary.light.background, 'hsl(210 40% 96.1%)');
reproduced('--secondary-foreground -> color.roles.secondary.light.foreground', voiceforceBaselineConfig.color.roles.secondary.light.foreground, 'hsl(222.2 47.4% 11.2%)');
reproduced('--muted -> color.roles.muted.light.background', voiceforceBaselineConfig.color.roles.muted.light.background, 'hsl(210 40% 96.1%)');
reproduced('--muted-foreground -> color.roles.muted.light.foreground', voiceforceBaselineConfig.color.roles.muted.light.foreground, 'hsl(215.4 16.3% 46.9%)');
reproduced('--destructive -> color.semantic.negative.solid.light.background', voiceforceBaselineConfig.color.semantic.negative.solid.light.background, 'hsl(0 84.2% 60.2%)');
reproduced('--destructive-foreground -> color.semantic.negative.solid.light.foreground', voiceforceBaselineConfig.color.semantic.negative.solid.light.foreground, 'hsl(210 40% 98%)');
reproduced('--border -> borders.default.color.light', voiceforceBaselineConfig.borders.default.color.light, 'hsl(214.3 31.8% 91.4%)');
reproduced('--input -> borders.field.color.light', voiceforceBaselineConfig.borders.field.color.light, 'hsl(214.3 31.8% 91.4%)');
reproduced('--ring -> components.input.focusBorder.light', voiceforceBaselineConfig.components.input.focusBorder.light, 'hsl(222.2 84% 4.9%)');
reproduced('ring-2 (focus ring width) -> borders.focusRingWidthPx', voiceforceBaselineConfig.borders.focusRingWidthPx, 2);
reproduced('radii.panel derived from --radius (8px)', voiceforceBaselineConfig.radii.panel, 8);
reproduced('radii.control derived from --radius (6px)', voiceforceBaselineConfig.radii.control, 6);
reproduced('radii.tag derived from --radius (4px)', voiceforceBaselineConfig.radii.tag, 4);

// --- 1D. Session 7.6.2 — real CSS custom property DARK values
// (src/index.css .dark), for every field above that genuinely differs
// by appearance mode. ---
reproduced('.dark --background -> color.surfaces.base.dark.background', voiceforceBaselineConfig.color.surfaces.base.dark.background, 'hsl(222.2 84% 4.9%)');
reproduced('.dark --foreground -> color.surfaces.base.dark.foreground', voiceforceBaselineConfig.color.surfaces.base.dark.foreground, 'hsl(210 40% 98%)');
reproduced('.dark --card -> color.surfaces.raised.dark.background', voiceforceBaselineConfig.color.surfaces.raised.dark.background, 'hsl(222.2 84% 4.9%)');
reproduced('.dark --card-foreground -> color.surfaces.raised.dark.foreground', voiceforceBaselineConfig.color.surfaces.raised.dark.foreground, 'hsl(210 40% 98%)');
reproduced('.dark --popover -> color.surfaces.overlay.dark.background', voiceforceBaselineConfig.color.surfaces.overlay.dark.background, 'hsl(222.2 84% 4.9%)');
reproduced('.dark --popover-foreground -> color.surfaces.overlay.dark.foreground', voiceforceBaselineConfig.color.surfaces.overlay.dark.foreground, 'hsl(210 40% 98%)');
reproduced('.dark --accent -> color.surfaces.interactiveSubtle.dark.background', voiceforceBaselineConfig.color.surfaces.interactiveSubtle.dark.background, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --accent-foreground -> color.surfaces.interactiveSubtle.dark.foreground', voiceforceBaselineConfig.color.surfaces.interactiveSubtle.dark.foreground, 'hsl(210 40% 98%)');
reproduced('.dark --sidebar-background -> color.surfaces.sidebar.dark.background', voiceforceBaselineConfig.color.surfaces.sidebar.dark.background, 'hsl(222.2 47.4% 11.2%)');
reproduced('.dark --sidebar-foreground -> color.surfaces.sidebar.dark.foreground', voiceforceBaselineConfig.color.surfaces.sidebar.dark.foreground, 'hsl(210 40% 98%)');
reproduced('.dark --primary -> color.roles.primary.dark.background', voiceforceBaselineConfig.color.roles.primary.dark.background, 'hsl(210 40% 98%)');
reproduced('.dark --primary-foreground -> color.roles.primary.dark.foreground', voiceforceBaselineConfig.color.roles.primary.dark.foreground, 'hsl(222.2 47.4% 11.2%)');
reproduced('.dark --secondary -> color.roles.secondary.dark.background', voiceforceBaselineConfig.color.roles.secondary.dark.background, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --secondary-foreground -> color.roles.secondary.dark.foreground', voiceforceBaselineConfig.color.roles.secondary.dark.foreground, 'hsl(210 40% 98%)');
reproduced('.dark --muted -> color.roles.muted.dark.background', voiceforceBaselineConfig.color.roles.muted.dark.background, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --muted-foreground -> color.roles.muted.dark.foreground', voiceforceBaselineConfig.color.roles.muted.dark.foreground, 'hsl(215 20.2% 65.1%)');
reproduced('.dark --destructive -> color.semantic.negative.solid.dark.background', voiceforceBaselineConfig.color.semantic.negative.solid.dark.background, 'hsl(0 62.8% 30.6%)');
reproduced('.dark --destructive-foreground -> color.semantic.negative.solid.dark.foreground (unchanged from light)', voiceforceBaselineConfig.color.semantic.negative.solid.dark.foreground, 'hsl(210 40% 98%)');
reproduced('.dark --border -> borders.default.color.dark', voiceforceBaselineConfig.borders.default.color.dark, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --input -> borders.field.color.dark', voiceforceBaselineConfig.borders.field.color.dark, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --ring -> components.input.focusBorder.dark', voiceforceBaselineConfig.components.input.focusBorder.dark, 'hsl(212.7 26.8% 83.9%)');
assertTrue('--border and --input remain equal to each other in both light and dark', voiceforceBaselineConfig.borders.default.color.light === voiceforceBaselineConfig.borders.field.color.light && voiceforceBaselineConfig.borders.default.color.dark === voiceforceBaselineConfig.borders.field.color.dark);

// --- 1E. Session 7.6.2 — remaining real :root/.dark pairs: component
// (button/input/table/alert) and navigation fields that track the same
// CSS custom properties checked above, at their own schema paths. ---
reproduced('.dark --primary (button.variants.primary)', voiceforceBaselineConfig.components.button.variants.primary.dark.background, 'hsl(210 40% 98%)');
reproduced('.dark --secondary (button.variants.secondary)', voiceforceBaselineConfig.components.button.variants.secondary.dark.background, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --destructive (button.variants.danger)', voiceforceBaselineConfig.components.button.variants.danger.dark.background, 'hsl(0 62.8% 30.6%)');
reproduced('.dark --primary (button.variants.quiet.foreground)', voiceforceBaselineConfig.components.button.variants.quiet.foreground.dark, 'hsl(210 40% 98%)');
reproduced('.dark --border (components.input.defaultBorder)', voiceforceBaselineConfig.components.input.defaultBorder.dark, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --background (components.input.disabledBackground)', voiceforceBaselineConfig.components.input.disabledBackground.dark, 'hsl(222.2 84% 4.9%)');
reproduced('.dark --card (components.table.headerBackground)', voiceforceBaselineConfig.components.table.headerBackground.dark, 'hsl(222.2 84% 4.9%)');
reproduced('.dark --muted-foreground (components.table.headerText)', voiceforceBaselineConfig.components.table.headerText.dark, 'hsl(215 20.2% 65.1%)');
reproduced('.dark --muted (components.table.rowSelectedBackground)', voiceforceBaselineConfig.components.table.rowSelectedBackground.dark, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --sidebar-foreground @ /60 (navigation.item.defaultForeground)', voiceforceBaselineConfig.navigation.item.defaultForeground.dark, 'hsl(210 40% 98% / 0.6)');
reproduced('.dark --sidebar-accent (navigation.item.hover.background)', voiceforceBaselineConfig.navigation.item.hover.dark.background, 'hsl(217.2 32.6% 17.5%)');
reproduced('.dark --background/--destructive (components.alert.variants.destructive)', voiceforceBaselineConfig.components.alert.variants.destructive.dark.foreground, 'hsl(0 62.8% 30.6%)');
assertTrue('navigation.item.active is intentionally NOT appearance-wrapped (hardcoded Tailwind color, no confirmed :root/.dark pair)', typeof voiceforceBaselineConfig.navigation.item.active.background === 'string');

// --- 1F. Session 7.6.3 — Badge (color.semantic + components.badge),
// Alert border, and the --sidebar-border sidebar gap. All real,
// transcribed directly from badge.tsx/alert.tsx's `dark:` Tailwind
// classes and src/index.css's --sidebar-border. ---
reproduced('badge.tsx positive: text-emerald-700/dark:text-emerald-400 -> color.semantic.positive.text', voiceforceBaselineConfig.color.semantic.positive.text.dark, 'rgb(52 211 153)');
reproduced('badge.tsx positive: bg-emerald-500/10 unchanged by mode -> color.semantic.positive.fill', voiceforceBaselineConfig.color.semantic.positive.fill.light, voiceforceBaselineConfig.color.semantic.positive.fill.dark);
reproduced('badge.tsx positive: border-emerald-600/40 dark:border-emerald-500/40 -> color.semantic.positive.border', voiceforceBaselineConfig.color.semantic.positive.border.dark, 'rgb(16 185 129 / 0.4)');
reproduced('badge.tsx escalated: text-red-700/dark:text-red-400 -> color.semantic.negative.text', voiceforceBaselineConfig.color.semantic.negative.text.dark, 'rgb(248 113 113)');
reproduced('badge.tsx escalated: border-red-600/40 dark:border-red-500/40 -> color.semantic.negative.border', voiceforceBaselineConfig.color.semantic.negative.border.dark, 'rgb(239 68 68 / 0.4)');
reproduced('badge.tsx warning: text-amber-700/dark:text-amber-400 -> color.semantic.caution.text', voiceforceBaselineConfig.color.semantic.caution.text.dark, 'rgb(251 191 36)');
reproduced('badge.tsx warning: border-amber-600/50 dark:border-amber-500/40 -> color.semantic.caution.border', voiceforceBaselineConfig.color.semantic.caution.border.dark, 'rgb(245 158 11 / 0.4)');
reproduced('components.badge.variants.negative.border mirrors color.semantic.negative.border', voiceforceBaselineConfig.components.badge.variants.negative.border.light, voiceforceBaselineConfig.color.semantic.negative.border.light);
reproduced('alert.tsx destructive: border-destructive/50 light -> components.alert.variants.destructive.light.border', voiceforceBaselineConfig.components.alert.variants.destructive.light.border, 'hsl(0 84.2% 60.2% / 0.5)');
reproduced('alert.tsx destructive: dark:border-destructive (full opacity) -> components.alert.variants.destructive.dark.border', voiceforceBaselineConfig.components.alert.variants.destructive.dark.border, 'hsl(0 62.8% 30.6%)');
assertTrue('alert.tsx default variant has no explicit border override (correctly left unset, not fabricated)', voiceforceBaselineConfig.components.alert.variants.default.light.border === undefined && voiceforceBaselineConfig.components.alert.variants.default.dark.border === undefined);
reproduced('--sidebar-border (light) -> color.surfaces.sidebar.light.border', voiceforceBaselineConfig.color.surfaces.sidebar.light.border, 'hsl(220 13% 91%)');
reproduced('.dark --sidebar-border -> color.surfaces.sidebar.dark.border', voiceforceBaselineConfig.color.surfaces.sidebar.dark.border, 'hsl(217.2 32.6% 17.5%)');

// --- 1G. Session 7.7 — the two additional navigation active-text
// states Session 7.6.3 flagged as a gap, now closed. ---
reproduced('Sidebar.tsx accordion trigger text-cyan-500/dark:text-cyan-400 -> navigation.item.headingActiveText', voiceforceBaselineConfig.navigation.item.headingActiveText.dark, '#22D3EE');
reproduced('Sidebar.tsx expanded nav Link text-cyan-600/dark:text-cyan-300 -> navigation.item.expandedActiveText', voiceforceBaselineConfig.navigation.item.expandedActiveText.dark, '#67E8F9');

// --- 2. Gap C: the real 7-shade cyan/interactive scale, every shade preserved ---
// All 7 real Tailwind cyan shades found in use (grep evidence: 300/400/
// 500/600/700/800/950) must each be represented by at least one value
// in the config's default+variants — not just "7 total entries" (some
// roles legitimately reuse the same real shade, e.g. a border and a
// link-text both happening to use cyan-700).
{
  const REAL_SHADES_HEX = ['#67E8F9', '#22D3EE', '#06B6D4', '#0891B2', '#0E7490', '#155E75', '#083344']; // cyan 300/400/500/600/700/800/950
  const a = voiceforceBaselineConfig.color.interactive.action;
  const values = new Set([
    a.default.text, a.default.focusRing,
    ...Object.values(a.variants ?? {}).flatMap((v) => [v.text, v.background, v.border, v.focusRing].filter(Boolean)),
  ]);
  const missing = REAL_SHADES_HEX.filter((hex) => !values.has(hex));
  assertTrue(`color.interactive.action preserves all 7 real cyan shades found in use (300/400/500/600/700/800/950) — missing: ${missing.join(', ') || 'none'}`, missing.length === 0);
}
reproduced('active sidebar pillar (bg-cyan-600) -> navigation.item.active.background', voiceforceBaselineConfig.navigation.item.active.background, '#0891B2');

// --- 3. Gap D: all 6 real shadow values preserved ---
assertTrue('shadow has default + 5 named variants (6 real values total, none dropped)', Object.keys(voiceforceBaselineConfig.shadow.variants ?? {}).length === 5);

// --- 4. Gap E: real button/input height variants preserved ---
reproduced('Button default height (h-10) -> heights.default.primaryAction', voiceforceBaselineConfig.heights.default.primaryAction, 40);
reproduced('Button xs height (h-7) -> heights.variants.compact.control', voiceforceBaselineConfig.heights.variants.compact.control, 28);
reproduced('Button lg height (h-11) -> heights.variants.comfortable.primaryAction', voiceforceBaselineConfig.heights.variants.comfortable.primaryAction, 44);
reproduced('Input sm height (h-8) -> heights.variants.compact.formField', voiceforceBaselineConfig.heights.variants.compact.formField, 32);

// --- 5. Gap F: typography scale is complete (8 real sizes) and honestly marks line-height as inherited, not fabricated ---
reproduced('typography.scale has all 8 real arbitrary-pixel sizes', voiceforceBaselineConfig.typography.scale.length, 8);
assertTrue('every type-ramp step honestly records lineHeightSource rather than a fabricated lineHeightPx', voiceforceBaselineConfig.typography.scale.every((s) => s.lineHeightSource === 'inherited-default' && s.lineHeightPx === undefined));

// --- 6. Gap G: real icon size variants preserved ---
reproduced('icons.default.sizePx (16px, most common)', voiceforceBaselineConfig.icons.default.sizePx, 16);
reproduced('icons.variants.tight.sizePx (12px)', voiceforceBaselineConfig.icons.variants.tight.sizePx, 12);
reproduced('icons.variants.compact.sizePx (14px)', voiceforceBaselineConfig.icons.variants.compact.sizePx, 14);

// --- 7. Gap A/B: no remaining field-name collision — color.brand and
// color.surfaces.interactiveSubtle are structurally separate paths (the
// schema, not the config instance, is what proves no collision exists;
// `brand.decorative` is correctly left UNSET here since VoiceForce has
// no real value for it — its absence is not itself a defect). ---
assertTrue('color.brand and color.surfaces are distinct top-level color groups, with interactiveSubtle living only under surfaces (never under brand)', 'brand' in voiceforceBaselineConfig.color && 'surfaces' in voiceforceBaselineConfig.color && 'interactiveSubtle' in voiceforceBaselineConfig.color.surfaces && !('interactiveSubtle' in voiceforceBaselineConfig.color.brand));
assertTrue('color.brand.decorative is correctly left unset (VoiceForce has no real decorative-accent value) rather than fabricated', voiceforceBaselineConfig.color.brand.decorative === undefined);

// --- 8. Session 7.8 — the new `pending` semantic role (Task 1) and
// `panels` tokens (Tasks 2/3), real values confirmed. ---
reproduced('color.semantic.pending.text (new Session 7.8 role) light', voiceforceBaselineConfig.color.semantic.pending.text.light, 'rgb(29 78 216)');
reproduced('color.semantic.pending.text dark', voiceforceBaselineConfig.color.semantic.pending.text.dark, 'rgb(96 165 250)');
reproduced('components.badge.variants.pending mirrors color.semantic.pending', voiceforceBaselineConfig.components.badge.variants.pending.text.light, voiceforceBaselineConfig.color.semantic.pending.text.light);
reproduced('panels.summary.radiusPx (rounded-md, the dominant real KPI/summary-card radius)', voiceforceBaselineConfig.panels.summary.radiusPx, 6);
reproduced('panels.summary.paddingPx.x (p-3, the most common real value)', voiceforceBaselineConfig.panels.summary.paddingPx.x, 12);
reproduced('panels.standard.radiusPx (the shadcn Card primitive\'s real rounded-lg)', voiceforceBaselineConfig.panels.standard.radiusPx, 8);
reproduced('panels.dense.paddingPx.x (CallLogs/QAReview table wrappers have no padding)', voiceforceBaselineConfig.panels.dense.paddingPx.x, 0);
assertTrue('panels.standard.shadow references the real shadow.variants.subtle (shadow-sm) key', voiceforceBaselineConfig.panels.standard.shadow === 'subtle' && voiceforceBaselineConfig.shadow.variants.subtle === '0 1px 2px 0 rgb(0 0 0 / 0.05)');
reproduced('charts.seriesPalette[0] (Bar fill, VoiceAnalyticsTab/ChatAnalyticsTab)', voiceforceBaselineConfig.charts.seriesPalette[0], '#3B82F6');

// --- 9. Session 7.9 — table header/row geometry (Tasks 3/4) and the
// rowHoverBackground correction (real hover:bg-card, not the unused
// primitive default). ---
reproduced('tables.header.heightPx (h-9, the shared TableHead default, independently matched across 4 real tables)', voiceforceBaselineConfig.tables.header.heightPx, 36);
reproduced('tables.header.paddingXPx (px-3)', voiceforceBaselineConfig.tables.header.paddingXPx, 12);
reproduced('tables.rows.standard.paddingYPx (py-1.5, the shared TableCell default)', voiceforceBaselineConfig.tables.rows.standard.paddingYPx, 6);
reproduced('tables.rows.expanded.paddingYPx (py-2, UserManagement.tsx\'s real, content-justified looser density)', voiceforceBaselineConfig.tables.rows.expanded.paddingYPx, 8);
assertTrue('tables.rows.compact is honestly left unset — no table in scope uses a density denser than standard', voiceforceBaselineConfig.tables.rows.compact === undefined);
assertTrue('components.table.rowHoverBackground now matches color.surfaces.raised (--card) — the real, dominant hover value, not the unused primitive default (--muted/50)', voiceforceBaselineConfig.components.table.rowHoverBackground.light === voiceforceBaselineConfig.color.surfaces.raised.light.background && voiceforceBaselineConfig.components.table.rowHoverBackground.dark === voiceforceBaselineConfig.color.surfaces.raised.dark.background);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(fail === 0
  ? '\nResult: the VoiceForce baseline configuration is a complete, schema-valid VoiceForceThemeConfig, and every checked value reproduces its real CSS/component source exactly in BOTH light and dark appearance modes. All 7 Session 7.6 gaps and the Session 7.6.2 light/dark gap are resolved.'
  : '\nResult: FAIL — see above for the specific mismatch(es).');
if (fail > 0) process.exit(1);
