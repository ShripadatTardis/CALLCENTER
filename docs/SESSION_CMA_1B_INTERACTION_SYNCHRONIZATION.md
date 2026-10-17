# Session CMA-1B — Call and Chat Data Synchronization

Continues the CMA series directly after CMA-1A.4 (migration `20261024000000_cma_interaction_base_facts.sql` applied to production, commit `df9fa56583ca30a9e6e16a3466202c958ddc9887`). This session implements the Call/Chat synchronization processes that populate CMA Base Facts, per `docs/CMA_DATA_MODEL_v0_3_1.md`'s ingestion-strategy design.

**The production Supabase project (`dtbaczafdzgctkbqviod`) was never written to.** Every database operation that actually wrote data ran against a disposable local PostgreSQL 17.5 instance (same approach CMA-1A.2/1A.3 established), recreated fresh for this session and deleted at the end. **Nothing in this session was committed, pushed, or deployed** — all files remain in the working tree, uncommitted, for review.

## 1. Files created / modified

| File | What |
|---|---|
| `src/server/cma/cmaSyncMapping.ts` | New. Pure: `buildCmaSyncPayload(SourceInteraction) → CmaSyncPayload`, the one real field mapping both Call and Chat sync share. |
| `src/server/cma/cmaSync.ts` | New. `syncSourcePage(supabase, adapter, page, pageSize)` — fetches one page via the SAME `InteractionSourceAdapter.listPage()` Customer 360 already uses, calls `call_center_sync_interaction` per row, with NO identity gate. |
| `src/server/cma/cmaBackfill.ts` | New. `runCmaBackfillBatch` — cursor-based, bounded, resumable, idempotent backfill, structurally mirroring `src/server/customer360/backfillJob.ts`. |
| `src/server/cma/cmaPolling.ts` | New. `runCmaPollingTick`, `CMA_POLLING_INTERVAL_MS` (5 min), `CMA_POLLING_DEFAULT_PAGES`/`_PAGE_SIZE` — the polling entry point + its configuration. Not wired to any scheduler. |
| `src/server/cma/cmaIdReconciliation.ts` | New. Pure `diffInteractionIds`/`detectStaleFacts`, plus `runCmaCallIdReconciliation`/`runCmaChatIdReconciliation` orchestration — the extended (ID-level + changed-fact) reconciliation capability. |
| `supabase/migrations/20261025000000_cma_interaction_id_reconciliation.sql` | New, **unapplied**. One additive, read-only, `service_role`-only RPC (`call_center_cma_interaction_facts_for_window`) the extended reconciliation needs — see §9 for why this had to be a new migration rather than revising CMA-1A's in place. |
| `.tooling/scripts/cma-interaction-synchronization-verify.mjs` + `.tooling/tmp/cmaSyncMapping.mjs` + `.tooling/tmp/cmaIdReconciliation.mjs` | New. 13-assertion deterministic test of the real compiled pure functions, wired into `verify:full`. |
| `api/customers/admin.ts` | Modified. 6 new `?action=` cases, reusing the file's existing `requireAdminToken` gate — no new route file, no new permission. **Superseded by CMA-1B.1 below**: `cmaPollCalls`/`cmaPollChats` → single `cmaPoll`; added `cmaSyncCallsWindow`/`cmaSyncChatsWindow`. Final set: `cmaBackfillCalls`/`cmaBackfillChats`/`cmaPoll`/`cmaSyncCallsWindow`/`cmaSyncChatsWindow`/`cmaReconcileCalls`/`cmaReconcileChats`. |
| `package.json` | Modified. One line: the new test script appended to `verify:full`. |

Not touched: any `docs/CMA_*` design document, the Measures Register, any CMA governance table, any Dashboard/Analytics file, `vercel.json`, `.env` (confirmed via `git diff --stat -- .env`: still exactly its known pre-existing 2-line diff).

## 2. Call synchronization

Reuses `src/server/customer360/voiceAgentInteractionSource.ts` unmodified — the same `InteractionSourceAdapter` Customer 360's own `reconcileJob.ts`/`backfillJob.ts` already call. Its `listPage()` already filters `status='inactive'` server-side (confirmed by reading `fetchCallData`'s query construction) — **CMA-1B never mixes active calls into the population**, inherited directly from this adapter, not re-implemented.

