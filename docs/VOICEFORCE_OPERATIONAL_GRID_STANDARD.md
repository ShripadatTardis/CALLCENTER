# VoiceForce Operational Grid & Density Standard

Established by Session 11.1A, first implemented on Dashboard. This is a **product standard**, not implementation notes — future sessions should read this and reuse the grammar below rather than re-deriving row density/typography/badge/hover/focus rules screen by screen.

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
