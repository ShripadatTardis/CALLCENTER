# CMA Calculation Coverage — Complete 60-Measure Matrix

**As of Session 10.** Originally compiled Session CMA-3B; Session 8 moved CUST360-01/02/03 from
"blocked" to "operational" now that Customer Category Scope is integrated into the CMA evaluation
pipeline (the 'customer' source family). Session 8.1 deployed that work. Session 9 independently
verified FCR-03/ESC-03/AHT-03 as candidate calculations. **Session 10 gives every one of the 60
canonical measures below a CMA ownership mode and a real, working delivery path** — this is a
dimension layered alongside (never replacing) the operational/blocked/pending/mock/unavailable
buckets this document already tracked: `CMA_NATIVE` (25 — the 22 operational measures below plus
the 3 mock indicators, both natively handled by `evaluateCmaMeasure()`), `CMA_PROVISIONAL` (3 —
FCR-03/ESC-03/AHT-03, independently tested, business approval still pending — **not** counted as
operational), `CMA_LEGACY_ADAPTER` (2 — `CANON-AVG-INTENT-ACC`, `CANON-CALL-TECH-PERF`),
`CMA_NON_AGGREGATE` (5 — Sentiment distribution, Corrective Action lookup, the 3 QA Calibration
comparisons), `CMA_UNAVAILABLE` (25 — the unimplemented measures below). See
`src/server/cma/cmaOwnershipRegistry.ts` for the authoritative, auditable classification and
`docs/SESSION_10_CMA_COMPLETE_OWNERSHIP.md` for the full account. **The "22 operational" count
below is unchanged in meaning and still refers only to `CMA_NATIVE`, accuracy-verified,
business-approved calculations — ownership (60) and operational-native status (22) are two
different, independently tracked facts, never combined into one number.** Source: the live,
applied CMA-2 registry (`dtbaczafdzgctkbqviod`, 60 canonical measures) cross-referenced against the
actual `CMA_ALGORITHM_REGISTRY` in `src/server/cma/cmaEvaluationAlgorithms.ts`. Every one of the 60
rows below is accounted for; none is silently omitted.

## Summary

| Bucket | Count |
|---|---|
| **Operational** (implemented, live-calculable through the evaluation engine) | **22** |
| **Blocked — decided but not implemented** (real reasons, not fabricated) | 6 |
| **Pending business definition** (governance decision required before any implementation) | 4 |
| **Mock** (explicitly fabricated, never evaluated as real) | 3 |
| **Unavailable — missing data/implementation** (25 `unimplemented` canonical measures, individually classified) | 25 |
| **Total** | **60** |

22 + 6 + 4 + 3 + 25 = 60.

---

## 1. Operational (22) — calculable today through `evaluateCmaMeasure()`

| Canonical ID | Occurrence | Source family | Unit | Dimensions |
|---|---|---|---|---|
| `CANON-RES-RATE` | RES-01 | interaction | percent | agent, channel, campaign |
| `CANON-AUTH-SUCCESS-RATE` | AUTH-01 | interaction | percent | agent, channel, campaign |
| `CANON-SUCCESSFUL-RES-TIME` | SRT-01 | interaction | seconds | agent, channel, campaign |
| `CANON-AVG-SENT-SCORE` | AGENT-SENT-01 | interaction | score | agent, channel, campaign |
| `CANON-INTENT-CONFIDENCE` | INTCONF-01 | interaction | score | agent, channel, campaign |
| `CANON-CONTEXT-CONTINUITY-RATE` | QA-CC-01 | qa | percent | agent, channel |
| `CANON-FOLLOWUP-UNDERSTANDING-RATE` | QA-FU-01 | qa | percent | agent, channel |
| `CANON-TASK-PROGRESSION-RATE` | QA-TP-01 | qa | percent | agent, channel |
| `CANON-REFERENCE-RES-ACC` | QA-RR-01 | qa | percent | agent, channel |
| `CANON-RESPONSE-GROUNDING-RATE` | QA-RG-01 | qa | percent | agent, channel |
| `CANON-CONVERSATION-RECOVERY-RATE` | QA-CR-01 | qa | percent | agent, channel |
| `CANON-UNNECESSARY-CLARIFICATION-RATE` | QA-UC-01 | qa | percent | agent, channel |
| `CANON-REPETITION-LOOP-RATE` | QA-RLR-01 | qa (review-level rollup) | percent | agent, channel |
| `CANON-CUSTOMER-CORRECTION-RATE` | QA-CCR-01 | qa (review-level rollup) | percent | agent, channel |
| `CANON-CAMPAIGN-TARGET-COUNT` | CAMP-01 | campaign | count | agent, campaign |
| `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI` | CAMP-02 | campaign | percent | agent, campaign |
| `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS` | CAMP-03 | campaign | percent | agent, campaign |
| `CANON-CHAT-SESSION-SPAN` | CHAT-SPAN-01 | chat | seconds | agent |
| `CANON-ACTION-REQUIRED-QUEUE-ITEMS` | ACTION-01 | action | count | agent |
| `CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA` | CUST360-01 | customer | count | *(none registered — see below)* |
| `CANON-CUSTOMER-360-ESC-COUNT` | CUST360-02 | customer | count | *(none registered)* |
| `CANON-CUSTOMER-360-AUTH-SUMMARY` | CUST360-03 | customer | percent | *(none registered)* |

