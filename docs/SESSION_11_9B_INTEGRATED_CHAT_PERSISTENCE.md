# Session 11.9B — Fix Integrated Chat Persistence

Reworks 11.9A's Campaign→Chat persistence after a self-audit (relayed
to the user, then confirmed here in code) found it unsafe. The
Standalone / Campaign / Trial-Test UI/UX from 11.9A is **preserved
unchanged** — this session is a persistence-layer fix only. Committed
locally. **Not deployed. Migration not applied** (see below).

## What was wrong in 11.9A

11.9A made Campaign Customer chat create a real `campaign_executions`
row (`channel='chat'`) before sending, reusing the existing
attempt-count bump. The self-audit found the write side was fine, but
the **read/reconciliation side was not gated by channel at all**:

- `call_center_campaign_list_pending_reconciliations` filters only on
  `reconciliation_status = 'pending' and status = 'triggered'` — no
  `call_sid`/channel check. A Chat execution enters this queue exactly
  like a Voice one.
- `findDiagnosticCandidate()` (`reconcileExecutions.ts`) searches Call
  Centre `/call-data` by the target's phone number with no `call_sid`
  or channel gate, and writes whatever it finds into that Chat
  execution's `reconciliation_candidate` — a spurious "matching voice
  call" attached to a chat attempt.
- Because `tryAuthoritativeMatch()` requires `execution.callSid`
  (always null for Chat), a Chat execution can **never** reach
  `reconciled` — it deterministically times out to
  `reconciliation_status = 'unresolved'` after 30 minutes, **every
  time**, regardless of whether the chat succeeded.
- `call_center_campaign_update_reconciliation_status`'s `unresolved`
  branch unconditionally sets `campaign_targets.status =
  'follow_up_due'` — so every Campaign Customer chat's target would
  eventually show as needing follow-up, misrepresenting Customer
  Campaign History for a completed interaction, and creating a real
  (human-mediated, via a normal operator Retry click) path to an
  unwanted outbound Voice call.
- `triggeredCount` (campaign stats / Agent Detail "Campaigns" usage) is
  `count(...) filter (where status = 'triggered')` — channel-blended,
  no way to tell Chat and Voice attempts apart in that number.

Separately, 11.9A's Trial/Test mode had **no structural isolation
marker at all** — nothing prevented a manually-typed real CIF/phone
from being picked up by the existing async Customer 360 reconciliation
pipeline (`chatInteractionSource.ts`), which pulls from Call Centre's
own `/chat/sessions` list independent of any local flag.

## What was removed

`git checkout bdf9435^ -- <path>` restored these files to their exact
pre-11.9A state (verified via `git diff bdf9435^` showing zero
remaining diff):

- `src/server/campaigns/types.ts` — `CampaignExecutionChannel`,
  `CampaignExecution.channel`/`chatSessionId` removed.
- `src/server/campaigns/campaignRepository.ts` — `createExecution`'s
  `channel` param and `markExecutionChatSent` removed.
- `src/server/campaigns/supabaseCampaignRepository.ts` — matching
  adapter code removed.
- `api/campaigns.ts` — `createChatExecution`/`markChatExecutionSent`
  actions removed.
- `src/services/campaigns/campaignsService.ts` —
  `createCampaignChatExecution`/`markCampaignChatExecutionSent`
  removed.
- `supabase/migrations/20261006000000_campaigns_chat_channel_execution.sql`
  — deleted (it was never applied to the live database, so nothing
  needed to be un-applied).

**The Voice campaign execution/reconciliation pipeline itself
(`campaignRunner.ts`, `reconcileExecutions.ts`, `resultRules.ts`, and
every `campaign_executions`/`campaign_results` SQL function) was not
modified in this session** — it is now byte-identical to its
pre-11.9A state, confirmed by the empty diff above.

## Final Campaign→Chat persistence model

Chat's own persistence (`chat_sessions`) gains a direct, real link —
no execution row, no reconciliation, nothing Voice-shaped:

```
ChatIdentitySelector (Campaign Customer mode)
  Campaign(select) → Customer (that campaign's real campaign_targets only) → Agent (campaign.agentId, read-only)
    → identity { agentId, customerId: CIF, phoneNumber, customer360CustomerId, campaignId, campaignTargetId, campaignName }

useChatSession.send(text, identity)
  → sendChatMessage(role, text, sessionId, identity)   [unchanged shape, 4 new local-only fields]
    → POST /api/chat  { message, session_id, agent_id, customer_id, phone_number,
                         customer360_customer_id, campaign_id, campaign_target_id }
      → upstreamPayload = { message, session_id, agent_id, customer_id, phone_number, ... }  [campaign_id/campaign_target_id/is_trial NEVER copied in]
      → real Call Centre POST /api/v1/chat
      → supabaseChatRepository.createOrTouchSession(..., { customer360CustomerId, campaignId, campaignTargetId, isTrial })
        → call_center_chat_create_session(...)  → chat_sessions row: customer_id, campaign_id, campaign_target_id, is_trial
```

