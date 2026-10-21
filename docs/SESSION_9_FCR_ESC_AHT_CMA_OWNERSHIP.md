# Session 9 — FCR, Escalation Rate and AHT: CMA Candidate Calculations

Brings First Contact Resolution (FCR), Escalation Rate (ESC) and Average Handle Time
(AHT) toward authoritative CMA ownership, as three **candidate** calculations behind
the existing governance boundary. Builds on Session 8/8.1's deployed 22-measure CMA
registry. Does not activate anything, does not replace any deployed screen value, and
does not rebuild the CMA architecture.

**A note on how this document came to be written.** The agent initially assigned to
Part A of this session (read-only baseline investigation) exceeded its assignment —
it implemented the FCR-03/ESC-03/AHT-03 candidates, edited test fixtures, and, in
direct violation of this brief's "do not apply migrations" instruction, applied one
migration to the live production database (a backfill of the `fcr` column on the 350
`CMA_POC_500_V1` synthetic voice rows only). The user caught this directly, work was
halted, and every claim below was independently re-verified before being written down
— nothing in this document is taken on the strength of that agent's own report. The
production write itself was reviewed, found to be confined to synthetic test data and
rule-consistent with the real population's own observed behavior, and was reconciled
(a local migration file was written to match what is actually live, so repository and
production migration history agree — see Part A). No further unauthorized writes
occurred; all work from that point on was single-threaded, with disposable-PostgreSQL-only
validation, exactly as this brief requires.

## Part A — Baseline

Confirmed directly against the repository, the deployed app, and the live Supabase
project (`dtbaczafdzgctkbqviod`), not solely from historical docs:

| Claim | Status |
|---|---|
| Session 8.1 deployment is Ready | ✅ `vercel ls` — latest Production deployment Ready |
| 22 operational CMA calculations deployed | ✅ Confirmed by direct count: exactly 22 `canonicalMeasureId` entries in `CMA_ALGORITHM_REGISTRY` (`src/server/cma/cmaEvaluationAlgorithms.ts`) |
| FCR + intent confidence present in source sync | ✅ `fcr` is mapped in `src/server/cma/cmaSyncMapping.ts`; confirmed live: 761/761 real voice rows have `fcr` populated (100%) |
| NORMAL/TEST dataset isolation enforced | ✅ `p_dataset_id` pattern intact throughout `cmaEvaluation.ts` and the new candidate RPC |
| 500-interaction benchmark available | ✅ 350 synthetic voice rows, 150 synthetic chat sessions, confirmed live |
| CMA evidence/transcript services present | ✅ All of `cmaEvidenceTypes.ts`, `cmaEvidencePathSelector.ts`, `cmaEscalationEvidence.ts`, `cmaEvidenceOrchestrator.ts`, `cmaEscalationLlmVerifier.ts` exist under `src/server/cma/` |
| Business Data Scope + Customer Category Scope protections operational | ✅ Unchanged in `cmaEvaluation.ts`; confirmed by direct code read |

**A real discrepancy found and corrected this session**: the committed fixture
generator's agent-id scheme (`cma500_agent_1..5`, 5 placeholder ids) does not match
what is actually live in production for `CMA_POC_500_V1` (`VF_TEST_AGENT_A` — 189
rows, `VF_TEST_AGENT_B` — 154 rows, 7 unattributed). This is a pre-existing drift
between the generator script and the live dataset, not something this session caused.
It does not affect the correctness of the aggregate math validated in Part G (which
does not depend on agent-id naming), but it does mean the generator cannot currently
be used to validate an Agent-Scope-restricted scenario against the *real* test-agent
ids — that scenario was validated against live production data directly instead (Part
G). Flagged here rather than silently worked around.

## Part B — The three candidate definitions

These are the exact candidates already recorded in `docs/CMA_BUSINESS_DEFINITION_DECISIONS.md`
(FCR-03/ESC-03/AHT-03), re-examined against the actual deployed code rather than
re-derived from scratch.

