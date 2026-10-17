# Session CMA-1A.3 — Partial Update Correction

Continues CMA-1A (implementation), CMA-1A.1 (corrections), and CMA-1A.2
(database validation). CMA-1A.2 executed the migration against a real,
disposable PostgreSQL 17.5 instance for the first time and found a real,
reproduced bug that static/hand-traced review in the prior sessions could
not have caught. This session fixes that bug and re-validates against a
freshly recreated instance of the same real-Postgres environment.

**The production Supabase project (`dtbaczafdzgctkbqviod`) was never
written to.** Every test in this session ran exclusively against a
disposable local PostgreSQL database, recreated fresh for this session and
deleted at the end.

## 1. The bug (recap from CMA-1A.2 §4)

A partial-update call on an **existing** row still failed if it omitted
`startedAt`, even though `call_center_sync_interaction`'s own `v_exists`
pre-check correctly determined the call was not a first-time insert and
did not raise its explicit validation error:

```
ERROR:  null value in column "started_at" of relation "customer_interactions"
violates not-null constraint
```

**Root cause**: the function always executes a single
`INSERT ... VALUES (...) ON CONFLICT (source, interaction_id) DO UPDATE ...`
statement. Postgres constructs and validates the full candidate `VALUES`
tuple — including every `NOT NULL` constraint on columns in that tuple —
**before** it ever resolves whether `ON CONFLICT` applies. Since
`started_at` is a `NOT NULL` column and the `VALUES` clause always included
`(p_payload->>'startedAt')::timestamptz` (which evaluates to `NULL` when
the key is omitted), the insert-candidate row failed its own constraint
immediately, regardless of whether a matching row already existed to
conflict with.

This directly contradicted the explicit, repeated requirement across the
whole CMA-1A series: "Do not impose mandatory fields on partial updates
that only need to identify an existing interaction."

## 2. Options considered, and why Option B was selected

