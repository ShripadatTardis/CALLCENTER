# Session CMA-3B — Complete Calculation Catalogue

**Status: implemented and verified. Not applied to production. Not committed, pushed, or deployed,
per the brief's explicit execution boundaries.**

## 1. Baseline reviewed

Read `docs/SESSION_CMA_3A_CALCULATION_ENGINE.md`, `docs/SESSION_CMA_3A_1_PRODUCTION_DEPLOYMENT.md`,
`docs/CMA_EVALUATION_CONTRACT_v0_3_1.md`, `docs/CMA_DATA_MODEL_v0_3_1.md`,
`docs/MASTER_MEASURES_REGISTER.csv`, `docs/SESSION_CMA_2_GOVERNANCE_REGISTRY.md`, and the actual
deployed source (`src/server/cma/cmaEvaluation*.ts`, `supabase/migrations/20261028000000_cma_evaluation_engine.sql`).
Queried the live production registry directly (`dtbaczafdzgctkbqviod`) rather than assuming it
matches any prior document — confirmed, live: 60 canonical measures, 28 `decided` (4 already
implemented), 4 `pending_decision`, 3 `mock`, 25 `unimplemented`.

**CMA-3A's 4 production-verified algorithms are unchanged**: `CANON-RES-RATE`,
`CANON-AUTH-SUCCESS-RATE`, `CANON-SUCCESSFUL-RES-TIME`, `CANON-AVG-SENT-SCORE`. Their SQL (the
existing 4 `CASE` arms in `call_center_cma_evaluate_measure`) is reproduced byte-for-byte in this
session's new migration; only one new arm (`CANON-INTENT-CONFIDENCE`) was added. Confirmed via a
fresh disposable-PostgreSQL test (§5) that `CANON-RES-RATE` still produces the identical result
against the same fixture data used in CMA-3A/3A.1.

## 2. What this session implements

**15 new canonical measures**, across **4 new source families** this codebase already writes real
data to — never assuming every measure derives from `customer_interactions` (brief §2):

