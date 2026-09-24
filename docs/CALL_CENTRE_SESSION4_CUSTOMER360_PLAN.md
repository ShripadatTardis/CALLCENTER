# Session 4 — Customer 360 Foundation: Revised Plan

**Status:** architecturally approved, amended after two required preflight checks
(see the new §0 below). Implementation is still on hold pending review of this
amendment. Supersedes the previous version of this document
in full — the earlier phone-number-is-the-customer, batch-first, direct-Supabase-read
design is replaced by the multi-contact-point, progressive/on-demand,
category-and-role-filtered design below, per the updated product brief. No code has
been written for this session.

**Scope:** persisted operational customer/contact-point aggregation with agent-based
interaction categorization and server-side role-filtered access, plus a `Customers`
menu (list + detail). **Explicitly not in scope:** full CRM, speculative customer
matching, Chat Console, WhatsApp migration, Campaigns, QA, Analytics module, Reports,
NPS, Orchestrator, a general Authentication overhaul, User Management redesign,
Settings redesign, a sophisticated customer-merge UI, a sophisticated category rule
engine, or transcript/audio duplication. Session 4.5 is not started by this plan.

---

## 0. Preflight check results (blocking findings, read first)

### 0.1 — No server-verifiable authentication/session exists today

Inspected `src/contexts/AuthContext.tsx`, `src/components/auth/ProtectedRoute.tsx`, and
every file under `api/`. Findings:

- Login (`AuthContext.tsx:47-61`) checks the submitted email against a hardcoded array
  (`src/data/sampleUsers.ts`) and a **hardcoded password literal `'password123'`** —
  there is no backend call of any kind.
- On success, the entire `User` object — including `role` and the full `permissions`
  array — is written directly to `localStorage.setItem('tardis_user', ...)` and read
  back on every page load. `ProtectedRoute` gates rendering purely on whether that
  client-side object is non-null.
- No cookie, JWT, or server session exists anywhere in this app. A grep of every file
  under `api/` for `req.headers`/`cookie`/`jwt`/`session`/`bearer`/`authorization`
  returns zero hits (the one `session` match, `api/calls/session/[id].ts`, is an
  *interaction* session ID, unrelated to user identity).

**This means: today, nothing stops a browser from sending any role it likes to any
`/api/*` endpoint.** Anyone can edit `localStorage.tardis_user` directly and bypass
login entirely — this is true of the app as a whole already, not something Session 4
introduces.

**Decision, per explicit instruction:** the role/category schema and the server-side
authorization *abstraction* (§8–§13) are preserved exactly as designed — building that
shape now is still correct, since it's what a real auth system will plug into later.
But **Session 4 must not claim this constitutes real access control** while the app has
no server-verifiable identity. Concretely:

- The interim mechanism (until real auth exists) is: the browser sends its
  client-side-known `role` string on each `/api/customers/*` request (e.g. a request
  header), and the server-side authorization code (§11) treats it as an **advisory
  filter that shapes the response for a well-behaved client**, not a security boundary
  — a motivated actor can still request any role's view via a direct API call, exactly
  as they already can bypass this app's login. No wording anywhere in this plan, this
  session's implementation, or its future documentation should describe the
  category-filtering as "secure," "access-controlled" in the security sense, or safe to
  rely on for genuinely sensitive data segregation until real server-side auth exists.
- This gap is **not fixed as part of Session 4** — a real fix (server-verified
  sessions, e.g. Supabase Auth or a signed cookie issued by a real login endpoint) is a
  separate, explicitly-scoped future session, since Session 4's brief excludes "a
  general Authentication overhaul." It is called out here so nobody downstream mistakes
  the category/role model for a finished security feature.

### 0.2 — Targeted phone lookup (`search` param): inconclusive, backend currently down

Tested `GET /api/calls/data?search=919145782844` (a phone number confirmed present in
Call Logs) three times with delays between attempts, and cross-checked `/api/agents`
and `/api/analytics/metrics` on the same deployment to isolate whether this was
`search`-specific. All three routes returned identical `502 {"detail":"Upstream
request failed: fetch failed"}` on every attempt — **the entire upstream backend is
unreachable right now**, not a `search`-parameter problem specifically. This matches
the backend's already-documented intermittent instability (Sessions 1–3.5).

**Result: whether `search` matches on phone number is still unconfirmed.** Per
instruction, no broad historical-scan fallback is silently substituted — §4/§15's
design below still names `search=<phone>` as the intended mechanism, but implementation
must re-run this exact check against a live backend **before** the progressive-refresh
code path is built, and if `search` doesn't behave as expected, fall back to the
`date_from`-only bounded-per-contact-point query already named as the contingency
(§24, item 1) — not to an unbounded scan.

---

## 0.3 — Architecture layering: logical product design vs. current deployment

Everything from §1 onward is written at two layers, and they must not be conflated.
This section is the key for reading the rest of the document.

**Logical/product architecture** — the actual Session 4 design, portable to any
hosting environment this product might later run in (including a customer's own
infrastructure where Vercel/Supabase are unavailable or undesired):

- **Customer 360 API/service** — the request/response contracts in §15
  (list/detail/timeline/refresh/backfill/reconcile), defined as a service boundary, not
  as a set of Vercel route files.
- **Customer aggregation service** — §4/§6's progressive-refresh-then-recompute logic:
  a pure operation over "persisted interaction data plus a source lookup," with no
  dependency on any specific function-hosting technology.
- **Persistent customer repository** — an interface, not a Supabase client:
  `getCustomer(id)`, `findByContactPoint(type, normalizedValue)`, `upsertCustomer()`,
  `upsertContactPoint()`, `upsertInteraction()`, `queryInteractions(customerId,
  filter)`, `recomputeAggregate(customerId)`. Any durable relational store can
  implement it.
- **Interaction-source adapter** — an interface: `searchByContactPoint(type, value,
  since?)`, `listPage(cursor)`. Today it wraps the Voice Agent backend's `call-data`;
  a different deployment could plug in a different upstream interaction system without
  touching the aggregation service, because the aggregation service only ever talks to
  this interface, never to `fetch('.../call-data')` directly.
