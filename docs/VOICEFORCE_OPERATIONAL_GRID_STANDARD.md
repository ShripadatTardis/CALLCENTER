# VoiceForce Operational Grid & Density Standard

Established by Session 11.1A, first implemented on Dashboard. This is a **product standard**, not implementation notes — future sessions should read this and reuse the grammar below rather than re-deriving row density/typography/badge/hover/focus rules screen by screen.

## Named standards (quick reference)

Session 11.2A normalized the rules below into short reusable codes. **Future screen prompts may cite these directly** (e.g. "Call details → G1", "Agent Load → P1") without redefining them — each code below is fully specified in its linked section, nothing further to restate.

| Code | Name | Applies to | Defined in |
|---|---|---|---|
| **G1** | Dense operational grid | Full tabular record sets — Live View interactions, Call Logs, Chat Logs, other complete datasets | §26 |
| **G2** | Compact summary rows | Bounded summary lists — Dashboard Needs Attention, Recent Calls | §27, and §3/§14 (original definition) |
| **P1** | Agent Load | Compact per-agent operational load summary | §28, and §15 (original definition) |
| **S1** | Corporate semantic status | Status badge visual language | §23 (original definition, referenced as S1 from here on) |
| **N1** | Origin-aware detail navigation | "Back" behavior on detail screens | §24 (original definition, referenced as N1 from here on) |
| **L1** | Bounded operational workspace | Whole-screen scroll behavior — page must not grow with backend record count | §29 |
| **C1** | Adaptive columns | Column width allocation in a grid/table | §25 (original definition, referenced as C1 from here on) |
| **F1** | Operational filter toolbar | Filter UX on operational record screens (Call Logs, Chat Logs) | §30 |
| **GR1** | Operational grouping | Grouped views of operational records | §31 |

