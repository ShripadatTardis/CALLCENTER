import { generateRootDeclarations, generateDarkDeclarations } from './generateCssVariables';
import { voiceforceBaselineConfig } from './configs/voiceforce.config';
import { katonConfig } from './configs/katon.config';
import type { VoiceForceThemeConfig } from './schema';
import type { ResolvedTheme } from '@/contexts/themeContextObject';

/**
 * Several schema fields are OPTIONAL and only conditionally emitted by
 * `generateRootDeclarations`/`generateDarkDeclarations` (e.g.
 * `navigation.item.expandedActiveText` — KATON's own config
 * deliberately omits it, "no distinct secondary active-text treatment
 * is documented"). The static build-time generator never has to worry
 * about this: each customer's generated `src/index.css` is a complete,
 * standalone file, so an omitted property for KATON simply never
 * existed in KATON's own output. At RUNTIME, switching from a skin that
 * DOES define a property to one that doesn't is different — this
 * module only ever WRITES properties a config provides, so an omitted
 * one would otherwise be left at whatever value a previous skin (or the
 * static file's own original VoiceForce bake) last set it to. That
 * silently stale `--nav-item-active-text` (VoiceForce's cyan, left over
 * after switching to KATON) was found live during this session's own
 * browser verification: the selected nav item's text stayed cyan
 * against KATON's pale-blue active background, reading as a barely-
 * visible mismatch instead of a clear highlight.
 *
 * Fix: compute the full set of property names EITHER config is capable
 * of emitting (both configs' root+dark declarations), and on every
 * apply, first clear that entire set before writing the new config's
 * actual declarations. A property the new config doesn't define is
 * removed (falling back to the stylesheet default, same as if it had
 * never been touched at all) instead of silently inheriting the
 * previous skin's value.
 */
const ALL_POSSIBLE_PROPERTY_NAMES: readonly string[] = Array.from(new Set([
  ...generateRootDeclarations(voiceforceBaselineConfig).map((d) => d.name),
  ...generateDarkDeclarations(voiceforceBaselineConfig).map((d) => d.name),
  ...generateRootDeclarations(katonConfig).map((d) => d.name),
  ...generateDarkDeclarations(katonConfig).map((d) => d.name),
]));

/**
 * Session 7.12 — runtime (no rebuild, no page reload) application of a
 * customer theme config's CSS custom properties, reusing the EXACT same
 * `generateRootDeclarations`/`generateDarkDeclarations` pure functions
 * the build-time generator (`.tooling/scripts/generate-theme-css.mjs`,
 * Session 7.7+) already uses to produce the static block in
 * `src/index.css`. Nothing here duplicates a single color/dimension
 * value or introduces hardcoded customer styling — it only decides
 * WHERE those already-centralized values get written: inline on the
 * root element via the CSSOM, instead of into a static file on disk.
 *
 * Inline styles set directly on an element always win the cascade over
 * any stylesheet rule targeting that same element, regardless of
 * selector specificity (short of `!important`, which `src/index.css`
 * does not use for these properties) — so this reliably overrides
 * `src/index.css`'s own generated `:root{...}`/`.dark{...}` blocks
 * without needing to remove, disable, or duplicate that stylesheet.
 *
 * Always re-applies the FULL root declaration set first, then layers
 * the dark-mode overrides on top only when `resolvedTheme === 'dark'`
 * — exactly mirroring the static CSS's own `:root` then `.dark`
 * cascade. This makes the function idempotent and order-independent:
 * calling it again with a different config or a different resolved
 * theme always leaves the DOM in the correct, fully-consistent state,
 * never a mix of a previous skin's dark overrides bleeding into a new
 * skin's light mode.
 */
export function applyCustomerSkin(config: VoiceForceThemeConfig, resolvedTheme: ResolvedTheme): void {
  const root = document.documentElement;
  // Clear every property either config is capable of emitting FIRST, so
  // a property this config omits truly falls back to the stylesheet
  // default rather than silently keeping a previous skin's value (see
  // the comment above ALL_POSSIBLE_PROPERTY_NAMES).
  for (const name of ALL_POSSIBLE_PROPERTY_NAMES) {
    root.style.removeProperty(name);
  }
  for (const d of generateRootDeclarations(config)) {
    root.style.setProperty(d.name, d.value);
  }
  if (resolvedTheme === 'dark') {
    for (const d of generateDarkDeclarations(config)) {
      root.style.setProperty(d.name, d.value);
    }
  }
}
