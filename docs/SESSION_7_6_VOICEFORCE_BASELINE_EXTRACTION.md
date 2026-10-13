# Session 7.6 — VoiceForce Baseline Configuration: Extraction Report & Schema Gaps

**Mode: EXTRACTION ONLY.** No existing CSS file, Tailwind config, screen, or shared component was modified. The baseline config has zero consumers (not imported anywhere) and is not activated. This session follows the approved scope in `docs/SESSION_7_4_CUSTOMER_UI_CONFIGURATION_ROADMAP.md` §F ("Session 7.6 — VoiceForce Baseline Configuration (Extraction, Not Redesign)"), against the schema from `docs/SESSION_7_5_UI_CONFIG_SCHEMA.md` / `src/theme/schema.ts`.

**Headline result: the Session 7.5 schema cannot losslessly represent all of VoiceForce's current visual values.** Per this session's explicit instruction, this is reported honestly below, with evidence, rather than resolved by approximation. `src/theme/configs/voiceforce.config.ts` is therefore a **deliberately partial** extraction — every field it populates is a real, literal, cited current value; every field a reported gap affects is explicitly omitted, never guessed.

> **Superseded by Session 7.6.1.** All seven gaps described in §2-§3 below were resolved by revising `src/theme/schema.ts` (not by changing VoiceForce) — see **§8** at the end of this document for the resolution, the current (now complete) `voiceforce.config.ts`, and the updated round-trip measurements. §2-§7 are kept as the original, accurate historical record of what Session 7.6 found; they are no longer the current state of the config file itself.

---

## 1. Deliverables

- `src/theme/configs/voiceforce.config.ts` — partial baseline extraction, typed as a deep-partial of `VoiceForceThemeConfig` (not claiming full conformance — see §2).
- `.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` — the round-trip verification script (task item 6/7), wired into `npm run verify:full` (one-line addition to `package.json`, the only tracked file this session modifies).
- `docs/SESSION_7_6_VOICEFORCE_BASELINE_EXTRACTION.md` — this report.

---

## 2. Why the config is not a complete `VoiceForceThemeConfig`

Running the config through the schema's own Zod validator (`voiceForceThemeConfigSchema.safeParse`) directly confirms 19 required-field failures — this is not a subjective judgment call, it's the schema itself reporting the gap:

```
typography.scale                        Required
color.brand.accent                       Required
color.brand.action                       Required
color.brand.actionPressed                Required
color.neutral.secondaryText              Required
borders.focusWidth                       Required
heights                                  Required
icons.compactSizePx                      Required
shadow                                   Required
navigation.item.activeBackground         Required
navigation.item.activeText               Required
charts.axisColor                         Required
charts.tooltipBackground                 Required
charts.tooltipText                       Required
components.button                        Required
components.input.errorBorder             Required
components.input.errorText               Required
components.alert.variants.success        Required
components.alert.variants.warning        Required
```

Several of these (icons.compactSizePx, components.button.busyIndicatorColor, components.input.errorBorder/errorText, components.alert.variants.success/warning, navigation states tied to the cyan scale) are **expected and benign** — they correspond to states/components the Session 7.5 audit already confirmed don't exist in VoiceForce today (no Busy button, no Input error styling, no success/warning Alert), so there is genuinely no current value to extract; these are legitimately empty, not a schema defect.

The remainder are real **schema structure gaps** — VoiceForce *does* have a real, current value for these, but the schema has nowhere to put it without either fabricating data or misrepresenting a field's documented meaning. These are detailed below, each with the real evidence behind it.

---

## 3. Schema gaps (full, evidenced list)

### §A — No background+foreground pairing structure

Tailwind's actual color configuration (`tailwind.config.ts`, read in full this session) defines **7 paired roles**, each with a `DEFAULT` + `foreground` value (primary, secondary, destructive, muted, accent, popover, card), plus a standalone `background`/`foreground` pair, plus `border`/`input`/`ring` as independent single values — **19 distinct real token slots** in light mode alone (38 counting the `.dark` class overrides, which reuse the same 19 names).

The Session 7.5 schema's `color.brand` (6 single-value fields) / `color.neutral` (6 single-value fields) / `color.semantic` (3 roles, each with a `text`+`fill` pair — a *different* pairing concept, not background+foreground) has no structural equivalent to this. Specifically unrepresentable without inventing a new field: `--foreground`, `--card-foreground`, `--popover`/`--popover-foreground`, `--primary-foreground`, `--secondary`/`--secondary-foreground`, `--muted-foreground`, `--destructive-foreground`, `--ring` (as a generic app-wide token, not nav-scoped), `--sidebar-background`, `--sidebar-primary`/`--sidebar-primary-foreground`.

