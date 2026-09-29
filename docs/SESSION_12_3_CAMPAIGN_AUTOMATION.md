# Session 12.3 — Campaign Automation (Scheduling/Orchestration)

**CAMPAIGN AUTOMATION IMPLEMENTATION: COMPLETE**
**STATIC VERIFICATION: PASS** (`tsc --noEmit` clean, `npm run build` clean; `npm run lint` blocked by the sandbox's own permission classifier — see §D)
**READY FOR FIRST WATCHED AUTOMATED RUN: YES** (code complete, not yet committed/deployed — see §F; no runnable target exists yet regardless, so nothing will execute until Phase E is explicitly authorized and performed)

No subagents were used at any point in this session (direct execution throughout, per the standing Session 12.1 instruction).

No telephone call was placed or triggered during this session.

---

## Phase G — Post-deployment UI verification findings (found and fixed)

Two Campaign Detail page defects were reported after deployment, on the same proven 12.2B test campaign. Both investigated read-only first, per instruction; both turned out to be genuine, pre-existing, verification-blocking, low-risk local Call Centre defects — not caused by this session's automation work, not data problems, and not anything wrong with the proven `call_sid_equals_call_id` correlation. Both fixed.

### G.1 — "0 targets" header/count vs. the correctly-rendered target

**Symptom**: header and "Targets (0)" both showed 0, with a warning banner claiming "0 targets exist for this campaign, but only 1 could be loaded below" — while the one real target rendered correctly underneath (`status: completed`, `Resolved`, `attempts: 2`).

**Root cause — API mapping (key-casing mismatch), not a count/query/resolution bug.** `call_center_campaign_get`'s stats subquery has, since it was first written (Session 9.1), built its `jsonb_build_object` with **camelCase** keys (`targetCount`, `triggeredCount`, `classifiedCount`, `successCount`). The TypeScript mapper that consumes it, `mapStats()` in `supabaseCampaignRepository.ts`, has always read **snake_case** (`row.target_count`, etc.) — the exact convention `call_center_campaign_get`'s sibling function, `call_center_campaign_list` (used by the Campaigns grid/list page), correctly uses. Confirmed live by calling the RPC directly: it genuinely computes `targetCount: 1` (the count logic itself is, and always was, correct) — the TS mapper simply never finds a field by any of its expected snake_case names, so every field silently falls back to `?? 0`. This means **every Campaign Detail page, for every campaign, has always shown 0/0/0/0% stats** — a longstanding defect this session happened to be the first to notice, not something Sessions 12.1–12.3 introduced. (The Campaigns list/grid page is unaffected — it uses the correctly snake_cased `call_center_campaign_list`.)

The misleading warning banner is a downstream symptom of the same bug, and is itself inverted in this exact scenario: it reads `{stats.targetCount} target(s) exist… but only {targets.length} could be loaded`, implying the smaller number is the truth and the larger is a loading gap — here it's the reverse (`stats.targetCount` is the broken value; `targets.length` is the real one). A pre-existing Session 12.1 code comment on this same banner documents a *different*, still-real, still-open latent gap (`listTargets`'s INNER JOIN can silently omit a target whose customer/contact doesn't resolve) — that separate concern is untouched and still correctly out of scope; it did not cause this incident (this target's customer/contact both resolve fine) and is not fixed here.

**Fix**: `supabase/migrations/20261009000000_campaign_get_stats_key_casing_fix.sql` — `create or replace function call_center_campaign_get`, renaming the four stats keys from camelCase to snake_case to match `call_center_campaign_list`'s established convention. The underlying `COUNT`/`JOIN` logic is byte-for-byte unchanged — only the four JSON key names change. Zero TypeScript changes needed (the existing `mapStats()`/`StatsRow` were already correct; the SQL was wrong).

**Status: written, NOT yet applied.** Applying this migration to production (`mcp__supabase__apply_migration`) was blocked by the sandbox's own permission classifier ("Modify Shared Resources") — a real, non-destructive `create or replace function` against the already-existing function, but still correctly treated as a shared-resource write requiring the user's own action. See §H for the exact SQL to run.

### G.2 — Transcript/Recording drill-down fails for the proven reconciled interaction

**Symptom**: clicking "Transcript / Recording" on the completed target produced "Could not load full interaction detail for 1f599d20-c84a-4167-9c74-fb48780c78ef right now" — despite the Call Data record being independently confirmed to exist (proven in Session 12.2B).

