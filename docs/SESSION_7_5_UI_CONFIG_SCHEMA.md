# Session 7.5 — Central UI Configuration Schema

**Mode: SCHEMA DESIGN ONLY.** No existing screen, component, CSS file, or Tailwind config was modified. No theme engine exists. Nothing here is consumed by the running application. This session follows the approved scope in §F ("Session 7.5 — Token Schema Design, Full-Property Gap Specification & New-Category Audit") of `docs/SESSION_7_4_CUSTOMER_UI_CONFIGURATION_ROADMAP.md`, itself built on `docs/SESSION_7_3_UI_CENTRALIZATION_AUDIT.md`.

**Revised by Session 7.6.1** (§8 below): the Session 7.6 extraction attempt found this schema's original version could not losslessly represent 7 categories of VoiceForce's real current values. §2-§7 below describe the *original* 7.5 design (kept for history/traceability); §8 is the authoritative, current schema structure and the required VoiceForce→KATON→universal-field mapping table. **Read §8 first if you only want the current state.**

---

## 1. Deliverable

`src/theme/schema.ts` — a Zod schema (already a project dependency, no new package added) defining every configurable visual property of VoiceForce's fixed component inventory, doubling as both the compile-time TypeScript type (`VoiceForceThemeConfig`, via `z.infer`) and the runtime validation surface Session 7.4 §E.2 calls for (`validateThemeConfig()`).

Every field is sourced from one of two places, cited inline in the schema file itself:
- The 7.3 audit's KATON inventory (§B) and Call Centre architecture findings (§C) — cited as "7.3 §X".
- **This session's own fresh audit** of the five areas 7.3 explicitly left unquantified (shadows, cards/panels, charts, navigation styling, per-primitive interaction states) — written up in full below, with file:line evidence, cited in the schema as "7.5 audit".

---

## 2. Schema structure overview (ORIGINAL — superseded by §8)

| Top-level field | Covers | Primary source |
|---|---|---|
| `meta` | Config identity (id/name/version) | New, structural |
| `typography` | Font families, full type ramp | 7.3 §B.1/B.2 |
| `color` | Brand/action (6 roles), neutrals (6 roles), semantic (3 roles × text+fill) | 7.3 §B.3, this session's §3.4 finding |
| `spacing` | Ordered scale steps | 7.3 §B.4 |
| `radii` | tag/control/panel/card/pill | 7.3 §B.4 |
| `borders` | width, focus width, dashed style (generic primitive only) | 7.3 §B.4 |
| `heights` | primary-action/control/form-field/filter-field/top-bar/sidebar-width | 7.3 §B.4 |
| `icons` | library (fixed: lucide), sizes, stroke width | 7.3 §B.4 |
| `shadow` | one elevation value | This session's §3.1 audit |
| `cards` | surface/border/header/padding | This session's §3.2 audit |
| `navigation` | item default/hover/active, top bar, focus ring | This session's §3.4 audit |
| `charts` | series palette, axis/gridline/tooltip | This session's §3.3 audit |
| `breakpoints` | sm/md/lg/xl | New (Tailwind defaults reference) |
| `components` | Button, Input, Table, Badge, Alert variant/state coverage | 7.3 §B.5-B.11, this session's §4 direct verification |

**Explicitly absent, per Session 7.4 decision 3**: no workflow/progress-stage component field exists anywhere in the schema, and no "provenance" (solid/dashed content-origin) axis exists on the Badge component field — both KATON elements have no VoiceForce functional requirement and are not represented even as unused/optional fields. This remains true in the §8 revision too.

---

## 3. Audit of the five previously-unquantified areas

Method: the same `grep`-based, denominator-stated approach the 7.3 audit used throughout, applied fresh to each area below. All counts are real, taken against the current repository state, not estimated.

### 3.1 Shadows