One RPC call, one existing table, zero new persistence round trips.
`campaign_id`/`campaign_target_id` are set only on the first message
(mirroring how `agent_id` already "binds on first message") and
preserved — never overwritten — on later touches of the same session,
via the same `coalesce(existing, excluded)` pattern the `customer_id`
column already used.

**Campaign membership still comes only from `campaign_targets`** — the
Customer selector in Campaign mode is populated from
`GET /api/campaigns?action=listTargets`, a real target row's
`customerId`/`contactRawValue`, never inferred from Chat Logs or any
other source.

**No Campaign Result claim.** Nothing in this session (or 11.9A) runs
Chat through `campaign_result_rules`/`deriveCampaignResult`. A
successful Chat is not treated as a Voice Campaign Result — there is no
existing, genuinely channel-neutral result mechanism to support that
claim today, and none was invented.

## Trial/Test isolation model — fixed properly

New local-only marker: `chat_sessions.is_trial boolean not null default false`,
set once at creation (`call_center_chat_create_session`'s new
`p_is_trial` param) and **never** included in the `on conflict` update
list — permanently fixed for the life of the session, not alterable by
a later touch.

`ChatIdentitySelector`'s Trial/Test mode now sends `isTrial: true`
**unconditionally**, regardless of whether the operator fills in
manual identity fields — this is the actual isolation mechanism, not
merely "we don't auto-populate campaign/customer context."

**Enforcement, not just labeling**: `chatInteractionSource.ts` (the
adapter `reconcileJob.ts` uses to materialize Chat into Customer 360)
now looks up each candidate session's `is_trial` flag via a new,
purpose-built RPC (`call_center_chat_session_trial_flags` — a plain
`select` against `chat_sessions`, deliberately a separate function from
the existing `call_center_chat_customer_links`, which INNER JOINs
`customers` and is already relied on by Chat Logs display; not
touching that proven function's join semantics is what keeps Chat Logs
unregressed) and **excludes** any Trial-flagged session before identity
resolution ever runs — in both `listPage` (the reconciliation batch
path) and `searchByContactPoint`. This means a Trial chat with a
manually-typed real CIF/phone still cannot become a `customer_interactions`
row, because the exclusion happens before phone/CIF matching, not
instead of relying on the absence of a match.

The lookup is wrapped to fail safe: if the trial-flags RPC itself
errors (e.g. the migration below isn't applied yet in some
environment), it logs and returns an empty map — reconciliation for
real production Chat keeps working, at the cost of no Trial protection
until the migration is applied (the same, unchanged risk that exists
today with zero Trial marker at all — not a new hole).

**Visible, not just structural**: `ChatConsole.tsx` now shows a
persistent "Trial / Test — excluded from Customer 360 & campaign
analytics" badge in the Conversation card header for the whole session,
and the collapsed bound-identity bar shows a "Trial / Test" badge in
place of the Customer/Campaign field — satisfying "visibly and
persistently isolated," not only "structurally isolated."

## Schema/RPC changes

`supabase/migrations/20261007000000_chat_campaign_context_and_trial_marker.sql`
(**not applied live** — see below):

- `chat_sessions` gains `campaign_id uuid references campaigns(id) on delete set null`,
  `campaign_target_id uuid references campaign_targets(id) on delete set null`,
  `is_trial boolean not null default false`.
- `call_center_chat_create_session` gains three new defaulted params
  (`p_campaign_id`, `p_campaign_target_id`, `p_is_trial`) appended to
  its existing 13-arg signature — every existing caller is unaffected;
  `is_trial` deliberately excluded from the `on conflict` update list.
- New function `call_center_chat_session_trial_flags(text[])` — plain
  select, no join, returns `is_trial` for every requested session that
  exists locally.

**Zero changes to any `campaign_executions`/`campaign_results`/
reconciliation table or function.**

### Migration not applied — same reason as 11.9A

Applying this migration (or reading a freshly-written migration file
immediately with Bash) was blocked again by this session's own
permission classifier as "Modify Shared Resources." Consistent with
11.9A and with that denial's own instructions, this was not worked
around. Every consumer of the new columns has a defensive fallback for
the pre-migration schema:

- `supabaseChatRepository.mapSession`: `campaignId: row.campaign_id ?? null`,
  `campaignTargetId: row.campaign_target_id ?? null`, `isTrial: row.is_trial ?? false`.
- `chatInteractionSource.ts`'s trial-flag lookup: wrapped in try/catch,
  defaults to "no Trial sessions known" on failure.

Until the migration is applied: Campaign Customer chat and Trial/Test
isolation **will not actually persist** their context/marker (the RPC
call will fail against the live schema, since the new params don't
exist there yet) — this needs the user's explicit action, exactly as
flagged in 11.9A.