| Source family | New RPC | Table(s) | Measures added |
|---|---|---|---|
| `interaction` (extends CMA-3A's existing RPC) | `call_center_cma_evaluate_measure` | `customer_interactions` | 1 (`CANON-INTENT-CONFIDENCE`) |
| `qa` | `call_center_cma_evaluate_qa_measure` | `qa_findings`+`qa_reviews` (Human QA) UNION `automated_qa_observations`+`automated_qa_evaluations` (Automated QA) | 9 |
| `campaign` | `call_center_cma_evaluate_campaign_measure` | `campaign_targets`+`campaign_results`+`campaign_classifications` | 3 |
| `chat` | `call_center_cma_evaluate_chat_measure` | `chat_sessions` | 1 |
| `action` | `call_center_cma_evaluate_action_measure` | `action_items` | 1 |

**19 of 60 canonical measures are now operational** (4 CMA-3A + 15 CMA-3B), up from 4 — the full
60-measure breakdown, every row classified, is `docs/CMA_CALCULATION_COVERAGE.md`.

## 3. Central calculation and dimension authority — preserved, not duplicated

Every new measure executes through the **same** `evaluateCmaMeasure()` pipeline CMA-3A built
(`src/server/cma/cmaEvaluation.ts`) — no second evaluation path was created. Two structural changes
were needed to support more than one source family without duplicating governance logic:

1. **`CMA_ALGORITHM_REGISTRY` now carries `sourceFamily`, `rpc`, and `supportedDimensions` per
   algorithm** (`cmaEvaluationAlgorithms.ts`) — the dimension-validity gate (brief §3: "do not
   introduce measure-specific Agent, Campaign, Channel or Time interpretation") now reads each
   measure's *own* governed dimension set rather than one global list, because a chat-session-backed
   measure genuinely has no `campaign`/`channel` column to filter or group by, while an
   interaction-backed one does — this is the real grain of each source, not an arbitrary
   restriction.
2. **`buildRpcArgs()` constructs each RPC's exact argument shape** per source family — a
   campaign-backed RPC has no `p_filter_channel` parameter, a chat-backed one has no
   `p_filter_campaign_id`, reflecting each table's real columns rather than forcing one bloated
   generic signature.

The validate → scope → calculate → return pipeline order, the governance short-circuits (mock /
unimplemented / pending_decision / not_found), and the Business Data Scope narrowing logic are
**entirely unchanged and reused** — none of this was reimplemented per family.

**The `cma_measure_dimensions` cross-check against the live CMA-2 registry (brief §7: "associate
each implemented calculation with its canonical measure and approved algorithm reference") applies
only to the `interaction` family**, since CMA-2's own Base Fact/dimension seeding was
interaction-centric and never recorded relationships for the 4 new families — this is a disclosed
scope boundary of CMA-2 (see `cmaEvaluationAlgorithms.ts`'s own comment), not a defect this session
papers over. For the 4 new families, `algorithm.supportedDimensions` is this engine's own governance
gate instead — same strength, a different (in-code, not registry-table) data source. **No
production registry data was modified to accommodate this** (brief §7: "do not rewrite migrations
or seed files already applied to production").

## 4. Business Data Scope — applied to every new source family, no second authorization model

Every new RPC's `WHERE` clause includes the identical
`p_all_agents or <table>.agent_id = any(p_authorized_agent_ids)` predicate CMA-3A's own RPC already
uses, keyed off each family's own real `agent_id` column (`qa_reviews.agent_id` /
`automated_qa_evaluations.agent_id` for QA, `campaign_results.agent_id` for campaigns,
`chat_sessions.agent_id` for chat, `action_items.agent_id` for action items) — the same
`toAgentAccess()`/`isAgentIdInEvaluationScope()` mechanism, reused, not reimplemented. Confirmed
live via the disposable-Postgres pass (§5, test 3): scoping `CANON-CONTEXT-CONTINUITY-RATE` to
`agent-a` only narrowed the population from 4 to 3 rows *before* the ratio was computed, not after.

**Customer 360 (`CUST360-01/02/03`) was explicitly NOT implemented**, per brief §3's own escape
clause: it requires Customer Category Scope (`toCustomerAccess`), a structurally different
authorization dimension this evaluation engine has never integrated. Rather than bypass
authorization or build a second access model under time pressure, these 3 measures are reported
**blocked** in `docs/CMA_CALCULATION_COVERAGE.md` §2 — the facts already exist (the `customers`
table is pre-aggregated), the gap is authorization integration, not missing data, and that
distinction is stated explicitly rather than glossed over.

## 5. Verification

### 5.1 Logic-level tests (`.tooling/scripts/cma-evaluation-verify.mjs`, now 41 assertions, part of `verify:full`)

26 from CMA-3A (unchanged, still passing) + 15 new CMA-3B assertions: dispatch-to-correct-RPC for
each of the 4 new families, the `count` unit never reporting `zero_denominator` for a genuine zero,
`groupBy: 'campaign'` (a dimension no other family supports), per-family dimension rejection (a
`channel` filter rejected for the chat family, a `campaign` filter rejected for the qa family,
confirmed via each family's own `supportedDimensions`), and unauthorized-scope rejection proven
family-agnostic (never reaches the database for a non-interaction family either).

### 5.2 Real disposable-PostgreSQL validation (this session)

Fresh PostgreSQL 17 cluster, full **55-migration replay** (including this session's new migration),
the real CMA-2 seed, then **synthetic fixture rows across all 5 source families** with
hand-computed expected values (customer_interactions, qa_reviews/qa_findings,
automated_qa_evaluations/automated_qa_observations, campaigns/campaign_targets/campaign_results/
campaign_classifications, chat_sessions, action_items). **18 database-level tests, all matching
hand-computed expected values exactly** after two fixture corrections were found and fixed (both
fixture bugs — a missing `created_at` override defaulting to real insert time outside the test
window, and an initial arithmetic slip in a hand-written comment — never an RPC defect; the RPC's
own output was re-verified against the corrected hand-math both times and matched exactly):

| # | Test | Result |
|---|---|---|
| 1 | `CANON-INTENT-CONFIDENCE` avg (2.1/3) | **exact match** |
| 2 | `CANON-CONTEXT-CONTINUITY-RATE` unfiltered (3 clean/4 eligible, human+automated unioned, `in_progress`/`failed` rows correctly excluded) | **exact match** |
| 3 | Same, scoped to `agent-a` only (2/3) — proves scope narrows population before aggregation | **exact match** |
| 4 | `CANON-UNNECESSARY-CLARIFICATION-RATE` (lower-is-better, numerator = ISSUE count, 1/2) | **exact match** |
| 5 | `CANON-RESPONSE-GROUNDING-RATE` (1/1, GROUNDED) | **exact match** |
| 6 | `CANON-CAMPAIGN-TARGET-COUNT` (raw count = 3) | **exact match** |
| 7 | `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI` (1/2 classified) | **exact match** |
| 8 | `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS` (1/2 classified) | **exact match** |
| 7b | Campaign measure grouped by `campaign` | **exact match** |
| 7c | Campaign measure scoped to an unrelated agent (fail-closed: unattributed targets invisible to a restricted caller) | **exact match (0 population)** |
| 9 | `CANON-CHAT-SESSION-SPAN` avg (1080s/3 = 360s) | **exact match** |
| 10 | `CANON-ACTION-REQUIRED-QUEUE-ITEMS` raw count (3) | **exact match** |
| 11 | Same, scoped to `agent-b` only (2) | **exact match** |
| 12 | Unsupported measure id on the qa RPC | **exact match** (`{"status":"unsupported"}`) |
| 13 | `CANON-RES-RATE` (CMA-3A, unchanged) still correct within the same fixture | **exact match (4/5, population 6)** |
| 14 | `anon` role denied on the new qa RPC | **exact match** (`permission denied`) |

Cluster stopped and deleted at the end; the real production Supabase project was never written to.

### 5.3 `npm run typecheck` / `npm run verify:full`

Both pass clean (confirmed this session) — all 41 evaluation-engine assertions plus every other
pre-existing suite in the repository, no regression.

## 6. Missing facts — addressed individually, per brief §5

All 25 `unimplemented` canonical measures and all 3 `mock` measures were reviewed individually, not
collectively dismissed. Full per-measure classification (missing data vs. missing implementation vs.
blocked on a business-rule decision vs. blocked on scope ambiguity) is
`docs/CMA_CALCULATION_COVERAGE.md` §5. Headline findings:
- **2 of the 25 are the closest to unblockable**: `CANON-QA-PASS-RATE`/`CANON-COMPLIANCE-PASS-RATE`
  are blocked on a business-rule decision (what threshold constitutes "pass"), not missing data —
  the underlying per-parameter PASS/FAIL facts are now directly accessible via this session's new
  `qa` source family.
- **15 of the 25** (the 9 "Population Ratio" siblings of this session's new QA measures, plus
  `CANON-TOOL-SUCCESS-RATE`/`CANON-FALLBACK-RATE`/`CANON-AVOIDABLE-ESC-RATE`/
  `CANON-AUTONOMOUS-RES-RATE`/`CANON-INTENT-ACC`/`CANON-INTENT-ROUTING-ACC`) need turn-level
  Interaction Trace API evidence this codebase has never ingested into Supabase — a real,
  previously-identified data shape that exists upstream (per the earlier CMA H0/H1 assessment), but
  a missing *internal ingestion pipeline*, not a vendor-facing API gap.
- **3 specific, genuine external source-data gaps** were confirmed and written up as API change
  requests (`docs/CMA_CALCULATION_COVERAGE.md` §6): a connected/answered signal distinct from final
  call outcome, a CSAT/NPS survey-response capture mechanism, and cost/billing data exposure. No
  speculative field or estimate was created to work around any of these.

## 7. The 4 pending business definitions

Reviewed all four (brief §4): competing implementations, source facts, and — where real numerical
verification evidence already existed from prior sessions — the actual numerical consequences of
each competing definition. Full analysis and recommendations: `docs/CMA_BUSINESS_DEFINITION_DECISIONS.md`.
**Not approved or activated by this session** — confirmed still `pending_decision` in production
(§8 below). Headline finding carried forward, not re-derived: the current unscoped upstream
Escalation Rate passthrough (what Call Logs/Live View actually display today) is materially wrong
(~57.7% shown vs. ~83.9–84.5% independently verified), while the canonical ratio-engine definition
(`ESC-03`) is exact-match-verified against raw ground truth — the clearest, highest-priority of the
four recommendations.

## 8. Registry state — confirmed unchanged

Queried live production before and after this session's work (no migration applied, so no write
occurred, but verified anyway rather than assumed):

| Check | Before | After (re-checked) |
|---|---|---|
| `cma_canonical_measures` count | 60 | 60 |
| 4 pending-decision measures' status | `pending_decision` | `pending_decision` (unchanged) |
| 4 CMA-3A measures' status | `decided` | `decided` (unchanged) |

## 9. Schema/API changes — prepared, not applied

`supabase/migrations/20261029000000_cma_calculation_catalogue.sql` — purely additive: 1 extended
function (`create or replace` on CMA-3A's existing `call_center_cma_evaluate_measure`, its 4
existing arms byte-for-byte unchanged, 1 new arm added) + 4 new functions. Zero new tables, zero new
columns, zero new permission (every new RPC is covered by CMA-3A's existing `cma.evaluate`
permission and the same revoke/grant lockdown). **Not applied to production** — validated only
against disposable PostgreSQL (§5.2).

## 10. Remaining limitations

- Customer 360 (3 measures) blocked on Customer Category Scope integration (§4).
- QA Calibration (3 measures) blocked on a genuinely different aggregation shape (paired
  cross-side comparison, not a population ratio) — real future engineering scope, not attempted
  alongside 15 other new measures in one session.
- The 9 "Population Ratio" QA siblings and 6 other Trace-API-dependent measures need a new
  ingestion pipeline this session did not build (§6).
- `CANON-SENT` (a categorical label) and `CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY` (a direct
  record lookup) don't fit this engine's value/ratio response shape at all — noted, not forced.
- Dimension coverage per new family mirrors each table's real grain (agent/channel for QA,
  agent/campaign for campaigns, agent-only for chat/action) — `time` remains the mandatory window
  parameter everywhere, never a requestable dimension.
- No existing Dashboard/Analytics/Reports screen was migrated to this engine (brief §10's "not
  authorized" list) — this session is calculation-engine coverage only.

## 11. Execution boundaries honored

No migration applied to production. No production registry decision changed (verified, §8). No
production interaction/QA/campaign/chat/action data modified (all database work ran against a
disposable local cluster, deleted at the end). No existing Dashboard/Analytics/Reports calculation
replaced. No change to CMA synchronization. No new scheduled job. No commit, push, or deploy.
`.env` untouched; no unrelated working-tree changes staged. CMA-4 was not started.