- **Authorization/category service** — §8–§13's role → category → agent resolution,
  expressed as `resolveAuthorizedCategories(role)` /
  `filterInteractionsByAuthorization(interactions, authorization)`, independent of how
  "current role" is ultimately established (§0.1 documents today's specific gap there,
  which is a separate concern from this service's own logic).
- **Background/backfill/reconciliation jobs** (§5) — described as **scheduler-independent
  functions that can be invoked**, not as Vercel Cron entries. What triggers them (a
  cron, a queue consumer, an operator script, a customer's own job scheduler) is a
  deployment concern, never baked into the job's own logic.

**Current deployment implementation** — this specific hosted deployment's adapters,
swappable:

- **Vercel serverless functions** implement the API/service boundary in this
  deployment, because this repo already deploys on Vercel and it is the smallest
  practical fit *today* — not because the product requires Vercel.
- **Supabase/Postgres** implements the persistent customer repository in this
  deployment, for the same reason — not because the product requires Supabase.
- **Vercel Cron** (optional, §5) is one possible scheduler for the background jobs in
  this deployment; any scheduler that can invoke the same job function satisfies the
  same interface equally well elsewhere.

**Practical consequence for the rest of this document:** every section below that
names `api/customers/*.ts`, a specific Supabase table, or a Vercel-specific limit
(execution timeout, Cron plan tier) is describing **this deployment's current adapter**
for one of the logical pieces above — it is not elevated to a product requirement.
Vercel plan limits and Supabase-specific capabilities are never load-bearing for the
*design* (§4's progressive model, §6's deterministic recompute, §8–§13's category/role
model all stand regardless of hosting); they only affect *this deployment's*
operational choices (e.g. whether Cron is available at all — §24, item 4). If this
product is later deployed where Vercel/Supabase are unavailable, only the adapter
layer (the repository implementation, the source-adapter implementation, the API
transport) changes — the repository interface, the source-adapter interface, the
aggregation service, and the authorization service stay the same.

---

## 1. Customer vs. contact-point data model

A customer is not one phone number. The model separates **who** (`customers`) from
**how we've reached them** (`customer_contact_points`) from **what happened**
(`customer_interactions`):

```text
customers (1) ── (many) customer_contact_points ── (many, via contact_point_id) ── customer_interactions
     │                                                                                    │
     └──────────────────────────── (many, via customer_id) ─────────────────────────────┘
```

`customer_interactions` carries both `customer_id` (always) and `contact_point_id`
(when the interaction's identity signal matched a known contact point) — see §3 for why
both exist.

---

## 2. Multi-phone/email readiness

`customer_contact_points.type` is an open text field (`'phone' | 'email' | ...`),
`is_primary` marks the contact point currently treated as the customer's primary
identity for display, and `raw_value`/`normalized_value` are both stored (normalized for
matching, raw for display fidelity). Session 4 only ever creates `type = 'phone'` rows,
since phone is the only contact-point identity the voice channel provides — the `email`
value is schema-ready, not implemented, exactly as the brief asks.

---

## 3. Current identity limitations

Confirmed by inspecting `src/types/api/calls.ts` and cross-checked against
`docs/CALL_CENTRE_BACKEND_CAPABILITY_RECONCILIATION.md`:

| Field | Where | Status |
|---|---|---|
| `caller_number` / `from_phone_number` | every `call-data` row | **Reliable — the only confirmed identity signal today** |
| `customer_id` | `TriggerCallRequestDto` (write-only) | Accepted on write, **never returned** on any read path (`call-data`, `sessions`, `sessions/{id}`) |
| email | nowhere | Not present in any confirmed endpoint |

Because there is no authoritative cross-phone identifier, **Session 4 does not infer
that two phone numbers belong to one customer.** Operationally:
- A new, never-seen-before normalized phone number creates a **new** `customers` row
  and a **new** `customer_contact_points` row, linked 1:1, on first sight.
- Two different phone numbers remain two different `customers` rows indefinitely,
  unless an authoritative identifier or an explicit administrative mapping says
  otherwise — neither of which exists yet.
- The schema supports a customer later gaining a second contact point (e.g. once a
  reliable `customer_id` links two known phone numbers), but **no code in Session 4
  performs that merge**. That is future work, gated on backend capability, not
  something this session guesses at.

---

## 4. Progressive/on-demand aggregation (primary model)

Replaces the previous batch-first design. The primary path is:

```text
GET /api/customers/{id}  (or POST /api/customers/{id}/refresh)
        │
        ▼
load persisted `customers` + `customer_contact_points` row(s)
        │
        ▼
inspect `customers.aggregated_at` / per-contact-point `last_seen` for staleness
        │
        ▼
for each known contact point (typically one phone number), query
GET /call-data?search=<phone>&date_from=<contact_point.last_seen>  ← bounded, targeted
        │
        ▼
upsert any new/missing rows into `customer_interactions` (idempotent, §6)
        │
        ▼
recompute this customer's aggregate from persisted `customer_interactions` (§6 — never incremented)
        │
        ▼
apply role/category authorization (§9–§12)
        │
        ▼
return the authorized Customer 360 view
```

This means opening a customer's detail page (or calling `GET /api/customers/{id}`)
**is** the refresh trigger for that customer — no cron is required for the feature to
work correctly. `GET /api/customers` (the list) does **not** trigger a live refresh per
row (that would mean N source-API calls per list load); it serves the last-persisted
aggregate, which stays reasonably fresh because individual customers refresh themselves
every time anyone opens them, and the reconciliation job (§5) catches customers nobody
has opened recently.

**A `search` filter on `call-data` is required for this to be bounded per customer.**
`CallDataQueryDto.search` already exists (confirmed in `src/types/api/calls.ts:66`);
whether the live backend's `search` param actually matches on phone number is
**confirmed unresolved by preflight check §0.2** (the backend was unreachable at check
time — three attempts, all endpoints, all 502) — must be re-verified against a live
backend before this code path is built. If it doesn't behave as expected, the fallback
is documented in §24, item 1.

### First-lookup / materialization rule (resolved)

The previous draft left open what happens when a phone number has real `call-data`
history but no `customers` row has ever been created for it. Search is the
progressive-discovery entry point, so it must handle this case directly:

```text
Search/lookup by normalized phone number
        │
        ▼
1. Search persisted Customer 360 (customer_contact_points.normalized_value)
        │
   ┌────┴─────┐
 found      not found
   │            │
   │            ▼
   │   2. Query the source interaction API for that phone
   │      (GET /call-data?search=<phone>, pending §0.2 confirmation)
   │            │
   │      ┌─────┴──────┐
   │  history found  no history found
   │      │              │
   │      ▼              ▼
   │  3. Create customers row +          Return "no customer found"
   │     customer_contact_points row     (nothing is fabricated — an
   │  4. Ingest matching interactions     empty search result is a
   │     idempotently (§6 step 1)         genuine, correct answer)
   │  5. Recompute the aggregate (§6)
   │  6. Return the newly materialized
   │     customer
   │            │
   └────────────┴──► return the (existing or newly materialized) customer
```

This applies to both `GET /api/customers?search=<phone>` (list-context lookup) and any
detail lookup keyed by phone rather than an existing internal ID — one shared
materialization function backs every "first sight of a phone number" path, not two
separate implementations. This resolves the previous draft's §24-item-2 "flagged, not
decided" note.

---

## 5. Optional backfill / reconciliation (support functions, not the main model)

*(Logical architecture: scheduler-independent job functions, per §0.3 — each is "a
function that can be invoked," not a Vercel Cron entry. This deployment happens to
expose them as `POST` endpoints and can optionally schedule them with Vercel Cron;
neither detail is part of the job's own design.)*

Both remain in the plan, demoted from "the architecture" to "support jobs":

**Historical backfill** (`POST /api/customers/backfill`, optional, internal) —
useful only to pre-populate the Customers menu with the existing historical
population instead of waiting for every past caller to be looked up individually.
Bounded/cursor-based over `GET /call-data` pages, resumable, idempotent (same
upsert-keyed design as the previous plan), server-side only. Not required for the
feature to function — a customer who's never been backfilled simply gets built
progressively the first time anyone opens or searches for them.

**Periodic reconciliation** (`POST /api/customers/reconcile`, optional, internal) —
catches interactions that progressive refresh would otherwise miss (a customer nobody
opens for a long time), repairs aggregates after an aggregation-rule version bump
(§6), and can run infrequently (e.g. daily, or manually) since nothing depends on it
running on a tight schedule. Not mandatory for normal operation — explicitly per the
brief.

Neither job is wired to a required cron in this plan; §24 item 3 notes the same
Vercel-plan-tier uncertainty as before as an optional enhancement, not a dependency.

---

## 6. Deterministic, idempotent aggregation

No counters are incremented across separate writes. The aggregate is **always fully
recomputed** from the persisted `customer_interactions` rows for that customer:

```text
1. Idempotently upsert/link an interaction row
   (unique on (source, interaction_id) — see §20)
2. Identify the affected customer_id (and contact_point_id, if matched)
3. SELECT and recompute customers.* aggregate fields
   (count(*), min(started_at), max(started_at), last-by-started_at intent/outcome/
   sentiment/agent, count(*) filter (escalation_trigger is not null), etc.)
   directly from customer_interactions WHERE customer_id = X
4. UPDATE customers SET <recomputed fields>, aggregation_version, aggregated_at = now()
```

This is correct across retries (step 1's upsert is a no-op on a repeat), interrupted
refreshes (any completed subset of step 1 already reflects correctly in step 3's
recompute), overlap windows (duplicate rows are impossible by the unique constraint,
so double-counting is impossible), and full reconciliation reruns (recompute always
reflects exactly what's persisted, never what was "added this time"). This directly
replaces the previous plan's `total_interactions = total_interactions + 1`-style
approach, which the brief correctly flags as fragile.

---

## 7. Voice agent identity fields available today

Confirmed in `CallDataEntryDto` (`src/types/api/calls.ts:103-137`) and already used by
`callsMapper.ts:60-63`:

- `agent_id: string | null`
- `ai_agent_id: string`
- `ai_agent_name: string`

The existing mapper's precedence rule (`ai_agent_id` preferred, `agent_id` fallback —
"paired with `ai_agent_name` in the same response") is **reused as-is** as the category
join key (§8), rather than inventing a different precedence for Customer 360. Trigger
Call also accepts `agent_id` on write (confirmed in `TriggerCallRequestDto`), but that's
irrelevant to categorizing *historical* interactions, which is read from `call-data`.

Every `customer_interactions` row retains the actual resolved agent identity
(`agent_id`, `agent_display_name`) — interactions are never collapsed into one generic
history; the category model (§8) is a *view* over agent identity, not a replacement
for storing it.

---

## 8. Customer 360 category model

Two new tables, generic and extensible, with no banking-specific logic hard-coded into
application code:

### `customer360_categories`
`id, name, description, active, created_at, updated_at`

### `customer360_category_agents`
`category_id, agent_id` (composite key) — many-to-many, so a category like "Loans" can
map to several agent IDs (`loan-inbound-agent`, `loan-followup-agent`,
`emi-reminder-agent`, `loan-renewal-agent`) exactly as the brief's example shows, while
the *initial* population (§17) creates one category per agent, a 1:1 special case of
the same general model — no separate code path for "simple" vs. "grouped" categories.

An interaction's category is resolved by joining its resolved `agent_id` (§7) through
`customer360_category_agents` to `customer360_categories`. This is computed at
query/aggregation time (or cached onto the interaction row — see §20's
`category_id` column) rather than hard-coded per interaction type.

---

## 9. Agent-to-category mapping

Covered by `customer360_category_agents` (§8). Resolution rule (§16, restated here for
completeness): classify strictly from the interaction's resolved `agent_id`
(`ai_agent_id` ?? `agent_id`), **never** from `intent`, `tags`, or transcript content —
those are free text an AI agent or customer produced, not an access-control-safe
signal. If an agent has no mapping row, the interaction is retained and marked
`category_id = null` ("uncategorized"), never silently dropped, and never exposed to a
restricted role by default (§16 defines the exact handling rule).

---

## 10. Role-to-category mapping

```text
User → role (existing User.role field) → allowed customer360_categories → agents → interactions
```

New table: `role_customer360_categories (role text, category_id uuid)` — composite key.
`role` is a plain text column holding one of this app's existing
`User['role']` values (`'call_center_head' | 'qa_reviewer' | 'product_manager' |
'ai_operations_specialist'`, from `src/types/auth.ts`), **not** a foreign key into a
new roles table — Session 4 explicitly does not redesign authentication/user
management. This is intentionally the smallest possible bridge from the app's existing
role model to the new category model.

**All-access handling**: rather than enumerating every category for
`call_center_head` (today's only full-access sample role) in this join table forever, a
role can also be marked all-access via a small `role_customer360_access
(role text primary key, all_categories boolean not null default false)` table — checked
first; if `all_categories = true` for the current user's role, category filtering is
skipped entirely (equivalent to "a supervisor/all-access role may receive the full
aggregate," §9 of the brief). This avoids a maintenance trap where a new category
silently isn't visible to the one role that's supposed to see everything.

Initial seed data (part of the migration, §20): `call_center_head` → `all_categories =
true`; every other existing role gets **no** category rows by default (fail-closed —
see §16) until an administrator explicitly grants categories. This is a data seed, not
new UI — no admin screen for managing these mappings is built in Session 4 (that would
be "sophisticated category rule engine," explicitly excluded); rows are managed via
direct migration/SQL for now, same as how `sampleUsers.ts` itself is currently
maintained by hand.

---

## 11. Server-side access filtering

> **Known limitation — read §0.1 first.** Everything below describes a real
> server-side *filtering* mechanism: unauthorized rows genuinely never leave the
> Vercel function, which is a real improvement over hiding them in React. What it is
> **not** — until a real auth system exists — is a defense against a client that lies
> about its own role. "Resolve current user's role" below means "read whatever role
> string the request says it is," because that is the only signal this app has today.
> This is documented, not hidden, and is not sold as more than it is.

All filtering happens inside the Vercel API layer, never in the browser:

```text
GET /api/customers/{id}
        │
        ▼
resolve current user's role (today: from the client-supplied role signal — see §0.1;
   later: from a real server session, once one exists — no other code here changes)
        │
        ▼
resolve role_customer360_access.all_categories, else role_customer360_categories rows
        │
        ▼
resolve agent_ids mapped to those categories (customer360_category_agents) — live,
   at query time (see §16/§20: customer_interactions.category_id is never trusted
   for this decision, only used as a display cache)
        │
        ▼
query customer_interactions WHERE customer_id = X
        AND (all_categories OR agent_id IN (agent_ids mapped to authorized categories
             via a live join through customer360_category_agents)
             OR (uncategorized AND all_categories))   -- §16's uncategorized rule
        │
        ▼
return only authorized interaction rows AND an aggregate recomputed (§6) over
only that authorized subset
```

The browser never receives an unfiltered payload that it then hides client-side — the
unauthorized rows never leave the server (for a well-behaved client — see the callout
above). This directly satisfies §9/§11 of the brief and is the reason §12 (below)
reverses the previous plan's direct-Supabase-read recommendation. **Authorization
always resolves through `customer_interactions.agent_id → customer360_category_agents
→ customer360_categories` at query time** — never by filtering on a stored
`category_id` value, so a category/agent-mapping change (an administrator moving an
agent to a different category) takes effect on the very next request, with no
reconciliation lag for access-control purposes (§16, §20 detail this further).

---

## 12. Authorized-view aggregate behavior

`customers.*` (the persisted, deterministic aggregate from §6) represents the **full**
aggregate across all categories — it is never itself filtered, so recomputation stays
simple and correct. Every API response, however, returns a **response-shaped**
aggregate computed by re-running §6's recompute query with the same category `WHERE`
clause as §11, not by returning the persisted `customers.*` row directly. Concretely:
if a customer has 100 total interactions but the requesting role can only see Loans and
Service (say 23 of them), `GET /api/customers/{id}` returns `visibleInteractionCount:
23` and every latest-* field computed only from those 23 rows — never `100`, and never
a `visibleInteractionCount` alongside a leftover `totalInteractionCount: 100` field
that would leak the same information. The full persisted aggregate is for internal
staleness/reconciliation bookkeeping only and is never serialized into any API
response.

---

## 13. Customer list visibility rule

**A customer appears in `GET /api/customers` only if they have at least one interaction
in a category the requesting role can access.** Implemented as an `EXISTS` filter in
the list query (join `customer_interactions` → resolved category → role's authorized
set), not a post-filter over an unfiltered list. List summary fields (last interaction,
visible interaction count, latest visible intent/outcome/sentiment, visible categories)
are computed the same authorized-subset way as §12 — a customer with 100 interactions
but only 1 visible to this role shows `visibleInteractionCount: 1` and a `last
interaction` date drawn only from that 1 row, not from their true most-recent
interaction if that one is in a restricted category.

This is stated explicitly, as the brief requests, because it's a meaningful product
decision: a supervisor who can't see a customer's Loans activity should not be able to
infer "this customer has other, hidden activity" from a total count that doesn't match
what they can see, and should not see the customer at all if literally everything about
them is restricted.

---

## 14. Persistence choice

*(Logical architecture: a persistent customer repository interface, per §0.3 — the
choice below is this deployment's current adapter for that interface, documented
explicitly as a deployment choice, not a product requirement. Domain logic — the
aggregation service, §6, and the authorization service, §11 — depends only on the
repository interface's operations, never on Postgres/Supabase-specific behavior.)*

**Amended at implementation time, by explicit instruction:** rather than this app's own
Supabase project (the one behind `VITE_SUPABASE_*`, used for WhatsApp/chat), Customer
360 persistence lives in a **separate, already-existing Supabase project — "AuditAI"
(`dtbaczafdzgctkbqviod`)** — isolated inside its own dedicated `call_center` Postgres
schema. This keeps the smallest-addition reasoning (§14's original argument) while
guaranteeing zero collision with either Supabase project's own pre-existing objects.
`call_center` is deliberately **not** added to PostgREST's exposed-schema list — the
only access path is a set of `public.call_center_*` `SECURITY DEFINER` functions
(`supabase/migrations/20260924150000_customer360_foundation.sql`), each individually
granted to `service_role` only (confirmed via `has_function_privilege` — `anon`/
`authenticated`/`public` all `false`) and revoked from everything else. This is a
*stricter* form of "configure only the minimum schema grants/exposure needed for
server-side service-role access" than a directly REST-exposed schema would have been.

**What changes from the previous plan: the access boundary.** The previous plan's
"direct Supabase client reads with RLS" recommendation for list/detail/timeline is
**reversed**. Per §11 of the brief, category-based filtering must be enforced
server-side, and this app's auth is not Supabase Auth, so Supabase RLS has no reliable
signal to filter on anyway. All reads now go through the Vercel API layer:

```text
React → Vercel API / server layer → call_center_* RPC functions → call_center.* tables
```

matching the same shape already used for the Voice Agent backend proxy
(`api/calls/*.ts` → `VOICEBOT_BASE_URL`). The database is accessed **only** with the
service-role key, **only** from `api/customers/*.ts` (via
`src/server/customer360/supabaseCustomerRepository.ts`), **never** from browser code —
`CUSTOMER360_SUPABASE_URL` / `CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY` are server-only env
vars, added the same way `VOICEBOT_API_KEY` already is, and never reach the client
bundle (verified the same way, §23.9).

---

## 15. Customer APIs

*(Logical architecture: the Customer 360 API/service boundary, per §0.3 — these are
service contracts, portable to any transport. `GET`/`POST` and the `/api/customers/...`
path shape below are this deployment's current HTTP/Vercel adapter for that boundary,
not part of the product-level contract itself.)*

```text
GET  /api/customers                    — authorized, category-filtered list (§13)
GET  /api/customers/{id}               — authorized Customer 360 view (§4, §11, §12); this call itself triggers progressive refresh of stale contact points before responding
GET  /api/customers/{id}/interactions  — authorized, paginated interaction timeline
POST /api/customers/{id}/refresh       — explicit refresh (same logic GET /{id} runs implicitly; exposed separately for an explicit "Refresh" UI action / for a caller who wants to force it regardless of staleness)

POST /api/customers/backfill           — internal/admin, optional (§5)
POST /api/customers/reconcile          — internal/admin, optional (§5)
```

`GET /api/customers/{id}`'s refresh behavior: inspect the customer's known contact
points and their individual `last_seen`; for each stale-enough contact point, query
`GET /call-data?search=<phone>&date_from=<contact_point.last_seen>` (bounded to that one
customer, never "the browser calling hundreds of source pages" — the brief's explicit
constraint); upsert/link any new rows (§6 step 1); recompute (§6 steps 2-4); apply
authorization (§11, §12); return the result. If a contact point was refreshed very
recently (e.g. within the last few minutes), the fetch is skipped and the persisted
data is served as-is, so rapidly reopening the same customer doesn't hammer the source
API.

---

## 16. Category assignment rule (restated precisely, per brief §16)

1. Classify strictly from the interaction's resolved agent identity
   (`ai_agent_id` ?? `agent_id`, §7) — never from `intent`, `tags`, or transcript text.
2. Resolve that agent through `customer360_category_agents`. **This resolution happens
   twice, for two different purposes, and they must not be confused:**
   - **At ingestion time** (§6 step 1), the resolved category is written into
     `customer_interactions.category_id` as a **denormalized display/performance
     cache** — used for fast list rendering, never for security decisions.
   - **At every authorization-bearing query** (§11), the resolution is repeated
     **live** — `agent_id` is joined through the *current* `customer360_category_agents`
     table, ignoring whatever `category_id` happens to be cached. If an administrator
     moves an agent to a different category (or adds a mapping for a
     previously-unmapped agent) after ingestion, the very next authorization check
     reflects that change immediately; the cached `category_id` only catches up once
     reconciliation (§5) re-runs and rewrites it. **`category_id` is never an input to
     an access-control decision** — only the live join is.
3. **If the agent has no mapping row** (checked live, per the rule above): the
   interaction is retained in `customer_interactions` (with a cached `category_id =
   null`), never dropped.
4. **Uncategorized-interaction exposure rule**: an interaction whose agent has **no
   live mapping** is visible **only** to a role with
   `role_customer360_access.all_categories = true`. It is never shown to a
   category-scoped role, even if that role has access to some categories — "no mapping"
   is treated as "unclassified, not yet safe to show a restricted role," not as
   "implicitly public." This is the explicit, documented rule the brief asks for, and
   it is evaluated live for the same reason as point 2: if a mapping is added later, an
   interaction that was uncategorized at ingestion becomes correctly visible to the
   right category-scoped role on the next request, without waiting for reconciliation.

---

## 17. Initial category population

Inspected `src/types/api/agents.ts` / `AgentSummaryDto` — the live `GET /api/v1/agents`
response is confirmed (§ Session 1 follow-up) to return `agent_id`, `display_name`,
`persona_name`, `direction`, `language`, `is_default` per agent, with **no existing
category/domain field** to read a classification from. The safe initial method, per the
brief's own suggestion:

```text
category name         = agent's display_name  (e.g. "Inbound Banking Assistant")
category description  = null (administrator can fill in later)
category mapping       = exactly that one agent_id
```

Populated by a one-time seed step (part of §22's deployment sequence, not a standing
job): call `GET /agents`, and for every `agent_id` not already present in
`customer360_category_agents`, create a new `customer360_categories` row named after
its `display_name` and map it 1:1. No semantic business grouping (e.g. inferring
"Loans" from "EMI Reminder" and "Forex Transaction" from their names) is invented — the
brief is explicit that this only happens "if the agent name clearly supplies them," and
guessing a grouping from a display string is exactly the kind of speculative
classification this plan avoids elsewhere. An administrator can later rename a category
or move an agent to a different category (a `customer360_category_agents` row update)
without touching any `customer_interactions` row, since categorization is resolved via
join, not stored redundantly per interaction (aside from the denormalized
`category_id` cache noted in §20, which a reconciliation run refreshes).

---

## 18. Existing Sessions 1–3.5 stability

No file from Sessions 1–3.5 is modified except the two narrowly-scoped additions
already called out in §21 (one `Sidebar.tsx` nav entry, one router registration) —
identical commitment to the previous plan. `Customer 360` reuses
`src/lib/format.ts`'s shared formatters and the `QueryErrorBanner` component (Session
3.5) rather than inventing new formatting/error-state patterns, and the interaction
timeline reuses the existing `InteractionDetailDialog` unmodified (§19) rather than
building a second transcript/recording viewer. No broad refactor of Dashboard, Initiate
Call, Call Logs, Interaction Detail, or Live View is performed.

---

## 19. Future Chat linkage, including missing customer identity and agent ID

Confirmed (independently, in both this plan's research and the previous version's) that
`POST /chat`'s response (`{session_id, response, data_source, authenticated, intent,
confidence, detection_method, latency_ms}`) has **no phone/customer identity field and
no `agent_id` field**. Both gaps matter here: without identity, a chat session can't be
linked to a `customer_contact_points` row; without `agent_id`, a chat session couldn't
be categorized even if it were linked. Session 4:

- does **not** fabricate a customer link for any chat session;
- does **not** attach unidentified chat sessions to any customer record;
- keeps `customer_interactions.source`/`channel` open (`'call-data'`/`'voice'` today,
  `'chat'` later) and keeps `contact_point_id` nullable, so a future session can add
  chat rows the moment the Chat API exposes an equivalent identity field and an
  agent/category-mappable identifier — no schema redesign needed, only new rows and a
  new ingestion path;
- records this as a **backend/API dependency** (the team building the Chat API needs to
  add both fields) rather than a frontend problem to work around.

The Chat Console itself is not built in Session 4.

---

## 20. Exact database tables, indexes, constraints

All in the existing Supabase project. New migration file:
`supabase/migrations/<timestamp>_customer360.sql`.

### `customers`
| Column | Type |
|---|---|
| `id` | `uuid pk default gen_random_uuid()` |
| `display_name` | `text null` |
| `source_customer_ref` | `text null` — placeholder for a future authoritative external ID; never populated by Session 4 code (§3) |
| `first_seen` | `timestamptz not null` |
| `last_seen` | `timestamptz not null` |
| `total_interactions` | `int not null default 0` — **full**, unfiltered aggregate (§12) |
| `inbound_count` / `outbound_count` | `int not null default 0` |
| `latest_intent` / `latest_outcome` / `latest_sentiment_label` | `text null` |
| `latest_sentiment_score` | `numeric null` |
| `escalation_count` | `int not null default 0` |
| `channels` | `text[] not null default '{}'` |
| `latest_agent_id` / `latest_agent_display_name` | `text null` |
| `auth_summary` | `jsonb null` |
| `aggregation_version` | `int not null default 1` |
| `aggregated_at` | `timestamptz not null` |
| `created_at` / `updated_at` | `timestamptz not null default now()` |

### `customer_contact_points`
| Column | Type |
|---|---|
| `id` | `uuid pk default gen_random_uuid()` |
| `customer_id` | `uuid not null references customers(id)` |
| `type` | `text not null` — `'phone'` today |
| `raw_value` | `text not null` |
| `normalized_value` | `text not null` — via `src/lib/phoneIdentity.ts` `normalizePhoneNumber()` (unchanged from the previous plan) |
| `is_primary` | `boolean not null default true` |
| `first_seen` / `last_seen` | `timestamptz not null` |
| `created_at` / `updated_at` | `timestamptz not null default now()` |

`unique (type, normalized_value)` — this is the natural-identity key: a given phone
number maps to exactly one contact point, hence exactly one customer, until an
authoritative merge process (not built in Session 4) says otherwise.

### `customer_interactions`
| Column | Type |
|---|---|
| `id` | `uuid pk default gen_random_uuid()` |
| `customer_id` | `uuid not null references customers(id)` |
| `contact_point_id` | `uuid null references customer_contact_points(id)` |
| `interaction_id` | `text not null` — `call_id` today |
| `channel` | `text not null default 'voice'` |
| `direction` | `text null` |
| `agent_id` | `text null` — resolved `ai_agent_id ?? agent_id` (§7) |
| `agent_display_name` | `text null` |
| `category_id` | `uuid null references customer360_categories(id)` — denormalized cache of the §8 join, refreshed by reconciliation (§5) if a category mapping changes after ingestion |
| `started_at` | `timestamptz not null` |
| `duration_seconds` | `int null` |
| `intent` / `outcome` | `text null` |
| `sentiment_score` | `numeric null` |
| `was_authenticated` | `boolean null` |
| `escalation_trigger` | `text null` |
| `campaign_name` | `text null` |
| `recording_available` | `boolean not null default false` — derived flag, not the URL (unchanged rationale from the previous plan) |
| `source` | `text not null` — `'call-data'` today |
| `ingested_at` | `timestamptz not null default now()` |

`unique (source, interaction_id)` — the idempotency key for §6 step 1.
Indexes: `customer_interactions(customer_id, started_at desc)`,
`customer_interactions(contact_point_id)`, `customer_interactions(category_id)`,
`customer_contact_points(customer_id)`.

### `customer360_categories`
`id uuid pk, name text not null, description text null, active boolean not null default
true, created_at/updated_at timestamptz not null default now()`.

### `customer360_category_agents`
`category_id uuid references customer360_categories(id), agent_id text not null` —
composite primary key `(category_id, agent_id)`. Index on `agent_id` (the lookup
direction used during ingestion, §16).

### `role_customer360_categories`
`role text not null, category_id uuid references customer360_categories(id)` —
composite primary key `(role, category_id)`.

### `role_customer360_access`
`role text primary key, all_categories boolean not null default false`.

### `customer_aggregation_state` (unchanged concept from the previous plan)
Small bookkeeping table for the optional reconciliation job (§5) — not a functional
dependency of the progressive model (§4).

No RLS policies are needed on any of these tables in the sense of browser-facing
policies, since the browser never queries Supabase directly (§14) — the service-role
key bypasses RLS by design. A conservative `alter table ... enable row level security`
with **no** permissive policies (i.e., deny-all except service role) is still applied to
every new table as defense in depth, consistent with not exposing these tables to the
anon key even accidentally.

---

## 21. Exact files/routes/services/hooks/components to create or modify

Per §0.3, the server-side layout is split into a **domain layer** (the logical
architecture — repository/adapter/service interfaces and their implementations, with
no Vercel-specific code) and a thin **transport layer** (the current deployment's
Vercel route files, which only parse a request, call the domain layer, and shape a
response). This is the concrete file-level form of "isolate persistence behind a
repository boundary" and "isolate voice call-data access behind an
interaction-source adapter."

**New Supabase migration:**
- `supabase/migrations/<timestamp>_customer360.sql` — all tables in §20, indexes,
  deny-all RLS, and the `role_customer360_access` seed row for `call_center_head`.

**New domain layer** (`src/server/customer360/` — plain TypeScript, no Vercel imports,
usable from any transport):
- `customerRepository.ts` — the repository interface (§0.3's `getCustomer`,
  `findByContactPoint`, `upsertCustomer`, `upsertContactPoint`, `upsertInteraction`,
  `queryInteractions`, `recomputeAggregate`) plus `supabaseCustomerRepository.ts`
  in the same folder, the **only** file in the whole domain layer allowed to import
  `@supabase/supabase-js` — this is the current deployment's adapter (§14), swappable
  without touching anything else in `src/server/customer360/`.
- `interactionSourceAdapter.ts` — the interface (`searchByContactPoint`, `listPage`)
  plus `voiceAgentInteractionSource.ts`, the current adapter wrapping `call-data`
  (reusing `api/_voicebot.ts`'s `proxyRequest`/retry philosophy, but called as a
  library function, not exposed as its own route).
- `aggregationService.ts` — `refreshCustomer()` (§4's progressive-refresh flow,
  §3's materialization rule), `recomputeAggregate()` (§6, full/unfiltered), calling
  only the repository and source-adapter interfaces above, never Supabase or `fetch`
  directly.
- `authorizationService.ts` — `resolveUserAccess(role)`, `filterInteractions(...)`,
  `recomputeAuthorizedAggregate(...)` (§9–§13, §16's live agent→category resolution).
  Depends only on the repository interface, not on how `role` was obtained (§0.1's
  gap stays isolated to the transport layer — see below).
- `backfillJob.ts`, `reconcileJob.ts` — the two support jobs (§5), written as plain
  invokable functions (`runBackfillBatch(cursor, batchSize)`,
  `runReconciliation()`), with no scheduler dependency of any kind.

**New transport layer (this deployment's Vercel functions)** — each one is a thin
adapter: parse the request (including, today, reading the client-supplied role signal
per §0.1), call the matching domain-layer function, shape the HTTP response:
- `api/customers/index.ts` — `GET` (list, §13) → `authorizationService` + `customerRepository`
- `api/customers/[id]/index.ts` — `GET` (detail + implicit refresh, §4, §15) → `aggregationService.refreshCustomer()` + `authorizationService`
- `api/customers/[id]/interactions.ts` — `GET` (paginated timeline) → `authorizationService`
- `api/customers/[id]/refresh.ts` — `POST` (explicit refresh) → `aggregationService.refreshCustomer()`
- `api/customers/backfill.ts` — `POST`, optional/internal (§5) → `backfillJob.runBackfillBatch()`
- `api/customers/reconcile.ts` — `POST`, optional/internal (§5) → `reconcileJob.runReconciliation()`
- `api/customers/_seedCategories.ts` — one-time seed helper for §17 (invoked by a
  script, not a public route)

**New frontend:**
- `src/types/customer.ts` — API response shapes for list/detail/timeline (already
  server-filtered; no DTO-boundary concerns here since these responses come from our
  own API, not a third-party DTO)
- `src/types/contact.ts` — `OperationalContact` retired in favor of the richer
  `src/types/customer.ts` shapes now that Session 4 actually implements this; the file
  is removed once nothing imports it, not left as dead code
- `src/lib/phoneIdentity.ts` — unchanged from the previous plan
- `src/services/customers/{customersService,customersKeys}.ts` — calls the new
  `/api/customers/*` routes via the existing `httpClient` (`src/services/transport/`),
  matching how `calls`/`agents` already call their own proxy routes. No
  `customersMapper.ts` is needed the way `calls`/`agents` have one, since these API
  responses are already our own normalized shape, not a third-party DTO needing
  boundary translation.
- `src/hooks/customers/{useCustomers,useCustomerDetail,useCustomerInteractions,useRefreshCustomer}.ts`
  — `useQuery`/`useMutation` wrappers, same shape as `useCallData`/`useTriggerCall`, so
  `QueryErrorBanner` drops in unchanged.
- `src/pages/Customers.tsx`, `src/pages/CustomerDetail.tsx`
- `src/components/layout/Sidebar.tsx` — one new entry:
  `{ name: 'Customers', href: '/customers', icon: Users, permission: 'view_call_logs' }`
  (reusing an existing permission string, not inventing a new one — the
  category/role-access model in §10 is the real gate; the sidebar permission just
  controls whether the menu item/route exists at all, same as every other nav entry)
- Router registration file — one new route pair (`/customers`, `/customers/:customerId`)

**New tooling:**
- `scripts/backfillCustomers.ts` — optional, drives `/api/customers/backfill` (§5)
- `scripts/seedCustomer360Categories.ts` — drives `_seedCategories.ts` (§17), run once
  post-deploy and again any time a new agent appears with no category

**New env vars (server-only):**
- `SUPABASE_SERVICE_ROLE_KEY`

**Nothing else is modified** beyond the Sidebar entry and router registration.

---

## 22. Migration/deployment sequence

*(This entire sequence is specific to the current Vercel + Supabase deployment
adapter, per §0.3 — a different deployment target would follow the equivalent steps
for its own chosen repository/transport implementations, not this exact list.)*

1. Add and review the migration (§20) against the existing Supabase project.
2. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel's server env.
3. Deploy `api/customers/*.ts` (transport layer) and `src/server/customer360/*`
   (domain layer, including the Supabase repository adapter and the voice-agent
   source adapter).
4. Run `scripts/seedCustomer360Categories.ts` once against the live `GET /agents`
   response (§17) — creates the initial 1-category-per-agent mapping. Confirm
   `role_customer360_access` has the seeded `call_center_head` all-access row from the
   migration.
5. *(Optional)* Run `scripts/backfillCustomers.ts` to pre-populate historical customers,
   in bounded batches, tolerant of the demo backend's known intermittent 502s — not
   required before step 6, since the progressive model builds customers on demand.
6. Deploy the read-side (services/hooks/pages/nav).
7. *(Optional, later)* Enable the reconciliation job on a schedule once the Vercel plan
   tier is confirmed (§24, item 4) — not a launch blocker.

No existing screen's deploy behavior changes.

---

## 23. Verification strategy

1. `tsc --noEmit`, `npm run build`, `npm run lint` — zero new errors beyond the
   established baseline.
2. Migration applies cleanly; confirm all eight new tables, their constraints, and the
   seeded `role_customer360_access`/`customer360_category_agents` rows exist.
3. **Progressive refresh, end to end**: pick a phone number with real `call-data`
   history but no `customers` row yet; confirm `GET /api/customers?search=<phone>`
   materializes it per the resolved rule in §4 (persisted lookup → source phone
   lookup → materialize only if real interaction history exists) — one shared code
   path, not two, per §4/§24 item 2. Then trigger a real test call (Initiate Call,
   Session 3.5's flow) to that same number and confirm a subsequent
   `GET /api/customers/{id}` picks up the new interaction via the same progressive
   refresh.
4. **Idempotency**: re-run `GET /api/customers/{id}` (or `POST .../refresh`)
   repeatedly for the same customer with no new interactions; confirm
   `customer_interactions` row count and `customers.*` aggregate are unchanged between
   calls.
5. **Deterministic recompute**: manually verify that a customer's aggregate fields
   exactly match a hand-computed aggregate over their `customer_interactions` rows
   (not "close to" — exactly, since §6 recomputes rather than increments).
6. **Category/role filtering**: as `call_center_head` (all-access seed), confirm a
   customer's full interaction set and true total count are visible. Temporarily add a
   `role_customer360_categories` row scoping `qa_reviewer` to one category; confirm
   that role's view of the same customer shows only that category's interactions and a
   `visibleInteractionCount` that matches only those rows — not the true total.
7. **Uncategorized handling**: confirm an interaction whose `agent_id` has no
   `customer360_category_agents` mapping is retained (`category_id null`), is visible
   to the all-access role, and is **not** visible to a category-scoped role.
8. **Customer list visibility**: confirm a customer whose only interactions are in a
   category a given role can't access does not appear in that role's `GET
   /api/customers` at all.
9. `grep` the production `dist/` bundle for the literal `CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY`
   value and for the `supabaseCustomerRepository` filename — must never appear client-side.
10. Confirm `/customers` and `/customers/:id` render correctly, search works, the
    interaction timeline opens the existing `InteractionDetailDialog` unmodified
    (recording/transcript states behave exactly as already verified in Session 3.5),
    and no Session 1–3.5 screen's behavior changed (`git diff --stat` shows only the
    files in §21 plus the two small existing-file edits).

---

## 24. Remaining genuine backend/API gaps

0. **No server-verifiable auth/role exists (§0.1) — the largest open gap, confirmed,
   not hypothetical.** Preserved by design (schema + authorization-service abstraction
   stand as specified), but real enforcement is blocked on a future auth session. Not
   fixed by, and not blocking, the rest of Session 4 — but must not be described as
   "done" or "secure" in any status report once implemented.
1. **Whether `GET /call-data`'s `search` param actually matches on phone number —
   confirmed unresolved by preflight check §0.2**, not merely "unconfirmed" as in the
   first draft: three live attempts against the deployed backend all failed with 502
   (whole-backend outage at check time, not a `search`-specific failure). The
   progressive-refresh design (§4, §15) depends on a bounded, per-customer query —
   `search=<phone>` is the natural fit given the confirmed DTO field, but this
   specific behavior must be re-verified against a live backend before that code path
   is built. If `search` doesn't match phone numbers as expected, the fallback is a
   bounded `date_from`-only query per contact point (re-scans more broadly than
   strictly necessary, still far short of "hundreds of pages") — documented here so
   implementation isn't blocked on discovering this mid-build, and no unbounded scan
   is substituted silently either way.
2. ~~First-lookup-before-any-record-exists gap~~ — **resolved.** See §4's "First-lookup
   / materialization rule": search always checks the persisted repository first, then
   falls through to the interaction-source adapter (§0.3) for a phone never seen
   before, materializing a customer only if real history exists.
3. **`customer_id`/`source_customer_ref` may never be returned** by the current
   interaction source, unchanged risk from the first draft — the schema tolerates it
   indefinitely, at either logical layer (§0.3) or current-adapter layer.
4. **This deployment's Vercel plan tier / Cron availability remains unconfirmed** —
   per §0.3, this is purely a current-deployment-adapter concern (which scheduler runs
   the reconciliation job, §5), never a blocker on the core design, since
   reconciliation is explicitly optional.
5. **Demo backend instability** (intermittent 502s, directly observed during preflight
   check §0.2) affects the progressive refresh path directly — a customer-detail
   request that hits a 502 mid-refresh must fail gracefully and **still return the
   last-known persisted view** (a "refresh failed, showing cached data" signal,
   mirroring `QueryErrorBanner`'s existing cached-data-survives-an-error UX from
   Session 3.5) rather than failing the whole request. This needs to be designed as
   part of `aggregationService.refreshCustomer()` (§21), not assumed away.
6. **Chat API's missing identity and `agent_id` fields** (§19) — a confirmed,
   independently-verified gap, tracked as a dependency on the Chat API team, not a
   frontend problem.

---

Stop after this revised plan. No implementation code has been written. Waiting for
approval before beginning Session 4.
