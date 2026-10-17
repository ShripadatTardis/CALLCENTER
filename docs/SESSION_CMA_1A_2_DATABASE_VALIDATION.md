# Session CMA-1A.2 — Database Validation

Continues CMA-1A (implementation) and CMA-1A.1 (corrections). Both of those
sessions explicitly reported that no local Postgres/Supabase instance was
available and fell back to static/structural verification only. This
session re-checked that assumption, found it no longer held, and executed
the actual migration and RPCs against a real, disposable PostgreSQL 17.5
instance.

**The production Supabase project (`dtbaczafdzgctkbqviod`) was never
written to.** Read-only inspection of its real schema/data (via the
Supabase MCP tools) was used only where noted; every write, insert, and
DDL statement in this session ran exclusively against the disposable local
database described below, which was deleted at the end of the session.

## 1. Disposable environment used

- No Docker, no Supabase CLI were available in this environment.
- A real, standalone PostgreSQL 17.5 install **was** found at
  `C:\Software\PostgreSQL\17\bin` (`initdb`/`pg_ctl`/`psql` all present).
- A fresh disposable cluster was initialized with `initdb` into a scratch
  directory and started on `127.0.0.1:55432` (isolated from any system
  Postgres instance, if one exists).
- Supabase-equivalent prerequisites were created by hand, since this is
  plain Postgres, not the Supabase platform: roles `anon`/`authenticated`/
  `service_role` (`NOLOGIN`), a `supabase_realtime` publication (migrations
  reference it via `ALTER PUBLICATION ... ADD TABLE`), and a minimal `auth`
  schema stub (`auth.users` table + `auth.uid()` function returning null)
  since 3 migrations reference `auth.uid()` in RLS policies. These stubs
  are a reasonable, disclosed approximation of the real Supabase platform,
  not a byte-for-byte reproduction of its `auth` schema internals — good
  enough to let dependent DDL apply and RLS policies parse, not to
  validate Supabase Auth's own behavior (out of scope here).
- **All 50 files under `supabase/migrations/` were replayed in order**
  against this disposable database — not just the CMA-1A file in
  isolation — so the schema CMA-1A's migration was tested against
  genuinely matches production's real accumulated structure, not a
  guessed subset.
- The disposable cluster and its data directory were stopped and deleted
  before this session ended. Nothing was left running.

## 2. A genuine, pre-existing migration-ordering defect found (not CMA's)

Replaying the full history strictly in filename order failed at
`20261004041341_call_center_enable_rls_remediation.sql`, which runs
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` against `call_center.customer_activities`
and `call_center.campaign_classifications` — both created by **later**
migrations (`20261005000000` and `20261011000000` respectively). This file
contains zero `CREATE TABLE` statements and zero data writes — it is
purely idempotent `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` calls, so
its position relative to the tables it targets has no functional
dependency on order, only on timing. It was deferred to the end of the
replay (after every table it could possibly touch exists) rather than run
in strict filename order, and applied cleanly there. This is consistent
with this project's own previously-disclosed "migration-drift" finding
(the real Supabase project's applied history does not strictly match the
`supabase/migrations/` file timestamp order) — a pre-existing environmental
fact, not something CMA-1A/1A.1/1A.2 introduced, and out of this session's
scope to fix beyond working around it for this replay.

## 3. A real, confirmed bug found in CMA-1A/1A.1's plpgsql — fixed to unblock validation

**`call_center_sync_interaction`'s `RETURNING ... INTO` clause failed
outright against real Postgres 17**, on the very first execution attempt:

```
ERROR:  "v_row" is not a scalar variable
LINE 111:   returning (xmax = 0), ci.* into v_was_insert, v_row;
```

Root cause, confirmed with an isolated minimal repro against the real
disposable database (not guessed): PL/pgSQL's multi-target `INTO` clause
cannot mix a row/record target with a scalar target in the same list —
`(xmax = 0)` is a scalar, and `ci.*` (or the whole-row `ci`) is a row —
Postgres rejects both forms identically. Static/hand-traced verification
in CMA-1A and CMA-1A.1 could not have caught this: it is a real execution-
time PL/pgSQL restriction, not something visible from reading the SQL
text.

**Fix applied directly to the existing, still-unapplied migration file**
(`supabase/migrations/20261024000000_cma_interaction_base_facts.sql`),
since it has never been applied anywhere and per CMA-1A's own precedent of
revising in place rather than creating a follow-up migration for an
unapplied file: collect everything into a single `record` target instead
(`was_insert` becomes an ordinary named column on that record, not a
separate variable), then unpack it:

```sql
declare
  v_row record;  -- was: call_center.customer_interactions
  ...
