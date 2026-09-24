# Session 4.5 — Chat Console / Text Interaction Foundation: Plan (Revised)

**Status:** revised per explicit amendment, not yet approved. Supersedes the previous
version of this document in full. No code has been written for this session.

**Scope, amended:** text interaction becomes a first-class operational channel,
broadly parallel to voice — not just a live console. Delivers: **Chat Console**
(live, multi-turn) + **persistent** Chat sessions/messages + **Chat Logs** (historical
list) + **Chat Session Detail** (one session's full conversation) + structural
readiness for Customer 360, with no message-level linkage yet. **Explicitly still not
in scope:** actual Customer 360 Chat linkage, guessed customer identity, guessed agent
identity, the WhatsApp migration, Campaigns, QA, Analytics, Reports, NPS, Orchestrator,
an Authentication overhaul, User Management redesign, or Settings redesign.

**Runtime note honored throughout:** the Voice Agent demo backend was down for this
entire planning pass (confirmed via repeated `/api/calls/data`, `/api/agents`,
`/api/analytics/metrics` checks, all 502). No design decision below is based on a live
`/chat` response — `/chat`'s contract is sourced entirely from
`docs/CALL_CENTRE_BACKEND_CAPABILITY_RECONCILIATION.md`; everything not derivable from
that document is listed in §18 as deferred, not assumed.

---

## 1. Current Chat API contract

Unchanged from the first draft — confirmed in
`docs/CALL_CENTRE_BACKEND_CAPABILITY_RECONCILIATION.md` §2:

```text
POST /api/v1/chat
Request:  { message: string, session_id?: string }
Response: { success, response, session_id, data_source, authenticated,
            intent, confidence, detection_method, latency_ms }
```

`session_id` must be reused for subsequent turns. Requires a `chat`-scoped API key
permission, distinct from `calls` (unconfirmed whether the current key has it — §18).
`data_source` ∈ `tool | rag | auth | direct | guidance | llm | cancelled`.

## 2. Confirmed gaps

No customer/contact identity, no `agent_id`, no confirmed error-response shape or
retry semantics. Both identity gaps are already the subject of an outstanding request
to the Chat API team — this plan does not work around them.

## 3. Current repo Chat/Vapi/WhatsApp-related code (inspected before deciding anything)

Unchanged findings from the original inspection pass:

- **`chat_sessions` / `chat_messages` / `chat_traces`** already exist in this app's own
  Supabase project but are referenced by **zero** application code, and their shape
  (non-nullable `citations`/`retrieval_trace`/`model_meta`, paired with the also-unused
  `kb_chunks`/`kb_facts`/`kb_graph_edges` tables) strongly indicates they belong to a
  different, unbuilt RAG/Orchestrator-KB feature. **Confirmed not reused** — explicit
  instruction in this amendment, consistent with the original finding.
- **`whatsapp_sessions` / `whatsapp_messages`** are WhatsApp+Twilio+OTP specific, not a
  generic chat-turn shape.
- **`src/components/whatsapp/WhatsAppChat.tsx` / `ChatBubble.tsx`** — browser talks
  directly to Supabase (realtime subscription + an Edge Function), not through this
  app's `/api/*` proxy convention; `ChatBubble.tsx` has no formatting logic to inherit.
- **`supabase/functions/shared/vapi-formatter.ts`** — mutates content (regex rewrites +
  an optional OpenAI rewrite call via `formatWithLLM`). Confirmed, by name, as something
  this session must never call or port — explicit in this amendment's readability
  section (§16) and already flagged in the original pass.
- No Vapi client code exists in `src/` or `api/`.

## 4. Current persistence options — resolved

The three options from the original brief (frontend-only, new purpose-built tables,
reuse the existing `chat_sessions`/`chat_messages`) are now **explicitly decided**, per
this amendment:

- **Frontend-only / `sessionStorage`-as-system-of-record is rejected** — Chat Logs must
  survive browser/tab closure, which a per-tab, non-durable store cannot do by
  definition.
- **Reusing the existing `chat_sessions`/`chat_messages`/`chat_traces` tables is
  rejected** — confirmed again in this amendment, same reasoning as §3.
- **Chosen: new, purpose-built tables**, in the **same `call_center` Postgres schema**
  Session 4 already created in the AuditAI Supabase project (`dtbaczafdzgctkbqviod`) —
  not a new schema, not a new project. This is the smallest addition that still keeps
  Call Centre's own operational data isolated from both this app's Supabase project
  (WhatsApp/chat/orchestrator) and AuditAI's own document-automation tables.

## 5. Chat persistence — exact tables

Two new tables under `call_center.*` (migration to be written/applied at
implementation time, not now):

### `call_center.chat_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | internal identifier |
| `upstream_session_id` | `text not null unique` | the `session_id` `/chat` returns; the stable external identifier, same *role* as `call_id` plays for voice |
| `started_at` | `timestamptz not null` | set once, on first turn |
| `last_activity_at` | `timestamptz not null` | updated on every turn |
| `status` | `text not null default 'active'` | `'active' \| 'closed'` — see §9 for the only transition rule (explicit "New Chat", never inferred) |
| `customer_id` | `uuid null references call_center.customers(id)` | **nullable, unpopulated by Session 4.5** — column exists now so no later migration is needed once linkage is built (§13) |
| `agent_id` | `text null` | **nullable, unpopulated by Session 4.5** — same reasoning |
| `created_by` | `text null` | the client-supplied role/user signal at session creation, same advisory status as Customer 360's role header (plan §0.1) — informational only, never a security boundary |
| `message_count` | `int not null default 0` | denormalized, recomputed on every append (§8) |
| `latest_intent` | `text null` | denormalized from the most recent **AI** message |
| `latest_confidence` | `numeric null` | ditto |
| `latest_authenticated` | `boolean null` | ditto |
| `latest_data_source` | `text null` | ditto |
| `latest_detection_method` | `text null` | ditto |
| `latest_latency_ms` | `int null` | ditto |
| `created_at` / `updated_at` | `timestamptz not null default now()` | |

### `call_center.chat_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | |
| `chat_session_id` | `uuid not null references call_center.chat_sessions(id) on delete cascade` | |
| `sequence` | `int not null` | monotonic per session, assigned server-side |
| `role` | `text not null` | `'user' \| 'ai'` |
| `raw_text` | `text not null` | **verbatim, immutable** — the readability requirement's authoritative value (§16); nothing ever writes a transformed copy over this column |
| `intent` / `data_source` / `detection_method` | `text null` | populated only on `role = 'ai'` rows |
| `confidence` | `numeric null` | ditto |
| `authenticated` | `boolean null` | ditto |
| `latency_ms` | `int null` | ditto |
| `created_at` | `timestamptz not null default now()` | |

`unique (chat_session_id, sequence)`. Indexes: `chat_messages(chat_session_id, sequence)`,
`chat_sessions(upstream_session_id)` (implied by the unique constraint),
`chat_sessions(last_activity_at desc)` (for Chat Logs' default ordering).

**No transcript/message duplication elsewhere** — exactly like voice, where
`customer_interactions` never embeds a transcript and instead points at `/sessions/{id}`
on demand, a future Customer 360 chat row will point at `call_center.chat_messages` via
the session, never copy message text into `customer_interactions` (§13).

Access model: identical to Customer 360's (plan §14/§20) — `call_center` remains
un-exposed via PostgREST; all access goes through new `public.call_center_chat_*`
`SECURITY DEFINER` functions, each individually granted to `service_role` only. No new
Supabase project or env var is needed — the same `CUSTOMER360_SUPABASE_URL` /
`CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY` server env vars are reused, since this is the
same project and schema.

## 6. Chat domain/service architecture

A new, small domain layer, `src/server/chat/`, mirroring Customer 360's
logical/deployment split (plan §0.3) at the same rigor, but scoped to what Chat
actually needs (no authorization/category service — Chat Logs is not
category/role-filtered in this session; see §11):

```text
Chat UI (ChatConsole.tsx, ChatLogs.tsx, ChatSessionDetailDialog.tsx)
        ↓
Chat hooks (useChatSession, useChatLogs, useChatSessionDetail)
        ↓
Chat service (chatService.ts) — calls this app's own /api/chat/* routes
        ↓
Chat persistence repository (logical interface) — src/server/chat/chatRepository.ts
        ↓
supabaseChatRepository.ts — this deployment's adapter, the only file in
src/server/chat/ allowed to import @supabase/supabase-js, calling the
call_center_chat_* RPC functions exactly the way Customer 360's
supabaseCustomerRepository.ts calls call_center_*
        ↓
        AND, separately, at the transport layer only:
api/chat/index.ts → POST {VOICEBOT_BASE_URL}/api/v1/chat (the live-turn call)
```

Two adapters exist because Chat has two distinct concerns: talking to the live Voice
Agent backend (a request/response call, no persistence involved in the call itself) and
persisting the resulting turn (a database write, no backend call involved). `chatRepository.ts`
only knows about persistence; it never calls `/api/v1/chat`, and the backend call in
`api/chat/index.ts` never talks to Supabase directly — `api/chat/index.ts` (transport
layer) is what composes the two: call the backend, then persist the result via the
repository, then respond to the browser.

## 7. Server proxy / API design

```text
POST /api/chat                  — send a turn (proxies /api/v1/chat, then persists both
                                   the user message and the AI response) → returns the
                                   upstream response fields PLUS this app's internal
                                   chatSessionId
POST /api/chat?action=close     — { chatSessionId } → marks call_center.chat_sessions.status
                                   = 'closed'; called only by an explicit "New Chat" action
                                   with a currently-open session (§9), never automatically
GET  /api/chat/logs             — paginated list of chat_sessions (Chat Logs, §11)
GET  /api/chat/logs?id={id}     — one session's row + its ordered messages
                                   (Chat Session Detail, §11)
```

*(Route shapes shown here are final, per §17's implementation-time findings: Chat uses
literal paths + query-param dispatch, not `/close` or `/logs/{id}` path segments —
dynamic path-segment routing proved unreliable in this specific deployment.)*

`api/chat/index.ts` reuses `api/_voicebot.ts`'s `getBackendConfig()` for the outbound
call (`X-API-Key` server-side, browser never sees the upstream host) exactly like every
other proxy route. After a successful upstream response: look up
`call_center.chat_sessions` by `upstream_session_id` (create it if this is the first
turn — no `session_id` was sent), append the user's message and the AI's response as
two `chat_messages` rows in one repository call, update the session's denormalized
`message_count`/`last_activity_at`/`latest_*` fields (deterministic recompute, not an
increment — same philosophy as Customer 360's aggregate, plan §6), then respond. If the
upstream call fails, nothing is persisted (no half-written turn) and the clean error is
relayed as-is (§12).

## 8. DTO / normalized Chat types

`src/types/api/chat.ts` — unchanged from the first draft (`ChatRequestDto`,
`ChatResponseDto`, exact fields per §1).

`src/types/chat.ts` — extended for persistence:

```ts
export interface ChatTurnMetadata {
  dataSource: ChatResponseDto['data_source'];
  authenticated: boolean;
  intent: string | null;
  confidence: number | null;
  detectionMethod: string | null;
  latencyMs: number | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;               // verbatim raw_text — never mutated
  timestamp: string;
  metadata?: ChatTurnMetadata; // 'ai' role only
}

export interface ChatSessionSummary {
  id: string;                 // internal id
  upstreamSessionId: string;
  startedAt: string;
  lastActivityAt: string;
  status: 'active' | 'closed';
  messageCount: number;
  latestIntent: string | null;
  latestConfidence: number | null;
  latestAuthenticated: boolean | null;
  latestDataSource: ChatResponseDto['data_source'] | null;
  latestDetectionMethod: string | null;
  latestLatencyMs: number | null;
  customerId: string | null;  // always null this session (§2/§13)
  agentId: string | null;     // always null this session (§2/§13)
}

export interface ChatSessionDetail {
  session: ChatSessionSummary;
  messages: ChatMessage[];
}
```

DTO-boundary rule unchanged: a `call_center.chat_*` column name may only appear in
`src/server/chat/types.ts` and `supabaseChatRepository.ts`'s row mapper; everything
above the repository interface uses the camelCase shapes here.

## 9. Session lifecycle

`src/hooks/chat/useChatSession.ts`:

- First send: no `sessionId` in the request.
- On success: the internal `chatSessionId` (from `api/chat/index.ts`'s response, §7)
  and the upstream `session_id` are both retained in hook state; every subsequent turn
  sends the upstream `session_id` back, unconditionally.
- On failure: session state is left exactly as it was — no automatic recreation, no
  clearing. The failed message stays visible with a retry action that resends the same
  text with the same `session_id`. Unchanged from the original plan.
- **"New Chat"**: an explicit action. Clears the in-hook conversation view AND, if a
  session is currently open, calls `POST /api/chat?action=close` with the internal
  `chatSessionId` — this is the only place `status` ever transitions to `'closed'`.
  Nothing infers session end from a `data_source: 'cancelled'` turn or from inactivity;
  no such rule is documented, so none is invented (§12's same restraint).
- No `sessionStorage` mirror is needed now that real persistence exists (this
  supersedes the original draft's `sessionStorage`-as-refresh-resilience idea) — a
  refreshed Chat Console simply starts a fresh, empty conversation view; the previous
  conversation remains fully durable and reachable via Chat Logs → its Chat Session
  Detail. This is simpler and has no invisible client-side state to keep consistent
  with the server.

## 10. Chat Console UX

Unchanged in shape from the original draft (`src/pages/ChatConsole.tsx`,
`ChatBubble.tsx`, `ChatComposer.tsx`): conversation area with ordered, timestamped
bubbles, a typing/loading indicator while a turn is in flight, inline retry/error state
per failed turn (not `QueryErrorBanner`, which is for read/list queries), a visible
"New Chat" action, and an input composer disabled while a turn is in flight. The only
change from the original draft is that "New Chat" now also triggers the `close` call
(§9).

## 11. Chat Logs & Chat Session Detail

**`src/pages/ChatLogs.tsx`** — conceptually equivalent to `CallLogs.tsx`, same page
shell/patterns (search-free for now — no text search requirement was given; a
`QueryErrorBanner` for the list query, same as Call Logs). Columns, exactly as
specified:

```text
Session ID · Started At · Last Activity · Message Count · Latest Intent ·
Authentication State · Data Source · Confidence · Latency · Status ·
Customer (— , never fabricated) · Agent (— , never fabricated)
```

`Customer`/`Agent` render the shared `'—'` fallback exactly like every other
not-yet-available field elsewhere in this app (`src/lib/format.ts`'s convention) — not
a special "N/A for chat" treatment, consistent styling with the rest of the product.
Uses `formatTimestamp`/`formatFractionAsPercent`/`formatStatusLabel` from
`src/lib/format.ts` for `Started At`/`Last Activity`/`Confidence`/`Status`, same as
every other screen.

**`src/components/chat/ChatSessionDetailDialog.tsx`** — a **dialog**, not a separate
route, matching Call Logs' own `InteractionDetailDialog` pattern (Session 2/3)
rather than introducing a new "detail page" convention this app doesn't otherwise use.
Shows the session summary (id, started/last activity, message count, latest metadata)
above the full ordered conversation, rendered with the **same**
`ChatMessageContent.tsx` presentation-only renderer the live Chat Console uses (§16) —
one renderer, two call sites, never two implementations of message formatting.

Neither screen applies category/role-based filtering — that mechanism (Customer 360's
`resolveAuthorizedAccess`) is not extended to Chat in this session, since Chat has no
category/agent linkage to filter by yet (§2/§13); Chat Logs' visibility is gated the
same coarse way Call Logs' always has been (the sidebar nav permission, §15), not by
the finer Customer 360 model.

## 12. Error / retry / session-failure behavior

Unchanged from the original draft: proxy relays upstream errors as-is via the existing
`isApiError`/`normalizeApiError` utilities; no automatic session recreation under any
condition; no Vapi-specific retry logic ported. One addition: if persistence
(`chatRepository`) fails **after** a successful upstream call, the turn is still shown
to the operator (the AI did respond) but with a visible, distinct "not saved" indicator
rather than silently losing the persistence failure — this must never look like the
turn itself failed when only the save did.

## 13. Customer 360 future model — session-level linkage, not message-level

**Explicit correction from the original draft, per this amendment**: a chat
**session**, not each individual message, is the future Customer 360 interaction —
exactly parallel to how one voice call (not each transcript turn) is one
`customer_interactions` row today.

```text
Customer 360
├── Voice     → customer_interactions (channel='voice', one row per call)
├── Chat      → customer_interactions (channel='chat', one row per chat SESSION)
│                └── detailed conversation stays in call_center.chat_messages,
│                    referenced via interaction_id, never embedded/duplicated
├── WhatsApp  → future
└── future channels
```

Once the Chat API returns customer/contact identity and `agent_id`, a future session's
ingestion mapping is:

```text
call_center.chat_sessions row
        ↓
customer_interactions row:
  channel        = 'chat'
  interaction_id = chat_sessions.upstream_session_id   (same *role* call_id plays for voice)
  customer_id    = the new backend-provided customer identity
  agent_id       = the new backend-provided agent_id
  category       = resolved via the EXISTING customer360_category_agents mechanism —
                    no new categorization concept for chat
```

This requires **no schema redesign** on either side: `call_center.chat_sessions`
already has nullable `customer_id`/`agent_id` columns ready to populate (§5), and
`customer_interactions.channel`/`source` are already open text values (Session 4 built
them that way specifically for this moment). A future ingestion pass sets those two
columns on existing `chat_sessions` rows and creates the corresponding
`customer_interactions` rows — it does not need to touch `chat_messages` at all, which
continues to serve purely as the on-demand "expand for full conversation" detail,
exactly like `/sessions/{id}` does for voice.

## 14. WhatsApp future-reuse path

Unchanged from the original draft: `ChatRequestDto`/`ChatResponseDto`, `chatService.ts`,
and the `/api/chat/*` routes are transport-agnostic and reusable once WhatsApp migrates
off Vapi. `vapi-formatter.ts`'s content-mutating logic and `whatsapp_sessions`' OTP/phone
fields are explicitly not reusable/portable (§3).

## 15. Navigation

Per the amendment's product model, `Chat` and `Chat Logs` are added to
`src/components/layout/Sidebar.tsx`'s existing flat `sidebarItems` array, positioned
adjacent to `Call Logs`/`Customers` to match the given ordering
(Dashboard, Initiate Call, Live View, Call Logs, **Chat**, **Chat Logs**, Customers):

```text
{ name: 'Chat', href: '/chat', icon: MessageSquare, permission: 'test_bound_calls' }       // parallels Initiate Call's permission — a live interaction-testing tool
{ name: 'Chat Logs', href: '/chat-logs', icon: PhoneCall /* or a distinct icon */, permission: 'view_call_logs' }  // parallels Call Logs' permission — a historical record viewer
```

**Flagged, not assumed:** the amendment's mockup shows an `Operations` **section
header** grouping Dashboard/Initiate Call/Live View/Call Logs/Chat/Chat Logs/Customers
visually apart from the rest of the nav. The current `Sidebar.tsx` has no section-header
concept anywhere — it's a single flat list for every screen in the app. Introducing one
now would mean restyling the *entire* sidebar, not just adding two rows, which is a
materially bigger and more visible change than "add Chat + Chat Logs." **Recommendation:
implement the two new flat entries in the given relative order for this session, and
treat the grouped/sectioned sidebar as a separate, explicitly-scoped follow-up if still
wanted** — flagging this rather than silently picking one interpretation, consistent
with how this project has handled sidebar-only ambiguity before (plan §21's Customers
entry took the same "reuse the flat convention" approach).

## 16. Readability requirement — implementation approach (expanded)

Unchanged core principle, expanded surface per this amendment's explicit list. The raw
`response`/user text is stored verbatim in `chat_messages.raw_text` / `ChatMessage.text`
and is the single source of truth end to end — `chatMapper.ts` never transforms it, and
neither does the repository or the proxy. `ChatMessageContent.tsx` (shared by Chat
Console and Chat Session Detail, §11) renders it via a pure parser
(`src/lib/chatMessageFormatting.ts`) producing a restrained AST, then maps that AST to
plain React elements — **no `dangerouslySetInnerHTML` anywhere**. Node types, covering
every item in the amendment's list:

- paragraph / line breaks
- bullet-list item (lines starting with `-`, `*`, or `•`)
- **inline `•` bullet separation** — a `•` appearing mid-line (not just line-starting)
  is treated as a soft separator within a paragraph, not merged into surrounding text
- **obvious `|` separators** — a line containing multiple `|`-delimited segments (e.g.
  `Balance | 1,234.00 | Available`) renders as a lightweight inline table/row, not raw
  pipe characters
- **label/value emphasis** — a short leading token ending in `:` at the start of a line
  (e.g. `Status:`) is wrapped in `<strong>`, the *value after it* is never altered
- fenced/backticked code span → `<code>`/`<pre>`
- URL auto-linking → `<a rel="noopener noreferrer">`, long/URL text wrapped, not
  truncated
- whitespace normalization is presentation-only (collapsing rendering-level spacing),
  never applied to the stored `raw_text`

The parser only ever inserts structural breaks or wraps a span in a tag — it never
deletes, replaces, reorders, or paraphrases any word, number, or value. Emoji and
original ordering pass through untouched. A **"Copy raw"** action is present on every AI
bubble (both in Chat Console and Chat Session Detail), copying `ChatMessage.text`
exactly as stored — never the rendered/formatted version. `vapi-formatter.ts` is
inspected and confirmed excluded (§3); no LLM-based formatting call is made anywhere in
this renderer.

## 17. Exact files/routes/services/hooks/components to create or modify

**New Supabase migration (extends the existing `call_center` schema, applied at
implementation time):**
- Adds `call_center.chat_sessions`, `call_center.chat_messages` (§5) and
  `public.call_center_chat_*` `SECURITY DEFINER` functions (create session, get session
  by upstream id, append message + recompute denormalized fields, close session, list
  sessions, get session, list messages), each granted to `service_role` only — same
  migration mechanics as `supabase/migrations/20260924150000_customer360_foundation.sql`.

**New domain layer:**
- `src/server/chat/types.ts`
- `src/server/chat/chatRepository.ts` (interface)
- `src/server/chat/supabaseChatRepository.ts` (adapter — the only new file allowed to
  import `@supabase/supabase-js` for this domain)

**New transport layer — amended three times at implementation time (see notes below),
final design uses literal paths + query-param dispatch, no dynamic path segments:**
- `api/chat/index.ts` — `POST /api/chat` (send turn) and
  `POST /api/chat?action=close` (close a session), one literal file, dispatched by the
  `action` query param.
- `api/chat/logs.ts` — `GET /api/chat/logs` (paginated list) and
  `GET /api/chat/logs?id={id}` (one session + its ordered messages), one literal file,
  dispatched by the presence of the `id` query param.
- Public *behavior* is exactly as originally planned (same two logical endpoints, same
  request/response shapes); only the close and detail operations moved from a path
  segment (`/close`, `/logs/{id}`) to a query param (`?action=close`, `?id={id}`) — see
  finding #3 below for why.

> **Implementation-time finding #1 — function count.** Deploying the four separate
> route files originally planned failed — the Vercel **Hobby** plan (confirmed via
> `vercel teams ls`) caps a deployment at **12 Serverless Functions**, and Session 4
> alone already used exactly 12. The failure was silent from the build log's
> perspective (build completed successfully; the deployment then failed at the
> platform's "Deploying outputs" stage with no per-file error), discovered only by
> noticing the live deployment used was an older, pre-Session-4.5 build. Also
> consolidated Session 4's three lowest-traffic, admin-token-gated routes (`backfill`,
> `reconcile`, `seedCategories`) into one `api/customers/admin.ts?action=...` function.
> No logical behavior changed in either consolidation — same routes' request/response
> shapes, same gating, same jobs; purely a deployment-capacity fix.
> `scripts/backfillCustomers.mjs` and `scripts/seedCustomer360Categories.mjs` were
> updated to call the new `?action=` path. This is a genuine, now-confirmed answer to
> the Vercel-plan-tier question plan §24 (Session 4) and §19/§20 (this plan) both
> listed as unconfirmed — worth remembering for any future session adding more routes.
>
> **Implementation-time finding #2 — optional catch-all didn't route correctly.** The
> first fix attempt consolidated all four Chat routes into a single file using Vercel's
> *optional* catch-all syntax (`api/chat/[[...route]].ts`, matching zero-or-more
> segments). Once deployed, `POST /api/chat` (zero segments) 404'd, and
> `GET /api/chat/logs` was incorrectly landing in the zero-segment ("send") handler
> instead of the logs one.
>
> **Implementation-time finding #3 — standard catch-all also misbehaved.** The second
> attempt split into a literal `index.ts` plus a **standard** (non-optional, ≥1
> segment) catch-all `[...route].ts`. Live diagnostic (`?debug=1`) revealed two further
> platform-specific quirks in this deployment: (a) the catch-all segment arrived under
> the literal query key `"...route"` (including the ellipsis) rather than the
> documented `"route"`; (b) once that was corrected, the catch-all still matched only
> **exactly one** path segment — `GET /api/chat/logs/{id}` (two segments) 404'd at the
> platform level, never reaching the function at all. Given two different dynamic-path
> mechanisms both behaved contrary to documented Vercel behavior in this specific
> deployment, the final design abandons path-segment dynamic routing for Chat entirely
> in favor of literal paths with query-param dispatch (`?action=`, `?id=`) — proven
> reliable, and this also holds the function count at exactly 12. Session 1-4's
> existing dynamic-segment files (`api/calls/session/[id].ts`,
> `api/customers/[id]/index.ts`, etc.) were NOT touched or re-verified — they were
> already live and working before this session, so there was no reason to suspect them,
> and this finding is specific to catch-all (`[...x]`/`[[...x]]`) segments, not the
> single non-catch-all `[id]` form those files use.

**New frontend:**
- `src/types/api/chat.ts`, `src/types/chat.ts`
- `src/services/chat/chatService.ts` (no separate `chatMapper.ts` — the `/api/chat/*`
  responses are already this app's own normalized shape, same precedent as Customer
  360's `customersService.ts`)
- `src/hooks/chat/useChatSession.ts`, `useChatLogs.ts`, `useChatSessionDetail.ts`
- `src/pages/ChatConsole.tsx`, `src/pages/ChatLogs.tsx`
- `src/components/chat/ChatBubble.tsx`, `ChatComposer.tsx`,
  `ChatSessionDetailDialog.tsx`, `ChatMessageContent.tsx`
- `src/lib/chatMessageFormatting.ts`

**Modified (narrow, matching every prior session's discipline):**
- `src/components/layout/Sidebar.tsx` — two new entries (§15)
- `src/App.tsx` — two new routes: `/chat` → `ChatConsole`, `/chat-logs` → `ChatLogs`
  (Chat Session Detail is a dialog opened from `ChatLogs`, not its own route, §11)

**Nothing else is modified** — no WhatsApp file, no Vapi Edge Function, no Customer 360
file (`src/server/customer360/*`, `api/customers/*`, the existing migration) is touched.

## 18. Verification plan

1. `tsc --noEmit`, `npm run build`, `npm run lint` — zero new errors beyond baseline.
2. Migration applies cleanly (via the Supabase MCP, same process as Session 4); confirm
   the two new tables, their constraints/indexes, and the new RPC functions' grants
   (`service_role` only, same `has_function_privilege` check Session 4 used).
3. Synthetic-data verification (seed/clean via the MCP, exercised through the real
   deployed API, same method Session 4 used): appending messages correctly updates
   `message_count`/`last_activity_at`/`latest_*` deterministically (not incrementally);
   `upstream_session_id` uniqueness is enforced; closing a session sets `status` and
   nothing else changes.
4. Live, once the backend is reachable: send a real multi-turn conversation; confirm
   `session_id` is reused correctly; confirm both messages of each turn are persisted;
   confirm Chat Logs shows the session with correct denormalized fields; confirm Chat
   Session Detail shows the full conversation in order via the same renderer as Chat
   Console; confirm "New Chat" closes the prior session and starts a genuinely fresh one.
5. Readability: paste a response containing bullets, a `|`-delimited line, a
   `label:`-value line, a URL, and a code span; confirm each renders as intended while
   `ChatMessage.text`/"Copy raw" remain byte-for-byte identical to the raw API text.
6. `grep` the production `dist/` bundle for `CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY` and
   for `supabaseChatRepository`/`supabaseCustomerRepository` filenames — must never
   appear client-side, same check as Session 4.
7. Regression: confirm Dashboard/Initiate Call/Live View/Call Logs/Customers render
   unchanged; confirm no Customer 360 file was touched (`git diff --stat` shows only
   the files in §17).

## 19. Runtime checks deferred because the backend is down today

Unchanged from the original draft: `chat`-scope permission on the current API key,
`/chat`'s real error/retry shape, `confidence`'s actual scale (0-1 vs 0-100, affects
which `format.ts` helper §11's Confidence column uses), real `latency_ms` magnitude,
whether a stale/invalid `session_id` produces a distinguishable error, and a real
end-to-end send/receive/persist test of the deployed feature.

## 20. Genuine backend/API gaps requiring follow-up

1. No customer/contact identity in `/chat` — tracked as an outstanding request to the
   Chat API team, not worked around (§2/§13).
2. No `agent_id` in `/chat` — same status.
3. `chat`-scope permission on the current API key is unconfirmed (§19).
4. Exact error/retry contract is undocumented (§19).
5. **Sidebar grouping** (§15) is flagged, not decided — confirm before implementation
   whether the two new nav entries should be flat (this plan's default) or whether a
   full sectioned-sidebar redesign is actually wanted now.

---

Stop after this plan. No implementation code has been written. Waiting for approval
before beginning Session 4.5.
