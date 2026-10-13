# Session 7.4 — Customer-Configurable UI Architecture & Implementation Roadmap

**Mode: ANALYSIS AND PLANNING ONLY.** No application code was changed, nothing was deployed, and no implementation session was started while producing this document. This is an architecture proposal and sequencing plan, built on `docs/SESSION_7_3_UI_CENTRALIZATION_AUDIT.md` (hereafter "the 7.3 audit") and a fresh read of the current codebase. Every number cited below is the 7.3 audit's own measured figure, not re-estimated here.

**Revision note (post-approval adjustments):** the architecture below was approved with seven binding decisions, incorporated throughout this revision:
1. VoiceForce's existing appearance and operational density are preserved **exactly** — this is no longer an open question flagged for sign-off (as the original draft had it in §C.3); it is now the fixed baseline. KATON's config is free to use its own, different values.
2. Future customer onboarding is **configuration-only** — no screen or component code change is permitted as part of onboarding any customer, including KATON, at any point in this roadmap.
3. **No curriculum-specific components are built.** The original draft proposed building a workflow-stage indicator and a dashed-border "provenance" tag mechanism as net-new, KATON-inspired components. Both are **removed from scope entirely** — VoiceForce has no functional requirement for either, and per this decision they are not built "for future use" either. Any KATON design element with no corresponding VoiceForce functional requirement is recorded in the KATON config's own documentation as explicitly out of scope, not implemented.
4. Centralization scope is **extended beyond typography/badges/tables to every existing visual property** — charts, cards/panels, navigation states, icons, shadows, responsive/breakpoint properties, and the complete interaction-state matrix of every primitive, not just the subset the 7.3 audit happened to quantify first.
5. A **measurable configuration-coverage verification gate** is added before KATON implementation (Session 7.11) begins — a quantified go/no-go checkpoint, not a soft recommendation.
6. The **final VoiceForce regression verification** before that gate covers the **complete route/state inventory** (every route in `App.tsx`, in its key states), not a representative sample — sampling remains acceptable for each migration session's own interim checks, but not for the final pre-KATON checkpoint.
7. The seven core sessions (7.5–7.11) are retained; only their individual scopes are adjusted below to absorb decisions 3–6. No session was added or removed.

---

## Why this is a consolidation problem, not a build-from-scratch problem

The 7.3 audit's central finding reframes this whole roadmap: VoiceForce already has a working token layer (19 CSS custom properties in `src/index.css`, light+dark) and a clean, token-driven shadcn/Radix primitive library (`src/components/ui/`, 47 components, zero hardcoded hex found in any spot-checked file). `Button` and `Badge` already have `cva` variant systems; `Badge` already ships `positive`/`warning`/`escalated` semantic variants.

