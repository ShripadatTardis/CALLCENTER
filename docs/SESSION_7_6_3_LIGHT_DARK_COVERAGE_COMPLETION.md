# Session 7.6.3 — Complete Light/Dark Configuration Coverage

## 1. Objective

Close the remaining known configuration gaps §10 of
`docs/SESSION_7_6_2_LIGHT_DARK_SCHEMA_COMPLETENESS.md` flagged, before Session 7.7 resumes and
activates the centralized theme engine:

1. Badge light/dark text, fill and border.
2. Alert light/dark border and opacity difference.
3. Missing, consumed sidebar CSS properties.
4. Confirm `navigation.item.active` is preserved exactly (no invented dark value).

## 2. Badge — text, fill, border (all three, all three variants)

`src/components/ui/badge.tsx`'s `escalated`/`warning`/`positive` variants (the real source of
`color.semantic.negative`/`caution`/`positive`, and `components.badge.variants.*`) each carry real
`dark:` Tailwind classes:

```
escalated:  border-red-600/40 bg-red-500/10 text-red-700
            dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400
warning:    border-amber-600/50 bg-amber-500/10 text-amber-700
            dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400
positive:   border-emerald-600/40 bg-emerald-500/10 text-emerald-700
            dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400
```

`semanticStatusRole.text`/`.fill` (previously plain `colorValue`) are now `withAppearance
(colorValue)`; a new optional `border: withAppearance(colorValue).optional()` field was added to
the same role. `badgeComponent.variants.*`'s `.pick({...})` was extended to include `border`.

| Variant | Field | Light (Tailwind shade → real value) | Dark |
|---|---|---|---|
| negative (`escalated`) | text | red-700 → `rgb(185 28 28)` | red-400 → `rgb(248 113 113)` |
| negative | fill | red-500/10 → `rgb(239 68 68 / 0.1)` | unchanged |
| negative | border | red-600/40 → `rgb(220 38 38 / 0.4)` | red-500/40 → `rgb(239 68 68 / 0.4)` |
| caution (`warning`) | text | amber-700 → `rgb(180 83 9)` | amber-400 → `rgb(251 191 36)` |
| caution | fill | amber-500/10 → `rgb(245 158 11 / 0.1)` | unchanged |
| caution | border | amber-600/50 → `rgb(217 119 6 / 0.5)` | amber-500/40 → `rgb(245 158 11 / 0.4)` |
| positive | text | emerald-700 → `rgb(4 120 87)` | emerald-400 → `rgb(52 211 153)` |
| positive | fill | emerald-500/10 → `rgb(16 185 129 / 0.1)` | unchanged |
| positive | border | emerald-600/40 → `rgb(5 150 105 / 0.4)` | emerald-500/40 → `rgb(16 185 129 / 0.4)` |

Hex→rgb conversions use Tailwind's own published shade values (same convention Session 7.6.1 used
for `color.interactive.action`'s cyan scale) — none invented. `fill` is unchanged by mode for all
three variants, which is itself the real, confirmed current behavior (Badge's `dark:bg-*` class is
identical to its light `bg-*` class in every variant) — not an omission.

Updated in both `color.semantic.{positive,negative,caution}` and `components.badge.variants.*`
(the latter is, per the pre-existing convention, a `.pick()` of the same role shape, duplicated at
its own schema path rather than referenced — unchanged by this session).

## 3. Alert — border and opacity

`src/components/ui/alert.tsx`:

```
default:     bg-background text-foreground                         (no border override)
destructive: border-destructive/50 text-destructive dark:border-destructive
```

The `destructive` variant has a real border color, and that border's **opacity itself changes**
between modes — light uses `/50`, dark drops the opacity modifier entirely (full-strength
`--destructive`). The `default` variant has no explicit border class at all in either mode — it
inherits the component's own `border` utility, i.e. `borders.default.color`. This is the honest,
confirmed current state, not an omission.

A new `alertSurfacePair = surfacePair.extend({ border: colorValue.optional() })` type was added,
and `alertComponent.variants.{default,destructive}` now use `withAppearance(alertSurfacePair)`
instead of `withAppearance(surfacePair)`.