### §B — `color.brand.accent` name collision

The Session 7.5 schema documents this field as *"KATON: Katon blue, accent only"* — a saturated brand color, used sparingly, 3.5:1 contrast, "never small text" (KATON's own usage note, 7.3 §B.3). This codebase's **real** `--accent` token is a completely different thing: a neutral, low-saturation hover-state surface (`hsl(210 40% 96.1%)` light / `hsl(217.2 32.6% 17.5%)` dark), used for ghost-button hover and dropdown-item hover (confirmed: `tailwind.config.ts`'s `accent: { DEFAULT: 'hsl(var(--accent))', foreground: ... }`, and `button.tsx`'s `ghost: "hover:bg-accent hover:text-accent-foreground"`). Filling the schema's `accent` field with VoiceForce's real `--accent` value would silently redefine what that field is documented to mean — exactly what this session was told not to do.

### §C — The real interactive/action color is a multi-shade scale, not two flat values

`grep -rohE "(text|bg|border|outline|ring)-cyan-[0-9]+" src` found **7 distinct shade steps** in real use: `cyan-300`/`400`/`500`/`600`/`700`/`800`/`950`, across at least 5 different utility roles (text links, backgrounds, borders, focus outlines, and one dark-surface use), with **42 files** using some `cyan-*` class overall and `Sidebar.tsx` alone using 7 occurrences across 3 of those roles. The active/selected sidebar-pillar state is hardcoded `bg-cyan-600 text-white` directly in `Sidebar.tsx` (not derived from any token). The schema's `color.brand.action`/`actionPressed` (exactly 2 flat values) cannot represent this without collapsing a real 7-shade system — the task's own instruction ("where existing values differ by component or context, preserve those differences... do not arbitrarily unify") directly forbids doing this.

### §D — Shadow is genuinely multi-valued

29 files use one of 6 distinct Tailwind shadow utilities (`shadow-sm`×7, `md`×10, `lg`×10, `xl`×3, `2xl`×1, `none`×1) — confirmed in the Session 7.5 audit and re-confirmed this session. The schema's `shadow.panel` is a single value, matching KATON's own "one shadow only" design (7.3 §B.4) but not VoiceForce's real, more varied current usage.

### §E — Control heights are a real variant system, not one value per role

Direct reads of `button.tsx` and `input.tsx` this session confirm: Button has 4 real heights (`xs`=28px, `sm`=36px, `default`=40px, `lg`=44px — the `xs` size is itself a documented, deliberate Phase-2B centralization effort, not an accident); Input has 2 (`sm`=32px, `default`=40px). The schema's `heights` object has exactly one flat value per functional role (`primaryAction`/`control`/`formField`/`filterField`/`topBar`/`sidebarWidth`), modeled on KATON's simpler system — it cannot represent VoiceForce's richer, deliberate size-variant system without discarding real distinctions.

### §F — Typography line-height is not consistently paired with VoiceForce's arbitrary sizes

The schema's `typeRampStep` requires `lineHeightPx` for every size. VoiceForce's 312 arbitrary `text-[Npx]` occurrences (exact breakdown this session: `11px`×151, `10px`×56, `9px`×33, `12px`×33, `13px`×29, `14px`×6, `16px`×3, `18px`×1) are font-size-only Tailwind arbitrary values — no call site pairs a specific custom line-height with these sizes. Inventing a line-height per size to satisfy the schema would be fabricated data, not extraction, so `typography.scale` is left empty in the baseline config rather than populated with invented numbers.

### §G — Icon compact size (carried over from Session 7.5, confirmed still open)

Already flagged as unresolved in `schema.ts`'s own comment when written in Session 7.5. Re-confirmed this session: icon sizes vary per call site (`h-3`/`h-3.5`/`h-4`/`h-5` etc.) with no single "the compact size" value to extract.

---

## 4. What WAS successfully extracted (real values, verified)

The round-trip script (`voiceforce-baseline-roundtrip-verify.mjs`) checks 23 config fields directly against the literal values in `src/index.css`/`button.tsx`/`badge.tsx`/`alert.tsx`/`table.tsx` (not against the config's own comments, to avoid the test trivially agreeing with itself) — **all 23 match exactly, 0 mismatches**:

- Brand primary color, 3 neutral roles (ground/subtle/border, plus the honest note that `divider`/`fieldBorder` currently resolve to the same source values as `border`), 3 semantic status roles (Badge's real `positive`/`escalated`/`warning` colors, transcribed directly from `badge.tsx`).
- Card surface/border colors, 3 derived radii (tag/control/panel, matching `tailwind.config.ts`'s `calc(var(--radius) - Npx)` chain exactly).
- Input default-border/focus-border/filled-text/disabled-background, Table header/row-hover-source/row-selected colors, Alert default/destructive colors.
- Navigation hover-state colors (the states that *are* token-driven today, per the Session 7.5 audit's own finding that default/hover were already correct).
- Typography families (no custom font loaded anywhere — confirmed via grep for `@font-face`/Google Fonts links/`fontFamily` config — so Tailwind's own default `font-sans` stack is VoiceForce's real, truthful current value), spacing scale (Tailwind defaults, matches KATON's own scale too), breakpoints (Tailwind defaults), icon library/stroke-width (lucide, default stroke).
- Chart series palette and gridline color — real hex values transcribed directly from the two chart files that hardcode them (`VoiceAnalyticsTab.tsx`, `ChatAnalyticsTab.tsx`).

---

## 5. Verification results

- **Round-trip script**: `node .tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` → **23 reproduced, 0 failed, 17 documented gaps**. A documented gap is not a failure condition; the script only exits non-zero on an actual mismatch or an undocumented gap, neither of which occurred.
- **`npm run typecheck`**: clean, all three project configs.
- **`npm run verify:full`**: clean (exit 0), including the new round-trip script (wired in via a one-line `package.json` addition — the only existing tracked file this session touches, and not CSS/Tailwind/a screen/a component).

---

## 6. Explicit stop-condition compliance

- No existing CSS or Tailwind configuration file modified.
- No existing screen or shared component modified.
- The configuration is not activated anywhere (zero imports of `voiceforce.config.ts` from any consuming file).
- No visual, functional, or density change to the running application (nothing new is consumed).
- No KATON values introduced (every value in this config is a real, current VoiceForce value or explicitly absent).
- Not deployed.
- This session is **not committed**, pending review, per the task's explicit instruction.

---

## 7. Recommendation (as originally written — see §8 for the outcome)

Per the task's own "IMPORTANT" instruction, this report **stops here** rather than silently proceeding past the gaps. Before Session 7.7 (theme-engine wiring) can produce a truthful, complete pixel-parity cutover, the §3 gaps need a decision — most plausibly, a Session 7.5 schema revision adding: a background+foreground pairing structure (or equivalent) for brand/neutral roles, a renamed/repurposed `accent` field (or a new field) that doesn't collide with this codebase's real `--accent` usage, a multi-shade `action` color scale rather than two flat values, a multi-value `shadow` structure, a multi-value `heights` structure (at minimum a per-component size-variant map rather than one flat value per functional role), and either an optional `lineHeightPx` or a documented "size-only" type-ramp step variant. This is a scoping decision for the person reviewing this session, not one made unilaterally here.

---

## 8. Session 7.6.1 — Gap resolution, final measurements

All seven gaps from §3 were resolved by revising `src/theme/schema.ts` per the exact recommendation in §7, using one repeated pattern (`{ default: T, variants?: Record<string, T> }`) rather than seven one-off fixes. Full structural detail and the required VoiceForce→KATON→universal-field mapping table are in `docs/SESSION_7_5_UI_CONFIG_SCHEMA.md` §8 — not duplicated here. This section records the **outcome**: what changed in `voiceforce.config.ts`, and the new, final round-trip measurements.

### 8.1 Gap-by-gap resolution

| Gap | §3 finding | Resolution | VoiceForce config now contains |
|---|---|---|---|
| A — No bg/fg pairing | `--foreground`/`--secondary`/`--popover`/`--card-foreground`/`--primary-foreground`/`--muted-foreground`/`--destructive-foreground`/`--ring`/`--sidebar-background`/`--sidebar-primary` unrepresentable | New `color.surfaces` (base/raised/overlay/interactiveSubtle/sidebar) and `color.roles` (primary/secondary/muted), each a real `{background, foreground}` pair | Every one of these 10 tokens now has a real, verified home — see the round-trip script's checks 1-20 |
| B — `accent` collision | Schema's `color.brand.accent` meant something VoiceForce's real `--accent` doesn't | `color.brand.decorative` (optional, correctly left unset for VoiceForce) vs. `color.surfaces.interactiveSubtle` (VoiceForce's real `--accent` value) — structurally separate fields, never conflatable again | `color.surfaces.interactiveSubtle` = real `--accent`/`--accent-foreground`; `color.brand.decorative` = unset (honest, not fabricated) |
| C — Multi-shade interactive color | 7 real `cyan-*` shades (300-950) across 42 files, schema had 2 flat fields | `color.interactive.action: scaleOf({text?, background?, border?, focusRing?})` | All 7 real shades preserved under semantic names (`linkTextDark`, `solidBackground`, `focusRingAlt`, `border`, `borderStrong`, `linkTextLight`, `textStrong`, `darkSurface`) — verified by the round-trip script's "preserves all 7 real cyan shades" check |
| D — Multi-value shadow | 6 real Tailwind shadow values, schema had 1 field | `shadow: scaleOf(string)` | `default` (shadow-md) + 5 named variants (`subtle`/`elevated`/`prominent`/`maximum`/`none`) — all 6 real CSS box-shadow values present |
| E — Multi-value heights | Button has 4 real heights, Input has 2, schema had 1 flat value/role | `heights: scaleOf({primaryAction, control, formField, filterField, topBar, sidebarWidth})` | `default` (40/36/40/36/56/224) + `variants.compact` (Button xs=28, Input sm=32) + `variants.comfortable` (Button lg=44) |
| F — Fabricated line-height risk | `typeRampStep.lineHeightPx` required, no real value existed | `lineHeightPx` now optional; new required `lineHeightSource: 'explicit' \| 'inherited-default'` | All 8 real type-ramp steps present, each honestly marked `lineHeightSource: 'inherited-default'`, `lineHeightPx: undefined` — no fabricated number anywhere |
| G — Icon compact size | Varies per call site, no single value | `icons: scaleOf({sizePx})` | `default` (16px) + `variants.tight` (12px) + `variants.compact` (14px) + `variants.comfortable` (20px) |

### 8.2 Final round-trip measurements

- **`node .tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` → 40 passed, 0 failed** (up from the original 23 reproduced / 0 failed / 17 documented gaps — every one of those 17 gaps is now either a verified REPRODUCED value or a verified-correct, intentionally-unset optional field, e.g. `color.brand.decorative`).
- **Schema-level completeness**: `voiceForceThemeConfigSchema.safeParse(voiceforceBaselineConfig).success === true` — zero required-field validation errors (down from the original 19).
- **`npm run typecheck`**: clean, all three project configs.
- **`npm run verify:full`**: clean (exit 0).

### 8.3 What remains genuinely unresolved (by design, not a gap)

These are NOT schema defects — they are real absences of a current VoiceForce value, now correctly represented as optional/unset fields rather than forced, fabricated entries:
- `color.brand.decorative` — VoiceForce has no sparing-use decorative brand accent distinct from its primary color.
- `components.button.busyIndicatorColor`, `components.input.errorBorder`/`errorText`, `components.table.rowLoadingPlaceholderColor`/`sortIndicatorColor`, `components.alert.variants.success`/`warning` — none of these states/variants exist in the current codebase (confirmed directly in the Session 7.5 audit); there is nothing to extract.
- `cards.headerBackground`/`paddingPx`, `charts.axisColor`/`tooltipBackground`/`tooltipText`, `navigation.topBar` — no single consistent current value was found for any of these; left unset rather than inventing a representative figure.

### 8.4 Files changed this revision

- `src/theme/schema.ts` — revised (universal pattern applied to all 7 gap areas; see `docs/SESSION_7_5_UI_CONFIG_SCHEMA.md` §8 for full structure).
- `src/theme/configs/voiceforce.config.ts` — rewritten against the revised schema; now a fully valid, complete `VoiceForceThemeConfig` (not a deep-partial).
- `.tooling/scripts/voiceforce-baseline-roundtrip-verify.mjs` — rewritten with 40 checks against the revised schema/config.
- `docs/SESSION_7_5_UI_CONFIG_SCHEMA.md` — §8 added (mapping table, ambiguous mappings, resolved structure).
- `docs/SESSION_7_6_VOICEFORCE_BASELINE_EXTRACTION.md` — this §8 added.
- No existing CSS, Tailwind config, screen, or shared component touched. Not activated, not deployed. Not committed — pending review.
