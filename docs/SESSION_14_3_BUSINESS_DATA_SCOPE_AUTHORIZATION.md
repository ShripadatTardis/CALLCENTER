# Session 14.3 — Business Data Scope Authorization

## Architecture

Call Centre authorization now has two independent, server-enforced dimensions:

```
Functional Permission (Session 14.1)        Business Data Scope (this session)
  WHAT the user may do                         WHICH data the user may see
  dashboard.view, calls.initiate,               Agent Scope: which AI agents' calls/
  campaigns.create, users.manage, ...           chats/campaigns are visible/operable
                                                 Customer Category Scope: which
                                                 customer categories are visible
```

A route that performs a real mutation or reaches a specific resource now checks **both**: `requirePermission` (can this user do this kind of thing at all) **and** a data-scope check (is this specific resource's agent/category within what this user may see). Frontend menu/row filtering remains UX only — every check listed below is also enforced server-side, independent of what the UI shows.

Supabase Auth remains the identity provider only. Supabase/database permissions (RLS) remain infrastructure protection — deny-all, service-role bypass — never the business authorization model. The Call Centre application owns Identity → Role → Functional Permissions + Business Data Scope end to end.

## Discovery findings (before implementation)

- The pre-existing `customer360_categories` / `customer360_category_agents` / `role_customer360_categories` / `role_customer360_access` tables were the only scope mechanism. `role_customer360_categories` (the *partial*-restriction table) had **zero rows, ever**, in this app's history — only `administrator` and the legacy `call_center_head` had any row, both `all_categories=true`. No role has ever been restricted to a category subset.
- The 3 real "categories" (`EMI Reminder`, `Forex Transaction`, `Inbound Banking Assistant`) are each mapped 1:1 to exactly one real agent via a seeding function that creates one category per agent — confirmed live. The schema supports a category spanning multiple agents; nothing has ever used that.
- Two confirmed **direct-ID bypasses** existed independent of anything RBAC-related:
  - `api/calls/session/[id].ts` had **zero authorization code of any kind** — any known session id could be fetched by anyone.
  - Customer360 identity (`handleGetView`) and activity create/update were gated only by "does this customer id exist," never by category/agent scope.
- Campaigns and Chat Logs already correctly authorized both list *and* individual-resource access via the existing `authorizedAgentIds`/`isAgentAuthorized` mechanism — these needed only a resolver swap, not new logic.
- Analytics and Ratio Explorer's query layer (`ratioService.ts`, the default `/api/v1/analytics/metrics` proxy) has **no concept of scope at all** — confirmed via code search, zero references to `AuthorizedAccess` anywhere in `src/server/analytics/*`.

## Data model

New tables (`call_center` schema, deny-all RLS, `security definer` RPCs in `public` only — same convention as every other table in this project):

- `role_customer_category_scope` (`role_code` pk, `all_categories`)
- `role_customer_category_scope_items` (`role_code`, `category_id`)
- `role_agent_scope` (`role_code` pk, `all_agents`)
- `role_agent_scope_items` (`role_code`, `agent_id` — stable text id, never a category reference)

Agent Scope and Customer Category Scope are configured and stored completely independently. Customer visibility is *computed* from Customer Category Scope via the existing `customer360_category_agents` join (the only real linkage a customer has to a category) — that computation is not a redefinition of Agent Scope.

Effective scope = union across a user's assigned roles (`all_agents`/`all_categories` on any assigned role wins), resolved in one query inside the existing `call_center_users_resolve_identity` RPC (already called once per authenticated request) — no extra round trip.

**Migration default:** every existing role was seeded `all_agents=true` / `all_categories=true`. This is explicitly not a permanent policy — it's the only safe, non-breaking starting point, chosen because it matches the sole real precedent that ever existed (`administrator`/`call_center_head`) and because narrowing any role is now a deliberate, auditable Administrator action via Role Management, not an accidental side effect of legacy rows.

**Fail-closed behavior:** a role with no row in these tables at all (e.g. a brand-new role created outside the seeded set) resolves to `all_agents=false`/`all_categories=false` with empty item lists — sees nothing, not everything.

## Server enforcement

`api/_auth.ts` gained:
- `DataScope` / the extended `AuthenticatedCallCenterUser.dataScope` — returned by the single identity-resolution call every authenticated request already makes.
- `toAgentAccess(user)` / `toCustomerAccess(user)` — two `ScopedAccess` views of the same user, structurally identical to the existing `AuthorizedAccess` type every filtering call site already consumed.
- `resolveAccessForAuthenticatedUser(req, scope)` — a **drop-in replacement** for the advisory `x-user-role`-based `resolveAccessForRequest`. Unauthenticated resolves to zero scope (fails closed) rather than throwing.
- `isAgentIdInScope(access, agentId)` — the pure per-resource check, unit-tested exhaustively.

Swapped in at every real call site, **retiring** `x-user-role` from authorization decisions on these routes (not run in parallel):

| Route | Scope dimension | Change |
|---|---|---|
| `api/customers/index.ts` (list) | Customer | Resolver swap |
| `api/customers/[id]/index.ts` (view, interactions, campaigns, activities list/create/update, refresh) | Customer | Resolver swap **+ new `isCustomerVisible` gate** closing the identity/activity bypass |
| `api/calls/data.ts` (list) | Agent | Resolver swap |
| `api/calls/session/[id].ts` (single session) | Agent | **New** — previously zero auth; now fails closed to unrestricted-only (see Known Limitations) |
| `api/chat/logs.ts` (list + detail) | Agent | Resolver swap (already had per-resource checks) |
| `api/campaigns.ts` (list, get, every target/lifecycle mutation) | Agent | Resolver swap (already had per-resource checks via `isAgentAuthorized`) |
| `api/agents/index.ts` (`?action=classification`) | Agent | Resolver swap |
| `api/calls/trigger.ts` (Initiate Call) | Agent | **New** — the submitted `agent_id` is checked against scope server-side; a functional-permission pass alone is no longer sufficient |

## Known limitations (explicit, not hidden)

1. **`api/calls/session/[id].ts` fails closed for restricted roles, not finely scoped.** The upstream Session Transcript API has no `agent_id` field in its documented response, and `session_id`/`call_id`/`call_sid` are not guaranteed to be the same literal value across the Voice Agent API's own endpoints (a pre-existing, separately documented inconsistency). Building a heuristic cross-reference risked false negatives/positives; failing closed (only an unrestricted caller may fetch a single session by id) was judged safer than a fragile guess. Only a caller with `allAgents`/`allCategories` can reach this route today — which is every real user currently provisioned. Needs a confirmed attribution path before any role with Call viewing but restricted Agent Scope narrows.
2. **Analytics and Ratio Explorer aggregates are not yet scope-aware.** Deliberately deferred — the query layer (`ratioService.ts`) has no concept of multi-agent filtering, and `AnalyticsMetricsResponseDto` is a strictly-typed contract real screens (Analytics.tsx, AgentDetail.tsx) depend on; a quick response-shape patch risked an untested contract break for zero current benefit, since every real user today has `allAgents=true`. `RoleDataScopeEditor.tsx` shows an explicit warning the moment an Administrator narrows any role's Agent Scope, so the gap is surfaced to the person taking the action rather than hidden. Closing this requires updating the DTO and its consumers together with real query-layer scoping — real future work, not a stopgap.
3. The pre-existing `x-user-role` advisory header mechanism (`role_customer360_access`/`role_customer360_categories`, `resolveAccessForRequest`) is untouched and still technically present for rollback safety — not dual-run, not read by any route this session touched, not extended to anything new.

## UI

- **Role Management** (`src/pages/RoleManagement.tsx`): each role card expands into a Data Scope editor (`RoleDataScopeEditor.tsx`) — Agent Access (All / Selected, real agent display names) and Customer Access (All / Selected, real category names), independently configurable, gated by `roles.manage` both client- and server-side. Narrowing Agent Access shows the Analytics/Ratios warning from limitation #2 above.
- **User Management** (`src/pages/UserManagement.tsx`): the expanded user panel now shows effective Data Scope (Agent Access / Customer Access summary) alongside roles and status.

## Audit

Every scope change is audited via `role.agent_scope_changed` / `role.customer_category_scope_changed`, capturing actor, affected role, and full before/after state — same `audit_events_insert_helper` pattern as every other audited RPC this project uses. No secrets/tokens are ever written to audit metadata (verified: a full-table scan for password/token/secret/authorization/bearer substrings across every audit row returns zero matches).

## Tests

`.tooling/scripts/business-data-scope-verify.mjs` — 9/9 assertions on the real compiled `isAgentIdInScope`/`toAgentAccess`/`toCustomerAccess` logic: unrestricted access always passes, restricted access correctly includes/excludes specific agent ids, both dimensions fail closed on an explicit empty scope, and — the key independence proof — a user with a restricted Agent Scope and an unrestricted Customer Category Scope resolves each dimension correctly and separately. Wired into `verify:full` alongside the full existing suite (52 total deterministic assertions across Sessions 14.1–14.3 at time of writing).

## Deployed E2E evidence

Using the real Administrator (`shripad@tardis.solutions`) and real Operator (`shripad@miles.in`) provisioned in Session 14.2:

- **Administrator** resolves `allAgents=true, allCategories=true`, all 25 permissions — confirmed via `call_center_users_resolve_identity` against the live database.
- **Operator**, with Agent Scope temporarily narrowed to `inbound-banking-default` only (via the same audited `call_center_roles_set_agent_scope` RPC the Role Management UI calls):
  - Resolved `dataScope.agentIds = ["inbound-banking-default"]`, `allAgents = false` — confirmed live.
  - **Functional permissions unchanged** across the scope change (8 permissions, `calls.initiate` still absent) — proves the two authorization dimensions are genuinely independent.
  - **List filtering confirmed live** by the Operator's own signed-in session: Call Logs showed only Inbound Banking Assistant calls; EMI Reminder and Forex Transaction calls were not visible.
  - **Direct-ID bypass confirmed closed, live**: navigating directly to an EMI Reminder campaign (a campaign outside the narrowed scope) returned "Not Found" rather than the campaign detail — proving server-side enforcement, not UI-only hiding.
  - Audit event for the scope change captured the correct real actor (Administrator), role (`operator`), and full before/after state.
  - Scope was restored to the safe default (`allAgents=true`) immediately after the test, itself audited.
- **Server-side enforcement confirmed via unauthenticated requests** (no token available, so no-auth is the strongest negative-path proof available without browser credentials): `GET /api/admin?resource=customerCategories` → 401; `GET /api/calls/session/<id>` → 404 (fails closed, no longer a raw proxy pass-through to the upstream Voice API).
- **"Out-of-scope Agent ID cannot be used through direct API submission" (Initiate Call)**: verified at the code level (the same `isAgentIdInScope` function proven exhaustively in the unit suite, applied identically to `api/calls/trigger.ts`'s submitted `agent_id` as to the already-live-proven Campaigns path) rather than a redundant live click-test — no current role combines `calls.initiate` with a restricted Agent Scope, so a live test would have required creating a throwaway test configuration for no additional evidentiary value beyond what the shared, already-proven mechanism provides.
- **No telephone call was placed and no campaign was launched** for any part of this verification.

## Regression

`npm run verify:full` (typecheck, lint, build, all 52 deterministic assertions) green throughout implementation. Vercel function count unaffected (still exactly 12 — all changes were to existing route files, no new ones added). Deployed build confirmed `Ready` (not `Error`) post-push.
