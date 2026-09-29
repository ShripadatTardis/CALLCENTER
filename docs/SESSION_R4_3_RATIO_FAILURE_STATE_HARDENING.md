# Session R4.3 — Ratio Explorer Failure-State & Live-Data Hardening

Runtime-state hardening only. No ratio formula/mathematics changed, Completion Rate not implemented, no inference made from `outcome='dropped'`, R5 migration not applied, no R6 telemetry producer built. Implemented directly (no subagents), per the standing Session 12.1 instruction. Campaign Session 12.3 Phase E confirmed untouched throughout.

## 1. Error-propagation audit (performed before any implementation)

Traced `Ratio UI → hook (useRatio.ts) → services/analytics/ratiosService.ts → api/analytics/metrics.ts (resource=ratios) → ratioService.ts → AggregationProvider (callPopulationProvider.ts) → callPopulationFetcher.ts → real Call Data API`.

**Finding — the single collapse point**: `api/analytics/metrics.ts`'s ratios dispatch branch already always responds `HTTP 200` with a DTO — every possible failure is absorbed *before* reaching that layer. The actual collapse happens in `callPopulationFetcher.ts`/`ratioService.ts`:

- `callPopulationFetcher.ts`'s `fetchCallDataPage()` threw a single bare `Error('call-data request failed: ' + res.status)` for *any* non-2xx response, and let a genuine network failure (`fetch()` itself throwing) propagate as an unrelated, undecorated exception — no way to distinguish a 4xx contract rejection from a 5xx/unreachable condition from the exception alone.
- `ratioService.ts` had 5 separate `catch { … }` blocks (`getRatioSummary`, `getRatioTrend`, `getRatioBreakdown`, `getRatioDrivers`, `getRatioInteractions`), every one of which discarded whatever it caught and substituted the same hardcoded string: `"Live call data temporarily unavailable — Call Centre did not respond."` — regardless of whether the real cause was a 4xx, a 5xx, or a true network outage.
- **This is exactly the mechanism that let the R4.1 `page_size=200` defect (a 4xx) masquerade as "backend unavailable" for three sessions.** The audit confirms the minimum correction point is these two files — no other layer needed to change.

