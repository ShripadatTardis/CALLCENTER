# Session R2 — Ratio Live Analytics

Implements the first complete real analytical vertical slice for FCR, Escalation Rate, and AHT, on top of the R1 Ratio Explorer foundation. Implemented directly in this session (no subagents). Committed locally as `2446aea`. Not deployed.

## Architecture implemented

```
GET /api/v1/call-data (Call Centre, status=inactive, date_from/date_to, direction)
  → src/server/analytics/callPopulationFetcher.ts   (loops ALL pages server-side, bounded by maxPages, honestly discloses if capped)
  → src/server/analytics/ratioMath.ts               (pure, deterministic FCR/Escalation/AHT calculation)
  → src/server/analytics/ratioDimensions.ts         (real grouping for breakdown + trend bucketing)
  → src/server/analytics/ratioRegistry.ts           (updated eligibility/dimension metadata)
  → src/server/analytics/ratioService.ts            (orchestrates all 5 views per ratio)
  → api/analytics/metrics.ts (resource=ratios)       (unchanged transport wrapper, same R1 contract)
  → src/services/analytics/ratiosService.ts / useRatio.ts hooks  (unchanged R1 contract, +pagination params)
  → src/pages/RatioExplorer.tsx + components         (unchanged R1 shell, now backed by real data)
  → useCallData / InteractionDetailDialog             (existing evidence capability, reused unmodified)
```

No ratio-specific page or API was created. No new Vercel function was added (function count confirmed still 11).

## Actual source of facts

`GET /api/v1/call-data` (the same endpoint Call Logs already uses), queried with `status=inactive` (the exact convention `CallLogs.tsx` already uses for "completed/historical calls" — not invented here) plus `date_from`/`date_to`/`direction`, looped page-by-page (`page_size=200`, up to `maxPages=15` → 3000 records) until the backend's own `pagination.total_pages` is reached or the cap is hit. This is genuine server-side aggregation over the real per-call population — never a single page, never browser-side arithmetic.

