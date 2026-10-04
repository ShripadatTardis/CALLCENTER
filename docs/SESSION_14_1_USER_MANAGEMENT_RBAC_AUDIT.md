# Session 14.1 — User Management, RBAC & Audit Foundation

## Identity

**Discovered authentication architecture (before this session):** `src/contexts/AuthContext.tsx` was entirely client-side — `login()` matched `email` against a hardcoded 2-user array (`src/data/sampleUsers.ts`) and compared `password` to the literal string `'password123'`. Session persistence was `localStorage` only; zero cookie/JWT/server session existed anywhere. Every `api/*.ts` route's only "identity" signal was an `x-user-role` header the client could set to anything — documented in-code (`api/_customer360.ts`) as advisory only, never a security boundary.

**What replaced it:** real Supabase Auth (email/password) on the same project this app's `call_center` data already lives in (`dtbaczafdzgctkbqviod`, "AuditAI"). `src/lib/supabaseAuthClient.ts` is a dedicated client using that project's publishable/anon key, kept separate from the legacy `src/integrations/supabase/client.ts` (which stays pointed at the unrelated legacy WhatsApp/SMS project, untouched).

**Call Centre membership model:** `call_center.user_profiles` is the app's own identity, deliberately **not** a straight foreign key to `auth.users(id)` — the link is `(identity_provider, identity_subject)`, e.g. `('supabase_auth', '<auth.users.id>')`. This means a future swap to a different identity provider (corporate SSO, Entra, etc.) only requires adding a new `identity_provider` value and populating new rows — no redesign of roles, permissions, or any downstream code that references `user_profiles.id`.

**Bootstrap:** the first Administrator (`shripad@tardis.solutions`) was created as a real Supabase Auth account via the Supabase Dashboard (not the application), then linked to a new `user_profiles` row and assigned the `administrator` role via a one-time, un-committed SQL statement run through the Supabase MCP. No email, password, or auth UUID was ever written to any committed file. A subsequent password-recovery gap (the Dashboard's own "Send password recovery" quick-action uses the project's configured Site URL, not the app's `redirectTo` — unrelated to this app's own code) was found and fixed by building a real in-app Forgot Password → `/reset-password` flow; the user completed that flow from the deployed application's own UI and confirmed a successful sign-in as **Shripad — Administrator**.

## RBAC

**Schema** (migration `20261004041613_user_management_rbac_audit_foundation.sql`, corrected by `20261004043948_user_management_rbac_audit_rpc_correction.sql`):
- `call_center.permissions` — `key` (primary key), `label`, `description`, `pillar`.
- `call_center.roles` — `code` (primary key), `label`, `description`.
- `call_center.role_permissions` — `(role_code, permission_key)` composite key.
- `call_center.user_profiles` — provider-neutral identity (see above).
- `call_center.user_roles` — `(user_id, role_code)` composite key, `assigned_by` for provenance. Supports multiple roles per user; effective permissions are the union.
- `call_center.audit_events` — the new cross-cutting security/RBAC audit log (distinct from the pre-existing, untouched `campaign_audit_events` domain history).

**Permission vocabulary (25 keys), derived strictly from real, already-implemented capabilities** confirmed during discovery — never speculative: `dashboard.view`, `live.view`, `calls.view`, `calls.recording.view`, `chat.view`, `customers.view`, `customers.activity.create`, `customers.activity.update`, `calls.initiate`, `campaigns.view`, `campaigns.create`, `campaigns.edit`, `campaigns.start`, `campaigns.pause`, `campaigns.resume`, `campaigns.stop`, `campaigns.targets.manage`, `agents.view`, `analytics.view`, `ratios.view`, `users.view`, `users.manage`, `roles.view`, `roles.manage`, `audit.view`.

**Role matrix** (seeded only after the permission vocabulary was finalized, each row justified by a real intended capability, never by name association):

