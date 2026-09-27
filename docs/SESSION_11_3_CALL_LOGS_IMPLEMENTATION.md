# Session 11.3 — Call Logs Implementation

Implements `docs/SCREEN_REVIEW_03_CALL_LOGS.md` as a production change: applies the named
VoiceForce Operational Grid Standard (G1/F1/GR1/C1/S1/L1) to Call Logs, adds real server-side
pagination, and fixes two honesty/consolidation defects the review flagged. No backend, Partner
API, auth, FCR-calculation, or Intent-Accuracy-semantics changes.

## Files changed

- `src/pages/CallLogs.tsx` — full toolbar/table/pagination rewrite.
- `src/components/classification/GroupedInteractionTree.tsx` — new opt-in `collapsedByDefault`
  prop (default `false`; behavior for Chat Logs/Customer Detail/QA Review is unchanged).
- `src/components/call-logs/InteractionDetailDialog.tsx` — added a "Call Centre analysis" section
  surfacing the already-fetched `Interaction.analysis`.

No `api/*` files touched. Vercel function count unchanged at **11** (13 files under `api/`, 2 of
which — `_customer360.ts`, `_voicebot.ts` — are underscore-prefixed shared helpers, not functions).

## Standards applied

- **G1** (dense grid): table header/row cells moved from `py-2`/`px-4`-style spacing to `h-9`
  header / `py-1.5` rows. Live-measured **36px header / 41px rows** at all 4 required viewports,
  both themes — matches the LiveView reference implementation exactly.
- **C1** (adaptive columns): Agent column uses `min-w-[7rem] max-w-[14rem]` (same bounded-but-
  generous pattern as LiveView) so "Inbound Banking Assistant" renders in full; Caller/Context
  uses `max-w-[260px] truncate` with a full-value `title` tooltip.
- **F1** (filter toolbar): toolbar is now Search + one `FilterPopover` ("Filters N") + Grouped/
  Table toggle + Export. The FCR/Auth/Campaign page-local facets, which previously sat as three
  permanent inline controls in the toolbar, now live inside the same floating panel as the
  server-side `AdvancedFilters` (date range/outcome/direction/duration), under a "Page-local
  facets (this page only)" heading. The panel's active count includes both server and page-local
  filters. All filter semantics are unchanged — server params stay server params, page-local
  facets stay page-local and keep their "(page)" chip labels.
- **GR1** (grouping): `GroupedInteractionTree` gained an opt-in `collapsedByDefault` prop. Call
  Logs passes it (starting every category collapsed instead of all-expanded) and wraps the tree
  in a `max-h-[180px] overflow-y-auto` container. The Session 6.2 Domain→Category→Agent→Channel
  classification model, `groupInteractions`, and the narrowing behavior on leaf selection are
  unchanged — only how much of the tree is visible by default changed, and only for this page.
- **S1** (status language): Outcome badge migrated from `default`/`destructive`/`secondary` to
  `positive`/`escalated`/`secondary`.
- **L1** (bounded workspace): page root restructured to `h-full min-h-0 flex flex-col`, with the
  record table as the sole `flex-1 min-h-0 overflow-auto` region — the same pattern as Dashboard
  and Live View.

## Before/after L1 measurement (1366×768)

| | Before (review §S) | After |
|---|---|---|
| Persistent chrome before first row | ~340–380px (~44–50% of viewport) | toolbar + collapsed-by-default grouping header, ~120px |
| Scroll behavior | whole page scrolled (grouping tree always-expanded ~220–260px) | `main.clientHeight === main.scrollHeight` (0px delta) |
| **Classification** | **C — unbounded, failing** | **A — essentially viewport-bounded** |

Live-measured `main.clientHeight` vs `main.scrollHeight`, both themes, all 4 required viewports
(script: `scripts/responsive-call-logs-check.mjs`, run against production):

