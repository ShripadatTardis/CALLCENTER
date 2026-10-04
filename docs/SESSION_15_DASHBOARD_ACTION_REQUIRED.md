# Session 15 — Dashboard Operational Home + Action Required Workflow

## Current-state findings (before implementation)

Three parallel investigation passes established the real starting point before any code changed:

- **Dashboard IA was already ~80% correct.** Performance Ratios was already a full-width section using the exact 5 implemented ratio IDs (`fcr`, `escalation_rate`, `resolution_rate`, `successful_resolution_time`, `authentication_success_rate`), already honest about "no eligible population" (shows the real `unavailableReason`, never fabricates 0%), already click-throughs into Ratio Explorer via the existing `detailOrigin.ts`/`dashboardNavigation.ts` provenance mechanism. What was actually wrong: section order (Live Ops → Needs Attention → Performance Ratios → [Recent Interactions | Agent Load], unequal `3fr_2fr` split, Recent Interactions on the left); "Agent Load" implied a utilization/capacity measurement the data never provided; "Needs Attention" was entirely client-side and unpersisted.
- **Vercel is at exactly the 12-serverless-function Hobby-plan ceiling** (confirmed by file listing — `admin.ts`, `agents/index.ts`, `analytics/metrics.ts`, `calls/data.ts`, `calls/session/[id].ts`, `calls/trigger.ts`, `campaigns.ts`, `chat/index.ts`, `chat/logs.ts`, `customers/admin.ts`, `customers/index.ts`, `customers/[id]/index.ts`). Action Required's API surface had to be a new `?resource=actions` branch inside `api/admin.ts` — no new route file.
- **No existing entity had the right shape for an assignable work item.** The closest prior art, `call_center.customer_activities` (customer-anchored notes/tasks from Session 11.5A), stores `assigned_user_id` as plain `text`, not a FK, and its own migration explicitly flags this as "a blocker for real assignment-based authorization." A new, dedicated table was the right call.
- **Only one genuine, currently-populated signal exists for "why does this need attention."** `actual_outcome_code`, `actual_outcome_name`, `structured_outputs` are confirmed always-null on every real call record (a 689-record scan documented in `src/types/api/calls.ts`). `escalation_trigger` is real but frequently null. Chat has no escalation/sentiment concept at all. Stale-active calls (`status==='active'` for 4h+) are a pre-existing Dashboard indicator with no confirmed disposition signal — could be a genuinely stuck call, or upstream data-quality/test residue.

## Action Required eligibility rules (v1 scope)

An Action Required item is created only for a **voice call with `outcome === 'escalated'`**, within a 30-day rolling bootstrap window (see below). Nothing else creates an item in v1:

- Stale-active calls remain a **Dashboard-only visual indicator**, unchanged from before this session — not promoted into a persisted work item. An upstream "still active" condition may be a genuine stuck call or upstream data-quality/test residue; there is no way to distinguish the two from available fields, so converting every historical stale-active record into a human work item would have flooded the queue with noise of unknown genuineness. This is the deliberate historical-bootstrap decision the brief asked for.
- Chat has no escalation/sentiment concept today — chat sessions never generate Action Required items in v1.
- No reason is ever inferred from transcript text, sentiment, or any heuristic. The only inputs are `outcome` and `escalation_trigger`, both real backend fields.

## Reason semantics

- `reasonCode = 'escalation_with_reason'`, `reasonText = <the real escalation_trigger>` when the source provided one.
- `reasonCode = 'escalation_reason_unavailable'`, `reasonText = null` when it did not. The UI renders this as **"Reason unavailable from source"** — never the previous circular "Escalated — no trigger reason recorded by source system" (which used the signal itself as the explanation). Signal (an escalation occurred) and reason (why) are different concepts, rendered separately.

## Schema

New table `call_center.action_items` (`call_center` schema, deny-all RLS — confirmed via `get_advisors`: "RLS enabled, no policies" alongside every other table in this schema):

