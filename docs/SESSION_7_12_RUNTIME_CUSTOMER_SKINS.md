# Session 7.12 — Runtime Customer Skin Selection

## Objective

A working demonstration of runtime customer-specific UI skins, built
entirely on the completed Sessions 7.3–7.11 theme architecture. An
Administrator-only **Demo Skin Selector** switches the whole app's
appearance instantly, with no rebuild and no page reload, while
preserving independent Light/Dark/System preferences per skin and
persisting the selected skin across refresh/navigation.

## Architecture — reuse, not duplication

The build-time generator (`.tooling/scripts/generate-theme-css.mjs`,
Session 7.7+) already reduces a customer config
(`src/theme/configs/voiceforce.config.ts` /
`src/theme/configs/katon.config.ts`, both `VoiceForceThemeConfig`) to a
flat list of CSS custom property declarations via two pure functions in
`src/theme/generateCssVariables.ts`: `generateRootDeclarations` and
`generateDarkDeclarations`. This session adds **zero** new color,
dimension, or typography values anywhere — it only adds a new place
those same two functions get called from.

- **`src/theme/customerConfigs.ts`** (new) — a small lookup map
  (`CUSTOMER_SKIN_CONFIGS: Record<'voiceforce' | 'katon', VoiceForceThemeConfig>`)
  re-exporting the existing `voiceforceBaselineConfig`/`katonConfig`
  objects under stable keys, mirroring the build script's own `CONFIGS`
  map in shape (kept as a separate file since the script is a Node-only
  build tool, not something a browser bundle should import).
- **`src/theme/applyCustomerSkin.ts`** (new) — `applyCustomerSkin(config, resolvedTheme)`
  calls `generateRootDeclarations`/`generateDarkDeclarations` and writes
  each declaration onto `document.documentElement` via
  `style.setProperty`. Inline styles on the root element always win the
  cascade over `src/index.css`'s own generated `:root{...}`/`.dark{...}`
  blocks (short of `!important`, which that file never uses for these
  properties), so this reliably overrides the static stylesheet without
  removing, disabling, or duplicating it.
- **`src/contexts/CustomerSkinContext.tsx`** / **`customerSkinContextObject.ts`**
  / **`src/hooks/useCustomerSkin.ts`** (new) — a `CustomerSkinProvider`
  holding the selected skin, mounted inside `ThemeProvider` (it needs
  `resolvedTheme` to know which half of a skin's declarations to apply)
  and outside everything else, in `src/main.tsx`.
- **`src/pages/Settings.tsx`** — one new, Administrator-gated card in
  the existing Appearance tab, reusing the exact same `ToggleGroup`
  visual pattern the existing Light/Dark/System control already uses.

## Independent Light/Dark/System per skin

`ThemeContext` (Session 7.x) is **unchanged** — its public contract
(`preference`/`resolvedTheme`/`setPreference`) is untouched, and every
existing consumer keeps working exactly as before. `CustomerSkinContext`
sits alongside it and keeps its own small map in `localStorage`
(`voiceforce.demoSkin.appearanceBySkin`, `{voiceforce: 'dark', katon: 'light', ...}`):

- Whenever the current skin's appearance preference settles (including
  the very first time a skin is ever seen, capturing whatever the
  global preference already was), it's written into that skin's own
  slot.
- Whenever the user switches skins, the new skin's own last-recorded
  preference (if any) is restored via `ThemeContext`'s existing
  `setPreference` — never by reimplementing appearance logic.

This is what makes "VoiceForce → Dark, KATON → Light" genuinely
independent rather than one shared global value the most recent skin
switch silently overwrites — verified live (see Browser Verification
below): switching VoiceForce→Dark, KATON→Light, back to VoiceForce
correctly restored Dark; back to KATON correctly restored Light.

## Persistence