- **No shadow CSS token exists** (confirmed: no `--shadow-*` custom property in `src/index.css`, no `boxShadow` extension in `tailwind.config.ts`).
- **29 files** use a hardcoded Tailwind shadow utility class (`shadow-sm`/`shadow-md`/`shadow-lg`/`shadow-xl`/`shadow-2xl`/`shadow-none`), out of 221 total `.tsx` files.
  - **19 of the 29** are inside `src/components/ui/*` (primitives — dialog, popover, dropdown-menu, etc. — expected and appropriate, elevation is a natural part of an overlay primitive).
  - **10 of the 29** are app-level files applying a shadow directly: `ActionRequiredCard.tsx`, `LoginForm.tsx`, `ChatBubble.tsx` (×2, chat and whatsapp variants), `IndustryIndicator.tsx`, `Sidebar.tsx`, `RatioTrend.tsx`, `Dashboard.tsx`, `Reports.tsx`, `ResetPassword.tsx`.
- **Value distribution** across all 29 files: `shadow-md` (10), `shadow-lg` (10), `shadow-sm` (7), `shadow-xl` (3), `shadow-2xl` (1), `shadow-none` (1) — **KATON's "one shadow only" standard is a real simplification relative to VoiceForce's current 6-value spread**, not merely a documentation convention; VoiceForce's own baseline config (Session 7.6) will need to pick which current value becomes "the" token, which is a real product decision, not a mechanical extraction, flagged explicitly in the schema's `shadow` field comment.

### 3.2 Cards and panels

- `Card`/`CardHeader`/`CardContent` primitives exist (`src/components/ui/card.tsx`) and are imported in **35 files** across `src/pages`/`src/components`.
- **57 files** apply a `bg-card`-styled surface via a raw `<div className="...bg-card...">` rather than the `Card` component.
- **Of those 57, 52 do NOT import `Card` at all** — i.e. 52 separate files hand-roll a card-like surface independently, versus 35 that use the real primitive. (5 files do both — use `Card` in some places and a raw `bg-card` div in others within the same file.)
- Two **parallel, independently-built card-wrapper components** exist outside `components/ui/card.tsx` entirely: `src/components/interaction-detail/SectionCard.tsx` and `CollapsibleSectionCard.tsx` — these are reusable, but they are a second card abstraction, not the design-system primitive, meaning "card" styling in this codebase currently has **three** parallel implementations (the real `Card` primitive, the `SectionCard` family, and ad hoc raw divs), not one.

### 3.3 Charts

- `src/components/ui/chart.tsx` (a Recharts wrapper, `ChartContainer`/`ChartConfig`) exists as the design-system chart primitive.
- Exactly **3 files** render charts: `src/components/analytics/ChatAnalyticsTab.tsx`, `src/components/analytics/VoiceAnalyticsTab.tsx`, `src/components/ratios/RatioTrend.tsx`.
- **0 of the 3 import the shared chart primitive** — all three import directly from `recharts`, bypassing `components/ui/chart.tsx` entirely (confirmed via import-statement inspection, not just usage pattern).
- **2 of the 3** (`ChatAnalyticsTab.tsx`, `VoiceAnalyticsTab.tsx`) hardcode raw hex colors directly in JSX props — e.g. `fill="#3B82F6"`, `stroke="#f0f0f0"` (gridlines, repeated per chart), and a standalone `OUTCOME_COLORS` lookup map (`{ Resolved: '#10B981', Escalated: '#EF4444', Other: '#94A3B8' }`) — **zero reference to any CSS custom property**, not even the ones that already exist.
- **1 of the 3** (`RatioTrend.tsx`) is already correctly token-driven: `stroke="currentColor" className="text-primary"` — proving the pattern is already known/available in this codebase, just not applied consistently.

### 3.4 Navigation styling

- `src/components/layout/Sidebar.tsx`'s **default and hover** pillar-nav states correctly reference the existing `--sidebar-*` CSS custom properties (confirmed: `text-sidebar-foreground`, `hover:bg-sidebar-accent`, `hover:text-sidebar-foreground` — these 7 tokens were already confirmed to exist by the 7.3 audit, §C).
- The **active/selected** pillar state does **not**: `isActive ? 'bg-cyan-600 text-white' : '...'` — a hardcoded Tailwind palette class, not a token reference (`Sidebar.tsx`, the pillar-button render block).
- **Every `focus-visible` ring in `Sidebar.tsx`** (3 occurrences in that one file) hardcodes `outline-cyan-400`, also not a token.
- **This is not a nav-only pattern.** `cyan-*` Tailwind classes appear as a de facto "interactive accent" color in **42 files across the whole codebase** (`grep -rl "cyan-[0-9]"`) — this is a genuinely new finding beyond what the 7.3 audit or the 7.4 roadmap anticipated (7.4 flagged nav-state hardcoding as a measurement gap to close; this closes it, and the result is larger in scope than a nav-only issue). `cyan` functions as VoiceForce's real, consistently-used interactive/selected/focus color today, but it has never been formalized as `--primary`, `--ring`, or any other named token — it is simply typed out, identically, 42 times.