```
id, source_interaction_type ('call'), source_interaction_id, signal_type ('escalation'),
customer_id (nullable FK, unpopulated in v1), agent_id (nullable text),
campaign_id (nullable FK, unpopulated in v1), reason_code, reason_text,
status ('open' | 'in_progress' | 'resolved'), assigned_user_id (real FK to user_profiles,
unlike customer_activities' plain text), resolution_code, resolution_note,
resolved_by, resolved_at, created_at, updated_at
unique (source_interaction_type, source_interaction_id, signal_type)
```

`customer_id`/`campaign_id` are genuine snapshot columns, not fabricated — `CallDataEntryDto` has no reliable `customer_id`, and only a `campaign_name` string (no stable `campaign_id`), so both are left `null` in v1 rather than resolved unreliably. This means **only Agent Scope is enforced** in v1's scope checks; Customer Category Scope has nothing to filter on until a real call→customer link exists. This is documented, not hidden, and the schema already carries the column for when that link exists.

## Idempotency strategy

Unique constraint on `(source_interaction_type, source_interaction_id, signal_type)`. The generation RPC (`call_center_action_items_generate`) does `insert ... on conflict ... do nothing` per candidate — reprocessing the same window never duplicates a row, and never resets an existing item's status/assignment/resolution (verified live, see below). One summary audit event per run (`action_item.generation_run`, `{created, skipped}`), not one per item, to avoid audit-log spam from a mostly-unchanged batch.

**Bootstrap window:** 30 days, computed from "now" at each run (`actionItemBootstrapWindow()` in `api/admin.ts`) — not a fixed historical cutoff that would silently narrow over time.

## Lifecycle

**Open → In Progress → Resolved only.** No `Dismissed` in v1 — a missing `escalation_trigger` does not prove an item is non-actionable, only that the source withheld the reason; a Dismiss escape hatch would be speculative, not evidence-based (explicit user refinement during planning). No reopening. If real usage later demonstrates a genuine need for a dismiss/non-actionable path, that is additive future work, not something this session should have speculatively built.

## Permissions

Three new permission keys, same vocabulary convention as every existing one (`calls.initiate`, `customers.activity.create`, …):

| Key | Meaning |
|---|---|
| `actions.view` | View the Action Required queue, within Business Data Scope |
| `actions.assign` | Assign/reassign ANY in-scope item, regardless of current ownership |
| `actions.resolve` | Take ownership of unassigned items; progress/resolve items assigned to self |

Initial grants (deliberate, documented, adjustable later via Role Management):

| Role | actions.view | actions.assign | actions.resolve |
|---|---|---|---|
| administrator | ✅ | ✅ | ✅ |
| supervisor | ✅ | ✅ | ✅ |
| operator | ✅ | ❌ | ✅ |
| analyst / qa_reviewer / read_only | ❌ | ❌ | ❌ |

## Authorization model: Functional Permission + Business Data Scope + Work Ownership

This session adds a third dimension on top of the 14.1/14.3 foundation, per explicit user refinement during planning — never a role-name check:

- **Functional Permission** (14.1): does the actor hold `actions.view` / `actions.resolve` / `actions.assign` at all.
- **Business Data Scope** (14.3): is this item's `agent_id` within the actor's Agent Scope (`toAgentAccess` + `isAgentIdInScope`, the same pure function 14.3 already proved exhaustively).
- **Work Ownership** (new, this session): `actions.assign` is "manage any eligible item" — holding it means the actor may assign/reassign to anyone and progress/resolve any in-scope item regardless of current assignee. An actor holding `actions.resolve` but not `actions.assign` (i.e. Operator) may take ownership of an **unassigned** item, and progress/resolve **only an item currently assigned to themselves**.

The ownership gate is enforced **inside** the RPCs (`call_center_action_items_assign`/`_set_status`/`_resolve`), re-validated from a `p_actor_has_manage_any` boolean the API layer computes from the caller's already-resolved permission set — never trusted blindly from the client, and never a role-name string comparison anywhere in the SQL.

