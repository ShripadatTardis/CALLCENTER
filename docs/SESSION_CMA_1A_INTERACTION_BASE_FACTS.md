# Session CMA-1A — Interaction Base Facts Foundation

**Status: Implemented, locally verified where possible, NOT applied to production.**
This is the first real implementation session in the CMA series — everything before it
(H0/H1 Assessment v0.1, Minimal Data Model v0.1/v0.2, Data Model v0.3/v0.3.1) was read-only
design/documentation. CMA-1A implements only Part 1 ("Task 1: Interaction population and
synchronization") of `docs/CMA_SCHEMA_PROPOSAL_v0_3_1.sql`. No CMA governance table
(`cma_base_facts`, `cma_dimensions`, `cma_canonical_measures`, `cma_measures`,
`cma_measure_dimensions`, `cma_measure_base_facts`, `cma_chart_visualizations`) is created in
this session — that is explicitly out of scope (brief §7).

The migration has **not** been applied to the live Supabase project (`dtbaczafdzgctkbqviod`).
No `apply_migration` call was made. Applying it requires a separate, explicit approval.

---

## 1. Files created or modified

| File | What |
|---|---|
| `supabase/migrations/20261024000000_cma_interaction_base_facts.sql` | New. The additive migration — not applied. |
| `src/server/cma/interactionReconciliation.ts` | New. Pure reconciliation drift-math (`computeReconciliationDrift`). |
| `api/_cma.ts` | New. Underscore-prefixed helper (not a route, not wired into any endpoint) orchestrating the local RPC + the existing `fetchCompleteCallPopulation` upstream fetcher. Not imported anywhere yet. |
| `.tooling/scripts/cma-interaction-reconciliation-verify.mjs` | New. Deterministic test for the pure drift-math, same convention as every other `*-verify.mjs`. |
| `.tooling/tmp/cmaInteractionReconciliation.mjs` | New. esbuild bundle of the real compiled TS module, imported by the verify script (same pattern as `authGate.mjs`/`adminRoute.mjs`). |
| `package.json` | Modified. Appended the new verify script to the `verify:full` chain. |

Nothing else was touched. `docs/CMA_*` and `docs/MASTER_MEASURES_REGISTER.*` were read, never written. `.env`'s pre-existing, unrelated 2-line diff is confirmed unchanged (`git diff --stat -- .env` still shows exactly 2 insertions / 2 deletions).

---

## 2. Database changes prepared

Verified against the REAL live schema first (read-only, via Supabase MCP), not assumed from the v0.3.1 proposal:

- `customer_interactions.customer_id`: confirmed **`uuid NOT NULL`**, FK `customer_interactions_customer_id_fkey → call_center.customers(id)` **`ON DELETE CASCADE`**. (The v0.3.1 proposal's comments described this FK's target end-state as `ON DELETE SET NULL` but didn't re-verify what the real current action was — it is `CASCADE`, confirmed via `pg_constraint`, and is exactly what this migration changes.)
- Unique constraint `customer_interactions_source_interaction_unique UNIQUE (source, interaction_id)` — confirmed present, **untouched** by this migration.
- `fcr`, `intent_confidence`, `campaign_id`, `last_synced_at`, `ingestion_path` — confirmed **none of these columns exist yet** (`information_schema.columns`). All five newly added, additive only.
- `call_center.customer360_category_agents(agent_id text, category_id uuid)` and `call_center.campaigns(id uuid)` — confirmed to exist with the shapes the sync RPC and new `campaign_id` FK need.
- No view or materialized view depends on `customer_interactions` (`pg_depend` check returned zero rows) — the `customer_id` nullability change cannot break a view.

Migration contents, in order:
1. `ALTER COLUMN customer_id DROP NOT NULL`.
2. Drop + re-add the `customer_id` FK with `ON DELETE SET NULL` (was `ON DELETE CASCADE`).
3. Add the 5 new columns (all nullable, all additive).
4. Add `customer_interactions_source_started_at_idx` on `(source, started_at)`.
5. `call_center_sync_interaction(jsonb)` — the corrected v0.3.1 sync RPC, reproduced verbatim from `CMA_SCHEMA_PROPOSAL_v0_3_1.sql`.
6. `call_center_cma_interaction_population_count(source, from, to)` — the read-only reconciliation RPC.
7. Revoke-all + grant-to-`service_role`-only for both new functions, using the exact same loop pattern every other migration in this project uses.

---

## 3. Synchronization RPC behaviour

`call_center_sync_interaction` implements every corrected v0.3.1 semantic:

- **Idempotent upsert** on `(source, interaction_id)` — the existing unique constraint, unchanged.
- **Immutable fields** (`interaction_id`, `source`, `started_at`, `channel`, `direction`, `agent_id`, `agent_display_name`) never appear in `DO UPDATE SET` — structurally impossible for a re-sync to change them.
- **Mutable, identity-like** (`customer_id`, `contact_point_id`, `category_id`, `campaign_id`) use `coalesce(excluded.col, ci.col)` — an already-resolved identity can never be un-resolved by a later payload that didn't carry it.
- **Mutable, ordinary** (`duration_seconds`, `intent`, `outcome`, `sentiment_score`, `was_authenticated`, `escalation_trigger`, `campaign_name`, `fcr`, `intent_confidence`, `recording_available`) use `case when p_payload ? 'key' then excluded.col else ci.col end` — key absent preserves, key present (including explicit `null`) overwrites.
- **Reliable insert/update detection** via `RETURNING (xmax = 0)` — a structural Postgres guarantee, not an inferred side-effect of two timestamp columns.
- **No duplication** — the `ON CONFLICT (source, interaction_id)` target is the real existing unique constraint.
- **Restricted to server-side ingestion only** — `service_role`-only grant, revoked from `public`/`anon`/`authenticated`. Not called from any application route in this session (no polling/backfill wiring — out of scope).

### Hand-traced payload scenarios (static verification — no live Postgres instance was available; see §6)

Traced directly against the migration's actual SQL text, row by row:

**Scenario A — first sync, full payload.**
`{interactionId:'c-1', source:'voice', startedAt:'2026-01-01T00:00:00Z', channel:'voice', outcome:'resolved', durationSeconds:120, fcr:true}`
→ No existing row for `(voice, c-1)` → `INSERT` branch fires → `xmax = 0` is `true` → `wasInsert: true`. Row written with `outcome='resolved'`, `duration_seconds=120`, `fcr=true`, `ingestion_path='cma_sync'`, `last_synced_at=now()`.

**Scenario B — partial re-sync (the exact bug class v0.3.1 fixed).**
Second call: `{interactionId:'c-1', source:'voice', durationSeconds:340}` only.
→ Conflict on `(voice, c-1)` → `UPDATE` branch. `duration_seconds`: key present → `340`. `outcome`: key **absent** → `case` takes `ci.outcome` → stays `'resolved'`, not nulled. `fcr`: key absent → stays `true`. `xmax = 0` is `false` → `wasInsert: false`. This is the exact scenario the v0.3 bug would have broken (it would have nulled `outcome`/`fcr`/6 other columns here); the corrected `p_payload ? 'key'` check is confirmed, by direct trace, to preserve them.

**Scenario C — explicit null overwrite.**
Third call: `{interactionId:'c-1', source:'voice', escalationTrigger:null}`.
→ `p_payload ? 'escalationTrigger'` is `true` (key present, even though its value is JSON `null`) → `case` branch takes `excluded.escalation_trigger`, which is `NULL` → `escalation_trigger` is set to `NULL`. Confirmed distinguishable from Scenario B's omission of `outcome`.

**Scenario D — identity never regresses.**
Row currently has `customer_id = X` (resolved earlier). A later sync payload omits `customerId` entirely (`p_payload->>'customerId'` → `NULL` → `nullif('','')` path not even reached, the key is absent so the extraction is `NULL` before `excluded.customer_id` is computed) → `coalesce(excluded.customer_id, ci.customer_id)` → `coalesce(NULL, X)` → stays `X`. Confirmed an unresolved payload can never erase an already-resolved customer identity.

**Scenario E — unidentified interaction (brief's core requirement).**
`{interactionId:'c-2', source:'voice', startedAt:'2026-01-02T00:00:00Z'}` — no `customerId` at all.
→ `nullif(p_payload->>'customerId', '')::uuid` → `NULL` → `INSERT` succeeds because `customer_id` is now nullable (post-migration) → row exists with `customer_id = NULL`, `ingestion_path = 'cma_sync'`. Confirmed this row would **not** have been insertable before this migration (the column was `NOT NULL`) — this is the exact behavior change the brief's Task 1 requires.

---

## 4. Customer 360 compatibility checks

Read, in full, every real query that touches `customer_interactions` on the Customer 360 side:

- `call_center_upsert_interaction` (the existing Customer 360 ingestion RPC) — **completely untouched** by this migration. It still casts `(p_payload->>'customerId')::uuid` directly (no `nullif`), so it still implicitly requires a `customerId` in its payload exactly as it does today; its own insert-only (never update) behavior is unaffected by the new nullable column or the new `ON DELETE SET NULL` FK action. `reconcileJob.ts`/`backfillJob.ts` (the real callers, both of which explicitly skip when `resolveCustomerIdentity` returns nothing — `if (!resolved) continue;`) are **not modified**.
- `call_center_list_interactions`, `call_center_list_all_interactions`, `call_center_recompute_customer_aggregate` — all three filter with `where customer_id = p_customer_id` (equality against a specific, always-non-null parameter). **Finding, resolving v0.3.1's flagged open question empirically**: a `customer_id = <specific uuid>` equality filter can never match a `NULL` row under standard SQL three-valued logic — no explicit `customer_id IS NOT NULL` safeguard is actually necessary for any of Customer 360's real existing queries, because every one of them is already parameterized on one specific customer id, never an unfiltered scan. This directly answers v0.3.1 §7's open question #8/acceptance-test #3 for the real code (not hypothetically): **no safeguard was needed beyond what already exists**, and none was added, per the brief's "add only the minimum compatibility safeguards required."
- `src/pages/CustomerDetail.tsx` / `CustomerActivityPanel.tsx` / `ActivityComposerDialog.tsx` — all consume the above RPCs' already-filtered results; not independently re-queried.

**Conclusion**: introducing `customer_id = NULL` rows via the new `call_center_sync_interaction` path cannot change Customer 360's existing identity-resolved population, under any currently-real query. No code change was made to any Customer 360 file.

---

## 5. Tests executed and results

### 5.1 Executed against a real environment (this project's live schema, read-only)

- `information_schema.columns` for `customer_interactions` — confirmed exact current shape before writing the migration.
- `pg_constraint` for `customer_interactions` — confirmed the real FK action (`CASCADE`, not `SET NULL`), the real unique constraint name, and that no other constraint blocks the `DROP NOT NULL`.
- `pg_depend` — confirmed zero views/materialized views depend on this table.
- `pg_proc` definitions for `call_center_upsert_interaction`, `call_center_list_interactions`, `call_center_list_all_interactions`, `call_center_recompute_customer_aggregate` — read in full to verify Customer 360 compatibility (§4) against real code, not the design doc's summary.
- `customer360_category_agents`, `campaigns` — confirmed existence/shape for the new FK and category lookup.

None of these were write operations. No `apply_migration`, no DDL/DML executed against the real database.

### 5.2 Executed locally (real compiled code, no live database)

- `npm run typecheck` — **clean**, all 3 tsconfigs (`tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.api.json`), confirming `api/_cma.ts` and `src/server/cma/interactionReconciliation.ts` type-check correctly against the rest of the codebase.
- `npm run verify:full` (includes `npm run verify` → `typecheck` + `build`, plus every existing `*-verify.mjs` deterministic suite, plus the new one) — **exit code 0**, all suites green. The one `FAIL:` string in the output is the pre-existing, expected negative-test for an unknown customer theme configuration (unrelated to this session, documented in this project's own history).
- `.tooling/scripts/cma-interaction-reconciliation-verify.mjs` (new, 5 assertions) — exact match, matching-populations, local-ahead, zero-upstream, and non-zero-local/zero-upstream cases for `computeReconciliationDrift`. All pass.

### 5.3 NOT executed — explicitly unverified, reported honestly per the brief's own fallback instruction

No local Postgres/Supabase CLI instance is available in this environment (`supabase --version` → command not found). The brief's §6 list below was therefore verified by **static migration tracing** (hand-tracing the real SQL text against concrete payloads, §3 above) rather than by actually running the RPC against a database — this is NOT the same strength of evidence as an executed test, and is reported as such rather than overstated:

| Brief §6 item | How covered |
|---|---|
| Identified and unidentified interactions | Hand-traced, Scenario E above |
| First insert and repeated synchronization | Hand-traced, Scenarios A/B above |
| Changed duration, outcome, FCR and other mutable attributes | Hand-traced, Scenario B above |
| Omitted fields versus explicit nulls | Hand-traced, Scenarios B (omitted) vs C (explicit null) above |
| Immutable identifier protection | Confirmed by reading the `DO UPDATE SET` clause — the 7 immutable columns are structurally absent from it, not just absent from a test case |
| Existing Customer 360 queries and ingestion behaviour | Read all real call sites, §4 above — not executed live, but traced against real code, not the design doc's summary |
| Unauthorized RPC access | Structural: `revoke all ... from public, anon, authenticated` + `grant ... to service_role` only, the identical pattern already proven to work for every other `call_center_*` mutation RPC in this live project |
| Reconciliation count correctness | `computeReconciliationDrift`'s pure math executed and passing (§5.2); the RPC half (`call_center_cma_interaction_population_count`) and the live upstream fetch (`fetchCompleteCallPopulation`, reused unmodified from `src/server/analytics/callPopulationFetcher.ts`) were NOT executed against the real Call Data API or the real database this session |

**No fabricated "tests passed against Postgres" claim is made anywhere in this document or in code comments.** Every SQL-level claim above is either a read-only schema fact confirmed via Supabase MCP, or a hand-trace against the real SQL text — never an executed RPC call.

---

## 6. Outstanding risks or blockers

1. **The sync RPC and population-count RPC have never run against a real Postgres instance.** Hand-tracing is a reasonable substitute given this environment has no local Supabase/Postgres, but it is not the same guarantee as an executed test. If a local Supabase CLI becomes available, the single highest-value follow-up is actually running these 5 scenarios against a disposable local database before any production application.
2. **Agent transfer mid-interaction is not modeled** (`agent_id`/`agent_display_name` are immutable once set) — carried forward unresolved from `CMA_DATA_MODEL_v0_3_1.md` §7, item 11. Not addressed by this session.
3. **`api/_cma.ts` is not wired to any route or job.** It exists so a future session can wire it up; it has not been exercised against the live Call Data API or the live database. Its correctness beyond typechecking is unverified.
4. **The reconciliation capability only covers `source='voice'`.** No equivalent complete-population fetcher exists in this codebase for chat yet — chat reconciliation is out of scope for CMA-1A, not silently assumed to work.
5. **The migration has not been applied anywhere, including a staging/local copy.** Its real effect on the live 626-row-plus production table has not been observed.

## 7. Is CMA-1A ready for migration approval?

**Conditionally yes, with the caveats in §6 named explicitly.** The migration is additive only (no column dropped, no existing data rewritten, no view broken — confirmed via `pg_depend`), the one behavioral change to an existing object (`customer_id`'s FK action, `CASCADE → SET NULL`) is exactly what Task 1 requires and was verified against the real current FK definition rather than assumed, and Customer 360's real existing read/write paths were traced and found genuinely unaffected rather than assumed safe. The real gap is that nothing in this session ran against an actual Postgres instance — the SQL itself was hand-verified, not executed. Recommend: apply to a disposable/staging Supabase project first if one becomes available; if not, a careful manual `BEGIN; ... ROLLBACK;` dry run of just this migration's DDL against production (read-only in effect, since it rolls back) would close most of the remaining gap before a real apply — neither was done in this session per the explicit "do not apply without separate approval" instruction.

---

Stop after CMA-1A, per the brief. CMA-1B was not begun.

---

## CMA-1A.1 correction appendix

The user reviewed the CMA-1A migration and raised three specific concerns. This
appendix documents the investigation and the resulting corrections, revised
directly into the still-unapplied CMA-1A migration (per explicit authorization —
"you may revise the existing unapplied CMA-1A migration rather than creating an
unnecessary follow-up migration"). No new migration file was created.

### Concern 1 — source identifier consistency: CONFIRMED, fixed

**Investigation.** Queried the real live `customer_interactions` table:

```sql
select source, count(*) from call_center.customer_interactions group by source;
-- 'call-data'     614
-- 'chat-sessions'  17
```

Grepped the real ingestion code: `voiceAgentInteractionSource.ts` writes
`source: 'call-data'`, `chatInteractionSource.ts` writes `source: 'chat-sessions'`.
Neither ever writes `'voice'`.

Separately, `'voice'`/`'chat'` **do** exist as real strings in this codebase — but
as a completely different concept: `reconcileJob.ts`'s `checkpointSource` parameter
(default `'voice'`) and `customerRepository.ts`'s `getHighWaterMark`/
`setHighWaterMark(source = 'voice')` are a **job-bookkeeping checkpoint label**
("which reconciliation job's high-water-mark is this"), never the value written to
`customer_interactions.source`. `api/customers/admin.ts` confirms the split
explicitly in its own comment: chat reconciliation uses checkpoint `'chat'`
("never `'voice'`").

CMA-1A's own `api/_cma.ts` conflated these two identifier spaces — it hardcoded
`p_source: 'voice'` when calling the new population-count RPC. Since zero real
rows have `source = 'voice'`, **every real invocation of
`reconcileVoiceInteractionPopulation` would have reported `localTotal: 0` and a
permanent 100% drift, regardless of the real population.** This was a confirmed,
would-be-live bug in the read/compare path. The write path
(`call_center_sync_interaction`) was not yet exercised by any real caller, so no
duplicate interaction rows exist today — but nothing would have stopped a future
caller from writing `source: 'voice'` rows via that RPC, silently fragmenting the
`(source, interaction_id)` uniqueness key into duplicate logical interactions
alongside the real `'call-data'` rows for the same calls.

**Fix.**
1. `api/_cma.ts` now uses `CALL_DATA_SOURCE = 'call-data'` (a new, single, named
   constant exported from `interactionReconciliation.ts`) instead of the literal
   `'voice'`.
2. The migration adds a new **`customer_interactions_source_check`** constraint —
   `check (source in ('call-data', 'chat-sessions'))` — compatible with all 631
   existing rows (614 + 17), confirmed via the query above. This is the actual
   centrally-enforced guard: it prevents **any** future writer (the new sync RPC,
   or anything else) from ever introducing a row under a different identifier
   space, not just this one orchestration function.
3. The sync RPC's `channel` default was also found silently wrong for chat: it
   defaulted unconditionally to `'voice'` regardless of `source`, so a chat-sourced
   sync call that omitted `channel` would have written `channel='voice'` against a
   `chat-sessions` row (real chat rows use `channel='chat'`, confirmed live). Fixed
   to derive the default from the already-known `source` instead.

### Concern 2 — mandatory field validation: CONFIRMED, fixed

**Investigation.** `interaction_id`, `source`, `started_at`, `channel` are already
`NOT NULL` at the database level (confirmed via `information_schema.columns`), so
a genuinely missing (`NULL`) value on a first-time insert was already rejected —
but with a raw, unfriendly Postgres constraint-violation error, and critically,
**an empty string (`''`) satisfies `NOT NULL` but is not a valid identity.** A
payload like `{interactionId: '', source: 'call-data', ...}` would have inserted a
permanent junk row that can never be matched by a later, correctly-identified sync
call (it would never equal `''` + `'call-data'` again under any real upstream
identifier).

**Fix.** Added an explicit pre-check inside `call_center_sync_interaction`,
gated on `v_exists` (whether a row already matches `(source, interactionId)`):
only when **no** existing row matches — i.e., only when this call is about to be a
genuine first-time insert — does it require non-empty `interactionId`, non-empty
`source`, and a non-empty `startedAt`. A true partial-update call (one that only
needs to identify an existing interaction) is **never** newly burdened: it already
had to supply `source` + `interactionId` to reach the right row via
`ON CONFLICT`, and that's still the only requirement for it. This matches the
brief's explicit instruction not to impose mandatory fields on a partial update.

The existing presence-vs-explicit-null JSONB merge semantics (the core CMA-1A fix)
are untouched by this change — the new validation runs once, before the
`INSERT ... ON CONFLICT`, and doesn't alter the `case when p_payload ? 'key'`
merge logic at all.

### Concern 3 — reconciliation window correctness: PARTIALLY CONFIRMED, fixed

**Investigation.** Read `src/server/analytics/callPopulationFetcher.ts` in full.
Its own code comment states the real upstream Call Data API's `date_from`/
`date_to` form a **documented inclusive date-range contract** over calendar dates
(`YYYY-MM-DD`) — confirmed also by `rangeToDateWindow`'s own date-only
(`.toISOString().slice(0, 10)`) output. This is **not** a half-open interval —
it's inclusive at both ends, at calendar-day granularity.

CMA-1A's original `call_center_cma_interaction_population_count` used
`started_at <= p_started_to` (inclusive timestamptz upper bound). If a caller ever
passed a bare calendar-day value as `p_started_to` (e.g. `'2026-01-31'`, which
Postgres reads as midnight UTC), the comparison would wrongly exclude nearly all
of `2026-01-31` itself — only the single instant of exact midnight would match.
This is a genuine, confirmed off-by-one risk for exactly the kind of window a
human or a future job would naturally pass.

The user's own stated preference (`started_at >= from AND started_at < to`,
half-open) is **not a contradiction of the verified upstream contract** — it is
the correct way to *implement* "inclusive of the entire `to` calendar day" when
comparing against a precise timestamp column: the exclusive upper bound must be
set to midnight of the day **after** the inclusive `to` date, not the `to` date
itself.

Also investigated: upstream's `status=inactive` filter (only completed calls).
No equivalent status/call-state column exists on `customer_interactions` today
(confirmed via `information_schema.columns`). However, Customer 360's own voice
ingestion (`voiceAgentInteractionSource.ts`) **already** filters `status='inactive'`
identically before writing any row — so the real, existing 614 `call-data` rows
already describe an equivalent population to `fetchCompleteCallPopulation`'s own
output, **by construction of today's ingestion pipeline**, not by anything this
RPC itself enforces. This is a documented assumption, not a structural guarantee:
if a future caller ever syncs an in-progress (active) interaction via the new
`call_center_sync_interaction` RPC, the local count would start including rows
the upstream fetcher's `status='inactive'` filter would never return, and nothing
in this session's schema would catch that. Flagged, not fixed — adding a
status/call-state concept to this table is a new field beyond the approved CMA-1A
field inventory and would expand scope beyond "correct the window/filter logic of
what already exists," which the brief explicitly excludes.

**Also distinguished, per the brief's explicit request:**
- **Population-count reconciliation** — what this RPC does (and what was fixed).
- **Interaction-ID reconciliation** (which specific IDs are missing/extra) — NOT
  built, correctly out of scope; a count match can still hide an equal number of
  false-positive/false-negative IDs canceling out.
- **Changed-fact reconciliation** (detecting an existing interaction's upstream
  data changed after ingestion) — NOT built, correctly out of scope; CMA-1A's own
  `last_synced_at` column is a prerequisite for this but does not itself perform
  it.

**Fix.**
1. `call_center_cma_interaction_population_count`'s `p_started_to` is now an
   **exclusive** upper bound (`started_at < p_started_to`), matching the user's
   stated preference and correctly implementing upstream's verified inclusive
   calendar-date semantics.
2. New pure function `computeInclusiveDateWindowBounds(dateFrom, dateTo)` in
   `interactionReconciliation.ts` performs the inclusive-calendar-date →
   exclusive-timestamp translation (`dateTo` → midnight of the day after, via
   native `Date` UTC arithmetic, correctly handling month/year rollover). 3 new
   deterministic tests cover a single-day window, a multi-day window, and a
   month-end rollover.
3. `api/_cma.ts`'s `reconcileVoiceInteractionPopulation` now takes `dateFrom`/
   `dateTo` (calendar dates, matching the upstream fetcher's own real contract)
   instead of raw timestamp strings, and calls
   `computeInclusiveDateWindowBounds` before querying the local RPC — so both
   halves of the comparison now describe the same population for the same
   requested window.

### Exact files changed in this correction pass

| File | Change |
|---|---|
| `supabase/migrations/20261024000000_cma_interaction_base_facts.sql` | Revised in place (still unapplied). Added `customer_interactions_source_check`; added insert-only identity/startedAt validation in `call_center_sync_interaction`; source-aware `channel` default; `p_started_to` changed from inclusive to exclusive in `call_center_cma_interaction_population_count`. Correction rationale documented inline. |
| `src/server/cma/interactionReconciliation.ts` | Added `CALL_DATA_SOURCE` constant and `computeInclusiveDateWindowBounds()`. |
| `api/_cma.ts` | `reconcileVoiceInteractionPopulation` now takes calendar dates, uses `CALL_DATA_SOURCE`, calls `computeInclusiveDateWindowBounds`. |
| `.tooling/scripts/cma-interaction-reconciliation-verify.mjs` | Updated existing assertions to use `CALL_DATA_SOURCE`; added 4 new assertions (the source-constant regression guard + 3 for the date-window fix). |
| `.tooling/tmp/cmaInteractionReconciliation.mjs` | Regenerated esbuild bundle from the updated source. |
| `docs/SESSION_CMA_1A_INTERACTION_BASE_FACTS.md` | This appendix. |

No other file was touched. `.env`'s pre-existing, unrelated 2-line diff is
unchanged (confirmed via `git diff --stat -- .env`). No CMA design document
(`docs/CMA_*`) or the Measures Register was modified.

### Tests performed and results

- `npm run typecheck` — clean, all 3 tsconfigs.
- `npm run verify:full` — exit code 0. All existing suites green; the single
  `FAIL:` string is the same pre-existing, expected negative-test for an unknown
  customer theme configuration (unrelated to this session).
- `.tooling/scripts/cma-interaction-reconciliation-verify.mjs` — 9/9 assertions
  pass (5 original + 4 new: the `CALL_DATA_SOURCE` regression guard and 3
  `computeInclusiveDateWindowBounds` cases).
- **Not executed**: as in CMA-1A itself, no local Postgres/Supabase CLI is
  available in this environment (`supabase --version` → command not found). The
  corrected SQL (the new CHECK constraint, the insert-validation guard, the
  exclusive upper bound) was verified by **static/structural reading and
  hand-tracing against the real migration text and the real live schema**, not by
  executing it against any database. This is reported honestly, consistent with
  how CMA-1A's own original session handled the same constraint — no claim of an
  executed database test is made for SQL that never ran against Postgres.

### Remaining migration blockers

Unchanged from CMA-1A's own §6: the sync RPC and population-count RPC have never
run against a real Postgres instance; agent-transfer mid-interaction remains
unmodeled; `api/_cma.ts` is still unwired to any route/job; reconciliation still
only covers `source='call-data'` (chat has no equivalent upstream complete-population
fetcher yet); the migration has not been applied anywhere, including staging. One
new, explicitly flagged item from this pass: the local-vs-upstream "completed
calls only" population equivalence is a documented assumption, not a structurally
enforced one — adding a status/call-state field to close that gap would be new
field-inventory scope, not something this correction pass added.

**Is CMA-1A (as corrected by CMA-1A.1) ready for migration approval?** Same
conditional "yes" as CMA-1A's own assessment, strengthened by this pass: all three
raised concerns were investigated against real evidence (not assumed), two
confirmed as real bugs and fixed, one confirmed as a real off-by-one risk and
fixed, and the one genuinely out-of-scope sub-finding (status-equivalence) was
honestly flagged rather than silently left or over-engineered around. The
remaining gap is unchanged: nothing has run against an actual Postgres instance.
Recommend the same next step CMA-1A itself recommended — a staging apply or a
`BEGIN/ROLLBACK` dry run against production — before any real application.