| Viewport | Theme | clientHeight | scrollHeight | delta |
|---|---|---|---|---|
| 1536×1024 | dark | 980 | 980 | 0 |
| 1366×768 | dark | 724 | 724 | 0 |
| 768×1024 | dark | 980 | 980 | 0 |
| 390×844 | dark | 800 | 800 | 0 |
| 1536×1024 | light | 980 | 980 | 0 |
| 1366×768 | light | 724 | 724 | 0 |
| 768×1024 | light | 980 | 980 | 0 |
| 390×844 | light | 800 | 800 | 0 |

1366×768/724×724 exactly matches the Dashboard/Live View reference figure cited in prior sessions
— zero page-level scroll at every viewport/theme combination tested.

## Row/header heights (G1)

36px header / 41px row at every one of the 8 viewport×theme combinations above (same
`scripts/responsive-call-logs-check.mjs` run) — matches the 41px/36px LiveView reference from
Session 11.2A.

## Pagination — implementation and live verification

Purely a frontend change; `page`/`page_size` request params and `total_records`/`total_pages`/
`page` response metadata were already fully wired end-to-end (`types/api/calls.ts` →
`callsService.ts` → `api/calls/data.ts`, zero backend changes needed).

- Added `page` state to `CallLogs.tsx`, passed into the `useCallData` query alongside the existing
  filters.
- `data?.pagination` drives a footer control: "`{total_records}` total calls · Page `{page}` of
  `{total_pages}`" plus Prev/Next buttons, disabled at the bounds and while fetching.
- Any server-side filter change (search, date range, outcome, direction, duration) resets `page`
  to 1 via a single `updateServerFilters` wrapper. Page-local facets (FCR/Auth/Campaign) and the
  grouping selection do **not** reset `page` since they never change the server query.

**Live verification against production** (`https://callcenter-three-livid.vercel.app/call-logs`,
dark theme, 1366×768):

```
Pagination before Next: 680 total calls · Page 1 of 14 | first row: Kalyani Nakat · +919145782844 · Loan Application
Next button enabled: true
Pagination after Next: 680 total calls · Page 2 of 14 | first row: Kalyani Nakat · +919145782844 · General Inquiry
Rows differ across pages: true
```

Page advanced from 1→2 of 14, and the first row's underlying record genuinely changed (same
repeat test-data caller name, different intent — confirms a real distinct row, not a stale
render) — this is a real server round-trip, not a client-side slice of the already-loaded 50 rows.
KPI strip continues to reflect the full filtered dataset (680 total / 12.1% FCR) independent of
which single page is currently displayed, per the review's original concern.

## Outcome fallback fix

Before: `<Badge>{call.outcome ?? call.status}</Badge>` — silently substituted the distinct
`status` field whenever `outcome` was absent (review §G).

After: `{call.outcome ?? 'Unknown'}`, with the badge variant computed from `outcome` alone
(`resolved` → `positive`, `escalated` → `escalated`, anything else including absent → `secondary`
+ "Unknown" label). No field substitution.

## Row-action consolidation

Before: two icon buttons (Play, FileText) both called `handleViewDetail`; Play's only distinct
behavior was being `disabled` when no recording existed, and neither played audio inline.

After: one "View" button (Eye icon + label) calling `handleViewDetail`. Recording playback is
unaffected — it happens via the detail dialog's existing `<audio>` element, exactly as before.

## `Interaction.analysis` surfaced