## Assignment eligibility

`call_center_action_items_eligible_assignees(id)` returns only **active** users whose role-union Agent Scope covers the item's `agent_id` — the same `role_agent_scope`/`role_agent_scope_items` tables 14.3 already created, joined for the first time against a write/assignment decision rather than a read filter. The assign RPC re-runs this exact same eligibility check inside its own transaction before writing, so a stale/manipulated client-side picker list can never assign someone genuinely out of scope (verified live below). An inactive or nonexistent user id is rejected outright.

## Scope behavior / direct-ID bypass

`call_center_action_items_get` applies the identical scope predicate as `call_center_action_items_list` — closing the direct-ID-bypass class of bug from day one (Session 14.3 had to retrofit this onto 3 pre-existing routes; here it never existed). An out-of-scope caller gets `404`-equivalent (`null`/empty array), not a 403 — matching the established convention of not revealing a restricted resource's existence.

## Audit events

`action_item.generation_run` (system, one per batch run), `action_item.assigned` / `action_item.reassigned`, `action_item.status_changed`, `action_item.resolved` — all via the existing `call_center.audit_events_insert_helper`, visible in the existing Audit Trail UI (its resource-type filter dropdown now includes "Action Item"). No secrets/tokens/transcript content ever appears in audit metadata.

## Dashboard IA (before → after)

| | Before | After |
|---|---|---|
| Row 1 | Live Operations (full width) | unchanged |
| Row 2 | Needs Attention (full width) | **Agent Activity** (left 50%) / Recent Interactions (right 50%) |
| Row 3 | Performance Ratios (full width) | unchanged, now directly below Row 2 |
| Row 4 | [Recent Interactions 3fr \| Agent Load 2fr] | **Action Required** (left ~50%, right intentionally unused) |

"Agent Load" → "Agent Activity": the panel never measured utilization/occupancy/capacity, only agent identity + current active-call count — the old label implied a measurement that doesn't exist. No underlying data changed.

## Navigation provenance