| Variant | Field | Light | Dark |
|---|---|---|---|
| destructive | border | `hsl(0 84.2% 60.2% / 0.5)` (`--destructive` @ 50%) | `hsl(0 62.8% 30.6%)` (`--destructive`, full opacity) |
| default | border | unset (inherits `borders.default.color`) | unset (inherits `borders.default.color`) |

## 4. Sidebar — missing, consumed CSS properties

Re-investigated every `--sidebar-*` custom property against actual component usage (not just
presence in `src/index.css`):

| CSS property | Consumed by | Action |
|---|---|---|
| `--sidebar-border` | **`src/components/layout/Sidebar.tsx`** (lines 75, 128, 130 — rail/panel/divider borders) — the real, rendered app sidebar | **Added.** `color.surfaces.sidebar` extended with an optional `border` field (`surfacePair.extend({border: colorValue.optional()})`, wrapped with `withAppearance`). Light `hsl(220 13% 91%)`, dark `hsl(217.2 32.6% 17.5%)` — both real literals from `src/index.css`. |
| `--sidebar-accent-foreground` | only `src/components/ui/sidebar.tsx` | **Not added.** | 
| `--sidebar-ring` | only `src/components/ui/sidebar.tsx` | **Not added.** |
| `--sidebar-primary` | only `src/components/ui/sidebar.tsx` | **Not added.** |
| `--sidebar-primary-foreground` | only `src/components/ui/sidebar.tsx` | **Not added.** |

`src/components/ui/sidebar.tsx` (the generic shadcn sidebar primitive — `SidebarProvider`,
`SidebarMenuButton`, etc.) is confirmed, by grep, to have **zero importers anywhere in `src/`**.
It is dead code. The four properties above are real CSS custom properties with real `.dark`
overrides, but nothing in the running application renders anything that reads them. Adding schema
fields for them would be fabrication relative to "what the app currently presents," not extraction
— per task 5's explicit instruction ("extract actual values from the repository, no inferred or
fabricated design values"), they are correctly left unrepresented. This is unchanged from Session
7.6.2's assessment; this session only re-confirmed it with the component-usage grep before
deciding, rather than taking the earlier assessment on faith.

## 5. Navigation active/selected — confirmed, preserved exactly

Re-read `src/components/layout/Sidebar.tsx` in full. There are in fact **three** visually distinct
"active" states in the real component:

1. **Icon-rail active pillar button** (line 99–104): `isActive ? 'bg-cyan-600 text-white' : ...` —
   no `dark:` variant at all. This is the state `navigation.item.active` already models
   (`{background: '#0891B2', foreground: 'rgb(255 255 255)'}`). **Confirmed unchanged: no real
   dark value exists for this exact state.** Left exactly as-is, per task 4's explicit instruction
   not to invent one.
2. **Accordion pillar-heading active state** (line 161): `isPillarActive ? 'text-cyan-500
   dark:text-cyan-400' : ...` — a real, different light/dark text color.
3. **Active expanded-menu-item state** (line 179): `isActive ? 'bg-sidebar-accent text-cyan-600
   dark:text-cyan-300 font-medium' : ...` — background tracks `--sidebar-accent` (already
   appearance-aware via `navigation.item.hover`, coincidentally the same CSS property), and text
   is a real, different light/dark cyan shade.

States 2 and 3 are real, additional active-state presentations this investigation surfaced that
are **not** currently represented by any schema field (distinct from state 1, which `navigation.
item.active` already covers correctly). Task 4 scoped this session to *preserving* the
already-represented active state exactly, not to discovering and modeling new ones — adding new
schema structure for states 2/3 was not requested and risks scope creep the session's own
constraints warn against ("do not modify... screens or shared components" implies the
investigation should inform documentation, not open-ended schema expansion). **These are flagged
here, explicitly, as a known, unrepresented gap — not silently fixed, not silently dropped.** If a
future session wants to model them, the mechanism is the same `withAppearance` wrapper used
throughout this and the prior session.

## 6. Schema organization

