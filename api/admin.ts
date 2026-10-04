import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, methodNotAllowed } from './_voicebot.js';
import { requirePermission, getAuthenticatedUser, getServiceRoleClient, recordAuditEvent } from './_auth.js';

/**
 * /api/admin — Session 14.1 User Management / Role Management / Audit
 * Trail, consolidated into ONE route dispatched by `?resource=` (+
 * `?action=` for mutations), the same proven pattern already used by
 * api/campaigns.ts and api/customers/[id]/index.ts.
 *
 * This repo has a hard ceiling of 12 Vercel serverless functions on the
 * current plan (see docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md and
 * api/customers/admin.ts / api/chat/logs.ts, which were themselves
 * consolidated for the identical reason) — four separate route files
 * (me/users/roles/audit) pushed the count to 15 and broke the deploy.
 * Consolidating here, not reverting the feature.
 *
 *   GET  /api/admin?resource=me
 *   GET  /api/admin?resource=users[&id=...]
 *   POST /api/admin?resource=users&action=setStatus|assignRole|removeRole
 *   GET  /api/admin?resource=roles
 *   GET  /api/admin?resource=permissions
 *   POST /api/admin?resource=roles&action=setPermissions
 *   GET  /api/admin?resource=audit
 */

function queryStr(req: VercelRequest, key: string): string | undefined {
  const raw = req.query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Session 14.2 — the deployed Call Centre origin, resolved server-side
 * (there's no `window.location` on the BFF). Prefers Vercel's own
 * production-URL env var over the per-deployment URL so invite links
 * always point at the stable domain, with a local-dev fallback that
 * matches vite.config.ts's real port (8080) rather than a guessed one.
 * Never hardcodes a single environment the way the pre-14.1 Supabase
 * Dashboard Site URL did.
 */
export function getAppOrigin(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:8080';
}

/**
 * Supabase's Admin API has no "get user by email" call — only
 * `getUserById` (single, cheap) and `listUsers` (paginated). This is
 * only reached on the "email already has a Supabase Auth identity"
 * branch of provisioning (i.e. `inviteUserByEmail` just told us so),
 * which is rare for a small internal team, so a bounded page scan is an
 * acceptable, documented limitation rather than new infrastructure.
 */
async function findAuthUserIdByEmail(supabase: ReturnType<typeof getServiceRoleClient>, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function handleMe(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ detail: 'No Call Centre profile for this identity' });
    return;
  }
  res.status(200).json({ data: user });
}

/**
 * Session 14.2 — "Invited / pending" vs "Active" is only shown when
 * genuinely derivable from Supabase's own auth user record
 * (`confirmed_at` / `email_confirmed_at` null means the invite hasn't
 * been accepted yet) — never fabricated. `getUserById` is a single,
 * cheap Admin API call per profile; fine at this app's real user scale
 * (single digits to low tens), not something to pre-optimize.
 */
async function enrichWithIdentityStatus(
  supabase: ReturnType<typeof getServiceRoleClient>,
  rows: Array<{ id: string; identityProvider?: string; identitySubject?: string }>,
): Promise<Record<string, 'pending' | 'confirmed' | 'unknown'>> {
  const result: Record<string, 'pending' | 'confirmed' | 'unknown'> = {};
  await Promise.all(
    rows.map(async (row) => {
      const subject = row.identitySubject;
      if (!subject) { result[row.id] = 'unknown'; return; }
      try {
        const { data, error } = await supabase.auth.admin.getUserById(subject);
        if (error || !data?.user) { result[row.id] = 'unknown'; return; }
        result[row.id] = data.user.confirmed_at || data.user.email_confirmed_at ? 'confirmed' : 'pending';
      } catch {
        result[row.id] = 'unknown';
      }
    }),
  );
  return result;
}

