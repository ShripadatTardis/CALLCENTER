# Session — CMA Synchronization: Manual UI Control

Replaces the originally-planned 5-minute Vercel Cron polling (CMA-1B.3
Step 5), which was abandoned after this Vercel team's plan was confirmed
via `vercel teams ls` to be **Hobby** — a plan that only supports
once-daily cron, too coarse for the intended CMA freshness. This session
adds an admin-UI-triggered manual "Sync Now" control instead, backed by
a persisted run log so status and history survive page reloads and are
visible from any browser session.

All writes continue to flow ONLY through the already-proven,
already-applied `call_center_sync_interaction` RPC, invoked via the
already-committed `syncCallWindow`/`syncChatWindow`/`runCmaPollingTick`
(CMA-1B/1B.1). Nothing here introduces a second write path to
`customer_interactions` — only a log of when/how those existing
functions were invoked from the UI.

## Files created / modified

**New:**
- `supabase/migrations/20261026000000_cma_sync_run_tracking.sql` — **not applied to production**; left for the coordinator to review and apply.
- `src/server/cma/cmaSyncRun.ts` — `computeManualSyncWindow`, `classifySyncOutcome`, `runManualCmaSync`.
- `src/services/cma/cmaSyncService.ts`, `src/hooks/cma/useCmaSync.ts` — frontend service/React Query hook layer.
- `src/lib/cmaSyncStatusBadge.ts` — status→token-class map, same convention as `automatedQaStatusBadge.ts`.
- `src/components/cma/CmaSyncPanel.tsx` — the UI card (status, counts, Sync Now, lookback override, last-10-runs history table).
- `.tooling/scripts/cma-sync-run-verify.mjs` + `.tooling/tmp/cmaSyncRun.mjs` (esbuild bundle, same convention as every other `*-verify.mjs`).
- This document.

**Modified:**
- `api/admin.ts` — new `?resource=cmaSync` (`GET` status/history, `POST ?action=start`), import of `runManualCmaSync`.
- `src/pages/Settings.tsx` — `CmaSyncPanel` added to the Security tab, gated on `user.permissions.includes('cma.sync.manage')`.
- `package.json` — `verify:full` gains the new script.

Nothing was committed, pushed, or deployed. `.env` still shows only its
known, pre-existing 2-line diff.

## Authorization — why `api/admin.ts` + `requirePermission`, not `requireAdminToken`

The existing CMA actions (`cmaPoll`, `cmaSyncCallsWindow`,
`cmaSyncChatsWindow`, etc., in `api/customers/admin.ts`) are gated by
`requireAdminToken` — a server-to-server shared secret (`X-Admin-Token`).
That mechanism is correct for a cron/operator-triggered call, but a
browser "Sync Now" button cannot use it: the secret would have to be
embedded in client-shipped code, defeating its purpose as a secret.

`api/admin.ts` already hosts every other real, session-authenticated,
permission-gated admin surface in this app (`?resource=actions`,
`?resource=roles`, `?resource=qa`, etc.) via `requirePermission(req, res,
'<permission.key>')` — real Supabase-Auth-JWT-backed, app-owned RBAC
(Session 14.1/14.3), the same mechanism Action Required's
`actions.view`/`.assign`/`.resolve` already use safely in production.
The new `?resource=cmaSync` handlers follow that exact pattern, gated by
a new permission, `cma.sync.manage`, seeded into `role_permissions` for
`administrator` only (per the brief's "Restrict synchronization controls
to authorized administrators" — no broader grant was added without
explicit instruction). This keeps the existing CMA actions and their
shared-secret mechanism completely untouched.

`runManualCmaSync` (and therefore the new RPCs it calls) are invoked
with the service-role Supabase client, same as every other `api/admin.ts`
handler — the permission check happens at the HTTP layer
(`requirePermission`), not by granting the browser-facing RPCs to
`authenticated`. The RPCs themselves remain `service_role`-only, with a
real `permission denied` proven for `authenticated`/`anon` (see Tests).

## Concurrency control

A partial unique index is the mechanism:

```sql
create unique index cma_sync_runs_one_running_idx
  on call_center.cma_sync_runs (status)
  where status = 'running';
```

At most one `running` row can ever exist, enforced by Postgres at the
index level inside the single `INSERT` statement itself —
`call_center_cma_sync_runs_start` catches the resulting
`unique_violation` and returns `{alreadyRunning: true, runId: <existing>}`
rather than erroring. This was chosen over a `SELECT ... FOR UPDATE` +
application-level check specifically because a two-statement
check-then-insert has a real TOCTOU gap under concurrent requests — two
callers could both pass the `SELECT` before either `INSERT`s. A single
`INSERT` that can violate a unique index has no such gap: the database
itself is the lock. Proven for real (see Tests): two sequential starts
while one run was genuinely `running` returned the identical existing
`runId` both times, and `cma_sync_runs` never grew past one `running` row.

## Default lookback and overlap

`computeManualSyncWindow(lastSuccessfulSyncFinishedAt, explicitLookbackHours, now, overlapMs)`:

1. **Explicit lookback given** → `[now - explicitLookbackHours, now)`. Always wins, even if a prior successful run exists — this is the brief's "configurable lookback period for initial synchronization or recovery."
2. **No explicit lookback, a prior successful run exists** → `[lastSuccessfulSync.finishedAt - 20min overlap, now)`. The 20-minute overlap exists for the same reason `runCmaPollingTick`'s own rolling window is wider than its polling interval: a record whose relevant timestamp landed just before the previous run's window closed must still be re-covered on the next click, not missed at the boundary.
3. **No explicit lookback, never run successfully before (`Never Run`)** → falls back to a 24-hour initial window (matching `CMA_POLLING_ROLLING_WINDOW_MS`'s own documented default) — a sensible first-sync default, not a replacement for the explicit-override path, which remains available.

`runManualCmaSync` computes this window, then converts it to a plain
`rollingWindowMs` and calls the EXISTING `runCmaPollingTick(supabase,
rollingWindowMs, now)` — no duplicate window/pagination logic. Per-source
counts (`calls`/`chats` × `processed`/`inserted`/`updated`/`failed`) come
straight from `CmaPollingTickResult.call`/`.chat`, which already carry
them.

`classifySyncOutcome`: zero failures across both sources → `success`;
some records synced and some failed → `partial`; zero records synced and
at least one failure → `failed`. An exception thrown before any sync
attempt completes (e.g. upstream unreachable) is always recorded
`failed` with `error_detail` set to the caught error's message — handled
by the caller (`runManualCmaSync`'s `try/catch`), not by
`classifySyncOutcome` itself, which only ever receives a tick that did
complete.

## Migration (not applied — contents for review)

See `supabase/migrations/20261026000000_cma_sync_run_tracking.sql` in
full. Summary: one new table, `call_center.cma_sync_runs` (run id,
`triggered_by` → `user_profiles`, status, started/finished timestamps,
window bounds, lookback mode, per-source processed/inserted/updated/
failed counts, nullable error detail), the concurrency index above, one
new permission (`cma.sync.manage`, pillar `Operationalize`, granted to
`administrator`), and four `security definer` RPCs
(`call_center_cma_sync_runs_start/_complete/_to_json/_list`), all
`revoke`d from `public`/`anon`/`authenticated` and `grant`ed only to
`service_role` — same convention as every prior CMA/14.x/15 migration in
this repo. This is an operational run-log table only; it adds nothing
from the CMA v0.3.1 governance/calculation design (`cma_base_facts`,
`cma_dimensions`, `cma_canonical_measures`, etc.).

## Tests performed — real vs. static, explicitly distinguished

**Deterministic (`cma-sync-run-verify.mjs`, 16/16 passing, via esbuild on
the real compiled source):** `computeManualSyncWindow`'s three branches
(since-last-success-with-overlap, explicit-override-wins-even-with-a-
prior-success, never-run-defaults-to-24h) plus an explicit-lookback-of-0
edge case (must be honored, not treated as "no override" via a loose
falsy check); `classifySyncOutcome`'s three transitions plus the
"nothing in the window, zero failures" case (must read as `success`,
never a false `failed`); and four assertions reading the REAL
`api/admin.ts` source text to confirm `handleCmaSyncGet`/`Post` actually
call `requirePermission('cma.sync.manage')` and that the dispatcher/
`runManualCmaSync` wiring is really present — not reimplemented
assumptions about what the file contains.

**Real, against a disposable local PostgreSQL 17.5 instance** (same
approach as CMA-1A.2/1A.3/CMA-1B: a fresh cluster, minimal Supabase
prerequisites stubbed, all 52 real migration files replayed in order —
the same two pre-existing, already-documented migration-drift failures
from CMA-1A.2 reproduced and were not caused by this migration; this
migration itself applied cleanly — then the cluster was stopped and
deleted):
- Table, concurrency index, permission row, and `role_permissions` grant all created exactly as designed (verified via `\d`, `pg_indexes`, direct `SELECT`).
- `call_center_cma_sync_runs_start` for a real seeded user: first call returns a real new `runId`.
- **Concurrency, proven not reasoned**: a second `start` call while the first run was still `running` returned `{alreadyRunning: true, runId: <the same id>}`, and `cma_sync_runs` never held more than one row at that point (`select count(*) ... group by status` confirmed exactly one `running` row, zero duplicates).
- `call_center_cma_sync_runs_complete` correctly updated status/counts/`finished_at`.
- A new `start` call succeeded immediately after the previous run completed (the lock released correctly, not stuck).
- `call_center_cma_sync_runs_list` returned both runs, most recent first, in the exact JSON shape the frontend TypeScript types expect.
- **Unauthorized role, proven not asserted**: `SET ROLE authenticated; SELECT call_center_cma_sync_runs_list(10);` returned a genuine `ERROR: permission denied for function call_center_cma_sync_runs_list`.
- Audit trail: exactly the 3 expected `cma_sync.run_started`/`cma_sync.run_completed` rows were present in `call_center.audit_events`, correctly attributed to the real test user.

**Real, against the live local `dev:vercel` server** (real `/api/*`
Vercel Function runtime, not plain Vite): started the real dev server,
confirmed `GET /api/admin?resource=cmaSync` returns a genuine `HTTP 401`
with no bearer token — proving the route is live, reachable, and
actually enforces authentication at the HTTP layer, not just inside a
unit test.

**NOT verified end-to-end (disclosed, not worked around):** a real
logged-in-Administrator browser session exercising "Sync Now" against
the live production database. Two legitimate blockers, both respected
rather than bypassed:
1. No real Administrator login credentials are known/available in this
   environment, and minting one (creating a new auth user, or reading/
   setting an existing user's password) would itself be an out-of-scope
   production write this directive did not authorize.
2. The new migration is deliberately **not applied to production** per
   explicit instruction — the real `cma_sync_runs` table and RPCs do not
   yet exist there, so there is nothing yet to call end-to-end against
   production even with credentials.

Once the coordinator applies the migration and the admin UI is deployed,
a real Administrator can complete this exact gap in under a minute by
clicking "Sync Now" once and reloading the page — everything underneath
that click has already been proven for real at the database and
HTTP-routing layers; only the "a human is actually logged in and
clicking" layer remains unexercised.

`npm run typecheck` and `npm run verify:full`: both clean, exit 0 (only
the same pre-existing, expected, unrelated `FAIL:` line for an unknown
customer theme configuration).

## Limitations / follow-ups

- The live production end-to-end gap above.
- `CmaSyncPanel` polls the status endpoint every 3s only while the
  latest run is `running` — a UI refresh, not a new backend scheduler;
  it stops polling the moment the run finishes or on `Never Run`.
- No `Dismissed`/retry-individual-failure UI was added for partial runs
  — `error_detail`/per-source failed counts are surfaced, but retrying
  just the failed subset isn't a feature here; re-running "Sync Now"
  with the same default window naturally re-attempts anything still
  missing, since every write is idempotent.
- The four existing Vercel Cron entries in `vercel.json` are untouched;
  no cron entry was added for this feature, per the brief.