The selected skin itself persists via a separate `localStorage` key
(`voiceforce.demoSkin`), read on mount and re-applied by
`CustomerSkinProvider`'s effect. Verified live across both an in-app
route navigation and a full hard page reload — the skin was correctly
restored both times, including after closing and reopening the tab.
There is a brief flash on a hard refresh when the persisted skin
differs from the static baked `src/index.css` default (VoiceForce) — a
disclosed, acceptable tradeoff for a demo feature (see "Known
limitations" below), consistent with this app's own existing dark/light
flash tradeoff (`ThemeProvider` itself only applies via `useEffect`
after an inline bootstrap script in `index.html` handles just the
`.dark` class — this session did not duplicate that bootstrap mechanism
for the full ~100-property skin swap, which would require embedding the
theme config data directly into `index.html`).

## Naming

The selector displays **"VoiceForce"** and **"Azure"** — not "KATON".
Per explicit instruction, the selector's user-facing label is a
color-based name, not the internal customer/config name: "Azure" is
KATON's own real, documented primary action color (`#0A67C7`,
`color.roles.primary`, "Buttons, links"), chosen because it's clearly
distinct from VoiceForce's cyan interactive accent used pervasively
throughout this app. The underlying technical key (`katon`, the
filename, the schema's internal customer id, and every existing
test/doc/script reference from Sessions 7.3–7.11) is **unchanged** —
renaming the established config identifier itself would be a much
larger, unrelated migration, out of this session's scope.

## Presentation-only — guardrails honored

`CustomerSkinContext` holds nothing but a string (`skin`) and a setter.
Nothing in this session's code reads or writes authentication, tenant
identity, permissions, business data, API routing, or Business Data
Scope — confirmed by inspection: no new file imports `AuthContext`
except `Settings.tsx` itself (for the Administrator visibility check
only, which reads `user.roles`, never writes anything), no new file
makes an API call, and `applyCustomerSkin` only ever touches
`document.documentElement.style`. Switching skins never triggers a
request to any backend.