### 3.5 Shared component interaction-state completeness

Direct source read of every primitive the 7.4 roadmap flagged as "not confirmed":

- **`src/components/ui/button.tsx`** (63 lines, read in full): `variant`/`size` `cva` system confirmed exactly as 7.3 described. Default/Hover (`hover:bg-primary/90` etc. per variant)/Disabled (`disabled:opacity-50`)/Focus (`focus-visible:ring-2 focus-visible:ring-ring`) are all implemented. **Busy/loading is confirmed absent** — no `loading`/`busy` prop, no spinner, no content-swap mechanism anywhere in the file.
- **`src/components/ui/input.tsx`** (37 lines, read in full): Default/Focus (`focus-visible:ring-2`)/Disabled (`disabled:opacity-50`) implemented, plus a VoiceForce-specific `uiSize` density prop (Phase 2B). **Error state is confirmed absent** — no invalid/error styling, no message slot, no `aria-invalid` handling built into the primitive itself.
- **`src/components/ui/table.tsx`**: **correction to the 7.4 roadmap's assumption** — a distinct selected-row state already exists (`data-[state=selected]:bg-muted`), genuinely different from hover (`hover:bg-muted/50`, a lower-opacity variant of the same base token). What is confirmed absent is a **sort-direction indicator** and a **loading/skeleton row** treatment — neither exists in the primitive today.
- **`src/components/ui/badge.tsx`** (52 lines, read in full): the `positive`/`warning`/`escalated` semantic variants (Session 11.1) are confirmed to exist, but **each hardcodes raw Tailwind palette classes directly inside the variant definition** (`emerald-600`/`amber-600`/`red-600` etc., with separate light/dark-mode class strings) rather than referencing any CSS custom property. This nuance matters: Badge's semantic variants are a centralized *mechanism* (one file instead of 51) but not yet a centralized *token* — they will need rewiring, not just reuse, once `color.semantic.*` tokens exist.
- **`src/components/ui/alert.tsx`** (confirmed): only `default`/`destructive` variants exist, exactly as the 7.4 roadmap assumed — no correction needed here.

---

## 4. Configuration-coverage checklist

This is the master checklist the Session 7.4-mandated **Configuration-Coverage Gate** (between Session 7.10 and 7.11) will measure against. Every row's "current adoption" count is real and freshly measured as of this session; "target" is what the Gate requires before KATON authoring begins.

