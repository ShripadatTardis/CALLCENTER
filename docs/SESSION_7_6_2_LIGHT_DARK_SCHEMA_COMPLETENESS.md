# Session 7.6.2 — Light/Dark Schema Completeness

> **Updated by Session 7.6.3.** §10 "Remaining gaps" below listed four items this session
> intentionally did not fix. Session 7.6.3 closed three of them (Badge text/fill/border, Alert
> border, `--sidebar-border`) and confirmed the fourth (`navigation.item.active`) has no real
> second value to represent — see `docs/SESSION_7_6_3_LIGHT_DARK_COVERAGE_COMPLETION.md` for the
> full record. This file is left otherwise unchanged as the historical record of what 7.6.2 itself
> did.

## 1. Why this session exists

Session 7.7's pre-flight (TASK 1, "read the Session 7.6 round-trip results") found that
`src/theme/schema.ts` and `src/theme/configs/voiceforce.config.ts` — closed in Session 7.6/7.6.1 —
only ever represented VoiceForce's `:root` (light) CSS custom property values. There was no
structural field anywhere in the schema for the real, separately-valued `.dark` overrides defined
in `src/index.css` (lines 56–92).

Dark mode is not a hypothetical future feature: `src/contexts/ThemeContext.tsx` toggles the
`.dark` class on `<html>` based on a real, persisted preference (`localStorage` key
`voiceforce.appearance`), supports `'system'` auto-detection, and **defaults to `'dark'`** when
nothing is stored (`readStoredPreference()` falls back to `'dark'`, and `getSystemTheme()` also
falls back to `'dark'`). `src/pages/Settings.tsx` exposes this as a user-facing toggle. Activating
the theme engine (Session 7.7) against the light-only baseline would have silently dropped every
dark-mode override the first time a user with the dark preference opened the app — a real visual
regression, not a hypothetical one. Per Session 7.7's own STOP CONDITIONS ("a schema/configuration
value cannot reproduce the current presentation"), Session 7.7 was paused and this corrective
session was commissioned instead of proceeding.

## 2. Architecture — one generic, reusable wrapper

Following the exact precedent `scaleOf` set in Session 7.6.1 (one principled generic pattern,
applied everywhere a value can legitimately vary, rather than N one-off special cases),
`src/theme/schema.ts` adds:

```ts
function withAppearance<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({ light: valueSchema, dark: valueSchema });
}
```

This wraps **any** value schema — a single color (`colorValue`) or a whole `surfacePair`
(`{background, foreground}`) — at the point of use. Both `light` and `dark` are **required**: a
config whose light and dark values are genuinely identical states that fact explicitly (the same
value supplied twice), which is honest, not a fabrication, since nothing is invented — only
asserted as equal where that is the real, known state.

`withAppearance` is applied **only** to the specific fields this session confirmed are sourced
from a real `:root`/`.dark` CSS custom property pair (or, for `components.*`, from one of those
same properties at a second schema location). It is **not** applied universally to every color
field in the schema — see §4 for exactly what was left unwrapped, and why.

No existing primitive (`surfacePair`, `colorValue`, `semanticStatusRole`) had its own internal
shape changed. Only the schema's field *declarations* changed, e.g.:

```ts
// before:
base: surfacePair,
// after:
base: withAppearance(surfacePair),
```

This keeps the schema's semantic organization (field names, nesting, meaning of each field)
identical to Session 7.6.1 — only the leaf type at specific paths gained a light/dark axis.

## 3. Fields wrapped with `withAppearance`, and their real `:root`/`.dark` source

Every value below is the real literal from `src/index.css` — none invented.