Access gating uses `user?.roles?.includes('administrator')` —
deliberately the real assigned `roles` array, never the legacy-compat
`role` string (`src/types/auth.ts`'s own comment: "`role`... kept ONLY
so pre-existing `x-user-role` header-forwarding call sites... keep
working... never used for any new authorization decision"). This is a
UI-visibility gate only, proportionate to a presentation-only demo
feature with no data-access implication — no new server-side permission
was added or needed.

## A real bug found and fixed during browser verification

Live-testing surfaced a genuine, pre-existing latent gap in the shared
theme generator, not a bug in this session's own new code paths:
switching to the Azure/KATON skin left the sidebar overlay's selected
nav item showing low-contrast cyan text (VoiceForce's own
`--nav-item-active-text` value) against KATON's pale-blue active
background — nearly unreadable, reported by the user as "shows a
shadow and we cannot see the selected menu option."

**Root cause**: `navigation.item.expandedActiveText`/`headingActiveText`
are optional schema fields; KATON's config deliberately omits both ("no
distinct secondary active-text treatment is documented"). The generator
(`navActiveTextDeclarations` in `generateCssVariables.ts`) previously
omitted the corresponding CSS custom properties entirely when a config
didn't define them. This was invisible for a **static**, single-customer
build (an omitted property for a KATON-only generated `index.css` just
never existed, so the consuming `text-[var(--x)]` class fell back to
its CSS-inherited color) but became visible the moment **runtime**
switching made it possible to view KATON's sidebar directly: the
property kept whatever VoiceForce's own committed `src/index.css`
already had baked in for it, since nothing — neither the stylesheet nor
any inline override — ever cleared it.

**Fix, in two parts**:
1. `src/theme/applyCustomerSkin.ts` now first clears (`removeProperty`)
   every CSS custom property name either config is capable of emitting,
   before writing the new config's actual declarations — so a property
   the new skin genuinely doesn't define correctly falls back to the
   stylesheet default, never silently inherits a previous skin's value.
2. `src/theme/generateCssVariables.ts`'s `navActiveTextDeclarations`
   now falls back to the always-required `navigation.item.active.foreground`
   (the one color every config MUST define for exactly this semantic
   purpose) instead of omitting the property outright. This is a real
   fix to the **shared** generator, used by both the static build script
   and this session's runtime reuse — confirmed via `verify:full`'s own
   "no diff from the committed baseline" test that VoiceForce's
   generated output is byte-for-byte unchanged (VoiceForce defines both
   fields, so the new fallback branch never triggers for it).

Re-verified live after the fix: the selected nav item now shows crisp
navy text (`#121B54`, KATON's own `active.foreground`) on the pale-blue
active background — confirmed via a zoomed screenshot.

## Browser verification (all on the local dev server, real production data)

- **VoiceForce ↔ Azure switching**: instant, no reload, confirmed on
  Settings (both skins), Dashboard, Call Logs (via sidebar navigation),
  Outbound Campaigns, Chat Logs, AI Agents, and QA Review (Interaction
  Quality) — every screen re-themed correctly with no visual artifacts.
- **Light/Dark independence per skin**: VoiceForce set to Dark, switched
  to Azure, set Azure to Light, switched back to VoiceForce (correctly
  restored Dark), switched back to Azure (correctly restored Light) —
  all confirmed live, screenshotted at each step.
- **Persistence across navigation and full reload**: confirmed via both
  an in-app route change and a hard page navigation/reload — skin
  selection and the active skin's remembered appearance both survived.
- **Nav-highlight bug**: found, fixed, and re-verified (see above).
- **Console**: checked after every navigation/switch throughout this
  session — zero errors from this feature's code at any point (one
  unrelated browser-extension exception observed once, not from this
  application).
- `npm run typecheck` — clean (all 3 tsconfigs).
- `npm run verify:full` — all green, 0 failures (the one `FAIL:` string
  in the output is the pre-existing, expected negative-test for an
  unknown customer theme configuration). Confirmed the committed
  `src/index.css` baseline is byte-for-byte unchanged by this session's
  `generateCssVariables.ts` fix.

## Centralized UI compliance

No new design tokens. No hardcoded customer styling — every value the
Demo Skin Selector can apply comes from the existing
`voiceforceBaselineConfig`/`katonConfig` objects via the existing
generator functions, unchanged except for the one documented fallback
fix above (which itself reuses an existing, always-present config
field, not a new literal). No component was duplicated — `Settings.tsx`
reuses the exact same `ToggleGroup`/`Label`/card recipe its own
Appearance section already established. No customer-name conditional
was introduced in any component — the selector is purely data-driven
off `CUSTOMER_SKIN_CONFIGS`/`CUSTOMER_SKIN_LABELS`.

## Known limitations

- A hard page refresh when the persisted skin differs from the static
  `src/index.css` default (VoiceForce) shows a brief flash of VoiceForce
  before the React app mounts and `CustomerSkinProvider`'s effect
  applies the persisted skin. Not eliminated, since doing so would
  require duplicating the full theme config into `index.html`'s
  blocking bootstrap script (the same tradeoff this app's own existing
  dark/light bootstrap makes a narrower version of, for a single class
  toggle rather than ~100 properties) — judged disproportionate for an
  explicitly-labeled demo feature.
- Only two customer skins exist in the schema today (VoiceForce, KATON/
  "Azure") — the selector is written generically against
  `CUSTOMER_SKIN_CONFIGS`'s keys, so a third config would appear
  automatically if one is ever added to that map, but this was not
  separately tested since no third config exists.
- The `--nav-item-active-text`/`--nav-heading-active-text` fallback fix
  in `generateCssVariables.ts` was verified visually (zoomed screenshot
  confirming legible contrast) but contrast ratio was not computed
  numerically; it reuses KATON's own documented `active.foreground`
  (`#121B54`) against its own documented `active.background` (`#C0DDEE`),
  which is the same pairing KATON's config already uses successfully
  for the rail-icon active state elsewhere in the sidebar.