"No eligible data" was already distinguished *textually* (`unavailableReason: result.denominator === 0 ? 'No qualifying interactions...' : null`) but not *structurally* — the frontend (`RatioUnavailableState.tsx`) rendered every non-null `unavailableReason` with the identical `AlertTriangle` warning visual, so a benign empty result looked exactly like a real failure (item 4's "no eligible data should not look like an application failure" was not met before this session).

## 2. Explicit runtime states introduced

`src/types/ratio.ts` — new `RatioRuntimeState = 'live' | 'no_data' | 'not_instrumented' | 'upstream_rejected' | 'upstream_unavailable'`, added alongside (never replacing) the existing `RatioAvailability` on every response DTO (`RatioSummaryDto`, `RatioTrendResponseDto`, `RatioBreakdownResponseDto`, `RatioDriverResponseDto`, `RatioInteractionsResponseDto`), each also gaining `httpStatus: number | null` (the raw status code only — never response body/headers/secrets).

**Provenance vs. runtime health kept strictly separate (item 3)**: `RatioAvailability` (`direct`/`derived`/`partial`/`backend_gap`) is set once per ratio by the registry and never changes because of a request outcome. `RatioAvailabilityBadge.tsx` — untouched. A `direct` ratio experiencing an `upstream_unavailable` runtime state still reports `availability: 'direct'` in the same response; only its `runtimeState` reflects the transient condition.

## 3. Fix — `src/server/analytics/callPopulationFetcher.ts`

New `CallDataFetchError extends Error` with `kind: 'rejected' | 'unavailable'` and `status: number | null`:
- `fetch()` itself throwing (DNS/connection refused/timeout) → `kind: 'unavailable'`, `status: null` — the real R2–R4 outage shape.
- HTTP response received but `!res.ok`, status 400–499 → `kind: 'rejected'`, `status: <code>` — Call Centre is reachable and answered, but rejected the request (the R4.1 defect's exact shape).
- HTTP response received but `!res.ok`, status ≥500 → `kind: 'unavailable'`, `status: <code>` — Call Centre is up but failing server-side.

## 4. Fix — `src/server/analytics/ratioService.ts`

New `classifyFetchFailure(err)` helper — the one place that turns a caught `CallDataFetchError` (or any other exception) into `{runtimeState, httpStatus, reason}`, reused by all 5 functions' catch blocks. Every return path across all 5 functions now sets `runtimeState` explicitly:
- Unknown ratio ID / not in `IMPLEMENTED_RATIOS` → `not_instrumented` (never touches `fetch` at all).
- Fetch succeeds, real denominator/rows > 0 → `live`.
- Fetch succeeds, zero qualifying records → `no_data` (unchanged textual reason, now also structurally distinct).
- Fetch throws → `upstream_rejected` (4xx) or `upstream_unavailable` (5xx/network), via `classifyFetchFailure`.

`IMPLEMENTED_RATIOS` (the 5 live Direct ratios) is byte-for-byte unchanged — confirmed by test #8 below.

## 5. Frontend — visual distinction, in-place, with Retry

`RatioUnavailableState.tsx` rewritten to accept `runtimeState`/`httpStatus`/`onRetry`:
- `no_data` / `not_instrumented` → neutral `Info` icon, standard muted card styling (`border-border bg-card/40`) — **never looks like a failure**.
- `upstream_rejected` / `upstream_unavailable` → `AlertTriangle`, amber tone (the same amber already used elsewhere in this app for population-capped disclosures — not a new color), the HTTP status shown inline for `upstream_rejected` (e.g. "(HTTP 422)"), and a **Retry** button (React Query's `refetch()`, threaded down from `RatioExplorer.tsx` through every consuming component) when `onRetry` is supplied — satisfying item 4's "provide concise explanation and Retry for transient runtime failures."

`RatioHero.tsx`, `RatioTrend.tsx`, `BreakdownTable.tsx`, `DriverPanel.tsx`, `InteractionTable.tsx` — each now passes its own DTO's `runtimeState`/`httpStatus` and an `onRetry` callback through to `RatioUnavailableState`. All applied **inside the existing R4.2 investigation workspace** — no new route, no separate error page, no navigation away from the ratio being investigated (item 4).

## 6. Item 6 — small UI polish, audited, confirmed already correct

Re-inspected the deployed R4.2 UI's investigation view against the checklist: "← All Ratios", breadcrumb, period selector, KPI/value/formula/provenance, trend, breakdown, contributing evidence — all present and unchanged by this session (R4.3 only threads new props through existing markup, no layout change). Breakdown selection (`None/Intent/Agent/Campaign/Direction/Outcome`) was re-confirmed to already preserve the rest of the investigation's context filters on change (`setFilter('breakdown', d)` + `clearFilter('breakdownValue')` only — `range`/`direction`/`campaign`/`agent`/`intent` untouched) — no regression, no change needed.

## 7. Controlled tests (mocked — the real Voice backend was never touched to manufacture failure conditions)

New `.tooling/scripts/ratio-runtime-state-verify.mjs`, run against the actual compiled `ratioService.ts` (via `esbuild`, not a reimplementation) with `global.fetch` stubbed per case:

1. Successful live response (10 real calls, FCR 8/10) → `runtimeState: 'live'`, `value: 80` ✅
2. Empty qualifying population (0 calls, real 200 response) → `runtimeState: 'no_data'`, `value: null` (never fabricated) ✅
3. Representative 4xx (422, the exact R4.1 page_size shape) → `runtimeState: 'upstream_rejected'`, `httpStatus: 422`, reason mentions the status code and explicitly not the generic outage wording ✅
4. Representative 5xx (500) → `runtimeState: 'upstream_unavailable'`, `httpStatus: 500` ✅
5. Genuine network failure (`fetch` throws `TypeError`) → `runtimeState: 'upstream_unavailable'`, `httpStatus: null` ✅
6. Not-yet-instrumented ratio (`csat`) → `runtimeState: 'not_instrumented'`, `fetch` never invoked (asserted by throwing if it were) ✅
7. Trend view, independently exercised with a 400 → `runtimeState: 'upstream_rejected'`, `httpStatus: 400` ✅
8. All 5 live Direct ratios (`fcr`, `escalation_rate`, `aht`, `resolution_rate`, `successful_resolution_time`) still resolve to `no_data` (not `not_instrumented`) under an empty-population mock — confirms `IMPLEMENTED_RATIOS` is unchanged ✅

**22/22 passed.**

Existing `ratio-math-verify.mjs` (R2/R3's 17-case deterministic suite) re-run unchanged — **17/17 passed**, confirming zero regression to any calculation logic (`ratioMath.ts` was not touched this session).

## 8. Validation

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm run lint` — 117 errors / 36 warnings, exact baseline match, zero new findings.
- HIG self-review (no subagent dispatch, per the standing no-subagent instruction) on all 10 staged files: the new amber "problem" tone reuses the same amber already established elsewhere in this app (population-capped disclosures); `Info`/`AlertTriangle` icons are always paired with visible text, never icon-only; the Retry button reuses the existing `Button` component (focus-visible by default); no new color, motion, or decorative element introduced. Recorded PASS.

## 9. Deployment and live verification

Deployed to production; the deployed instance was live-verified directly (not merely locally) for:
- All 5 Direct ratios still return real values with `runtimeState: 'live'` and no regression from R4.1's fix.
- The investigation workspace (breadcrumb, "← All Ratios", period selector, KPI/formula/provenance, trend, breakdown) renders unchanged.

Live 4xx/5xx/network-unavailable conditions were **not** manufactured against the real Voice backend (per the explicit instruction) — those three states are covered exclusively by the mocked deterministic suite in §7, which exercises the real shipped code path.

## Regression / scope confirmation

Files touched: `src/types/ratio.ts`, `src/server/analytics/callPopulationFetcher.ts`, `src/server/analytics/ratioService.ts`, `src/components/ratios/{RatioUnavailableState,RatioHero,RatioTrend,BreakdownTable,DriverPanel,InteractionTable}.tsx`, `src/pages/RatioExplorer.tsx`. `ratioMath.ts`, `ratioDimensions.ts`, `ratioRegistry.ts`, `callPopulationProvider.ts`, `aggregationProvider.ts`, `RatioCatalogue.tsx`, `useRatioCatalogueUIState.ts`, and every non-Ratio page/component are untouched. No `.tooling/` script is tracked (matches this project's established convention). Campaign Session 12.3 Phase E's campaign/target were not read-write touched at any point this session (confirmed via the same read-only queries used in R4.1/R4.2).
