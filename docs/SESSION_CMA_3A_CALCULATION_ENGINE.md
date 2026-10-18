# Session CMA-3A — Central Calculation & Evaluation Engine

**Status: implemented and verified — logic-level tests (26/26) and a real disposable-PostgreSQL run
(14/14 scenarios, against hand-computed expected values from synthetic fixture data). Not applied
to production. Not committed, pushed, or deployed, per the brief's explicit execution boundaries.**

## 1. What this session implements

A single, reusable, governed calculation pipeline — `evaluateCmaMeasure()` — that takes a canonical
measure id, a time window, optional filters/grouping, and an authenticated caller's Business Data
Scope, and returns a typed, consistent result. It is the **only** place any canonical measure's
numerator/denominator logic is interpreted in this codebase; there is no second implementation for
a hypothetical Dashboard/Analytics/Reports consumer to drift from (brief §2).

| # | Deliverable | File |
|---|---|---|
| A | Central evaluation service | `src/server/cma/cmaEvaluation.ts` |
| B | Central dimension resolver | Dimension governance lives inside the evaluation pipeline itself (§5 below) — resolved through the live CMA registry (`listDimensionsForMeasure`), not a separate module, per the brief's "avoid copying normalization/dimension filters into individual measure implementations" |
| C | Business Data Scope integration | `isAgentIdInEvaluationScope()` in `cmaEvaluation.ts`, scope enforced inside the new SQL RPC's own `WHERE` clause |
| D | First 4 calculation algorithms | `src/server/cma/cmaEvaluationAlgorithms.ts` + the SQL in `supabase/migrations/20261028000000_cma_evaluation_engine.sql` |
| E | Minimal evaluation API | `api/admin.ts` — new `POST ?resource=cmaEvaluate` |
| F | Verification | `.tooling/scripts/cma-evaluation-verify.mjs` (26 logic tests) + a disposable-PostgreSQL run (14 tests against known fixture data — §8 below) |
| G | This report | `docs/SESSION_CMA_3A_CALCULATION_ENGINE.md` |

Types follow `docs/CMA_EVALUATION_CONTRACT_v0_3_1.md`'s shape closely (branded identifier types,
the `CmaMeasureValue` discriminated union, the canonical/occurrence/algorithm identity separation,
the validate→scope→calculate→return pipeline order) with one **deliberate, disclosed deviation** —
see §2.

## 2. A real incompatibility found between the provisional contract and the deployed registry