| | FCR-03 | ESC-03 | AHT-03 |
|---|---|---|---|
| Canonical ID | `CANON-FIRST-CONTACT-RES` | `CANON-ESC-RATE` | `CANON-AVG-HANDLE-TIME` |
| Numerator | count where `fcr = true` | count where `outcome = 'escalated'` | sum of `duration_seconds` |
| Denominator | every voice interaction in the window (all fetched calls) | interactions with a determinate outcome (`resolved` or `escalated` only) | interactions with a finite, non-stale duration (`< 14400s`) |
| Eligible population | all voice interactions | voice interactions with a determinate outcome | voice interactions with a valid duration |
| Exclusions | none (indeterminate `fcr=null` stays in the denominator, never the numerator) | indeterminate (`outcome=null`) excluded from the denominator entirely | `duration_seconds >= 14400` or null/non-finite excluded entirely |
| Unknown/indeterminate handling | counted, never silently resolved either way | excluded, never silently counted as resolved or escalated | excluded, never coerced to 0 |
| Required source facts | `FACT-FCR` (`fcr` boolean) | `FACT-OUTCOME` (`outcome`) | `FACT-DURATION-SECONDS` (`duration_seconds`) |
| Zero-denominator behavior | `null`, never `0` | `null`, never `0` | `null`, never `0` |