`InteractionDetailDialog.tsx` now renders a "Call Centre analysis" section (sentiment trend, key
topics, resolution status, confidence score) directly from `interaction.analysis`
(`callsMapper.ts`'s 1:1 mapping of `CallDataEntryDto.analysis`) when present, and renders nothing
when absent. No local computation, inference, or LLM call — this is Call-Centre-supplied data that
was already being fetched on every row and simply never rendered.

## Export scope visibility

The Export button's scope ("current page only") is now a visible label next to the button instead
of living only in a hover `title` attribute. Functional scope (current filtered/grouped page,
15-field CSV) is unchanged.

## Filter/grouping semantics preserved

- All 5 server filters (search, date_from/to, outcome, direction, min/max_duration) still map
  1:1 to `CallDataQueryDto` params, sent through unchanged.
- All 4 client-side facets (FCR, Auth, Campaign, grouped-tree agent selection) still narrow only
  the already-fetched page and keep their "(page)" chip labels — none were upgraded to server
  filters or vice versa.
- Grouped/Table toggle, leaf-selection narrowing (`groupFiltered`), and `countsAreExhaustive={false}`
  labeling are all unchanged; only the tree's default open/closed state changed, and only for this
  page (`GroupedInteractionTree`'s default behavior for Chat Logs/Customer Detail/QA Review is
  untouched — verified via `collapsedByDefault` defaulting to `false`).

## Responsive results

Verified at all 4 required viewports (1536×1024, 1366×768, 768×1024, 390×844) in both Light and
Dark themes against production, via `scripts/responsive-call-logs-check.mjs` (Playwright + local
Edge executable, the established harness). Screenshots in
`.tooling/screenshots/session-11-3-call-logs/`.

- Desktop/tablet (1536×1024, 1366×768, 768×1024): full 8-column grid, no L1 violation, grouping
  tree renders collapsed to its domain/category summary by default.
- Mobile (390×844): toolbar wraps to 2 rows, grouping tree collapsed and legible, table scrolls
  horizontally within its own bordered region (confirmed via screenshot) — same honest
  contained-horizontal-scroll behavior as before, not a new gap and not a regression.
- Both Light and Dark themes render with correct semantic tokens (S1 badges, borders, muted text)
  at every viewport checked.

## Build / lint / function count

- `tsc --noEmit`: clean, no errors.
- `npm run build`: succeeds (`vite build`, no new warnings beyond the pre-existing >500kB chunk
  size notice, unrelated to this change).
- `npm run lint`: **117 errors / 36 warnings** — identical to the measured baseline (not the stale
  "56/19" figure). No regression, no new lint issues introduced by this session's files.
- Vercel function count: **11**, unchanged (no `api/*` files touched).

## HIG/accessibility review

Ran via the repo's HIG commit gate (`design-reviewer` subagent) against the 3 staged files:
**0 high-severity findings** (gate passes at `high=0`). 4 medium + 5 low advisory findings, all in
pre-existing code paths (`InteractionDetailDialog.tsx`'s `getSpeakerColor`/`getSentimentColor`/
search-highlight helpers, and one borderline touch-target in `GroupedInteractionTree.tsx`'s
channel leaves) outside this session's Call Logs screen-review scope — not addressed here to avoid
scope creep into an unrelated pre-existing component; one directly-introduced low finding (an
arbitrary `text-[10px]` label) was fixed immediately (`text-xs`).

## Unresolved Partner API / data-contract questions (carried forward)

1. **Intent Accuracy semantics (most significant, unresolved this session)** — `intent_accuracy` is
   a real Partner API field; VoiceForce does not calculate it. Nothing in the API/docs confirms
   whether it represents true ground-truth accuracy or classifier confidence. Left completely
   unchanged (label, field, calculation) per the explicit boundary — recorded here as an open
   question for Call Centre, not resolved or reinterpreted.
2. FCR determination rule (what specifically makes a call "first-call-resolved") — non-blocking,
   still opaque upstream.
3. No stable `campaign_id` — reconfirmed; `campaignId` stays `undefined` in `callsMapper.ts`,
   Campaign facet remains a page-local text-match convenience only.
4. `call_sid` (Trigger Call) ↔ `call_id`/`session_id` (Call Data) correlation — still "partially
   confirmed" from Session 9, unchanged this session.
5. Scoped-role summary-computation asymmetry (all-access roles get the vendor's own `summary`
   unmodified; scoped roles get it recomputed locally over the filtered page) — noted, not
   addressed this session (no backend change permitted).

## Deployment

- Commit: `6144257` — "Session 11.3: Call Logs implementation (G1/F1/GR1/C1/S1)"
- Deployed via `npx vercel --prod --yes`.
- Production URL: **https://callcenter-three-livid.vercel.app/call-logs** — live, verified (build
  succeeded, aliased to production, pagination/L1/G1 measurements above were taken directly
  against this deployment).