Nothing below is a new rule invented for this table — G1/G2/P1/L1 are newly *named* here (§26–§29) to make G1 in particular precise enough to enforce (the existing §3 density target was written for `G2`-shaped summary rows and undershot how tall a real multi-column table row like Live View's was actually landing at); S1/N1/C1 already existed as named, numbered sections (§23/§24/§25) and are simply indexed here under their short codes for citation convenience. F1/GR1 (§30/§31) are new standards, not renamings of existing rules — established by Session 11.2B ahead of Call Logs/Chat Logs implementation, not yet applied to any screen.

## 1. Purpose

VoiceForce is a dense enterprise operations console, not a consumer dashboard. Repeated operational data (calls, agents, campaign targets, chat sessions) needs one consistent visual grammar so every screen reads as the same product. This document is that grammar.

## 2. "Records are rows, not cards"

A record is a row, not a card. Repeated operational records (a call, an agent, a target) render as dense rows/compact entity rows inside one section boundary — not as independent bordered cards.

Cards remain appropriate for: summary groups, major entities needing substantial information, configuration surfaces, distinct grouped concepts (e.g. the Needs Attention *section* is a card; each record *inside* it is a row, not a nested card).

## 3. Row density targets

- Normal operational row: ~40–44px desktop.
- Dense tabular row: ~36–40px where appropriate.
- Targets, not brittle requirements — a row may be taller when content genuinely needs it (e.g. a two-line identity+context row), never taller merely from generic padding, unnecessary wrapping, card styling, oversized badges, or excessive gaps.

## 4. Primary/secondary typography

- **Primary**: one line, high readability, moderate emphasis (`text-sm font-medium text-foreground`).
- **Secondary**: one compact muted line, smaller than primary (`text-xs text-muted-foreground`).
- **Metadata**: compact, low visual emphasis.
- **Status**: small semantic badge.
- **Action**: trailing/right-aligned.

Preferred row model: `Primary identity · secondary context   [right: Status, Duration]` on one line, or a compact two-line form only where genuinely clearer. Never stack 3–4 metadata lines where one compact secondary line communicates the same thing.

## 5. Metadata treatment

Full record metadata belongs in the detail view (dialog or detail page), not the row. A summary row shows only what's needed to decide whether to open the detail.

## 6. Status badges

- Compact height/horizontal padding.
- Textual label, not icon/color-only.
- Semantic color (never invented — reuse existing `Badge` variants and the established `border-amber-600/50 text-amber-700 dark:border-amber-500/40 dark:text-amber-400` pattern for amber/warning states, which is already contrast-verified in both themes).
- Never forces extra row height.

## 7. Multiple-status behavior

Multiple badges on one row (e.g. "Escalated" + "Stale active") stay inline at desktop where space allows. At narrow widths, recompose the row (see §13) rather than letting badges crush the identity text into unreadable fragments — do not just let both badges + duration fight the identity text for space on one line below the `sm` breakpoint.

## 8. Numeric alignment

Counts, durations, percentages, numeric values align consistently toward the trailing/right edge, with a fixed or near-fixed column width where practical, so values line up for vertical scanning (`tabular-nums`).

## 9. Actions

Primary row action sits trailing/right. If the whole row already performs the one obvious action (e.g. click anywhere on a Recent Calls row opens its detail), don't add a redundant large button. Secondary actions use compact controls/menus only where genuinely needed.

## 10. Hover/focus

- Hover: subtle background tint (`hover:bg-muted/40` or `/50`).
- Focus: visible `focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400`.
- Native `<button>` elements for whole-row-click where possible (inherently keyboard-focusable, no extra ARIA needed) — fall back to `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space) + explicit `aria-label` only when the interactive element can't be a real `<button>` (e.g. a grid card).

## 11. Separators

Prefer subtle horizontal separators between rows (`divide-y divide-border/60`) over individual per-row borders/cards. Records inside a section should read as one coherent list; the containing section supplies the boundary.

## 12. Truncation

Prefer single-line truncation + ellipsis + detail-view access over increasing row height. A summary surface (Dashboard, a compact list) never needs to show the full record — the existing detail dialog/page has it.

## 13. Responsive/mobile recomposition

Do not squeeze a desktop row indefinitely. Below the `sm` (640px) breakpoint, recompose deliberately: identity on its own line, status/duration/badges on a second compact line below it (`flex-col gap-1 sm:flex-row sm:items-center sm:justify-between`). Preserve priority: identity → status → important operational value → action. Secondary metadata may truncate, wrap once, or move to detail. Never cause whole-page horizontal overflow.

## 14. Table vs. compact-row usage

Both are valid implementations of the same grammar — pick based on the data's natural shape:
- **Compact row list** (Dashboard's Needs Attention/Recent Calls): a bounded, capped summary of a few records, click-through to detail.
- **True table** (Call Logs, Chat Logs, Live View's interaction table): larger record sets with sortable/scrollable columns, still using the same row-density targets, badge treatment, and truncation rules — the underlying data structure differs, the visual grammar doesn't.

## 15. Entity/load-row usage

For "how much load does this thing currently have" (e.g. Agent Load), prefer a one-line-per-entity list: primary identity + one prominent numeric value, right-aligned. Do not use a multi-field catalogue card for this — that's for the entity's *detail* view (e.g. Agent Detail), not its load summary.

## 16. When cards ARE appropriate

- A section/summary boundary (e.g. "Needs Attention" as a whole).
- A major entity that genuinely needs multiple fields simultaneously visible (e.g. a detail page's identity header).
- A configuration surface (forms, settings panels).
- A distinct grouped concept that isn't a repeated record (e.g. a single KPI tile in a metric strip).

## 17. When deviation is justified

Deviate from this standard only for a documented functional reason — e.g. a genuinely different interaction model (Create Campaign's master/detail workflow), a data shape that doesn't fit rows (a graph/canvas editor), or a screen-specific regulatory/accessibility requirement. Document the reason in that screen's own implementation report; don't silently diverge.

## 18. Shared primitives/tokens actually introduced

Session 11.1A deliberately did **not** create a universal `OperationalDataGrid` component — the objective is shared visual grammar (documented here), not one mega-component. What was introduced:

- `AgentActivityPanel`'s new `variant?: 'cards' | 'compact'` prop (default `'cards'`, unchanged for existing callers like Live View). `variant="compact"` renders the "Agent Load" one-row-per-agent treatment described in §15. This is the one genuinely reusable primitive extracted so far, since Live View is explicitly documented (§20 below) to reuse it directly.
- No new CSS custom properties/design tokens were added — density is expressed via ordinary Tailwind utility classes (`py-1.5`, `px-3`, `text-sm`/`text-xs`, `divide-y divide-border/60`, `tabular-nums`) applied consistently per this document, not centralized into a new token layer. If a third or fourth screen's implementation reveals genuine duplication of these exact class combinations, extracting a small `OperationalRow` wrapper component at that point is reasonable — not before (§19 "do not abstract prematurely").

## 19. Example patterns

**Compact operational row (single-line, desktop):**
```tsx
<button
  type="button"
  onClick={...}
  className="w-full flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2 py-1.5 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-sm px-1 -mx-1"
>
  <div className="min-w-0 flex items-baseline gap-1.5 sm:flex-1">
    <span className="font-medium text-foreground truncate text-sm">{primary}</span>
    <span className="text-xs text-muted-foreground truncate">{secondary}</span>
  </div>
  <div className="flex items-center justify-between sm:justify-end gap-2 flex-shrink-0">
    <Badge variant="..." className="whitespace-nowrap text-xs">{status}</Badge>
    <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:w-16 text-right">{value}</div>
  </div>
</button>
```
Wrap a list of these in `<div className="divide-y divide-border/60">…</div>` inside a `Card`/`CardContent` with tightened padding (`px-3 pb-2`, header `py-2 px-3`).

**Entity/load row:**
```tsx
<button
  type="button"
  onClick={...}
  className="w-full flex items-center justify-between gap-2 py-1.5 px-1 text-left rounded-sm hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
  aria-label={`View ${name} detail — ${count} active`}
>
  <span className="text-sm text-foreground truncate">{name}</span>
  <span className="text-sm tabular-nums flex-shrink-0">{count}</span>
</button>
```

## 20. Future application (explicit, do not implement yet)

- **Live View**: may use a true table rather than Dashboard's compact rows — same visual grammar (row density, status-badge treatment, row typography, hover/focus, truncation), different data structure (a real sortable/scrollable table, not a capped 5-row summary). Live View should reuse `AgentActivityPanel`'s new `variant="compact"` directly for its own agent-load display if/when that screen is implemented, rather than building a second compact-agent-row component.
- **Call Logs / Chat Logs**: should inherit dense table row treatment, compact badges, primary/secondary typography, action placement, truncation, hover/focus from this document. Their own screen reviews should focus on content/columns/filters/grouping — not re-litigate basic row styling, which is already decided here.
- **Agent Detail's "Recent Interactions"**: should eventually inherit this standard (currently out of scope, not modified in Session 11.1A).

## 21. Standing rule

Subsequent screen-review/implementation sessions **must** reuse this standard unless there is a documented functional reason to deviate (§17). Do not independently redesign row height, padding, primary/secondary typography, status badges, hover, focus, separators, truncation, or basic action placement on every screen.

## 22. Cross-agent context (Session 11.1 XYZ)

On a generic operational surface containing interactions from **multiple** Call Agents, Agent is a first-class record dimension — not optional metadata. Every interaction row on such a surface should expose the responsible Call Agent (human-readable `agentDisplayName`, falling back to `agentId`, then a truthful `"Unknown agent"` — never invented, never suppressed) **unless the surrounding screen/context already establishes a single agent**.

- **Data source**: use the interaction's own `agentDisplayName`/`agentId` fields (already present on the normalized `Interaction` type) directly — this is the exact same fallback convention already used by `CallHistoryList.tsx`/`CustomerDetail.tsx`. Do not re-derive agent identity from a roster join unless the interaction itself lacks the field. `agent_id` remains the immutable identity; `agent_name`/`agentDisplayName` is presentation only. Never introduce `agent_version`.
- **Where this applies later**: Live View, Call Logs, Chat Logs where agent attribution exists, and any other cross-agent interaction grid.
- **Where Agent may be omitted**: Agent Detail's own "Recent Interactions" table — the page itself already establishes the single agent, so repeating it on every row is redundant.
- **Desktop**: Agent gets its own compact column, placed between the primary identity/context column and the status/duration columns, using **adaptive column sizing** (see §25) rather than an arbitrary fixed width — truncation is a fallback for genuinely constrained space, not the default. Subtle uppercase column-header labels (`text-xs uppercase tracking-wide text-muted-foreground`) are preferred where they improve scanability — keep them light, never a heavy header band.
- **Mobile** (below `sm`): do not add a 4th line. Merge Agent into the existing secondary line alongside intent (`{intent} · {agentLabel}`), and it's acceptable to drop a lower-priority field (e.g. raw phone number, which remains one click away via the detail dialog) from that same mobile-only line to make room — never drop Agent itself. Agent must remain visibly present and readable at every required viewport, never hidden purely to make a row fit.
- **Never group by agent** on a cross-agent overview merely to add this context — grouping fragments the overview and increases page height; Agent stays a row/column dimension, not a grouping axis.

## 23. Corporate semantic status language (Session 11.1 XYZ)

**Color intensity should match operational severity.** Strong saturated red is not the default treatment for every business exception — reserve it for genuine technical failure, a destructive action, a genuinely critical state, or an irreversible/high-risk action. A business exception (e.g. "Escalated") is not automatically a system failure.

Status families, using restrained tinted-outline treatments (translucent background + matching border + accessible foreground text, verified contrast-consistent between Light/Dark), never a solid saturated fill:

- **Business exception / escalated** — `Badge variant="escalated"`: `bg-red-500/10`, `border-red-600/40` (`dark:border-red-500/40`), `text-red-700`/`dark:text-red-400`.
- **Warning / stale** — `Badge variant="warning"`: `bg-amber-500/10`, `border-amber-600/50` (`dark:border-amber-500/40`), `text-amber-700`/`dark:text-amber-400`. (This is the original amber pattern from §6, now formalized as a named variant.)
- **Positive / completed** — `Badge variant="positive"`: `bg-emerald-500/10`, `border-emerald-600/40` (`dark:border-emerald-500/40`), `text-emerald-700`/`dark:text-emerald-400`.
- **Neutral** — the existing `secondary`/`outline` Badge variants (e.g. an in-progress/active technical state).
- **Informational/live** — document only, not yet implemented anywhere: should use the product's existing restrained cyan/blue accent family when it's introduced on a screen that needs it (e.g. a genuine "Live"/"Active" indicator), not a new color.
- **Critical/error/destructive** — the existing `destructive` Badge variant (solid saturated red) remains fully correct and unchanged for actual technical failure, a destructive action's confirmation, or a genuinely critical system state. This is the one case where strong red stays appropriate.

**Implementation**: these are opt-in additions to the shared `Badge` component's `variant` prop (`escalated`/`warning`/`positive`, alongside the pre-existing `default`/`secondary`/`destructive`/`outline`) — never a change to any existing variant's definition, and never a hardcoded new color introduced outside the shared component. A screen adopts the new language by switching which named variant it passes; screens that haven't been reviewed yet keep using whatever variant they already use, completely unaffected. Do not mass-repaint unreviewed screens merely because this vocabulary now exists — each screen adopts it through its own Session 11 review/implementation.

Status remains **never color-only** — every badge keeps its text label. Verify contrast in both Light and Dark before shipping a new usage of these variants.

## 24. Detail Navigation Standard (Session 11.1 XYZ)

A detail page's "Back" control must return to the workspace that actually opened it — never a hardcoded fixed destination mislabeled as "Back."

1. **A Back control returns to the originating workspace.** The visible label must always match the resolved destination exactly (e.g. "← Back to Dashboard", never a bare "Back" pointing somewhere unrelated to where the user came from).
2. **Origin is passed explicitly by application navigation** — via React Router `navigate(path, { state: { origin } })` — never inferred from browser history (`navigate(-1)`/history-back is explicitly disallowed: browser history can contain an external site, a login step, an unrelated screen, or a stale chain unrelated to the user's actual in-app journey).
3. **Origin is restricted to a small, typed, trusted set of known internal routes** (see `src/lib/detailOrigin.ts`'s `DetailOrigin` type and `resolveDetailOrigin()`) — never an arbitrary URL string trusted from navigation state.
4. **Direct-entry detail pages have a canonical fallback.** A detail page reached with no (or an unrecognized) origin — direct URL entry, a bookmark, or a hard refresh in an environment where in-memory state doesn't survive it — falls back to one documented, always-safe destination (for Agent Detail: AI Agents). No error, no missing control, no broken state.
5. **Detail pages remain directly addressable/bookmarkable** regardless of origin state — the page must render correctly and usably even with zero navigation-state context.
6. **Do not build a state-restoration framework** merely to make an origin workspace look exactly as the user left it — a normal route return is sufficient unless a specific screen's own transient state genuinely requires more (document that decision on that screen, don't build it preemptively).

**Current implementation**: `src/lib/detailOrigin.ts` defines `DetailOrigin = 'dashboard' | 'ai-agents' | 'live-view'` mapped to real routes/labels. `AgentDetail.tsx` resolves `location.state?.origin` via `resolveDetailOrigin()` and renders/navigates accordingly; `Dashboard.tsx`'s Agent Load and `AIAgents.tsx`'s list both pass their real origin explicitly. `'live-view'` is defined now for forward reuse even though Live View doesn't yet link to Agent Detail — adding that link later requires no change to this mechanism, only passing `{ state: { origin: 'live-view' } }` at the call site.

**Future reuse**: this exact mechanism (not a redesigned one) should back later detail navigation from Live View, Call Logs, Chat Logs, and Campaigns where applicable — extend `DetailOrigin`/`ORIGIN_DESTINATIONS` in `src/lib/detailOrigin.ts` with new entries as those screens need them, rather than building a parallel mechanism. Not refactored now.

## 25. Adaptive column sizing (Session 11.1 XYZ-A)

Operational grids must allocate columns according to **content priority and available container width** — not arbitrary fixed widths chosen without inspecting real content. A descriptive column (e.g. Agent) must not truncate merely because it was given a small hardcoded width while other space on the same row sits unused.

**General allocation rule**:

- **Identity/context column** (e.g. Customer/Context) — flexible, receives residual available width. This is the one `1fr`-equivalent track in the row; everything else is sized first, and this column absorbs whatever's left.
- **Descriptive dimensions** (e.g. Agent) — content-aware, bounded by a sensible min/max, not a single fixed value. Shows the full value when space allows; truncates (with `title` for the full value on hover) only when the container is genuinely constrained.
- **Short categorical/status columns** (e.g. Status, Outcome) — intrinsic/content-sized where practical, also bounded so header and rows stay aligned (see below).
- **Numeric/duration columns** — compact, right-aligned, `tabular-nums`.
- **Truncate only after available width has been efficiently allocated** — never as the first-line behavior for a column that could reasonably just show the full value.
- **Header and every data row must share the exact same column definition** so alignment stays exact.

**Why a literal `max-content` track is *not* used for Agent**: each operational row (e.g. each Dashboard `<button>` row) is its own independent CSS Grid formatting context — there is no single shared grid spanning the header and every row. If a column's *max* were driven by that row's own content (`max-content`), two rows with agent names of different lengths would resolve different column widths, and the Agent column would visibly drift out of alignment from row to row (and from the header). The fix used here instead: every track except the identity/context column is `minmax(min, max)` with a **fixed, non-content-derived `max`** — chosen by measuring real content (e.g. the longest current agent name, "Inbound Banking Assistant"), not copied from an example. Because the `max` is a literal value shared by every row's grid *and* the header's grid, all of them resolve to the same column widths independently, and the row stays genuinely adaptive within that range: at ample width every track sizes to its `max` (showing the full value); if the container narrows below what all tracks need at `max`, non-flexible tracks shrink toward their `min` before the identity/context `1fr` column gives up any more space, which is exactly when truncation should kick in.

**Reference implementation** (`src/pages/Dashboard.tsx`, Needs Attention / Recent Calls):

```
grid-template-columns: minmax(0,1fr) minmax(7rem,14rem) minmax(6rem,10rem) minmax(3.5rem,4.5rem);
/*                      Customer/Context  Agent             Status            Duration          */
```

applied identically (via a Tailwind arbitrary-value class) to the header row's label spans and to every data row's `<button>`. A row's mobile-only sub-wrapper (the badges+duration pair, stacked on one line below `sm`) uses `sm:contents` at the grid breakpoint so its two children become direct grid items in the Status/Duration tracks — this keeps the mobile markup untouched while letting the same elements participate correctly in the desktop grid, without introducing an extra nested grid container. Grid children with `truncate` also need `min-w-0` (grid items default to `min-width: auto`, which prevents shrinking below content size and defeats the ellipsis) — the Agent cell's wrapper includes this.

**Applies to**: any operational grid built as one-grid-per-row rather than one-grid-for-the-whole-list (which is the pattern this project uses for row-as-`<button>` clickable records). Future Live View, Call Logs, and Chat Logs should inherit this exact rule — same allocation principle, same "fixed-max-per-track, not `max-content`" reasoning — rather than independently choosing arbitrary column widths per screen. This supersedes §22's earlier "fixed/near-fixed width" phrasing for the Agent column.

## 26. G1 — Dense operational grid (Session 11.2A)

For **full tabular record sets** — Live View's Current Interactions table, Call Logs, Chat Logs, and any other complete (not capped-summary) dataset rendered as a real `<table>`. This is a stricter, table-specific refinement of §3's general row-density target, because a genuine multi-column data table (7+ columns, badges, numeric alignment) needs an explicit target or it silently lands taller than a simple 2-field summary row.

**Desktop characteristics**:
- Genuine tabular presentation — an HTML `<table>` (or equivalent grid), not a stack of per-record cards.
- **Data row height: ~38–42px.** **Header height: ~32–36px.** Targets, not pixel-perfect requirements, but a row landing at 60px+ (the shadcn `Table` primitive's untouched defaults — `TableHead` is `h-12`/48px, `TableCell` is `p-4`/16px-all-sides) is a G1 violation, not an acceptable variance.
- **Single-line cells by default.** A record's identity cell (e.g. Caller name + phone) is one line, not two stacked lines — merge related fields with a separator (`·`) rather than stacking them. Two-line cells are not the desktop default; reserve them for a documented case where the content genuinely can't compress (rare on a G1 grid — if you find you need one, that's usually a sign the field belongs in the detail view instead).
- Minimal vertical padding (`py-1.5`–`py-2` on `TableCell`, `h-9` on `TableHead` — override the shadcn primitives' defaults explicitly, since `cn()`/`twMerge` resolves the conflict correctly).
- Subtle row separators (inherited `border-b`/`border-border` per row — no per-row card border/shadow/rounded-corner treatment).
- No per-record card appearance — a G1 row must visually read as **one row of a data grid**, never an individual horizontal card with its own visual boundary.
- No large empty vertical space inside a row — content that doesn't need two lines shouldn't get two lines' worth of padding "for breathing room."
- Compact status treatment — reuse S1 (§23) badges, never a status element that forces the row taller than its text content requires.
- Compact row actions — a "View Details"-style action stays a small (`h-7`-class) button, never a large/prominent CTA that dictates row height.
- Strong column alignment — numeric/duration columns right-aligned and `tabular-nums` (see C1, §25); header and every row share equivalent column treatment.
- High information density **without reducing readability** — this is still enterprise text at `text-sm`/`text-xs`, not a font-size reduction exercise.

**Verification method**: measure `getBoundingClientRect().height` on an actual `<thead> tr` and a `<tbody> tr` in the live rendered page (via the project's Playwright+Edge harness) — do not estimate from source alone, since Tailwind class stacking/line-height/border interactions routinely produce a few px of drift from a hand calculation.

**Reference implementation**: `src/pages/LiveView.tsx`'s Current Interactions table (Session 11.2A) — measured live at 41px data rows / 36px header at all four required viewports, both themes.

## 27. G2 — Compact summary rows (Session 11.2A naming; rule itself is §3/§14 unchanged)

For **bounded summary lists** — Dashboard's Needs Attention and Recent Calls (capped at 5 records, click-through to full detail elsewhere). This is exactly the original §3 row-density target (~40–44px normal, ~36–40px dense) and the "compact row list" half of §14 — nothing new, just named for citation. A G2 row may combine related secondary information within the row (identity + context on one line, as already described in §4's typography model) because it's a *summary* of a bounded list, not a full data table — it does not need G1's stricter single-line-cell discipline applied to every field, though it should still default to one line per §4/§9.

**Do not use G2's slightly looser target to justify a G1 screen (a real multi-column table) drifting taller** — if a screen is a full tabular dataset, it's G1, not G2, regardless of how the rule is phrased.

## 28. P1 — Agent Load (Session 11.2A naming; rule itself is §15 unchanged)

Compact operational agent summary: **Agent Name + one prominent operational count/load value**, right-aligned, one line per agent. This is exactly §15's "entity/load-row usage" rule, named for citation. Reuse the established `AgentActivityPanel` `variant="compact"` component directly (Dashboard and Live View both already do) — do not build a second implementation. Do not add Direction/Language/Persona to a P1 summary unless that specific screen has a genuine, documented operational reason to need them in the summary itself (full metadata always remains one click away on Agent Detail).

## 29. L1 — Bounded operational workspace (Session 11.2A naming; rule is the Session 11.1/11.2 bounded-workspace requirement, now named)

**Backend record count must never determine whole-page height.** An operational screen (Dashboard, Live View, and — when their own implementation sessions apply this standard — Call Logs/Chat Logs) stays viewport-bounded: the primary dataset (the G1 table or the G2 summary lists) becomes the one principal scrolling region, while every other section on the page (header/indicator, metrics, Agent Load, filter toolbar) is fixed/compact height. 10, 50, or 500 records must only grow that one region's own internal scroll — never `main`'s `scrollHeight` beyond its `clientHeight`.

**Verification method**: live-measure `main.clientHeight` vs `main.scrollHeight` (or the page's actual outer scroll container) at the four required viewports (1536×1024, 1366×768, 768×1024, 390×844) — equal values (0px delta) is the target; a small, *data-independent* delta (e.g. from a genuinely necessary two-line mobile recomposition) is an acceptable, documented exception, never an unexplained one. A delta that grows with record count is an L1 failure.

**Reference implementations**: Dashboard (Session 11.1A: 1366×768 → 724/724) and Live View (Session 11.2/11.2A: 1366×768 → 724/724) both currently measure zero page-level scroll at all four required viewports, in both themes.

## 30. F1 — Operational filter toolbar (Session 11.2B)

Applies to operational record screens with a real filter surface — Call Logs and Chat Logs, not yet implemented against this standard.

- **Records dominate the viewport.** Filters are controls, not content — the filter surface must never compete with the record grid (G1) for primary vertical space.
- **One shallow, persistent toolbar.** Search stays directly accessible in that toolbar at all times — never buried behind an extra click.
- **Secondary filters open in a temporary floating popover/panel**, not permanently rendered inline. The floating filter UI overlays the workspace; it must not push or reflow the record grid when opened.
- **Show active-filter count** and compact removable chips where useful, so the operator can see what's currently filtering without opening the panel.
- **Keep only genuinely critical selectors permanently visible** in the shallow toolbar itself — everything else lives in the floating panel.
- **Do not introduce a permanent second left-side filter rail.** VoiceForce already has one global navigation rail (the 52px compact rail); a screen-local filter rail duplicates that pattern and consumes width the record grid needs.
- **Mobile**: a temporary sheet/drawer is the appropriate floating-filter treatment at narrow widths, consistent with N1's "temporary overlay, not a second permanent panel" spirit.
- **Preserve all existing filter semantics** — F1 governs presentation only; it never changes what a filter actually matches or how results are queried.

Not yet implemented on any screen — this section exists so Call Logs/Chat Logs' own future implementation sessions can cite "Filters → F1" without re-deriving these rules.

## 31. GR1 — Operational grouping (Session 11.2B)

Applies where operational records can be grouped by a dimension (e.g. by Agent) — Call Logs and Chat Logs, not yet implemented against this standard.

- **Grouping is a view of the records, not a large permanent preamble above them.** A grouped view must not push the actual record grid (G1) far down the page behind a tall hierarchy header.
- **Group selection belongs in the compact operational toolbar** — e.g. a "Group by: Agent" control sitting alongside search/filters (F1), not a separate large control area.
- **Grouped/Table mode may remain as a togglable view** where functionally useful (an operator choosing flat-table vs. grouped-by-agent, for example).
- **Group structure renders compactly inside the primary records workspace** — group headers within the scrollable record region itself, not as a fixed block competing with it for space.
- **Do not render a large always-visible hierarchy above the records grid.** If group navigation needs its own space, it collapses/expands within the workspace rather than reserving permanent height.
- **Must comply with L1** — grouping must not consume unbounded page height; the grouped view is still one bounded, internally-scrolling workspace, not a page that grows with the number of groups or records.
- **Do not change grouping semantics merely for presentation** — GR1 governs how a grouped view looks and where it lives on the page, never what "grouped by X" actually means or computes.
- **Grouping is optional.** When the user's real task is simply narrowing records by a dimension such as Agent, use that dimension as an F1 filter rather than forcing hierarchical GR1 navigation. GR1 remains the right pattern when the hierarchy itself (e.g. Domain → Category → Agent) is part of what the operator needs to see, not merely a means of selecting one leaf value.

First implemented for Call Logs in Session 11.3, then removed from Call Logs in Session 11.3A in favor of a plain Call Agent filter (F1) per the rule above — the underlying Session 6.2 classification model and `GroupedInteractionTree` component are unchanged and remain available to other screens.