**Honest cap disclosure**: if the cap is hit before the true total is reached, every affected response carries `populationCapped: true` and `trueTotalRecords` (the backend's own reported total), and the UI (`RatioHero`, `BreakdownTable`, `InteractionTable`, `RatioTrend`) renders a visible amber notice rather than silently presenting a partial aggregate as complete.

## Exact FCR calculation

`src/server/analytics/ratioMath.ts` `computeFcr()`:
- **Denominator** = every fetched call in the window (`fcr` is a required, always-present boolean on `CallDataEntryDto` — there is no "not evaluated" state for this field today).
- **Numerator** = calls where `fcr === true`.
- **Value** = `null` when denominator is 0 (no data), otherwise `(numerator/denominator) × 100`, one decimal place.

## Exact Escalation Rate calculation

`computeEscalationRate()`:
- **Denominator** = "handled" calls, defined as calls with a determinate `outcome` (`'resolved'` or `'escalated'`) — a call with neither is not yet a settled interaction and is excluded, never silently counted as a non-escalation.
- **Numerator** = calls where `outcome === 'escalated'`.
- **Value** = same null-or-rate rule as FCR.

## Exact AHT calculation

`computeAht()`:
- **Denominator** = calls with a finite, non-stale `duration_seconds` — reuses the EXACT `isStaleDuration()` 4-hour guard already fixed for Agent Detail in Session 11.7 (same dirty-demo-data class of row excluded the same way everywhere in this product, not a new rule invented for Ratios).
- **Numerator** = sum of those durations.
- **Value** = `null` when denominator is 0, otherwise `numerator / denominator`, in seconds.

## Trend status

**Implemented, real.** `computeTrendPoints()` buckets the same fetched population by `start_time` — hourly buckets for ranges ≤24h, daily buckets for 7d/30d (`bucketGranularity()`) — and computes value/numerator/denominator/population per bucket using the exact same `RATIO_CALCULATORS` used for summary. Rendered with `recharts` (already an installed dependency — no new charting library) as a line chart with a tooltip surfacing numerator/denominator/population per point, per spec §4.3's "never show a trend without its population." Deterministically verified against a synthetic fixture (see §Validation).

## Breakdown status/dimensions

**Implemented, real**, for: `intent`, `agent`, `campaign`, `direction`, `outcome` — every one backed by a real, confirmed `CallDataEntryDto` field (`intent`, `ai_agent_name`/`ai_agent_id`, `campaign_name`, `direction`, `outcome`). `direction` and `outcome` are native call-data query params, applied server-side by the population fetcher itself; `intent`/`agent`/`campaign` have no native query param, so they're grouped server-side (still inside the Vercel function, never the browser) from the same fetched population. Unsupported dimensions return an HTTP 400 validation error (`api/analytics/metrics.ts`), never silently ignored. A selected breakdown value becomes part of the existing R1 URL/filter state and is honored consistently by summary, trend, breakdown, and interactions — no second filter model was created.

## Interaction drill status

**Implemented, real, and genuinely paginated.** `getRatioInteractions()` filters the fetched population to exactly the same eligibility rule as the ratio itself (e.g. AHT's interaction list excludes the same stale-duration rows `computeAht` excludes), slices the requested page, and returns a real `totalCount`. Selecting a row opens the EXISTING `InteractionDetailDialog` via the EXISTING `useCallData` hook (`src/components/ratios/InteractionInspector.tsx`, unmodified from R1) — no second transcript/recording viewer was built.

## Comparison status

**Implemented, real, for summary only.** A second `fetchCompleteCallPopulation()` call against the equal-length immediately-preceding window (`previousDateWindow()`) computes the same aggregate; `computeComparison()` returns a percentage-point delta for FCR/Escalation Rate and a plain-seconds delta for AHT. If either window has no data, or the previous-period fetch fails, `comparison` stays `null` — never a fabricated delta. Trend-level and breakdown-level comparison were not implemented (out of the explicit R2 scope, which asked for comparison only where "cleanly supported by the same aggregation mechanism" — extending it to every trend point/breakdown row would double the already-doubled population-fetch cost again, a genuine R3 sizing question).

## Driver status

**Implemented for Escalation Rate only, using the raw field, no invented taxonomy.** `getRatioDrivers()` groups escalated calls by the literal `escalation_trigger` string value — whatever the backend actually returns, verbatim, with no normalization/categorization imposed. If the field turns out to be empty/unpopulated in production, the UI will honestly show "escalation_trigger is not populated on the escalated interactions in this window" rather than fabricating categories. **This could not be empirically checked this session** — the demo backend was down for the entire session (see §Live-backend verification status) — so whether `escalation_trigger` is "sufficiently structured" in real production data is unverified; the mechanism is real and ready either way. FCR and AHT correctly have no driver dimension (matches the registry; Drivers isn't rendered for them at all).

## Backend limitations discovered

1. **Serverless execution-time budget bounds "complete population."** A Vercel Hobby-plan Node function has a real, finite execution window; this repository has no `maxDuration` override. The `maxPages=15`/`page_size=200` cap (3000 records) is a documented, disclosed limit, not a silent one — if production call volume grows well beyond that for a 30-day window, requests will start reporting `populationCapped: true` rather than quietly under-counting. This is the same bounded-pagination pattern `src/server/customer360/reconcileJob.ts` already established (`maxPages`, no time-budget mechanism) — reused, not reinvented.
2. **Comparison doubles the fetch cost.** Every summary request now performs two complete-population fetches (current + previous window). Acceptable at today's real call volume; worth revisiting if volume grows significantly.
3. **`intent`/`agent`/`campaign` have no native call-data query param** — breakdown/interaction filtering on these dimensions is applied in the Vercel function after fetching, not pushed down to the Call Centre backend. This is real, correct server-side aggregation (never the browser), but it means the population-fetch cap applies BEFORE this filter narrows anything — a heavily-filtered breakdown value on a large date range could, in principle, return fewer matching rows than truly exist if the cap was hit before enough matching rows were seen. The `populationCapped` disclosure covers this honestly.
4. **`escalation_trigger`'s real structure is unverified this session** (backend down) — see §Driver status.
5. Confirmed via `tsconfig.app.json`: this project's `src/` compiles with `strict: false`. This directly caused a real bug this session (see §Validation) that `tsc --noEmit` silently passed despite it — a `Record<RatioDimension, string>` object literal was missing a required key and TypeScript did not flag it. Worth knowing for any future session: a clean `tsc` here is not proof of full type-safety; structural/manual verification remains necessary.

## Files created

- `src/server/analytics/callPopulationFetcher.ts` — real complete-population fetcher, bounded pagination, date-window helpers.
- `src/server/analytics/ratioMath.ts` — pure FCR/Escalation/AHT calculators + comparison helper.
- `src/server/analytics/ratioDimensions.ts` — real breakdown grouping + trend bucketing.

## Files modified

- `src/server/analytics/ratioService.ts` — rewritten to orchestrate the real population-based calculation for all 5 views, for FCR/Escalation Rate/AHT only.
- `src/server/analytics/ratioRegistry.ts` — updated eligibility notes/supported dimensions for the 3 implemented ratios to reflect the real R2 mechanism (added `direction`, removed the R1 placeholder `domain`/`time` breakdown entries that weren't genuinely backed).
- `src/types/ratio.ts` — added `direction` to `RatioDimension`; added `populationCapped`/`trueTotalRecords` to summary/trend/breakdown/interactions DTOs; added `declaredDrillDimensions`/`declaredDriverDimension` to the frontend definition type; added real pagination fields to the interactions DTO.
- `src/lib/ratios/ratioFrontendRegistry.ts` — added the two new declared-dimension fields to all 21 entries (real values for fcr/escalation_rate/aht, empty/null for the remaining 18, unchanged this session).
- `api/analytics/metrics.ts` — threads `filters` through to trend/breakdown/drivers, adds `page`/`pageSize` passthrough for interactions. Default (non-ratios) behavior untouched.
- `src/services/analytics/ratiosService.ts`, `ratiosKeys.ts`, `src/hooks/analytics/useRatio.ts` — added `page`/`pageSize` params to the interactions call chain.
- `src/components/ratios/BreakdownSelector.tsx` — added the missing `direction` label (see §Validation for the bug this caught).
- `src/components/ratios/BreakdownTable.tsx` — added real Numerator/Denominator columns, capped-population disclosure banner.
- `src/components/ratios/InteractionTable.tsx` — real Previous/Next pagination, capped-population disclosure banner.
- `src/components/ratios/RatioTrend.tsx` — replaced the R1 placeholder text with a real `recharts` line chart + tooltip.
- `src/components/ratios/RatioHero.tsx` — capped-population disclosure banner.
- `src/pages/RatioExplorer.tsx` — uses the frontend registry's real declared dimensions instead of R1's family-based guess; wires interaction pagination state; `DriverPanel` now only renders when the ratio actually declares a driver dimension (was unconditional in R1).

## Validation

- `npx tsc --noEmit` — clean (both before and after the fix below; see the `strict: false` caveat in §Backend limitations item 5).
- `npm run build` — clean production build.
- `npm run lint` — 117 errors / 36 warnings, exact match to the documented baseline; zero findings in any Ratio-related file.
- **Deterministic ratio maths — verified against the REAL compiled code, not a reimplementation.** `npx esbuild src/server/analytics/ratioMath.ts --bundle ...` produces the actual shipped function bodies; `.tooling/scripts/ratio-math-verify.mjs` imports that bundle and asserts:
  - FCR 8/10 = 80% ✅
  - Escalation 2/10 = 20% ✅
  - AHT (30+60+90)/3 = 60s ✅
  - 0/10 = legitimate 0% (not null) ✅
  - 0 eligible = null/no-data (both FCR and Escalation Rate, and AHT with no valid duration) ✅
  - AHT correctly excludes a stale (≥4h) duration row from both numerator and denominator ✅
  - Filtering by `intent` genuinely changes numerator/denominator (two different subsets produce two different correct results) ✅
  - **10/10 passed.**
- Same technique for `src/server/analytics/ratioDimensions.ts` (`.tooling/scripts/ratio-dimensions-verify.mjs`): breakdown-by-intent groups a 3-call fixture into the correct 2 groups with correct per-group numerator/denominator/population; `bucketGranularity` returns `day` for 7d/30d and `hour` otherwise; trend bucketing by day produces the correct per-bucket numerator/denominator. **4/4 passed.**
- **A real bug was found and fixed during structural verification**, not by the deterministic tests above: `BreakdownSelector.tsx`'s `DIMENSION_LABELS` map (typed `Record<RatioDimension, string>`) was missing the newly-added `direction` key. Despite the `Record<...>` typing, `tsc --noEmit` did not flag this (see §Backend limitations item 5's `strict: false` explanation) — it was caught by opening `/ratios/fcr` and reading the actual rendered `<select>` options, which showed a blank entry between "Campaign" and "Outcome." Fixed; re-verified the dropdown now shows "None, Intent, Agent, Campaign, Direction, Outcome" correctly for all three implemented ratios.

## Live-backend verification status

**The demo backend (`bankingvoicebot.nl-demo.com`) was unreachable for this entire session** — confirmed via a direct `curl` against 3 separate endpoints (`/api/v1/call-data`, `/`, `/api/v1/docs`), all timing out after 8–10s, indicating a full outage rather than an endpoint-specific issue. Per this project's established house rule, this is treated as "verification deferred," not "failed," and implementation proceeded from the confirmed, already-typed API contract (`CallDataQueryDto`/`CallDataSummaryDto`/`CallDataPaginationDto`) rather than being blocked.

Distinguishing exactly what was and wasn't verified:
- **Structural verification (done)**: local `vite` dev server + Playwright/Edge — `/ratios`, `/ratios/fcr`, `/ratios/escalation_rate`, `/ratios/aht` all load without crashing; the Breakdown selector renders and can be interacted with; an invalid ratio ID is handled cleanly; no horizontal overflow at 390px width; zero JS console errors across the whole pass.
- **Deterministic verification (done)**: the actual calculation/grouping/bucketing logic, proven correct against synthetic fixtures matching the prompt's own worked examples exactly (see §Validation above).
- **Live-backend verification (NOT done, explicitly deferred)**: whether the real production `escalation_trigger` data is structured enough for a useful Driver view; whether `populationCapped` ever actually triggers at real production volume; the true shape of a real multi-day trend/breakdown against genuine data; whether the previous-period comparison produces sensible real deltas. All of these require the live Call Centre backend and should be the first thing re-checked once it's back up, using the same Playwright+Edge authenticated-navigation technique already established in this project (`scripts/responsive-check-auth-probe.mjs`).

## Regression check

`git status`/`git diff` confirm the touched-file set is exactly: `api/analytics/metrics.ts`, `src/server/analytics/*` (2 new + 1 modified... see file list above for the precise breakdown), `src/types/ratio.ts`, `src/lib/ratios/ratioFrontendRegistry.ts`, `src/services/analytics/ratios*.ts`, `src/hooks/analytics/useRatio.ts`, `src/pages/RatioExplorer.tsx`, and 5 `src/components/ratios/*.tsx` files. **Zero other files touched** — Dashboard, Analytics, Reports, Call Logs, Live View, Campaigns, QA Review, AI Agents, Orchestrator, User Management, Settings, the sidebar/pillar nav, and the R1 Ratio Catalogue page/routing were all confirmed unmodified. Vercel function count unchanged at 11 (no new `api/*.ts` file).

## Commit

`2446aea` — local commit only, not deployed.
