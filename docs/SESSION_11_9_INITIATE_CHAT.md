# Session 11.9 — Initiate Chat Review + Implementation

Review-then-implement session on the existing Control → Chat / Initiate Chat screen
(`/chat`, `src/pages/ChatConsole.tsx` + `src/components/chat/ChatIdentitySelector.tsx`).
Not deployed. Local commit only.

## Existing architecture discovered

The screen was built across earlier sessions (Session 5.1's real session-binding
amendment, Session 7.1 §19's Category → Agent → Customer → Contact guided selector) and
was found to already be substantially correct against the current live backend
contract and the Customer 360 identity rules. This was a verification-heavy session,
not a rebuild.

**Flow.** `ChatConsole.tsx` renders `ChatIdentitySelector` (identity/selection UI) above
a bounded conversation `Card`, backed by `useChatSession` (session/message state) →
`chatService.sendChatMessage()` → this app's own `/api/chat` proxy
(`api/chat/index.ts`) → the real upstream `POST /api/v1/chat`. No mock/local echo
anywhere in this path.

**Category → Agent.** `useClassification()` calls `GET /api/agents?action=classification`,
which reuses the same `customer360_categories` / `customer360_category_agents` /
`role_customer360_categories` / `role_customer360_access` primitives as every other
Customer 360-authorized surface — no separate authorization model for chat. Verified
live against the database: 3 categories, each mapped to exactly one immutable
`agent_id` (`forex-transaction-agent`, `emi-reminder-agent`,
`inbound-banking-default`) — the same 3 agent IDs the AI Agents screen (Session 11.7)
shows, confirming one shared roster, not a duplicated one.

**Customer / Contact.** Customer search uses `useCustomers()` → the real, authorized
`/api/customers` search (canonical Customer 360, not a parallel lookup). Contact
(phone) options come from `useCustomerDetail()` → the real `/api/customers/{id}`
response's `phoneNumbers`, itself sourced from `customer_contact_points`. Verified
live against the database that real phone-type contact points exist and are what the
UI's `phoneNumbers` array is built from.

**Advanced / Manual IDs.** A secondary, explicitly-labeled toggle path
("Advanced / Manual IDs (support & testing)"), off by default — the guided selector is
the default and primary workflow. Confirmed correctly de-emphasized (smaller ghost
button, explicit "support & testing" label) — no change needed.

## Changes actually made

One file, one line — a visual honest-state fix, not a behavior change:

- `src/components/chat/ChatBubble.tsx` — the "Not saved" indicator (shown when a turn's
  DB persistence failed but the chat reply still returned) used a single unpaired
  `text-amber-600` literal with no dark-mode counterpart. Changed to
  `text-amber-700 dark:text-amber-400`, the exact paired convention already
  established in Live View (Session 11.2A) and reused again in Session 11.5B's own
  HIG follow-up — for consistency, not a new pattern.

No other code changes were made. Category/Agent/Customer/Contact selection,
session-binding, message sending, and Customer 360 correlation were all found to
already satisfy the review's checklist (detailed below) — per the explicit instruction
not to redesign working behavior for visual consistency alone, nothing else was
touched.

## Exact chat API / session flow

1. First turn: `sendChatMessage()` omits `session_id`; if the guided selector has a
   selection, `agent_id` (real immutable ID), `customer_id` (CIF only — see below),
   `phone_number` are included. `api/chat/index.ts` forwards exactly these fields to
   the real upstream `POST /api/v1/chat`, per `docs/Chat_Mode_API.docx`'s documented
   contract, and relays the upstream response/error status verbatim.
2. Upstream returns `session_id`, `agent_id`, `agent_name`, `customer_id`,
   `contact_id`, plus conversational metadata (`data_source`, `intent`, `confidence`,
   `authenticated`, `detection_method`, `latency_ms`).
3. `api/chat/index.ts` then persists locally via
   `supabaseChatRepository.createOrTouchSession()` (RPC
   `call_center_chat_create_session`) and two `call_center_chat_append_message` calls
   (user turn + AI turn). This persistence is wrapped in try/catch — if it fails, the
   turn is still returned to the operator (`persisted: false`), never silently dropped
   or blocked.
4. Every subsequent turn sends only `message` + `session_id`; identity fields are
   never re-sent, matching the documented contract ("agent_id is bound on the first
   message and ignored afterwards"). `useChatSession`/`ChatConsole` already enforce
   this client-side as belt-and-suspenders.
5. "New Chat" calls `closeChatSession()` (`POST /api/chat?action=close`, real RPC
   `call_center_chat_close_session`) for the outgoing session, then resets local state.

**Confirmed: `message` is the only backend-required field.** Per
`docs/Chat_Mode_API.docx`'s request-body table, `agent_id`, `customer_id`,
`contact_id`, `caller_name`, `phone_number` are all `No` (optional) —
`agent_id` omitted defaults to the inbound banking assistant server-side. This means
**both customerless chat and agentless chat are genuinely backend-supported today**,
not an assumption — the screen's existing behavior (allowing "New Chat"/send with
nothing selected beyond message text) already matches this correctly. No change was
needed to enablement logic.

## Customer 360 identity/correlation behavior

**CIF-vs-internal-UUID rule — confirmed enforced in code, not just UI-labeled.** In
`ChatIdentitySelector.tsx`'s guided-mode effect (non-advanced path):

```ts
customerId: cif ?? undefined,               // real backend CIF only, or omitted
customer360CustomerId: customerId ?? undefined, // local-only linkage, never sent upstream
```

`cif` is `selectedCustomerDetail.data?.customer.sourceCustomerRef` — the real external
CIF resolved via Customer 360's identity model, never the internal row UUID.
`customer360CustomerId` (the internal UUID) is kept as a **separately named** field
throughout the chain — `chatService.ts`'s `SendChatMessageOptions` type documents it
explicitly as "NEVER forwarded to the backend Chat API," and `api/chat/index.ts`'s
`upstreamPayload` construction only ever reads `body.customer_id` (the CIF) for the
field sent to `/api/v1/chat` — `customer360_customer_id` is read separately, only for
the local persistence RPC call, never assigned into `upstreamPayload`. Traced this
line-by-line; the separation holds at every layer. This is the most safety-critical
check in this review and it passed.

**Full-loop correlation — confirmed real, not dead code.** The internal customer link
is not wasted: `api/chat/index.ts` passes `customer360_customer_id` to
`call_center_chat_create_session`, which writes it to `chat_sessions.customer_id`
(a real `uuid` column, FK-shaped to `call_center.customers`). Chat Logs then reads it
back via `supabaseChatRepository`'s batch call to RPC `call_center_chat_customer_links`,
which joins `chat_sessions.customer_id → customers` and returns
`display_name`/`source_customer_ref`/masked primary phone — surfaced in
`src/pages/ChatLogs.tsx` as `resolvedCustomerLabel`. This is a **direct, synchronous**
correlation path, distinct from and in addition to the **asynchronous** phone/CIF-based
reconciliation pipeline (`src/server/customer360/chatInteractionSource.ts` →
`identityResolver.ts` → `customer_interactions`) that separately powers Customer 360's
own aggregate/interaction-history view. Both paths are real and both were traced to
completion — neither is fabricated or a stub.

## Authorization behavior

Category → Agent filtering authorization is not a new mechanism — it's the exact same
`GET /api/agents?action=classification` endpoint and underlying
`customer360_category_agents` / `role_customer360_categories` tables every other
Customer 360-authorized screen (Customer Index/Detail, AI Agents) already uses. No
chat-specific authorization logic exists or was added.

## What was live-verified vs. code-inspected only

Being precise, per this conversation's established honesty discipline (matching
Session 11.8's report style):

- ✅ **Live-verified against real production data (Supabase MCP queries against the
  live schema/rows):** Category→Agent mapping (3 categories, correct immutable
  `agent_id` values, matching AI Agents' roster); real phone-type
  `customer_contact_points` rows exist and match the shape `useCustomerDetail`
  consumes; the live `chat_sessions` table schema and the
  `call_center_chat_create_session` / `call_center_chat_customer_links` function
  signatures (confirmed via `pg_get_function_arguments`/`pg_get_functiondef`) match
  exactly what the application code calls.
- ✅ **Code-inspected and confirmed self-consistent, traced line-by-line through every
  layer (selector → hook → service → proxy → repository):** the CIF-vs-UUID
  separation; the customer-linkage round trip (create-session write → Chat Logs
  read-back); the optional-field request-body construction; the session-binding
  reuse-only-session_id-after-first-turn behavior.
- ⚠️ **Not live-verified via an actual browser click-through this session.** I did not
  drive the deployed/local UI with a browser tool in this pass — verification here was
  direct-to-database plus full code tracing, not an on-screen session. I also did **not**
  send a live chat message: no existing safe test conversation was identified in the
  data (all `chat_sessions` rows found were real historical production conversations),
  so per the explicit boundary in the session prompt, live message-send was correctly
  not attempted. If UI click-through verification is wanted, it should be a follow-up
  using the established Playwright+Edge harness against a deployed instance (see below).
- ⚠️ **`npm run responsive:check` / local `vercel dev` verification recurred the same
  environment-propagation limitation documented in Sessions 11.7 and 11.5B.**
  `vercel dev` on this machine only launches the underlying `vite --port $PORT` dev
  command directly — the `api/*.ts` serverless functions are not actually bound behind
  it in this environment, the same root cause noted in those two prior reports. Since
  Chat Console genuinely needs a working backend (classification, customer search,
  chat send) to be meaningfully exercised, a local static-only check would have been
  cosmetic at best, so it was not attempted as a substitute — reporting the limitation
  plainly rather than claiming a check that couldn't actually exercise the real
  behavior. This screen was not deployed this session (out of scope, no deploy
  requested), so a live-deployed-instance harness run also wasn't possible here.

## Responsive/theme results

Not run this session for the reason above (no working local API-backed dev server, no
deployment). `ChatConsole.tsx`'s layout was inspected statically: it already uses the
same bounded-workspace pattern established elsewhere (`height: calc(100vh - 44px)` on a
flex column, `flex-1 min-h-0` on the conversation `Card`) — this is the same L1
convention Dashboard/Live View/Call Logs/Chat Logs/Customer Index all use, already
present before this session, not something this session needed to add. `ChatIdentitySelector`'s
grid (`grid-cols-1 sm:grid-cols-2 md:grid-cols-5` bound / `md:grid-cols-4` unbound)
collapses to a single column below the `sm` breakpoint, which is the same responsive
strategy used by other non-tabular operational forms in this codebase. No G1/C1 grid
applies here (this is a form + conversation view, not a data table), and F1 doesn't
apply (there is no filterable record set on this screen). This is a static/code read,
not a live-viewport confirmation — flagged per the honesty discipline above, not
claimed as passed.

## Remaining gaps

1. **Responsive/theme and browser click-through verification is outstanding**, for the
   reasons above — should be picked up in a future deploy+verify session (the same
   pattern Session 11.8 used for 11.5A/11.5B/11.7), once this and any other pending
   local work is ready to ship together.
2. **Pre-existing, unrelated schema-drift finding surfaced during inspection (not
   introduced this session, not a blocker to Chat):** the live database has 7 applied
   migrations with no corresponding file in `supabase/migrations/` —
   `customer360_fix_list_customers_authorized_aggregate`,
   `campaigns_pending_reconciliations_with_phone`,
   `campaigns_mark_execution_failed_updates_target`,
   `customer360_get_customer_authorized`,
   `chat_enhancement_5_1_drop_old_hwm_overloads`,
   `customer360_add_primary_phone_masked_to_list`, and, most relevant to this
   session, **`chat_customer360_selection_retention`** (the migration that actually
   added the `chat_sessions.customer_id` column, the
   `p_customer360_customer_id` parameter on `call_center_chat_create_session`, and the
   `call_center_chat_customer_links` function this session traced and confirmed
   working). Production is currently self-consistent (the live function signatures
   match what the application code calls), so this is **not a functional defect and
   nothing here was blocked by it** — but it means the repository's migration history
   cannot currently reconstruct the live schema from scratch. Flagged for a future
   session to reconcile (write the missing migration files from the live schema), not
   addressed here since it's out of scope for Initiate Chat and not a genuine blocker.

## Build / test / lint / function-count results

- `npx tsc --noEmit` — clean, no errors.
- `npm run build` — clean production build.
- `npm run lint` — 117 errors / 36 warnings, exact match to the documented baseline. No
  new violations.
- Vercel function count — 11 (`api/*.ts` non-underscore files), unchanged — no new
  endpoint was added.

## Confirmation

- Nothing deployed.
- No Call Centre code touched.
- No fake agents/customers/messages created anywhere, including during verification.
- No enhanced Partner API fields assumed or mocked.
- No schema changes made (the migration-drift finding above was discovered, not
  introduced, and is documented rather than acted on).
- No live chat message was sent.

## Local commit

`a9eee5e`