async function handleUsersGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'users.view');
  if (!user) return;

  const supabase = getServiceRoleClient();
  const userId = queryStr(req, 'id');

  if (userId) {
    const { data, error } = await supabase.rpc('call_center_users_get_detail', { p_user_id: userId });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    if (!data) { res.status(404).json({ detail: 'User not found' }); return; }
    res.status(200).json({ data });
    return;
  }

  const { data, error } = await supabase.rpc('call_center_users_list');
  if (error) { res.status(500).json({ detail: error.message }); return; }

  type ListRow = { id: string; identitySubject?: string; [k: string]: unknown };
  const rows = (data ?? []) as ListRow[];
  const identityStatus = await enrichWithIdentityStatus(supabase, rows.map((r) => ({ id: r.id, identitySubject: r.identitySubject })));

  res.status(200).json({
    data: rows.map(({ identitySubject: _identitySubject, ...rest }) => ({
      ...rest,
      identityStatus: identityStatus[rest.id as string] ?? 'unknown',
    })),
  });
}

async function handleUsersPost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const actingUser = await requirePermission(req, res, 'users.manage');
  if (!actingUser) return;

  const action = queryStr(req, 'action');
  const supabase = getServiceRoleClient();

  if (action === 'setStatus') {
    const { userId, status } = req.body ?? {};
    if (typeof userId !== 'string' || (status !== 'active' && status !== 'inactive')) {
      res.status(422).json({ detail: 'userId and status ("active"|"inactive") are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_users_set_status', { p_user_id: userId, p_status: status, p_actor_user_id: actingUser.id });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'assignRole') {
    const { userId, roleCode } = req.body ?? {};
    if (typeof userId !== 'string' || typeof roleCode !== 'string') {
      res.status(422).json({ detail: 'userId and roleCode are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_users_assign_role', { p_user_id: userId, p_role_code: roleCode, p_actor_user_id: actingUser.id });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'removeRole') {
    const { userId, roleCode } = req.body ?? {};
    if (typeof userId !== 'string' || typeof roleCode !== 'string') {
      res.status(422).json({ detail: 'userId and roleCode are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_users_remove_role', { p_user_id: userId, p_role_code: roleCode, p_actor_user_id: actingUser.id });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'provision') {
    await handleUsersProvision(req, res, actingUser, supabase);
    return;
  }

  res.status(400).json({ detail: `Unknown action: ${action}` });
}

/**
 * Session 14.2 — Administrator-facing user provisioning.
 * Authenticated Administrator -> requirePermission('users.manage')
 * (already enforced by the caller) -> Supabase Auth Admin API ->
 * Call Centre profile + role assignment (one atomic RPC) -> audit.
 *
 * Email+role are the only inputs besides display name (brief §5) — no
 * password is ever collected here; the invited person establishes
 * their own via Supabase's real invite-email flow.
 */
async function handleUsersProvision(
  req: VercelRequest,
  res: VercelResponse,
  actingUser: { id: string },
  supabase: ReturnType<typeof getServiceRoleClient>,
): Promise<void> {
  const { email, displayName, roleCode } = (req.body ?? {}) as { email?: string; displayName?: string; roleCode?: string };
  if (typeof email !== 'string' || !email.trim() || typeof roleCode !== 'string' || !roleCode.trim()) {
    res.status(422).json({ detail: 'email and roleCode are required' });
    return;
  }
  const normalizedEmail = email.trim();

  // Step 0 — never send a misleading "invited" response for someone
  // who's already a Call Centre member; never silently duplicate or
  // overwrite their existing role/status.
  const { data: existing, error: existingError } = await supabase.rpc('call_center_users_find_by_email', { p_email: normalizedEmail });
  if (existingError) { res.status(500).json({ detail: existingError.message }); return; }
  if (existing) {
    res.status(409).json({ detail: 'A Call Centre user already exists for this email.', data: existing });
    return;
  }

  // Step 1 — real Supabase Auth invitation (or discover an existing,
  // Call-Centre-unlinked identity for this email — never insert into
  // auth.users directly, never fabricate an invite if this fails for a
  // reason other than "already registered").
  const redirectTo = `${getAppOrigin()}/reset-password`;
  const invite = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: displayName ? { display_name: displayName } : undefined,
  });

  let authUserId: string | null = null;
  if (invite.error) {
    const alreadyRegistered = /already.*(registered|exists)/i.test(invite.error.message);
    if (!alreadyRegistered) {
      await recordAuditEvent({
        actorType: 'user', actorUserId: actingUser.id, action: 'user.provision_failed',
        resourceType: 'user', resourceId: null, result: 'error',
        metadata: { email: normalizedEmail, stage: 'invite' }, source: 'api/admin',
      });
      res.status(502).json({ detail: `Invitation failed: ${invite.error.message}` });
      return;
    }
    authUserId = await findAuthUserIdByEmail(supabase, normalizedEmail);
    if (!authUserId) {
      await recordAuditEvent({
        actorType: 'user', actorUserId: actingUser.id, action: 'user.provision_failed',
        resourceType: 'user', resourceId: null, result: 'error',
        metadata: { email: normalizedEmail, stage: 'resolve_existing_identity' }, source: 'api/admin',
      });
      res.status(502).json({ detail: 'This email already has a Supabase Auth identity, but it could not be resolved.' });
      return;
    }
  } else {
    authUserId = invite.data.user.id;
  }

  // Step 2 — atomic Call Centre profile + role assignment (idempotent:
  // safe to retry this whole request after a partial failure, since the
  // underlying upsert/on-conflict-do-nothing never duplicates a profile
  // or a role assignment).
  const { data: provisioned, error: provisionError } = await supabase.rpc('call_center_users_provision', {
    p_identity_provider: 'supabase_auth',
    p_identity_subject: authUserId,
    p_email: normalizedEmail,
    p_display_name: displayName?.trim() || null,
    p_role_code: roleCode,
    p_actor_user_id: actingUser.id,
  });
  if (provisionError) {
    const unknownRole = /unknown_role_code/.test(provisionError.message);
    res.status(unknownRole ? 422 : 500).json({
      detail: unknownRole ? `Unknown role: ${roleCode}` : provisionError.message,
    });
    return;
  }

  res.status(201).json({ data: provisioned });
}

async function handleRolesGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'roles.view');
  if (!user) return;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('call_center_roles_list');
  if (error) { res.status(500).json({ detail: error.message }); return; }
  res.status(200).json({ data });
}

async function handlePermissionsGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'roles.view');
  if (!user) return;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('call_center_permissions_list');
  if (error) { res.status(500).json({ detail: error.message }); return; }
  res.status(200).json({ data });
}