| Role | Permission count | Notes |
|---|---|---|
| `administrator` | 25 (all) | Full access including User/Role Management and Audit Trail. |
| `supervisor` | 22 | All Observe + full Campaign lifecycle + Customer360 activities + `users.view`/`audit.view`. **Not** `users.manage`/`roles.view`/`roles.manage`. |
| `operator` | 9 | Observe + `calls.initiate` + Customer360 activities + `campaigns.view`. No campaign mutation, no recording access. |
| `analyst` | 8 | Observe (read-only) + `analytics.view`/`ratios.view`/`agents.view`. No mutations. |
| `qa_reviewer` | 5 | `dashboard.view`, `calls.view`, `calls.recording.view`, `chat.view`, `agents.view`. |
| `read_only` | 9 | Broad view-only across Observe/Campaigns/Agents/Measure. |

**Effective-permission calculation:** `public.call_center_users_resolve_identity(provider, subject)` (SQL, `security definer`) unions `role_permissions` across every role in `user_roles` for that user in one round trip, returning `{id, email, displayName, status, roles, permissions}`. Deterministically tested (multi-role union, fail-closed on unknown permission, inactive-user rejection) in `.tooling/scripts/rbac-authorization-verify.mjs`.

**Server enforcement:** `api/_auth.ts` exports `requirePermission(req, res, key)` — verifies the Supabase JWT via `supabase.auth.getUser()`, resolves the Call Centre identity via the RPC above, and returns 401 (no/invalid session or inactive profile) or 403 (valid session, missing permission) before any route handler runs. Wired into exactly the routes the session scoped: `api/calls/trigger.ts` (`calls.initiate`), `api/campaigns.ts`'s create/edit/lifecycle/target-mutation actions (centralized via an `ACTION_PERMISSIONS` map, not per-handler), and `api/customers/[id]/index.ts`'s activity create/update. Live-verified: every mutating route returns 401 with no/invalid bearer token; reads outside this scope are unaffected (still the pre-existing advisory filtering).

**Frontend enforcement:** `src/contexts/AuthContext.tsx`'s `hasPermission`/`can` drives `src/components/layout/Sidebar.tsx`'s nav-item filtering (unchanged mechanism, new permission vocabulary) and `src/components/auth/ProtectedRoute.tsx`'s new optional `permission` prop (route-level gating — direct URL access to a route is blocked even if the nav item is hidden, rendering an explicit "Not authorized" state rather than a redirect loop or blank page). This is UX only; the server gate above is authoritative.