**What's missing is not a theming mechanism — it's (a) a handful of genuinely absent token categories (success/warning/info colors, a typography scale, a few component states like Busy/Error) and (b) near-total non-adoption of the mechanism that already exists** (only 3 of 54 status-color-bearing files use `Badge`'s variants; only 4 of 16 tabular pages use the shared `Table`; 312 arbitrary-pixel type sizes bypass any scale).

This matters directly for the acceptance criterion stated in the brief — *"changing a predefined property in a customer's configuration must consistently change that property wherever it is used"* — because **a token, however well-designed, cannot satisfy that criterion at any single hardcoded call site that never references it.** The roadmap below therefore has two kinds of work, sequenced so the second never starts before the first is ready:

1. **Build/extend the configuration mechanism** (new token categories, a typed schema, a theme engine, a VoiceForce baseline config, a KATON config) — additive, low regression risk, no existing screen is touched.
2. **Migrate existing hardcoded call sites onto that mechanism** (the 7.3 audit's own §H Phases 3–5 — status colors, tables, typography) — mechanical but wide-reaching, the real regression-risk surface, and the only way the acceptance criterion actually becomes true app-wide rather than true-in-theory.

---

## A. The definitive centralized UI configuration architecture

### A.1 Token layer — extend the existing CSS-custom-property mechanism, don't replace it

The current `:root` / `.dark` CSS-variable pattern in `src/index.css`, consumed via `tailwind.config.ts`'s `theme.extend.colors` referencing `hsl(var(--token))`, is the right foundation to build on — it is exactly how a runtime-swappable, multi-config system needs to work, and it is already proven across all 47 primitives. The architecture **extends this pattern's coverage**, it does not introduce a second styling mechanism alongside it (e.g. not CSS-in-JS, not inline style objects, not a parallel non-Tailwind theming library).

Concretely: every design-system property identified in the 7.3 audit's KATON inventory (§B of that document) becomes a named CSS custom property, grouped by category (see §B of this document for the full schema). Where a property today has no token (typography scale, spacing scale as an explicit token set even though it matches Tailwind defaults, border-style/dash, control heights, icon sizing, shadow), a new token is added following the exact naming/structure convention the existing 19 already use.

### A.2 Configuration unit — a typed "theme definition," not raw CSS

A **customer configuration is a single, strongly-typed TypeScript object** (validated against a schema — see §E), not a CSS file a customer edits directly. This is the layer that makes configs *creatable, validatable, and diffable* rather than free-form stylesheets that can silently drift or omit required values. A build step (or runtime loader — see §A.4) converts a validated config object into the actual CSS custom property declarations.

```ts
// Illustrative shape only — the authoritative schema is §B.
interface VoiceForceThemeConfig {
  meta: { id: string; name: string; version: string };
  typography: { families: {...}; scale: TypeRampStep[] };
  color: { brand: {...}; neutral: {...}; semantic: {...} }; // success/warning/danger/info, each with a "fill" companion
  spacing: number[]; // the scale steps
  radii: { tag: number; control: number; panel: number; card: number; pill: 'full' };
  borders: { width: number; focusWidth: number; dashedStyle: string }; // a generic style primitive (any config may use "dashed" for its own purposes); NOT a provenance-tagging mechanism — see decision 3
  heights: { primaryAction: number; control: number; formField: number; filterField: number; topBar: number; sidebar: number };
  icons: { library: 'lucide'; defaultSize: number; compactSize: number; strokeWidth: number };
  shadow: { panel: string }; // one value, per 7.3's "one shadow only" finding
  cards: { surface: {...}; header: {...} };
  navigation: { item: { default: {...}; hover: {...}; active: {...} }; topBar: {...} };
  chart: { seriesPalette: string[]; axis: {...}; tooltip: {...} };
  breakpoints: { sm: number; md: number; lg: number; xl: number }; // defaults to Tailwind's own, per §B
  components: {
    button: { variants: Record<ButtonVariant, { /* color refs, not raw colors */ }> };
    badge: { variants: Record<BadgeVariant, {...}> }; // color variants only — no provenance/border-style axis (decision 3)
    alert: { variants: Record<AlertVariant, {...}> };
    table: { header: {...}; row: { hover: {...}; selected: {...}; loading: {...} } };
  };
  // Explicitly absent: a workflow/progress-stage component config, and any badge
  // provenance (solid/dashed "from the book" vs "added by the system") axis —
  // both excluded per decision 3 (no VoiceForce functional requirement).
}
```

Each field resolves to one or more of the underlying CSS custom properties from §A.1 — the TypeScript object is the *source of truth and validation surface*, the CSS custom properties are the *runtime consumption surface* Tailwind/components actually read.

### A.3 Component layer — unchanged APIs, token-complete implementations

No `components/ui/*` component's public API (props) changes as part of making it configurable — `<Button variant="destructive">` stays `<Button variant="destructive">` regardless of which customer config is active. What changes is that every variant's *internal* class mapping resolves through the token layer in §A.1 for every property that layer now covers (not just color, as today, but also the new typography/spacing/border/height tokens where applicable to that component). This is what makes "no screen-level code changes necessary" true: a screen that already writes `<Button variant="destructive">` or `<Badge variant="warning">` needs zero changes to render correctly under any future config, **once that component's variant implementation is token-complete** (§H Phase-level work) and **once the screen actually uses the component instead of a hand-typed class string** (the adoption-gap migration work).

### A.4 Selection and application mechanism — build-time primary, runtime-togglable as a documented extension

Two real options exist, and the brief does not mandate one over the other, so both are presented with a recommendation:

- **Build-time selection (recommended default)**: an environment variable (e.g. `VITE_THEME=voiceforce|katon|<customer-id>`) selects which config's generated CSS is bundled for that deployment. This matches how the brief frames "customers" (each customer is presumably its own deployment/tenant, not a single running instance serving multiple brands simultaneously to different logged-in users) and requires **no new serverless function, no new database table, and no runtime fetch** — fully consistent with this project's repeatedly-reinforced Vercel Hobby 12-function ceiling and "reuse existing endpoints" discipline (both explicit constraints throughout the 7.3 audit and this codebase's session history).
- **Runtime selection (optional extension, not required for the core acceptance criterion)**: a `data-theme="<config-id>"` attribute on `<html>`, with each registered config's CSS variables compiled into a separate block selected by that attribute (same pattern `:root` vs `.dark` already uses for light/dark mode — this is a direct, proven extension of an existing mechanism, not a new one). This would allow live preview/switching without a rebuild, useful for a sales demo or an internal "preview this customer's theme" admin screen — but it is explicitly **optional**, scoped to a later session only if requested, and must not be assumed required to satisfy the brief's acceptance criterion (which only requires that changing a config's value changes the rendered property consistently — build-time selection satisfies this).

**Recommendation: build-time selection for the core roadmap (Sessions 7.5–7.11 below); runtime selection proposed as an optional Session 7.12 extension, not a dependency of anything else.**

### A.5 What explicitly does NOT change

- The seven-pillar sidebar navigation *structure* (`pillarNav.ts`) and `Layout.tsx` shell layout — only the *visual styling of navigation states* (hover/active/selected colors, per decision 4) becomes configurable, never which pillars/items exist or how they're organized.
- Every page's data-fetching, permission (`hasPermission`/Agent Scope/`requirePermission`), routing, and business-logic code.
- Component prop APIs.
- **VoiceForce's existing appearance and operational density, exactly** (decision 1 — no longer an open question; see the revised §C.3). Session 7.7 (§F) exists specifically to prove this with a pixel-parity gate before any migration work proceeds, and the Configuration-Coverage Gate before Session 7.11 (§F) re-proves it app-wide, across the complete route/state inventory, before a second config is authored.
- Vercel function count (stays at 12 — this entire roadmap is a `.tsx`/`.ts`/`.css`/config-file effort, never an API route).
- **No curriculum-specific functionality or components** (decision 3) — every element in §B's schema maps onto a property VoiceForce's existing component set already has or needs for its own purposes; nothing is built speculatively because KATON happens to have it.

---

## B. Complete configuration schema and element inventory

Every category below is sourced from the 7.3 audit's §B KATON inventory (now using the exact values recovered from the KATON `.mhtml` source, per that document's revision) cross-referenced against what Call Centre currently has (7.3 §C). "Status" reflects whether the *token* exists today, not whether it's adopted (adoption is §D).

| Category | Sub-properties | KATON source value (7.3 §B) | Call Centre today | New token needed? |
|---|---|---|---|---|
| **Typography — families** | Interface font, (optional) secondary/content font | Roboto (interface), Roboto Slab (content, via `font-book` utility) | No `fontFamily` token exists | Yes — add `--font-interface` (+ optional `--font-content` only if a content/body-text distinction is ever needed; VoiceForce has no "book content" analog per 7.3 §F, so this sub-property may simply be unused by VoiceForce's own config while still present in the schema for configs that need it). |
| **Typography — scale** | 9 steps: size/line-height/weight/named-usage | 13/18→30/36, 8 of 9 are stock Tailwind sizes, only 13px custom | 312 arbitrary-pixel values, 8 distinct, no scale token | Yes — `--text-xs` … `--text-3xl` (or equivalent named steps) each carrying size+line-height+default-weight. |
| **Colour — brand/action** | 6 steps (primary, accent, action, action-pressed, selected, highlight) | Exact hex, 7.3 §B.3 | `--primary`/`--secondary`/`--accent` exist but are not a 6-step scale | Partial — extend to match the full 6-role structure (names may differ per customer; VoiceForce's config maps its existing 3 onto whichever of the 6 roles are meaningful, leaving others aliased to the nearest existing token rather than inventing new VoiceForce brand colors that don't exist today). |
| **Colour — neutrals** | 6 steps (ground/subtle/divider/border/field-border/secondary-text) | Exact hex | `--background`/`--card`/`--border`/`--muted`/`--muted-foreground` roughly map 1:1 already | No new token category — closest existing match of any KATON category; mostly a renaming/mapping exercise. |
| **Colour — semantic/status** | 3 roles × (text color + fill color) — KATON names them Confirmed/Rejected/Attention; a generic schema should use polarity-neutral names (`positive`/`negative`/`caution`, matching `Badge`'s existing `positive`/`escalated`/`warning` naming already) | Exact hex + fill pairs, 7.3 §B.3 | Only `--destructive` exists; no `--success`/`--warning`/`--info`-equivalent; **no fill-companion token concept exists at all today** (current code approximates this via Tailwind's `/10` opacity modifier on the same color, not a true second token) | Yes — this is the single largest net-new token category: 3 (or more, per-config) semantic roles × 2 tones (text + fill) each. |
| **Spacing** | Scale steps | 4,6,8,10,12,16,20,24,28,32,40,48px — Tailwind's own default scale | No explicit token, but negligible arbitrary-spacing usage (3 occurrences total, 7.3 §E.6) | Low-priority — add an explicit token set for completeness/customer-configurability, but this is the one category where "no work needed for VoiceForce's own visual output" is already true. |
| **Radii** | tag / control(button,field) / panel / card / pill | 4 / 6 / 8 / 10 / full px | `--radius` is a single token today, 3 derived variants | Yes — expand from 1 base token to the 4-category structure KATON uses (tags, controls, panels, cards each independently radius-able). |
| **Borders** | width (default), focus-ring width, dashed style + where it's used semantically | 1px default, 2px focus, 1px dashed for "not yet confirmed" states | `--border`/`--ring` exist as colors; border *widths* are hardcoded Tailwind classes (`border`, `border-2`) at each call site, not tokenized | Yes — width/style tokens; also requires deciding whether VoiceForce adopts KATON's "dashed = not yet confirmed" semantic (a convention, not just a token) or leaves that convention unused in its own config while keeping the token available. |
| **Control heights** | primary-action / default-control / form-field / filter-field / top-bar / sidebar-width | 44/36/40/36/56/224px | Hardcoded per-component Tailwind height classes (`h-7`/`h-8`/`h-9` etc., including the documented Phase-2B `xs` button size, 7.3 §C) | Yes — token the values, but **VoiceForce's own values are its current, denser `h-7`/`h-8`/`h-9` heights, not KATON's 44/36/40/36/56/224px** (decision 1 — density is fixed, not an open decision; see revised §C.3). KATON's config uses KATON's own values; nothing about VoiceForce's rendered height changes. |
| **Icons** | library, default size, compact size, stroke width | Lucide, 20px default / 14–16px compact, stroke 1.75 | Already Lucide (`lucide-react`), sizes are hardcoded per call site (`h-3.5 w-3.5` etc., extremely common pattern throughout this session's own recent work) | Partial — library already matches (zero-cost); size/stroke become tokens using VoiceForce's own current denser sizes as its baseline (decision 1), never silently widened toward KATON's values. |
| **Shadow** | one elevation value | A single shadow, used only for menus/panels-over-content/previews | No shadow token; `shadow-*` Tailwind utility classes used ad hoc — **count not established by the 7.3 audit** (a gap identified here, to be closed as a first step of the relevant session per decision 4) | Yes — one token per config; Session 7.5 (§F, revised) now includes auditing existing `shadow-*` call-site count/locations before the token is finalized. |
| **Cards / panels** *(new category, decision 4)* | Surface background, border, padding rhythm, header treatment, radius (already covered above), shadow (already covered above) | Not separately itemized by KATON beyond the radius/border/shadow values already captured above — KATON's "panel"/"card" distinction is primarily a radius difference (8px vs 10px, §B above) | `Card`/`CardHeader`/`CardContent` primitives exist in `components/ui/card.tsx` (confirmed in the 7.3 fork's primitive inventory) and are token-driven at the primitive level; **adoption across the 54-file/12-page population found in 7.3 was not separately measured for cards specifically** (7.3 measured status-color and table adoption, not card-wrapper adoption) | Partial — the token layer mostly already exists via the radius/border/shadow tokens above; what's new is (a) confirming/measuring actual `Card` adoption vs. hand-rolled `<div className="rounded-md border ...">` panels (very common pattern throughout this codebase's recent session history, including this week's own `QaCalibration.tsx`/`AutomatedQaInspector.tsx` work) and (b) migrating the hand-rolled ones, mechanically similar to the status-color migration. |
| **Navigation states** *(new category, decision 4)* | Sidebar item Default/Hover/Active-selected/visited(if any); top-bar states | Not separately itemized in the three KATON pages audited (they document app-level controls/data/feedback, not KATON's own navigation chrome in detail) — VoiceForce's own navigation states are therefore the primary source for this category's values, not KATON's | `pillarNav.ts` defines nav *structure* (unchanged per decision, §A.5); the *visual* hover/active/selected treatment of sidebar items is implemented in `Layout.tsx`/`Sidebar`-related files via Tailwind classes referencing the existing `--sidebar-*` tokens (7.3 §C already found these 7 tokens exist) — **adoption/hardcoding count not established by 7.3** (another gap closed in the revised Session 7.5 audit step). | Partial — the 7 `--sidebar-*` tokens already exist (7.3 §C); what's new is confirming every nav-state class site actually references them (vs. a hardcoded hex/Tailwind-palette class) and token-izing any state (e.g. a hover treatment) that currently isn't covered by the existing 7 tokens. |
| **Charts** *(new category, decision 4)* | Series color palette, axis/gridline color, tooltip surface style | Not present in the three KATON pages audited at all — no chart/graph example was shown in any of the 12.1/12.2/12.3 source pages | `components/ui/chart.tsx` exists (confirmed in the 7.3 fork's 47-component inventory) as a Recharts wrapper; which pages actually render charts (e.g. `Analytics.tsx`, `Ratios.tsx`/`RatioExplorer.tsx`, Dashboard widgets) and whether their series colors reference tokens or hardcode a palette array was **not measured by 7.3** (a new audit item for the revised Session 7.5). | Yes — a chart-series color-scale token (an ordered array of N colors, since a single color role doesn't cover multi-series charts) is new; axis/gridline/tooltip styling likely already rides on existing neutral/surface tokens once `chart.tsx` is confirmed to consume them, but this needs verification, not assumption. |
| **Responsive / breakpoint properties** *(new category, decision 4)* | Not itemized as a named token set in the three KATON pages (no breakpoint values shown) — KATON's pages were documented at a single desktop viewport | Tailwind's own default `screens` config (`sm`/`md`/`lg`/`xl`/`2xl`), unmodified in `tailwind.config.ts` per the 7.3 audit (no `screens` extension found) | No new token category is required for VoiceForce's own output (Tailwind defaults are already what's used, and decision 1 means they don't change) — **but the schema still needs a `breakpoints` field** so a future customer config *could* override them if that customer's design system specifies different values; until a customer requires it, VoiceForce's and KATON's configs both simply reference Tailwind's stock breakpoints. | Yes, schema field only (low effort) — no migration work implied for either current config. |
| **Component states — Button** | Default/Hover/Focus/Pressed/Disabled/Busy | All 6 documented with exact visual treatment per variant | Default/Hover/Disabled exist via Tailwind/Radix; Focus ring style and a true Busy (spinner+label-swap) state were **not confirmed present** in `button.tsx` by the 7.3 audit | Needs verification + likely addition of a `loading`/`busy` prop. |
| **Component states — Form fields** | Default/Focus/Filled/Error/Disabled | All 5 documented, Error includes a below-field message pattern | `Input` exists; Error-state wiring (border + message) not confirmed as built-in vs. per-form reimplementation | Needs verification + likely a shared error-message slot/pattern. |
| **Component states — Tables** | Default/Hover/Selected/Loading rows, sortable headers | All documented | `Table` primitive exists; sort-indicator and Selected-row (as distinct from Hover) states not confirmed present | Needs addition — compounds with the 12-page table-adoption gap (§D). |
| **Component states — every other primitive** *(expanded scope, decision 4)* | Default/Hover/Focus/Active/Disabled (and Loading/Error where applicable) for every one of the 47 `components/ui/*` primitives, not only Button/Form/Table | Only the states KATON's three pages happened to show for Buttons/Forms/Selection/Tables were documented in 7.3 §B — Select, Dialog, Tooltip, Dropdown-menu, Tabs, Checkbox, Switch, etc. have no KATON-documented reference | Each primitive is individually token-driven today (7.3 §C confirmed zero hardcoded hex across every primitive spot-checked), but **state-by-state completeness was not individually verified for every one of the 47 primitives** — only the ones KATON's pages happened to illustrate | Needs a completeness pass (Session 7.5, revised) enumerating every primitive's actual implemented states against Tailwind/Radix's available state variants (`hover:`/`focus-visible:`/`active:`/`disabled:`/`data-[state=...]`), flagging any gap — not assumed complete merely because the primitive exists. |
| **Tags/badges** | Color-based variants (KATON: 4) | 7.3 §B.8 | `Badge` has 4 color variants (`positive`/`warning`/`escalated`/`outline`+`default`/`secondary`) | Partial — color variants already exist and map cleanly; **the dashed-border "provenance" axis (KATON: solid border = "from the book," dashed border = "added by the system") is explicitly OUT OF SCOPE per decision 3** — VoiceForce has no functional concept of content provenance requiring a visual marker, so this is not built, not even as an unused schema field. KATON's own config documents this KATON-specific element as "not implemented — no VoiceForce functional requirement," rather than being silently dropped without explanation. |
| **Workflow/progress stage indicator** | Multi-step, color + border-style + icon + inline-text combined | 7.3 §B.9 | **No equivalent component exists anywhere in Call Centre, and none is built by this roadmap** | **Explicitly OUT OF SCOPE per decision 3.** This is the clearest example of a KATON element with no VoiceForce functional requirement — Call Centre's existing status pipelines (e.g. campaign target status, action-item status) are already served by `Badge`, and no session in §F builds this component. KATON's own config documents it as out of scope, same as the provenance-tag axis above. |
| **Feedback banners** | Success/Warning/Error, icon + bold-lead + detail text | 7.3 §B.10 | `Alert` has `default`/`destructive` only; `QueryErrorBanner` is error-only | Yes — extend `Alert` with the missing variants once semantic colors exist. |

---

## C. Migrating existing VoiceForce styles into configuration without changing appearance

This is the highest-risk-if-done-carelessly, lowest-risk-if-done-correctly part of the whole program, because "without changing appearance" is a falsifiable, screenshot-verifiable claim — treat it as one.

### C.1 Method: extract, don't redesign

For every existing CSS custom property (the 19 already in `src/index.css`) and every hardcoded value identified in the 7.3 audit, the VoiceForce baseline config is built by **literally reading the current value out of the current file and placing it into the new schema unchanged** — never by "what should this be" judgment. Example: `--destructive`'s current HSL value becomes `voiceforce.config.ts`'s `color.semantic.negative.text` value verbatim; it is not recolored to match any other system's idea of "destructive red."

### C.2 Method: the arbitrary-pixel values become the VoiceForce baseline's typography scale, not KATON's

The 8 distinct arbitrary-pixel sizes found in 7.3 (9/10/11/12/13/14/16/18px) become VoiceForce's own `typography.scale` entries in its config — preserving the exact current density — rather than being remapped onto KATON's 9-step ramp as part of "making VoiceForce configurable." KATON's ramp becomes relevant only when the *KATON config* is authored (§F, a later session) and is never retroactively forced onto VoiceForce's own screens.

### C.3 Density — resolved (decision 1): VoiceForce's exact current density is the fixed baseline

The 7.3 audit (§I) documents that Call Centre's current density (compact `h-7`/`h-8` rows, 9–11px text, "no oversized cards") is a repeatedly-reinforced, deliberate product decision across many prior sessions. KATON's control heights (44/36/40/36px) and type floor (13px minimum) are measurably larger/looser than VoiceForce's current defaults. **This is no longer an open question**: VoiceForce's config preserves its exact current density, in full, as a fixed baseline — every height/size token in §B's "Control heights" and "Icons" rows is populated from VoiceForce's *own current measured values*, never from KATON's. KATON's larger values exist only inside `katon.config.ts` and are never applied to any VoiceForce build. This removes density as a risk item from every migration session below — no session's acceptance criteria permit a height/size change to any VoiceForce screen.

### C.4 Curriculum-specific KATON elements — explicitly not built (decision 3)

The workflow-stage indicator and the dashed-border "provenance" tag mechanism (§B) have no VoiceForce functional requirement. **They are not built, in any form, by any session in this roadmap** — not as an unused component awaiting future use, not as a dormant schema field. This is a firmer position than the original draft's "build but don't wire up" proposal, per the explicit decision that curriculum-specific components must not be introduced merely because they appear in KATON. When `katon.config.ts` is authored (Session 7.11), its own documentation records these two elements as "present in the KATON source, not implemented — no corresponding VoiceForce functional requirement," so the gap is traceable and intentional, not a silent omission. If a future, separate product decision ever gives VoiceForce an actual functional need for either (e.g. a genuine multi-step workflow concept emerges in a product area), that would be scoped as its own new session with its own justification — never retroactively justified by "KATON already has it."

### C.5 Verification method for "no appearance change"

Every migration session in §F that touches existing files ends with a live-screenshot comparison pass (the same discipline already standard in this codebase's session history) against the pre-migration production deployment, for a representative screen sample per pillar — not a visual-diff tool (none is confirmed available in this environment), but direct side-by-side screenshot comparison, documented in that session's completion report. **This per-session sampling is sufficient for each individual migration session's own gate**, but per decision 6 it is explicitly *not* sufficient for the final pre-KATON checkpoint — see the Configuration-Coverage Gate in §F, which requires the complete route/state inventory instead of a sample.

---

## D. Eliminating decentralized styling safely

This is a direct continuation of the 7.3 audit's own §H Phases 3–5, reframed under the configurability requirement rather than general tidiness:

1. **Status-color consolidation (51 files)** — each hand-typed status-color call site is migrated to `Badge`'s variants (extended per §B to cover the full semantic/fill token set). *Safety mechanism*: migrate one pillar/feature area at a time (not all 51 in one pass), screenshot-verify each batch before moving to the next, and keep the existing `src/lib/automatedQaStatusBadge.ts`-style one-off maps as the last thing removed in each batch (delete only after its replacement is live-verified, never delete-then-replace).
2. **Table consolidation (12 pages)** — migrated onto the shared `Table` (first extended with sort/selected/loading states per §B). *Safety mechanism*: tables carry real interaction logic (sort handlers, row click-through, selection state) — each migration is verified functionally (sorting/clicking still works), not just visually, and is treated as higher-risk than the status-color work (7.3 §H Phase 4 already flags this as the largest single remediation item).
3. **Typography remap (312 occurrences, 37 files)** — once VoiceForce's baseline scale tokens exist (§C.2), mechanically replace `text-[Npx]` with the matching scale class. *Safety mechanism*: this is the one migration category safe to automate as a scripted find-and-replace (text size only, no logic, and the baseline scale is defined to exactly match current values) followed by a single visual-regression screenshot pass rather than per-file manual review.
4. **Feedback-banner consolidation (3-way split: `QueryErrorBanner` / `Alert` / ad hoc divs)** — converge onto `Alert` (extended with success/warning variants) as the one mechanism; `QueryErrorBanner` either becomes a thin wrapper around `Alert` or is deprecated in favor of it, decided during the relevant session once both are inspected side by side.
5. **Raw `<button>`/raw form-field patterns** — lower priority than 1–3 above (7.3 found these scattered across pages that *also* already use the real `Button`/`Input` components, so the fix is narrower per file); addressed opportunistically within the same session as whichever other migration touches that file, not as its own dedicated session, to avoid an eighth+ session for comparatively small payoff.
6. **Card/panel surface consolidation** *(decision 4)* — hand-rolled `<div className="rounded-md border border-border bg-card ...">`-style panels (a very common pattern across this codebase's recent session history) migrated onto the `Card` primitive where a genuine card/panel semantic applies. *Safety mechanism*: same batched, screenshot-verified approach as item 1 — this is a presentation-only, visually-narrow change per file.
7. **Chart color-token consolidation** *(decision 4)* — any chart/graph call site's series/axis/gridline colors migrated to reference the new chart-palette token (§B) instead of a hardcoded array. *Safety mechanism*: charts are comparatively few in number (confirmed to exist via `components/ui/chart.tsx`, exact page count to be established at the start of the session that performs this work, per §B's noted audit gap) — each migrated chart is screenshot-verified for both correct colors and continued correct data rendering (a chart is more likely than a badge to have a subtle rendering regression if a color-array migration is done carelessly).
8. **Navigation-state consolidation** *(decision 4)* — any sidebar/top-bar hover/active/selected treatment not already referencing the existing `--sidebar-*` tokens is migrated to do so. *Safety mechanism*: this touches `Layout.tsx`/`Sidebar`-adjacent files, which every page depends on (same risk class as Session 7.7's cutover) — verified via the same full-route-inventory discipline as that session, not a sample, given the blast radius of a mistake here.

**What is explicitly NOT part of "eliminating decentralized styling"**: any change to what data a screen fetches, what permission gates it, or how its interaction logic works. Every item above is a presentation-layer-only migration, consistent with every prior session in this codebase's history that has touched shared UI (e.g. this week's own QA Calibration sessions never altered `qaComparison.ts` while restructuring its presentation).

---

## E. Creating, validating, selecting, and applying future customer configurations

### E.1 Creation

A new customer config is authored as a new `<customer-id>.config.ts` file implementing the schema in §B, by one of two paths depending on what the customer supplies:
- **Design-system source material exists** (like KATON's three documented pages): populate the config directly from that material, following the same extraction discipline as §C.1 (literal values, not judgment calls) — and, per the 7.3 audit's own hard-won lesson this session, **insist on complete source material (not a truncated screenshot) before finalizing any token value**.
- **No formal design system, only brand guidelines/examples**: a config is drafted from the available material, explicitly flagging any inferred (vs. documented) value the same way the 7.3 audit flagged its own screenshot-based inferences — never silently filling gaps with guesses presented as fact.

### E.2 Validation

A config is validated two ways before it can be selected for a build:
1. **Schema validation** — every required field in §B's schema present and correctly typed/formatted (e.g. valid hex/HSL, numeric scale steps in ascending order) — a straightforward TypeScript-type-level or Zod-schema-level check, runnable in CI without any new deployment infrastructure.
2. **Visual acceptance pass** — a build using the new config is deployed to a preview environment (Vercel's existing preview-deployment mechanism for non-`main` branches already does this at zero additional infrastructure cost) and screenshot-compared against the reference design material for a representative screen sample, by the same discipline as §C.5.

### E.3 Selection

Per §A.4's recommendation, selection is a build-time environment variable. The registry of available configs is a simple exported map (`src/theme/configs/index.ts` or similar) — adding a customer is adding one new file plus one new map entry, never a code change to any consuming screen or component.

### E.4 Application

The theme engine (built in §F's roadmap) consumes the selected config at build time and generates the CSS custom property declarations that replace/extend the current static `src/index.css` block. No runtime cost, no new API surface, no database involvement — consistent with the "no screen-level code changes" and "same screens/components/routes/business logic" requirements stated in the brief.

### E.5 Onboarding checklist (produced as a deliverable of Session 7.11, not invented here)

A future customer onboarding is intended to reduce to: receive/extract design values → author config file → validate (E.2) → add to registry (E.3) → build with that config selected → deploy. **No step in that sequence touches `src/pages/*` or `src/components/*` — this is now a binding requirement (decision 2), not an aspiration.** The one-time primitive-extension work done once across Sessions 7.5–7.10 benefits every future config, including ones onboarded years from now; onboarding a new customer after this roadmap completes is config-file-and-registry-entry work only, verifiable the same way Session 7.11 verifies it for KATON — a `git diff` showing no `.tsx` changes outside the one new config file and its registry entry.

---

## F. Session roadmap

**Session count and reasoning**: the seven core sessions (7.5–7.11) approved are retained unchanged in number; decisions 3–6 are absorbed by widening what each session's scope covers, not by adding an eighth or ninth session. This works because the newly in-scope categories (charts, cards, navigation states, icons, shadow, responsive, full component-state coverage) each attach naturally to an existing session along the same risk-profile lines the original split already used: foundational/schema work joins 7.5–7.7, color-and-surface migrations join 7.8, interaction-bearing/high-blast-radius migrations join 7.9, and scale/mechanical migrations join 7.10. The one genuinely new structural element is the **Configuration-Coverage Gate** (decision 5) between 7.10 and 7.11 — this is a go/no-go checkpoint with its own measurable criteria, not a session (it produces a verification report, not new product code), so it does not count against the "seven sessions" figure.

---

### Session 7.5 — Token Schema Design, Full-Property Gap Specification & New-Category Audit

**Objective**: Define the complete, typed configuration schema (§B, now covering every visual property per decision 4 — not only typography/color/spacing/radii/borders/heights/icons/shadow/button/badge/alert/table, but also charts, cards/panels, navigation states, responsive/breakpoints, and the full per-primitive state matrix), and close the specific measurement gaps §B identifies that the 7.3 audit didn't quantify (shadow usage count, card/panel-wrapper adoption, chart call-site count, nav-state hardcoding count, per-primitive state completeness). This session also produces the **master configuration-coverage checklist** that the new Gate (below, between 7.10 and 7.11) measures against — this is what makes decision 5's gate *measurable* rather than a subjective "looks done" call.

**Exact scope**: `src/theme/schema.ts` (or equivalent) containing the full typed schema from §B, every category. The same `grep`-based, denominator-stated audit method the 7.3 audit used, applied to the five newly-identified gaps above (producing real counts, not estimates, for shadow/card/chart/nav/per-primitive-state coverage — read-only investigation, same as 7.3's own method). A companion spec document listing every new CSS custom property name, its category, and which existing hardcoded values it is intended to eventually replace, citing exact counts. The master coverage checklist: one row per schema category, each with its current adoption metric (0 where not yet measured until this session's audit step fills it in) and the target metric the Gate will check. No existing file is modified. No config instances are authored yet (that's 7.6).

**Dependencies**: The 7.3 audit (complete) and this roadmap's approval.

**Expected deliverables**: `src/theme/schema.ts`; `docs/SESSION_7_5_UI_CONFIG_SCHEMA.md` documenting every field, its KATON-source justification (§B) or explicit out-of-scope marker (for the two decision-3 exclusions), and its VoiceForce-equivalent-today status; the master configuration-coverage checklist (as its own document or a section of the above) with real, freshly-measured counts for every category including the five new ones.

**Acceptance criteria**: Schema covers every row in §B's table with no gaps, including the four new categories and the full per-primitive state matrix; every previously-unmeasured metric in §B (shadow/card/chart/nav/state-completeness) now has a real, cited count; `npm run typecheck` passes; no other file in the repository changes.

**Regression risk**: None — purely additive and investigative, unconsumed by any existing code.

**Stop conditions**: Do not author the VoiceForce baseline values (7.6). Do not touch `tailwind.config.ts` or `src/index.css`. Do not build the curriculum-specific elements excluded by decision 3. Do not start 7.6.

---

### Session 7.6 — VoiceForce Baseline Configuration (Extraction, Not Redesign)

**Objective**: Populate `voiceforce.config.ts` against the 7.5 schema using VoiceForce's *current, actual* values (§C.1/§C.2) for every category including the four new ones, proving the schema is sufficient to describe the existing UI exactly, with zero visual change.

**Exact scope**: Author `src/theme/configs/voiceforce.config.ts`. Extract every value from the current `src/index.css`/`tailwind.config.ts`/component files — the 19 existing CSS vars, the 8 arbitrary type sizes as the baseline scale, current spacing/radius/height/icon values as literally observed (not KATON's — density is fixed per decision 1, §C.3, nothing to resolve here), **plus the newly-scoped values**: current shadow usage (if any beyond Tailwind's default `shadow`/`shadow-md` classes), current card/panel treatment, current chart series colors (if charts exist and have a de facto palette today), current nav hover/active/selected colors (reading the existing `--sidebar-*` token usage). Explicitly record the two decision-3 exclusions (workflow-stage indicator, provenance border-style) as "not implemented" in the config's own documentation, not silently omitted. Build (but do not yet wire into the actual running app) the theme engine's *generation* function only as much as needed to prove the config round-trips to the exact current CSS values (a unit test, not a live app change).

**Dependencies**: Session 7.5.

**Expected deliverables**: `voiceforce.config.ts`; a deterministic test (`*-verify.mjs`, matching this codebase's existing test convention) proving the generated CSS custom properties exactly match today's `src/index.css` values, token-for-token.

**Acceptance criteria**: 100% of the 19 existing tokens reproduced exactly; every schema category from §B (including charts/cards/navigation/responsive) populated with a real current-codebase value or an explicit, documented "not currently used by VoiceForce" marker (never a guessed value); the round-trip test passes; still zero changes to any file the running application actually loads.

**Regression risk**: None — the config exists but nothing consumes it yet; the running application is byte-for-byte unchanged.

**Stop conditions**: Do not modify `src/index.css` or `tailwind.config.ts` themselves yet (that's 7.7). Do not build the decision-3-excluded components. Do not start 7.7.

---

### Session 7.7 — Theme Engine Wiring, Shell/Navigation Tokenization & Pixel-Parity Cutover

**Objective**: Make the running application actually consume `voiceforce.config.ts` through the (now real, not test-only) theme engine, replacing the static `src/index.css` token block with generated output, and tokenize the app shell/navigation-state styling (decision 4) at the same time since `Layout.tsx` is the one file every page depends on and this is already the session verifying that exact blast radius — the first session where the *live app* changes, and the one with the hardest verification gate of the "foundation" sessions.

**Exact scope**: Build the real generation step (build-time, per §A.4) that turns `voiceforce.config.ts` into the CSS custom properties `tailwind.config.ts` and every component already reference, now including shadow and breakpoint tokens. Wire it into the build pipeline. Remove (or reduce to a generated-output target) the static hand-written block in `src/index.css`. Confirm/migrate every `Layout.tsx`/sidebar hover-active-selected class site onto the existing `--sidebar-*` tokens (7.3 §C already confirmed these 7 tokens exist; this session confirms/completes their actual consumption, per §D item 8). No component file, no page file, and no `tailwind.config.ts` *structure* (only its generated values, never its shape) changes; nav *structure* (`pillarNav.ts`'s pillar/item list) is untouched, only its rendered color states.

**Dependencies**: Session 7.6's verified round-trip.

**Expected deliverables**: Working build-time generation wired into the actual build; `src/index.css` now either fully generated or generated-plus-a-clearly-marked-static-remainder; nav-state tokenization complete; a **first full-route-inventory screenshot pass** (every route in `App.tsx`'s route table, in its default/authenticated-loaded state — not yet the full route×state cross-product the final Gate requires, but every route at least once, since this session uniquely touches the shell every route renders inside).

**Acceptance criteria**: Every route's screenshot in the full-route pass is visually indistinguishable from the pre-cutover production deployment, specifically including the sidebar/top-bar chrome on every one of them; `npm run verify:full` green; Vercel function count unchanged at 12; no new API route.

**Regression risk**: **Medium-high** — this is the first session where a mistake is visible to every user of every screen simultaneously (it touches both the token file and the shell every page renders inside). Mitigation: deploy to a preview URL first, run the full-route screenshot pass there, and only then promote to production — exactly the existing preview-deployment discipline this codebase already has available via Vercel, applied here for the first time as a formal gate rather than an optional step.

**Stop conditions**: Do not begin any status-color/table/typography/chart/card migration (7.8–7.10) until this session's full-route pixel-parity verification is signed off. Do not start a second config (KATON) yet.

---

### Session 7.8 — Status-Colour, Card/Panel Surface & Chart Token Consolidation (51 status files + card/chart population per 7.5's audit)

**Objective**: Migrate every hand-typed status-color call site found by the 7.3 audit onto `Badge`'s variants, and — the decision-4 scope addition — migrate hand-rolled card/panel surfaces onto the `Card` primitive and chart color arrays onto the new chart-palette token, since all three are primarily color/surface-token consumers with the same (visual-only, non-interactive) regression-risk profile.

**Exact scope**: Extend `badge.tsx`'s `cva` variants to the full semantic set (§B's "Colour — semantic/status" row). Migrate the 51 status-color files (7.3 §E.1) in batches per §D.1's safety mechanism — a reasonable batch boundary is per-pillar (QA, Campaigns, Admin, etc.), each batch screenshot-verified before the next begins. In the same session, migrate the card/panel population and chart population Session 7.5's audit step quantified (§D items 6–7) — these are smaller, newly-measured populations, batched the same way. Do not touch `AutomatedQaInspector.tsx`'s, `QaCalibration.tsx`'s, `Analytics.tsx`'s, or any other file's *data logic* — only status-rendering/surface/chart-color class strings and props.

**Dependencies**: Session 7.7 (tokens must be real and wired, including the new chart-palette and card-surface tokens from the 7.5/7.6 schema work).

**Expected deliverables**: `badge.tsx` extended; all 51 status-color files, plus the card and chart populations, migrated (or, for any genuinely incompatible case, explicitly documented as a deliberate exception in the completion report, never silently skipped); the 7.3 audit's own measurement method re-run for status colors, and the new Session-7.5-established methods re-run for cards/charts, each reported with its new count.

**Acceptance criteria**: Re-measured hand-typed-status-color file count at or near 0; re-measured card/panel and chart hardcoding counts at or near 0; every exception named; no business logic, authorization, or data-fetch code touched in any migrated file (verifiable via diff review); `verify:full` green; any migrated chart is confirmed to still render its underlying data correctly, not just its colors (charts are the one sub-category here where a color-array migration could subtly break data mapping, not just appearance).

**Regression risk**: Medium — wide file count across three sub-categories, but each individual change is narrowly scoped to a className/prop; the primary risks are a subtly wrong variant choice producing an incorrect-but-plausible color (status/cards) or a miscounted color-array index shifting which series gets which color (charts) — per-batch screenshot verification, with chart batches specifically double-checked against their data, not just colors.

**Stop conditions**: Do not begin table/navigation migration (7.9) in this session. Per decision 3, do not build the provenance dashed-border mechanism or the workflow-stage component — they are not part of any session.

---

### Session 7.9 — Table Consolidation (12 pages) & Navigation-State Verification Completion

**Objective**: Extend the shared `Table` primitive with the missing states (sort indicator, distinct Selected-row styling, Loading skeleton rows, per §B) and migrate the 12 hand-rolled tables (7.3 §E.3) onto it. Also close out any navigation-state call site Session 7.7's shell pass didn't fully cover (per decision 4's full-state-matrix requirement) — grouped here rather than in 7.7 because by this point the table work's row-selection-state pattern and nav's item-selection-state pattern are being verified with the same interaction-testing discipline, making it efficient to close both in one session rather than reopening `Layout.tsx` a third time.

**Exact scope**: Extend `table.tsx` (and/or introduce a thin `DataTable` wrapper around it if sort/selection state management is better centralized there than per-page — a decision for this session, not pre-decided here). Migrate the 12 pages one at a time, each verified both visually *and functionally* (sort still works, row click-through still navigates correctly, selection state if present still behaves correctly) per §D.2. Re-run Session 7.5's nav-state hardcoding measurement; close any residual gap found.

**Dependencies**: Session 7.7 (for header/row color tokens and the nav-token baseline); independent of 7.8 (could in principle run in parallel, but sequenced after for risk-isolation reasons, not a hard technical dependency).

**Expected deliverables**: Extended `Table`/`DataTable`; 12 pages migrated; the 7.3 audit's 4/16 table-adoption measurement re-run and reported; the nav-state measurement re-run and reported at 0 (or every residual exception named).

**Acceptance criteria**: Re-measured shared-`Table` adoption at or near 16/16 (any exception named and justified); nav-state hardcoding at 0; all sort/click/selection/nav interaction behavior verified unchanged per-page (functional, not just visual, testing); `verify:full` green.

**Regression risk**: **High relative to the other migration sessions** — tables carry the most page-specific interaction logic of anything in this roadmap (7.3 §G already flagged this as the single largest-effort item), and navigation is the highest-blast-radius surface in the app. Mitigation: migrate and verify one page/one nav-state-change at a time, never batch multiple unverified changes into one commit.

**Stop conditions**: Do not begin typography/icon/shadow/responsive migration (7.10) in this session.

---

### Session 7.10 — Typography, Icon, Shadow & Responsive Token Migration + Final Complete-Inventory Regression Pass

**Objective**: Replace every arbitrary `text-[Npx]` occurrence with the matching baseline-scale class from `voiceforce.config.ts` (§C.2 — the scale that exactly preserves current sizes), and close out the remaining mechanical, scale-type migrations added by decision 4 (icon sizing, shadow usage, any remaining breakpoint-related hardcoding). This is the **last session that touches only VoiceForce's own screens** before the Configuration-Coverage Gate — it closes with the complete route/state regression pass decision 6 requires.

**Exact scope**: A scripted, mechanical find-and-replace across the 37 typography files (7.3 §E.2), using the exact 8-value mapping already established in 7.6's baseline config. Icon-size call sites (`h-3.5 w-3.5` etc., per 7.5's new audit count) remapped onto the icon-size tokens, preserving VoiceForce's current denser sizes exactly (decision 1). Shadow `shadow-*` call sites (per 7.5's audit) remapped onto the shadow token. Any `screens`-adjacent hardcoding found remapped onto the breakpoint schema field (expected minimal, since Tailwind defaults are already in use). **Capstone step**: a full route/state inventory regression pass — every route in `App.tsx` (not a sample), each in its key states (default load, loading/empty where the screen has one, an error state where `QueryErrorBanner`/`Alert` is reachable, and at least one "selected/expanded" interaction state for screens with that pattern, e.g. a table row selected, a drill-down panel open) — screenshotted and compared against the pre-Session-7.5 production baseline.

**Dependencies**: Session 7.6 (baseline scales must exist and exactly match current values), Session 7.7 (scales wired as real classes), and Sessions 7.8–7.9 complete (the full-inventory pass is only meaningful once every migration category has actually run).

**Expected deliverables**: 312 typography occurrences replaced; icon-size and shadow occurrences replaced per 7.5's counts; the 7.3 audit's arbitrary-pixel-occurrence count re-run (expected: at or near 0); a **Complete Route/State Regression Report** — the literal route inventory (every entry in `App.tsx`'s route table) crossed with the key-states method above, each cell's screenshot-comparison result recorded, not summarized away.

**Acceptance criteria**: Re-measured arbitrary `text-[Npx]`/icon-size/shadow counts at or near 0; the Complete Route/State Regression Report shows zero visual difference from the pre-migration baseline across every route and every tested state, with any genuine exception (e.g. a state that legitimately couldn't be reached/tested, such as one requiring specific seeded data) explicitly named rather than silently skipped; `verify:full` green.

**Regression risk**: Low for the mechanical remaps themselves (value-preserving by design, same as the original typography-only scope); the real value of this session is **detection**, not new risk — the complete-inventory pass is deliberately exhaustive specifically because sampling in every prior session could have missed something, and this is the checkpoint designed to catch it before a second config is ever authored.

**Stop conditions**: Do not begin KATON config authoring (7.11) in this session. Do not proceed past this session until the Configuration-Coverage Gate below is formally passed.

---

## Configuration-Coverage Verification Gate (decision 5) — required before Session 7.11

This is a **go/no-go checkpoint, not a session** — it produces a verification report and a pass/fail determination, not new product code, which is why it does not add to the seven-session count (decision 7).

**What it checks, all against real, freshly re-measured numbers (not Session 7.5's original baseline counts — the numbers as they stand at the end of Session 7.10):**

1. **Schema completeness**: every category in §B's table has a populated VoiceForce value or an explicit, documented "not used by VoiceForce" marker — zero unresolved/placeholder fields.
2. **Adoption, re-measured per category, using the exact same `grep`-based method and denominators as the 7.3 audit and Session 7.5's new audits**:
   - Status-color hand-typed files: target 0 (baseline was 51/54).
   - Shared-`Table` adoption: target 16/16 (baseline was 4/16).
   - Arbitrary `text-[Npx]` occurrences: target 0 (baseline was 312).
   - Card/panel hand-rolled surfaces: target 0 (baseline established fresh in 7.5).
   - Chart hardcoded color arrays: target 0 (baseline established fresh in 7.5).
   - Navigation-state hardcoding: target 0 (baseline established fresh in 7.5).
   - Icon-size and shadow hardcoding: target 0 (baselines established fresh in 7.5).
   - Any category not reaching its target must have every remaining instance individually named and justified in the gate report — "close enough" without an itemized exception list does not pass the gate.
3. **The Complete Route/State Regression Report from Session 7.10** shows zero unexplained visual difference.
4. **Decision 3 compliance check**: confirm neither the workflow-stage indicator nor the provenance dashed-border mechanism exists anywhere in the codebase (a trivial `grep`/file-existence check, included because it's cheap and this is the natural final checkpoint before anyone might be tempted to add them "while touching this area anyway").

**Gate outcome**: only once all four checks pass does Session 7.11 begin. If any check fails, the gap is closed (as a continuation of whichever session owns that category, not a new numbered session) and the gate is re-run — the gate, not a calendar date, determines when 7.11 starts.

---

### Session 7.11 — KATON Configuration Authoring & First Multi-Config Proof

**Objective**: Author `katon.config.ts` from the corrected 7.3 audit's exact KATON values, and produce the first real second-configuration build — the actual proof that the architecture satisfies the brief's core requirement.

**Exact scope**: Populate `katon.config.ts` against the §B schema using the exact hex/px/typography/spacing/radii/border/height/icon/shadow values recovered from the KATON `.mhtml` source (7.3 §B, corrected revision) — never re-deriving them from scratch, and now covering every category the schema has, not just the original typography/color/table subset. The config's own documentation explicitly records the two decision-3 exclusions (workflow-stage indicator, provenance dashed-border) as "present in KATON's source material, not implemented — no VoiceForce functional requirement" — **neither is built in this session or any other**. Run a build with `VITE_THEME=katon` selected (§A.4/§E.3) and visually compare every screen in the route inventory (reusing Session 7.10's Complete Route/State methodology, now applied to the KATON build rather than a sample) against the actual KATON prototype pages (not just the audit document) for every property that *is* currently used by VoiceForce screens.

**Dependencies**: The Configuration-Coverage Gate above has passed — this is now a hard, checked precondition, not an assumption.

**Expected deliverables**: `katon.config.ts`; a build/preview deployment under the KATON config; a completion report demonstrating, with evidence, that changing the active config changed the rendered output consistently across the **complete route inventory** (the brief's core acceptance criterion, tested exhaustively, not sampled, for the first time).

**Acceptance criteria**: Every route from Session 7.10's Complete Route/State Regression Report now renders correctly with KATON's typography/color/spacing/radii/border/height/icon/shadow values, with zero `.tsx` file differences between the VoiceForce and KATON builds (verifiable via `git diff` showing only config-file and generated-CSS differences, no component/page changes); KATON's larger control heights/type floor are visibly applied in the KATON build without affecting the VoiceForce build (decision 1's density fix proven to actually hold under a real second config, not just asserted); the KATON config's documentation explicitly lists the two decision-3 exclusions.

**Regression risk**: Low for VoiceForce's own production deployment (this session produces a *second* build, it does not change what ships for VoiceForce's existing customers unless explicitly promoted); the risk is scoped entirely to "does the KATON build look right," which is a new-build-quality question, not a regression question.

**Stop conditions**: Do not promote the KATON build to replace VoiceForce's production deployment (two separate deployments/builds are expected to coexist, per §A.4). Do not build the workflow-stage indicator or provenance-dashed-border mechanism under any circumstance (decision 3 is absolute, not conditional on "while we're here"). Do not start Session 7.12 (optional runtime switching). Report and stop for approval before any further session.

---

### Session 7.12 (Optional, not required to satisfy the brief's acceptance criterion) — Runtime Theme Switching

**Objective**: If requested, extend the build-time-only mechanism from 7.5–7.11 with a `data-theme` attribute-based runtime switch (§A.4) for live preview/demo purposes, without removing the build-time path.

**Exact scope**: Compile multiple registered configs' CSS into attribute-selected blocks (same `.dark`-class pattern already used for light/dark mode); add a minimal, likely admin-only, UI control to toggle it (scope of that control — e.g. a Settings page addition — to be defined in this session, not pre-decided here, since it's optional and lower-priority).

**Dependencies**: Session 7.11 (at least two real configs must exist to make runtime switching meaningful).

**Expected deliverables**: Runtime-switchable theme attribute; a minimal toggle control; documentation of the performance/bundle-size tradeoff of shipping multiple configs' CSS in one build (a real cost this session must measure, not assume is negligible).

**Acceptance criteria**: Switching themes at runtime produces the same visual result as the equivalent build-time-selected build, for the same config; no regression to the build-time path's behavior.

**Regression risk**: Low-medium — new, isolated functionality, but bundle-size growth (shipping N configs' CSS instead of 1) needs explicit measurement against this project's existing performance characteristics before being accepted.

**Stop conditions**: This entire session is itself conditional on explicit approval — it should not be assumed part of the core roadmap. Do not start any further session without separate direction.

---

## Risks to existing UI optimizations (carried forward and sharpened from 7.3 §I)

- **Density** (§C.3) — **resolved, not open**: VoiceForce's exact current density is the fixed baseline per decision 1. The residual risk is purely *execution* risk (a migration session accidentally widening a height/size value despite the decision), which is why every migration session's acceptance criteria above explicitly forbid any height/size change, and why Session 7.10's Complete Route/State Regression Report and the Configuration-Coverage Gate both exist as independent checks of this specifically.
- **The `destructive`-reservation convention** (Session 11.1, per 7.3 §I) must be preserved in the new semantic-token naming — "negative"/"escalated"-equivalent status colors must not be collapsed onto the same token as genuine technical-failure `destructive` styling merely because both are "red" in KATON's palette too.
- **Asymmetric layout patterns** (the 58%/65% two-column workspaces, independently-scrollable evidence panels from the QA Calibration sessions) are layout decisions, not token values — nothing in this roadmap touches layout structure, and Session 7.9's table work specifically must not generalize a table's *column proportions* into a token (that would be scope creep beyond what §B's schema defines).
- **Authorization and data logic** are repeatedly called out as out-of-scope per migration session above — this is deliberate repetition, not padding, because the migration sessions (7.8–7.10) are exactly the kind of "touch every file" work where authorization code could accidentally be touched if not explicitly guarded against in review.
- **Scope creep toward curriculum-specific functionality** (decision 3) — the risk is not that this roadmap proposes building the workflow-stage indicator or provenance tags (it explicitly doesn't), but that a future session, "while touching this area anyway," could be tempted to add them. The Configuration-Coverage Gate's check 4 exists specifically to catch this before 7.11, and the same check should be repeated at the end of any future session that touches `Badge` or status-pipeline rendering.
- **Verification cost** (new, from decision 6) — a complete route/state inventory pass is materially more expensive than a representative sample, by design. This is an accepted, deliberate tradeoff (thoroughness over speed) for the specific checkpoints decision 6 names (Session 7.10's capstone pass and the Gate), not a standard this roadmap applies to every interim session's own verification (which remain sample-based per §C.5, to keep the overall program tractable).

---

## Summary recommendation

Proceed with Sessions 7.5 → 7.11 in strict sequence (each is a hard dependency of the next), with the Configuration-Coverage Gate as a required, measurable checkpoint between 7.10 and 7.11 (decision 5), and Session 7.12 treated as a separate, optional request rather than part of the core program. Density (decision 1) and the curriculum-specific-component exclusion (decision 3) are now fixed inputs to every session's acceptance criteria, not open questions. This sequence directly produces, at the end of 7.11, a demonstrated second working configuration — verified against the complete route inventory, not a sample — with zero per-screen code changes: the brief's literal acceptance criterion, proven exhaustively rather than asserted.

**Per the brief: nothing above has been implemented. This document is the proposal awaiting approval before Session 7.5 begins.**
