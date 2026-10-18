# VoiceForce Call Centre — Measurement Test Data Plan

## Objective

A reproducible, isolated synthetic population with independently
calculated expected results, to verify CMA (Central Measures Authority)
calculation correctness — deliberately covering edge cases (zero
populations, scope exclusions, missing facts, draft/incomplete records)
that current production data doesn't reliably exercise.

## 1. Environment and isolation strategy

**Disposable local PostgreSQL 17 only — never production.** This reuses
the project's established methodology (used in every CMA session since
CMA-3B): a fresh local cluster (`initdb`, binaries at
`C:\Software\PostgreSQL\17\bin`), Supabase-equivalent role/auth stubs,
the full real migration history replayed in order (with the one
documented exception: `20261004041341_call_center_enable_rls_remediation.sql`
deferred to the end of the replay), the real seed applied, then this
plan's fixture file applied on top. The cluster is stopped and its data
directory deleted at the end of every run — nothing persists between
runs, and nothing is ever pointed at `dtbaczafdzgctkbqviod` (production).

No new paid infrastructure was created or is needed.

**Collision avoidance.** Every fixture row uses an `fx_`-prefixed tag
(agent ids `fx_agent_a`/`fx_agent_b`/`fx_agent_c`, campaign names, etc.)
and a synthetic anchor window (`2026-06-01` to `2026-06-02`, UTC) that
does not overlap this project's real data (which spans September–October
2026). Even if a fixture file were mistakenly pointed at a real database
(it never is, by procedure), the `fx_` tag makes every synthetic row
trivially identifiable and removable.

## 2. Files

- `.tooling/scripts/measurement-test-fixtures.sql` — idempotent fixture
  population (delete-then-insert keyed on the `fx_` tag, so re-running
  it never duplicates rows).
- `.tooling/scripts/measurement-test-fixtures-cleanup.sql` — deletes
  every row the fixture file inserts, verified by re-running it and
  confirming affected-table counts return to the pre-fixture baseline.

## 3. Data scenarios and source tables

### Voice interactions (`call_center.customer_interactions`, channel='voice')

12 rows across 3 agents (`fx_agent_a`, `fx_agent_b` — both "authorized"
in the Business Data Scope test; `fx_agent_c` — deliberately
"unauthorized", proves scope narrowing) plus one row with a null
`agent_id` (proves `groupBy:'agent'` excludes ungrouped rows correctly):

| Covers | Rows |
|---|---|
| Resolved | R1, R2, R6, R7, R8, R9, R11 |
| Escalated | R3, R4, R12 |
| Indeterminate outcome | R5 (`outcome=null`) |
| FCR true/false | R1 (true), R2 (false) |
| Repeat contact (same `customer_id`) | R6, R7 |
| Auth success/fail/missing | R1 (true) / R3 (false) / R4 (null) |
| Normal vs. stale (>14400s) duration | R1 (180s) / R3 (20000s) |
| Sentiment positive/neutral/negative/missing | R1 (0.8) / R5 (0.5) / R3 (0.1) / R4 (null) |
| Low/high intent confidence, missing | R3 (0.2) / R8 (0.95) / R4 (null) |
| Boundary timestamps | R8 at window start (inclusive), R10 at window end (must be excluded, half-open `[from,to)`) |
| Unauthorized agent scope | R11, R12 (`fx_agent_c`) |
| Missing agent identifier | the extra null-`agent_id` row |

### Quality Assurance (`qa_reviews`/`qa_findings`, `automated_qa_evaluations`/`automated_qa_observations`)

Two parameters, chosen to cover both grain shapes CMA's qa-family RPC
supports:

- `context_continuity_rate` (turn-shape): 3 submitted Human reviews
  (PASS/FAIL/N_A) + 1 in-progress (draft, non-submitted) Human review
  that must be excluded entirely; 2 completed Automated evaluations
  (PASS/N_A) + 1 running (incomplete) Automated evaluation that must be
  excluded entirely.
- `repetition_loop_rate` (review-shape, lower-is-better): 2 submitted
  Human reviews (ISSUE/NO_ISSUE) + 2 completed Automated evaluations
  (ISSUE/NO_ISSUE) — tests the DISTINCT-review/evaluation-id grain, not
  per-finding.

Both are evaluated through all three population selectors this session
added (`human` / `automated` / `combined`) — see §5.

### Campaigns (`campaign_targets`/`campaign_executions`/`campaign_results`/`campaign_classifications`)