**Legacy-compatibility seam, explicitly preserved and bounded:** the existing `x-user-role`-based Customer360/Campaign *read-filtering* (`resolveAccessForRequest`, `role_customer360_categories`, `role_customer360_access`) is untouched this session — still real server-side filtering, still explicitly documented as advisory/not-a-security-boundary, and not extended to any new route. `AuthContext` derives a single legacy-compat `role` string (`src/lib/legacyRole.ts`'s `deriveLegacyRole`, highest-priority assigned role wins) purely so the ~30 existing hooks that forward `user?.role` as that header keep working unchanged. A seed row was added to the pre-existing `role_customer360_access` table for `administrator` (`all_categories = true`, mirroring the existing `call_center_head` row) so a newly-provisioned real Administrator isn't locked out of Customer360 reads. **Documented follow-up (not done this session):** replace this client-claimed header with server-derived category/access context computed from the now-real authenticated user.

## Audit

**Schema:** see `call_center.audit_events` above — `actor_type` (`user`/`system`/`cron`), `actor_user_id` (nullable, null for system/cron), `action`, `resource_type`/`resource_id`, `result` (`success`/`denied`/`error`), `metadata` (jsonb, bounded — no secrets, no full transcripts).

**What's audited this session:** `call.initiated` (Initiate Call), `campaign.<action>` for every mutating campaign action (`create`, `start`, `pause`, `resume`, `stop`, `retryTarget`, `scheduleFollowup`, `createConfigurationVersion`, `updateDraftConfiguration`, `skipTarget`, `holdTarget`, `releaseHold`, `amendTarget`, `addTargets`, `importTargets`, `setInputMappings`), `customer.activity_created`/`customer.activity_status_changed`, `user.status_changed`, `role.assigned`/`role.removed`, `role.permissions_changed`. All with the real, JWT-verified `actor_user_id` — never a client-claimed string.

**Campaign audit relationship:** `campaign_audit_events` (the pre-existing domain-specific Campaign History log) is preserved exactly as-is and still the source for the Campaign History UI. Campaign lifecycle/target actions now **also** emit a corresponding `call_center.audit_events` row for the same action (option "both exist" from the session brief) — the two serve different purposes (domain history with rich structured fields vs. a uniform cross-cutting security log) and are not merged.

**Safety:** no passwords, API keys, tokens, or full transcript/recording content are ever written to `metadata` — every audit write's metadata is a small, explicit, hand-picked object (e.g. `{ role_code }`, `{ status }`, `{ activityType }`).

**Live-verified with genuine events:** toggling Role Management permissions for the `operator` and `analyst` roles produced real `role.permissions_changed` audit rows with the correct `actor_user_id` (the real Administrator's `user_profiles.id`), correct `resource_type`/`resource_id`, and `metadata.permission_keys` matching the exact resulting permission set — confirmed via direct database query, not just UI inspection.

## UI

- **User Management** (`src/pages/UserManagement.tsx`, rewritten) — real roster from the database (one real user as of this session), per-row expandable panel for status toggle and role assign/remove, both gated by `users.manage` client-side and server-side.
- **Role Management** (`src/pages/RoleManagement.tsx`, new) — role summary cards (label, user count, description) + a role × permission matrix grouped by product pillar, toggle cells gated by `roles.manage`.
- **Audit Trail** (`src/pages/AuditTrail.tsx`, new) — filterable (action text, resource type, result) table of real audit events.
- **Shell integration** — `src/components/layout/UserProfile.tsx` (already genuinely wired to `useAuth()`, not decorative) now shows the real display name and a human-readable role label (`getRoleDisplayName`); `Sidebar.tsx` gained Role Mgmt and Audit Trail nav entries under Govern, both permission-gated.
- **Sign-in** — `src/components/auth/LoginForm.tsx` simplified to real email/password (the old "Quick Demo Access" sample-user picker removed); new `src/components/auth/ForgotPasswordForm.tsx` and `src/pages/ResetPassword.tsx` complete the real password-recovery flow.

## Security boundaries

- **BFF:** `api/_auth.ts`'s `requirePermission` is the authoritative gate for every route it's wired into — confirmed via live `curl` tests returning 401 for every mutating route with no/invalid bearer token.
- **Supabase:** all `call_center` table access goes through `public.call_center_*` `security definer` functions using the server-only service-role key (`CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY`), consistent with every other domain repository in this app. The browser's only direct Supabase client (`src/integrations/supabase/client.ts`) points at a completely unrelated legacy project and has never had network access to `call_center`.
- **RLS:** a pre-existing, unrelated gap was found and fixed during this session — 7 `call_center` tables (`customer_external_identities`, `customer_merge_log`, `customer_activities`, `campaign_classifications`, `campaign_configuration_versions`, `campaign_audit_events`, `campaign_skip_reasons`) had RLS disabled since their original sessions, flagged "critical" by Supabase's own security advisor. Fixed with deny-all RLS (no permissive policy), matching the exact convention already used on the other 18 `call_center` tables — safe because the browser never reaches this schema and the service-role key bypasses RLS by design. Live-regressed immediately after the fix (Customer360 Activity panel, Campaign Configuration History) with no behavior change. All 6 new RBAC/audit tables also carry the same deny-all RLS.
- **Service API keys:** the Voice Agent upstream API key (`VOICEBOT_API_KEY`) remains a completely separate trust layer from user RBAC — `calls.initiate` now gates *whether a human may request* an outbound call; the BFF's own server-to-server call to the upstream API is unchanged.
- **CRON_SECRET:** untouched — `runBatch`/`reconcile`/`enrichActualOutcomes` remain gated by the existing cron-secret/admin-token path, independent of user RBAC, correctly never attributing system-triggered effects to a human actor (`actor_type: 'system'`/`'cron'`).
- **Known limitations:** (1) the legacy `x-user-role` read-filtering seam, described above, remains advisory-only for every route outside this session's enforcement list — a documented follow-up, not closed here. (2) No admin-facing "add/invite user" UI exists yet (explicitly deferred per the approved plan) — new users are provisioned via the same bootstrap-style one-time SQL link used for the Administrator, until a future session builds that UI.

## Vercel function-count constraint (operational note)

This repo has a hard ceiling of 12 serverless functions on its current Vercel plan. The first attempt at this session added 4 separate route files (`me`/`users`/`roles`/`audit`), pushing the count to 15 and failing the deploy outright (`npm run build` succeeded locally; only the Vercel *deploy* step failed, which made the live site silently keep serving the previous build — worth knowing for future sessions). Fixed by consolidating all four into one `api/admin.ts`, dispatched by `?resource=`, matching the established pattern already used by `api/campaigns.ts` and `api/customers/[id]/index.ts`. Function count is back to exactly 12.

## Verification

- **Deterministic tests:** `.tooling/scripts/rbac-authorization-verify.mjs`, 17/17 passing — `evaluatePermission`'s pure decision logic (unauthenticated/forbidden/allowed, inactive-user rejection, unknown-permission fail-closed, multi-role union), `deriveLegacyRole`'s priority ordering, and `api/campaigns.ts`'s `ACTION_PERMISSIONS` map (exact mutating-action coverage, no overlap with GET/admin actions). Wired into `verify:full`.
- **typecheck / lint / build / verify:full:** all green throughout, including every existing suite (campaign idempotency, mapping uniqueness, outcome policy, structured outcomes, configuration versioning/history, ratio math/dimensions/channel, chat materialization, call normalization, agent contract inputs, Dashboard navigation).
- **HIG:** not used as a gate this session per standing instruction (see memory) — replaced with an inline Call Centre UI Quality Check (shared component/token reuse, density, loading/empty/error/unauthorized/disabled states, focus-visible on all new interactive elements, destructive-action clarity, permission-aware rendering, no layout regressions).
- **Deployed verification:** confirmed live — unauthenticated requests to every protected mutation return 401; a garbage bearer token returns 401; unrelated reads are unaffected; exactly one real `user_profiles` row exists (no fabricated users); the Administrator signed in through the deployed app's own real Forgot Password → `/reset-password` → sign-in flow and was correctly identified as **Shripad — Administrator**; Role Management permission toggles for `operator`/`analyst` produced genuine `role.permissions_changed` audit events with the correct verified actor, resource, and metadata, confirmed by direct database query; the RLS remediation was regression-tested immediately after applying (Customer360 Activity panel, Campaign Configuration History) with no behavior change.
- **No telephone call was placed and no campaign was launched for any of this verification.**

## Remaining boundaries for a future session

- The `x-user-role` advisory seam (Customer360/Campaign read-filtering) still needs replacing with server-derived access from the verified authenticated user — tracked, not done here.
- No admin-facing "add/invite user" UI — new users are provisioned via one-time SQL linking, same as the bootstrap Administrator.
- Supabase Auth's project-level Site URL (at the time of this session, still `http://localhost:3000`, a pre-existing/default value unrelated to anything this app's code controls) should be updated to the deployed Call Centre origin if Dashboard-initiated ("Send password recovery") emails are ever used again — this is a Supabase Dashboard setting, not something any available tooling can read or change; exact values were given to the user directly.
- Phase register: User Management/RBAC may now be marked **implemented** (persistence, real identity, permission resolution, server-side enforcement, UI, and audit are all proven) — Authentication as a complete module is a narrower claim and is not asserted beyond what's needed for RBAC (e.g., no self-serve sign-up, no MFA, no session-expiry UX beyond Supabase's defaults).