No field was renamed, moved, or removed. `withAppearance` is now applied to two additional
structural shapes beyond Session 7.6.2's set (`semanticStatusRole.text`/`.fill`/new `.border`, and
the new `alertSurfacePair`/`sidebar`-with-`border` extension) — using the exact same generic
wrapper, not a new mechanism. The schema remains a single, universal, customer-independent
definition: nothing added in this session is VoiceForce-specific or KATON-specific in name or
structure (per task 6).

## 7. Round-trip verification

`.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` section 1F added 13 new checks:
Badge text/fill/border in both modes for all three variants (8 checks, with one checking fill is
genuinely unchanged by mode and one checking `components.badge` mirrors `color.semantic`), Alert
destructive border in both modes plus a check that `default`'s border remains correctly unset (3
checks), and `--sidebar-border` in both modes (2 checks).

**Result: 88 passed, 0 failed** (up from Session 7.6.2's 75 — all 75 prior checks still pass
unchanged, plus 13 new).

## 8. Verification commands run

```
npm run typecheck   → clean (tsconfig.app.json, tsconfig.node.json, tsconfig.api.json)
npm run verify:full → exit 0 (includes the 88/88 round-trip script above)
```

## 9. Files changed

- `src/theme/schema.ts` — `semanticStatusRole.text`/`.fill` wrapped; new optional `.border` field
  added; `badgeComponent.variants.*` pick extended to include `border`; new `alertSurfacePair`
  type; `alertComponent.variants.{default,destructive}` now use it; `colorSurfaces.sidebar` extended
  with an optional `border` field.
- `src/theme/configs/voiceforce.config.ts` — real light/dark values populated for every field
  above.
- `.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` — section 1F added (13 checks).
- `docs/SESSION_7_6_2_LIGHT_DARK_SCHEMA_COMPLETENESS.md` — superseded-by notice added at the top;
  body otherwise left as the historical record of that session.
- `docs/SESSION_7_6_3_LIGHT_DARK_COVERAGE_COMPLETION.md` — this file.

**Not touched** (per explicit constraint): `src/index.css`, `tailwind.config.ts`,
`src/contexts/ThemeContext.tsx`, `src/pages/Settings.tsx`, any existing screen or shared UI
component (including the unused `src/components/ui/sidebar.tsx`, left as-is).

## 10. Acceptance checklist

- ✅ Badge light/dark text, background (fill) and border — all represented, all three variants.
- ✅ Alert light/dark border and opacity difference — represented; `default`'s absence of a border
  override is itself honestly represented as unset.
- ✅ All existing, consumed sidebar CSS properties — `--sidebar-border` added; the four properties
  confirmed to have zero consumers were correctly not added (§4).
- ✅ Navigation active/selected styling preserved exactly — `navigation.item.active` unchanged; no
  dark value invented.
- ✅ Every value extracted from the real repository (badge.tsx, alert.tsx, index.css, and a fresh
  grep confirming sidebar.tsx's import status) — none inferred or fabricated.
- ✅ Same universal semantic schema for VoiceForce/KATON/future customers — no customer-specific
  field introduced.
- ✅ Exact round-trip verification passes (88/88).
- ✅ No unexplained omitted properties — §4 and §5 name and explain every property this session
  did not add.
- ✅ No visual or functional change — `src/index.css`, `tailwind.config.ts`, every screen and
  shared component, `ThemeContext.tsx`, `Settings.tsx` all untouched.

## 11. Remaining gaps (for a future session, not this one)

1. Accordion pillar-heading active-state text color (`text-cyan-500 dark:text-cyan-400`) — real,
   not yet represented (§5, state 2).
2. Active expanded-menu-item text color (`text-cyan-600 dark:text-cyan-300`) — real, not yet
   represented (§5, state 3); its background half (`--sidebar-accent`) is already covered via
   `navigation.item.hover`.
3. `--sidebar-accent-foreground`/`--sidebar-ring`/`--sidebar-primary`/`--sidebar-primary-
   foreground` remain unrepresented — correctly, since nothing in the running app consumes them
   (§4). If `src/components/ui/sidebar.tsx` is ever wired into the app, this would need revisiting.

## Status

Session 7.6.3 complete. **Not committed** — left for review, per instruction. Session 7.7 remains
paused; Session 7.7 Task 2 was not started; the theme engine has not been activated. KATON values
were not introduced. No deployment was performed.