async function handleRolesPost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const actingUser = await requirePermission(req, res, 'roles.manage');
  if (!actingUser) return;

  const action = queryStr(req, 'action');
  if (action === 'setPermissions') {
    const { roleCode, permissionKeys } = req.body ?? {};
    if (typeof roleCode !== 'string' || !Array.isArray(permissionKeys)) {
      res.status(422).json({ detail: 'roleCode and permissionKeys (array) are required' });
      return;
    }
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_roles_set_permissions', {
      p_role_code: roleCode,
      p_permission_keys: permissionKeys,
      p_actor_user_id: actingUser.id,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  res.status(400).json({ detail: `Unknown action: ${action}` });
}

async function handleAuditGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'audit.view');
  if (!user) return;

  const limitRaw = queryStr(req, 'limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 100;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('call_center_audit_list', {
    p_limit: Number.isFinite(limit) ? limit : 100,
    p_actor_user_id: queryStr(req, 'actorUserId') ?? null,
    p_action: queryStr(req, 'action') ?? null,
    p_resource_type: queryStr(req, 'resourceType') ?? null,
    p_result: queryStr(req, 'result') ?? null,
  });
  if (error) { res.status(500).json({ detail: error.message }); return; }
  res.status(200).json({ data });
}

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);
  const resource = queryStr(req, 'resource');

  if (resource === 'me') {
    if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }
    await handleMe(req, res);
    return;
  }

  if (resource === 'users') {
    if (req.method === 'GET') { await handleUsersGet(req, res); return; }
    if (req.method === 'POST') { await handleUsersPost(req, res); return; }
    methodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (resource === 'roles') {
    if (req.method === 'GET') { await handleRolesGet(req, res); return; }
    if (req.method === 'POST') { await handleRolesPost(req, res); return; }
    methodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (resource === 'permissions') {
    if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }
    await handlePermissionsGet(req, res);
    return;
  }

  if (resource === 'audit') {
    if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }
    await handleAuditGet(req, res);
    return;
  }

  res.status(400).json({ detail: 'Unknown or missing ?resource= — use me, users, roles, permissions, or audit' });
});