4 of these (`CANON-RES-RATE`, `CANON-AUTH-SUCCESS-RATE`, `CANON-SUCCESSFUL-RES-TIME`,
`CANON-AVG-SENT-SCORE`) are Session CMA-3A's production-verified set, unchanged. 15 more were
added in CMA-3B. The 3 `CUST360-*` rows are new this session (Session 8) — the first measures
backed by the new 'customer' source family, scoped exclusively by Customer Category Scope
(never Agent Scope — see Part D account below), and deliberately not windowed (their approved
definition is "lifetime, not windowed," so this family's RPC takes no time-window parameters at
all, unlike every other family).

**Session 8 account — Customer Category Scope integration.** `src/server/cma/cmaEvaluation.ts`'s
`evaluateCmaMeasure()` now takes an optional 4th argument, `categoryAccess: EvaluationScopeAccess`
— structurally identical to the existing Agent Scope `access` argument, but resolved from
`api/_auth.ts`'s existing `toCustomerAccess(user)` (unchanged — the same category→agent_id
resolution Customer 360's own routes already use, computed once at identity-resolution time by
`call_center_users_resolve_identity`, nothing new added there). The new RPC,
`call_center_cma_evaluate_customer_measure` (migrations `20261020031303_cma_customer_category_scope.sql`
and `20261020031525_cma_customer_category_scope_grant_fix.sql`, validated against known expected
values in disposable PostgreSQL — see the Session 8/8.1 reports for the exact scenarios and
numbers — **applied to production in Session 8.1**, including a corrective grant-fix migration
after the initial apply left `EXECUTE` grants on `anon`/`authenticated` that this project's
default privileges attach automatically to any new function — the fix revokes from
`public, anon, authenticated` explicitly, matching the convention already used in every other CMA
evaluate RPC), aggregates `call_center.customers`' pre-aggregated columns
(`total_interactions`, `escalation_count`, `auth_summary->>'everAuthenticated'`) across every
customer whose `latest_agent_id` falls in the caller's authorized category-derived agent-id set,
or every customer when unrestricted. It takes no `p_all_agents`/`p_authorized_agent_ids`
parameter at all — Agent Scope and Customer Category Scope are structurally independent for this
family, so neither can broaden the other; a `customer`-family evaluation with no resolved
`categoryAccess` fails closed (`{ kind: 'unsupported' }`) rather than defaulting to unrestricted.
No filter/groupBy dimension is registered for these 3 occurrences — requesting one is rejected as
`unsupported_dimension`, not silently ignored. The existing, independently-correct per-customer
Customer Detail calculation (`src/server/customer360/aggregateMath.ts`, FORMULA VERIFIED) is
**unchanged** — CMA owns a new, different capability (the scoped population-level aggregate
across every authorized customer), not a recomputation of the per-customer numbers.

**UI integration — not performed this session, documented, not fabricated.** No existing screen
displays a population-level "total interactions / escalations / ever-authenticated %" across the
Customer 360 population today (confirmed by inspection of `Customers.tsx`, `Dashboard.tsx`,
`Analytics.tsx` — no such widget exists to replace), and the brief's own Part F instruction is
explicit: do not invent a new dashboard widget merely to display a newly-calculated measure. All
3 measures are operational and independently tested but have no screen consumer yet.

## 2. Blocked — decided but not implemented (6)

Each has a real, documented reason — none is a placeholder.

