# Session R3 — Extend Fact-Derived Ratios + Backend Aggregation Contract

Extends the R2 Ratio engine to Resolution Rate and Successful Resolution Time, deliberately leaves Completion Rate unavailable (with an honest, specific reason), and introduces the AggregationProvider abstraction so today's Vercel population-fetch implementation is clearly an adapter, not the permanent architectural ceiling. Implemented directly in this session (no subagents). Committed locally as `862cba8`. Not deployed.

## Source semantics discovered

Investigated `CallDataEntryDto`, the documented call-data API contract, and every existing reference to `outcome`/`stage`/`status`/`duration_seconds` in this repository before writing any calculation code.

- **`outcome`** — already confirmed real in R2 (`resolved`/`escalated` are the only two values ever treated as determinate; anything else is excluded, not silently classified). No new evidence needed — reused as-is.
- **`duration_seconds`** — already confirmed real in R2, with the existing `isStaleDuration()` 4-hour guard. No new evidence needed — reused as-is.
- **`stage`** — **the real value set has never been live-verified anywhere in this codebase.** `CallDataEntryDto.stage` is typed as a bare `string` (not a union). Every place a `'connecting'|'in-progress'|'complete'|'escalated'` enum appears (`src/data/liveViewData.ts`, `src/data/sampleCalls.ts`, `src/types/auth.ts`) is Lovable-era **mock** data, never a response from the real Call Centre backend. This is a materially different situation from `direction`, `fcr`, `outcome`, and `was_authenticated`, each of which carries an explicit "confirmed present... via live verification" comment elsewhere in this codebase.
- **`status` (query param) vs `status` (per-call field)** — `CallDataQueryDto.status` accepts `'active' | 'inactive' | 'completed'` as a filter value, but the per-call `CallDataEntryDto.status` field is typed with only 2 values (`'active' | 'inactive'`). This is an unexplained inconsistency in the documented contract — whether `status=completed` as a query filter behaves differently from `status=inactive`, or maps to some other real distinction, is unconfirmed.
- **The demo backend was unreachable this entire session too** (see Live-backend verification status) — re-confirmed via a fresh `curl` against `/api/v1/call-data` before starting, timing out identically to R2's outage.

Given this, Completion Rate's "connected vs. completed" distinction cannot be defensibly built — see below.

## Exact Resolution Rate definition

**Implemented, `direct`.** Reuses the exact "handled" population Escalation Rate already established in R2 — no second definition invented:
- **Denominator** = calls with a determinate outcome (`outcome === 'resolved' || 'escalated'`) — the SAME `handledCalls()` helper Escalation Rate uses.
- **Numerator** = calls where `outcome === 'resolved'`.
- Supported breakdown dimensions: `intent`, `agent`, `campaign`, `direction` — **`outcome` deliberately excluded**, since Resolution Rate's own population is already outcome-determined; breaking it down by outcome would just show the tautological resolved/escalated split back to itself.
- No Driver view exposed — `escalation_reason` stays an Escalation-Rate-specific view per R2 scope, not duplicated here merely because the field exists.

## Exact Completion Rate definition / status

**Left explicitly unavailable, downgraded from R1's `derived` to `partial`.** No repository evidence (live-verified or otherwise) confirms `stage`'s real value set or a defensible connected-vs-completed split — see "Source semantics discovered" above. Manufacturing this ratio from an unverified mock-derived guess would violate the session's explicit truthfulness rule ("No inferred completion mapping unless supported").