| Schema path | CSS source | Light | Dark |
|---|---|---|---|
| `color.surfaces.base.{background,foreground}` | `--background` / `--foreground` | `hsl(210 20% 98%)` / `hsl(222.2 84% 4.9%)` | `hsl(222.2 84% 4.9%)` / `hsl(210 40% 98%)` |
| `color.surfaces.raised.{background,foreground}` | `--card` / `--card-foreground` | `hsl(0 0% 100%)` / `hsl(222.2 84% 4.9%)` | `hsl(222.2 84% 4.9%)` / `hsl(210 40% 98%)` |
| `color.surfaces.overlay.{background,foreground}` | `--popover` / `--popover-foreground` | same as `raised` | same as `raised` |
| `color.surfaces.interactiveSubtle.{background,foreground}` | `--accent` / `--accent-foreground` | `hsl(210 40% 96.1%)` / `hsl(222.2 47.4% 11.2%)` | `hsl(217.2 32.6% 17.5%)` / `hsl(210 40% 98%)` |
| `color.surfaces.sidebar.{background,foreground}` | `--sidebar-background` / `--sidebar-foreground` | `hsl(0 0% 98%)` / `hsl(240 5.3% 26.1%)` | `hsl(222.2 47.4% 11.2%)` / `hsl(210 40% 98%)` |
| `color.roles.primary.{background,foreground}` | `--primary` / `--primary-foreground` | `hsl(222.2 47.4% 11.2%)` / `hsl(210 40% 98%)` | `hsl(210 40% 98%)` / `hsl(222.2 47.4% 11.2%)` |
| `color.roles.secondary.{background,foreground}` | `--secondary` / `--secondary-foreground` | `hsl(210 40% 96.1%)` / `hsl(222.2 47.4% 11.2%)` | `hsl(217.2 32.6% 17.5%)` / `hsl(210 40% 98%)` |
| `color.roles.muted.{background,foreground}` | `--muted` / `--muted-foreground` | `hsl(210 40% 96.1%)` / `hsl(215.4 16.3% 46.9%)` | `hsl(217.2 32.6% 17.5%)` / `hsl(215 20.2% 65.1%)` |
| `color.semantic.negative.solid.{background,foreground}` | `--destructive` / `--destructive-foreground` | `hsl(0 84.2% 60.2%)` / `hsl(210 40% 98%)` | `hsl(0 62.8% 30.6%)` / `hsl(210 40% 98%)` (foreground unchanged) |
| `borders.default.color` | `--border` | `hsl(214.3 31.8% 91.4%)` | `hsl(217.2 32.6% 17.5%)` |
| `borders.field.color` | `--input` | `hsl(214.3 31.8% 91.4%)` (= `--border`) | `hsl(217.2 32.6% 17.5%)` (= `--border`) |
| `components.input.focusBorder` | `--ring` | `hsl(222.2 84% 4.9%)` | `hsl(212.7 26.8% 83.9%)` |
| `components.input.defaultBorder` | `--border` | same as `borders.default.color` | same as `borders.default.color` |
| `components.input.filledText` | `--foreground` | same as `color.surfaces.base.foreground` | same as `color.surfaces.base.foreground` |
| `components.input.disabledBackground` | `--background` | same as `color.surfaces.base.background` | same as `color.surfaces.base.background` |
| `components.table.headerBackground` | `--card` | same as `color.surfaces.raised.background` | same as `color.surfaces.raised.background` |
| `components.table.headerText` | `--muted-foreground` | same as `color.roles.muted.foreground` | same as `color.roles.muted.foreground` |
| `components.table.rowHoverBackground` | `--muted` @ `/50` opacity | `hsl(210 40% 96.1% / 0.5)` | `hsl(217.2 32.6% 17.5% / 0.5)` |
| `components.table.rowSelectedBackground` | `--muted` | same as `color.roles.muted.background` | same as `color.roles.muted.background` |
| `components.button.variants.primary` | `--primary` / `--primary-foreground` | same as `color.roles.primary` | same as `color.roles.primary` |
| `components.button.variants.secondary` | `--secondary` / `--secondary-foreground` | same as `color.roles.secondary` | same as `color.roles.secondary` |
| `components.button.variants.danger` | `--destructive` / `--destructive-foreground` | same as `color.semantic.negative.solid` | same as `color.semantic.negative.solid` |
| `components.button.variants.quiet.foreground` | `--primary` | `hsl(222.2 47.4% 11.2%)` | `hsl(210 40% 98%)` |
| `navigation.item.defaultForeground` | `--sidebar-foreground` @ `/60` opacity | `hsl(240 5.3% 26.1% / 0.6)` | `hsl(210 40% 98% / 0.6)` |
| `navigation.item.hover.{background,foreground}` | `--sidebar-accent` / `--sidebar-foreground` | `hsl(240 4.8% 95.9%)` / `hsl(240 5.3% 26.1%)` | `hsl(217.2 32.6% 17.5%)` / `hsl(210 40% 98%)` |
| `components.alert.variants.default.{background,foreground}` | `--background` / `--foreground` | same as `color.surfaces.base` | same as `color.surfaces.base` |
| `components.alert.variants.destructive.{background,foreground}` | `--background` / `--destructive` | `hsl(210 20% 98%)` / `hsl(0 84.2% 60.2%)` | `hsl(222.2 84% 4.9%)` / `hsl(0 62.8% 30.6%)` |