...
  returning (xmax = 0) as was_insert, ci.* into v_row;
  v_was_insert := v_row.was_insert;
  return jsonb_build_object('interaction', to_jsonb(v_row) - 'was_insert', 'wasInsert', v_was_insert);
```

Verified against the real database — the function now executes correctly
end-to-end (see §5).

This exception to "report, don't silently fix" was deliberate and
consistent with the CMA-1A.2 brief's own carve-out ("if it's trivially one
line and directly blocks completing the validation itself, use your
judgment"): the RPC could not be executed at all without this fix, and the
fix is narrowly scoped to the broken `INTO` clause only — nothing else in
the function's logic, validation rules, or merge semantics was touched.

## 4. A second real, confirmed bug found — NOT fixed, reported

**A partial-update call on an EXISTING row still fails if it omits
`startedAt`, even though CMA-1A.1's own pre-check correctly determines the
call is NOT a first-time insert and does not raise its explicit
validation error.**

Reproduced directly: `call-001` was inserted successfully via a full
payload. A second call with only `{"interactionId":"call-001",
"source":"call-data","durationSeconds":45}` (explicitly NOT supplying
`startedAt`, exactly the partial-update shape the brief requires to
succeed) failed:

```
ERROR:  null value in column "started_at" of relation "customer_interactions"
violates not-null constraint
```

**Root cause**: the function always executes a single
`INSERT ... VALUES (...) ON CONFLICT (source, interaction_id) DO UPDATE ...`
statement. Postgres constructs and validates the full candidate `VALUES`
tuple — including every `NOT NULL` constraint on columns in that tuple —
**before** it ever resolves whether `ON CONFLICT` applies. Since
`started_at` and `channel` are `NOT NULL` columns, and the `VALUES` clause
always includes `(p_payload->>'startedAt')::timestamptz` (which evaluates
to `NULL` when the key is omitted), the insert-candidate row fails its own
`NOT NULL` constraint immediately, regardless of whether a matching row
already exists to conflict with. CMA-1A.1's `v_exists` pre-check correctly
suppresses the function's own explicit `raise exception` for this case,
but it cannot prevent Postgres's own constraint check on the `INSERT`'s
candidate row.

**This is a real violation of the brief's own explicit requirement**: "Do
not impose mandatory fields on partial updates that only need to identify
an existing interaction." Today, a partial update on an existing row MUST
still supply `startedAt` and (implicitly, via the `COALESCE` default) a
derivable `channel`, even though neither should be required once the row
already exists.

**Not fixed in this session** — per the brief's own scope ("this is
validation only," "report... for a future session"), and because a
correct fix is not a one-line change: the two `NOT NULL` columns involved
(`started_at`, `channel`) need their `VALUES` expressions to fall back to
the existing row's value on a known-update path (e.g. a correlated
`COALESCE(..., (SELECT started_at FROM call_center.customer_interactions
WHERE source = v_source AND interaction_id = v_interaction_id))` for each,
or restructuring the function into an explicit `UPDATE ... IF FOUND ...
ELSE INSERT ...` two-branch form) — a real design choice, not a
mechanical fix, and appropriately left for a dedicated correction pass.

**Workaround used for the remainder of this session's own test
scenarios**: every partial-update test payload below includes `startedAt`
matching the row's actual value, so the `NOT NULL` tuple-construction
issue doesn't block testing the fields this bug does NOT affect (ordinary
mutable columns, which were separately and successfully verified to
honor the intended omitted-vs-explicit-null semantics).

## 5. Verification results — executed against a real disposable Postgres instance

All of the following were executed as real SQL calls against the
disposable database described in §1, after the full 50-migration history
(including the one-line fix in §3) applied cleanly end-to-end. None of
this is static/hand-traced — every result below is a real Postgres
response.

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1a | Source CHECK constraint rejects `'voice'` | **PASS** | `ERROR: ... violates check constraint "customer_interactions_source_check"` |
| 1b | Source CHECK constraint accepts `'call-data'` | **PASS** | Row inserted, `wasInsert: true` |
| 1c | Source CHECK constraint accepts `'chat-sessions'`; `channel` auto-derives to `'chat'` (not the old hardcoded `'voice'` default) | **PASS** | Row shows `source: "chat-sessions", channel: "chat"` |
| 2 | Mandatory-field validation on genuine first insert (missing `startedAt`) | **PASS** | `ERROR: call_center_sync_interaction: startedAt is required for a new interaction` |
| 2b | Empty-string `interactionId` rejected on a genuine first insert | **PASS** | `ERROR: call_center_sync_interaction: interactionId is required for a new interaction` |
| 2c | Partial update on an existing row, omitting `startedAt` | **FAIL — real bug, §4** | `ERROR: null value in column "started_at" ... violates not-null constraint` |
| 2c-workaround | Partial update on an existing row (with `startedAt` supplied to work around §4): omitted `outcome` preserved, explicit `intent: null` overwrites | **PASS** | Before: `duration_seconds: 30, outcome: "resolved"`. After: `duration_seconds: 45` (updated), `outcome: "resolved"` (preserved, not supplied), `intent: null` (explicitly supplied, overwritten from its prior `null`/unset state — confirmed via the `p_payload ? 'key'` presence branch) |
| 4 | Idempotency — same payload submitted twice | **PASS** | Second call returns `wasInsert: false`; `select count(*) ... = 1` |
| 5 | Unidentified interaction (`customer_id` omitted) inserts successfully | **PASS** | Row inserted with `customer_id: null` |
| 6 | Immutable field protection — a later sync call supplying a different `startedAt` for the same `(source, interactionId)` does not change the stored value | **PASS** | `started_at` unchanged across the second call (column is structurally absent from the `ON CONFLICT ... DO UPDATE SET` list) |
| 7a | Reconciliation half-open window `[2026-01-01, 2026-01-02)` for `source='call-data'` | **PASS** | `totalRows: 1` (only the row actually started on 2026-01-01; the 2026-01-02 row correctly excluded) |
| 7b | Reconciliation window widened to `[2026-01-01, 2026-01-03)` | **PASS** | `totalRows: 2` (both rows now included) |
| 8 | Grants — only `postgres` (owner) and `service_role` hold `EXECUTE` | **PASS** | `information_schema.routine_privileges` shows exactly those two grantees for both functions |
| 8b | A real, non-`service_role` login role (`cma_test_authenticated_user`, granted `authenticated`) attempts to call `call_center_sync_interaction` | **PASS** | `ERROR: permission denied for function call_center_sync_interaction` — a genuine Postgres permission-denied response, not inferred from grants alone |
| 9 | Customer 360 compatibility — `call_center_list_all_interactions` for a real customer, against a mix of one resolved-identity row and three `customer_id = NULL` CMA-sync rows | **PASS** | Returns exactly the one resolved row; all three null-identity rows correctly excluded (SQL `customer_id = p_customer_id` can never match `NULL` — CMA-1A.1's own reasoning now independently confirmed by real execution, not just by reading the query) |
| — | Clean apply / no unexpected modification | **PASS (via full-history replay)** | All 50 migrations, including the fixed CMA-1A file, applied in sequence with zero unexpected errors (beyond the two genuine findings in §2 and §3, both resolved for this replay); `ALTER COLUMN ... DROP NOT NULL` and `ADD COLUMN IF NOT EXISTS` are well-defined, non-data-mutating DDL operations in Postgres — confirmed structurally, not separately re-verified with a before/after data diff since no pre-CMA legacy rows existed in this disposable database before the migration ran (the full-history replay created the table via the CMA-era schema directly; a true before/after diff against pre-existing data was not performed — see Not Verified below) |

### Not verified

- **Application-level (TypeScript) Customer 360 query/ingestion paths**
  were not executed — only the real underlying SQL/RPCs were. `src/server/customer360/*`
  was read to confirm which RPCs it calls, but running the actual
  TypeScript code against this disposable database (pointing the app's
  real config at a non-Supabase Postgres instance) was not attempted in
  the time available. This is a real, disclosed gap, not an oversight.
- **A true before/after row-level diff of pre-existing production-shaped
  data** across the `customer_id`-nullability change was not performed —
  the disposable database's `customer_interactions` table was empty until
  this session's own test inserts, since the full migration history was
  replayed as one continuous sequence (table and its final CMA-1A shape
  both came into existence together). The DDL operations involved
  (`ALTER COLUMN DROP NOT NULL`, `ADD COLUMN IF NOT EXISTS` with no
  `DEFAULT`) are well-understood, non-data-mutating Postgres operations,
  and this was confirmed structurally, but a direct empirical diff against
  realistic pre-existing rows was not additionally performed.
- **RLS policy behavior** on `customer_interactions` itself was not
  separately exercised (the table has RLS enabled with no policies, per
  the project's own deny-all-plus-`security definer`-RPC convention,
  confirmed by inspection, not by attempting a direct unauthorized
  `SELECT`).
- The `status='inactive'` population-equivalence question CMA-1A.1 already
  flagged as "documented, not structurally enforced" remains exactly that
  — this session did not change or further investigate it.

## 6. Verdict

**The migration is NOT yet ready for unconditional production approval.**

What changed in this session's favor: the migration now applies cleanly
against a real PostgreSQL 17 instance loaded with the real, full migration
history; the `RETURNING ... INTO` bug that would have made
`call_center_sync_interaction` fail on every single real invocation is
found and fixed; every other documented CMA-1A/1A.1 semantic (source
validation, mandatory-field-on-insert-only, idempotency, immutability,
unidentified-interaction support, reconciliation window correctness,
service-role-only enforcement, Customer 360 non-interference) is now
confirmed by real execution, not just static reasoning.

What still blocks unconditional approval: §4's partial-update `NOT NULL`
bug is real, reproducible, and directly contradicts an explicit
requirement in both the original CMA-1A brief and this validation
session's own brief. A caller that tries to do exactly the kind of
narrow, identify-and-update-one-field partial sync the whole mutable/
immutable field design exists to support — e.g. updating only
`durationSeconds` on a call still in progress — will fail today unless it
also happens to resupply `startedAt`. This is very likely to be hit by
any real ingestion/polling caller (CMA-1A's own scope explicitly excludes
building that caller yet, which is likely why this was not caught
earlier).

**Recommendation**: fix §4 in a dedicated CMA-1A.3 (or equivalent)
correction session — scoped narrowly to the `VALUES` tuple construction
for the two `NOT NULL` columns affected — then re-run this same
executed-against-real-Postgres validation pass once more before
requesting production approval. The §3 fix is already incorporated into
the existing unapplied migration file and does not need a separate pass.

Nothing was committed, pushed, deployed, or applied to production. No
backfill or scheduled job was created. CMA-1B was not started. `.env`
remains at its known pre-existing, unrelated 2-line diff, untouched.