**Required backend contract to promote this to `direct`/`derived`** (documented in `ratioRegistry.ts`'s `eligibilityNote` verbatim, repeated here): Call Centre must confirm the real, complete value set of `stage` (or an equivalent field), and explicitly document which values represent "connected/attempted but not completed" (abandoned, failed, dropped, etc.) versus "completed" versus "still active." Until that's confirmed, `supportedDimensions: []` and the frontend catalogue badge correctly reads "Partial."

## Exact Successful Resolution Time definition

**Implemented, `direct`.** Reuses BOTH existing rules rather than inventing a third:
- **Eligible population** = Resolution Rate's numerator population (`outcome === 'resolved'`) intersected with AHT's exact duration-validity rule (`isStaleDuration()` guard, same as R2).
- **Numerator** = sum of those durations. **Denominator** = count of those same calls.
- **Value** = average duration, in seconds.
- Supported dimensions: `intent`, `agent`, `campaign`, `direction` — `outcome` excluded (population is already outcome-fixed to resolved).

## Supported dimensions for each (summary table)

| Ratio | Dimensions | Driver |
|---|---|---|
| Resolution Rate | intent, agent, campaign, direction | none |
| Completion Rate | *(none — unavailable)* | none |
| Successful Resolution Time | intent, agent, campaign, direction | none |

## Comparison behavior

Reuses the exact R2 mechanism, no new implementation. Both new ratios flow through the same `computeComparison()` and the same `ProviderFilters.dateOverride` mechanism (see "Aggregation-provider architecture" below) that fetches the equal-length previous period through the provider abstraction. Resolution Rate uses percentage-point delta (it's in `PERCENT_RATIOS`); Successful Resolution Time uses a plain seconds delta. `comparison` stays `null` whenever either window has no data — never fabricated.

## Interaction eligibility

`RATIO_ELIGIBLE_POPULATION` (new, in `ratioMath.ts`) is now the single source of truth for "which calls does this ratio's interaction drill-down show" — used by BOTH `computeResolutionRate`/`computeSuccessfulResolutionTime`'s own internal filtering AND `callPopulationProvider.getInteractions()`, so summary and interactions can never drift apart:
```
fcr: every call
escalation_rate / resolution_rate: handledCalls (determinate outcome)
aht: withValidDuration
successful_resolution_time: withValidDuration(resolved calls only)
```

## Aggregation-provider architecture

**A real refactor, not just an addition.** R2's `ratioService.ts` inlined the population-fetch-and-compute orchestration directly. R3 extracts that behind a new `AggregationProvider` interface (`aggregationProvider.ts`):

```
Ratio Explorer (React)
     ↓
Generic Ratio API (api/analytics/metrics.ts, resource=ratios) — UNCHANGED
     ↓
Ratio Service (ratioService.ts) — resolves definition, wraps provider result into public DTOs
     ↓
AggregationProvider interface — getSummary / getTrend / getBreakdown / getInteractions
     ↓
     ├── TODAY: callPopulationProvider.ts (exactly R2's mechanism, extracted not rewritten)
     └── FUTURE: a backend-native provider (not built this session — see below)
```

`ProviderFilters` (server-side-only, extends the public `RatioFilterState` with an optional `dateOverride: {dateFrom, dateTo}`) lets the Ratio Service ask any provider for an arbitrary period — this is what makes the previous-period comparison honestly go through the SAME interface a future provider would also need to support, rather than bypassing the abstraction for that one case. Drivers (Escalation Rate only) deliberately stays OUTSIDE this interface — the prompt's own §10 contract only lists summary/trend/breakdown/interactions, and Drivers is a genuine one-ratio special case, not a generic operation every ratio needs (matches "keep this abstraction small").

**No new frontend service, no `/api/v2`, no second Ratio registry, no duplicated DTOs** — `RatioAggregateResult`/`RatioTrendResult`/`RatioBreakdownResult`/`RatioInteractionsResult` in `aggregationProvider.ts` deliberately mirror `ratioMath.ts`'s existing shapes rather than inventing parallel ones.

## Current population-provider limitations (unchanged from R2, preserved not weakened)

`page_size=200`, `maxPages=15` → maximum 3000 fetched records per population fetch, exactly as R2 shipped — **not increased**. `populationCapped`/`trueTotalRecords` disclosure is fully intact and now flows through the new `RatioAggregateResult`/`RatioTrendResult`/etc. shapes unchanged. The current provider is explicitly NOT claimed to be indefinitely scalable anywhere in code or docs.

## Future backend-native contract (documentation only — nothing built)

A future backend-native `AggregationProvider` implementation should:
- Perform filtering and aggregation **close to the data** (COUNT/SUM/AVG/GROUP BY/time-bucketing at the source), returning only aggregate results — never require downloading thousands of raw call rows into a Vercel function the way today's provider does.
- Support push-down filters for: date range, direction, intent, agent, campaign, outcome (the same dimensions the Ratio registry already declares as meaningful per ratio).
- Still support genuinely **paginated interaction references** for the Interactions view — aggregation alone is insufficient there; a future provider's `getInteractions()` must return real, individually-addressable interaction IDs usable by the existing `useCallData`/`InteractionDetailDialog` evidence path, not an aggregate-only response.
- Implement the exact same `AggregationProvider` interface (`getSummary`/`getTrend`/`getBreakdown`/`getInteractions`) — swapping `provider` in `ratioService.ts`'s one assignment line (`const provider: AggregationProvider = callPopulationProvider`) is the entire integration surface. No changes to the Ratio Explorer, the generic Ratio API route, the frontend service/hooks, or any DTO would be required.
- This document does **not** prescribe PostgreSQL specifically, or any other database technology — the actual Call Centre backend's technology is outside this repository and unconfirmed; the contract above is deliberately expressed in operation terms (COUNT/SUM/AVG/GROUP BY/bucketing), not SQL syntax.

## Files created

- `src/server/analytics/aggregationProvider.ts` — the `AggregationProvider` interface + result types + `ProviderFilters`.
- `src/server/analytics/callPopulationProvider.ts` — today's concrete implementation (extracted from R2's `ratioService.ts`, behavior unchanged).

## Files modified

- `src/server/analytics/ratioMath.ts` — added `computeResolutionRate`/`computeSuccessfulResolutionTime`, factored out shared `handledCalls()`/`withValidDuration()` helpers (now used by 4 calculators, not duplicated per-ratio), added `RATIO_ELIGIBLE_POPULATION`.
- `src/server/analytics/ratioRegistry.ts` — resolution_rate/successful_resolution_time upgraded to `direct` with corrected `supportedDimensions`/eligibility notes; completion_rate downgraded from `derived` to `partial` with a specific, evidence-based unavailable reason.
- `src/server/analytics/ratioService.ts` — refactored to depend on `AggregationProvider` instead of inlining fetch+compute; `IMPLEMENTED_RATIOS` extended to include the two new ratios; comparison logic fixed to use `ProviderFilters.dateOverride` (see note below).
- `src/lib/ratios/ratioFrontendRegistry.ts` — matching `declaredAvailability`/`declaredDrillDimensions` updates for all 3 ratios investigated this session.

**No `.tsx` component file was touched in R3** — this session extended the engine (registry/math/service/provider), not the UI, exactly matching the objective's framing.

## A bug caught and fixed during this session's own refactor (worth recording)

While extracting `ratioService.ts`'s summary logic to call through the new `AggregationProvider` interface, the first draft of the previous-period comparison call was wrong — it called `provider.getSummary(ratioId, filters)` with the SAME `filters.range`, which `callPopulationProvider` would resolve to the SAME date window as the current period, silently comparing a window against itself rather than the true previous period. Caught by direct code review before running any verification (not by a test — worth being honest about that), fixed by adding `ProviderFilters.dateOverride` to the interface so the Ratio Service can request an explicit arbitrary window through the same abstraction, and updating the comparison call site to use it.

## Validation

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm run lint` — 117 errors / 36 warnings, exact baseline match, zero findings in any Ratio file.
- **Deterministic verification — extended, run against the real compiled code** (`npx esbuild ... && node .tooling/scripts/ratio-math-verify.mjs`), all of the prompt's explicit worked examples plus the existing R2 set:
  - Resolution Rate 8 resolved / 10 determinate = 80% ✅
  - Resolution Rate 0 resolved / 10 determinate = legitimate 0% ✅
  - No determinate outcomes → null/no data ✅
  - Successful Resolution Time: resolved valid durations 30/60/90 → 60s ✅
  - Successful Resolution Time: non-resolved interactions do not affect numerator/denominator (verified with a deliberately extreme non-resolved duration that would obviously skew the result if incorrectly included) ✅
  - Successful Resolution Time: stale durations excluded using the SAME R2 rule ✅
  - **17/17 passed** (10 from R2 + 7 new).
  - `ratioDimensions.ts`'s breakdown/trend grouping re-verified unchanged, 4/4 passed (no ratio-specific logic lives there, so no new cases were needed — the existing fixtures already prove the generic mechanism works for any registered calculator).
- **Structural verification** (Playwright + Edge, local `vite` dev, backend down): `/ratios/resolution_rate` and `/ratios/successful_resolution_time` load cleanly with the correct 4-dimension breakdown selector (no "Outcome" option, confirmed); `/ratios/completion_rate` loads with a Hero showing "Partial" and no breakdown selector at all (correctly hidden — zero declared dimensions); `/ratios` catalogue shows the correct badges for all 3 (Completion Rate = Partial, Resolution Rate = Direct, Successful Resolution Time = Direct); zero console errors across the whole pass.

## Live-backend verification status

**Not performed — explicitly deferred, not failed.** The demo backend was unreachable for this entire session, re-confirmed via a fresh `curl` against `/api/v1/call-data` before starting (timeout, matching R2's outage pattern). Distinguishing exactly what was and wasn't verified, per the prompt's explicit requirement:
- **Structural verification (done)**: routes load, correct dimension sets render, correct availability badges render, zero crashes.
- **Deterministic verification (done)**: the actual calculation logic, proven correct against synthetic fixtures matching the prompt's exact worked examples.
- **Live-backend verification (NOT done)**: whether real Resolution Rate/Successful Resolution Time values look sensible against genuine production data; whether the population cap ever triggers at real volume for these two ratios; and — most importantly — **whether Call Centre can actually confirm `stage`'s real semantics**, which is the one open question this session could not resolve at all without their input, live backend or not.

## Regression confirmation

`git status`/`git diff` confirm the touched-file set is exactly the 6 files listed above (2 new, 4 modified), all within `src/server/analytics/` and `src/lib/ratios/`. **Zero `.tsx` files touched.** Dashboard, Analytics, Reports, Call Logs, Live View, Campaigns, QA Review, AI Agents, Orchestrator, User Management, Settings, the sidebar, the R1 Ratio Catalogue/routing, and every R2 UI component are all confirmed unmodified. Vercel function count unchanged at 11.

## Recommended R4 scope

1. Get Call Centre's confirmation of `stage`'s real semantics — this single piece of information would unlock Completion Rate immediately using the architecture already built.
2. Consider whether a genuinely low-risk, small backend-native provider proof-of-concept is worth attempting for ONE ratio (e.g. a Supabase materialized view or function over already-ingested `customer_interactions` data, if that population is confirmed complete/authoritative) — R3 only documents the contract, doesn't build against it.
3. Extend real live-backend verification for all 5 implemented ratios (fcr, escalation_rate, aht, resolution_rate, successful_resolution_time) once the demo backend returns — this has now been deferred across 2 consecutive sessions and should be prioritized.
4. Only after the above: begin the AI-native telemetry track (`interaction_events`) that R2/R3 both correctly deferred.

Session stops here per the prompt's explicit instruction — R4 not begun.
