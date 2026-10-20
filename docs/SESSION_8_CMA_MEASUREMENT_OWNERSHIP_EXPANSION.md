# Session 8 — CMA Measurement Ownership Expansion

Expands CMA's authoritative ownership of business measurements using the evidence integration
and 500-interaction synthetic dataset completed in Sessions 7 and 7.1. **Fully local**: all
changes below are implemented, tested, and documented, but per explicit instruction **nothing
was committed, pushed, migrated, or deployed this session.**

## Part A — Baseline confirmation (direct inspection, not assumed)

Checked the real repository and the active production database (`dtbaczafdzgctkbqviod`) directly
before building anything on top of them:

| Prerequisite | Confirmed |
|---|---|
| Session 7.1 deployment is Ready | Yes — `vercel ls` shows the `078a786` deployment Ready, aliased to `callcenter-three-livid.vercel.app`, 12 serverless functions (unchanged ceiling). |
| Source synchronization fixes are deployed | Yes — real production `fcr`/`intent_confidence` values confirmed non-null (761/761 each). |
| Transcript evidence integration is operational | Yes — `cmaEvidenceOrchestrator`/`cmaTranscriptEvidenceCache` present and unchanged; their 78 deterministic tests still pass. |
| The 500 synthetic interactions are present | Yes — `customer_interactions` 350, `chat_sessions` 150, `qa_reviews` 80, `qa_findings` 160, `automated_qa_evaluations` 60, `automated_qa_observations` 120, all tagged `dataset_id = 'CMA_POC_500_V1'`, counted directly. |
| The two test agents exist | Yes — `VF_TEST_AGENT_A` (189 interaction rows), `VF_TEST_AGENT_B` (154 rows), counted directly. |
| NORMAL/TEST dataset modes are isolated | Yes — re-verified live: `call_center_qa_reviews_population` returns 27 (NORMAL) vs. 80 (TEST, exact synthetic count); `CANON-INTENT-CONFIDENCE` returns population 761 (NORMAL, unaffected by the synthetic rows) vs. 350 (TEST). |
| The existing 19 CMA calculations remain operational | Yes — confirmed by direct grep of `CMA_ALGORITHM_REGISTRY` (19 entries) before any change, and re-confirmed after (all 19 untouched, same keys). |
| No unexpected schema/authorization regressions | Yes — `rbac-authorization-verify.mjs` (17/17) and `business-data-scope-verify.mjs` (9/9) re-run clean before starting. |

No gap was found. The baseline from Session 7.1 held exactly as reported.

## Part B — UI/dataset validation

**Live browser click-through was not performed this session** — no login credentials for the
deployed production app were available in this session, and entering credentials found in
`.env` or elsewhere would fall outside this session's authorization. Rather than skip
verification entirely or fabricate a browser-based check, dataset-mode validation was performed
directly against the production RPCs that each wired screen actually calls server-side — the
exact code path the UI uses, re-confirmed this session (not just carried over from Session 7.1's
report):

- `call_center_qa_reviews_population` (QA Quality Explorer): NORMAL → 27 real reviews; TEST →
  exactly 80 synthetic reviews. No overlap either direction.
- `call_center_cma_evaluate_measure` for `CANON-INTENT-CONFIDENCE` (Dashboard Performance
  Ratios): NORMAL → population 761 (the real post-sync total, unaffected by the 350 synthetic
  voice rows sitting in the same table); TEST → population 350, denominator 298.

Call Logs, Chat Logs, Agent Detail, and Analytics remain architecturally live-API-sourced
(confirmed unchanged by inspection) and so correctly show no synthetic data in either mode — not
a gap, the same documented Session 7.1 limitation. Campaigns was not re-checked for synthetic
data since none was ever populated there (Session 7.1's own scope decision, unchanged). No
screen was marked "validated" on the basis of a partial or unconnected dataset.

## Part C — Measure selection

Cross-referenced all 60 rows of `docs/CMA_MEASURE_OWNERSHIP_TRANSITION.csv` against the actual
`CMA_ALGORITHM_REGISTRY` in code. Two real findings came out of this before any new work:

1. **Two CSV rows were stale.** `CANON-AUTH-SUCCESS-RATE` and `CANON-INTENT-CONFIDENCE` are
   already implemented and operational — the latter's "pending backfill" blocker was actually
   cleared by Session 7.1's manual Sync Now run. Corrected in the CSV this session (Part H).
2. **`CANON-CHAT-SESSION-SPAN` and `CANON-ACTION-REQUIRED-QUEUE-ITEMS`** are also already
   calculated but have no CMA-backed screen consumer — a Part F wiring question, not a new
   calculation.

Applying every one of the brief's selection criteria strictly (source records available,
business definition approved, existing architecture supports it, independent expectations
computable, a real operational use/consumer) to the remaining rows yielded exactly **3** new
candidates, not 5–8:

