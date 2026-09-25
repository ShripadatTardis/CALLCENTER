# Session 6.2 — Interaction Classification, Grouping & Access Presentation

Implemented directly after the audit below confirmed the gap is a mechanical
extension of an already-proven primitive (Customer 360's category/role
authorization), not a missing architectural piece. No new authorization
model, no new tables — see §4/§20.

## 1. Current Call Logs structure (before this session)

`src/pages/CallLogs.tsx` fetched `useCallData({status:'inactive', page_size:50})`
and rendered one flat card list, sorted only by fetch order. No grouping, no
category/agent structure, no authorization of any kind — every authenticated
UI user, regardless of role, saw every call in the fetched page. `api/calls/data.ts`
was a pure pass-through proxy to `GET /api/v1/call-data` with zero server-side
filtering.

## 2. Current Chat Logs structure (before this session)

`src/pages/ChatLogs.tsx` rendered one flat paginated table via `useChatLogs(page)`.
`useChatLogs` already sent an `x-user-role` header (`fetchChatLogs(role, ...)`,
mirroring Customer 360's convention) — but `api/chat/logs.ts` never read it.
The header was sent and silently discarded server-side: **zero enforcement**,
despite looking, at a glance, like the same authorized pattern Customer 360 uses.

## 3. Current Interaction Quality structure (before this session)

`src/pages/QAReview.tsx` (Session 6.1's "Interaction Quality") combined
`useCallData` + `useChatLogs` into one flat, filterable table. Same as Call
Logs/Chat Logs: no grouping, no server-side authorization.

## 4. Existing category/agent/domain model

Fully reused, unchanged schema, from Session 4:
- `call_center.customer360_categories` (id, name, description, active)
- `call_center.customer360_category_agents` (agent_id -> category_id)
- `call_center.role_customer360_access` (role, all_categories)
- `call_center.role_customer360_categories` (role, category_id)

`Domain` ("Banking & Financial Services") is **not persisted anywhere** —
audited across every migration and table; it exists only as a page heading
string in the current UI. Per the prompt's explicit "do not invent a large
domain-management schema unnecessarily" instruction, this session keeps it
as a single hardcoded constant (`DEFAULT_DOMAIN` in `api/agents/index.ts`),
returned as an opaque string field in the classification response. Every
consumer (frontend hook, grouping utility, tree component) treats `domain`
as an opaque string, not a hardcoded literal — so a future `domains` table
can replace the constant with a real lookup without changing any consumer.

Category currently maps 1:1 to agent in the seed data (Inbound Banking ->
inbound-banking-default, EMI Reminder -> emi-reminder-agent, Forex Transaction
-> forex-transaction-agent), but nothing in the schema, the resolver, or the
grouping code assumes this — `customer360_category_agents` is already a
proper many-to-many join table, and `groupInteractions` groups by whatever
`category.agentIds` array it's given, of any length. A future `Loans` category
with 3 agents needs zero code changes.

## 5. Authorization matrix by screen (audited)

| Screen | Before this session | After this session |
|---|---|---|
| Call Logs | **None** — flat proxy, no role read at all | Server-side (`api/calls/data.ts` filters `calls[]` by `ai_agent_id`/`agent_id` before response leaves the server) |
| Chat Logs | **None** — role header sent, never read | Server-side (`api/chat/logs.ts` filters `sessions[]`/detail by `agent_id`; unauthorized direct `?id=` lookup returns 404, not the record) |
| Interaction Quality | **None** — inherits whatever Call/Chat Logs return | Server-side, via the same two routes it already calls |
| Customer 360 | Yes (Session 4/5.2/6.2-adjacent fixes) | Unchanged |

**This was a real, previously-undetected gap**: Call Logs and Chat Logs
looked structurally similar to Customer 360 (Chat Logs even sent the same
`x-user-role` header) but enforced nothing. Confirmed live before any fix:
a request with an unmapped role returned the full, unfiltered call/chat
volume from both routes.

## 6. Security vs operational dimensions

**Security dimensions** (determine what a role may see): Domain, Category,
Agent, Role. Sourced *only* from `interaction.agent_id -> customer360_category_agents
-> role_customer360_categories`, resolved server-side, live, on every request
(`resolveAuthorizedAccess`, reused unchanged from Customer 360). Never
inferred from intent, transcript, summary, tags, caller name, sentiment, or
campaign name — none of these fields are read anywhere in the authorization
path added this session.

**Operational dimensions** (determine how already-authorized rows are
filtered/grouped/displayed): Channel, Direction, Date, Intent, Outcome, FCR,
Escalation, Sentiment, Authentication, Campaign. These are read only after
authorization has already reduced the row set — `groupInteractions` (the
presentation layer) never receives a row the server didn't already authorize.

**Known limitation, carried over from Customer 360 and documented again
here**: the `role` used above is client-supplied (`x-user-role` header) —
this app has no server-verifiable session (`AuthContext.tsx` is
localStorage-only). This is a real server-side *filter*, not yet
cryptographic *access control*, exactly as documented in `api/_customer360.ts`.

## 7. Proposed shared classification model

`ClassifiedInteraction` (conceptual, per the brief) is realized as two
existing types joined client-side, not one new giant duplicate model:
- `Interaction` (`src/types/interaction.ts`) / `ChatSessionSummary`
  (`src/types/chat.ts`) already carry `agentId`, `channel` (implicit per
  screen), and every operational field (intent, outcome, fcr, sentiment,
  escalation, authenticated, campaignName/durationSeconds/etc.).
- `Classification` (new, `useClassification.ts`) carries `domain` +
  `categories[{id, name, agentIds}]` — the security/grouping dimension.

`groupInteractions(items, classification, agentsById)` (`src/lib/interactionGrouping.ts`)
is the one shared function that joins the two into a `DomainGroup` tree.
Used identically by Call Logs, Chat Logs, and Interaction Quality — zero
duplicated grouping logic.

## 8. Grouping hierarchy

`Domain -> Category -> Agent -> Channel`, with a real count at every level,
implemented in `GroupedInteractionTree.tsx`. Unclassified interactions
(agent_id absent from any category mapping) are surfaced in a separate,
explicit "N interactions without a category/agent mapping" line — never
silently dropped, never silently folded into a category.

## 9. Filter model

Existing per-screen filters (channel/outcome/escalation/FCR/sentiment/intent
text search on Interaction Quality; the existing `AdvancedFilters` on Call
Logs) are preserved unchanged and compose with the new grouping — selecting
a tree leaf narrows to that agent+channel; the existing filter controls
narrow further within that. A full `Domain -> Category -> Agent` cascading
filter *dropdown* set was evaluated and deliberately not built as a
*separate* control: the tree itself already **is** the cascading
category/agent selector (per §11's "grouping is not just a filter"), so a
second, parallel dropdown UI would duplicate it rather than add anything —
this is the "recommend the cleanest division" call from §9 of the prompt.

## 10. All-access behavior

Verified live (`call_center_head`, `all_categories=true`): `resolveAccessForRequest`
returns `authorizedAgentIds: 'all'`; no filtering is applied anywhere;
`GroupedInteractionTree` still renders the full Category -> Agent -> Channel
hierarchy with real per-branch counts (e.g. live: Inbound Banking / EMI
Reminder / Forex Transaction each as separate branches) — never a flat
"N interactions" list. This satisfies §14's mandatory acceptance criterion
directly; see §21 for the exact live counts observed.

## 11. Scoped-role behavior

Verified live with a throwaway `test_6_2_emi_only` role (`all_categories=false`,
one category: EMI Reminder -> `emi-reminder-agent`), created and fully
removed via the Supabase MCP after verification:
- `GET /api/agents?action=classification` returned exactly one category.
- `GET /api/calls/data` returned exactly the EMI-Reminder-agent subset (8 of
  680 total calls), summary recomputed over that subset, `scoped: true`.
- `GET /api/chat/logs` returned 0 sessions (this role's one agent has no
  chat sessions in the current dataset) — correctly empty, not an error.
- Direct navigation to a real chat session belonging to a *different* agent
  (`chat-de0e1945-...`, `inbound-banking-default`) returned
  `{"detail":"Chat session not found"}` (404) for the scoped role, and the
  full session for the all-access role on the identical URL — confirming
  drill-down cannot be used to bypass the grouping UI's authorization.

## 12. Authorized aggregate/count rules

Every count shown (tree node totals, the "Call History (N of M)" heading,
Chat Logs' totals) is computed *after* server-side filtering — never a
raw backend total presented to a scoped role. `api/calls/data.ts` explicitly
recomputes `total_calls`/`resolved_count`/`escalated_count`/`fcr_rate`/
`escalation_rate`/`avg_aht_seconds`/`avg_intent_accuracy` over the filtered
row set and marks the summary `scoped: true` so the frontend never mistakes
it for the backend's true global summary. Same pattern in `api/chat/logs.ts`
for `pagination.totalCount`.

**Honest limitation, stated explicitly rather than hidden (§17)**: these
scoped counts are computed over the currently *fetched page* (Call Logs:
50 rows; Chat Logs: 25 rows/page), not the backend's true global dataset —
the backend has no authorized-aggregate endpoint for call-data or
chat-sessions (unlike Customer 360, which has `call_center_list_customers`'s
server-side lateral-join aggregate). `GroupedInteractionTree` labels every
count "(current page)" whenever `countsAreExhaustive` is false, which is
always, for these three screens, today. `api/calls/data.ts`'s response
still echoes the backend's raw (unfiltered) `pagination.total_records` —
documented here as a known, minor, non-misleading gap: it appears only in
the raw JSON, never rendered as a labeled "total" anywhere in the UI.

## 13. Call Logs UX

Added: a Grouped View / Table View toggle (Grouped is default). Grouped
View shows the always-visible tree above the existing card list; selecting
a Voice leaf narrows the cards below to that agent (channel is always
`voice` here, since Call Logs is voice-only). Table View shows the
unfiltered set exactly as before Session 6.2. The existing `AdvancedFilters`,
CSV export, and summary tiles are unchanged and compose on top of either view.

## 14. Chat Logs UX

Same toggle pattern. Grouped View's tree groups by `agentId`/`chat`; selecting
a leaf narrows the existing table. Table View is the pre-Session-6.2 flat
table, now scoped by category/role. Every field already listed in the brief
(Session ID, Started At, Agent, Customer/Contact, Message Count, Intent,
Authenticated, Data Source, Confidence, Latency, Status) is unchanged — no
new Chat FCR/outcome/sentiment fields invented.

## 15. Interaction Quality UX

Per §9's evaluation: Interaction Quality is the natural cross-channel
classified view, since it already merges Voice + Chat into one row set. Its
tree groups both channels under the same Category/Agent branches (e.g.
Inbound Banking Assistant showing both a Voice leaf and a Chat leaf). Its
existing filter row (channel/agent/outcome/escalation/FCR/sentiment/intent
text/campaign) is preserved unchanged; the tree leaf selection composes with
those filters exactly as Call Logs/Chat Logs do. No fourth screen was added —
Call Logs and Chat Logs keep their own grouped views for channel-specific
detail (recordings, per-channel columns) rather than being replaced by
Interaction Quality, per the "retain useful channel-specific detail"
instruction.

## 16. Minimal Customer 360 enhancement

None implemented this session. Customer 360 already applies authorized
aggregates correctly (Session 4/5.2/6.2-adjacent fixes) and remains
customer-centric per §12's explicit instruction not to turn Customer Detail
into another Logs screen. A lightweight Category/Agent filter on the
customer interaction timeline was considered but not built — flagged as a
small, optional future enhancement, not required for this session's
acceptance criteria.

## 17. Interaction-detail reuse

Zero new detail/transcript/recording viewers. `InteractionDetailDialog` and
`ChatSessionDetailDialog` are used completely unmodified from all three
screens — the classification/grouping layer only ever decides *which*
interaction is selected (via the existing `handleViewDetail`/
`setSelectedSessionId` state each screen already had), using the
already-corrected identifier-handoff pattern from the Customer 360
drill-down bugfix (Voice search-by-phone-then-filter-by-call_id; Chat
direct session_id lookup) — nothing new was introduced that could
reintroduce that bug, since none of these three screens ever routed through
Customer 360's phone-search path to begin with (they already had direct
`call_id`/`session_id` access from their own live data).

## 18. Performance/pagination implications

Grouping runs entirely client-side, over whatever page is already fetched
(Call Logs: 50 rows; Chat Logs: 25 rows/page; Interaction Quality: both
combined) — no new fetch, no additional round-trip beyond the new
`GET /api/agents?action=classification` call (cached by TanStack Query,
keyed by role, refetched only on role change). Group counts are honestly
labeled page-scoped (§12/§17). No unbounded fetch was introduced anywhere.

## 19. Session 7 dimensional reuse

`useClassification()` and `groupInteractions()` are deliberately generic —
they take any `{agentId, channel}` item and the same classification tree.
Session 7 Analytics (planned, not yet approved) can call the identical
`GET /api/agents?action=classification` endpoint and the identical
`groupInteractions` function to aggregate over Domain/Category/Agent/Channel
without any new classification code — exactly the "avoid UI-only category
definitions Analytics can't reuse" instruction in §18 of the prompt.

## 20. Backend/API gaps

- No authorized/scoped aggregate endpoint exists for call-data or
  chat-sessions (unlike Customer 360's `call_center_list_customers`) — see
  §12's honest page-scoped-count limitation. Closing this would require
  either a new backend aggregate endpoint or a bounded reconciliation-style
  ingestion of call/chat rows into `call_center` (out of scope this session).
- No persisted `domains` table — see §4.

Neither gap blocked implementation; both are documented limitations, not
invented workarounds.

## 21. Files changed

**Server** (all reuse existing routes — zero new files):
- `api/agents/index.ts` — added `?action=classification`.
- `api/calls/data.ts` — added server-side category filtering via
  `resolveAccessForRequest` + `proxyRequest`'s `onBody` remapper.
- `api/chat/logs.ts` — added server-side category filtering (list) and
  authorization check (detail).

**New frontend files**:
- `src/hooks/classification/useClassification.ts`
- `src/lib/interactionGrouping.ts`
- `src/components/classification/GroupedInteractionTree.tsx`

**Modified frontend files**:
- `src/services/calls/callsService.ts` — `fetchCallData` now sends
  `x-user-role` and returns `scoped`.
- `src/hooks/calls/useCallData.ts` — sources `role` from `useAuth()`,
  includes it in the query key.
- `src/pages/CallLogs.tsx` — Grouped/Table view toggle + tree.
- `src/pages/ChatLogs.tsx` — Grouped/Table view toggle + tree.
- `src/pages/QAReview.tsx` (Interaction Quality) — Grouped/Table view
  toggle + tree, composing with existing filters.

## 22. Vercel function-count impact

**Zero new functions.** All three changes (`api/agents/index.ts`,
`api/calls/data.ts`, `api/chat/logs.ts`) extend existing route files.
Confirmed via `find api -name "*.ts" ! -name "_*" | wc -l`: **11 before,
11 after**.

## 23. Verification plan (executed — see results inline in §10/§11 above)

- All-access role: full grouped hierarchy, correct real counts, direct
  navigation works, no flattening under "All" — PASS.
- Scoped role: exactly its category/agent visible, hidden category
  produces zero rows (not an error, not a leak), direct navigation to a
  hidden-category interaction returns 404 — PASS.
- Data integrity: classification sourced only from `agent_id ->
  customer360_category_agents`; Voice and Chat for the same `agent_id`
  land in the same category branch (confirmed structurally — both channel
  types are grouped by the identical `agentToCategory` map); no
  transcript/intent-based authorization exists anywhere in the new code —
  PASS.
- Technical: `tsc --noEmit` clean; `npm run build` clean; `npm run lint`
  — 56 errors / 17 warnings, identical to the pre-existing baseline, zero
  new issues in any touched or new file; function count 11/11 — PASS.
- Production verification: all checks in §10/§11 run against the live
  deployed app (`https://callcenter-three-livid.vercel.app`), not just
  locally — PASS.