## Why Voice campaign execution/reconciliation is unaffected

Nothing in this session's code calls `createExecution`,
`markExecutionTriggered`, `markExecutionFailed`,
`listPendingReconciliations`, or `updateReconciliationStatus` from any
Chat code path — confirmed by grep across every touched file (zero
matches for `campaign_execution`/`CampaignExecution` outside of prose
comments explaining what was removed and why). The campaigns domain
files are diff-identical to their pre-11.9A state. A Chat-initiated
interaction now has no representation whatsoever in
`campaign_executions` — it cannot enter `listPendingReconciliations`'s
query because no row for it ever exists there.

## Implications for the future Initiate Call / shared-channel architecture

- The **channel-neutral concept that survives** is the identity/context
  payload shape (`campaignId`/`campaignTargetId`/`customer360CustomerId`/
  `isTrial` alongside the existing `agentId`/`customerId`/`phoneNumber`),
  not a shared execution table. A future Initiate Call could reuse this
  same shape for Voice's own "Standalone/Campaign/Trial" modes without
  needing `campaign_executions` involvement either, if Voice's own
  Campaign Call mode is later redesigned — but that is out of this
  session's scope and not attempted here.
- **The open question 11.9A raised — whether Chat should ever produce a
  genuine, channel-neutral Campaign Result — remains open and is now
  explicitly NOT approximated by entering Chat into Voice's
  `campaign_result_rules` engine.** If a future session wants real Chat
  campaign outcomes, that needs its own deliberate design (e.g.
  chat-specific result rules, or a genuinely channel-neutral rule
  schema) — a product decision, still not made here.
- Voice's own execution/reconciliation system remains a single-channel
  system by design after this session, per the explicit instruction not
  to attempt a "universal execution-engine rewrite" here.

## Verification

- **Pre-migration-application code check (item 7's explicit
  requirement) — done before writing any further code:** grepped every
  touched file for `campaign_execution`/`CampaignExecution` references;
  confirmed zero code calls (only explanatory prose comments remain).
  Confirmed via `git diff bdf9435^ -- <5 campaigns-domain files>` that
  the campaigns domain is byte-identical to its pre-11.9A state.
- `npx tsc --noEmit` — clean.
- `npm run build` — clean production build.
- `npm run lint` — 117 errors / 36 warnings, exact match to baseline.
- Vercel function count — **11**, unchanged.
- **Live data (Supabase MCP, read-only) — re-confirmed, not re-derived
  from 11.9A's own claims:** the real campaign (`myOutC01` /
  `emi-reminder-agent`) and its 3 real targets against one real
  customer still exist and are exactly what Campaign mode's selector
  would resolve against.
- **Code-traced, not live-clicked (same honesty discipline as every
  prior session in this programme):**
  - Campaign → actual campaign target Customer: traced through
    `ChatIdentitySelector`'s Campaign branch → real `CampaignTargetRow`
    fields, unchanged from 11.9A's already-reviewed logic.
  - Campaign's immutable Agent: `selectedCampaign.agentId`, read-only
    display, never operator-substitutable — unchanged.
  - Campaign/Target context retained on the Chat session: traced
    end-to-end through the code path above; **not live-verified**,
    since the migration it depends on is not applied.
  - No `campaign_execution` created by Campaign Chat: confirmed by the
    grep/diff check above — structurally impossible now, not merely
    "didn't happen to run."
  - No Voice reconciliation candidate generated: same reasoning — no
    code path exists that could create one from Chat.
  - No target status/follow-up mutation merely from initiating Chat:
    confirmed — no Chat code path touches `campaign_targets` at all
    anymore.
  - Standalone Customer correlation: unchanged from Session 11.9's
    already-verified logic; re-read, not modified.
  - Trial/Test isolation: the exclusion logic in
    `chatInteractionSource.ts` was traced line-by-line; **not
    live-verified end-to-end** (requires the migration to be applied
    and a real reconciliation run against a real Trial session, neither
    of which was done here).
  - CIF/internal-UUID safety: re-verified unchanged in both the
    Standalone and Campaign branches — `customerId` is always `cif ??
    undefined`/`campaignCif ?? undefined`, `customer360CustomerId` is
    always the separately-named field, never conflated.
  - Existing Chat Logs/Customer 360 behavior: `call_center_chat_customer_links`
    and its consumers were not touched by this session at all; the new
    trial-flags lookup is a fully separate function/code path.
- **No live chat message sent** — per the explicit instruction, and
  moot regardless since the underlying migration isn't applied yet.
- Not attempted this session (unrelated to this fix, not requested):
  the 4-viewport × Light/Dark responsive harness — the same local
  `vercel dev` limitation from Sessions 11.7/11.5B/11.9/11.9A would
  recur identically; not re-run needlessly here since the same
  limitation was already reconfirmed in 11.9A.

## Local commit

`0d5d2b3`