| Measure | Occurrence | Why selected | Why not more |
|---|---|---|---|
| `CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA` | CUST360-01 | decided, data available (`customers` pre-aggregated columns), real screen consumers named (Customer 360/Detail), blocked only on a known, bounded gap (Customer Category Scope never integrated into CMA) | — |
| `CANON-CUSTOMER-360-ESC-COUNT` | CUST360-02 | same | — |
| `CANON-CUSTOMER-360-AUTH-SUMMARY` | CUST360-03 | same | — |
| *(everything else)* | — | — | `CANON-FIRST-CONTACT-RES`/`CANON-ESC-RATE`/`CANON-AVG-HANDLE-TIME`/`CANON-CALL-TECH-PERF` are pending business approval (excluded per the brief). The 9 Trace-API measures need ingestion that doesn't exist (excluded: "required source records are available" fails). `CANON-QA-PASS-RATE`/`CANON-COMPLIANCE-PASS-RATE` need an undefined business threshold (excluded: pending approval). The 3 QA calibration measures need a new aggregation shape AND have no UI consumer (fails criterion 3 and 5). Everything else is mock, unimplemented-with-no-source, or already operational. |

This was surfaced to the user before implementation began (not silently expanded or silently
shrunk) — see the mid-session check-in. The user explicitly confirmed proceeding with exactly
these 3, plus the Customer Category Scope integration they require, plus investigating (not
necessarily implementing) UI wiring for the two already-calculated-but-unwired measures.

## Part D — Implementation

### D.1 Customer Category Scope integration into the CMA pipeline

**Confirmed before writing any code**: Customer Category Scope already exists as a real,
governed mechanism — `call_center_users_resolve_identity` already resolves a user's permitted
categories down to an effective `agent_id` set via `customer360_category_agents` (the SAME
category→agent linkage Customer 360's own routes already use via `api/_auth.ts`'s
`toCustomerAccess()`). Nothing new needed to be built for the *resolution* — only for making the
CMA evaluation pipeline *consume* it.

- `src/server/cma/cmaEvaluationAlgorithms.ts`: `CmaSourceFamily` gains `'customer'`. 3 new
  registry entries (`CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA`, `-ESC-COUNT`,
  `-AUTH-SUMMARY`), `expectedBaseFactIds: []` (consistent with the existing qa/campaign/chat/
  action precedent — CMA-2 never seeded interaction-centric Base Fact rows for non-interaction
  families).
- `src/server/cma/cmaEvaluation.ts`: `evaluateCmaMeasure()` gains an optional 4th parameter,
  `categoryAccess?: EvaluationScopeAccess` — structurally identical to the existing Agent Scope
  `access` parameter, by design (same shape, same narrowing semantics), but a separate value so
  the two dimensions can never be conflated. `buildRpcArgs()`'s new `'customer'` branch
  deliberately does **not** spread the shared `common` object (which carries Agent Scope and the
  time window) — it returns a wholly separate argument shape
  (`p_all_categories`/`p_authorized_category_agent_ids` only), which is what makes "the two
  restrictions cannot broaden each other" true *structurally*, not just by a runtime check: there
  is no Agent Scope key in this family's RPC call for anything to leak through. A `'customer'`
  measure evaluated with no resolved `categoryAccess` fails closed (`{ kind: 'unsupported' }`)
  before ever reaching the RPC. `CmaMeasureResponse` gains an optional `categoryScopeApplied`
  field (mirroring the existing `scopeApplied`), populated only on a real `'customer'`-family
  success, so a caller can see exactly which category scope was actually enforced.
- `api/admin.ts`'s `handleCmaEvaluatePost` resolves `toCustomerAccess(user)` unconditionally
  (zero behavior change for the 19 pre-existing measures, which never read it) and passes it
  through as the new 4th argument.
- New migration `supabase/migrations/20261114000000_cma_customer_category_scope.sql`: the
  `call_center_cma_evaluate_customer_measure` RPC. Not windowed (CUST360-01/02/03's own approved
  definition is "lifetime, not windowed") — no `p_started_from`/`p_started_to` parameters at all,
  unlike every other CMA evaluate RPC. **Not applied to production this session** — validated
  only in disposable PostgreSQL (below), per the explicit instruction not to migrate/deploy.