**Root cause — same already-known, already-documented Call Data API limitation as Session 12.2B's reconciliation defect, just not yet propagated to this one call site.** `CampaignDetail.tsx`'s `InteractionLookupDialog` fetched via `useCallData({ search: interactionId })` — but `/call-data`'s `search` parameter matches `caller_number`/`caller_name`, never `call_id` (the exact same backend behavior found and fixed in `reconcileExecutions.ts` in 12.2B, commit `2baf18b`). Searching by a `call_id` string can never return a match, so the lookup always fails for every reconciled Campaign target, regardless of whether the call genuinely exists.

**This exact class of bug was already found and fixed once before, elsewhere in the codebase** — `CustomerDetail.tsx`'s own `InteractionLookupDialog` hit the identical problem for Customer 360's Voice timeline and was fixed by searching Call Data by the customer's phone number (the field `search` actually matches) and filtering the bounded, paged results down to the exact `call_id` client-side (`findCallByPhoneAndId`, with its own code comment documenting this same root cause, citing `docs/CALL_CENTRE_LIVE_VERIFICATION_POST_OUTAGE.md`). `CampaignDetail.tsx` was simply never updated to the same pattern when it was built.

**Fix in commit `92ec1f4`** (`src/components/campaigns/CampaignDetail.tsx`): replaced the broken `useCallData({ search: interactionId })` call with the same phone+id lookup pattern (`findCallByPhoneAndId`, bounded to 3 pages × 100 rows, matching `CustomerDetail.tsx`'s existing constants), using the target's own `contactRawValue` (already available and already rendered in the Phone column) as the phone to search by. **This commit was verified after deployment to be insufficient** — see G.2 follow-up below.

### G.2 follow-up — `92ec1f4` was still insufficient; deployed but the drill-down remained broken

**Verified symptom (post-deploy)**: same "Could not load full interaction detail" error, on the same interaction, even though Call Logs opens it successfully with full metadata/recording/transcript. Investigated read-only first, tracing the two paths line by line rather than assuming the phone-search change alone was sufficient.

**Working Call Logs path, traced in full**: `CallLogs.tsx` → `useCallData({status:'inactive', page_size, page, ...filters})` → `useCallData` hook (`src/hooks/calls/useCallData.ts`) resolves `const { user } = useAuth(); const role = user?.role ?? 'unauthenticated';` and calls `fetchCallData(query, role)` → `callsService.ts`'s `fetchCallData` sends `headers: { 'x-user-role': role }` → `api/calls/data.ts` proxies to the real backend, then applies Session 6.2's server-side category authorization: `resolveAccessForRequest(req)` reads that header; unless `access.allCategories || access.authorizedAgentIds === 'all'`, every row is filtered to only agents in the caller's authorized set. The logged-in browser session's role (visible in the screenshots' Operationalize/Observe sidebar sections) resolves to `allCategories: true` or an authorized set that includes `emi-reminder-agent`, so the row survives filtering and the dialog opens with full data — user clicks an already-loaded row object directly (no second fetch), so this path never even exercises the per-ID lookup question.

**Campaign Detail path after `92ec1f4`, traced in full**: `InteractionLookupDialog` → `findCallByPhoneAndId(phone, callId)` → `fetchCallData({search: phone, page, page_size: 100})` — **called with no `role` argument**. `fetchCallData`'s own signature is `fetchCallData(query, role = 'unauthenticated')` — a documented fail-closed default for callers with no role handy, with an explicit code comment stating "every UI call site should pass the current session's role." `92ec1f4` didn't. Server-side, `resolveAccessForRequest` resolves `'unauthenticated'` to (by design) no authorized categories, so `api/calls/data.ts` filters `calls` down to an **empty array** on every request — independent of whether the phone/pagination/call_id logic was otherwise correct.

**Confirmed empirically, live, read-only** (no auth header vs. the browser's real role, same query):
```
GET /api/calls/data?search=%2B919930647652   (no x-user-role header)
→ {"calls":[], "pagination":{"total_records":6,...}}   — matches the observed failure

GET /api/calls/data?search=%2B919930647652   (x-user-role: call_center_head)
→ {"calls":[{"call_id":"1f599d20-...", full recording/transcript/metadata present}]}
```
This single header is the entire discrepancy — phone value, normalization, pagination (`total_pages: 1`, well within the 3-page bound), and exact `call_id` string comparison were all already correct in `92ec1f4`; none of those needed further changes.

**Why the phone-search fix alone looked plausible but wasn't sufficient**: it correctly fixed the *query shape* (searching by phone instead of by `call_id`, matching `CustomerDetail.tsx`'s established pattern) but did not carry over the *authorization* half of that same established pattern — and it turns out `CustomerDetail.tsx`'s `findCallByPhoneAndId` has this identical gap (it also calls `fetchCallData()` with no role argument). This was not fixed here — it is a separate, pre-existing, out-of-scope latent defect in Customer 360's own Voice interaction lookup, flagged for a future session, not touched by this fix (matches "no unrelated refactoring").

**Fix**: `InteractionLookupDialog` now calls `useAuth()` (same hook `useCallData` already uses) to resolve `role`, threads it through `findCallByPhoneAndId(phone, callId, role)` into `fetchCallData({...}, role)`, and includes `role` in the query key (matching `useCallData`'s own convention, so a role switch never serves a stale/wrong-role cached result). This reuses the exact, proven authorization mechanism the working Call Logs path already relies on — not a fourth lookup variant, just the missing half of the pattern `92ec1f4` was already following.

**Verified live** (read-only, no call/campaign action): the same phone-search query with `x-user-role: call_center_head` now returns the full call record — `call_id`, `voice_record_url` (a signed, time-limited S3 URL), and `detailed_transcript` all present, matching what Call Logs already shows for this interaction.

**Status: fixed and verified statically** (`tsc --noEmit` clean, `npm run build` clean, both re-run after this fix). Not yet committed/deployed.

No telephone call was placed or triggered during this investigation or fix. No `runBatch` was invoked. No campaign was created/started/retried, and no target was made runnable.

---

## Phase A — Read-only architecture audit

1. **`vercel.json` / existing cron jobs (before this session)**: exactly one cron — `/api/customers/admin?action=reconcile&maxPages=2` at `0 3 * * *` (daily, Customer 360 Voice reconciliation). No Campaign automation existed.
2. **Customer 360 reconciliation scheduling**: unchanged, untouched this session. Still the one daily cron above.
3. **Exact implementation/routes**:
   - `runBatch` — `POST /api/campaigns?action=runBatch&batchSize=N` → `handleRunBatch` → `runCampaignBatch()` (`src/server/campaigns/campaignRunner.ts`), admin-token-gated.
   - Customer360 reconcile — `POST /api/customers/admin?action=reconcile&maxPages=N` (admin-token-gated) **or** `GET /api/customers/admin?action=reconcile` with `Authorization: Bearer $CRON_SECRET` (the existing cron path, `isAuthorizedCronRequest()` in `api/customers/admin.ts`).
   - Campaign reconcile — `POST /api/campaigns?action=reconcile&limit=N` → `handleReconcile` → `reconcilePendingExecutions()` (`src/server/campaigns/reconcileExecutions.ts`), admin-token-gated. No cron path existed before this session.
4. **Auth for scheduled endpoints**: Vercel Cron only ever issues a GET and cannot set custom headers, so it can't drive the POST+`X-Admin-Token` admin path. The existing, already-proven mechanism (Customer360's reconcile cron) is Vercel's own documented `CRON_SECRET` env var: when set, Vercel automatically attaches `Authorization: Bearer <CRON_SECRET>` to every Cron invocation of the deployment. `CRON_SECRET` already exists as a configured Production secret (confirmed via `vercel env ls production`, value not read). This is the mechanism this session extends to Campaigns — nothing new invented.
5. **Vercel deployment/function constraints**: confirmed via `vercel teams ls` this project is on the **Hobby** plan. Fetched Vercel's own current cron docs directly (`vercel.com/docs/cron-jobs/usage-and-pricing`, accessed this session) to get authoritative, current numbers rather than relying on possibly-stale prior knowledge:
   - Up to **100 cron jobs per project** on every plan (an earlier, much lower per-plan cap no longer applies).
   - Hobby plans are limited to cron jobs that run **at most once per day** — a more frequent cron expression fails at deploy time.
   - Hobby timing precision is **±59 minutes** (a `0 2 * * *` entry may fire anywhere in the 2:00–2:59 hour).
   - This is the binding constraint on Phase B's cadence design (see below) — there is no way to run sub-daily campaign automation on the current plan; Pro would be required for that.
6. **Function count**: `api/*.ts` route files (excluding `_`-prefixed shared helpers): 11 (`agents/index.ts`, `analytics/metrics.ts`, `calls/data.ts`, `calls/session/[id].ts`, `calls/trigger.ts`, `campaigns.ts`, `chat/index.ts`, `chat/logs.ts`, `customers/[id]/index.ts`, `customers/admin.ts`, `customers/index.ts`). Prior sessions documented a 12-function Hobby ceiling reached once before (Session 4.5), which is why `customers/admin.ts` already consolidates backfill/reconcile/seedCategories into one file. This session adds **zero** new route files — see Phase C.
7. **Campaign target/execution eligibility** (`call_center_campaign_select_runnable_targets` SQL): `campaigns.status = 'running'` AND target `status in ('pending','ready')` OR (`status='follow_up_due'` AND `next_action_at <= now()`). Unchanged, reused as-is.
8. **Retry/pending/unresolved behavior** (`reconcileExecutions.ts`, unchanged since the 12.2B fix in `2baf18b`): `MIN_AGE_MS = 2 min` (too-fresh executions stay `pending`), `UNRESOLVED_AFTER_MS = 30 min` (stale ones become `unresolved`), `CANDIDATE_WINDOW_MS = 10 min` (bounds the Call Data date-window query). None of this was touched.
9. **Existing scheduler/orchestrator abstraction**: none exists beyond the one `CRON_SECRET`-gated GET path in `customers/admin.ts`. (The `Orchestrator*` pages/components found in the repo are an unrelated UI feature for conversation-flow design — explicitly out of scope per this session's own §14 regression list — not a job scheduler.) This session reuses the proven `CRON_SECRET` pattern rather than building a new abstraction.
10. **Reuse existing endpoints vs. new ones**: confirmed safe and preferable to reuse `api/campaigns.ts` itself — no new route file is needed (see Phase C).

**Pre-implementation safety check** (read-only, same discipline as 12.2B): queried every `pending`/`ready`/`follow_up_due(due)` target and every `running` campaign in production.
- Only one campaign has `status='running'`: the 12.2B test campaign (`63dff09b-...`), whose one target is `completed` — **0 runnable targets**.
- The 3 pending targets that exist belong to `myOutC01`, whose campaign is `stopped` — structurally ineligible.
- **0 pending reconciliations** exist.

This means deploying the automation today is a provable no-op until a target is deliberately made runnable in Phase E.

## Phase B — Minimal automation design

**1. What invokes `runBatch`?** A new Vercel Cron entry (`GET /api/campaigns?action=runBatch&batchSize=5`), authorized via the same `CRON_SECRET` bearer-token check as Customer360's existing cron.

**2. What invokes Customer360 reconciliation?** Unchanged — the existing daily cron, untouched.

**3. What invokes Campaign reconciliation?** A new Vercel Cron entry (`GET /api/campaigns?action=reconcile&limit=25`), same `CRON_SECRET` mechanism.

**4. Recommended cadence**: constrained to at most once/day per entry (Phase A §5). Chosen schedule:
- `runBatch` — `0 2 * * *` (~02:00, ±59 min)
- Customer360 Voice reconcile — `0 3 * * *` (unchanged)
- Campaign reconcile — `0 5 * * *` (~05:00, ±59 min)

A 3-hour nominal gap between `runBatch` and Campaign reconcile is comfortably past `UNRESOLVED_AFTER_MS` (30 min) and safely clear of the ±59-minute imprecision on both entries, so the two cannot collide even in the worst case (runBatch as late as 02:59, reconcile as early as 05:00 — still a 61-minute minimum gap). Campaign reconciliation reads Call Data directly (not `customer_interactions`), so it has no hard ordering dependency on the Customer360 job; the existing 03:00 slot is left alone.

**5. Shared orchestrator vs. independent schedules**: **independent**, deliberately. A single synchronous endpoint chaining runBatch→wait→reconcile would either not wait long enough for real, in-progress phone calls or require an unbounded synchronous wait inside one serverless invocation — a timeout/reliability risk, and a new kind of coupling nothing in the proven architecture needs. Keeping the three jobs independent, bounded, and stateless (exactly as they are today) matches the existing design and Phase C's "no business-logic rewrite" requirement.

**6. Overlapping executions**: Vercel does not fire two concurrent invocations of the same cron entry. The residual risk is a manual admin call overlapping with a cron invocation of the same action — this risk already existed before this session and is not introduced by it. It is bounded by the existing atomic per-target state transition: `call_center_campaign_create_execution` flips a target to `in_progress` (and increments `attempt_count`) in the same SQL statement that creates the execution row, **before** the Trigger Call HTTP request is made — so the moment one invocation claims a target, `selectRunnableTargets` can no longer return it to a second, overlapping invocation. This is unchanged, pre-existing protection; no new locking was added (would be unrelated scope for a job that structurally cannot self-overlap under Vercel Cron).

**7. Failed trigger attempts**: unchanged. `markExecutionFailed` flips both the execution and the target to `failed`; the target only becomes eligible again via the existing, explicit `retryTarget` action (never automatic — automating retries would be a business-logic change, out of scope).

**8. Triggered-but-not-yet-visible calls**: unchanged. `MIN_AGE_MS`/`UNRESOLVED_AFTER_MS` already handle this; a once-daily cadence means most triggered calls will be hours old by the next reconcile pass, comfortably past both thresholds.

**9. Unresolved reconciliation**: unchanged — marked `unresolved`, not auto-retried (matches "no business-logic rewrite").

**10. Duplicate call triggering**: prevented by the unchanged, pre-existing atomic status flip in §6 — automation reuses `runCampaignBatch()` verbatim, no new call path.

**11. Duplicate results/interactions**: prevented by the unchanged, pre-existing `reconciliation_status` state machine (structurally verified in Session 12.2B §16: once `reconciled`, an execution is permanently excluded from `call_center_campaign_list_pending_reconciliations`). Automation reuses `reconcilePendingExecutions()` verbatim.

**12. No work exists**: both actions already return a harmless `{processed:0,...}` no-op when nothing is eligible/pending (proven in 12.2B). Automation does not change this — confirmed applicable today (Phase A pre-check: 0 runnable, 0 pending).

**13. Observability for the first watched run**: Vercel's Cron Jobs dashboard/logs show each invocation's timestamp and HTTP response; the exact read-only Supabase queries already used and proven in Session 12.2B's final verification (execution row, `customer_interactions`, `campaign_results`, `effective_result_id`) serve as the watch checklist — see Phase E.

## Phase C — Implementation

**Files changed:**

- **`api/campaigns.ts`** — added a local `isAuthorizedCronRequest()` (deliberately duplicated, not imported, from the identical check in `api/customers/admin.ts` — both are 4-line, self-contained checks; importing would couple two otherwise-independent route files for no real benefit). Extended the request dispatcher: a `GET` on `runBatch`/`reconcile` now checks `CRON_SECRET` first — on success it bypasses the admin-token check and is treated as an authorized GET; on failure it returns `401 {"detail":"Invalid or missing cron authorization"}` immediately (a clearer message than falling through to the admin-token check's "missing admin token", which would have been misleading for a failed cron auth attempt). **Manual/admin invocation via `POST` + `X-Admin-Token` is completely unchanged** — it never reaches the new branch, since that branch only fires for `GET`.
- **`vercel.json`** — added two cron entries (existing Customer360 entry untouched):
  ```json
  { "path": "/api/campaigns?action=runBatch&batchSize=5", "schedule": "0 2 * * *" },
  { "path": "/api/campaigns?action=reconcile&limit=25", "schedule": "0 5 * * *" }
  ```

**No new API route file was created** — both new cron entries point at the existing, already-deployed `api/campaigns.ts`, so the function count stays at 11 (Phase A §6), with one slot of headroom still unused.

**No business logic was touched**: `campaignRunner.ts`, `reconcileExecutions.ts`, `triggerCallPayload.ts`, `resultRules.ts`, and every SQL function under `call_center_campaign_*` are byte-for-byte unchanged from the state verified in Session 12.2B (`2baf18b`). This session is orchestration-only, exactly as scoped.

**Secrets**: `CUSTOMER360_ADMIN_TOKEN` and `VOICEBOT_API_KEY` were never read, displayed, or transmitted by this session. `CRON_SECRET`'s presence (not value) was confirmed via `vercel env ls production`.

## Phase D — Static / non-call verification

- `npx tsc --noEmit` — **clean**.
- `npm run build` — **clean** (`vite build` succeeded, only the pre-existing, unrelated "large chunk" advisory warning, unchanged from baseline).
- `npm run lint` — **blocked by the environment's own permission classifier** ("Security Weaken"), on two separate attempts through two different tool paths (Bash and PowerShell), with no command content that should plausibly warrant that (a plain `npm run lint`). Per the standing instruction not to seek workarounds around a tool/permission denial, this was not retried further. **This is a reported blocker, not a silent skip** — the user should run `npm run lint` locally to get the actual baseline comparison before or shortly after deploying, though this specific change (one new conditional branch + one new local 4-line function) has essentially zero surface for new lint issues that `tsc` wouldn't already have caught.
- No Campaign-specific deterministic test suite exists in this repository (confirmed again this session via a fresh search — same finding as 12.2A/12.2B). No other existing suite has any dependency on the changed code.
- Database-level static verification (all read-only, no `runBatch`/no call triggered):
  1. Cron/scheduler configuration: `vercel.json` is valid JSON with two new, correctly-shaped cron entries; schedules (`0 2 * * *`, `0 5 * * *`) are both valid once-daily Hobby-compatible cron expressions (verified against the Hobby "once per day" rule fetched in Phase A — neither would fail Vercel's deploy-time validation).
  2. Authentication: code-reviewed directly (not exercised against a live secret) — the new branch requires an exact `Authorization: Bearer <CRON_SECRET>` match, identical in structure to the already-proven Customer360 cron path; a request without it, or with the wrong value, is rejected with 401 before any repository/backend call is made.
  3. Reconciliation with no pending work: **verified true today** — Phase A's pre-check found 0 pending reconciliations, so the new cron would return `{processed:0,...}`, a pre-existing, already-proven-harmless no-op.
  4. The proven reconciled execution (`2f3ac161-...`, `call_sid: 1f599d20-...`) — unchanged; this session made zero writes to any `campaign_*` or `customer_interactions` table.
  5. The historical failed execution (`788dd055-...`) — unchanged, same as above.
  6. No campaign target unexpectedly became eligible — confirmed by the same Phase A query (0 runnable targets), re-checked after the code changes were written (no data-affecting change occurred, so this is unchanged by construction, not re-queried a second time).
  7. No duplicate result/interaction was produced — no execution ran this session.
  8. No regression to Customer360 scheduling — its cron entry, route, and handler are byte-for-byte unchanged.
  9. No regression to existing APIs/UI — the only code change is additive (a new conditional branch reachable only by `GET` on two admin actions that previously always required `POST`); every existing `POST`/manual/UI-driven path through `api/campaigns.ts` is untouched and takes the exact same code path as before.

**`runBatch` was not invoked against a runnable target this phase**, per the explicit instruction — there is no runnable target to invoke it against regardless (Phase A).

## Phase F — Post-deployment verification (read-only, no call triggered)

Deployed commit: `85a235a`. Deployment `callcenter-9345yeo35-sk-tardis-projects.vercel.app`, confirmed newest "Ready"/"Production" via `vercel ls`; the production alias `callcenter-three-livid.vercel.app` resolves to it and responds HTTP 200.

1. **Deployed implementation**: confirmed via `git log`/`git show` (local matches the reported commit hash) and the deployment listing above.
2. **Both Campaign cron entries + authentication**: `vercel crons ls` shows all 3 expected entries live —
   ```
   /api/campaigns?action=reconcile&limit=25            0 5 * * *
   /api/campaigns?action=runBatch&batchSize=5           0 2 * * *
   /api/customers/admin?action=reconcile&maxPages=2     0 3 * * *
   ```
   Authentication verified fail-closed: unauthenticated `GET` on both new campaign cron paths returns `401` (checked live, no `Authorization` header and with a deliberately wrong bearer token — both rejected before any repository/backend call, per code review of the auth-first branch order). The real `CRON_SECRET` was never read or used. The manual `POST` admin-token path was not re-exercised live (the sandbox blocked even a token-less POST as a real-world-transaction risk) — unnecessary anyway, since that code path is byte-for-byte unchanged from the already-proven 12.2B implementation.
3. **Existing Customer360 cron intact**: present, unchanged schedule (`0 3 * * *`), unchanged path — confirmed in the same `crons ls` output above.
4. **Zero-runnable-target / zero-pending-reconciliation state**: re-verified post-deploy — 0 targets are `pending`/`ready`/eligible `follow_up_due` under any `running` campaign (the 3 `myOutC01` targets remain structurally ineligible, campaign still `stopped`); 0 executions are `reconciliation_status='pending' AND status='triggered'`. Unchanged from the pre-deploy check.
5. **Previously proven Campaign E2E records intact**: execution `788dd055-...` (failed, historical) and `2f3ac161-...` (`call_sid`/`reconciled_interaction_id` both `1f599d20-...`, `reconciliation_status: reconciled`) both byte-for-byte unchanged; target `a3a23212-...` still `status: completed`, `attempt_count: 2`, `effective_result_id: 43d849c2-...`.
6. **No duplicate results/interactions**: exactly one `customer_interactions` row for `interaction_id = 1f599d20-...` (count = 1); exactly one `campaign_results` row for `campaign_execution_id = 2f3ac161-...` (count = 1). No new rows were created by this deployment or this verification.

No `runBatch` was invoked, no campaign was created/started, no target was made runnable, and no telephone call was placed or triggered during this verification.

## Backend update (post-implementation, pre-deploy) — unanswered-call Call Data logging fixed

The Voice Agent team fixed unanswered/no-conversation-call logging after Phase A–D were written. The user independently verified a real example in Call Logs:

```
call_id: be26568d-2927-4057-b8ea-42fac99c3c7c
direction: outbound
duration: 0 seconds
outcome: escalated
FCR: No
no transcript/summary, short recording present
```

**What this changes**: the backend now creates a Call Data record for an unanswered/no-conversation outbound call, not only for calls with an actual conversation. This retires the open question implicit in the original session prompt's Phase B framing ("Current Voice backend may not create a Call Data record for unanswered/no-conversation calls") — it is no longer a possibility to design defensively around; it's now a confirmed capability.

**What does NOT change:**
- **The `call_sid_equals_call_id` correlation mechanism** — unchanged. The fix means more executions will find a genuine Call Data match (including unanswered ones), not that the matching logic needs to change.
- **Outcome semantics** — unchanged, and deliberately not extended. `deriveCampaignResult()` (`resultRules.ts`) already matches generically on `escalation_trigger`/`outcome`/`intent`/`status` against the campaign's own configured rules, with an `unclassified` fallback for anything that matches no active rule. An unanswered call's `outcome: escalated` is handled by the exact same, already-existing `escalation_trigger === 'escalated'` default rule — no new rule, field, or special case was added or is needed.
- **Async/pending-safety of the design** — unchanged and, if anything, strengthened: with unanswered calls now reliably producing a Call Data row, **fewer** executions should ever reach the `unresolved` (30-minute-timeout) state than before this backend fix — reconciliation now has a real record to match against for every real trigger attempt, answered or not. `MIN_AGE_MS`/`UNRESOLVED_AFTER_MS`/`CANDIDATE_WINDOW_MS` in `reconcileExecutions.ts` remain untouched and still correctly handle ordinary Call Data latency (the record can still take time to appear even though it now reliably *will* appear).

No code changes resulted from this update — only this documentation section, and the Phase E expected-sequence note below, needed revising.

## Phase E — First watched automated run (prepared, NOT executed)

Do not create or trigger the test campaign yet — this is the exact controlled procedure for when the user explicitly authorizes it.

**Setup (before enabling anything to actually fire):**
- Test campaign: reuse the existing, already-proven `63dff09b-9db4-43ea-b59c-3242662da8be` ("TEST 12.2B E2E Correlation Proof v2") — already `running`, already uses `emi-reminder-agent`, already has the correct `call_sid_equals_call_id` correlation mode configured in Production.
- Test target: reset the existing target `a3a23212-22a5-4c77-83e0-0a0335b9dc38` (currently `completed`) to a runnable state via the existing `retryTarget` action — **but `retryTarget` only accepts `status in ('failed','follow_up_due')`**, so a `completed` target cannot use it directly; a fresh target import (`?action=importTargets`, same authorized test phone/contact point already established) is the correct mechanism for a clean new runnable target, exactly as Session 12.2B originally did. This creates target #2 on the same campaign, not a duplicate of the completed one.
- Test phone: the same explicitly authorized developer test number already used in 12.2A/12.2B — no new destination.

**Expected sequence once the cron actually fires (or is manually triggered for the first watched test via the Vercel dashboard's "Run now" on the cron job, which is the recommended way to watch the very first run without waiting for the schedule):**
1. Scheduler invocation: `GET /api/campaigns?action=runBatch&batchSize=5` with `Authorization: Bearer $CRON_SECRET` — visible in Vercel's Cron Jobs log with a 200 response and `{processed:1, triggered:1, failed:0}` (or `failed:1` with a genuine upstream error, per the same honest failure-path semantics already proven in 12.2B).
2. `campaign_executions` row created, `status: triggering → triggered`, `call_sid` populated.
3. Voice Agent places the real call to the authorized test number.
4. Call Data shows a new entry with `call_id == call_sid` — **now expected regardless of whether the call is answered** (per the backend fix above); an unanswered/short test call is no longer a risk to the proof, it will still reconcile correctly, just with a `duration_seconds: 0`/`outcome: escalated`-shaped result rather than a `resolved` one.
5. (Optional/independent) Customer360's unchanged 03:00 cron materializes the interaction into `customer_interactions`.
6. Scheduler invocation: `GET /api/campaigns?action=reconcile&limit=25` with `Authorization: Bearer $CRON_SECRET` — `{processed:1, reconciled:1, unresolved:0, stillPending:0, errors:0}`.
7. `campaign_executions.reconciliation_status = reconciled`, `reconciled_interaction_id = call_sid`.
8. Exactly one new `campaign_results` row; `campaign_targets.effective_result_id` updated to point at it.

**Exact logs/DB records to observe** (same shape as Session 12.2B §16's verification table): the new execution row, the Call Data entry, the `customer_interactions` row, the `campaign_results` row, and the target's `effective_result_id` — all by exact ID, never by phone/time/name inference.

**Rollback/stop procedure if anything behaves unexpectedly**: remove the two new entries from `vercel.json`'s `crons` array and redeploy (this immediately stops any future scheduled firing; it does not affect calls already placed or data already written) — or, for a softer stop that keeps the infrastructure but halts activity, set the test campaign's status to `paused`/`stopped` (targets become structurally ineligible immediately, per Phase A §7's eligibility rule, with no code change or redeploy required).

## Phase H — G.1/G.2 fix commit and manual SQL apply

**G.1: APPLIED AND VERIFIED FIXED** — the SQL below was run against production; Campaign Detail now shows `1 target`, `Targets (1)`, `1 call triggered`, `100.0% success rate`, and the warning banner is gone. Kept here for the historical record/migration file only.

**G.2: fixed in commit `92ec1f4` (phone-search), but that alone was insufficient — see the G.2 follow-up section above for the real root cause (missing `role` header) and the additional fix now staged, not yet committed.**

**Files changed this phase:**
- `supabase/migrations/20261009000000_campaign_get_stats_key_casing_fix.sql` — new migration (G.1). **Already applied and verified** by the user directly against production. Included here for the historical record only — no further action needed:
  ```sql
  create or replace function public.call_center_campaign_get(p_id uuid)
  returns jsonb language plpgsql security definer set search_path = call_center, pg_temp as $$
  declare v_campaign jsonb; v_rules jsonb; v_stats jsonb; v_mappings jsonb;
  begin
    select to_jsonb(c) into v_campaign from call_center.campaigns c where c.id = p_id;
    if v_campaign is null then
      return null;
    end if;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.priority), '[]'::jsonb) into v_rules
      from call_center.campaign_result_rules r where r.campaign_id = p_id;

    select coalesce(jsonb_agg(to_jsonb(m) order by m.agent_input_field_code), '[]'::jsonb) into v_mappings
      from call_center.campaign_agent_input_mappings m where m.campaign_id = p_id;

    select jsonb_build_object(
      'target_count', count(distinct t.id),
      'triggered_count', count(distinct e.id) filter (where e.status = 'triggered'),
      'classified_count', count(distinct t.id) filter (where t.effective_result_id is not null and res.is_success is not null),
      'success_count', count(distinct t.id) filter (where t.effective_result_id is not null and res.is_success = true)
    ) into v_stats
    from call_center.campaign_targets t
    left join call_center.campaign_executions e on e.campaign_target_id = t.id
    left join call_center.campaign_results res on res.id = t.effective_result_id
    where t.campaign_id = p_id;

    return v_campaign || jsonb_build_object('rules', v_rules, 'mappings', v_mappings, 'stats', v_stats);
  end;
  $$;
  ```
- `src/components/campaigns/CampaignDetail.tsx` — G.2 fix (phone+id Call Data lookup, replacing the broken `search: interactionId` query). Deployed the moment this commit reaches Production via the normal Vercel deploy — no separate manual step needed for this half.

**Verification after you apply the SQL** (read-only, share the output and I'll confirm):
```sql
select call_center_campaign_get('63dff09b-9db4-43ea-b59c-3242662da8be'::uuid) -> 'stats';
```
Expect `{"target_count": 1, "triggered_count": 1, "classified_count": 1, "success_count": 1}`. The Campaign Detail page's header/section/warning-banner discrepancy should disappear on next load once both the SQL is applied and this commit is deployed.

## Remaining blockers

1. `npm run lint` could not be run this session (environment-blocked, not code-related) — recommend the user run it locally before or shortly after this deploys, though the change surface is minimal.
2. Phase E's controlled first automated run has not been executed — it requires the user's explicit authorization, per this session's own scope, and requires importing one fresh runnable target (§ above) since the existing target is already `completed`, not `failed`/`follow_up_due`.
3. Once deployed, the two new cron entries are **live, standing infrastructure** — they will fire daily going forward regardless of whether Phase E's watched run has happened. Today this is provably harmless (0 runnable targets anywhere), but this changes the instant any campaign target becomes runnable (e.g., via a fresh `importTargets` call or a `follow_up_due` target's `next_action_at` arriving) — at that point the next scheduled `runBatch` **will** place a real call, unattended, without further confirmation. This is the intended purpose of automation, but is called out explicitly since it is a meaningful behavioral change from every prior session in this arc, which required a human to invoke `runBatch` manually every time.
4. **G.1's SQL migration is written but not applied** — the Campaign Detail stats header will keep showing 0/0/0/0% until you run the SQL in §H yourself.

## Exact next manual step requiring authorization

Two independent manual steps remain:
1. **Commit and deploy** the G.1/G.2 fix (`git add` the migration file + `CampaignDetail.tsx`, commit, `vercel --prod`) — same pattern as every prior commit/deploy this session, blocked for me the same way.
2. **Apply the G.1 SQL migration** directly against Supabase (§H) — independent of the commit/deploy above; either order works, but the UI fix (G.2) only helps once its own commit is deployed, and the stats fix (G.1) only helps once the SQL is applied.

Separately, decide whether/when to explicitly authorize Phase E's first watched automated run (importing one fresh test target and either waiting for the schedule or using Vercel's dashboard "Run now" to trigger the cron on demand for close observation).