**Option A — UPDATE-first / INSERT-if-absent (explicit two-statement
branch).** `SELECT`/existence-check to determine if a matching
`(source, interaction_id)` row exists, then branch to a plain `UPDATE`
(never touching `started_at` or other immutable columns) or, if absent,
validate-and-`INSERT`. Rejected: this introduces a real TOCTOU race between
the existence check and the subsequent statement. Postgres's own `v_exists`
pre-check already exists in this function purely for a friendlier error
message — it was never meant to be relied on as the actual concurrency
control, and making it one would require additional machinery
(`SELECT ... FOR UPDATE`, or a unique-violation catch-and-retry) that the
function does not otherwise need. Discarding `ON CONFLICT`'s native,
race-free atomicity to work around a tuple-construction quirk would be a
strictly worse trade — it would reintroduce exactly the kind of concurrency
risk the brief explicitly asks to avoid ("The solution must not introduce
duplicate rows or unsafe race conditions").

**Option B — SELECTED. Corrected single-statement upsert.** Make the
candidate row's `started_at` value self-heal to the *existing* row's own
`started_at` (via a plain, uncorrelated subquery keyed on the same
`(source, interactionId)` the function already uses to locate the row)
whenever the payload itself omits the field:

```sql
coalesce(
  (p_payload->>'startedAt')::timestamptz,
  (select existing.started_at from call_center.customer_interactions existing
     where existing.source = v_source and existing.interaction_id = v_interaction_id)
),
```

On a genuine first insert, no existing row exists, the subquery yields
`NULL`, and the function's own pre-check (CMA-1A.1) has *already* raised
its explicit, friendly `"startedAt is required for a new interaction"`
error before this `INSERT` statement is ever reached — so this fix cannot
silently smuggle a missing mandatory field past first-insert validation.
On a true update path, the value this expression produces is in any case
structurally irrelevant to what actually gets stored: `started_at` remains
correctly absent from the `ON CONFLICT ... DO UPDATE SET` list (immutable
once set, unchanged from CMA-1A/1A.1), so the column's real stored value
never moves regardless of what the candidate row's `started_at` expression
computed.

This keeps the whole operation a single atomic statement, preserving
Postgres's native `ON CONFLICT` race-freedom for concurrent callers — the
correctness, concurrency-safety, and maintainability properties the brief
asked the choice to be based on all favor Option B over Option A.

**`channel` was investigated for the identical class of bug and found NOT
to need the same fix.** Its existing expression
(`coalesce(payload channel, derived-from-source default)`) can never
evaluate to `NULL`, because `source` is unconditionally required on every
call — it is half of the lookup key itself, always present in any payload
that can reach this function's logic at all. This was confirmed, not
assumed: the real Postgres test run below reproduced the `started_at`
failure but never a `channel` failure for the identical partial-update
payload shape.

## 3. Files changed

- `supabase/migrations/20261024000000_cma_interaction_base_facts.sql` —
  revised in place (never applied anywhere, so corrected directly rather
  than stacking a further follow-up migration, consistent with CMA-1A.1's
  own precedent). Changes: the `started_at` VALUES expression now uses the
  `COALESCE`+subquery self-heal described above; a new CMA-1A.3 section
  added to the file's top-of-file comment block documenting the bug, the
  two options considered, and the selection rationale.
- No changes were needed to `src/server/cma/interactionReconciliation.ts`,
  `api/_cma.ts`, or `.tooling/scripts/cma-interaction-reconciliation-verify.mjs`
  — this is a purely SQL-side fix with no TypeScript-visible contract
  change (the RPC's JSON request/response shape is unchanged). The existing
  verify script's own header comment already documents that the sync RPC's
  upsert/merge semantics live in Postgres and are verified by direct
  execution against a real database, not by TS unit tests — that division
  of responsibility is unchanged by this session.
- `docs/SESSION_CMA_1A_3_PARTIAL_UPDATE_CORRECTION.md` — this file, new.

## 4. Verification — executed against a real, freshly recreated disposable PostgreSQL instance

CMA-1A.2's own disposable database was stopped and deleted at the end of
that session, so this session recreated the same kind of environment from
scratch rather than assuming anything persisted: a standalone PostgreSQL
17.5 install, a fresh `initdb` cluster on an isolated port, the same
Supabase-equivalent prerequisite stubs (`anon`/`authenticated`/
`service_role` roles, a `supabase_realtime` publication, a minimal `auth`
schema), and all 50 real `supabase/migrations/` files replayed in order
(deferring the same pre-existing, unrelated `..._enable_rls_remediation.sql`
ordering quirk CMA-1A.2 already documented — not CMA's issue, worked around
identically). All 50 migrations, including the corrected CMA-1A file,
applied cleanly end-to-end.

Two additional login roles were created beyond CMA-1A.2's read-only
inspection: `cma_test_service_user` (`LOGIN`, member of `service_role`) to
exercise the RPCs as their intended real caller, and
`cma_test_authenticated_user` (`LOGIN`, member of `authenticated`) to
re-confirm unauthorized access is still rejected. None of this touched
production Supabase.

Every row below is a real Postgres response from this session's own
disposable database — none of it is static/hand-traced.

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | First insert, full payload (`call-001`) | **PASS** | `wasInsert: true`, row inserted with `duration_seconds: 30`, `outcome: "resolved"` |
| 2 | **The exact partial-update payload from the brief**: `{"source":"call-data","interactionId":"call-001","durationSeconds":45}` on the existing `call-001` row, omitting `startedAt` | **PASS — the bug is fixed** | `wasInsert: false`, no error. Before: `started_at: 2026-01-01T15:30:00+05:30 (=10:00 UTC), duration_seconds: 30`. After: `started_at: 2026-01-01T15:30:00+05:30` (**unchanged**), `duration_seconds: 45` (**updated**), `outcome: "resolved"` (**preserved**, not supplied) |
| 3 | Explicit null on `intent` for the same row | **PASS** | `intent` overwrites to null (distinct from omission — `duration_seconds`/`outcome` from the prior call remain untouched) |
| 4 | Genuine first insert for a never-seen `(source, interactionId)`, omitting `startedAt` | **PASS — still correctly rejected** | `ERROR: call_center_sync_interaction: startedAt is required for a new interaction` — confirms Option B's self-heal cannot smuggle a missing mandatory field past first-insert validation |
| 5 | Idempotency — same full payload submitted twice (`call-002`) | **PASS** | First call `wasInsert: true`, second `wasInsert: false`; `count(*) = 1` |
| 6 | Unidentified interaction (`customerId` omitted, `source='chat-sessions'`) | **PASS** | Inserted successfully, `customer_id: null`, `channel` correctly auto-derived to `'chat'` |
| 7 | Source CHECK constraint still rejects `'voice'` post-fix | **PASS** | `ERROR: ... violates check constraint "customer_interactions_source_check"` |
| 8 | Unauthorized access — a real `authenticated`-only login (not `service_role`) calls the RPC | **PASS** | `ERROR: permission denied for function call_center_sync_interaction` — a genuine Postgres permission-denied response |
| 9 | **Concurrency** — two near-simultaneous real connections call `call_center_sync_interaction` with the identical full payload for a brand-new `(source, interactionId)` (`concurrent-001`), fired as two background processes | **PASS — executed for real, not reasoned about** | One call returned `wasInsert: true`, the other `wasInsert: false`; `select count(*) ... = 1` — no duplicate row, no error, no deadlock. Postgres's native `ON CONFLICT` atomicity held under real concurrent load, confirming Option B's race-freedom empirically rather than just by argument |

### Not re-verified this session (unchanged from CMA-1A.2, out of this session's narrow scope)

- Application-level (TypeScript) Customer 360 query/ingestion paths —
  still not executed against this or any database; only the real
  underlying SQL/RPCs were, exactly as in CMA-1A.2.
- A true before/after row-level diff of pre-existing *production-shaped*
  data across the `customer_id`-nullability change — the disposable
  database's table state in this session began from this session's own
  test inserts, same caveat as CMA-1A.2.
- RLS policy behavior on `customer_interactions` itself — not separately
  exercised again this session (unchanged from CMA-1A.2's own disclosed
  gap).
- The `status='inactive'` population-equivalence question — unchanged,
  still documented rather than structurally enforced; out of this
  session's scope.

## 5. `npm run typecheck` and `npm run verify:full`

Both run from the repo root after the fix was applied:

- `npm run typecheck` — clean, no output (all 3 tsconfigs).
- `npm run verify:full` — exit code `0`. Every individual suite reports
  `N passed, 0 failed` (confirmed by grepping for `failed` across the full
  run, and separately confirming zero lines begin with `FAIL `). This
  includes the existing 9-assertion `cma-interaction-reconciliation-verify.mjs`
  suite unchanged (no TS-side contract changed, so no new or modified
  assertions were needed there — this session's fix is entirely inside the
  RPC's SQL body, verified by the real-Postgres execution in §4 instead).

## 6. Remaining blockers

None specific to the §4 bug — it is fixed and re-verified against real
Postgres, including under real concurrent load. The blockers that remain
are the same class CMA-1A.2 already disclosed and this session did not
re-attempt (TypeScript-level Customer 360 execution, a true before/after
diff against pre-existing production-shaped rows, RLS policy exercise) —
none of these are specific to or caused by the partial-update fix; they
are pre-existing verification gaps a future session could close if needed
before production approval, but they do not block it on their own merits
(each is either already reasoned through structurally, or already covered
transitively by the real execution evidence in §4 and in CMA-1A.2).

Nothing was committed, pushed, deployed, or applied to production. No
backfill or scheduled job was created. CMA-1B was not started. `.env`
remains at its known pre-existing, unrelated 2-line diff, untouched.