`src/lib/detailOrigin.ts`'s `DetailOrigin` union gained `'action-required'` → `/action-required`, purely additive to the existing mechanism (`dashboard`, `ai-agents`, `live-view`, `customers`, `outbound-campaigns`, `chat-logs`). Dashboard's Action Required card passes the existing `DASHBOARD_ORIGIN_STATE` when navigating to the full queue; the full queue page itself resolves its own origin the same way every other detail page does, defaulting to `'action-required'` so a bookmark/direct URL still renders a sane "Back" target. Direct URLs are unaffected by origin — authorization is unchanged regardless of how a page was reached (Session 14.3's "Dashboard-origin navigation never grants authorization" principle, unchanged).

## Cron scheduling constraint (verified, not assumed)

The Vercel team for this project is confirmed **Hobby** plan (`vercel teams ls`). All 3 pre-existing cron entries in `vercel.json` already run daily. Rather than assume a faster cadence was available, a 4th daily cron (`15 4 * * *`, `/api/admin?resource=actions&action=generate`) was added, matching the existing precedent. `CRON_SECRET` was confirmed already configured in the Vercel production environment (`vercel env ls production`), so no additional setup was needed. Generation is also reachable via an authenticated manual `POST` (`actions.view` is sufficient) for on-demand/development verification — the idempotent `ON CONFLICT DO NOTHING` design means the cadence choice never affects correctness, only latency until a new escalation surfaces in the queue.

## Tests

`.tooling/scripts/action-items-verify.mjs` (11 assertions, esbuild-bundled real compiled `api/admin.ts`) covers the pure, synchronous JS this session added: `mapActionItemError`'s HTTP-status mapping for every RPC error code (including substring matching against a real wrapped Postgres error message), and `actionItemBootstrapWindow`'s date-math (exact day spans, "today" as the window end, honoring a non-default window size). Wired into `npm run verify:full`.

The actual ownership/idempotency/scope-enforcement logic lives in the Postgres RPCs themselves and cannot be exercised by an esbuild-bundled unit test without a live database — proven instead by direct SQL verification against the real project (see below), the same discipline 14.1–14.3 used for their own RPC-side logic.

## SQL-level deterministic verification (live, against the real project)

Run directly via the Supabase MCP against `dtbaczafdzgctkbqviod`, using the two real users from Sessions 14.2/14.3 (`shripad@tardis.solutions` / Administrator, `shripad@miles.in` / Operator) and a disposable test agent id (`sql-verify-agent`), all cleaned up afterward:

1. **Idempotent generation**: `call_center_action_items_generate` with the same candidate run twice → `{created:1,skipped:0}` then `{created:0,skipped:1}`; row count stayed at 1.
2. **Honest reason fallback**: a candidate with no `reasonText` produced `reason_code='escalation_reason_unavailable'`, `reason_text=null` — the other produced `'escalation_with_reason'` with the real text.
3. **Direct-ID bypass closed**: `call_center_action_items_get` with scope restricted to an unrelated agent returned `null`; `call_center_action_items_list` under the same restriction returned `[]`; both returned the real row once scoped correctly.
4. **Take ownership**: Operator (no `actions.assign`) successfully self-assigned an unassigned item.
5. **Ownership denial**: a different non-manage-any, non-owner actor attempting `setStatus` on that item was rejected with `ownership_required`.
6. **Owner can progress their own item**: the real owner (Operator) moved it to `in_progress` successfully.
7. **manage_any can act on anyone's item**: Administrator (`actions.assign`-equivalent) resolved the Operator-owned item successfully.
8. **Resolved excluded from Open, retained in history**: confirmed via `call_center_action_items_list('open', …)` (empty of the resolved item) vs `('resolved', …)` (contains it).
9. **Assignment to a nonexistent user rejected**: `assignee_inactive_or_not_found`.
10. **Assignment to a genuinely out-of-scope user rejected, even requested by a manage_any actor**: Operator's Agent Scope was temporarily narrowed to an unrelated agent; they correctly dropped out of `eligible_assignees`, and a direct `assign` call by the Administrator targeting them was rejected with `assignee_out_of_scope` — proving the RPC re-validates eligibility itself rather than trusting the caller. Operator's scope was restored to the safe default immediately after.

All test `action_items` rows were deleted after verification; the `role.agent_scope_changed` and `action_item.*` audit events from this test remain in the Audit Trail as real evidence, same as 14.3's own live scope-narrowing test.

## Known limitations (explicit, not hidden)

1. **Customer Category Scope is not yet enforceable on Action Required** — `customer_id` is genuinely unpopulated (no reliable call→customer link exists today). Only Agent Scope is checked. The column and the check structure both already exist for when that link lands.
2. **Chat never generates Action Required items** — no escalation/sentiment concept exists on the Chat contract today.
3. **Stale-active calls are not Action Required items** — intentionally, per the historical-bootstrap decision above. Revisit only if a genuine disposition signal (not just elapsed time) becomes available.
4. The pre-existing Analytics/Ratio Explorer scope-awareness gap (documented in Session 14.3) is unaffected by this session — Action Required's own queries are scope-aware from day one; Analytics/Ratios are not, unchanged.

## Intentionally deferred (non-goals, per brief §26)

Workforce management, queue-routing/PBX, CRM, generic ticketing/helpdesk, SLA engine, AI-generated reason inference, workforce occupancy/utilization, team/org hierarchy, notification engine, escalation-rule designer, broad Analytics redesign, Orchestrator implementation — none of these were built, and none should be inferred from anything in this session.

## Regression

`npm run verify:full` (typecheck, lint, build, all deterministic suites including the 11 new assertions) green throughout. Vercel function count unaffected (still exactly 12 — the only `api/` change was to the existing `admin.ts`, no new route file).