2 campaigns, 5 targets: a raw-classified success, a raw-classified
failure, an unclassified target, a second campaign's raw-classified
success, and a second unclassified target. Exactly one target also has
a policy classification (successful) — tests that the policy-vs-raw
success rates diverge correctly when only some targets have policy data.

### Chat (`call_center.chat_sessions`)

2 sessions with a valid `last_activity_at` (spans 120s/180s). The
originally-designed third scenario (missing end time) could **not** be
fixtured: `chat_sessions.last_activity_at` is `NOT NULL` at the real,
current database level (confirmed via `information_schema` during
validation) — so `call_center_cma_evaluate_chat_measure`'s own
`last_activity_at is not null` guard is defensive code that is currently
unreachable given today's schema. Not worked around by relaxing the
column or forcing a null past a constraint; recorded here as a known,
currently-unexercisable scenario instead (§3).

### Action Required (`call_center.action_items`)

4 rows, 2 linked to campaign C1 (tests `p_filter_campaign_id`), 2 with no
campaign.

### Known unavailable scenarios (explicitly not fabricated)

Per this plan's own instruction not to force unsupported capabilities
into the schema:
- **Chat session with a missing end time** — originally planned, but
  `chat_sessions.last_activity_at` is `NOT NULL` in the real schema
  (confirmed during validation), so this state cannot occur in real
  data and was not fixtured by relaxing the constraint. The RPC's own
  `is not null` guard remains correct defensive code; it is just not
  exercisable by any legal row today.
- No chat-session-level sentiment/CSAT fixture — no such column exists
  in `chat_sessions` today; `CHAT-SPAN-01` is the only chat measure CMA
  has, and it's covered.
- No Call Technical Performance (per-call latency) fixture — that
  measure is still `pending_decision` (see
  `docs/SESSION_4D_PENDING_DEFINITION_DECISIONS.md`); its source
  (`GET /api/v1/analytics/call-metrics`) is an external Voice API call,
  not a `customer_interactions` column, so it's out of scope for a
  Supabase-only fixture file. Flagged as a future scenario, not forced.
- FCR/Escalation Rate/AHT's *candidate* definitions (FCR-03/ESC-03/AHT-03)
  are exercised informally by the same resolved/escalated/duration rows
  above (the data would support testing them once approved), but no
  assertions are written against `pending_decision` measures — they
  return `{kind:'not_yet_governed'}` regardless of fixture data, by
  design, and this plan does not test around that short-circuit.

## 4. Fixture relationships

All voice/QA/campaign/chat/action rows share the same anchor window and
the same 3 fixture agents where applicable, so a single evaluation
window (`['2026-06-01T00:00:00Z','2026-06-02T00:00:00Z')`) exercises
every family at once. Campaign C1's id is reused by both the campaign
fixtures and 2 of the 4 Action Required rows, so the campaign-filter
test on `CANON-ACTION-REQUIRED-QUEUE-ITEMS` has a real, non-trivial
relationship to assert against, not an isolated row.

## 5. Expected calculation results (independently hand-computed — never derived by calling the RPC under test)

| Canonical measure | Scenario | Population | Numerator | Denominator | Expected value | Dimensions exercised |
|---|---|---|---|---|---|---|
| `CANON-RES-RATE` | scoped (fx_agent_a + fx_agent_b) | 9 | 6 | 8 | 75.0% | agent scope |
| `CANON-RES-RATE` | unscoped (all agents) | 12 | 8 | 11 | 72.7% | proves scope narrowing (8/9 → 11/12) |
| `CANON-RES-RATE` | disjoint empty window | 0 | — | 0 | `zero_denominator` | honest empty state |
| `CANON-AUTH-SUCCESS-RATE` | scoped | 9 | 7 | 8 | 87.5% | — |
| `CANON-SUCCESSFUL-RES-TIME` | scoped | 9 | 1000 (sum) | 6 | 166.67s | stale-duration exclusion |
| `CANON-AVG-SENT-SCORE` | scoped | 9 | 4.3 (sum) | 8 | 0.54 | missing-value exclusion |
| `CANON-INTENT-CONFIDENCE` | scoped | 9 | 5.15 (sum) | 8 | 0.64 | missing-value exclusion |
| `CANON-CONTEXT-CONTINUITY-RATE` | `qaPopulation='human'` | 3 | 1 | 2 | 50.0% | draft-review exclusion |
| `CANON-CONTEXT-CONTINUITY-RATE` | `qaPopulation='automated'` | 2 | 1 | 1 | 100.0% | incomplete-evaluation exclusion |
| `CANON-CONTEXT-CONTINUITY-RATE` | `qaPopulation='combined'` | 5 | 2 | 3 | 66.7% | population selector |
| `CANON-REPETITION-LOOP-RATE` | `qaPopulation='combined'` | 4 | 2 | 4 | 50.0% | review-level DISTINCT grain |
| `CANON-CAMPAIGN-TARGET-COUNT` | unfiltered | 5 | 5 | 5 | 5 (count) | — |
| `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI` | unfiltered | 5 | 2 | 3 | 66.7% | unclassified exclusion |
| `CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS` | unfiltered | 5 | 1 | 1 | 100.0% | policy-vs-raw divergence |
| `CANON-CHAT-SESSION-SPAN` | unfiltered | 2 | 300 (sum) | 2 | 150s | — (missing-end-time scenario not exercisable, see §3) |
| `CANON-ACTION-REQUIRED-QUEUE-ITEMS` | unfiltered | 4 | 4 | 4 | 4 (count) | — |
| `CANON-ACTION-REQUIRED-QUEUE-ITEMS` | campaign-filtered | 2 | 2 | 2 | 2 (count) | campaign dimension |