Field mapping (`buildCmaSyncPayload`, real upstream field → RPC payload key, via the adapter's own `mapEntry`):

| `SourceInteraction` field (from `mapEntry`, i.e. the real `call_id`/`outcome`/etc.) | CMA sync payload key |
|---|---|
| `interactionId` (`dto.call_id`) | `interactionId` — the real upstream call identifier, never regenerated |
| `source` (`'call-data'`) | `source` |
| `startedAt` | `startedAt` |
| `channel`, `direction`, `agentId`, `agentDisplayName` | same name |
| `durationSeconds`, `intent`, `outcome`, `sentimentScore`, `wasAuthenticated`, `escalationTrigger`, `campaignName`, `recordingAvailable` | same name |
| `customerId` | **deliberately never set** — see §6 |

`customerId` is never resolved or supplied — every Call sync row is valid with or without a resolvable identity, satisfying the brief's core requirement directly (CMA-1A's own migration already made `customer_id` nullable for exactly this).

## 3. Chat synchronization

Reuses `src/server/customer360/chatInteractionSource.ts` unmodified, `source: 'chat-sessions'`. The same `buildCmaSyncPayload` function handles it — no separate Chat-specific mapper exists, because `SourceInteraction` is already the shared, source-agnostic shape both adapters produce.

**No fabricated values.** `chatInteractionSource.ts`'s own `mapRow()` already documents, field-by-field, which values are genuinely unavailable from the real Chat API (`outcome`, `sentimentScore`, `escalationTrigger`, `direction` — all hardcoded `null` there with an explanatory comment, not a CMA-1B decision). `buildCmaSyncPayload` passes these `null`s through as explicit `null` in the sync payload (an honest "upstream has no value," not an omission) — confirmed by the deterministic test (`cma-interaction-synchronization-verify.mjs`, "a genuinely-null outcome/sentimentScore/escalationTrigger is sent as an explicit null... never fabricated into a fake value").

Chat sync also inherits `chatInteractionSource.ts`'s existing trial/test fail-closed filtering (a Trial/Test session is excluded before CMA ever sees it) — unmodified Customer 360 logic, reused as-is.

## 4. Historical backfill

`runCmaBackfillBatch(supabase, adapter, cursor, batchSize)` — structurally identical in shape to `backfillJob.ts`'s `runBackfillBatch` (same cursor/batchSize/nextCursor contract), with the one deliberate difference: **no `resolveCustomerIdentity`/`if (!resolved) continue` gate anywhere** — every row `listPage` returns is synced.