`color.semantic.positive.solid` and `color.semantic.caution.solid` are also now `withAppearance`-
shaped for structural consistency with `negative.solid` (all three share the same
`semanticStatusRole` type), but carry **honestly identical** light/dark values — VoiceForce has no
real "solid positive"/"solid caution" component today (same caveat Session 7.6.1 already
documented), so there is no second real value to assert; this is explicitly commented in
`voiceforce.config.ts`, not a silent duplication.

## 4. Fields deliberately left unwrapped — not a `:root`/`.dark` CSS custom property pair

Per the explicit scope ("every visual property that currently differs between `:root` and
`.dark`"), the following are **not** wrapped, because they are not sourced from a CSS custom
property with a confirmed `.dark` override:

- `navigation.item.active` — a hardcoded Tailwind utility color (`bg-cyan-600 text-white`), not a
  `--sidebar-*` or other custom property. No confirmed second value was found for this exact
  state.
- `color.interactive.action` (the cyan interactive scale) — already uses the Session 7.6.1
  default+variants mechanism, with named variants like `linkTextDark` (cyan-400) and `textStrong`
  (cyan-800) that already capture some dark-context usages distinctly. These are real but
  *separate* Tailwind colors used in different contexts, not a `{light, dark}` pair for the *same*
  semantic slot — restructuring this into `withAppearance` would require re-deriving which
  variant corresponds to which mode for every call site, which is out of this session's scope.
- `components.badge.variants.*` (`positive`/`caution`/`negative` text+fill) — **known, documented
  gap, not fixed this session.** `src/components/ui/badge.tsx` genuinely has distinct `dark:`
  Tailwind utility classes (e.g. `text-red-700` light vs. `dark:text-red-400` dark for the
  `negative` variant; similarly for `caution`/`positive`). This is a real light/dark difference,
  but it is a **component-level Tailwind `dark:` variant**, not a `:root`/`.dark` CSS custom
  property — a structurally different kind of dual-value than this session's scope (which was
  bounded to the `:root`/`.dark` CSS custom property pair). Fixing it would mean extending
  `semanticStatusRole.text`/`.fill` with `withAppearance` too, which is a reasonable, mechanically
  identical follow-up but was not requested and risked scope creep beyond "preserve the existing
  semantic schema organization."
- `components.alert.variants.default`/`destructive` border color — `alert.tsx` also has a real
  `dark:border-destructive` class (dropping the `/50` opacity modifier present in light mode).
  The schema has no `border` field on `alertComponent` at all (same as before this session) — out
  of scope for the same reason as above.
- Sidebar navigation chrome beyond `hover`/`defaultForeground`/`active`: `--sidebar-accent-
  foreground`, `--sidebar-border`, `--sidebar-ring`, `--sidebar-primary`, `--sidebar-primary-
  foreground` are real CSS custom properties with real `.dark` overrides, and are genuinely
  consumed by `src/components/layout/Sidebar.tsx` / `src/components/ui/sidebar.tsx` (confirmed via
  grep) — but **no schema field exists for any of them at all**, in either appearance mode. This
  is a pre-existing structural coverage gap from Session 7.6.1, orthogonal to light/dark (the gap
  exists identically in both modes), and is explicitly out of scope for a light/dark-completeness
  session. Flagged here so it is not mistaken for something this session silently fixed or missed.

None of the above were silently dropped — each is explicitly commented at its schema location (or
listed here) as intentionally unwrapped, with the reason.

## 5. Interaction with `ThemeContext.tsx` — reviewed, unchanged

