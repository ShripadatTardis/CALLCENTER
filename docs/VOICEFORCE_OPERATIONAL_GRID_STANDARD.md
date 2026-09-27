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

## 22. Cross-agent context (Session 11.1 XYZ)

On a generic operational surface containing interactions from **multiple** Call Agents, Agent is a first-class record dimension — not optional metadata. Every interaction row on such a surface should expose the responsible Call Agent (human-readable `agentDisplayName`, falling back to `agentId`, then a truthful `"Unknown agent"` — never invented, never suppressed) **unless the surrounding screen/context already establishes a single agent**.

- **Data source**: use the interaction's own `agentDisplayName`/`agentId` fields (already present on the normalized `Interaction` type) directly — this is the exact same fallback convention already used by `CallHistoryList.tsx`/`CustomerDetail.tsx`. Do not re-derive agent identity from a roster join unless the interaction itself lacks the field. `agent_id` remains the immutable identity; `agent_name`/`agentDisplayName` is presentation only. Never introduce `agent_version`.
- **Where this applies later**: Live View, Call Logs, Chat Logs where agent attribution exists, and any other cross-agent interaction grid.
- **Where Agent may be omitted**: Agent Detail's own "Recent Interactions" table — the page itself already establishes the single agent, so repeating it on every row is redundant.
- **Desktop**: Agent gets its own compact column (fixed/near-fixed width, truncated), placed between the primary identity/context column and the status/duration columns. Subtle uppercase column-header labels (`text-xs uppercase tracking-wide text-muted-foreground`) are preferred where they improve scanability — keep them light, never a heavy header band.
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
