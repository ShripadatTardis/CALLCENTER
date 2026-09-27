# Session 11.5A — Customer 360 Operational Foundation

VoiceForce-only backend/architecture session, grounded in
`docs/SCREEN_REVIEW_05_CUSTOMER_360.md` (Session 11.5) and the approved
`docs/VOICEFORCE_CUSTOMER_360_INITIATE_CALL_DESIGN_v1.docx` (v1.0,
27 Sep 2026). No Call Centre code touched, no enhanced/未-available
Partner API contract called or mocked, no VoiceForce-side LLM
introduced, no Customer 360 screen redesigned, no full calendar built,
no live calls/chats/campaigns triggered. Not deployed — local commit
only; the user decides next steps.

---

## A. Campaign Result semantic model — audit of the existing implementation

Traced `campaign_targets → campaign_executions → campaign_results →
effective_result_id → follow-up/next_action_at` end-to-end in
`src/server/campaigns/{types,reconcileExecutions,resultRules,
campaignRunner}.ts` and the SQL in `supabase/migrations/
20260926090000_campaigns_foundation.sql` /
`20261002000000_campaigns_agent_contract_and_input_mapping.sql`.

**Headline: the three concepts are already cleanly separated in code —
no conflation found.**

- **Execution Status** (`CampaignExecutionStatus`: `queued | triggering
  | triggered | failed`) — the Trigger Call action's own lifecycle
  only, on `campaign_executions.status`.
- **Reconciliation Status** (`ReconciliationStatus`: `pending |
  reconciled | unresolved | error`) — a distinct state machine on
  `campaign_executions.reconciliation_status`, tracking whether that
  execution has been matched to a real Call Centre call-data row yet.
- **VoiceForce Campaign Result** (`campaign_results` table,
  `campaign_target.effective_result_id`) — created ONLY when an
  execution's reconciliation transitions to `'reconciled'`
  (`call_center_campaign_update_reconciliation_status`), via
  `deriveCampaignResult` (`resultRules.ts`) matching the call's
  `status`/`outcome`/`escalation_trigger`/`intent` fields against the
  campaign's own configured `campaign_result_rules` (priority-ordered,
  `is_success` read directly from the matching rule, never inferred
  from text).
- **Call Centre Actual Outcome** — does not exist as a separate field
  today. `deriveCampaignResult` reads `callData.status`/`callData.outcome`
  — the CURRENT (non-enhanced) `/call-data` fields — not a distinct
  `actual_outcome_code`. This is honestly reflected in the type
  comments (`types.ts`'s `DerivedCampaignResult`/`CallAgentContract`
  doc-comments) as "no real structured-output field exists on today's
  call-data response... stays null until Call Centre exposes one" —
  not fabricated, not silently presented as more than it is.

**How Campaign Result is established / what happens after multiple
attempts** (confirmed via
`20261002000000_campaigns_agent_contract_and_input_mapping.sql:232-273`,
the `call_center_campaign_update_reconciliation_status` SQL function):

1. Every successful reconciliation (`'reconciled'` transition with a
   result) **inserts a NEW `campaign_results` row** — one row per
   reconciled execution, never an update-in-place.
2. `campaign_targets.effective_result_id` is then **unconditionally
   overwritten** to point at that newest row. There is no "only
   overwrite if better/different" comparison — the latest reconciled
   attempt always wins. This is a real, deliberate design point worth
   surfacing to product before Customer Detail displays it as "the"
   result (see §Remaining decisions below).
3. Target status becomes `'follow_up_due'` if the matched rule's
   `nextActionType` is `retry`/`follow_up`, else `'completed'`. An
   `'unresolved'` reconciliation also sets `'follow_up_due'`.
4. `call_center_campaign_select_runnable_targets` re-selects
   `follow_up_due` targets once `next_action_at <= now()`, so a target
   can genuinely execute multiple times.

