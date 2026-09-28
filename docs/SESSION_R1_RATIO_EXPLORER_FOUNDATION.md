# Session R1 — Ratio Explorer Foundation

Architecture, registry, routes, and a non-disruptive UI shell for the new Ratio Explorer, per `docs/CALL_CENTRE_RATIO_EXPLORER_UX_AND_RATIO_REGISTRY_v1.1.docx`. Implemented directly in this session (no subagents), per the user's explicit direct-execution instruction. Committed locally as `3880ec9`. Not deployed.

## A. Files created

- `src/types/ratio.ts` — shared wire-shape types (availability, family, summary/trend/breakdown/driver/interaction DTOs, filter state).
- `src/server/analytics/ratioRegistry.ts` — backend registry: numerator/denominator/eligibility/availability for all 21 ratios, reconciled against the actual repository.
- `src/server/analytics/ratioService.ts` — the one place that turns raw facts into a ratio response; genuinely computes summary for FCR/Escalation Rate/AHT, honest unavailable for everything else.
- `src/lib/ratios/ratioFrontendRegistry.ts` — presentation metadata (label, family, formula text, unit, chart preference, help text) for all 21 ratios.
- `src/lib/ratios/ratioFilterState.ts` — URL-serializable filter/drill state via `useSearchParams`.
- `src/services/analytics/ratiosService.ts`, `src/services/analytics/ratiosKeys.ts` — frontend service + query-key factory.
- `src/hooks/analytics/useRatio.ts` — `useRatioSummary`/`useRatioTrend`/`useRatioBreakdown`/`useRatioDrivers`/`useRatioInteractions`.
- `src/components/ratios/*` — `RatioCatalogue`, `RatioHero`, `RatioTrend`, `BreakdownSelector`, `BreakdownTable`, `DriverPanel`, `InteractionTable`, `InteractionInspector`, `FilterContextBar`, `CompareControl`, `RatioAvailabilityBadge`, `RatioUnavailableState`.
- `src/pages/Ratios.tsx`, `src/pages/RatioExplorer.tsx` — the two routed pages.

## B. Files modified

- `api/analytics/metrics.ts` — added a `resource=ratios` dispatch branch (summary/trend/breakdown/drivers/interactions). Default (no `resource`) behavior is byte-for-byte unchanged — verified by reading the diff, the original proxy code path is untouched, only wrapped in an `if` that the existing callers never hit.
- `src/App.tsx` — two new routes.
- `src/components/layout/pillarNav.ts` — one new `NavItem` ("Ratios") added to the existing `measure` pillar's `items` array. Nothing else in that file changed.

No other existing file was touched. `git status`/`git diff` reviewed explicitly to confirm this (see §M).

## C. Routes added

- `/ratios` — catalogue.
- `/ratios/:ratioId` — one generic explorer for all 21 ratios (never 21 separate pages).

## D. Components added

Listed in §A — all 10 components named in the spec's §12 list plus two small shared helpers (`RatioAvailabilityBadge`, `RatioUnavailableState`) not in the spec's list but needed to avoid duplicating the availability-badge/empty-state markup across every other component.

## E. Ratio Registry structure