| Canonical ID | Occurrence | Reason blocked |
|---|---|---|
| `CANON-AVG-INTENT-ACC` | INTAVG-01 | Register's own `numerator`/`denominator`/`eligible_population` are `"unknown"` — an upstream-opaque passthrough with no documented formula to reimplement. Not computable from any Supabase-persisted fact. |
| `CANON-SENT` | SENT-01 | A categorical sentiment *label*, not a scalar — this engine's `value`/ratio contract has no "distribution" result shape. `CANON-AVG-SENT-SCORE` already covers the numeric `sentiment_score` aggregate; a label-distribution measure would need a new response shape, not a missing fact. |
| `CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY` | CA-01 | Direct fields on one `corrective_actions` row (status/priority/category), not a population aggregate — there is no ratio or average to compute; it is a record lookup, outside this engine's scope by design. |
| `CANON-QA-CALIBRATION-PERPARAMETER-CLASSIFICATI` | CALIB-01 | Classifies each (interaction, parameter) pair into one of 5 categories by comparing Human QA vs Automated QA side-by-side for the SAME interaction — a genuinely different aggregation shape (a paired comparison, not a sum/count over one population) than every other measure this session implements. Real engineering scope, and has no UI consumer today either way. |
| `CANON-QA-CALIBRATION-COVERAGE-DIVERGENCE` | CALIB-02 | Same shape problem as CALIB-01 (a cross-side comparison, not a population ratio). |
| `CANON-QA-CALIBRATION-PROMPT-VERSION-DISAGREEME` | CALIB-03 | Same shape problem as CALIB-01. |

(6 rows: INTAVG-01, SENT-01, CA-01, CALIB-01/02/03. CUST360-01/02/03 moved to §1 — Operational —
this session; see the Session 8 account there.)

## 3. Pending business definition (4) — untouched, per brief §4/§10

`CANON-FIRST-CONTACT-RES`, `CANON-ESC-RATE`, `CANON-AVG-HANDLE-TIME`, `CANON-CALL-TECH-PERF`.
Confirmed still `pending_decision` in production — unchanged by Session 10, which
delivers the first 3 of these through CMA as `CMA_PROVISIONAL` (a real, independently
tested calculation, routed around `evaluateCmaMeasure()`'s own governance gate by the
new ownership layer — see `docs/SESSION_10_CMA_COMPLETE_OWNERSHIP.md`) without
rewriting the governance status itself. `CANON-CALL-TECH-PERF` is delivered as
`CMA_LEGACY_ADAPTER` instead (wraps the existing real per-agent correlation in
`agentPerformanceAggregator.ts`). See `docs/CMA_BUSINESS_DEFINITION_DECISIONS.md` for
the full analysis and recommendation.

## 4. Mock (3) — never evaluated as real

`CANON-NPS-CAMPAIGNS`, `CANON-ORCHESTRATOR-FLOW-METRICS`, `CANON-WHATSAPP-CONNECTION-STATUS`.
Unchanged — the evaluation engine returns `{ kind: 'mock' }` for all three, never a fabricated value.

## 5. Unavailable (25) — the `unimplemented` canonical measures, individually classified

Grouped by root cause, per brief §5's instruction to "distinguish missing data from missing
implementation."

### 5.1 Missing data — no capture mechanism exists anywhere in this system (4)

| Canonical ID | Why |
|---|---|
| `CANON-CSAT` | No customer-satisfaction survey response capture exists in any integrated system (voice, chat, or Supabase). |
| `CANON-NPS` | Same — no NPS survey response persistence exists (the NPS Campaigns screen only manages campaign *delivery*, confirmed fabricated/mock for *responses*). |
| `CANON-COST-PER-RES` | No cost/billing fact exists anywhere in this system's integrations. |
| `CANON-REPEAT-CONTACT-RATE` | Needs a cross-interaction, same-customer-same-issue linkage over time — the clearest architectural counterexample found in the earlier H0/H1 assessment. Neither the upstream Voice/Chat APIs nor any internal table expresses "this is a repeat of that prior contact." |

**API change requests** (§6 below): CSAT/NPS survey capture, cost/billing exposure.

### 5.2 Missing data — a specific signal the source system doesn't distinguish (2)

| Canonical ID | Why |
|---|---|
| `CANON-CONTACT-RATE` | Needs a "connected to customer" signal distinct from "triggered" — campaign_results/campaign_targets record the triggered attempt and its final outcome, never an intermediate "customer picked up" event. |
| `CANON-COMPLETION-RATE` | The only candidate field (`CallDataEntryDto.stage`) traces only to Lovable-era mock data per the register's own prior finding — no confirmed real field exists for "answered-connected" vs. "confirmed completed." |

**API change request** (§6 below): a call-connected/answered event distinct from the final result code.

### 5.3 Missing implementation — real upstream facts exist (Interaction Trace API) but are not
ingested into Supabase by any CMA sync job (6)

