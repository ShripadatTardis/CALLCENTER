# Session 9.2 — Outbound Campaign Product Completion

**Status:** implemented, deployed, and live-verified against production.
**Scope:** campaign authorization (highest priority) + honest operational
UX corrections on top of Session 5/9.1's real campaign engine.

---

## 1. Executive summary

Session 9.1 made the campaign engine Call-Agent-contract-aware. Session 9's
own audit found one real, unaddressed gap left over from every prior
campaign session: **campaign objects had zero category/role authorization**
— the same class of gap Session 6.2 found and fixed for Call Logs/Chat Logs.
This session closes it, reusing the identical existing authorization
architecture verbatim (`resolveAccessForRequest`, `customer360_categories` /
`customer360_category_agents` / `role_customer360_categories` /
`role_customer360_access`) — no parallel security model was invented.

Beyond authorization, this session made two small, honest UX corrections
found during the Phase A audit: a non-functional "Scheduled Start" field in
Create Campaign (captured in state, never sent anywhere, never wired to any
scheduler) was replaced with honest copy explaining that campaigns start
only on explicit launch, and the Agent Contract panel's wording was made
explicit about *why* input/outcome metadata is empty for today's agents.
Everything else audited in Campaign List/Detail was already real and
honest — no other mock, misleading, or no-op element was found.

**No live outbound call was placed anywhere in this session.** Every
lifecycle/authorization check was verified via `create` / `get` /
`listTargets` / `importTargets` / `start` / `pause` / `retryTarget` /
`scheduleFollowup` and direct Supabase inspection — none of which place a
Trigger Call. `runBatch` (the only action that can) was invoked only to
confirm it remains admin-token-gated (a 401 probe, not an actual run).

## 2. Pre-build audit findings