**Historical preservation — confirmed, not assumed**: because each
reconciliation inserts a new `campaign_results` row rather than
updating one, every prior result for a target remains queryable (by
`campaign_target_id`) even after `effective_result_id` moves on to a
newer row. Nothing is overwritten or deleted — only the *pointer*
changes. Verified live: `call_center_campaign_list_customer_targets`
(built this session, §B below) returns each target's full row
including `effective_result_id`; the underlying `campaign_results`
table was queried directly during testing and confirmed to retain
every inserted row.

**Target status / execution status / Campaign Result / follow-up
relationship**: `campaign_targets.status` is the single coarse
lifecycle (`pending → ready → in_progress → completed | failed |
follow_up_due → closed`); each attempt is a `campaign_executions` row
with its own execution+reconciliation status; a Campaign Result exists
only for executions that reached `reconciled`; follow-up is expressed
as `next_action_at`/`follow_up_due` status, not a separate table (a
`campaign_followups` table exists in schema for explicit
scheduled-follow-up records, distinct from the implicit
`follow_up_due` retry path — not investigated further, out of this
session's scope).

**Future Call Centre mapping (documented, not implemented)**: once the
enhanced `/call-data` contract ships `actual_outcome_code`/structured
outputs, `deriveCampaignResult` would gain a genuinely distinct "Call
Centre Actual Outcome" input, separate from — and feeding into —
VoiceForce's own rule-based Campaign Result, rather than the same field
serving both roles as it does today.

---

## B. Customer → Campaign relationship (implemented)

**New backend capability**: `CampaignRepository.listCustomerTargets(customerId)`
→ `GET /api/customers/{id}?action=campaigns`.

- **SQL**: `call_center_campaign_list_customer_targets(p_customer_id)`
  (new migration, §Files below) — mirrors the existing
  `call_center_campaign_list_targets` exactly, filtered by
  `tg.customer_id` instead of `tg.campaign_id`, with `campaigns.name`/
  `agent_id`/`agent_name` and `customers.display_name` joined in.
  Unpaginated by design — a single customer's campaign history is
  expected to stay small (Session 11.5 review §12's "compact slice,
  not a second campaign log"), not the pattern a campaign-scoped list
  needs.
- **TypeScript**: `CustomerCampaignTargetRow` (`types.ts`) extends the
  existing `CampaignTargetRow` with `campaignName`/`campaignAgentId`/
  `campaignAgentName`. `supabaseCampaignRepository.listCustomerTargets`
  maps the RPC result.
- **Exposes** (all from existing data, no enhanced-API dependency):
  campaign name, target/customer membership, the campaign's configured
  immutable `agent_id` (never `agent_version`), latest
  execution/attempt info, `effective_result_id`-derived Campaign
  Result, follow-up/`next_action_at`, and
  `latest_reconciled_interaction_id` for deep-linking into the
  interaction timeline instead of duplicating the interaction.

**Authorization — implemented, and this is a real product decision,
not left open**: Session 11.5's review flagged "campaigns don't appear
to have their own category-scoping concept... should a category-scoped
role also see a category-scoped slice of campaign history?" as an open
question. This session answers and implements it: `handleCampaigns`
(`api/customers/[id]/index.ts`) resolves the SAME `authorizedAgentIds`
already computed for interactions (`resolveAccessForRequest`), then
filters the customer's campaign rows to those whose
`campaignAgentId` is in that authorized set — reusing the EXACT
precedent already established for `retryTarget`/`scheduleFollowup`
(`20261003000000_campaigns_authorization_support.sql`'s own comment:
*"campaign.agent_id plays the same role agent_id already plays for
calls/chats"*). All-access roles see everything; a category-scoped
role sees only campaign rows whose campaign is configured against an
agent in their authorized categories. This is a deliberate design
choice this session made (not something Call Centre or the schema
dictates) — flagged below as worth explicit product sign-off, since
it's a new authorization surface, not a verified-safe pre-existing one
the way interaction authorization was in Session 11.5.

**Known simplification, documented rather than engineered around**:
authorization filtering happens in TypeScript after an unpaginated
fetch, not as a SQL-side filter or with page-accurate counts. Given a
customer's campaign-target volume is expected to stay in the single
digits to low tens, this is judged acceptable; flagged so it isn't
mistaken for the same pagination-correctness discipline
`listAuthorizedInteractions` provides.

---

## C. Campaign CSV identity-resolution correction (implemented + regression-tested)

**What was broken** (confirmed exactly as Session 11.5 review §11
described): `call_center_campaign_import_targets` (SQL, bulk) matched
each CSV row by phone only, via `call_center_find_contact_point`. It
never consulted `customer_external_identities`/CIF and never called
`identityResolver.ts`. A CIF-known customer imported under a different
phone number would silently create a duplicate customer.

**What changed**: `supabaseCampaignRepository.importTargets` no longer
calls the bulk SQL RPC. It now loops each row through the SAME
`resolveCustomerIdentity` (`src/server/customer360/identityResolver.ts`)
Voice/Chat ingestion already uses — CIF → phone → create, with merge
handling — then calls the new single-row
`call_center_campaign_insert_resolved_target` RPC once per resolved
row. `call_center_campaign_import_targets` is left in the schema,
unused by this path, rather than dropped (removing it risks breaking
another environment/reference; out of scope here).

- **CSV field plumbing**: `customer_reference` was already parsed by
  `parseTargetsCsv` (`useImportTargets.ts`) but only stuffed into
  `sourceAttributes.customerReference` — inert metadata, never used
  for identity. It is now ALSO promoted to a first-class
  `ImportTargetRow.customerReference`/`NewTargetRow.customerReference`
  field, flowing through `api/campaigns.ts`'s existing passthrough to
  `repo.importTargets`, and consumed as `signal.externalCustomerId` —
  the same field name/role Voice/Chat already use. (Kept in
  `sourceAttributes` too, for backward-compatible display/audit — not
  removed.)
- **`ResolvedIdentity` gained one additive field**: `created: boolean`
  (`identityResolver.ts`), set `true` only on the two brand-new-customer
  branches, `false` everywhere else — needed so `importTargets` can
  report accurate `customersCreated`/`customersMatched` counts without
  re-deriving them. Backward-compatible: the two existing callers
  (`reconcileJob.ts`, `backfillJob.ts`) never read this field, so
  nothing about their behavior changes.
- **Honest failure handling**: a row is now genuinely skipped
  (`rowsSkipped`) only if it has no phone at all, or if identity
  resolution somehow yields no usable contact point (the not-null
  `campaign_targets.contact_point_id` FK requires one) — never silently
  dropped without being counted.

**Regression tests** (`scripts/test-campaign-identity-resolver.ts`,
run via `npx tsx scripts/test-campaign-identity-resolver.ts` — this
repo has no test runner configured at all, confirmed via
`package.json`, so this is a standalone script exercising the resolver
against a fully in-memory fake `CustomerRepository`; zero network/DB
calls, zero live side effects):

```
PASS: genuinely new customer: resolver returns a result
PASS: genuinely new customer: created=true
PASS: genuinely new customer: exactly one customer created
PASS: existing phone (seed): first resolution creates the customer
PASS: existing phone: second import row resolves
PASS: existing phone: second row is NOT reported as created (matched instead)
PASS: existing phone: second row resolves to the SAME customer as the first
PASS: existing phone: still exactly one customer (no duplicate)
PASS: existing phone: still exactly one contact point for the normalized number
PASS: existing CIF (seed): initial row creates the customer with CIF attached
PASS: existing CIF with changed phone: resolves
PASS: existing CIF with changed phone: resolves to the EXISTING CIF customer, not a new one
PASS: existing CIF with changed phone: not reported as created
PASS: existing CIF with changed phone: still exactly one customer (no duplicate)
PASS: conflict setup: two distinct customers exist
PASS: conflict setup: exactly two customers before the conflicting row
PASS: identity conflict: resolver reports a merge occurred
PASS: identity conflict: exactly one customer survives (loser deleted)
PASS: identity conflict: exactly one merge was recorded

ALL PASSED
```

Covers all 4 required cases: existing CIF with a changed phone (resolves
to the existing customer, no duplicate); existing phone, no CIF
(resolves as today); genuinely new customer (creates); identity
conflict — CIF and phone separately known to two different existing
customers — triggers the resolver's own documented merge behavior
(survivor/loser, deterministic tie-break), not a new conflict rule
invented for this session.

Also smoke-tested live against the real database (`call_center_campaign_insert_resolved_target`
called once against an existing campaign/customer/contact-point, then
deleted — no residual test data left; `campaign_targets` count
confirmed back to its pre-test value of 3).

---

## D. Customer Activity / Diary (implemented)

**New table**: `call_center.customer_activities` (migration below).
Matches the design doc's §9.1 proposal field-for-field with one
documented deviation:

| §9.1 field | Implemented | Deviation |
|---|---|---|
| `activity_id` | `id uuid` | name only |
| `customer_id` | `customer_id uuid not null references customers` | — |
| `activity_type` | `activity_type text check (...)` | enum via CHECK constraint, not a Postgres enum type — consistent with the rest of this schema's `text`-with-CHECK convention (e.g. `campaign_targets.status`) |
| `title`/`body` | `title text` (nullable) / `body text not null` | `body` required (a title-less note/instruction is still meaningful; a body-less one isn't) |
| `status` | `status text check (...)`, default `'open'` (`'active'` for note/instruction) | added `'inactive'` beyond the doc's `active/open/completed/cancelled` list — needed so an Instruction can be turned off without deleting its history (design doc §6 explicitly wants Instructions to be "active/inactive") |
| `priority` | `priority text` | — |
| `scheduled_at`/`due_at`/`completed_at` | as proposed | — |
| `assigned_user_id`/`assigned_team_id` | `text`, **not uuid FK** | **flagged deviation — see below** |
| `campaign_id`/`campaign_target_id` | `uuid references campaigns/campaign_targets on delete set null` | — |
| `interaction_id` | `uuid references customer_interactions on delete set null` | — |
| `created_by`/`updated_by` | `text` | **same flagged deviation** |
| `effective_from`/`effective_until` | as proposed | — |

**Flagged deviation (not silently upgraded to a fake FK)**: this app
has NO users/teams table at all — confirmed, no `create table ...
users` anywhere in `call_center` or elsewhere in the migrations.
`created_by`/`updated_by`/`assigned_user_id`/`assigned_team_id` are
plain client-supplied strings, the same honesty class as
`campaigns.created_by` (Session 5) and `role`
(`api/_customer360.ts`'s documented §0.1 "advisory signal, not a
security boundary" limitation). A real user/team model is a
prerequisite for enforceable assignment-based authorization or
audit-grade `created_by` — this is a genuine blocker for anything
beyond advisory display, not a code gap.

**API** (`api/customers/{id}/index.ts`, no new Vercel function —
extends the existing `?action=` dispatcher, function count stays 11):

- `GET /api/customers/{id}?action=activities[&activeInstructionsOnly=true]`
  — full chronological feed, or exactly the Active Instructions slice
  the design doc's Customer Detail wireframe (§4.2) and future
  Initiate Call (§7.2) need.
- `POST /api/customers/{id}?action=activities` — create one activity;
  requires `activityType` (one of note/instruction/task/reminder/
  appointment) and `body`; everything else optional.

**Domain layer**: `src/server/customer360/activityRepository.ts`
(types + `ActivityRepository` interface, mirrors `customerRepository.ts`/
`campaignRepository.ts`'s interface-vs-adapter split) +
`supabaseActivityRepository.ts` (adapter, three RPCs: `call_center_
activity_create`/`_list_for_customer`/`_update_status`).

**Instructions never reach an LLM** — confirmed by construction: this
capability has no code path that reads an activity and forwards it
anywhere near `POST /call`'s `agent_inputs`, a prompt, or any LLM call.
It is a pure read/write CRUD surface; nothing in this session wires it
into call initiation (Initiate Call is Session 11.6A, out of scope).

**No calendar built**: no calendar table, no calendar UI. `scheduled_at`/
`due_at` on the activity row are the only time-based fields — exactly
what a future Agenda/My Work view would read.

Smoke-tested live: created an `instruction` (defaulted correctly to
`status='active'`), confirmed it appears under
`activeInstructionsOnly=true`, transitioned it to `'inactive'` via
`call_center_activity_update_status`, then deleted it — `customer_activities`
confirmed back to 0 rows, no residual test data.

---

## Authorization implications (B + D)

- **B (Campaign History)**: now genuinely authorization-filtered by
  the campaign's configured agent, reusing the same
  `authorizedAgentIds` mechanism as interactions — closes the exact gap
  Session 11.5 flagged as an open question. This is a new
  authorization surface this session designed and implemented, not a
  pre-verified-safe one; recommend explicit product sign-off that
  "campaign visibility = campaign's own agent's category" is the right
  rule before this ships in a UI (an alternative rule — e.g. campaign
  visibility should be a separate, coarser permission entirely — was
  explicitly named as a live option in the Session 11.5 review and NOT
  ruled out here).
- **D (Activities)**: **NOT authorization-filtered by category/role at
  all** in this session — `handleListActivities`/`handleCreateActivity`
  only check that the customer exists. This is an explicit, flagged gap
  (see Remaining decisions below), not an oversight: the design doc
  says "define activity visibility/edit rights... fail-closed where
  scope is unresolved" as a requirement, and with no real user/team
  model to hang read/write rules on, any authorization scheme here
  would be invented rather than derived from the existing architecture
  — which the session's own instructions said to avoid guessing at.
- Both B and D correctly avoid depending on any enhanced/unavailable
  Partner API field.

---

## Exact files changed

**New migration** (applied live to `dtbaczafdzgctkbqviod`/`call_center`
via `mcp__supabase__apply_migration`, plus one follow-up fix migration):
- `supabase/migrations/20261005000000_customer360_campaign_activities_and_import_fix.sql`
  — `customer_activities` table + indexes; `call_center_activity_create`/
  `_list_for_customer`/`_update_status`;
  `call_center_campaign_list_customer_targets`;
  `call_center_campaign_insert_resolved_target`.
  (A live follow-up `alter`/`create or replace` was applied directly via
  MCP to add the missing `customers` join for `customer_display_name`
  on `call_center_campaign_list_customer_targets` — folded into this
  same migration file so the repo's migration history stays a single,
  accurate source of truth; no separate migration file for that fix.)

**New source files**:
- `src/server/customer360/activityRepository.ts` — types + interface
- `src/server/customer360/supabaseActivityRepository.ts` — adapter
- `scripts/test-campaign-identity-resolver.ts` — regression tests

**Modified source files**:
- `src/server/customer360/identityResolver.ts` — `ResolvedIdentity.created` (additive)
- `src/server/campaigns/types.ts` — `NewTargetRow.customerReference`, `CustomerCampaignTargetRow`
- `src/server/campaigns/campaignRepository.ts` — `listCustomerTargets` interface method
- `src/server/campaigns/supabaseCampaignRepository.ts` — corrected `importTargets`; new `listCustomerTargets`; `CustomerTargetRow`/`mapCustomerTargetRow`
- `src/types/campaign.ts` — `ImportTargetRow.customerReference`
- `src/hooks/campaigns/useImportTargets.ts` — CSV parser promotes `customer_reference` to a first-class field
- `api/customers/[id]/index.ts` — `?action=campaigns` (GET), `?action=activities` (GET/POST)

**Not changed**: any Call Centre file; any enhanced/unavailable Partner
API call; `api/campaigns.ts`'s request/response contract (still passes
`rows` straight through — client-side type change only); any existing
screen/component; `CustomerDetail.tsx`/`Customers.tsx` (11.5B's job).

---

## Build / test / lint / function count

- `npx tsc --noEmit` — clean, zero errors.
- `npm run build` — succeeds (`vite build`, 3777 modules, no new warnings beyond the pre-existing chunk-size notice).
- `npm run lint` — **117 errors / 36 warnings**, identical to the documented baseline; zero new problems in any file this session touched.
- `npx tsx scripts/test-campaign-identity-resolver.ts` — 19/19 assertions pass (see §C).
- Vercel function count: **still 11** (`find api -maxdepth 3 -name "*.ts" ! -name "_*"` unchanged) — both new endpoints extend the existing `api/customers/[id]/index.ts` dispatcher, no new route file.
- Live Supabase smoke tests (all cleaned up afterward, verified back to pre-test row counts): `call_center_campaign_list_customer_targets` against a real customer with 3 existing targets; `call_center_activity_create`/`_list_for_customer`/`_update_status` round trip; `call_center_campaign_insert_resolved_target` round trip.

**Not deployed** — no `vercel --prod`, per this session's explicit instruction. A local git commit was made (see below); pushing/deploying is left to the user.

---

## Explicit future Call Centre integration points (named, not implemented)

- `GET /agents` Agent Contract metadata (`expected_input_fields`/
  `expected_outcomes`/`output_fields`) — `CallAgentContract` already
  models this shape with `contractSource: 'legacy'`/
  `contractCompleteness: 'partial'` honesty flags (pre-existing, Session
  9.1); untouched this session.
- `POST /call` `agent_inputs` — untouched; still only used via the
  existing `buildTriggerCallPayload`/input-mapping path.
- `/call-data` `actual_outcome_code`/structured outputs — would become
  a genuinely distinct "Call Centre Actual Outcome" input to
  `deriveCampaignResult`, separate from VoiceForce's own rule-derived
  Campaign Result (see §A). Not implemented; `structuredOutputs` stays
  `null` exactly as it already did before this session.

None of these were called, mocked, or given placeholder UI.

---

## Remaining decisions / blockers before Session 11.5B

1. **`effective_result_id`'s "latest reconciled attempt always wins,
   unconditionally" rule (§A)** — confirmed as the actual current
   behavior, not previously documented this explicitly. Before Customer
   Detail's Campaign History section presents "the" Campaign Result as
   a single confident value, product should confirm this is the
   intended policy (vs., say, "best result wins" or "first successful
   result wins"). Not a bug — a real semantic choice worth a conscious
   sign-off.
2. **Campaign-history authorization rule (§B)** — implemented as
   "campaign visibility = the campaign's configured agent's category,"
   reusing the `retryTarget` precedent. This is this session's design
   decision, not a pre-existing verified-safe rule; recommend explicit
   product confirmation before 11.5B ships a UI that depends on it,
   especially since (per Session 11.5) `role_customer360_categories` is
   still empty in this environment, so this path has zero real-world
   exercise yet.
3. **Activity authorization is unimplemented, not just simplified
   (§Authorization implications)** — every activity read/write is
   currently unscoped by role/category. This blocks exposing Activities
   in Customer Detail to anything other than an all-access role until a
   real decision (and likely a real user/team model) exists. Flagged
   per this session's explicit instruction not to guess at this.
4. **No real user/team model exists** — `created_by`/`assigned_user_id`/
   `assigned_team_id` are advisory strings only (§D). A prerequisite for
   any future enforceable "my tasks"/Agenda/assignment feature, and
   for treating `created_by` as genuine audit provenance rather than a
   claimed label.
5. **Minor correction to the Session 11.5 review**: that review
   classified `customers.display_name` as "class B — nothing currently
   writes it." Live inspection this session found existing production
   campaign-created customers (via the OLD phone-only import path) DO
   have a `display_name` populated (e.g. "Kwame Mensah") — the bulk
   import RPC passes the CSV `name` column through to
   `call_center_create_customer_with_contact_point`'s `p_display_name`.
   Voice/Chat ingestion still never sets it. Worth a one-line
   correction to `SCREEN_REVIEW_05_CUSTOMER_360.md` §7 if that document
   is revisited; not acted on further here (out of this session's
   scope).
