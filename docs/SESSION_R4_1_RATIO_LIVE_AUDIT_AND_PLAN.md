# Session R4.1 — Ratio Explorer Live Audit & Implementation Plan

**Read-only audit only, per the session's explicit instruction. No source file was changed. No implementation performed — this document is the plan to review before any code is written.**

Campaign Session 12.3 Phase E was confirmed untouched throughout (see final status block) — no Campaign code, state, cron config, targets, executions, or reconciliation was read-write touched; the two read-only confirmation queries at the end of this audit are the only interaction with Campaign data.

Implemented directly (no subagents), per the standing Session 12.1 instruction.

---

## 1. What R1–R5 established (recap, from their own reports)

- **R1** — Ratio Explorer shell: registry (21 ratios), routes, generic `/ratios`/`/ratios/:id` pages, `resource=ratios` dispatch on the existing `api/analytics/metrics.ts` (no new Vercel function). Only summary implemented, for FCR/Escalation Rate/AHT, sourced from the **global** `/api/v1/call-data`-adjacent metrics-style endpoint (a single current-window aggregate, not per-call). Trend/breakdown/drivers/interactions/comparison: not implemented.
- **R2** — Real per-call population engine. Introduced `callPopulationFetcher.ts` (loops `GET /api/v1/call-data`, `status=inactive`, `page_size=200`, `maxPages=15` → disclosed 3000-record cap), `ratioMath.ts` (pure FCR/Escalation/AHT calculators), `ratioDimensions.ts` (breakdown/trend bucketing). Trend, breakdown (`intent`/`agent`/`campaign`/`direction`/`outcome`), interaction drill-down, and previous-period comparison all genuinely implemented for these 3 ratios. Driver view (raw `escalation_trigger` grouping, no taxonomy) implemented for Escalation Rate only. **Never live-verified — backend was down the entire session.**
- **R3** — Extended the same engine to Resolution Rate and Successful Resolution Time (both `direct`, reusing R2's `handledCalls()`/`withValidDuration()` helpers). Completion Rate investigated and deliberately left `partial` — no live evidence existed for `stage`'s real value set. Introduced the `AggregationProvider` abstraction (`callPopulationProvider.ts` as today's adapter) so a future backend-native provider is a one-line swap. **Never live-verified — backend still down.**
- **R4** — Live verification attempted, backend still fully unreachable (TCP timeout, not DNS/auth). Zero code changes, zero live checks possible — explicitly deferred for the 3rd consecutive session.
- **R5** — AI-native telemetry foundation only. New `interaction_events` domain (types, repository, validation, migration) — **additive only, zero existing Ratio file touched.** Migration authored, **not applied**. No AI-native ratio implemented. Documented which future ratios need this table (Tool Success Rate, Authentication Success Rate — both "Yes, sufficient alone"; Fallback Rate, Conversation Recovery, Avoidable Escalation, Intent Accuracy, Knowledge Retrieval, ARR — all need something beyond the table itself, named explicitly).

**What remains unapplied/unconnected after R5**: the `interaction_events` migration (not applied), the telemetry ingestion path (no producer exists yet — Voice Agent doesn't emit this data today), and the entire AI-native ratio family (nothing wired to `AggregationProvider`).

## 2. Backend health this session

**Confirmed reachable and fully healthy** — this is the first Ratio session where that's true. Verified directly against the production proxy (`https://callcenter-three-livid.vercel.app/api/calls/data`, `x-user-role: call_center_head`): 686 total call-data records, 7 pages at `page_size=100`, all fetched successfully.

## 3. Critical finding — the live Ratio engine is currently completely broken in production, and it is NOT a backend problem

Tested the real, deployed ratio endpoint directly:
```
GET /api/analytics/metrics?resource=ratios&ratioId=fcr&view=summary&range=30d
→ HTTP 200, {"value":null,...,"unavailableReason":"Live call data temporarily unavailable — Call Centre did not respond."}
```

Every one of the 5 already-"implemented" ratios (FCR, Escalation Rate, AHT, Resolution Rate, Successful Resolution Time) currently fails identically — for every view (summary/trend/breakdown/interactions).

**Root cause, confirmed directly**: `callPopulationFetcher.ts`'s `DEFAULT_PAGE_SIZE = 200`. The real backend rejects this outright:
```
GET /api/v1/call-data?page_size=200 → 422 {"detail":[{"type":"less_than_equal","loc":["query","page_size"],"msg":"Input should be less than or equal to 100","ctx":{"le":100}}]}
```
`fetchCallDataPage()` throws on any non-2xx response; the exception propagates unguarded through `callPopulationProvider.ts`'s every method, is caught only by `withErrorBoundary`/`ratioService.ts`'s generic fallback, and surfaces as the generic "Live call data temporarily unavailable" message — **indistinguishable from a genuine backend outage in the UI**, which is exactly why this went undetected across R2, R3, and R4: the backend was actually down for all three of those sessions, so the symptom looked identical whether or not this bug existed. This session is the first time the backend has been reachable since the bug was introduced in R2, and it immediately reproduces on the very first real request.

**This is a pure request-parameter defect, not a data or design problem.** The fix does not depend on any product decision — `page_size` simply needs to be ≤100. To preserve the exact same disclosed 3000-record population cap (never silently shrunk): `DEFAULT_PAGE_SIZE: 200 → 100`, `DEFAULT_MAX_PAGES: 15 → 30` (100 × 30 = 3000, unchanged from R2/R3's documented and disclosed cap). This single 2-line change is expected to unblock all 5 already-implemented ratios immediately, with zero other code changes.

**Not fixed in this session** — per the explicit "do not implement anything until the audit is complete" instruction. This is the #1 item in the proposed implementation scope below.

## 4. Live field findings (facts only — no ratio invented from these without saying so)

All findings below are from the full 686-record population (`status=inactive`, `page_size=100` × 7 pages, zero duplicates — 686 unique `call_id`s confirmed).

| Field | Live finding | Implication |
|---|---|---|
| `stage` | **Exactly one value across all 686 records: `'completed'`** — including all 21 `outcome='dropped'` records. | `stage` carries **zero information** in the `status=inactive` population. R3's `partial` classification for Completion Rate is now confirmed correct by direct evidence, not just caution — `stage` cannot support it. This field may only vary while a call is `status='active'` (0 such calls exist right now to check). |
| `outcome` | **Three values, not two**: `resolved` (83), `escalated` (582), and **`dropped` (21)** — previously undocumented in any R1–R5 report. Every `dropped` record has `duration_seconds: 0` and `fcr: false`. | `dropped` looks like a genuine, real "call never actually connected/engaged" signal — a defensible candidate for Completion Rate's "connected vs. not" distinction, **via `outcome`, not `stage`**. Not implemented here — flagged as a new evidence-based candidate requiring one product confirmation (see §6). |
| `status` (query param) | `status=completed` and `status=inactive` return **identical results** (`total_records: 686` for both). | Resolves R3's open question #2 — they are the same filter, not two different states. |
| `status` (per-call field) | Always `'inactive'`, regardless of which query-param value was used. Never `'completed'`. | Matches the documented 2-value type (`'active'|'inactive'`) exactly — no contract inconsistency after all, just two aliases on the query side. |
| `escalation_trigger` | 33 distinct free-text values (e.g. "Customer confusion and desire to discuss unrelated process", "Customer hung up", "Missing documents") — clearly descriptive sentences, not a coded taxonomy. | Confirms, with real data, R2/R3's suspicion: Avoidable Escalation Rate remains genuinely unsupported — there is no avoidable/unavoidable split to derive. The existing Driver view (raw grouping, already implemented) is the correct and sufficient treatment of this field — nothing more should be built on it. |
| `was_authenticated` | **`null` for all 686 records, no exceptions.** | Authentication Success Rate has zero real signal today — stays `partial`/unsupported, now confirmed rather than merely untyped-for-a-state. |
| `ai_agent_id` | Real values include the 3 documented agents (`emi-reminder-agent`, `inbound-banking-default`, `forex-transaction-agent`) plus many others never seen in any roster doc (`agent_002`, `Testagent_002`, `multiagent`, and a literal typo `emi-reminder-egent`). | Data-quality note for the existing "breakdown by agent" dimension — it already groups by raw string value (correct, no assumption of a clean roster), so no code change is needed, but breakdown-by-agent rows for a live campaign will show this messiness verbatim. Worth a UI label note in a future session, not a blocker. |
| `direction`, `date_from`/`date_to` | Confirmed genuine server-side push-down — `direction=outbound` returns `total_records: 202` (not 686, filtered correctly); `date_from=date_to=2026-09-29` returns `total_records: 4`. | R2's assumption was correct; no change needed. |
| Timestamps (`start_time`/`timestamp`) | Always carry an explicit `+05:30` offset, consistently, across all 686 records. Identical between `start_time` and `timestamp`. | Resolves R3's timezone open question — no ambiguity; any day-bucketing in `ratioDimensions.ts` should respect this explicit offset (worth a targeted check, not re-derived here, in the implementation phase). |
| `fcr` | Real booleans only (`true`/`false`). `fcr=true` count (83) exactly matches `outcome='resolved'` count (83), and every `fcr=true` record has `outcome='resolved'` — a 1:1 overlap in this dataset. | FCR's direct calculation is sound and matches the backend's own reported `fcr_rate: 12.1%` exactly. The 1:1 overlap with `resolved` looks like a property of this specific (demo) dataset, not a rule to encode — noted, not acted on. |
| Backend's own `summary.escalated_count`/`escalation_rate` | **Internally inconsistent with the backend's own per-call data**: summary reports `escalated_count: 398` (`escalation_rate: 58%`), but the actual count of `outcome='escalated'` rows across the same 686 records is **582** (84.8%). `fcr_rate` (12.1%) and `avg_aht_seconds` (56, vs. a directly computed 54.4 including zero-duration drops) both check out consistently against the same per-record data — only the escalation summary figure is wrong. | **This validates, with direct evidence, R2's original architectural decision** to compute every ratio from the raw per-call population rather than trust the backend's own pre-aggregated summary — had FCR/AHT/Escalation Rate summary values been trusted directly (as R1 briefly did before R2's rewrite), Escalation Rate specifically would have been silently wrong by 27 percentage points. Worth stating plainly in any future documentation of why this architecture exists. Not something to "fix" — it's the real backend's own internal inconsistency, out of this repository's control. |

## 5. R4.1 candidate-ratio table

| Ratio | Numerator | Denominator | Backend fields | Filters/window | Status | Cap/history | UI status to show |
|---|---|---|---|---|---|---|---|
| **FCR** | `fcr === true` count | every fetched call | `fcr` | `date_from`/`date_to`, `direction` (native); `intent`/`agent`/`campaign` (in-function) | **Direct — ready today**, blocked only by the page_size bug | 686 records, well under the 3000 cap even unfixed-maxPages | Live value once §3's fix ships |
| **Escalation Rate** | `outcome === 'escalated'` count | `handledCalls()` (`outcome` determinate) | `outcome` | same as FCR | **Direct — ready today**, same blocker | same | Live value once fixed |
| **AHT** | sum of valid `duration_seconds` | count of valid-duration calls | `duration_seconds` (+ `isStaleDuration()` 4h guard — 0 stale rows observed in 686 live records, guard currently unexercised but correct) | same | **Direct — ready today**, same blocker | same | Live value once fixed |
| **Resolution Rate** | `outcome === 'resolved'` count | `handledCalls()` | `outcome` | same, minus `outcome` breakdown (tautological, correctly excluded) | **Direct — ready today**, same blocker | same | Live value once fixed |
| **Successful Resolution Time** | sum of valid durations, resolved only | count of same | `outcome`, `duration_seconds` | same | **Direct — ready today**, same blocker | same | Live value once fixed |
| **Completion Rate** | *(candidate, not committed)*: non-`dropped` count | *(candidate)*: every fetched call | `outcome` (via the newly-observed `dropped` value) — **not** `stage` (confirmed uninformative) | same | **Partial → potential Derived**, pending one product confirmation: does `outcome='dropped'` genuinely mean "never connected/completed," and should that be the ratio's definition? | Same population, no new fetch needed | Stays `partial` until confirmed; do not silently promote |

No other ratio in the 21-ratio registry has new live evidence this session — the remaining 15 (`backend_gap`) are unchanged from R1's classification; nothing in this session's live data contradicts or resolves any of them.

## 6. The Completion Rate candidate — deliberately not implemented, flagged for your decision

`outcome='dropped'` is real, observed, and consistent (0 duration, `fcr=false`, always — 21/21). It is a strong candidate for "not completed," with `resolved`/`escalated` as "completed." But per this project's locked principle (**facts first — do not manufacture a metric merely because the UI wants it**), this session does not implement it, because:
1. `dropped` was never documented anywhere as a defined business state — its exact meaning (abandoned by caller? gateway failure? something else?) is inferred from its data shape, not confirmed.
2. Promoting Completion Rate on an inferred interpretation, even a well-evidenced one, is exactly the kind of "derive because the field exists" the Ratio Explorer principle exists to prevent.

**Recommendation**: ask whoever operates the Voice Agent/Call Centre backend to confirm what `outcome='dropped'` actually represents. If confirmed as "call never connected/engaged," Completion Rate can be promoted to `derived` using the exact formula in §5 with no further architecture work — the population, fetch, and calculator pattern are already fully built and would be a small, mechanical addition alongside the page_size fix.

## 7. Separate architectural note (not a Ratio defect, flagged for awareness only)

`callPopulationFetcher.ts` calls the real backend directly (`VOICEBOT_BASE_URL`/`VOICEBOT_API_KEY` from `process.env`), bypassing `api/calls/data.ts`'s Session 6.2 category/role authorization filter entirely. This means every Ratio Explorer number is computed over **every** agent/category, regardless of the viewer's authorized set — unlike Call Logs, which is correctly scoped. This is a pre-existing condition since R2, not introduced this session, and is out of scope for this audit's fix list (no session prompt has asked for it, and category-scoping ratios would be a real design decision, not a bug fix) — recorded here so it isn't silently rediscovered later as if new.

## 8. R5 migration — not required for anything in this plan

The `20261008000000_interaction_events_foundation.sql` migration remains unnecessary for every item in §5/§6. Nothing in this plan touches AI-native telemetry. **Not applied, not recommended to apply yet** — unchanged from R5's own conclusion.

## 9. Proposed R4.1 implementation scope (for review — nothing below has been built)

**A. Live-now (one fix, zero product decisions needed):**
1. `callPopulationFetcher.ts`: `DEFAULT_PAGE_SIZE 200 → 100`, `DEFAULT_MAX_PAGES 15 → 30` (preserves the exact same disclosed 3000-record cap). This alone should restore FCR, Escalation Rate, AHT, Resolution Rate, and Successful Resolution Time to genuinely live, working state — summary, trend, breakdown, interactions, comparison, and (for Escalation Rate) the Driver view, all of which were already fully built in R2/R3 and never actually broken in *design*, only in this one request parameter.
2. Full live verification pass once fixed: confirm real summary/trend/breakdown/interactions/comparison render correctly for all 5, using the same read-only technique as this audit (no code change required to verify, only to fix).

**B. Partial, pending one external confirmation (not blocked on code):**
3. Completion Rate via `outcome='dropped'` (§6) — small, mechanical addition to `ratioMath.ts`/`ratioRegistry.ts` once (and only if) the `dropped` semantics are confirmed. Do not implement speculatively.

**C. Telemetry-dependent (out of scope for R4.1, needs R6):**
- Tool Success Rate, Authentication Success Rate, Fallback Rate, Conversation Recovery Rate, Avoidable Escalation Rate, Intent Accuracy, Knowledge Retrieval Success, Autonomous Resolution Rate — all per R5's §16 mapping, none actionable until `interaction_events` has a real producer (R5's migration, still correctly unapplied).

**D. Still unsupported by any available evidence (no path forward without new backend/product work):**
- Contact Rate, Repeat Contact Rate, QA Pass Rate, Compliance Pass Rate, CSAT, NPS, Business Outcome Success, Conversion Rate, Cost per Resolution — unchanged `backend_gap` from R1, nothing this session found changes this.

Recommended order: **A first** (the single highest-leverage fix in this entire audit — it's the difference between "Ratio Explorer has never worked against real data" and "Ratio Explorer has worked since R2, verifiably, today"), then decide on **B** only after getting the `dropped` confirmation, independent of A.

---

## R4.1 AUDIT: COMPLETE
## LIVE-NOW RATIOS: FCR, Escalation Rate, AHT, Resolution Rate, Successful Resolution Time (5 — blocked only by the page_size defect in §3/§9-A)
## PARTIAL RATIOS: Completion Rate (candidate via `outcome='dropped'`, pending one external confirmation — §6/§9-B)
## TELEMETRY-DEPENDENT RATIOS: Tool Success Rate, Authentication Success Rate, Fallback Rate, Conversation Recovery Rate, Avoidable Escalation Rate, Intent Accuracy, Knowledge Retrieval Success, Autonomous Resolution Rate (8 — need R5's `interaction_events` + a real producer, R6 scope)
## UNSUPPORTED RATIOS: Contact Rate, Repeat Contact Rate, QA Pass Rate, Compliance Pass Rate, CSAT, NPS, Business Outcome Success, Conversion Rate, Cost per Resolution (8 — no backend evidence exists, unchanged since R1)
## PROPOSED IMPLEMENTATION SCOPE: §9 — (A) fix `callPopulationFetcher.ts`'s page_size/maxPages (2-line change, unblocks 5 ratios immediately, zero product decisions), (B) Completion Rate via `outcome='dropped'` pending one external confirmation, (C)/(D) deferred, unchanged
## CAMPAIGN PHASE E UNTOUCHED: YES — confirmed via two read-only queries at the end of this audit: campaign `b0de9fae-...` still `running`, target `7c319e38-...` still `pending`/`attempt_count: 0`. No Campaign code, config, or state was written to.

Stopping here per the session's explicit instruction — no implementation performed. Awaiting your review before starting §9-A.
