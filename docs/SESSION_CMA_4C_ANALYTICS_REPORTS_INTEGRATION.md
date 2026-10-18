# Session CMA-4C — Analytics and Reports Integration

## Objective

Integrate eligible business measures in Analytics and Reports with the
production CMA, reusing the existing evaluation API/hooks/permission
model built across CMA-4A/4A.1/4B/4B.1.

## Starting state

Confirmed before any work: working tree was clean (only `.env`, unrelated
to CMA work); CMA-4B.1 was already committed and deployed (`ae1dcb3`).
No uncommitted CMA-4B work existed to preserve.

## Screens inspected

`src/pages/Analytics.tsx` (5 tabs: Overview, Voice, Chat, Campaigns,
Customers), `src/pages/Reports.tsx`, and every chart/KPI component each
tab renders.

**`Reports.tsx` is not a real calculation surface.** It is a static
catalog of fabricated report cards (`generateIndustryReports()`) with
hardcoded fake counts ("12 Scheduled Reports", "156 Downloads This
Month"), no backend data fetch of any kind, and no working
view/download/settings buttons (the `Eye`/`Download`/`Settings` icon
buttons have no `onClick` handlers at all). There is no business measure
on this page to migrate — it doesn't calculate or display anything real.
Confirmed by reading the full file, not assumed from its name. Nothing
was changed here; flagging its actual state is the honest "eligible
migrations" answer for this page: zero, because there is nothing live to
migrate.

## Measure inventory (concise, per brief §2 — not a re-audit)

| Occurrence | Source | CMA ID | Class |
|---|---|---|---|
| Overview/Voice tabs: FCR, Avg AHT, Escalation Rate | `api/analytics/metrics.ts` global aggregate | `CANON-FIRST-CONTACT-RES`/`CANON-AVG-HANDLE-TIME`/`CANON-ESC-RATE` | B — pending definition, untouched |
| Overview/Voice tabs: Avg Intent Accuracy | same, `metrics.avg_intent_accuracy` | resembles `CANON-INTENT-CONFIDENCE` by name only | "none found" — same conclusion as CMA-4B's identical finding on Call Logs: a distinct field/population, not equivalent |
| Voice tab: Avg/P95 Turn Latency, Live/Peak Concurrency | same | no canonical measure exists for these at all | D |
| Voice tab charts: Call Volume Over Time, Latency Over Time, Concurrency Over Time (time series); Outcome Distribution, AHT Distribution (histograms); Calls by Agent (table) | same global/scoped aggregator | CMA's evaluation contract returns one value or one flat `groupBy` level, not a time series or a distribution bucket — none of these chart shapes are things `cmaEvaluate` can produce | D (shape-incompatible, not a population mismatch) |
| Chat tab: all 6 tiles + 2 charts | `useChatAnalytics`, explicitly page-scoped, no aggregate API | no canonical measure for any of these (confirmed, no chat-session metric beyond the already-checked `CHAT-SPAN-01`, which this tab doesn't display either) | D |
| Customer tab: all 6 tiles | `useCustomerAnalytics` | counts only, no rate/measure | D |
| **Campaigns tab: Total Targets, Success Rate** (`CampaignOverviewStats.tsx`, via `CampaignAnalyticsTab.tsx`) | `useCampaigns()` → `call_center_campaign_list`, summed client-side | `CANON-CAMPAIGN-TARGET-COUNT` / `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI` (CAMP-01/02) | **A — migrated** |
| Campaigns tab: Total Campaigns, Active Campaigns, Calls Triggered, unclassified | same | no canonical measure | D, unchanged |
| Campaigns tab CSV export | `CampaignAnalyticsTab.tsx`'s own `exportRows`, built directly from `data.data` (per-campaign rows) | — | D — a different, per-campaign-row export, not the same number as the migrated cross-campaign aggregate; nothing for it to contradict (see below) |
| Reports.tsx | fabricated mock content, no real data source | — | Not applicable — no real measure exists to classify |

## Migrated

**`CampaignOverviewStats.tsx`** (used by Analytics' Campaigns tab) —
"Total Targets" and "Success Rate" now call `cmaEvaluate` for CAMP-01/02
when the viewer holds `cma.evaluate`, using the identical formula,
`campaignAllTimeCmaWindow()` helper, and permission-gated
fallback-to-legacy pattern already verified byte-identical against
production in Session CMA-4B for the sibling component
`CampaignStatStrip.tsx` — this component consumes the exact same
`CampaignWithStats[]` shape from the same `useCampaigns()` source, so the
existing equivalence proof applies directly without re-deriving it.
"Total Campaigns" / "Active Campaigns" / "Calls Triggered" / unclassified
have no CMA equivalent and remain computed from the campaign list, as
before — unchanged for every role regardless of `cma.evaluate`.

No code duplication was introduced: this is the same `useCmaMeasure` hook
and `campaignAllTimeCmaWindow` helper CMA-4B already built, imported and
reused here, not reimplemented.

## Export/report consistency (brief §6)

Checked `AnalyticsExportButton`/`downloadCsv` — purely client-side,
exports exactly the `rows` prop already rendered on screen, no separate
backend calculation path. The Campaigns tab's CSV export
(`CampaignAnalyticsTab.tsx`'s `exportRows`) is a **per-campaign row
table** (name/status/targets/triggered/classified/successful/
successRatePct for each campaign individually) — a different granularity
than `CampaignOverviewStats`' cross-campaign aggregate cards, built
independently from the same underlying `data.data`. There is no
single-number export that duplicates or could contradict the migrated
aggregate, so no export-path migration was needed or performed.

## Deferred / not applicable (with reasons — not silently skipped)

- All measures in Overview/Voice/Chat/Customer tabs: either pending
  definitions (FCR/AHT/Escalation), non-canonical operational counts, or
  chart shapes (time series, histograms) `cmaEvaluate`'s single-value/
  single-groupBy contract cannot produce — reusing CMA-4B's and CMA-4A's
  identical findings where the same measures recur (Avg Intent Accuracy),
  not re-litigated from scratch.
- `Reports.tsx`: no real calculation exists anywhere on the page to
  migrate — a pre-existing mock surface, unrelated to this session's
  scope to build out.

## Business Data Scope / permissions

Not reimplemented — reused. `CampaignOverviewStats.tsx` calls the same
unmodified `cmaEvaluate` route CMA-4B/4A already established scope
enforcement for. `cma.evaluate` grants re-confirmed unchanged
(`administrator`/`analyst`/`read_only`/`supervisor`) — not widened.
Viewers without it (including `operator`, who can view Analytics but not
Outbound Campaigns management) see the identical legacy-summed numbers,
unchanged from before this session.

## Verification

- `npm run typecheck` — clean.
- `npm run verify:full` — 46 tests, 0 failed.
- `npm run build` — clean production build.
- HIG review — ran, result recorded in the commit gate.
- **Live browser verification, performed, not merely claimed**: logged
  into `npm run dev:vercel` as a real administrator, navigated to
  Analytics → Campaigns tab, and the rendered page showed "Total
  Campaigns 5 / Active Campaigns 1 / Total Targets 8 / Calls Triggered 2
  / Success Rate 100.0% / 6 unclassified" — matching exactly the
  already-proven CMA values from CMA-4B's production comparison
  (CAMP-01=8, CAMP-02=2/2=100%). **One limitation, reported honestly**: a
  second attempt to re-confirm this specific component's network calls
  (as was done for `CampaignStatStrip`/`CampaignDetail` in CMA-4B/4B.1)
  was blocked by `vercel dev`'s known intermittent instability — the dev
  server itself crashed mid-session (the same recurring proxy issue
  documented in three prior session reports), and a restart attempt hit
  it again. The rendered values were confirmed correct by direct
  observation before the crash; a network-level re-confirmation specific
  to this component was not completed. Given this component reuses
  identical, already network-verified code (`useCmaMeasure`,
  `cmaEvaluationService.ts`) to the sibling component already confirmed
  via network inspection twice this session, this is a low-risk gap, not
  an unverified implementation — but it is reported as a gap, not glossed
  over.
- Dashboard CMA measures and CMA-4B's campaign integrations were spot
  checked earlier this session (CMA-4B.1's production pass) and were not
  touched by this session's one-file change.

## Genuine calculation discrepancies found

None. The one migration performed reuses a formula and window
construction already proven byte-identical to production in CMA-4B; no
new discrepancy was introduced or discovered.

## Summary

- **1 occurrence migrated** (`CampaignOverviewStats.tsx`'s Total
  Targets + Success Rate).
- **Reports.tsx confirmed to contain no real measures** — not a gap in
  this session's work, a pre-existing fact about that page.
- Every other Analytics tile/chart either remains on a pending
  definition, has no canonical-measure equivalent, or is a shape
  (time-series/histogram) CMA's evaluation contract doesn't support —
  each with a specific, stated reason, not a blanket "not done."

## Addendum — Session CMA-4C.1: production deployment and verification

**Deployment.** Commit `810e888` (`810e88806477de1d643bcf6c55087603b6bb7499`)
pushed to `main`; Vercel auto-deployed
(`callcenter-1b2qkl8mn-sk-tardis-projects.vercel.app`) and is aliased to
`callcenter-three-livid.vercel.app` (confirmed via `vercel inspect`). No
Supabase migration was needed or applied — confirmed, none expected for
a pure frontend data-source change.

**Pre-deployment re-verification.** Confirmed commit `810e888` contains
exactly `src/components/campaigns/CampaignOverviewStats.tsx` and this
session doc, nothing else; working tree otherwise clean (only
pre-existing, unrelated untracked files and `.env`, untouched).
`npm run typecheck` / `npm run verify:full` (46 tests, 0 failed) /
`npm run build` all re-run clean immediately before pushing.

**Production smoke test** (on `callcenter-three-livid.vercel.app`, real
authenticated administrator session):

| Check | Result |
|---|---|
| Analytics → Campaigns renders correctly | **Confirmed** — Total Campaigns 5, Active 1, Total Targets 8, Calls Triggered 2, Success Rate 100.0%, 6 unclassified |
| Total Targets / Success Rate use `cmaEvaluate` | **Confirmed** — exactly 2 `POST /api/admin?resource=cmaEvaluate` calls (CAMP-01 + CAMP-02), both 200, observed via network inspection |
| Results match independently queried production facts | **Confirmed** — identical to the CAMP-01=8, CAMP-02=2/2=100% values already proven against production in CMA-4B |
| Campaign filtering remains functional | **Confirmed** — the status filter `<select>` (all/draft/scheduled/running/paused/completed/stopped/failed) is present and unmodified by this change |
| Other Analytics tabs unchanged | **Confirmed** — Overview tab tiles unchanged (0 values for the current narrow window, same FCR/AHT/Escalation/Intent Accuracy fields as before) |
| Reports mock catalog unchanged | **Confirmed** — still shows the same fabricated "12 Scheduled Reports" / "156 Downloads This Month" placeholder content, "No reports found" for the default filter — exactly as documented as pre-existing mock content, not touched |
| Dashboard CMA cards remain operational | **Confirmed** — Resolution/Resolution Time/Auth Success still show (correctly) "No eligible population" for the current window; FCR/Escalation unchanged on the legacy path |
| Campaign list/detail CMA integrations remain operational | **Confirmed** — Outbound Campaigns list renders with the same CMA-sourced totals (8 targets, 100.0%) as before this deployment |
| Unauthorized CMA requests remain rejected | **Confirmed** — an anonymous `POST /api/admin?resource=cmaEvaluate` still returns `401` |

**Remaining deferred integrations** — unchanged from the original CMA-4C
report above: all pending-definition measures (FCR/AHT/Escalation/Call
Technical Performance) untouched; Avg Intent Accuracy, turn
latency/concurrency, and every time-series/histogram chart remain
on their existing implementations for the documented reasons (no
canonical measure, or a chart shape `cmaEvaluate`'s single-value/
single-groupBy contract cannot produce); `Reports.tsx` remains
unbuilt/mock, out of this session's scope to construct.

No unresolved issues found. CMA-4D/CMA-5 not started, per this
session's boundary.