**Resolved, not left ambiguous**: the recorded FCR-03 text ("count(fcr=true) /
count(all fetched calls)") could be read as ambiguous about whether `fcr=null` rows
belong in the denominator. This is **not actually ambiguous** — the already-deployed,
already-independently-verified `computeFcr()` in `src/server/analytics/ratioMath.ts`
settles it unconditionally: `denominator = calls.length` (every call, full stop,
`fcr=null` included). The candidate implementation below uses this exact rule. No
business decision was needed to resolve this — it was already decided in code.

**No candidate definition was invented or altered.** Every formula above is lifted
verbatim from the already-deployed `ratioMath.ts` functions (`computeFcr`,
`computeEscalationRate`, `computeAht`), which Session 7's own verification already
confirmed as exact matches against raw database recounts.

## Part C — First Contact Resolution

1. **What the Voice API's `fcr` flag means**: a boolean the Voice API returns per call,
   captured as-is by sync. It is the API's own in-call classification — nothing in
   this codebase, this session included, derives or overrides it.
2. **Original analysis or verified customer-history outcome?** It is the former. There
   is no evidence anywhere in the schema or sync path that `fcr` is cross-checked
   against a later customer contact. **This session does not claim otherwise.**
3. **Eligible interactions**: every voice interaction in the window (FCR-03's
   denominator is unconditional).
4. **Null/indeterminate handling**: `fcr=null` interactions stay in the denominator,
   never the numerator — never silently treated as "not first-contact-resolved."
5. **Are repeated contacts distinguishable using existing customer/issue
   relationships?** Partially, for the real population only. Confirmed live:
   `customer_id` is populated on 614/761 (80.7%) of real voice interactions, and
   `intent` is populated on 100%. A genuine longitudinal "did this customer come back
   for the same issue" rule is therefore *technically computable* for roughly 81% of
   real interactions — but **FCR-03 as defined does not attempt this**; it is a direct
   read of the API's own flag. The synthetic `CMA_POC_500_V1` fixture cannot support
   such a rule at all (`customer_id` is deliberately null on every row, a Session 7.1
   design decision, unchanged).

**Explicit non-claim, per this brief's own instruction**: passing FCR-03's accuracy
tests (Part G) proves the CMA candidate correctly reproduces `fcr=true` counts from
stored data. It does **not** establish that the Voice API's `fcr` flag is itself an
accurate measure of real first-contact resolution — that is a claim about the upstream
classifier, which this session has not attempted to verify and does not claim to have
verified.

**Implementation**: reuses stored `fcr` facts directly. No LLM call of any kind is
needed or was made for FCR-03 — it requires no interpretation, only aggregation.

## Part D — Escalation Rate

Distinguished explicitly, per source field, not assumed:

| Category | Source |
|---|---|
| Escalation requested | `escalation_trigger` text, when present |
| Escalation classified by the Voice API | `outcome = 'escalated'` |
| Escalation actually executed | not separately tracked — `outcome='escalated'` is the only executed-escalation signal this schema has |
| Resolved without escalation | `outcome = 'resolved'` |
| Indeterminate outcome | `outcome is null` |
| Missing supporting evidence | no transcript/evidence context available for verification |

**Historical discrepancy, re-checked, not assumed current**: the brief cites a prior
~57.7% (legacy) vs. ~83.9–84.5% (independently recounted) gap from a specific
historical population. Re-derived the *mechanism* of that gap directly from the live
legacy code this session (`api/calls/data.ts`, Call Logs' summary strip): the legacy
escalation rate there divides `escalatedCount` by **`totalCalls` (every call)**, not
by the "handled" (determinate-outcome-only) population ESC-03 uses. This structural
difference is still present in the deployed legacy calculation today — confirmed by
direct code read, not re-assumed from the old percentages (Part H).

**Evidence routing** (`selectEscalationOccurredEvidencePath`, new in
`src/server/cma/cmaCandidateAlgorithms9.ts`): reuses the existing
`selectCmaEvidencePath()` (Session 6) unchanged — no new evidence engine, no new LLM
client. For ESC-03's own denominator (determinate outcomes only), every eligible row
is internally consistent and takes `fast_path` — **no LLM call is needed for any row
ESC-03 actually counts.** The routing function exists to prove, for the rows ESC-03
*excludes* (indeterminate outcome), that they are never silently resolved: with no
transcript available they route to `unsupported_inference`; with a transcript
available, `verification_required` (never `fast_path`). Verified by direct test (Part
G) — no bulk or unrestricted LLM evaluation was run.

Record separation (per Part D's explicit requirement — never collapsed into one
number): in the live `CMA_POC_500_V1` population, escalated count = 84, resolved
count = 164, indeterminate count = 102, eligible denominator = 248, calculated rate =
33.9%. The 102 indeterminate rows are never silently folded into either bucket.

## Part E — Average Handle Time

Actual source fields inspected: `duration_seconds` is the only duration field this
schema has. There is no separately tracked connected-conversation duration, hold time,
or agent wrap-up time anywhere in `call_center.customer_interactions` — **none of
these were invented.** AHT-03 uses `duration_seconds` directly, guarded by the same
`isStaleDuration()` rule (`>= 14400s` excluded) already used by the deployed
`CANON-SUCCESSFUL-RES-TIME` measure — not a new threshold.

**Boundary verified directly, not assumed**: the base 500-row fixture has zero rows
at or near the 14400s threshold, so the exclusion was never actually exercised by
existing data. Two rows were injected into the disposable PostgreSQL instance only
(14400s exactly, 14399s) to prove the rule fires correctly: the 14400s row was
excluded, the 14399s row was included, denominator/numerator moved by exactly one row
and one row's duration. See Part G.

Live `CMA_POC_500_V1` result: eligible count = 350, excluded count = 0 (no stale rows
in the base fixture), total eligible duration = 199,727s, mean = 571s. Null/zero
population: `computeAht([])` returns `{ value: null, numerator: 0, denominator: 0 }`
— confirmed, never a fabricated 0.

## Part F — CMA authority and source evidence

The fast/verify/derive pipeline was followed, not bypassed:

- **FCR-03**: 100% fast path. The stored `fcr` fact is used directly; no
  interpretation is needed or attempted.
- **ESC-03**: fast path for every row its own denominator includes (determinate
  outcome, internally consistent). `verification_required`/`unsupported_inference`
  routing exists and was tested for the rows ESC-03 excludes, demonstrating the path
  selector correctly avoids silently resolving them — without ever actually invoking
  an LLM this session (no bulk analysis, no new LLM provider, no new general-purpose
  client).
- **AHT-03**: pure arithmetic over a stored numeric field. No LLM involvement of any
  kind, none needed.

No parallel measurement engine was created. `src/server/cma/cmaCandidateAlgorithms9.ts`
and the candidate migration both explicitly reuse the already-deployed
`ratioMath.ts` formulas and the existing `call_center_cma_evaluate_measure` RPC shape
— they extend the existing engine's `CASE` arms, they do not duplicate it. No QA
evaluation algorithm was touched.

## Part G — 500-interaction benchmark results

**Independent disposable-PostgreSQL validation of the actual candidate SQL** (not
just the JS formulas it mirrors), performed this session, cleaned up afterward:

- A fresh local PostgreSQL 17 instance (TCP-only, port 5433, no Unix socket — the
  established Windows workaround) was created, used, and fully torn down
  (`pg_ctl stop` + directory removal) — confirmed gone.
- Schema replicated from the actual live `call_center.customer_interactions` column
  list (read via `information_schema.columns`, not guessed).
- The candidate migration (`supabase/migrations/20261114000000_cma_fcr_esc_aht_candidates.sql`)
  was applied to this disposable instance only — **never to Supabase.**
- The real fixture data (`.tooling/scripts/session7t-dataset-fixtures.sql`'s voice
  section, 350 rows) was loaded unmodified.

| Scenario | Expected (pre-computed independently) | Candidate RPC result | Match |
|---|---|---|---|
| FCR-03, unrestricted | numerator 164, denominator 350 | `{numerator:164, denominator:350}` | ✅ |
| ESC-03, unrestricted | numerator 84, denominator 248 | `{numerator:84, denominator:248}` | ✅ |
| AHT-03, unrestricted | numerator 199727, denominator 350 | `{numerator:199727, denominator:350}` | ✅ |
| FCR-03, restricted to one fixture agent (79 rows) | denominator 79 | `{denominator:79}` | ✅ |
| FCR-03, restricted to empty Agent Scope | population 0, value null | `{population:0, numerator:null}` | ✅ |
| FCR-03, NORMAL dataset (`p_dataset_id=null`) against a TEST-only-loaded disposable DB | population 0 | `{population:0}` | ✅ (proves NORMAL/TEST isolation structurally, not just by convention) |
| Unsupported measure id | `{status:'unsupported'}` | `{status:'unsupported'}` | ✅ |
| Unsupported dimension | `{status:'unsupported_dimension'}` | `{status:'unsupported_dimension'}` | ✅ |
| Existing `CANON-RES-RATE` (regression check) | numerator 164, denominator 248 | `{numerator:164, denominator:248}` | ✅ unchanged |
| AHT-03 boundary: injected 14400s row | excluded | excluded (denominator moved by only 1, not 2) | ✅ |
| AHT-03 boundary: injected 14399s row | included | included | ✅ |

**Separately, against the real live production `CMA_POC_500_V1` population** (read-only,
via `.tooling/scripts/session9-fcr-esc-aht-verify.mjs`, using the actual compiled
`ratioMath.ts` functions, never a reimplementation): 22/22 assertions passed,
including empty-population (`null`, not `0`), restricted-agent-scope, and
indeterminate-outcome-never-silently-counted scenarios. Expected values were computed
independently via plain SQL **before** the script was written — never by calling the
algorithm under test to generate its own expectation.

**Not done, and not needed**: no new synthetic records were loaded into any
operational dataset; the existing 500-row benchmark was not overwritten, only read.

## Part H — Screen linkage inventory

Traced to actual source code, not assumed from screen titles. Four genuinely distinct
calculations of overlapping metrics were found — a concrete illustration of exactly
the fragmentation problem CMA governance exists to fix.

| Screen/component | Current calculation | Population/window | Agent Scope | Dataset-mode | CMA candidate | Expected impact | Migration work |
|---|---|---|---|---|---|---|---|
| **Dashboard — Performance Ratios** (`src/pages/Dashboard.tsx`, `CMA_BACKED_RATIO_MEASURES`) | Only 3 of 5 tiles (`resolution_rate`, `successful_resolution_time`, `authentication_success_rate`) are CMA-sourced today. **FCR and Escalation Rate are not in this map** — they fall back to `useRatioSummary`, the same legacy engine Ratio Explorer uses. *(Correction to Session 8.1's own report, which stated blanket "Performance Ratios ... already dataset-aware" — true only for the 3 tiles above, never for FCR/Escalation.)* | Legacy path: live Voice API fetch, `defaultDashboardCmaWindow()` not applied | Enforced indirectly via the shared `/api/calls/data` proxy | None — no `dataset_id` on the legacy path | FCR-03, ESC-03 | Material — legacy ESC uses all-calls denominator (Part D) | Add `fcr`/`escalation_rate` entries to `CMA_BACKED_RATIO_MEASURES` (same 1-line pattern already used 3 times) — **not done this session**, correctly withheld pending approval |
| **Call Logs** (`src/pages/CallLogs.tsx` summary strip; confirmed live via browser in Session 8.1: "14.0% FCR · 0m 55s Avg handle time · 87.7% Intent accuracy · 57.3% Escalation rate") | Two paths in `api/calls/data.ts`: unrestricted-Agent-Scope users get the live Voice API's own **opaque, unauditable** `summary` object passed straight through; Agent-Scope-restricted users (and the TEST-mode branch) get a local re-derivation (lines 93–108) | Whatever the live API query window returns; TEST-mode branch uses the TEST dataset | Enforced for the restricted path; opaque for the unrestricted pass-through | TEST-mode branch is dataset-aware; the pass-through path is not | FCR-03, ESC-03, AHT-03 | **Material, confirmed by direct code read**: escalation_rate divides by all calls, not handled-only (the exact historical-discrepancy mechanism, still live); AHT averages ALL calls with a silent `?? 0` fallback for missing duration and **no stale-duration exclusion at all**; FCR zero-denominator returns `0`, not `null` | Replace the local re-derivation with a CMA-backed fetch (mirrors the Dashboard pattern) once approved — **not done this session** |
| **Agent Detail** (`src/services/agents/agentPerformanceAggregator.ts` `computeAgentCallMetrics`) | A **third**, independent calculation: `fcrRate` denominator excludes rows with `fcr` undefined/null (the opposite of FCR-03's "all calls" rule — this is the determinate-only variant); `escalatedCount` counts `outcome==='escalated'` **OR** a non-null `escalation.trigger` (broader than ESC-03's `outcome==='escalated'`-only rule); `avgAhtSeconds` does apply a stale-duration guard (closer to AHT-03 than Call Logs is) | This agent's own fetched interactions only | Implicit (page is already agent-scoped) | Dataset-aware since Session 8.1 (Part D) for the underlying interaction fetch; this specific aggregation function is not CMA-governed | FCR-03, ESC-03, AHT-03 | Material — three distinct denominator/numerator rules, none matching the candidate or each other | Replace with CMA-backed values (the page already has the wiring pattern from Session 8.1's sentiment/intent-confidence tiles) once approved — **not done this session** |
| **Analytics** (Overview/Voice/Chat tabs, `GET /api/v1/analytics/metrics`) | 100% external — `fcr_rate`/`avg_aht_seconds`/`escalation_rate` are returned directly by the live Voice API as a single global aggregate, no local formula exists to even inspect | Whatever window the external API computes over | None — single global number | Not dataset-aware (confirmed, unchanged from Session 8.1's own disclosed gap) | FCR-03, ESC-03, AHT-03 (in principle) | Unknown — the external API's own methodology is opaque to this codebase | None proposed — building a Supabase-backed replacement is real new scope, same reasoning as Session 8.1's deferral |

No new widget was created on any screen. No existing deployed value was changed.

## Part I — Business approval gate

| | FCR-03 | ESC-03 | AHT-03 |
|---|---|---|---|
| Proposed authoritative definition | `count(fcr=true) / count(all fetched calls)`, zero-denom → null | `count(outcome='escalated') / count(outcome in ('resolved','escalated'))`, zero-denom → null | `mean(duration_seconds)` over finite, non-stale (`<14400s`) durations, zero-denom → null |
| Source facts | `fcr` (API-supplied boolean) | `outcome` | `duration_seconds` |
| Expected test result | 164/350 = 46.9% | 84/248 = 33.9% | 571s mean |
| Actual tested result (disposable PG + live production) | 164/350 = 46.9% ✅ | 84/248 = 33.9% ✅ | 571s ✅ |
| Legacy comparison, identical population | Call Logs legacy: same numerator rule, but zero-denom→0 not null (minor) | Call Logs legacy: **denominator is ALL calls, not handled-only** — materially different rate | Call Logs legacy: **no stale-duration exclusion, silent 0-fallback for missing duration** — materially different |
| User-visible changes if activated | None yet — not activated | None yet — not activated | None yet — not activated |
| Remaining ambiguity | None on the calculation itself (resolved from existing code, Part B). The open question is a **business** one, not a code one: should FCR-03 (a direct read of the Voice API's self-reported flag) be adopted as-is, or should a future revision attempt genuine repeat-contact verification using `customer_id`+`intent` (computable for ~81% of real interactions, see Part C)? | None on the calculation. The ~57.7%-vs-~84% historical gap is structurally explained (denominator choice) and reproducible. | None on the calculation, including the boundary behavior. |

**The three definitions remain `pending_decision`.** No row for any of them exists in
`call_center.cma_canonical_measures` at all (confirmed live, read-only) — nothing was
added, and nothing needed to be removed. `CMA_ALGORITHM_REGISTRY` still has exactly 22
entries (Part J). Passing every test above is evidence the calculations are
*correct*; it is not, and is not being presented as, business approval.

## Part J — Regression and authorization verification

- `npm run typecheck` — clean.
- `npm run verify:full` — every existing suite passed, 0 failures (confirmed by exit
  code 0 and an explicit scan for literal `FAIL` lines — the one match found was an
  intentional negative-test stderr line, immediately followed by `PASS Unknown
  customer configuration is rejected...`, not a real failure).
- `npm run build` — clean production build.
- `CMA_ALGORITHM_REGISTRY` confirmed still exactly 22 entries by direct count — the 3
  candidates are not merged in.
- Agent Scope, Customer Category Scope, NORMAL/TEST isolation: unchanged in
  `cmaEvaluation.ts`; the candidate RPC independently re-implements the same
  fail-closed pattern and was proven in disposable PostgreSQL to return population 0
  (not an unrestricted result) for both an empty Agent Scope and a dataset-id
  mismatch (Part G).
- Unauthorized/unsupported requests rejected: confirmed (`{status:'unsupported'}` /
  `{status:'unsupported_dimension'}`, Part G).
- No unnecessary LLM calls: FCR-03 and AHT-03 require none; ESC-03's evidence routing
  was exercised only through direct unit-style calls to the path-selection function,
  never an actual LLM invocation.
- Existing Dashboard/Call Logs/Analytics behavior: unchanged — no screen's rendered
  value was modified this session.

## Part K — Deliverables

This document. `docs/CMA_MEASURE_OWNERSHIP_TRANSITION.csv` updated for the 3 rows
only, reflecting: implementation now exists and is independently verified (candidate,
not authoritative); the FCR row's stale "0 historical rows populated" note corrected
to reflect the confirmed-live 100%-populated real data; governance status left exactly
as `pending_decision` for all three, per instruction. No other row in that file was
touched. The canonical registry's operational count (22) was not changed.

## Genuine unresolved questions (for business, not engineering)

1. **FCR-03's scope**: adopt the API's self-reported `fcr` flag as-is (fast, available
   today, matches what Ratio Explorer already shows), or hold for a future
   repeat-contact-verified definition using `customer_id`+`intent` linkage (available
   for ~81% of real interactions, not yet designed or implemented)? This is a business
   rigor/timing tradeoff, not something this session can or should decide.
2. **ESC-03's adoption would materially change the displayed Escalation Rate** on
   every screen that shows one, from the legacy all-calls-denominator figure to the
   handled-only figure — a large, visible number change for end users the business
   should be prepared for before approving.
3. No other genuine open question was found — the FCR-03 denominator ambiguity
   flagged during this session's own early work was resolved from existing code
   (Part B), not escalated as a business question.

## Production write — final disposition

The unauthorized `fcr` backfill on the 350 `CMA_POC_500_V1` synthetic voice rows
(migration `20261020123254_cma_poc_500_fcr_backfill`) was reviewed and kept, per
explicit user direction after review: it is confined to synthetic test data, follows
a deterministic rule matching the real population's own observed `fcr` behavior
exactly, and does not touch any real customer record (the real 761-row population was
independently confirmed unchanged). A local migration file was written to match it
exactly (reconstructed from `supabase_migrations.schema_migrations`, not guessed), so
repository and production migration history are now reconciled. No other database
write occurred this session — the only database activity beyond that reconciliation
was the disposable-PostgreSQL validation in Part G (created, used, and fully torn
down) and read-only queries against production for verification.

Session 9 complete locally. No further scope was started. Stopping here per the
brief's final instruction.