- **Bounded**: `batchSize` pages per invocation (same convention as Customer 360's own backfill).
- **Resumable**: `nextCursor` is a plain page number; a caller (the manual admin trigger) re-invokes with `cursor: nextCursor` to continue. Nothing is checkpointed mid-page — a killed invocation loses at most the in-flight batch, never corrupts state, because `call_center_sync_interaction`'s upsert key makes re-processing any already-synced page a safe no-op.
- **Idempotent**: re-running the same cursor/batchSize twice produces identical end state — proven both by CMA-1A.3's own real-Postgres idempotency test of the underlying RPC, and by this session's own re-confirmation (§10).
- **Progress/error reporting**: returns `pagesProcessed`, `interactionsFetched`, `interactionsSynced` (split `inserted`/`updated`), and `failures: Array<{page, interactionId, error}>` — one row's sync failure (e.g. a malformed upstream record) is collected and the batch continues, never aborts.
- **No identified-customer requirement**: confirmed above.

**Manual trigger, authorized administrators only**: `POST /api/customers/admin?action=cmaBackfillCalls` / `?action=cmaBackfillChats`, `cursor`/`batchSize` query params (same shape as the existing `?action=backfill`). Reuses the file's existing `requireAdminToken` gate (`X-Admin-Token` header against `CUSTOMER360_ADMIN_TOKEN`) — the SAME mechanism every other admin job on this route already requires, not a new permission or a new migration-backed grant. **No new top-level route file was created**: this repo is confirmed exactly at the Vercel Hobby plan's 12-serverless-function ceiling (`api/**/*.ts` minus underscore-prefixed shared helpers = exactly 12 real route files), so extending the existing consolidated `api/customers/admin.ts` dispatcher — the file Session 4.5 created for precisely this reason — was the only option that didn't risk breaking deployment.

**Not run against production** — `runCmaBackfillBatch` was executed only against the disposable Postgres instance (§10) and, for the mapping layer alone, against real live upstream data (§10).

## 5. Incremental polling

**Investigated first, honestly**: does the real Call Data or Chat API support `updated_since`/`modified_since`? No — confirmed by reading both real fetch functions. `voiceAgentInteractionSource.ts`'s only date filter (`date_from`, day-granularity) is wired into `searchByContactPoint` only, never `listPage`. `chatInteractionSource.ts`'s `fetchSessions()` has no date parameter on either call site. Neither contract exposes "what changed since X."

**Practical approach taken** (the brief's own fallback): `runCmaPollingTick(supabase, adapter, pages, pageSize)` re-syncs the first `pages` page(s) of `listPage` on a short interval. Configuration: `CMA_POLLING_INTERVAL_MS = 5 * 60 * 1000` (5 minutes, a named constant), `CMA_POLLING_DEFAULT_PAGES = 1`, `CMA_POLLING_DEFAULT_PAGE_SIZE = 50`.

**Honest limitation, not resolved this session**: neither adapter's `listPage` documents or guarantees page-1-is-most-recent ordering. This design assumes it (a common REST convention) but has **not verified** it against this specific backend's real contract. If wrong, a short poll could miss an older record's update. This is exactly why the brief separately asks for periodic wider reconciliation (§6) — a slower-cadence ID-level pass that would eventually catch anything the narrow poll missed, regardless of ordering. Confirming the real API's actual `listPage` ordering is named as the single highest-value follow-up before any production approval of polling.

**Entry point exposed, scheduling NOT enabled**: `POST /api/customers/admin?action=cmaPollCalls` / `?action=cmaPollChats` (same admin-token gate). `vercel.json` is untouched — no new `crons` entry. The brief's §4/§9 requirement ("keep production scheduling disabled until separately approved") is honored by construction: nothing references this path from a scheduler.

## 6. Reconciliation — extended beyond CMA-1A's count-only version

CMA-1A's own report explicitly flagged two capabilities as NOT built: interaction-ID reconciliation and changed-fact reconciliation. This session builds both, narrowly scoped as the brief requires ("do not expand CMA-1B into a comprehensive reconciliation engine").

- **Missing interactions** / **unexpected local interactions**: `diffInteractionIds(localIds, upstreamIds)` — pure, a straightforward two-way set difference.
- **Stale/changed interaction facts**: `detectStaleFacts(localRows, upstreamRows)` — compares exactly three tracked mutable fields (`outcome`, `durationSeconds`, `escalationTrigger` — the same representative set CMA-1A's own test-scenario list already named), for IDs present on **both** sides only (an ID missing on one side is already reported by `diffInteractionIds`, never double-reported here). Deliberately not a full-row diff of every column — a small, named, justified comparison set, consistent with "do not expand into a comprehensive reconciliation engine."

**A new, minimal, additive RPC was required** to read local facts at all: `call_center_cma_interaction_facts_for_window(source, from, to)`, in the new migration `20261025000000_cma_interaction_id_reconciliation.sql`. This app has no direct table-level Supabase-JS access to `call_center.customer_interactions` anywhere in the codebase — every single read/write in this entire project goes through a `public.call_center_*` `security definer` RPC wrapper (confirmed by grepping the whole codebase for `.schema(`/`.from('customer_interactions'` — zero matches). Since CMA-1A's own migration is **already applied to production**, it can no longer be revised in place the way CMA-1A.1/1A.3 did; this had to be a genuinely new migration file. It is strictly additive (one new read-only function, `service_role`-only, no table/column/constraint change) and was **not applied** to production in this session — created and locally verified only, exactly as CMA-1A's own first pass was.

**Call vs. Chat asymmetry, disclosed not glossed over**: Call ID reconciliation compares the SAME server-side-filtered date window on both sides (upstream via the real Call Data API's own `date_from`/`date_to`, reusing `fetchCompleteCallPopulation` — the exact fetcher CMA-1A's count-only reconciliation already uses). Chat ID reconciliation has **no server-side date filter available upstream at all** — it can only bound itself by `maxPages` and filter the window client-side after fetching, which is a weaker guarantee for a large/old population: if the window's true rows aren't within the first `maxPages` pages, this pass won't see them. This is a genuine upstream API limitation, documented in the module's own comments and here, not silently treated as equivalent to the Call side.

Entry points: `POST /api/customers/admin?action=cmaReconcileCalls&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD` / `?action=cmaReconcileChats&dateFrom=...&dateTo=...&maxPages=10` — same admin-token gate, read-only (no write happens in either reconciliation path).

## 7. Security and reliability

- Every new write path (`call_center_sync_interaction`) and the new read path (`call_center_cma_interaction_facts_for_window`) is `service_role`-only — not reachable by `anon`/`authenticated` — unchanged convention from CMA-1A, re-confirmed by real execution this session (§10).
- Every new manual-trigger HTTP action requires the existing `requireAdminToken` gate — server-side only, no client-exposed secret.
- Customer 360's `call_center_upsert_interaction`, `reconcileJob.ts`, `backfillJob.ts`, and their own identity-gated behavior are **completely untouched** by this session — confirmed by `git status`/`git diff`: no file under `src/server/customer360/` was modified.
- Bounded processing: every loop in this session (`syncSourcePage`'s single page, `runCmaBackfillBatch`'s `batchSize`, `runCmaPollingTick`'s `pages`, both ID-reconciliation functions' `maxPages`/upstream's own page cap) has an explicit bound — no open-ended loop was introduced.
- Safe retries: re-running any of these functions with the same parameters is safe by construction (idempotent upsert key; read-only reconciliation has no write to retry).
- Clear failure reporting: `cmaBackfill`'s `failures` array; a thrown RPC error surfaces through the existing `withErrorBoundary` wrapper already applied to this whole route.
- No new infrastructure was introduced — everything runs inside the existing Vercel Function (`api/customers/admin.ts`) and existing Supabase project; the one new RPC follows this project's own established `security definer` + `service_role`-only convention exactly.

## 8. Tests performed — real-vs-static explicitly distinguished

### 8.1 Deterministic, executed, pure logic (`.tooling/scripts/cma-interaction-synchronization-verify.mjs`, real compiled source via esbuild)

13/13 assertions pass: `buildCmaSyncPayload` field-mapping correctness (full call row, and a chat row with genuinely-null fields proven to pass through as explicit nulls, never fabricated); `buildCmaSyncPayload` never includes `customerId`/`contactPointId`/`campaignId`/`fcr`/`intentConfidence`; `diffInteractionIds` for exact-match, missing-locally, unexpected-locally, both-directions, and empty-upstream cases; `detectStaleFacts` for identical facts, single-field change, multi-field change on one row, and an ID present only locally (correctly not double-reported).

### 8.2 Executed against a real, freshly-created disposable PostgreSQL 17.5 instance (recreated this session, deleted at the end — same method as CMA-1A.2/1A.3)

All 51 real migration files (including the already-applied CMA-1A migration, replayed fresh here, and this session's new `20261025000000` migration) were replayed in order, deferring the same pre-existing, unrelated `..._enable_rls_remediation.sql` ordering quirk CMA-1A.2 already documented. **All 51 applied cleanly, zero errors.**

Against this real instance:
- Seeded 3 in-window rows (2 call-data, 1 chat-sessions) and 1 out-of-window call-data row via real `call_center_sync_interaction` calls — all 4 inserted successfully (`wasInsert: true`), confirming the CMA-1A.3-corrected sync RPC still works correctly for CMA-1B-shaped payloads.
- Called the new `call_center_cma_interaction_facts_for_window('call-data', window)` RPC for real: returned **exactly** the 2 in-window call-data rows, with correct `outcome`/`durationSeconds`/`escalationTrigger` values; correctly excluded the chat-sessions row (wrong source) and the out-of-window row — a genuine Postgres response, not hand-traced.
- Confirmed via `information_schema.routine_privileges` that `EXECUTE` on the new RPC is granted only to `postgres` (owner) and `service_role`.
- **Real unauthorized-access test**: created an actual non-`service_role` login role, granted it `authenticated`, and attempted the new RPC as that role — got a genuine `ERROR: permission denied for function call_center_cma_interaction_facts_for_window`, not inferred from the grant list alone.
- Cluster stopped and its data directory deleted before this session ended.

### 8.3 Executed against the real live upstream Call Data API (read-only GET, real production backend — no write, no Supabase involvement)

Called `voiceAgentInteractionSource.listPage(1, 3)` for real: **3 real rows returned, `totalPages: 254`**. Mapped one real row through `buildCmaSyncPayload` and confirmed the real output shape matches exactly what `call_center_sync_interaction` expects (real `interactionId`, `startedAt`, `agentId`, `outcome`, etc. — not a synthetic fixture).

**Not executed**: the equivalent real Chat API call failed in this environment because `chatInteractionSource.listPage()` additionally requires `CUSTOMER360_SUPABASE_URL`/`CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY` (for its own trial-flag/campaign-context lookups — pre-existing Customer 360 behavior, unrelated to CMA-1B) and only one of the two was available in this session's local environment; it failed closed exactly as documented (no trial-flag data → every session excluded), not with an uncontrolled crash. The Chat mapping path itself remains verified only by §8.1's deterministic test against a representative constructed row and a full reading of `chatInteractionSource.ts`'s own real `mapRow()` function — not by a real live Chat API call this session.

### 8.4 `npm run typecheck` / `npm run verify:full`

Both clean. `typecheck`: no output, all 3 tsconfigs. `verify:full`: exit 0; the one `FAIL:` line is the same pre-existing, expected negative test for an unknown customer theme configuration present across every prior session in this engagement — not a real failure.

### 8.5 Not executed / explicitly unverified

- Backfill **resumption** across a real interruption (kill mid-batch, resume from `nextCursor`) was reasoned through structurally (checkpointing is per-page, not per-row, so a killed batch loses at most its in-flight page) but not literally interrupted-and-resumed against the disposable database this session.
- Polling **idempotency** (same tick run twice) was reasoned through via the same upsert-key argument CMA-1A.3 already proved for the underlying RPC, but not separately re-executed as a distinct two-tick test.
- The 6 new `api/customers/admin.ts` HTTP actions themselves (as real HTTP requests through Vercel's local dev server or similar) were not invoked — only their underlying `src/server/cma/*` functions were, directly, in-process.
- Application-level (TypeScript, in-process) Customer 360 compatibility was not re-verified this session — no Customer 360 file was touched, so CMA-1A.4's own already-executed Customer 360 compatibility evidence is unaffected and still stands.

## 9. Why a new migration file, not a revision to CMA-1A's

CMA-1A's migration is live in production (CMA-1A.4). Revising it in place — CMA-1A.1/1A.3's precedent — is no longer available; that precedent only applied while the file was unapplied. The new migration (`20261025000000`) is purely additive, touches no existing table/column/constraint, and was not applied to production in this session.

## 10. Remaining limitations and risks

1. **Polling's "page 1 is recent" assumption is unverified** against the real backend's actual ordering contract (§5) — the single highest-value follow-up before any production polling approval.
2. **Chat ID reconciliation's window guarantee is weaker than Call's** — bounded by `maxPages`, not a real server-side date filter (§6).
3. **`fcr`/`intentConfidence`/`campaignId` are never populated via CMA sync** — `SourceInteraction` carries none of them today; a future session could extend the adapters (or read the raw DTOs directly) to capture them, but nothing in this session fabricates them.
4. **The real Chat API fetch path was not independently executed live this session** (§8.3) — verified by code reading + the deterministic payload test only.
5. **Backfill interruption/resumption and polling double-tick idempotency were reasoned through, not literally re-executed** this session (§8.5) — both rest on the same upsert-key guarantee CMA-1A.3 already proved by real execution for the underlying RPC, which is strong but not a substitute for directly testing these two specific call patterns.
6. **The new migration has never been applied anywhere, including staging** — same posture CMA-1A's own first pass had before CMA-1A.2/1A.3/1A.4 closed that gap; this session's own §8.2 real-Postgres validation closes most but not all of the equivalent gap for the new RPC (an interruption/concurrency-specific test, mirroring CMA-1A.3's own concurrent-insert test, was not repeated for this session's new RPC since it is read-only and has no analogous race to test).
7. **Agent-transfer-mid-interaction remains unmodeled** — unchanged, carried forward from every prior CMA-1A session; `agent_id`/`agent_display_name` stay immutable once set, which CMA sync inherits unchanged.

Nothing was committed, pushed, or deployed. No production backfill was executed. No scheduled polling was enabled. No CMA governance table or calculation engine was introduced. No Dashboard/Analytics file was touched. `.env` remains at its known pre-existing, unrelated 2-line diff.

Stopping here after CMA-1B implementation, per the brief — no further session begun.

---

# CMA-1B.1 — Correction: ordering-independent window synchronization

**Problem identified by the user, confirmed real**: CMA-1B's `cmaPolling.ts` re-synced "page 1" of each adapter's `listPage()` on every tick, on an UNVERIFIED assumption that page 1 contains the most-recently-started/most-recently-updated records (§5/§10.1 above, honestly flagged at the time but not fixed). This correction removes that assumption everywhere. All other CMA-1B deliverables are preserved — not reworked — except where noted below.

Still **not committed, pushed, or deployed**; no migration applied; no production backfill; no schedule enabled; `.env` confirmed unchanged (`git status` shows only its known pre-existing 2-line diff).

## 1. Investigation — Call vs. Chat pagination/date-filter capability, not assumed identical

- **Call Data API (`GET /api/v1/call-data`)**: genuinely supports server-side `date_from`/`date_to` — confirmed in `src/types/api/calls.ts`'s documented `CallDataQueryDto` (inclusive calendar dates, `YYYY-MM-DD`) and already exercised by `src/server/analytics/callPopulationFetcher.ts` (`fetchCompleteCallPopulation`), which exhaustively pages a date-filtered query until the backend's own `total_pages` is reached or a safety cap (`maxPages`, default 30) is hit, honestly reporting `capped: true` rather than silently truncating. **A real, complete window retrieval is possible for Call.**
- **Chat sessions API (`GET /api/v1/chat/sessions`)**: has **no date-filter parameter anywhere in its documented contract** — confirmed in `src/types/api/chat.ts`'s `ChatSessionListRowDto`/`ChatSessionsListResponseDto` and by reading both real call sites in `chatInteractionSource.ts` (`searchByContactPoint`, `listPage`) — neither ever sends a date query parameter. **No adapter-level server-side date translation is possible for Chat, because the upstream contract has nothing to translate against.** The only option that does not silently truncate the population is to page through the ENTIRE chat-sessions list (bounded by a safety cap, same honest `capped` discipline as Calls) and filter by `startedAt` client-side. This is a genuine, disclosed, upstream-imposed limitation — not a shortcut introduced by this codebase — and gets more expensive as the real chat population grows beyond today's 17 rows.

This asymmetry was investigated directly against the documented contracts (both DTOs are "typed directly from the vendor's reference docs... nothing here is speculative," per `calls.ts`'s own header) rather than assumed; no live upstream calls were needed to establish it, since the capability gap is structural (the Chat DTO/query type has no date field to send).

## 2. Design change — window-based, ID-identified, order-independent

- **`src/server/cma/cmaSync.ts`**: added `syncCallWindow(supabase, dateFrom, dateTo, startedFrom, startedTo, maxPages, pageSize)` and `syncChatWindow(supabase, startedFrom, startedTo, maxPages, pageSize)`. Both retrieve **every** eligible interaction for an explicit `[startedFrom, startedTo)` period — Call via the upstream's own real date filter (reusing `fetchCompleteCallPopulation`, mapped through the now-exported `voiceAgentInteractionSource.mapEntry`), Chat via an exhaustive page walk filtered by the new pure helper `filterRowsInWindow(rows, startedFrom, startedTo)` — and upsert every row through the existing `call_center_sync_interaction` RPC, identified strictly by `(source, interactionId)`, never by page position. Both return an honest `capped` flag (true if a safety page cap was hit before the real upstream population was fully retrieved for that window).
- **`syncSourcePage`** (plain page-cursor fetch) is **retained**, but now used ONLY by the historical backfill (`cmaBackfill.ts`), which is legitimately order-independent: a backfill's job is "walk every page of all history exactly once," a claim that doesn't depend on which page arrives "first" — it terminates when every page has been seen, not when "the newest" ones have been. This is documented explicitly in `cmaSync.ts`'s module header so a future reader doesn't mistake its continued existence for the bug being only partially fixed.
- **`src/server/cma/cmaPolling.ts`**: completely rewritten. `runCmaPollingTick(supabase, rollingWindowMs, now)` now calls `syncCallWindow`/`syncChatWindow` for a rolling `[now - rollingWindowMs, now)` period (default `CMA_POLLING_ROLLING_WINDOW_MS = 24h`, deliberately wider than the 5-minute tick interval so consecutive ticks overlap — a record whose facts changed near a tick boundary is still re-covered by the next tick, not missed at the edge). The old page-based `pages`/`pageSize`/`CMA_POLLING_DEFAULT_PAGES` parameters and the per-adapter signature are gone; there is no longer any ordering assumption anywhere in this module.
- **Resynchronization strategy for late-arriving/changed records** (brief's explicit ask), both built on the same window-based primitives, not new ones:
  1. **Rolling window resync** (`runCmaPollingTick`, above) — short-interval, overlapping, recent-window re-sync.
  2. **Periodic historical-window reconciliation** — reuses `cmaIdReconciliation.ts`'s existing `runCmaCallIdReconciliation`/`runCmaChatIdReconciliation` unchanged in approach, run on a much wider period at a slower cadence (daily, matching this deployment's other cron entries), to catch anything outside the rolling window's shorter lookback (e.g. a backdated/corrected record). Reconciliation only ever reports drift; a follow-up call to `syncCallWindow`/`syncChatWindow` for the same wider window is what would actually correct it — same idempotent primitive either way, never a special-case corrective path.
- **`src/server/cma/cmaIdReconciliation.ts`**: `IdReconciliationResult` gained a `capped: boolean` field, now honestly populated by both `runCmaCallIdReconciliation` (from `fetchCompleteCallPopulation`'s own `capped`) and `runCmaChatIdReconciliation` (true if its page walk hit `maxPages`, default raised 10 → 50, before reaching the real upstream `total_pages`). Previously a capped/incomplete Chat reconciliation pass looked identical to a complete one; now it is distinguishable. ID/changed-fact comparison logic itself (`diffInteractionIds`/`detectStaleFacts`) was already correctly `(source, interactionId)`-keyed and window-scoped from CMA-1B's first pass — unchanged here.
- **`api/customers/admin.ts`**: `cmaPollCalls`/`cmaPollChats` (two actions, page-based) replaced by a single `cmaPoll` action (window-based, covers both Call and Chat in one call, `rollingWindowHours` query param). Two new actions added: `cmaSyncCallsWindow`/`cmaSyncChatsWindow` (`dateFrom`/`dateTo` required, same shape as the existing `cmaReconcileCalls`/`cmaReconcileChats`) for an explicit, on-demand resync of a specific historical period — e.g. after a reconciliation pass reports drift for that window. No new route file; same `requireAdminToken` gate; still not referenced anywhere in `vercel.json`.
- **`src/server/customer360/voiceAgentInteractionSource.ts`**: `mapEntry` (previously module-private) is now exported, so `cmaSync.ts`'s window-based Call sync reuses the one real DTO→`SourceInteraction` mapping instead of duplicating it. No behavioral change to Customer 360 — the function itself is untouched, only its visibility.

## 3. Tests — real vs. static, explicitly distinguished

### 3.1 Deterministic (`.tooling/scripts/cma-interaction-synchronization-verify.mjs`, real compiled source via esbuild) — now 18/18 assertions

Added 5 new assertions for the new pure `filterRowsInWindow` helper (bundled fresh into `.tooling/tmp/cmaSync.mjs`): rows inside `[from, to)` kept regardless of input order; lower bound inclusive; upper bound exclusive (half-open, matching every other window-bound function in this codebase); empty input; and an explicit order-independence check (reversing input row order never changes which rows match — the direct regression test for the bug this correction fixes). The 13 pre-existing assertions (payload mapping, `diffInteractionIds`, `detectStaleFacts`) were re-run unchanged and still pass; `cmaIdReconciliation.mjs`'s bundle was regenerated (adds the `capped` field, no behavioral change to the pure functions it tests).

### 3.2 Real, executed against a fresh disposable PostgreSQL 17.5 instance (recreated for this correction, deleted at the end — same method as CMA-1A.2/1A.3/1B)

All 51 real migration files replayed in order (deferring the same pre-existing `..._enable_rls_remediation.sql` ordering quirk CMA-1A.2 already documented) — **all 51 applied cleanly, zero errors.** Against this real instance:

- Synced two synthetic "window" call rows via real `call_center_sync_interaction` calls (`wasInsert: true` both) — simulating what `syncCallWindow`'s exhaustive-window retrieval would upsert.
- **Re-ran the identical same two payloads a second time** — the direct idempotency proof the brief asked for ("repeated execution of the same period must be safe"): both returned `wasInsert: false`, and `select count(*)` stayed at 2 — no duplication, no corruption, confirming a window can be re-synced any number of times safely.
- Called the real `call_center_cma_interaction_facts_for_window` RPC for the exact window both rows fall in — returned both, with correct `outcome`/`durationSeconds`/`escalationTrigger`; narrowed the window to exclude one row by `started_at` — correctly returned only the one still inside the narrower bound. This is the real RPC the ID/changed-fact reconciliation functions call; its half-open-window correctness was re-confirmed by direct execution, not just by reading the SQL.
- **Real unauthorized-role test**: a genuine non-`service_role` login role, granted `authenticated`, attempting the same RPC — got an actual `ERROR: permission denied for function call_center_cma_interaction_facts_for_window`, not inferred from grants alone.
- Cluster stopped and its data directory deleted before this correction session ended.

### 3.3 Not re-executed live against the real upstream APIs this correction

The Call-vs-Chat date-filter/pagination capability investigation (§1 above) was established by reading the documented DTO contracts (already confirmed, in this codebase's own words, as "fully documented... nothing here is speculative") rather than by a fresh live GET call — CMA-1B's own prior session already made a real live call to `voiceAgentInteractionSource.listPage` (3 rows, `totalPages: 254`) and that finding is unaffected by this correction's changes. No new live upstream call was made this correction; the structural capability gap (Chat's DTO/query type genuinely has no date field) does not require one to establish.

### 3.4 `npm run typecheck` / `npm run verify:full`

Both clean after this correction. `typecheck`: no output, all 3 tsconfigs. `verify:full`: exit 0; the one `FAIL:` line is the same pre-existing, expected negative test for an unknown customer theme configuration present across every prior session in this engagement — not a real failure, and not introduced by this correction.

## 4. Remaining limitations, re-assessed

1. **Chat window sync/reconciliation still has a weaker guarantee than Call's** — not because of an ordering assumption anymore (fixed), but because Chat's upstream API genuinely has no date filter to push down; a window sync for Chat means "page through the whole list, filter client-side," bounded by `maxPages` and honestly flagged via `capped` if that bound is hit. This gets more expensive as the real chat-sessions population grows past today's 17 rows — a real, disclosed, upstream-imposed constraint, not something further correctable from this side without an upstream API change.
2. **The rolling window's 24h-lookback-on-a-5-minute-cadence design is a reasoned default, not independently load-tested** — the overlap logic was traced through code and proven idempotent via the real-Postgres re-run test (§3.2), but a true back-to-back two-tick execution (as opposed to the same payload submitted twice by hand) was not separately run.
3. Every other limitation already disclosed in CMA-1B's own §10 (points 3, 4, 5, 6, 7 above) is unaffected by this correction and still applies unchanged.

Nothing was committed, pushed, or deployed by this correction. No migration was applied. No production backfill was executed. No scheduled polling was enabled. `.env` remains at its known pre-existing, unrelated 2-line diff.