Per the brief's explicit instruction ("inspect the actual implemented database schema and registry
RPC contracts rather than assuming the design proposal exactly matches the deployed implementation
... do not revisit completed CMA-1/CMA-2 decisions without identifying a real incompatibility"):
`CMA_EVALUATION_CONTRACT_v0_3_1.md`'s `CmaDimensionId` union (`'agent' | 'campaign' | 'channel' |
'direction' | 'category' | 'time_bucket' | 'qa_parameter' | 'outcome' | 'tool_name'`) **does not
match** the 7 dimension ids the real, deployed CMA-2 registry actually contains (`time`, `channel`,
`agent`, `campaign`, `interaction_source`, `outcome`, `customer` —
`supabase/migrations/20261027000000_cma_governance_registry.sql`, confirmed live in production this
session). The provisional contract document predates CMA-2's actual seeding and was never
reconciled against it. This session's `CmaDimensionId` type (`src/server/cma/cmaEvaluationTypes.ts`)
uses the real, deployed dimension vocabulary — a documented, narrower subset of it (see §5) — not
the contract document's hypothetical one. No CMA-1/CMA-2 decision was reopened; the registry itself
is treated as authoritative, exactly as the brief instructs.

## 3. Selected measures — all 4 read directly from the live, applied CMA-2 registry

| Canonical ID | Name | Registry occurrence | Status | Unit |
|---|---|---|---|---|
| `CANON-RES-RATE` | Resolution Rate | `RES-01` | `decided` | percent |
| `CANON-AUTH-SUCCESS-RATE` | Authentication Success Rate | `AUTH-01` | `decided` | percent |
| `CANON-SUCCESSFUL-RES-TIME` | Successful Resolution Time | `SRT-01` | `decided` | seconds |
| `CANON-AVG-SENT-SCORE` | Avg Sentiment Score | `AGENT-SENT-01` | `decided` | score |

**Why these four and not others** — every one satisfies all of brief §6's criteria simultaneously:
clear, already-documented business definition in the register; backed by a real, persisted column
on `call_center.customer_interactions` (no upstream-opaque passthrough); `governed_algorithm_status
= 'decided'`, never `pending_decision`; independently verifiable population/numerator/denominator.
**FCR, Escalation Rate, AHT, and Call Technical Performance were not implemented** — all four remain
`pending_decision` in production (confirmed live, unchanged since CMA-2) and the brief explicitly
forbids calculating a `pending_decision` measure with an unapproved formula.

**Candidates considered and rejected**, with reasons (brief §6: "where a candidate is unsuitable,
select another... and explain why"):
- `CANON-AVG-INTENT-ACC`/`CANON-INTENT-CONFIDENCE` — `decided`, but their registered
  `numerator`/`denominator`/`eligible_population` fields are literally `"unknown"` in the register
  (upstream-opaque passthrough fields), so there is no real, persisted-fact-backed formula to
  implement — "supported by actual persisted interaction facts" fails.
- `CANON-CHAT-SESSION-SPAN` — same problem: its registered occurrence (`CHAT-SPAN-01`) has
  `numerator`/`denominator`/`zero_denominator_handling` all `"unknown"` — insufficiently specified
  to implement correctly rather than guess.
- `CANON-CAMPAIGN-TARGET-COUNT`/`CANON-CAMPAIGN-SUCCESS-*` — real, well-specified measures, but
  sourced from `campaign_targets`/`campaign_results`/`campaign_classifications`, not
  `customer_interactions` — out of scope for "interaction facts" per brief §6/§7's framing; a
  reasonable CMA-3B candidate, not forced into this session's interaction-only engine.
- `CANON-SENT` — a per-row `DIRECT` field (a call's own sentiment label), not a population
  aggregate at all; there is no "measure" here in the ratio/average sense this engine computes.

## 4. Calculation definitions and eligible populations (every one voice-only — see §9)

All four measures share the identical eligible-population base predicate (voice interactions within
the requested window, narrowed by Business Data Scope and any requested filters) and differ only in
their per-row eligibility and contribution rule — expressed exactly once, in one `CASE` arm per
measure, in `call_center_cma_evaluate_measure` (see §6):

| Measure | Eligible row | Numerator contribution | Zero-denominator handling |
|---|---|---|---|
| Resolution Rate | `outcome in ('resolved','escalated')` | `1` if `outcome='resolved'` else `0` | `null`, never fabricated `0%` |
| Auth Success Rate | `was_authenticated is not null` | `1` if `was_authenticated=true` else `0` | `null` |
| Successful Resolution Time | `outcome='resolved' and duration_seconds < 14400` | `duration_seconds` | `null` |
| Avg Sentiment Score | `sentiment_score is not null` | `sentiment_score` | `null` |

The 14400-second (~4h) stale-duration guard for Successful Resolution Time matches this codebase's
existing `isStaleDuration()` convention (`src/lib/format.ts`), reapplied in SQL rather than
imported, since the engine never loads rows into application memory to filter them (brief §8).

**A real, honest finding from production data** (checked live this session, read-only): in the
current production dataset, `was_authenticated` is **null on every row** — no authentication flow
has ever been recorded. Evaluating `CANON-AUTH-SUCCESS-RATE` against any real production window
today correctly returns `zero_denominator`, never a fabricated value — this is not a bug, it is the
engine doing exactly what brief §7 requires ("a missing fact must not silently become zero") against
genuinely incomplete source data, and doubles as the clearest real-world demonstration of that
guarantee.

## 5. Dimension governance

Every requested filter or `groupBy` dimension passes through two checks before any aggregation runs:
1. Is it one of the 3 dimensions this evaluation engine implements at all (`agent`, `channel`,
   `campaign` — a deliberate subset of the registry's real 7; see §9 for what's not wired up)?
2. Is it registered as applicable to the resolved occurrence in `cma_measure_dimensions` (queried
   live via the existing CMA-2 `listDimensionsForMeasure` RPC — the same relationship CMA-2 already
   seeded from the real Master Measures Register, reused unchanged, not reinterpreted)?

Both checks must pass, or the response is `{ kind: 'unsupported_dimension', reason: ... }` — no
measure algorithm independently reinterprets what a dimension means; `agent` always resolves by
`agent_id` (never a display-name join), `channel` by the real governed column value, `campaign` by
`campaign_id` (never free-text `campaign_name`) — exactly brief §5's requirements.

`time` is handled as the mandatory `window` request field, not as a requestable dimension — every
evaluation requires an explicit `[from, to)` window by construction; there is no "all time" option
to accidentally omit.

## 6. The evaluation RPC — one function, every algorithm expressed once

`call_center_cma_evaluate_measure` (new, additive, `supabase/migrations/20261028000000_cma_evaluation_engine.sql`)
is the single place aggregation happens. Its own two-value allow-list (canonical measure id,
`groupBy` value) is a second, structural governance gate independent of the TypeScript layer's own
checks — defense in depth, not a generic query builder (brief §8: "do not create a separate
analytics database, warehouse or generalized rules engine").

Business Data Scope is enforced **inside this function's own `WHERE` clause**
(`p_all_agents`/`p_authorized_agent_ids`), before the `base` CTE that every subsequent
aggregation reads from — there is no later step, grouped or not, that could see an out-of-scope row
at all, let alone aggregate one. All aggregation (including `group by agent`/`group by channel`)
happens in the database; the application layer only ever receives already-reduced
numerator/denominator/population numbers, never raw interaction rows (brief §8: "avoid loading the
entire interaction history into application memory").

## 7. Business Data Scope integration

Reuses the existing system unchanged — no second authorization model:
- `api/admin.ts`'s new `handleCmaEvaluatePost` resolves `toAgentAccess(user)` (the same function
  every other agent-scoped route already uses) and passes it into `evaluateCmaMeasure()`.
- A requested `agent` filter is checked against that scope with the same narrowing logic as
  `api/_auth.ts`'s `isAgentIdInScope` (reimplemented as a structurally-identical, duck-typed
  function in `cmaEvaluation.ts` rather than imported, since `src/server/*` modules must not
  depend on `api/*` — the existing dependency direction every other `src/server/cma` module already
  follows; verified identical in behavior by the disposable-Postgres scope test, §8).
- An unauthorized filter is rejected **before** the database is ever queried (verified: the fake
  Supabase client's call log shows zero RPC invocations for that scenario).
- An authorized caller's scope is applied inside the RPC's `WHERE` clause for every request,
  filtered or not, grouped or not — never only for the filtered case.

**Customer Category Scope was not integrated this session** — none of the 4 selected measures has a
`customer` dimension registered against their resolved occurrence in `cma_measure_dimensions` (all
four are `agent`/`channel`/`campaign`/`time`-scoped per the live registry), so there was no real
request shape this session's measures could exercise it against. This is a scope gap to close in a
future session that selects a customer-dimensioned measure, not a silently-skipped requirement — the
brief's instruction to "report the specific incompatibility rather than bypassing authorization"
does not apply here, because there is no incompatibility: Customer Category Scope integration is
simply out of this session's measure selection, not unsafe or unreusable.

## 8. Verification

### 8.1 Logic-level tests (`.tooling/scripts/cma-evaluation-verify.mjs`, 26 assertions, part of `verify:full`)

Against the real compiled `cmaEvaluation.ts` (via esbuild, `.tooling/tmp/cmaEvaluation.mjs`) and a
hand-written fake Supabase client — covers every scenario the brief's §10 lists: unfiltered
authorized calculation, agent-filtered, channel-filtered, valid grouped calculation, unsupported
dimension rejection, unauthorized scope rejection (and confirms the RPC is never called),
pending-definition rejection (confirms the RPC is never called), zero-interaction/zero-denominator
handling, missing-fact handling (a deliberately-broken registry/algorithm fixture), and repeated
evaluation returning an identical result. Plus 3 extra cases: unknown canonical measure id
(`not_found`), a mock indicator (never returns `value`), and a registry-unimplemented measure.

### 8.2 Real disposable-PostgreSQL validation (this session, same methodology as CMA-1A.2/CMA-2)

A fresh PostgreSQL 17 cluster (`C:\Software\PostgreSQL\17\bin`), isolated on `127.0.0.1:55433`,
Supabase-equivalent roles/stubs bootstrapped by hand. **All 54 real migrations — including this
session's new one — replayed in order** (the one pre-existing, already-documented RLS-remediation
ordering exception deferred to the end, same as every prior CMA database-validation pass), then the
real CMA-2 seed applied, then 12 synthetic `customer_interactions` rows inserted with
hand-computed, known expected values (full fixture and exact row-by-row arithmetic in the session
transcript). **14/14 tests matched the hand-computed expected values exactly, with zero
discrepancies**:

| # | Scenario | Expected | Actual |
|---|---|---|---|
| 1 | Unfiltered, all-access | num=6, denom=8, pop=10 | **exact match** |
| 2 | Scope-restricted (2 of 3 agents authorized) | num=5, denom=7, pop=9 | **exact match** |
| 3 | Agent-filtered (agent-a) | num=3, denom=4, pop=5 | **exact match** |
| 4 | Channel-filtered (voice) | identical to #1 | **exact match** |
| 5 | Grouped by agent | 3 groups, each num/denom/pop exact | **exact match** |
| 6 | Grouped by channel | 1 group (voice) — see §9's "degenerate" note | **exact match** |
| 7 | Auth Success Rate | num=1, denom=2 | **exact match** |
| 8 | Successful Resolution Time | num=570, denom=5 (stale row excluded) | **exact match** |
| 9 | Avg Sentiment Score | num=3.7, denom=7 | **exact match** |
| 10 | Zero-population window | pop=0, denom=0, numerator=`null` | **exact match** |
| 11 | Unsupported measure id | `{"status":"unsupported"}` | **exact match** |
| 12 | Unsupported `groupBy` | `{"status":"unsupported_dimension"}` | **exact match** |
| 13 | Repeated evaluation | identical result both times | **exact match** |
| 14 | Authorization | `anon` role → `permission denied` | **exact match** |

Test #2 vs #1 is the brief's explicitly-required proof that "applying a user's Business Data Scope
changes the population correctly before aggregation" — population drops from 10 to 9 (the
out-of-scope agent's row removed) and the ratio itself changes (75.0%-equivalent math → 71.4%), not
just a label.

Cluster stopped and deleted at the end of the pass; nothing left running; the real production
Supabase project was never written to.

### 8.3 `npm run typecheck` and `npm run verify:full`

Both pass clean (confirmed this session). `verify:full` now includes
`cma-evaluation-verify.mjs` alongside every pre-existing suite — no regression to any prior CMA
session or any other part of the application.

## 9. Known limitations (disclosed, not resolved this session)

- **Dimension coverage is a deliberate subset.** Of the registry's real 7 dimensions, this engine
  wires up `agent` and `channel` for both filtering and grouping, plus `campaign` for filtering
  only (not grouping, to keep the RPC's allow-list small and auditable). `time` is the mandatory
  window parameter, not a dimension. `outcome`, `customer`, and `interaction_source` are not wired
  into evaluation at all — requesting them returns `unsupported_dimension`, never a silently-ignored
  filter.
- **`groupBy: 'channel'` is mechanically supported but degenerate for all 4 selected measures** —
  every one of them is voice-only by eligible-population definition (the base CTE's own `WHERE
  channel = 'voice'`), so grouping by channel can only ever return a single `voice` group. Verified
  directly (disposable-Postgres test #6). This becomes meaningful once a future session adds a
  measure whose eligible population spans both channels.
- **No pagination contract for grouped results** — carried forward as an open question from
  `CMA_EVALUATION_CONTRACT_v0_3_1.md` §7, unresolved there too. Not a problem at today's cardinality
  (at most a few dozen agents), flagged for whenever `groupBy` cardinality grows.
- **Customer Category Scope is not integrated** (§7) — no selected measure has a `customer`
  dimension to exercise it against; deferred, not bypassed.
- **This engine's algorithms do not call the existing TS ratio functions** (e.g.
  `ratioMath.ts computeResolutionRate()`) — they reimplement the same documented business rule
  directly in SQL, because the existing functions read from the upstream Call Data API's
  page-fetcher (`callPopulationFetcher.ts`), not from `call_center.customer_interactions` — a
  different population source entirely (per-request live API pages vs. this table's own synced,
  governed copy). Both should agree in value when their underlying data agrees, but this was not
  independently proven this session (would require live-API access outside this session's scope) —
  flagged as a real, disclosed gap rather than assumed.

## 10. Schema/API changes (not applied to production)

- `supabase/migrations/20261028000000_cma_evaluation_engine.sql` — one new function
  (`call_center_cma_evaluate_measure`), one new permission (`cma.evaluate`, granted to
  `administrator`). Zero new tables, zero new columns, zero persisted derived values.
- `api/admin.ts` — one new `?resource=cmaEvaluate` POST branch. No new Vercel function file (the
  project's 12-function Hobby-plan ceiling is preserved).

## 11. Execution boundaries honored

Not done this session (brief §12): no migration applied to production, no production registry
decision or governance status changed, no production interaction data modified, no existing
Dashboard/Analytics/Reports calculation replaced, no change to CMA synchronization, no new scheduled
job introduced, no commit/push/deploy, `.env` untouched, no unrelated working-tree changes staged.