**Actual current campaign action list**, confirmed from `api/campaigns.ts`
(not the prompt's approximate list): `list`, `get`, `listTargets`,
`create`, `importTargets`, `setInputMappings`, `start`, `pause`, `resume`,
`stop`, `retryTarget`, `scheduleFollowup`, `runBatch` [admin], `reconcile`
[admin] — 14 actions, one more than the prompt's approximate 13
(`setInputMappings`, added in Session 9.1).

**Actual current authorization state, before this session**: confirmed
empirically zero. Every action other than `runBatch`/`reconcile` had no
authentication or authorization check of any kind — any caller, with any
role header (or none), could read or mutate any campaign regardless of its
agent's category. This matches Session 9's own finding exactly; nothing
had changed since.

**Campaign UI audit** (List/Detail/Create wizard): overwhelmingly real.
Real data throughout, real Start/Pause/Resume/Stop/Retry (each genuinely
persists — no no-op buttons found), honest unclassified/pending states
already distinguished from failure, the Agent Contract snapshot already
shown rather than a live re-lookup. The **only** genuinely misleading
element found: Create Campaign's "Scheduled Start (optional)" field — it
collected a datetime value that was never passed to `createCampaign` and
had no effect whatsoever, while its copy ("save as a draft and start
manually later") did not make that emptiness clear enough. No other mock,
duplicated, or technically-present-but-unexposed element was found in
these three screens.

**Data availability**: every UI element already on these screens traces to
a real column/RPC. No new UI element was added in this session beyond a
"Follow-up Due" column on the targets table, which surfaces
`campaign_targets.next_action_at` — a real, already-fetched field that was
previously computed but never displayed.

## 3. Authorization before/after matrix

| Action | Tier | Before | After |
|---|---|---|---|
| `list` | Read | none | server-filtered by `campaign.agentId`; page-scoped `totalCount` + `scoped:true` for non-all-access roles (same honesty limitation as `api/calls/data.ts` — no authorized-aggregate RPC exists for campaigns) |
| `get` | Read | none | 404 if `campaign.agentId` not authorized |
| `listTargets` | Read | none | fetches campaign first, 404 if not authorized |
| `create` | Management | none | 403 if the requested `agentId` is not authorized |
| `importTargets` | Management | none | 404 if the target campaign's agent is not authorized |
| `setInputMappings` | Management | none | 404 if the target campaign's agent is not authorized |
| `start` / `pause` / `resume` / `stop` | Management | none | 404 if the target campaign's agent is not authorized |
| `retryTarget` | Management | none | resolves `targetId → campaignId/agentId` via the new `call_center_campaign_get_target_context` RPC; 404 if target doesn't exist or its campaign's agent isn't authorized |
| `scheduleFollowup` | Management | none | same target-context resolution as `retryTarget` |
| `runBatch` | Internal/admin | admin-token gate only | **unchanged** — still admin-token gate only, no category check added (operates across every campaign by design, same as Customer 360's backfill/reconcile) |
| `reconcile` | Internal/admin | admin-token gate only | **unchanged**, same reasoning |

`unauthenticated` (the fail-closed default when no role header is sent)
resolves to `authorizedAgentIds: []`, so every read/management action is
correctly denied by default — verified live.

## 4. Files changed

**New:**
- `supabase/migrations/20261003000000_campaigns_authorization_support.sql`

**Modified:**
- `api/campaigns.ts` — every non-admin handler now takes and enforces
  `AuthorizedAccess`; `resolveAccessForRequest` resolved once per request,
  skipped entirely for admin actions.
- `src/server/campaigns/campaignRepository.ts` — new `getTargetContext`
  method on the interface.
- `src/server/campaigns/supabaseCampaignRepository.ts` — implements
  `getTargetContext` via the new RPC.
- `src/services/campaigns/campaignsService.ts` — every function gained an
  optional `role` parameter (default `'unauthenticated'`, fail-closed),
  sent as `x-user-role`, exactly mirroring
  `src/services/calls/callsService.ts`'s existing convention.
- `src/hooks/campaigns/{useCampaigns,useCampaignDetail,useCampaignActions,useImportTargets}.ts`
  — each now sources `role` from `useAuth()` and threads it through, role
  included in query keys (same convention as `useCallData`).
- `src/pages/CreateCampaign.tsx` — fixed a regression risk this session's
  own auth change would otherwise have introduced (`importCampaignTargets`/
  `startCampaign` were called directly from the service layer, bypassing
  the hooks — now passes `role` explicitly); removed the non-functional
  "Scheduled Start" field, replaced with honest execution-model copy.
- `src/components/campaigns/CampaignDetail.tsx` — honest Agent Contract
  wording for partial/legacy contracts; new "Follow-up Due" column
  surfacing already-fetched `nextActionAt` data.
- `src/pages/OutboundCampaigns.tsx` — small "Showing campaigns for your
  authorized categories only" note when the list response is `scoped`.
- `src/types/campaign.ts` — added optional `scoped?: boolean` to
  `CampaignListResponse` (additive).

## 5. Schema changes

One new function only, no table/column change: `public.call_center_campaign_get_target_context(p_target_id uuid) returns jsonb`
— joins `campaign_targets` → `campaigns` to resolve `{targetId, campaignId, agentId}` for a given target, needed because `retryTarget`/`scheduleFollowup`
only ever received a `targetId`, never a `campaignId`, and trusting a
client-supplied `campaignId` for authorization would itself be a security
hole. `SECURITY DEFINER`, `service_role`-only — verified via
`has_function_privilege` (`service_role: true`, `anon: false`). Same
lockdown `do $$ ... like 'call_center_campaign_%' $$` re-applied,
idempotent, touches nothing else.

## 6. Campaign List changes

Added the honest `scoped: true` + page-scoped `totalCount` behavior
(identical convention to `api/calls/data.ts`) for non-all-access roles,
and a one-line UI note when that flag is set. No fabricated percentages
were ever present; none were added. All-access behavior is byte-for-byte
unchanged.

## 7. Campaign Detail changes

- Agent Contract panel: for a `partial`/`legacy` contract, now shows
  explicit copy ("Expected input, outcome, and output field metadata are
  not currently exposed by Call Centre for this agent... This is a Call
  Centre capability state, not an application error") instead of a bare
  `legacy / partial` label — directly satisfies Phase D's "do not make
  this look like an application error" requirement.
- New "Follow-up Due" column on the targets table, sourced from
  `target.nextActionAt` (already fetched, previously unused) when
  `target.status === 'follow_up_due'`.
- No other change — the existing Overview/Targets/Result columns were
  already real and honest.

## 8. Audience/Target UX

Not materially changed this session. `campaign_targets.source_attributes`
already snapshots CSV-imported business fields at import time, and
`customer_id`/`contact_point_id` already resolve Customer 360 identity
server-side — audited and confirmed still correct, no gap found requiring
a fix. A dedicated Customer-360-vs-CSV visual distinction in the UI was
considered and **deferred** (see §20) — it would be a genuine new UI
feature, not a correctness fix, and the session's priority was the
authorization gap.

## 9. Agent Contract UX

Covered in §7 above — this is the only Agent Contract UI change this
session made (wording only; the underlying domain model, snapshot
persistence, and input-mapping machinery are all Session 9.1's, untouched
here).

## 10. Execution/Result UX

No change. Already honest: technical execution status, reconciliation
status, and campaign business result were already kept visually and
conceptually distinct in `CampaignDetail.tsx` before this session (audited,
confirmed, not modified).

## 11. Follow-up UX

Partially addressed: real follow-up *state* (due date, when a target is
`follow_up_due`) is now visible on the targets table (§7). A dedicated,
separate Follow-ups list/read view was **not** built — no read/list RPC
exists for `campaign_followups` today (only `create`), and building one
would be new backend read capability, which the prompt's own scope
discipline ("do not broaden beyond these objectives") argued against
adding speculatively. Documented as a deferred item (§20), not silently
omitted.

## 12. Analytics changes

None. Session 7's `CampaignAnalyticsTab.tsx` already consumes
`useCampaigns()` — it now automatically respects the new server-side
authorization (a scoped role will correctly see fewer campaigns in its own
analytics), a direct, intentional benefit of this session's fix rather
than a separate change.

## 13. Scheduling status

**Confirmed, unchanged, and now honestly surfaced in the UI.** No
automatic scheduler exists anywhere in the repository that promotes a
`scheduled`-status campaign into execution — `campaigns.scheduled_start_at`
was, before this session, captured by the Create Campaign wizard but never
even sent to the backend (a dead field, not merely an unused one). This
session did **not** build a scheduler (per the prompt's explicit
instruction — it would require new infrastructure/cron/another Vercel
function/material execution semantics, none of which is trivial). Instead,
the non-functional field was removed and replaced with copy that states
plainly: campaigns start only via explicit Start (immediate or later from
Campaign Detail) — no automatic promotion exists yet. The gap is
documented, not hidden.

## 14. Correlation status

**Unchanged — still PARTIALLY CONFIRMED**, exactly as Session 9 and 9.1
left it. `CAMPAIGN_RECONCILIATION_CORRELATION_MODE` was not touched, no new
evidence was found (none was sought — this session's scope explicitly
excluded a correlation experiment), and `reconcileExecutions.ts`'s matching
logic is byte-for-byte unchanged. Confirmed via `git diff` that this file
has zero changes in this session.

## 15. Partner API dependencies still open

Unchanged from Session 9.1's §11 — all four P0 items remain open (Agent API
expected-input/outcome/output metadata; Trigger Call accepting
`agent_inputs`; Call Log returning agent_id/actual-outcome/structured
outputs; a deterministic call-identifier contract). Nothing in this session
required or assumed progress on any of them.

## 16. Backward compatibility

- The new authorization layer defaults every unauthenticated/no-role
  request to `authorizedAgentIds: []` (deny-by-default) — but every real
  UI call site (`useCampaigns`/`useCampaignDetail`/`useCampaignActions`/
  `useImportTargets`/`CreateCampaign.tsx`) now sources and sends the real
  session role via `useAuth()`, so an authorized user sees **zero**
  behavior change. Verified live end-to-end (§17).
- Legacy campaigns (created before Session 9.1, with no agent contract
  snapshot) are unaffected — authorization is keyed on `campaigns.agent_id`
  alone, a column that has existed since Session 5.
- No RPC parameter was removed or reordered; the one new RPC is purely
  additive.

## 17. Tests performed

**Authorization — all verified live against production**, using two
throwaway test roles (`test_9_2_emi_only`, scoped to EMI Reminder;
`test_9_2_forex_only`, scoped to Forex Transaction) created via the
Supabase MCP and fully deleted afterward:

- `get`/`listTargets` on an EMI-agent campaign: 200 for the EMI-scoped
  role and the all-access role (`call_center_head`), **404** for the
  Forex-scoped role and for no role header at all.
- `list`: Forex-scoped role saw only its own campaign
  (`scoped:true`, 1 row); all-access role saw both test campaigns, no
  `scoped` flag.
- `create` for `emi-reminder-agent` as the Forex-scoped role: **403**.
  `create` for `forex-transaction-agent` as the Forex-scoped role: **201**.
- `start`/`pause` on the EMI campaign: **404** as the Forex-scoped role,
  **200** as the EMI-scoped role.
- `importTargets` on the EMI campaign: **404** as the Forex-scoped role,
  **200** (real Customer 360 customer created) as the EMI-scoped role.
- `retryTarget`/`scheduleFollowup`, which take only a `targetId`: **404**
  as the Forex-scoped role (blocked before the eligibility/business-rule
  layer is even reached); as the EMI-scoped role, authorization correctly
  passed through and the request reached the real business logic beneath
  it (`retryTarget` returned the RPC's own "not eligible for retry" error
  for a `pending`-status target — not an auth error; `scheduleFollowup`
  succeeded, creating a real follow-up row).
- `retryTarget` with a garbage/nonexistent `targetId` as the all-access
  role: **404** (the new lookup RPC correctly returns null, not a crash).
- `runBatch`/`reconcile` without an admin token: **401**, unchanged —
  confirms the stronger existing gate was not weakened.

**Campaign lifecycle — verified without placing any live call**: `create`,
`importTargets` (real Customer 360 resolution), `setInputMappings`
(implicit, no live real-agent contract to map against, same as Session
9.1's finding), `start` → `pause` → status transitions, all confirmed via
the deployed API's real responses. **`runBatch` was never invoked with a
real batch size against real targets** — it was probed only for its
admin-token gate (a 401 check), which cannot place a call. **No `POST
/api/v1/call` request was made anywhere in this session's verification.**

**UI**: Create Campaign's wizard steps reviewed (Agent Contract/Input
Mapping steps confirmed unchanged from Session 9.1's honest partial-state
handling); the Scheduling step's copy change and the Detail page's two
UI additions were reviewed in source for correctness (no dev server was
run locally, per this project's established production-verification
convention — the actual deployed bundle was exercised via the live API
calls above, not a local render).

**All synthetic data fully cleaned up**: 2 test campaigns (with their
targets/executions/results/followups/rules/mappings), 1 synthetic
Customer 360 customer + contact point, and both throwaway test roles —
confirmed via a final count query: `campaigns: 0`, `campaign_executions:
0`, `role_customer360_access` rows matching `test_9_2%`: `0`.

## 18. Build/lint/function-count results

- `tsc --noEmit` — clean.
- `npm run build` — clean (one pre-existing chunk-size warning, unrelated).
- `npm run lint` — 56 errors / 19 warnings, the exact pre-existing
  baseline; zero new issues, confirmed none of the flagged files were
  touched this session.
- Vercel's own build (the stricter TypeScript check Session 9.1 found
  isn't covered by local `tsc --noEmit`) — succeeded on the first deploy
  attempt, no rejection this time.
- Vercel function count: **11 before, 11 after** — one new SQL function,
  zero new route files.

## 19. Production deployment status

Deployed via `npx vercel --prod --yes` to
`https://callcenter-three-livid.vercel.app`, confirmed live and exercised
directly via the authorization test suite in §17 (not just a health-check
ping — every test above ran against the real deployed production API).

## 20. Known gaps

- No dedicated Follow-ups list/read view — no read RPC exists for
  `campaign_followups` (§11). Deferred rather than adding new backend read
  capability speculatively.
- No Customer-360-vs-CSV visual distinction in the Audience/Targets table
  (§8) — a genuine UX enhancement, not a correctness issue, deferred to
  keep this session's scope on the identified P0 (authorization).
- Scheduling remains manual-start-only, honestly labeled (§13) — building
  a real scheduler is explicitly out of scope per the prompt.
- Correlation remains PARTIALLY CONFIRMED (§14) — unchanged, no experiment
  was run.
- No stop condition from the prompt's own §22 list was hit: the existing
  VoiceForce authorization model applied cleanly (campaigns' own
  `agent_id` was the natural, already-proven fit — no new security model
  was needed), no UI data required fabrication, no second campaign engine
  was needed, no LLM, no fuzzy correlation, no unsupported Partner API
  field, the one migration was purely additive, function count stayed
  well within budget, no test path required a live call, and no existing
  campaign behavior had to be broken.

## 21. Recommended next session

Unchanged from Session 9/9.1's own recommendation: the single highest-value
next step remains **empirically resolving the campaign call-correlation
identifier** (one real Trigger Call, compared byte-for-byte against its
resulting `/call-data` row), which this session deliberately did not
attempt. A secondary, smaller candidate for a future session: build the
`campaign_followups` list/read RPC + UI (§11/§20) now that authorization
exists to gate it correctly from day one.