### D.2 What CMA now owns vs. what stays unchanged

The existing per-customer Customer Detail calculation
(`src/server/customer360/aggregateMath.ts`, already "FORMULA VERIFIED" per
`MASTER_MEASURES_REGISTER.csv`) is **untouched** — it correctly computes one customer's own
totals and is not a CMA responsibility. What CMA newly owns is a **population-level** aggregate:
the sum/percentage across every customer the caller's Customer Category Scope authorizes — a
number nothing in this codebase computed before this session.

## Part E — Validation against independent expected results

**Disposable PostgreSQL** (the only validation performed — the migration was never applied to
production, consistent with the instruction not to migrate automatically): a throwaway
PostgreSQL 17 cluster was initialized, a minimal `call_center.customers` table created, the new
migration applied verbatim, and known fixture rows loaded whose exact sums were computed by hand
(not by the RPC) before running it:

| Scenario | Independently expected | RPC result |
|---|---|---|
| Unrestricted (`p_all_categories = true`) | population 34, sum_total 631, sum_esc 29, ever_auth 1 | `{"numerator":631,"population":34,"denominator":34}` / `29` / `1` — exact match |
| Restricted to `agent-a` only | population 15, sum_total 631 (the bulk row happened to belong to agent-a) | `{"numerator":631,"population":15,"denominator":15}` — exact match |
| Restricted to `agent-b` only | population 10, sum_total 0 | `{"numerator":0,"population":10,"denominator":10}` — exact match |
| Restricted to `agent-a`+`agent-b` (multiple permitted) | population 25 (34 minus the 9 null-`latest_agent_id` rows) | `{"numerator":631,"population":25,"denominator":25}` — exact match |
| Empty permitted set | population 0 | `{"numerator":0,"population":0,"denominator":0}` — exact match, fails closed, never defaults to unrestricted |
| Unauthorized/absent category agent id (`agent-zzz`, not present in any row) | population 0 | `{"numerator":0,"population":0,"denominator":0}` — exact match |
| Unsupported canonical measure id | `{"status":"unsupported"}` | exact match |
| `AUTH-SUMMARY` scoped to `agent-a`+`agent-b` | ever_auth 1, population 25 | `{"numerator":1,"population":25,"denominator":25}` — exact match |

Null-`latest_agent_id` customers (9 of the 34 real production customers have no interaction ever
attributed to an agent) are correctly excluded from every restricted-scope result and correctly
included under an unrestricted one — confirmed both in the disposable cluster and by inspecting
the real production distribution (34 customers, 25 with an agent, 9 without) before writing the
fixture.

**TypeScript pipeline logic** — extended `.tooling/scripts/cma-evaluation-verify.mjs` (the real
compiled `cmaEvaluation.ts`, bundled via esbuild, not a reimplementation) with 8 new scenarios
covering exactly the required test list: unrestricted access, restricted categories, multiple
permitted categories, empty permitted categories, an explicit attempt to filter outside Customer
Category Scope (rejected as `unsupported_dimension` before the RPC, since no dimension is
registered for this family — there is no filter channel to misuse), combined Agent Scope +
Customer Category Scope (proved in both directions: the `'customer'` family's RPC args carry no
Agent Scope key at all even when a wide `access` is passed, and an `'interaction'`-family call
never receives any category-related key even when a narrow `categoryAccess` is passed alongside
it), NORMAL vs. TEST dataset isolation (the `'customer'` family never receives `p_dataset_id` —
`customers` has no such column, documented below, not fabricated), and the fail-closed case
(`categoryAccess` omitted → rejected, never defaults to unrestricted). All 74 assertions in the
file pass (59 pre-existing + 15 new), zero regressions.

**Why the 500-interaction synthetic dataset was not used for this validation**: Session 7.1
deliberately set `customer_id = null` on every synthetic interaction row specifically to keep the
synthetic population out of Customer 360/Customer Detail's unfiltered screens. The `customers`
table itself was never populated with synthetic rows and has no `dataset_id` column. Using the
500-interaction dataset for these 3 measures is therefore genuinely not applicable — the brief's
own "including the 500-interaction test dataset where applicable" qualifier covers exactly this
case. The disposable-PostgreSQL fixture above (built from real, hand-verified production numbers
instead) is the honest substitute.

## Part F — UI integration

Checked both already-calculated-but-unwired measures from Part C against every plausible
existing screen before deciding anything:

- **`CANON-CHAT-SESSION-SPAN`**: grepped `ChatLogs.tsx`, `ChatConsole.tsx`, `Analytics.tsx`,
  `Dashboard.tsx` for any duration/span display — none exists. There is no existing screen
  occurrence to wire into without inventing a new widget, which the brief explicitly forbids.
  **Left unwired, documented** (CSV updated).
- **`CANON-ACTION-REQUIRED-QUEUE-ITEMS`**: a screen *does* show this count today —
  `ActionRequiredCard.tsx`'s `items.length`. But that count is derived for free from the same
  list data the card must already fetch to render its rows. Routing it through a new CMA
  aggregate call instead would add a redundant network request and a second source of truth for
  the identical number — a real regression, not an improvement. Per the brief's own "when a
  legacy measure cannot yet be replaced safely, retain it and document the reason," this is
  **retained as-is, documented** (CSV updated), not swapped.

The new Customer 360 measures (Part D) also get no UI integration this session — no existing
screen shows a population-level Customer 360 aggregate to replace (checked `Customers.tsx`,
`Dashboard.tsx`, `Analytics.tsx` directly), and inventing one was explicitly out of scope per the
user's own instruction.

**Net result: zero screens changed this session.** Every new or newly-corrected measure is
real, tested, and operational, with its UI status honestly documented rather than forced.

## Part G — Automated verification

```
npm run typecheck   # clean
npm run verify:full # every suite green, including the extended cma-evaluation-verify.mjs (74/74)
npm run build       # clean, 3904 modules, no new warnings
```

- All 19 pre-existing CMA measures unchanged — confirmed by registry diff (same 19 keys,
  untouched definitions) and by the full suite re-running clean.
- The 3 new measures match independent expectations exactly (Part E).
- No LLM call of any kind is involved in this session's work (none of the 3 new measures are
  conversational/LLM-backed) — N/A, not skipped.
- Business Data Scope (Agent Scope) is provably unaffected: every pre-existing family's RPC args
  carry no category-related key (Session 8.6b above), and the 3 new measures carry no agent-scope
  key (Session 8.6a above) — checked both directions, not assumed.
- NORMAL/TEST dataset isolation is provably unaffected: the new family never receives
  `p_dataset_id` (Session 8.7), and every pre-existing family's dataset-mode behavior is
  unchanged (the full Session 7.1 test block still passes byte-for-byte).
- Existing screens remain operational — zero screens were touched this session (Part F).
- Disposable PostgreSQL was used for the only migration this session wrote (Part E); it was never
  applied to production. No external call, message, or paid LLM evaluation was triggered at any
  point.

## Part H — Documentation updates

- This file.
- `docs/CMA_MEASURE_OWNERSHIP_TRANSITION.csv`: corrected 2 stale rows
  (`CANON-AUTH-SUCCESS-RATE`, `CANON-INTENT-CONFIDENCE` → `already transitioned`), moved the 3
  `CUST360-*` rows from blocked to `already transitioned` with the real implementation account,
  and added this session's findings to the `CANON-CHAT-SESSION-SPAN`/
  `CANON-ACTION-REQUIRED-QUEUE-ITEMS` rows' `outstanding_dependencies`.
- `docs/CMA_CALCULATION_COVERAGE.md`: operational count 19 → 22, blocked count 9 → 6, the 3
  `CUST360-*` rows moved from §2 to §1 with the Session 8 account, summary arithmetic updated
  (22 + 6 + 4 + 3 + 25 = 60).

## Pending/unresolved, stated plainly

- The new migration (`20261114000000_cma_customer_category_scope.sql`) is written and validated
  in disposable PostgreSQL only — **not applied to production**, per explicit instruction. The 3
  new measures are therefore not yet callable in production until a future session applies it.
- No UI integration for any of the 3 new measures, or for `CANON-CHAT-SESSION-SPAN`/
  `CANON-ACTION-REQUIRED-QUEUE-ITEMS` — all documented above as genuine "no safe/available
  wiring opportunity," not an oversight.
- Live browser verification of Part B was not performed (no credentials available this session);
  substituted with direct production RPC verification of the exact code path each screen calls.
- Every other limitation already on record from Sessions 7/7.1 (Call Logs/Chat Logs/Agent
  Detail/Analytics architecturally live-API-sourced; no synthetic Campaigns data; Analytics/
  Ratios scope-awareness gap from Session 14.3) remains open and unaffected by this session.

Per the final instruction: stopping here. Not committed, not pushed, no migration applied, not
deployed.
