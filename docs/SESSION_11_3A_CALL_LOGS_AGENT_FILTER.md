# Session 11.3A — Call Logs Filter / Agent Refinement

Small, focused refinement to Session 11.3's Call Logs implementation: removes the Grouped/Table
grouping-tree navigation and replaces it with **Call Agent** as a normal filter inside the existing
F1 Filters panel. No backend, Partner API, auth, FCR/Intent-Accuracy semantics, KPI, or pagination-
architecture changes.

## Files changed

- `src/pages/CallLogs.tsx` — removed Grouped/Table toggle, the grouping-tree render block, and their
  supporting state/imports (`view`, `selectedGroup`, `useClassification`, `groupInteractions`,
  `GroupedInteractionTree`); added a page-local `agentFilter` state, a "Call Agent" `<Select>` at the
  top of the Filters panel (populated from `useAgents()`), and updated the active-filter chips/count/
  Clear-All logic to include it.
- `src/components/common/FilterPopover.tsx` — added an optional `title` prop (default `"Advanced
  filters"`, unchanged for every other caller); Call Logs passes `title="Filters"` per §3.
- `docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md` — added the requested GR1 clarification ("Grouping
  is optional... use that dimension as an F1 filter") and corrected the stale "not yet implemented"
  note for GR1 (it was implemented for Call Logs in 11.3, then removed there in 11.3A).

No changes to `src/components/classification/GroupedInteractionTree.tsx`,
`src/lib/interactionGrouping.ts`, or `src/hooks/classification/useClassification.ts` — the
Session 6.2 Domain → Category → Agent classification model and the shared grouping component are
untouched and remain available to any other screen that uses them.

## Grouping UI removed

The Grouped/Table toggle buttons and the `max-h-[180px]` collapsed `GroupedInteractionTree` region
above Call History are gone. Records now begin immediately below the Search/Filters/Export toolbar —
no grouping preamble, per §2's target toolbar shape `[Search calls...] [Filters N] [Export]`.

## Call Agent filter implementation

A "Call Agent" `<Select>` is the first control inside the Filters panel, above the existing
server-side `AdvancedFilters` (date range/outcome/direction/duration) and the page-local FCR/
Auth/Campaign facets. Options are populated from the real agent roster (`useAgents()` →
`agentsService`/`agentsMapper`), labeled with `displayName`; "All agents" clears the filter.

## Authoritative identity used

Filtering is a direct equality match on the interaction's immutable `agentId` against the selected
roster entry's `agentId` — not `agent_name` fuzzy matching, and no `agent_version` field was
introduced anywhere.

## Server-side vs. page-local scope

**Page-local.** `CallDataQueryDto` (`src/types/api/calls.ts`) has no `agent_id` query parameter on
`/call-data`, so there is no way to ask the Partner API to filter by agent server-side. The filter
therefore narrows only the already-fetched page of interactions (same mechanism the old
grouping-tree leaf-selection used, `agentFiltered`, simply repointed at the new `<Select>`), and is
labeled honestly:

- an "Agent: {name} (page)" chip using the same "(page)" convention as the FCR/Auth/Campaign facets
- a caption under the Select: "Filters the currently loaded page only"

It does **not** claim to search all 680+ historical calls — selecting an agent filters only the
current 50-row page, consistent with §4's explicit honesty requirement.

## Pagination behavior

Unchanged and unaffected by the Call Agent filter, per §7's page-local branch: selecting an agent
does not reset `page` or alter `total_records`/`total_pages`, since it never touches the server
query. Live-verified against production: `680 total calls · Page 1 of 14` → Next →
`680 total calls · Page 2 of 14`, with the first row's underlying record genuinely different
(`rows differ: true`) — pagination remains a real server round-trip, not implied to be filtered by
agent server-wide.

## Before/after persistent height before first record (1366×768, dark)

| | Session 11.3 (collapsed grouping tree) | Session 11.3A (no grouping tree) |
|---|---|---|
| First table row's `top` offset | toolbar + ~120px collapsed-tree region | **239px** (toolbar only) |
| `main.clientHeight` / `scrollHeight` | 724 / 724 (delta 0) | 724 / 724 (delta 0) |

L1 remains fully satisfied (`main.scrollHeight - main.clientHeight === 0`) at all 4 required
viewports × both themes; records simply start higher now that the grouping-tree region is gone
entirely rather than merely collapsed.

## Responsive / theme verification

Verified live against production (`https://callcenter-three-livid.vercel.app/call-logs`) via
`scripts/responsive-call-logs-11-3a-check.mjs` (Playwright + local Edge executable) at all 4 required
viewports, both themes:

| Viewport | Theme | L1 delta | Header/row height | Horizontal overflow | Grouped/Table buttons | Grouping tree |
|---|---|---|---|---|---|---|
| 1536×1024 | dark/light | 0 | 36px / 41px | 0 | 0 | 0 |
| 1366×768 | dark/light | 0 | 36px / 41px | 0 | 0 | 0 |
| 768×1024 | dark/light | 0 | 36px / 41px | 0 | 0 | 0 |
| 390×844 | dark/light | 0 | 36px / 41px | 0 | 0 | 0 |

G1 row density (41px) and header height (36px) are unregressed from Session 11.3 at every
combination — matches the LiveView reference figure. No horizontal document overflow at any
viewport.

Functional checks (dark, 1366×768):

- Filters panel header reads **"Filters"** (was "Advanced filters").
- Call Agent options populate correctly: `All agents / Inbound Banking Assistant / EMI Reminder /
  Forex Transaction`.
- Selecting "Inbound Banking Assistant" filters the visible page from 50 → 35 rows; Filters button
  shows an updated count (`Filters1`); the "Agent: Inbound Banking Assistant (page)" chip appears.
- Clear All resets rows to 50 and removes the Agent chip.
- Agent column remains visible in the grid; View (50) and Export (1) controls remain present and
  functional.

Screenshots: `.tooling/screenshots/session-11-3a-call-logs/`.

## Build / lint / function count

- `tsc --noEmit`: clean, no errors.
- `npm run build`: succeeds (`vite build`; same pre-existing >500kB chunk-size notice, unrelated).
- `npm run lint`: **117 errors / 36 warnings** — identical to the Session 11.3 baseline, no
  regression, no new issues in this session's files.
- Vercel function count: **11**, unchanged (no `api/*` files touched).

## Deployment

- Deployed via `npx vercel --prod --yes`, twice: first for the core refinement, then again after
  adding the `FilterPopover` `title` prop to satisfy §3's "FILTERS" panel rename.
- Production URL: **https://callcenter-three-livid.vercel.app/call-logs** — live, verified against
  this deployment (all measurements above taken post-deploy).