Two-registry model, kept genuinely separate:
- **Backend** (`src/server/analytics/ratioRegistry.ts`) — numerator/denominator description, eligibility note, supported dimensions, driver dimension, evidence capability, availability, unavailable reason. Never imported by a React component (verified: `grep` for any client-side import of this file returns zero hits — only comment references).
- **Frontend** (`src/lib/ratios/ratioFrontendRegistry.ts`) — name, short label, family, description, formula text, unit, preferred visualization, good-direction, help text, plus a `declaredAvailability` snapshot used only by the catalogue badge (so `/ratios` doesn't have to fetch all 21 live summaries just to render a list — the single-ratio Explorer always defers to the live API response instead).

## F. API/service contract created

`GET /api/analytics/metrics?resource=ratios&ratioId=<id>&view=summary|trend|breakdown|drivers|interactions[&range=&direction=&campaign=&agent=&intent=&breakdown=&breakdownValue=&driver=&by=]` — one generic family, not 21 endpoints. Reused the existing `api/analytics/metrics.ts` file rather than adding `api/analytics/ratios.ts`, keeping the Vercel function count at its current 11 (verified: `find api -name "*.ts" | grep -v "/_"` still returns exactly 11 files).

## G. Availability classification (reconciled against the actual repository, not copied blindly from the spec)

| Ratio | Availability | Note |
|---|---|---|
| FCR | **direct** | `fcr_rate`/`fcr` confirmed real on the global metrics endpoint and per-call. |
| Escalation Rate | **direct** | `escalation_rate` confirmed real. |
| AHT | **direct** | `avg_aht_seconds` confirmed real. |
| Resolution Rate | **direct** | `outcome` field (resolved/escalated) confirmed real. |
| Completion Rate | derived | `stage` field exists; needs a connected-vs-completed split. |
| Successful Resolution Time | derived | Computable by filtering duration to outcome=resolved; not pre-aggregated. |
| Authentication Success Rate | **partial** | `was_authenticated` is a real flag; no distinct "attempted" signal exists. |
| Avoidable Escalation Rate | **partial** | `escalation_trigger` is real; no avoidable/unavoidable taxonomy exists. |
| Contact Rate, Repeat Contact Rate, Autonomous Resolution Rate, Intent Accuracy, Tool Success Rate, Fallback Rate, QA Pass Rate, Compliance Pass Rate, CSAT, NPS, Business Outcome Success, Conversion Rate, Cost per Resolution | **backend_gap** | No supporting telemetry exists in this repository today (see §I). |

**Intent Accuracy specifically** — per the prompt's explicit §8 rule — was deliberately classified `backend_gap`, not `direct`, because the only existing field (`intent_accuracy` on call-data) is the model's own classifier confidence score, not a measured accuracy against human-verified ground truth. The registry's `eligibilityNote` states this explicitly so a future session can't accidentally present confidence as accuracy.

## H. Ratios actually implemented in R1 (exact calculation)

Only the **summary** view (Ratio Hero's value/numerator/denominator/population), for exactly 3 ratios, all sourced from `GET {VOICEBOT_BASE_URL}/api/v1/analytics/metrics?window=<range>` (the same global endpoint `Analytics.tsx` already uses):

- **FCR** — `value = metrics.fcr_rate`, `denominator = metrics.total_calls`, `numerator` derived from `fcr_rate × total_calls`.
- **Escalation Rate** — `value = metrics.escalation_rate`, `numerator = metrics.escalated_count`, `denominator = metrics.total_calls`.
- **AHT** — `value = metrics.avg_aht_seconds` (unit: seconds), `numerator = avg_aht_seconds × total_calls`, `denominator = metrics.total_calls`.

Trend, breakdown, drivers, and interactions are **not implemented** for any ratio, including these three — they return an honest "not yet instrumented" response (the global metrics endpoint has no time-bucketed series, no per-dimension GROUP BY, and no interaction-drill capability). Comparison (previous-period delta) is also not implemented — `comparison: null` everywhere in R1, to avoid fabricating a delta from a single-call aggregate.

## I. Backend/data gaps discovered

- No `interaction_events` table (or equivalent) exists — blocks Tool Success Rate, Fallback Rate, and any AI-native turn-level ratio.
- No persisted QA score/pass-fail record exists — blocks QA Pass Rate, Compliance Pass Rate.
- No CSAT/NPS survey response capture exists.
- No domain-neutral business-outcome model exists at the interaction level (campaign result rules are campaign-specific, not general).
- No cost telemetry exists anywhere.
- `was_authenticated` exists but has no distinct "attempted" counterpart.
- `escalation_trigger` exists but has no normalized avoidable/unavoidable taxonomy.
- The global `/api/v1/analytics/metrics` endpoint has no per-dimension breakdown, no time-series with population, and no agent/campaign/intent filter — every dimension-aware ratio view is blocked on this specifically, independent of whether the underlying ratio itself is otherwise DIRECT.

## J. Existing code reused

`useCallData` + `InteractionDetailDialog` (Call Logs) for the Interaction Inspector — no second transcript/recording viewer was built, matching spec §20 exactly and the same reuse point `CampaignDetail.tsx` already established. `Layout`, `Badge` (S1 variants), existing Tailwind/shadcn primitives — no new design system, no new charting library beyond the already-installed `recharts` (not yet wired to real data, since Trend has no real series to render in R1).

## K. Existing UI modifications

Exactly one: `src/components/layout/pillarNav.ts` gained one `NavItem` ("Ratios", `/ratios`) inside the existing `measure` pillar's `items` array. Ordering, icon convention, collapse behavior, responsive behavior, active-route matching, styling, and all seven pillar groups are otherwise untouched — confirmed by reading the full diff of this file (a 3-line addition only).

## L. Validation results

- `npx tsc --noEmit` — clean.
- `npm run build` — clean production build.
- `npm run lint` — 117 errors / 36 warnings, exact match to the documented baseline; zero findings in any new ratio-related file (confirmed via targeted grep of the lint output).
- No test runner exists in this repository (consistent with every other session this conversation).
- Manual checks (Playwright + Edge, local `vite`/`vite preview` — the demo backend was down during this session so live-data verification against the real Call Centre API was not possible; verified structurally instead):
  1. Existing application still loads — ✅.
  2. Existing sidebar groups intact — ✅ (opened the nav overlay, confirmed all pillar content renders; "Ratios" appears alongside "Analytics").
  3. Existing routes still work — ✅ (`/dashboard`, `/analytics`, `/reports`, `/call-logs` all load).
  4. Measure contains Ratios — ✅ (confirmed in the opened nav overlay).
  5. `/ratios` loads — ✅ (all four family sections render, availability badges present).
  6. A valid ratio ID opens the generic explorer — ✅ (`/ratios/fcr` renders the Hero with name/formula/definition).
  7. An invalid ratio ID is handled cleanly — ✅ (`/ratios/not-a-real-ratio` shows "is not a known ratio", no crash).
  8. BACKEND_GAP ratios do not display fabricated data — ✅ (confirmed structurally: `getRatioSummary` returns `value: null` for every non-implemented ratio; verified no code path can set a non-null value without a real fetched aggregate).
  9. Browser refresh on a Ratio route works — ✅ (`/ratios/fcr` hard-reload still renders).
  10–13. Existing Dashboard/Analytics/Reports/Call Logs unchanged — ✅ (zero diff on those files/pages; each still loads).
  14. Responsive navigation still works — ✅ (`/ratios` checked at 390px width, no horizontal overflow).

**Real defects found and fixed during this verification** (not present in the initial implementation's design, only surfaced by testing under the well-documented local-dev-without-API limitation): `RatioAvailabilityBadge`, `RatioHero`, `RatioTrend`, `BreakdownTable`, `DriverPanel`, and `InteractionTable` all crashed when a malformed (non-JSON) response reached them, because `httpClient.ts`'s `parseBody` silently returns raw text on a JSON-parse failure rather than throwing — a pre-existing, shared transport-layer behavior not touched in this session, but one my new components weren't defensive against. Fixed with narrow guards in each of my own new files (never assume a successful HTTP response is well-typed) rather than modifying the shared transport layer. Also found and fixed a spec-alignment gap: the ratio's formula/definition were only shown when a value was available, contradicting §5's "every ratio has definition, formula... [as a] non-negotiable" — now shown unconditionally, with numerator/denominator/population/freshness still gated on a real value existing.

## M. Regression check

Explicitly confirmed via `git status`/`git diff` that Dashboard, Analytics, Reports, Call Logs, Live View, Campaigns, QA Review, AI Agents, Orchestrator, User Management, Settings, and the existing sidebar/routing structure were **not modified** — the only touched existing files are the three listed in §B, and their diffs are exactly the additive changes described (one dispatch branch, two new routes, one new nav item).

## N. Recommended R2 scope

1. Wire a real time-bucketed trend for at least FCR/Escalation Rate/AHT (requires a new backend aggregation shape — the global metrics endpoint returns one current-window value, not a series).
2. Implement one real breakdown dimension (e.g. FCR by intent) using existing per-call `intent`/`fcr` fields via a new SQL aggregation, not the global endpoint.
3. Reconsider `resolution_rate`/`completion_rate`/`successful_resolution_time` as the next DIRECT/DERIVED ratios to connect, since their source fields are already confirmed real.
4. Decide whether to invest in `interaction_events` telemetry (unlocks Tool Success Rate, Fallback Rate, and most AI-native ratios at once) before picking off individual BACKEND_GAP ratios piecemeal.
5. Add a genuine previous-period comparison (a second, shifted-window fetch) once trend/breakdown exist, rather than leaving `comparison: null` everywhere.

Session stops here per the prompt's explicit instruction — R2 not begun.