`ThemeContext.tsx` toggles only the `.dark` class on `document.documentElement` and persists a
`'light' | 'dark' | 'system'` preference; it has no awareness of `src/theme/*` and was not
imported, read from, or modified by this session. The new schema shape is additive data only — it
does not require or assume any change to how `.dark` gets toggled. When Session 7.7 (or a future
session) activates the theme engine, the natural integration point is unchanged: whichever
mechanism generates CSS custom properties from the config would need to emit both the `:root` and
`.dark` blocks from the `light`/`dark` halves of each `withAppearance`-wrapped field — `
ThemeContext` itself still only flips the `.dark` class, exactly as today. This session makes that
future integration *possible without data loss*; it does not perform the integration (Session 7.7
remains paused).

## 6. Round-trip verification

`.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` was extended with:

- Section 1D: 21 new `REPRODUCED`/`PASS` checks — the real `.dark` CSS custom property value for
  every field checked in light mode in section 1, plus a structural check that `--border`/`--input`
  remain equal to each other in both modes.
- Section 1E: 13 new checks — the same underlying CSS custom properties verified again at their
  `components.*`/`navigation.*` schema locations, plus a check confirming `navigation.item.active`
  remains intentionally un-wrapped.

**Result: 75 passed, 0 failed** (up from the Session 7.6.1 baseline of 40 passed — all 40 original
checks still pass unchanged, plus 35 new light/dark checks).

`voiceForceThemeConfigSchema.safeParse(voiceforceBaselineConfig).success === true` — the config is
still a complete, valid `VoiceForceThemeConfig` instance with the new shape.

## 7. Verification commands run

```
npm run typecheck   → clean (tsconfig.app.json, tsconfig.node.json, tsconfig.api.json)
npm run verify:full → exit 0 (includes the 75/75 round-trip script above)
```

## 8. Files changed

- `src/theme/schema.ts` — added `withAppearance<T>()`; applied it to the fields listed in §3;
  updated doc comments.
- `src/theme/configs/voiceforce.config.ts` — populated the real `.dark` value alongside every
  already-verified `:root` (light) value for each wrapped field.
- `.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` — extended per §6.
- `docs/SESSION_7_6_2_LIGHT_DARK_SCHEMA_COMPLETENESS.md` — this file.

**Not touched** (per explicit constraint): `src/index.css`, `tailwind.config.ts`,
`src/contexts/ThemeContext.tsx`, `src/pages/Settings.tsx`, any existing screen or shared UI
component.

## 9. Acceptance checklist

- ✅ One universal configuration schema (no VoiceForce- or KATON-specific structure added;
  `withAppearance` is as generic as `scaleOf`).
- ✅ Complete VoiceForce light/dark representation for every field sourced from a `:root`/`.dark`
  CSS custom property pair.
- ✅ Exact round-trip reproduction in both modes (75/75).
- ✅ Zero fabricated colors or values — every `dark` value is the real literal from
  `src/index.css`'s `.dark` block; the three honestly-identical placeholders
  (`positive.solid`/`caution.solid`) were already speculative placeholders before this session and
  remain explicitly flagged as such.
- ✅ Zero unexplained omissions — §4 names and explains every field this session did not wrap.
- ✅ Existing dark-mode default preserved — nothing in `ThemeContext.tsx` changed.
- ✅ Existing appearance preference behavior preserved — unchanged file.
- ✅ No new theme-switching mechanism introduced.

## 10. Remaining gaps (for a future session, not this one)

1. `components.badge.variants.*` text/fill have real `dark:` Tailwind differences, not yet
   represented (§4).
2. `components.alert.variants.*` border color (a real `dark:border-destructive` opacity change)
   has no schema field at all, in either mode.
3. `--sidebar-accent-foreground` / `--sidebar-border` / `--sidebar-ring` / `--sidebar-primary*` are
   real, consumed CSS custom properties with no schema field at all (pre-existing, orthogonal to
   light/dark).
4. `navigation.item.active` has no confirmed second (dark-mode) value — if one is later found, it
   should become `withAppearance`-wrapped using the same mechanism added here.

None of these block Session 7.7's resumption on the fields it specifically named in its own task
list (Dashboard, Call Logs, Live View, Campaigns, QA Review, Automated QA, QA Calibration,
Analytics, User Management, Settings, navigation default/hover/selected/focus) — they are
pre-existing, narrower gaps to flag during Session 7.7's own verification pass, not to silently
carry forward as if resolved.

## Status

Session 7.6.2 complete. **Not committed** — left for review, per instruction. Session 7.7 remains
paused; the theme engine has not been activated. KATON values were not introduced. No deployment
was performed.