(Exact confirmation of every row above against the real compiled RPCs on
a disposable cluster is reported in
`docs/SESSION_4D_MEASUREMENT_INTEGRATION_COMPLETION.md`. One of this
plan's own expected values was initially wrong, caught during that
validation, not silently adjusted — the unscoped `CANON-RES-RATE` figure
above already reflects the correction: the fixture's deliberate
null-`agent_id` row has no `agent_id is not null` guard on the
all-agents code path, so it's correctly included once scope is removed
— the table above states the corrected, verified numbers.)

## 6. Business Data Scope tests

Covered directly by the `CANON-RES-RATE` scoped-vs-unscoped pair above —
`fx_agent_c`'s 2 rows are present in the fixture but must only appear in
the unscoped result, never the scoped one. This exercises the exact same
`authorized_agent_ids` mechanism every production CMA call already goes
through (`toAgentAccess` → `evaluateCmaMeasure`), not a parallel
authorization model built for this test.

## 7. Population and cleanup procedure

```
# 1. Start a fresh disposable cluster (see any prior CMA session report
#    for the exact initdb/role-stub commands this project already uses).
# 2. Replay the full migration history in order, RLS-remediation file deferred to the end.
# 3. Apply the real seed.
psql -f .tooling/scripts/measurement-test-fixtures.sql
# 4. Run assertions (see docs/SESSION_4D_MEASUREMENT_INTEGRATION_COMPLETION.md for the exact RPC calls and expected values from §5 above).
psql -f .tooling/scripts/measurement-test-fixtures-cleanup.sql   # verifies cleanup, not required before teardown
# 5. Stop the cluster and delete its data directory.
```

Because step 5 always deletes the whole disposable data directory, the
cleanup script (step 4) is a correctness check on the fixture file's own
idempotency (confirming its `fx_`-tag deletes are complete), not a
required step for safety — nothing in this procedure ever reaches a
database that survives past the session.

**A real constraint found during validation**: `campaign_targets.effective_result_id`
and `campaign_results` have a circular foreign-key relationship (a
target points at its effective result; nothing stops a result from
outliving the target that references it). Both the fixture file's own
leading cleanup block and the standalone cleanup script must `UPDATE
campaign_targets SET effective_result_id = null` for the fixture's own
rows *before* deleting `campaign_results` rows, or the delete fails on
the FK. Both files do this; verified via two consecutive fixture
applications producing identical row counts (no duplication) and a full
cleanup run reducing every affected table to zero fixture rows.

## 8. What this plan does not (yet) cover

- Agent Detail's `CANON-AVG-SENT-SCORE`/`CANON-INTENT-CONFIDENCE`
  per-agent-windowed query path (implemented this session) is exercised
  by the same interaction-family fixture rows above (any measure/filter
  combination can be tested against them), but no dedicated
  `useAgentDetail`-shaped assertion was written — the underlying RPC
  calls are identical to the ones already covered.
- Live/real-time states (active calls, live concurrency) are explicitly
  out of scope — CMA evaluates closed `[from,to)` windows only, these
  were never CMA-eligible to begin with (see
  `docs/CMA_4B_OPERATIONAL_SCREEN_MIGRATION_MATRIX.md`).
- A second full disposable-Postgres run exercising EVERY dimension
  combination (channel × agent × campaign × groupBy, for every one of
  the 19 operational measures) was judged out of scope for one session —
  this plan covers one clear representative scenario per measure and
  explicitly lists the gap rather than claiming exhaustive coverage.