| Canonical ID | Why |
|---|---|
| `CANON-TOOL-SUCCESS-RATE` | Needs `tool_calls` evidence per turn — present in the Interaction Trace API schema (per the earlier H0/H1 assessment), never synced into any Supabase table CMA can query. |
| `CANON-FALLBACK-RATE` | Needs `final_plan.action`/fallback-classification evidence per turn — same gap. |
| `CANON-AVOIDABLE-ESC-RATE` | Needs `escalation_event` with an attributable cause — the register's own finding that `escalation_event` is documented always-null in the data captured today. |
| `CANON-AUTONOMOUS-RES-RATE` | Needs a per-call "AI-only vs. human-assisted" classification — no such field is synced anywhere. |
| `CANON-INTENT-ACC` | Needs ground-truth intent labels to compare against — no ground-truth capture mechanism exists (only the model's own confidence, already covered by `CANON-INTENT-CONFIDENCE`). |
| `CANON-INTENT-ROUTING-ACC` | Needs `router_decision` evidence per turn — same Trace-API-not-ingested gap. |

**Not an external API change request** — per the earlier H0/H1 assessment, this data's *shape*
already exists in the Interaction Trace API; the gap is this codebase's own missing ingestion
pipeline (no CMA sync job reads the Trace API into a Supabase base-fact table today). Flagged as a
real, scoped CMA-4+ engineering task, not a vendor-facing request.

### 5.4 Missing implementation — same Trace-API-ingestion gap, at turn grain, for the FULL
population (not just the QA-reviewed sample) (9)

These are the "Population Ratio" companions to 9 of this session's newly-implemented QA measures.
This session's QA measures are correctly scoped to the *reviewed sample* (Human QA + Automated QA
rows) — these `unimplemented` siblings would need every turn in the full interaction population
automatically classified, which requires the same un-ingested Trace-API turn evidence as §5.3, at
far larger scale (every turn of every call, not a reviewed subset).

`CANON-CONTEXT-CONTINUITY-RATE-POPULATION-RATIO`, `CANON-FOLLOWUP-UNDERSTANDING-RATE-POPULATION-R`,
`CANON-TASK-PROGRESSION-RATE-POPULATION-RATIO`, `CANON-REFERENCE-RES-ACC-POPULATION-RATIO`,
`CANON-RESPONSE-GROUNDING-RATE-POPULATION-RATIO`, `CANON-CONVERSATION-RECOVERY-RATE-POPULATION-RA`,
`CANON-UNNECESSARY-CLARIFICATION-RATE-POPULATIO`, `CANON-REPETITION-LOOP-RATE-POPULATION-RATIO`,
`CANON-CUSTOMER-CORRECTION-RATE-POPULATION-RATI`.

### 5.5 Blocked on a business-rule decision, not missing data (2)

| Canonical ID | Why |
|---|---|
| `CANON-QA-PASS-RATE` | The underlying per-parameter PASS/FAIL data is now directly accessible (this session's new `qa` source family). What's missing is a business decision: what threshold across the 9 QA parameters constitutes a "pass" for a whole interaction? Once decided, this is close to immediately computable — the nearest of all 25 to being unblocked. |
| `CANON-COMPLIANCE-PASS-RATE` | Same shape: needs a defined "critical compliance failure" rule, not new data. |

### 5.6 Blocked on scope/definition ambiguity (2)

| Canonical ID | Why |
|---|---|
| `CANON-CONVERSION-RATE` | "Conversion" is undefined at the system level — it would mean something different per campaign type/intent, and no single authoritative source spans voice + chat + campaigns generically. |
| `CANON-BUSINESS-OUTCOME-SUCCESS` | Same ambiguity — "a successful business outcome" has no single source; it would need a per-outcome-type definition first. |

4 + 2 + 6 + 9 + 2 + 2 = 25.

## 6. API change requests — only where a genuine external source-data gap is confirmed

1. **Campaign/Voice API: a "connected" or "answered" event distinct from the final call/result
   outcome.** Blocks `CANON-CONTACT-RATE` and `CANON-COMPLETION-RATE`. Today campaign execution
   only records the triggered attempt and its terminal classification — there is no intermediate
   "the customer actually picked up" signal.
2. **A customer satisfaction / NPS survey response capture mechanism.** Blocks `CANON-CSAT` and
   `CANON-NPS`. No integrated system (voice, chat, or this app) persists a real survey response
   today — the NPS Campaigns screen manages delivery only, confirmed mock for responses.
3. **Cost/billing data exposure** (per-call or per-interaction operating cost). Blocks
   `CANON-COST-PER-RES`. No cost fact exists in any current integration.

No change request is raised for §5.3/§5.4 (the Trace-API-ingestion gaps) — the data's shape already
exists upstream per the prior H0/H1 assessment; the missing piece is this codebase's own ingestion
pipeline, an internal roadmap item, not a vendor-facing gap.