| Category | Schema field | Current adoption (real count) | Target at Gate | Source |
|---|---|---|---|---|
| Typography scale | `typography.scale` | 312 arbitrary-pixel occurrences, 37 files, 0 using a scale token | 0 arbitrary occurrences | 7.3 §E.2 |
| Status/semantic color | `color.semantic`, `components.badge` | 51 of 54 status-color files hand-typed (not using `Badge` variants); `Badge`'s own variants hardcode palette classes internally (§3.5 above) | 0 hand-typed files; `Badge` variants reference `color.semantic` tokens | 7.3 §E.1, this session §3.5 |
| Table primitive | `components.table` | 4 of 16 tabular pages use shared `Table` | 16 of 16 (or named exceptions) | 7.3 §E.3 |
| Shadow | `shadow.panel` | 29 files hardcode 1 of 6 raw Tailwind shadow values; 0 use a token | 0 hardcoded occurrences outside `components/ui` (primitives' own internal shadow use is expected and excluded from this count) | This session §3.1 |
| Cards/panels | `cards` | 52 of 57 `bg-card`-surface files bypass the `Card` primitive; 2 additional parallel card abstractions exist | 0 bypassing files (or named exceptions); card-abstraction count reduced to 1 | This session §3.2 |
| Charts | `charts.seriesPalette` etc. | 0 of 3 chart files use the shared chart primitive; 2 of 3 hardcode raw hex | 3 of 3 using the primitive and `charts.*` tokens | This session §3.3 |
| Navigation states | `navigation.item` | Default/hover tokenized; active/selected and focus-ring hardcoded (`cyan-*`, 1 file directly, pattern repeated in 42 files app-wide) | 0 hardcoded `cyan-*` occurrences outside an explicit `color.brand.action`/`navigation.*` reference | This session §3.4 |
| Button Busy state | `components.button.busyIndicatorColor` | Not implemented (confirmed absent) | Implemented and token-driven | This session §3.5 |
| Input Error state | `components.input.errorBorder`/`errorText` | Not implemented (confirmed absent) | Implemented and token-driven | This session §3.5 |
| Table sort/loading states | `components.table.sortIndicatorColor`/`rowLoadingPlaceholderColor` | Not implemented (confirmed absent) | Implemented and token-driven | This session §3.5 |
| Alert success/warning variants | `components.alert.variants.success`/`warning` | Not implemented (confirmed absent) | Implemented and token-driven | 7.3 §B.10, confirmed this session |
| Decision-3 exclusions | — (intentionally no field) | N/A | Confirmed absent from the codebase (Gate check 4, per 7.4 §F) | Session 7.4 decision 3 |

**Net new finding this session contributes beyond the 7.4 roadmap's own listed gaps**: the `cyan-*` "de facto accent color" pattern (§3.4) is larger in scope (42 files) than the nav-only gap the roadmap anticipated, and the three-way card-abstraction split (§3.2: `Card` primitive / `SectionCard` family / raw divs) is a more specific finding than the roadmap's generic "card adoption not measured" placeholder. Both are now precisely quantified for the first time.

---

## 5. Verification

`npm run typecheck` — **clean** (`tsc --noEmit` across all three project configs: app, node, api). `src/theme/schema.ts` compiles with no errors; it has zero consumers anywhere in the codebase (confirmed: not imported by any existing file), satisfying this session's "no wiring, no implementation" constraint while still being fully type-checked.

No other verification step applies — `npm run verify:full` was not run because this session makes no change to any file `verify:full`'s build/deterministic-test suite exercises (the schema file is additive, unconsumed TypeScript); running it would add no information beyond `typecheck`'s own confirmation that the new file compiles.

---

## 6. Files created / modified

**Created:**
- `src/theme/schema.ts`
- `docs/SESSION_7_5_UI_CONFIG_SCHEMA.md` (this file)

**Modified:** none.

---

## 7. Explicit stop-condition compliance

- No existing screen or component changed.
- No CSS or Tailwind configuration changed.
- No visual or functional change to the running application (nothing new is consumed anywhere).
- No customer configuration instance authored (VoiceForce's and KATON's actual values are Session 7.6/7.11 work).
- No theme-engine implementation.
- No curriculum-specific components or fields (§2's "explicitly absent" note).
- Not deployed.
- VoiceForce's existing appearance and density are unaffected (nothing was wired up that could affect them).

This session is not committed. Session 7.6 was not started.

---

## 8. Session 7.6.1 revision — universal schema, VoiceForce→KATON mapping table

Session 7.6's extraction attempt (`docs/SESSION_7_6_VOICEFORCE_BASELINE_EXTRACTION.md`) found the §2 schema could not losslessly represent 7 categories of VoiceForce's real current values (gaps A-G). This revision fixes the schema itself, using **one** repeated, principled, customer-independent pattern everywhere a value can legitimately vary by context, rather than seven separate one-off patches:

```ts
{ default: T, variants?: Record<string, T> }  // "scaleOf" in schema.ts
```

`default` is **required** — the one value a minimal config (KATON, which typically documents a single value per property) supplies. `variants` is **optional**, keyed by a generic semantic word (a size like `"compact"`, a state like `"hover"`, never a raw palette name like `"cyan600"`) — a richer config (VoiceForce) uses it to losslessly preserve every real additional value the baseline reduces to one, satisfying the instruction *"where KATON documents fewer variants, use only explicit, validated defaults or inheritance rules — do not fabricate undocumented KATON specifications."*

### 8.1 Revised schema structure

| Top-level field | Structure | Resolves |
|---|---|---|
| `color.surfaces` | `{base, raised, overlay, interactiveSubtle, sidebar}`, each a `{background, foreground}` pair | Gap A (page/card/popover/hover-surface/sidebar background+foreground pairing) |
| `color.roles` | `{primary, secondary, muted}`, each a `{background, foreground}` pair | Gap A (brand/neutral filled-control pairing); also absorbs the original schema's redundant standalone `neutral.secondaryText` field (same real value as `roles.muted.foreground` — no longer duplicated) |
| `color.brand` | `{decorative?}` — optional, single color | Gap B: structurally separated from `surfaces.interactiveSubtle` so KATON's sparing-use brand accent and VoiceForce's real neutral hover-surface token can never collide under one field again |
| `color.interactive.action` | `scaleOf({text?, background?, border?, focusRing?})` | Gap C: a real multi-shade interactive/link/focus scale, not 2 flat values |
| `color.semantic.{positive,negative,caution}` | `{text, fill, solid: {background, foreground}}` | Unchanged in shape from 7.5, but now explicitly documented to cover BOTH the tinted (Badge) and solid (Alert/destructive-button) real usages without a second field |
| `shadow` | `scaleOf(string)` | Gap D: 6 real distinct elevation values, not 1 |
| `heights` | `scaleOf({primaryAction, control, formField, filterField, topBar, sidebarWidth})` | Gap E: real per-component size variants (Button xs/sm/default/lg, Input sm/default), not 1 flat value per role |
| `typography.scale[].lineHeightPx` / `.lineHeightSource` | `lineHeightPx` now optional; `lineHeightSource: 'explicit' \| 'inherited-default'` required | Gap F: VoiceForce's arbitrary-pixel sizes have no paired custom line-height at any call site — this is now an honestly-recorded state, never a fabricated number |
| `icons` | `scaleOf({sizePx})` plus `strokeWidth`/`library` | Gap G: real multiple icon sizes, not 1 default + 1 vague "compact" |
| `borders` | `{default: {widthPx, color}, field: {widthPx, color}, focusRingWidthPx, dashedStyle?}` | Closes the part of gap A about `--input` (structurally distinct from `--border`) and `--ring` (a ring is a width+color mechanism of its own, not conflated with a border) |
| `cards` | `{headerBackground?, paddingPx?}` only | De-duplicated: `cards.surfaceColor`/`cards.borderColor` from the original 7.5/7.6 draft were removed — they duplicated `color.surfaces.raised` / `borders.default`, which are now the single source for those values |

### 8.2 VoiceForce → KATON → universal schema mapping table

Every row is sourced from either the 7.3 audit (KATON column) or this session's direct extraction (VoiceForce column, cited file/evidence). "—" means no real current value exists for that side.

| VoiceForce source property | KATON category (7.3 §B) | Universal schema field | VoiceForce value | KATON value (if documented) |
|---|---|---|---|---|
| `--background` | Neutrals — Ground | `color.surfaces.base.background` | `hsl(210 20% 98%)` | `#EEF3F7` |
| `--foreground` | — (not itemized) | `color.surfaces.base.foreground` | `hsl(222.2 84% 4.9%)` | — |
| `--card` | — (not itemized; closest: Subtle) | `color.surfaces.raised.background` | `hsl(0 0% 100%)` | `#F7F9FB` (approximate — KATON's "Subtle" is documented as table-headers/panels, not strictly "card") |
| `--card-foreground` | — | `color.surfaces.raised.foreground` | `hsl(222.2 84% 4.9%)` | — |
| `--popover` / `--popover-foreground` | — | `color.surfaces.overlay.{background,foreground}` | `hsl(0 0% 100%)` / `hsl(222.2 84% 4.9%)` | — |
| `--accent` / `--accent-foreground` (real neutral hover surface) | — (KATON documents no equivalent "neutral hover surface" role) | `color.surfaces.interactiveSubtle.{background,foreground}` | `hsl(210 40% 96.1%)` / `hsl(222.2 47.4% 11.2%)` | — |
| `--sidebar-background` / `--sidebar-foreground` | — (KATON's 3 source pages don't document their own nav chrome in this level of detail) | `color.surfaces.sidebar.{background,foreground}` | `hsl(0 0% 98%)` / `hsl(240 5.3% 26.1%)` | — |
| `--primary` / `--primary-foreground` | Brand — Katon navy | `color.roles.primary.{background,foreground}` | `hsl(222.2 47.4% 11.2%)` / `hsl(210 40% 98%)` | `#121B54` / (foreground not separately documented — likely white, not explicit) |
| `--secondary` / `--secondary-foreground` | — (no direct KATON equivalent) | `color.roles.secondary.{background,foreground}` | `hsl(210 40% 96.1%)` / `hsl(222.2 47.4% 11.2%)` | — |
| `--muted` / `--muted-foreground` | Neutrals — Subtle / Secondary text | `color.roles.muted.{background,foreground}` | `hsl(210 40% 96.1%)` / `hsl(215.4 16.3% 46.9%)` | `#F7F9FB` / `#4F5878` |
| Badge `positive` / Alert (no solid-success exists) | Status — Confirmed / Confirmed fill | `color.semantic.positive.{text,fill,solid}` | `rgb(4 120 87)` / `rgb(16 185 129/0.1)` / no real solid usage (Tailwind emerald-500 used as the honest best-available value — see §8.3 ambiguous mapping #1) | `#2E6B3F` / `#E3F0E6` |
| Badge `escalated` / `--destructive` | Status — Rejected / Rejected fill | `color.semantic.negative.{text,fill,solid}` | `rgb(185 28 28)` / `rgb(239 68 68/0.1)` / `hsl(0 84.2% 60.2%)` + `hsl(210 40% 98%)` | `#A33A2F` / `#F6E3E1` |
| Badge `warning` / (no solid-caution exists) | Status — Attention / Attention fill | `color.semantic.caution.{text,fill,solid}` | `rgb(180 83 9)` / `rgb(245 158 11/0.1)` / no real solid usage (same caveat as positive) | `#8A5A0B` / `#FDF1DC` |
| `--border` | Neutrals — Border | `borders.default.{widthPx,color}` | `1px` / `hsl(214.3 31.8% 91.4%)` | `1px` / `#D5DFE8` |
| `--input` | Neutrals — Field border | `borders.field.{widthPx,color}` | `1px` / `hsl(214.3 31.8% 91.4%)` (same real value as `--border` today) | `1px` / `#7E89A2` (KATON's Field-border value is distinct from its generic Border — VoiceForce's two tokens currently coincide, KATON's don't) |
| `ring-2` (Tailwind ring utility width) | Borders — "2px around the pane in focus" | `borders.focusRingWidthPx` | `2` | `2` |
| `cyan-{300,400,500,600,700,800,950}` (7 real shades, 42 files) | Brand/Action — Katon blue / Action / Action pressed / Selected / Highlight (5 documented roles) | `color.interactive.action.{default,variants}` | 7 real hex values, each tagged by real usage role (link text, solid background, focus ring, border, dark surface) — see §8.1/config file | `#0C8FD9` (Katon blue) / `#0A67C7` (Action) / `#095DB5` (Action pressed) / `#C0DDEE` (Selected) / `#E6F3FB` (Highlight) |
| `shadow-{sm,md,lg,xl,2xl,none}` (6 real values, 29 files) | "One shadow only... menus, panels over content, page previews" | `shadow.{default,variants}` | all 6 real CSS box-shadow values preserved | 1 documented value (exact CSS not given in the KATON source, only the usage note) |
| Button `h-{7,9,10,11}` / Input `h-{8,10}` | Control heights: 44/36/40/36/56/224px | `heights.{default,variants}` | real: 28/32/36/40/44/56/224px across Button/Input/TopBar/Sidebar | 44 (primary action) / 36 (everything else) / 40 (form field) / 36 (filter field) / 56 (top bar) / 224 (sidebar width) |
| `text-[9..18px]` (8 sizes, 312 occurrences) | Type ramp — 9 sizes, 13-30px, each with a documented line-height | `typography.scale[]` | 8 real sizes, each `lineHeightSource: 'inherited-default'` (no paired custom line-height found) | 9 sizes, each with an explicit documented line-height (e.g. 13/18, 14/20, ...) |
| icon `h-{3,3.5,4,5}` (12/14/16/20px) | Icons — 14/16/18/20/24px, Lucide, stroke 1.75 | `icons.{default,variants}` + `strokeWidth` | 12/14/16/20px observed; `strokeWidth: 2` (Lucide's own default, unmodified) | 14/16/18/20/24px; `strokeWidth: 1.75` (KATON overrides Lucide's default; VoiceForce does not) |
| `radii.{tag,control,panel,card}` | 4/6/8/10px | `radii.{tag,control,panel,card,pill}` | 4/6/8/8px (VoiceForce has no distinct card radius from panel — real finding, not an omission) | 4/6/8/10px |
| Tailwind default spacing scale | "Tailwind steps in px" — 4..48 | `spacing[]` | `[4,6,8,10,12,16,20,24,28,32,40,48]` | same array (KATON's scale IS Tailwind's defaults) |
| Tailwind default `screens` | — (not documented) | `breakpoints.{sm,md,lg,xl}` | `640/768/1024/1280` | — |

### 8.3 Ambiguous mappings (reported, not silently resolved)

1. **Semantic `solid` presentation for `positive`/`caution`** — VoiceForce has no real component today that renders a solid-filled success or caution surface (no success/caution Alert exists, per the Session 7.5 audit). The baseline config populates `solid.background`/`solid.foreground` with Tailwind's own published `emerald-500`/`amber-500` + white-text values as the most defensible *real, citable* color (not invented from nothing — it's the same palette VoiceForce already uses for the `fill`/`text` pair, just at full saturation), but this is a genuine judgment call, not an extraction of an actually-rendered current value. Flagged here rather than presented as equivalent in confidence to the other, directly-observed values.
2. **`--card` vs. KATON's "Subtle"** — KATON's own source documents "Subtle" (`#F7F9FB`) as "table headers, panels," which is closer to VoiceForce's `--muted`/table-header usage than to VoiceForce's `--card` (`hsl(0 0% 100%)`, pure white, used for dialogs/elevated panels). The mapping table pairs `--card` with "Subtle" as the nearest KATON category for traceability, but a future KATON config author should decide independently whether KATON's own `raised`-surface value should be `#F7F9FB` (Subtle) or a brighter white closer to VoiceForce's real `--card` — this is a KATON-config-authoring decision (Session 7.11), not resolved here.
3. **`--input` vs. `--border` real-value coincidence** — VoiceForce's two structurally-distinct tokens (`borders.default.color`, `borders.field.color`) currently hold the identical real value. This is correctly preserved as-is (not collapsed into one field, since KATON's own source gives these two roles genuinely different values — `#D5DFE8` vs `#7E89A2`), but it means VoiceForce's own config doesn't exercise the real distinction the schema supports. Noted so a reviewer doesn't mistake this for a modeling error.
4. **Button `quiet`/ghost variant has no real "background" value** — KATON's Quiet button has a background only in non-Default states (per the 7.3 §B.5 screenshot read); VoiceForce's `ghost` Button variant has literally no background in ANY state except hover (which uses `color.surfaces.interactiveSubtle`, not a `components.button.variants.quiet`-owned value). The schema's `buttonComponent.variants.quiet` field was narrowed to `{foreground}` only (no `background`) to reflect this real asymmetry rather than forcing a background value that doesn't exist. Flagged as a deliberate, non-obvious schema shape choice.
5. **Font family** — VoiceForce's "value" (Tailwind's default `font-sans` stack) is not a deliberately *chosen* typeface the way KATON's Roboto is — it is the absence of a choice. Both are recorded as real, truthful current states, but they are not equivalent in what they represent about either product's design intent; a reviewer should not read "VoiceForce: ui-sans-serif, system-ui, ..." as "VoiceForce deliberately chose a system-font aesthetic" — it simply never overrode the framework default.

All five are genuine judgment calls or noteworthy asymmetries, not schema defects — none blocks the round-trip verification (§ below), since none involves fabricating a value the schema requires but VoiceForce doesn't have.
