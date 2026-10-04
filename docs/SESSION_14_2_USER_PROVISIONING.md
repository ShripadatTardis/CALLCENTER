# Session 14.2 — User Provisioning & Permission Enforcement E2E

Builds on Session 14.1's foundation (`docs/SESSION_14_1_USER_MANAGEMENT_RBAC_AUDIT.md`) — this doc covers only what's new.

## Architecture / ownership boundary

```
Authenticated Administrator (requirePermission('users.manage'))
        ↓
Call Centre BFF (api/admin.ts, resource=users, action=provision)
        ↓
Supabase Auth Admin API (inviteUserByEmail) — identity only
        ↓
Call Centre profile + role assignment (one atomic RPC)
        ↓
Audit
```

Supabase Auth remains strictly the identity/authentication provider. The Call Centre application continues to own membership, status, roles, permissions, and audit. No second permission system, no per-user permission overrides, no role-name checks — permissions still come entirely from assigned roles.

## Provisioning flow

1. Administrator fills email + display name + one role in the new "Add User" dialog (`src/components/admin/AddUserDialog.tsx`), deliberately minimal — no password field, ever.
2. BFF checks `requirePermission('users.manage')`.
3. **Checks for an existing Call Centre profile by email first** (`call_center_users_find_by_email` RPC) — never sends a misleading "invited" response for someone already a member; returns `409` with the existing user's real state instead of duplicating or silently overwriting their role/status.
4. Calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo })` — a real Supabase Auth invitation, never a direct `auth.users` insert.
5. If the email already has an Auth identity but no Call Centre profile (`inviteUserByEmail` returns an "already registered" error), resolves the existing identity via a bounded `listUsers` scan (Supabase's Admin API has no `getUserByEmail`) and links it instead of erroring — documented as an accepted limitation at this app's small-team scale.
6. One atomic SQL function, `call_center_users_provision`, upserts the `user_profiles` row and assigns the role together — idempotent via `on conflict` everywhere, so retrying the whole request after a partial failure (e.g. invite succeeded, Call Centre write failed) never creates a duplicate profile or duplicate role assignment.
7. Invited person follows the real Supabase email, lands on the existing `/reset-password` page (Session 14.1 — reused as-is, no new page needed since establishing a first password and resetting one are the same Supabase recovery-session mechanic), sets their own password, signs in.

## Invitation redirect

Reuses the exact `/reset-password` route from Session 14.1 — **no new Supabase Auth redirect URL needed in the allow-list**. The redirect base is resolved server-side (`getAppOrigin()` in `api/admin.ts`): prefers `VERCEL_PROJECT_PRODUCTION_URL`, falls back to `VERCEL_URL`, falls back to the real local dev origin (`http://localhost:8080`, confirmed from `vite.config.ts`, not guessed) — never hardcoded to a single environment, directly avoiding the Session 14.1 mistake where the Supabase Dashboard's own Site URL was still `http://localhost:3000`.

## APIs/routes changed

All consolidated into `api/admin.ts` (see the 12-function-ceiling note below) — `resource=users&action=provision` is the only new action; `resource=users` (GET) now also returns a genuinely-derived `identityStatus: 'pending' | 'confirmed' | 'unknown'` per user (from the Supabase Auth identity's own `confirmed_at`, via `getUserById` — never fabricated).

## Failure/retry semantics

| Scenario | Behavior |
|---|---|
| Email already has a Call Centre profile | `409`, with the existing user's real state — no duplicate, no silent overwrite |
| Invite call fails for a reason other than "already registered" | `502`, audited as `user.provision_failed` (stage: `invite`) |
| Email has an Auth identity but it can't be resolved | `502`, audited as `user.provision_failed` (stage: `resolve_existing_identity`) |
| Unknown role code | `422` |
| Retry after partial failure | Safe — `call_center_users_provision`'s upsert/on-conflict logic never duplicates |

## Vercel function-count constraint (operational note, became relevant mid-session)

The first implementation pass added 4 separate route files (`me`/`users`/`roles`/`audit`), pushing this repo's serverless function count to 15 — over the Hobby plan's 12-function ceiling (the same constraint previously hit in Session 4.5 for Chat). The deploy failed outright (`npm run build` succeeded locally; only the Vercel *deploy* step failed, which meant the live site kept silently serving the previous build — worth knowing for future sessions: always check `npx vercel ls` status after a deploy that adds `api/` routes, not just that the local build passed). Fixed by consolidating all four into one `api/admin.ts`, `?resource=` dispatch, matching the established `api/campaigns.ts` pattern. Function count is exactly 12.

## Security model

- `users.manage` required server-side for provisioning (not just a hidden button).
- Service-role credential stays server-only — the browser never receives it; the Admin API call happens entirely inside `api/admin.ts`.
- No secret ever reaches a `VITE_*` env var or the frontend bundle.

## Audit

`user.provisioned` (success), `user.provision_failed` (invite/resolve failure stages), `role.assigned`/`role.removed` (existing 14.1 events, unchanged) — all with the real, JWT-verified actor. No password, invitation token, or secret ever appears in audit metadata.

## Acceptance case: a role that cannot initiate a call

Operator's seeded permission set originally included `calls.initiate`. Removed via Role Management's existing `setPermissions` RPC (a role-level edit using the already-built 14.1 mechanism, not a new one, not a per-user exception) so the required acceptance case — "a second user must be able to use Call Centre while being unable to initiate a call" — held using the real `calls.initiate` permission and a real role, not a special-cased test user.

## Tests

`.tooling/scripts/user-provisioning-verify.mjs` — 3/3 assertions on `getAppOrigin()`'s environment-driven redirect resolution (the one genuinely pure, non-I/O piece of new logic; the rest of provisioning is I/O orchestration covered by the live E2E test below, consistent with this project's "test real compiled code, don't duplicate logic in a mock" convention).

## Deployed E2E evidence

- Real second user provisioned from the deployed Call Centre's own User Management → Add User: `shripad@miles.in`, Operator role.
- Real Supabase invitation generated and accepted by the real mailbox; the person established their own password via `/reset-password` and signed into the deployed app.
- `/api/me` resolved the correct Call Centre user with the Operator role and its exact effective permission set — `calls.initiate` confirmed absent.
- Initiate Call navigation/action confirmed unavailable in the UI (hidden from the sidebar, `/initiate-call` shows the established "Not authorized" state).
- Direct BFF call-trigger attempt denial is covered generically by Session 14.1's `requirePermission` enforcement (already deterministically tested — `authenticated user without the permission -> forbidden`) — no telephone call was placed for this or any other part of verification.
- Audit Trail shows the Administrator's `user.provisioned` and subsequent `role.permissions_changed` (Operator `calls.initiate` removal) events with correct attribution.

## Remaining limitations

- No bulk/CSV provisioning — one user at a time, matching "a small provisioning session" scope.
- `findAuthUserIdByEmail`'s bounded `listUsers` scan (used only on the rare "email already has an Auth identity" branch) doesn't scale past a few thousand Supabase Auth users — acceptable and documented at this app's real team size.
- Surfaced the Business Data Scope gap described in `docs/SESSION_14_3_BUSINESS_DATA_SCOPE_AUTHORIZATION.md` — not fixed here, carried forward as its own session rather than patched ad hoc.
