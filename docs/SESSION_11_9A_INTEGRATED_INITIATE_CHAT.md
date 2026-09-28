# Session 11.9A — Integrated Initiate Chat

Rebuilds Control → Chat as the Chat-channel implementation of
VoiceForce's unified interaction-initiation model, on top of the
plumbing Session 11.9 validated as real. Committed locally. **Not
deployed** — the migration below was also **not applied** to the live
database (see "Migration not applied" below); the user decides next
steps for both.

## Product principle applied

Voice and Chat are channels of one architecture:
`Customer 360 → Campaign/Operational Context → Call Agent → Interaction → Result/Follow-up`.
Three initiation modes now exist, replacing the old Category-first
single-mode selector:

- **Standalone Customer** — Customer → Contact → Agent → Review.
- **Campaign Customer** — Campaign → Customer (restricted to that
  campaign's real audience) → Agent (the campaign's own immutable
  `agentId`, never operator-substitutable) → Review.
- **Trial / Test** — Agent → optional manual identity → Review. This is
  now the *only* place Advanced/Manual IDs lives.

Category (Session 6.2's classification tree) is now an **optional Agent
filter** inside Standalone/Trial, not the primary journey.

## Before/after interaction model

**Before (Session 11.9 and earlier):** Category → Agent → Customer →
Contact was the only path; Customer/Contact were both optional
regardless of context; a chat had no structural relationship to a
campaign at all — nothing in the schema or code could express "this
chat happened because of Campaign X."

**After:** the mode the operator picks determines what's asked and in
what order, and — for Campaign Customer specifically — produces a real,
structural link to the actual `campaign_targets` row (not a cosmetic
label), via a new Chat-channel `campaign_executions` row created before
the chat is sent.

## Campaign→Chat relationship — investigated, then implemented minimally

Read `src/server/campaigns/{types,campaignRunner,supabaseCampaignRepository}.ts`
and the live `campaign_executions` schema/functions (via Supabase MCP)
before writing anything. Confirmed:

- `call_center_campaign_create_execution` already bumps
  `campaign_targets.attempt_count`/`last_action_at`/`status='in_progress'`
  keyed **only** on `campaign_target_id` — already fully channel-agnostic,
  no schema change needed for that part.
- `campaign_executions.call_sid` and the reconciliation pipeline
  (`reconcileExecutions.ts`) are Voice-specific: reconciliation polls
  `/call-data` by `call_sid`, and `deriveCampaignResult`
  (`resultRules.ts`) matches `campaign_result_rules` against Voice
  call-data field names (`status`/`outcome`/`escalation_trigger`).
  Chat's `/chat` response has a different, smaller field vocabulary
  (`intent`/`confidence`/`authenticated`/`data_source`), synchronously
  available (no polling/reconciliation step needed at all, unlike async
  Voice).

**Decision — implement the structural attempt link; do NOT implement
Chat result derivation this session.** Running Chat responses through
`campaign_result_rules` written for Voice risks either silent no-ops or
an accidental field-name collision producing a result no one configured
for chat — a genuine product/engineering decision, not something to
invent under this session's "do not invent Call Centre capabilities"
instruction. So: a Chat attempt against a campaign target now creates a
real `campaign_executions` row (bumping the target's real lifecycle
state), but its `reconciliation_status` intentionally stays at its
existing default and is never picked up by the Voice-only
`reconcileExecutions.ts` (which queries by `call_sid`, which a Chat
execution never has) — honestly reflecting "not yet derived," not
fabricated as complete. This is the exact same discipline Session 11.5A
used for `effective_result_id`'s "latest wins" policy and the
campaign-history authorization rule — flag the real decision rather than
guess at it.

### Schema/API changes (implemented, migration authored, not yet applied — see below)

`supabase/migrations/20261006000000_campaigns_chat_channel_execution.sql`:

- `campaign_executions` gains `channel text not null default 'voice' check (channel in ('voice','chat'))`
  and `chat_session_id uuid references chat_sessions(id) on delete set null`.
- `call_center_campaign_create_execution` gains one new defaulted
  parameter, `p_channel text default 'voice'` — every existing 3-arg
  caller (`campaignRunner.ts`'s Voice batch path) is unaffected; only a
  caller that explicitly passes `channel: 'chat'` sees new behavior.
- New function `call_center_campaign_mark_execution_chat_sent` — Chat's
  analogue of `mark_execution_triggered`, correlating by
  `chat_session_id` instead of `call_sid`.

`api/campaigns.ts` gains two new `?action=` cases on the **existing**
consolidated route (no new Vercel function, count stays 11):

- `createChatExecution` (POST `{targetId}`) — re-verifies
  `getTargetContext(targetId)` + `isAgentAuthorized`, exactly mirroring
  `handleRetryTarget`'s existing Session 9.2 authorization precedent,
  then calls `repo.createExecution(targetId, now, null, 'chat')`.
- `markChatExecutionSent` (POST `{targetId, executionId, chatSessionId?, errorDetail?}`)
  — re-verifies authorization again rather than trusting `executionId`
  alone; `chatSessionId` present → success path
  (`markExecutionChatSent`); absent → failure path (reuses the
  existing, already channel-agnostic `markExecutionFailed`).

`src/hooks/chat/useChatSession.ts`'s `send()` now, only on the first
turn and only when the operator's identity carries a
`campaignTargetId`: creates the Chat execution **before** calling the
real `/api/chat`, and reports the outcome back afterward. If execution
creation itself fails, **the chat is not sent** — a Campaign Customer
chat must be a genuine link to the target from the start, never a label
attached after the fact (the prompt's explicit "do not merely attach a
campaign label to an ordinary chat"). One honestly-documented edge case:
if the chat send succeeds but *local persistence* fails (the existing,
separate `notPersisted` condition from Session 11.9), there is no local
`chat_sessions` row to set `chat_session_id` to — the execution is left
at `'triggering'` rather than misreported as success or failure. Rare,
and consistent with the same honesty standard `notPersisted` itself
already sets for the chat message.

### Migration not applied — flagged explicitly, not a scope decision

Attempting to apply this migration (via the Supabase MCP or by reading
the migration file with Bash immediately after writing it) was blocked
by this session's own auto-mode permission classifier as "Modify Shared
Resources." Per that denial's own instruction, this was **not** worked
around through another tool — the migration file is authored, reviewed,
and committed to the repo, but genuinely **not yet applied to the live
`dtbaczafdzgctkbqviod`/`call_center` schema**. Until it is applied:

- `mapExecution` in `supabaseCampaignRepository.ts` defends against this
  exact gap — `channel: row.channel ?? 'voice'`, `chatSessionId: row.chat_session_id ?? null`
  — so every EXISTING Voice code path (campaign batch runner,
  reconciliation, target/campaign listing) continues to work completely
  unaffected, migration or not.
- The two new endpoints (`createChatExecution`/`markChatExecutionSent`)
  and therefore Campaign Customer chat initiation **will fail at
  runtime** (the RPC calls will 404/error against the live schema) until
  the migration is applied.
- **This needs the user's explicit action** — either grant this
  session/a future session permission to apply it, or apply it directly
  (e.g. via the Supabase dashboard or CLI) before Campaign Customer mode
  can be used for real.

## UX rebuild

`src/components/chat/ChatIdentitySelector.tsx` rewritten (same
component name/prop contract, `ChatConsole.tsx` needed only one small
addition — a `boundCampaignName` prop/`campaignName` pass-through, no
structural changes). WORKSPACE FIRST preserved unchanged — the
conversation `Card`'s bounded-workspace layout
(`height: calc(100vh - 44px)`, `flex-1 min-h-0`) was already correct
per Session 11.9's review and was not touched.

- A compact three-way segmented control (Standalone Customer / Campaign
  Customer / Trial-Test) replaces the old single Category-first grid.
- Each mode shows only its own relevant controls (progressive
  disclosure) — Campaign mode's Customer field only renders once a
  Campaign is picked; Trial's manual-identity fields only render when
  "Add manual test identity" is explicitly toggled on.
- A compact "Review" badge row (Customer/Campaign/Agent/Channel=Chat)
  sits above the composer in every mode, always reflecting the current
  real resolved selection — never placeholder text.
- Once bound (a session exists), the entire selector collapses to the
  same existing compact 5-field bar Session 11.9 already had — now with
  a 5th field showing the bound Campaign name when the session started
  from one (falls back to "Chat" otherwise), so the Conversation
  workspace stays dominant exactly as it did before.
- Advanced/Manual IDs relocated to live **only** inside Trial/Test mode,
  behind its own explicit toggle — it no longer appears anywhere near
  Standalone or Campaign mode.

## Reused, not rewritten (per the explicit 11.9-plumbing-is-proven instruction)

Unchanged: `/api/chat` → Call Centre `/api/v1/chat`; real immutable
`agent_id` selection; Customer 360 customer/contact lookup
(`useCustomers`/`useCustomerDetail`); the CIF-vs-internal-UUID
separation (`customerId: cif ?? undefined` /
`customer360CustomerId: customerId ?? undefined`, applied identically
in the new Campaign-mode branch); session binding
(`useChatSession`'s first-turn-only identity semantics); local chat
persistence (`api/chat/index.ts`, untouched); Chat Logs integration
(`call_center_chat_customer_links`, untouched); the asynchronous
Customer 360 reconciliation pipeline (`chatInteractionSource.ts`,
untouched).

## Channel-neutral initiation foundation

No large abstraction framework was introduced — the prompt explicitly
warned against that. The one reusable piece that emerged organically is
`CampaignExecutionChannel` (`'voice' | 'chat'`) plus the now-generic
`createExecution(targetId, now, payload?, channel?)` /
`markExecutionChatSent(...)` shape on `CampaignRepository` — a future
Initiate Call rebuild consuming the same "Campaign → real target →
execution" concept would extend this exact interface rather than invent
a parallel one. No separate "initiation context" type file was created;
the existing `SendChatMessageOptions` (chat) already carries the
channel-neutral fields (`campaignTargetId`, `campaignName`) cleanly
enough that adding a new abstraction layer on top of it would have been
premature, per the prompt's own caution.

## Exact files changed

- `supabase/migrations/20261006000000_campaigns_chat_channel_execution.sql` — new, **not applied live**.
- `src/server/campaigns/types.ts` — `CampaignExecutionChannel`; `CampaignExecution.channel`/`chatSessionId`.
- `src/server/campaigns/campaignRepository.ts` — `createExecution` gains optional `channel`; new `markExecutionChatSent`.
- `src/server/campaigns/supabaseCampaignRepository.ts` — implements both; `mapExecution` defensive fallback for the pre-migration schema.
- `api/campaigns.ts` — `createChatExecution`/`markChatExecutionSent` actions.
- `src/services/campaigns/campaignsService.ts` — `createCampaignChatExecution`/`markCampaignChatExecutionSent`.
- `src/services/chat/chatService.ts` — `SendChatMessageOptions.campaignTargetId`/`campaignName` (local-only, never forwarded upstream).
- `src/hooks/chat/useChatSession.ts` — campaign-execution orchestration around the first `send()`; `campaignExecutionId`/`campaignName` return fields.
- `src/components/chat/ChatIdentitySelector.tsx` — rewritten: three-mode UX.
- `src/pages/ChatConsole.tsx` — passes `campaignName` through as `boundCampaignName`.

**Not changed**: any Call Centre file; any enhanced/unavailable Partner
API field; `api/chat/index.ts`; `chatInteractionSource.ts`; Chat Logs;
Customer Detail; Campaign creation/workflow (`handleCreate`,
`handleImportTargets`, etc. all untouched); Initiate Call (doesn't
exist yet — out of scope, unchanged).

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean production build.
- `npm run lint` — 117 errors / 36 warnings, exact match to baseline
  (the rewrite initially introduced one new `react-hooks/exhaustive-deps`
  warning on `campaignTargets`; fixed with a `useMemo` before the final
  run — the other flagged line, `phoneNumbers`, is the exact
  Session-11.9-era pattern already present in the baseline, not new).
- Vercel function count — **11**, unchanged (both new capabilities
  extend existing consolidated route files).
- **Live data verified (Supabase MCP, read-only):** the real campaign
  and its real targets exist (`myOutC01` / `emi-reminder-agent`, 3
  targets against one real customer, "Kwame Mensah" — no CIF on this
  particular customer, correctly exercising the "omit customer_id
  honestly, still resolve phone + local correlation" path the Campaign
  mode branch shares with the Standalone path). Confirmed
  `call_center_campaign_create_execution` already bumps target
  attempt_count/status keyed only on `campaign_target_id`, before
  writing any code against it.
- **Code-traced, not live-clicked:** Standalone Customer → Contact → Agent
  (unchanged code path from Session 11.9, re-verified structurally
  intact after the rewrite); Campaign → audience-restricted Customer →
  campaign-bound Agent (new — traced end-to-end through the component,
  service, and API layers, but not exercised in a browser); Trial/Test
  isolation (traced — Trial mode's identity payload never includes
  `customer360CustomerId`/`campaignTargetId`, so nothing it produces can
  reach Customer 360 or campaign correlation code paths, by
  construction); the CIF/UUID safety rule (re-verified line-by-line in
  the new Campaign-mode branch, identical separation to the existing
  Standalone branch Session 11.9 already confirmed); Chat Logs/Customer
  360 correlation (untouched code paths — nothing in this session
  changed `api/chat/index.ts` or the reconciliation pipeline, so Session
  11.9's verification of those paths still applies unchanged).
- **Not live-verified — the local `vercel dev` limitation from Sessions
  11.7/11.5B/11.9 recurred identically here** (re-confirmed this
  session, not assumed): `vercel dev` only launches bare `vite`, the
  `api/*.ts` functions aren't bound behind it in this environment. No UI
  click-through and no 4-viewport × Light/Dark responsive/theme pass
  were performed, honestly reported rather than substituted with static
  inspection, per the session's own explicit instruction not to do that.
  A future deploy+verify session (the Session 11.8 pattern) is the right
  place for this, once the migration above is applied.

## Remaining dependency on future Partner API

None introduced or deepened this session. Campaign Customer chat still
only uses today's live `/chat` fields; no `expected_input_fields`,
`agent_inputs`, `actual_outcome_code`, or structured outputs were
assumed, mocked, or given placeholder UI anywhere.

## Implications for subsequent Initiate Call implementation

- The `CampaignExecutionChannel`/`createExecution(..., channel)` shape
  is now genuinely reusable for Voice too — a future Initiate Call
  rebuild's "Campaign Call" mode can call the exact same
  `createExecution(targetId, now, payload, 'voice')` this session's
  `'chat'` branch uses, rather than only ever going through
  `campaignRunner.ts`'s batch path.
- The **same open Chat-result-derivation question** applies in reverse
  to Voice once Chat needs it: if a future session wants a real,
  channel-neutral Campaign Result, `deriveCampaignResult`/
  `campaign_result_rules` need either channel-aware matching or two
  parallel rule sets — a product decision, not an engineering default,
  exactly as flagged above.
- Initiate Call's own "Standalone Customer / Campaign Customer /
  Trial-Test" three-mode structure can mirror this session's UI pattern
  (segmented control → progressive disclosure → Review badges →
  collapse-on-bind) directly — nothing here is Chat-specific in shape,
  only in which backend call fires.

## Boundaries held

No VoiceForce-side LLM. No `agent_version` anywhere. No fake
customers/campaigns/agents — every campaign/target/customer referenced
in this session's verification was real, read live from production. No
enhanced Partner API assumptions. No Call Centre changes. Customer 360
and Campaign management screens/workflows were not redesigned — only
`api/campaigns.ts`'s existing action dispatcher and the campaign
domain-layer files needed for execution creation were touched. No live
chat message was sent this session (execution-creation code was traced
and read-verified against real DB rows, but never exercised, since the
migration it depends on isn't applied yet — sending would have failed
regardless).

## Local commit

`<recorded after commit — see git log>`
