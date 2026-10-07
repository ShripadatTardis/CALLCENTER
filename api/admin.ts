import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, methodNotAllowed } from './_voicebot.js';
import { requirePermission, getAuthenticatedUser, getServiceRoleClient, recordAuditEvent, toAgentAccess, isAgentIdInScope, type AuthenticatedCallCenterUser } from './_auth.js';
import { fetchCompleteCallPopulation } from '../src/server/analytics/callPopulationFetcher.js';

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
 *   GET  /api/admin?resource=customerCategories
 *   POST /api/admin?resource=roles&action=setPermissions|setAgentScope|setCustomerCategoryScope
 *   GET  /api/admin?resource=audit
 *
 * Session 14.3 adds the Business Data Scope actions (setAgentScope,
 * setCustomerCategoryScope) and the customerCategories read, alongside
 * the existing Session 14.1 functional-permission actions.
 *
 * Session 15 adds the Action Required work-item queue, same reason
 * (zero function-count headroom — see the 12-function note above):
 *
 *   GET  /api/admin?resource=actions[&status=open|in_progress|resolved]
 *   GET  /api/admin?resource=actions&action=get&id=...
 *   GET  /api/admin?resource=actions&action=eligibleAssignees&id=...
 *   GET  /api/admin?resource=actions&action=generate   (scheduler only — CRON_SECRET bearer)
 *   POST /api/admin?resource=actions&action=assign|takeOwnership|setStatus|resolve|generate
 *
 * Session 16.1 adds Manual QA Review (same 12-function-ceiling reason):
 *
 *   POST /api/admin?resource=qa&action=start           body {interactionId, channel, agentId}
 *   GET  /api/admin?resource=qa&action=review&reviewId=...
 *   GET  /api/admin?resource=qa&action=listForInteraction&interactionId=&channel=
 *   POST /api/admin?resource=qa&action=initTurns        body {reviewId, turns}
 *   POST /api/admin?resource=qa&action=submitTurn       body {reviewId, turnId, role, status, findings}
 *   POST /api/admin?resource=qa&action=setConclusions   body {reviewId, requestCompletion, fcr, humanAssistanceRequired, businessOutcome, reviewerNote}
 *   POST /api/admin?resource=qa&action=submit           body {reviewId}
 *   GET  /api/admin?resource=qa&action=findings        (Agent-Scope-filtered, submitted reviews only — feeds src/lib/qaRatios.ts)
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
  const supabase = getServiceRoleClient();

  if (action === 'setPermissions') {
    const { roleCode, permissionKeys } = req.body ?? {};
    if (typeof roleCode !== 'string' || !Array.isArray(permissionKeys)) {
      res.status(422).json({ detail: 'roleCode and permissionKeys (array) are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_roles_set_permissions', {
      p_role_code: roleCode,
      p_permission_keys: permissionKeys,
      p_actor_user_id: actingUser.id,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'setAgentScope') {
    const { roleCode, allAgents, agentIds } = (req.body ?? {}) as { roleCode?: string; allAgents?: boolean; agentIds?: string[] };
    if (typeof roleCode !== 'string' || typeof allAgents !== 'boolean' || !Array.isArray(agentIds)) {
      res.status(422).json({ detail: 'roleCode, allAgents (boolean), and agentIds (array) are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_roles_set_agent_scope', {
      p_role_code: roleCode,
      p_all_agents: allAgents,
      p_agent_ids: agentIds,
      p_actor_user_id: actingUser.id,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'setCustomerCategoryScope') {
    const { roleCode, allCategories, categoryIds } = (req.body ?? {}) as { roleCode?: string; allCategories?: boolean; categoryIds?: string[] };
    if (typeof roleCode !== 'string' || typeof allCategories !== 'boolean' || !Array.isArray(categoryIds)) {
      res.status(422).json({ detail: 'roleCode, allCategories (boolean), and categoryIds (array) are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_roles_set_customer_category_scope', {
      p_role_code: roleCode,
      p_all_categories: allCategories,
      p_category_ids: categoryIds,
      p_actor_user_id: actingUser.id,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  res.status(400).json({ detail: `Unknown action: ${action}` });
}

async function handleCustomerCategoriesGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'roles.view');
  if (!user) return;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('call_center_customer_categories_list');
  if (error) { res.status(500).json({ detail: error.message }); return; }
  res.status(200).json({ data });
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

/**
 * Session 15 — Action Required work-item queue. v1's only enforceable
 * scope dimension is Agent Scope (customer_id is a genuinely unpopulated
 * snapshot column today — see the migration's header note), so every
 * RPC call here only ever passes the agent-scope pair.
 */
export function toActionScopeArgs(access: ReturnType<typeof toAgentAccess>): { allAgents: boolean; authorizedAgentIds: string[] } {
  const allAgents = access.allCategories || access.authorizedAgentIds === 'all';
  return { allAgents, authorizedAgentIds: allAgents ? [] : (access.authorizedAgentIds as string[]) };
}

/**
 * Maps the RPCs' `raise exception '<code>'` messages to the right HTTP
 * status — 404 for "doesn't exist", 403 for a real authorization denial,
 * 422 for a client-supplied value that's simply invalid. Anything
 * unrecognized falls back to 500 rather than guessing.
 */
export function mapActionItemError(message: string): number {
  if (/action_item_not_found/.test(message)) return 404;
  if (/assignment_not_permitted|ownership_required/.test(message)) return 403;
  if (/assignee_inactive_or_not_found|assignee_out_of_scope|invalid_status_transition/.test(message)) return 422;
  return 500;
}

/**
 * Session 15 — the deliberate anti-flood bootstrap window (plan §11):
 * only escalated calls within this rolling lookback are eligible for
 * generation, so old escalated test calls from early sessions don't
 * suddenly populate the queue. 30 days is the working default (see
 * docs/SESSION_15_DASHBOARD_ACTION_REQUIRED.md for the rationale).
 */
const ACTION_ITEM_BOOTSTRAP_WINDOW_DAYS = 30;

export function actionItemBootstrapWindow(days: number = ACTION_ITEM_BOOTSTRAP_WINDOW_DAYS): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(now) };
}

/**
 * The only genuine, currently-populated "why does this need attention"
 * signal (see the migration header / session doc): escalated voice
 * calls, within the bootstrap window. The RPC itself never calls the
 * Voice API — this function does the fetch, the RPC does the idempotent
 * persist, same fetch/persist separation api/campaigns.ts's reconcile
 * path already uses.
 */
async function runActionItemsGeneration(actor: { actorType: 'user' | 'system'; actorUserId: string | null }): Promise<{ created: number; skipped: number }> {
  const { dateFrom, dateTo } = actionItemBootstrapWindow();
  const population = await fetchCompleteCallPopulation({ outcome: 'escalated', dateFrom, dateTo }, 5, 100);
  const candidates = population.calls.map((c) => ({
    sourceInteractionId: c.call_id,
    agentId: c.ai_agent_id || c.agent_id || null,
    reasonText: c.escalation_trigger || null,
  }));

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('call_center_action_items_generate', {
    p_candidates: candidates,
    p_actor_type: actor.actorType,
    p_actor_user_id: actor.actorUserId,
  });
  if (error) throw new Error(error.message);
  return data as { created: number; skipped: number };
}

/**
 * Vercel Cron only issues GET and can't set custom headers — same
 * narrow scheduler-adapter pattern already proven by api/campaigns.ts
 * and api/customers/admin.ts (deliberately duplicated, not imported;
 * both are tiny and self-contained).
 */
function isAuthorizedActionsCronRequest(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

async function handleActionsGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = queryStr(req, 'action');

  if (action === 'generate') {
    if (!isAuthorizedActionsCronRequest(req)) {
      res.status(401).json({ detail: 'Invalid or missing cron authorization' });
      return;
    }
    try {
      const result = await runActionItemsGeneration({ actorType: 'system', actorUserId: null });
      res.status(200).json({ data: { triggeredBy: 'cron', ...result } });
    } catch (err) {
      res.status(502).json({ detail: err instanceof Error ? err.message : 'Generation failed' });
    }
    return;
  }

  if (action === 'eligibleAssignees') {
    const user = await requirePermission(req, res, 'actions.resolve');
    if (!user) return;
    const id = queryStr(req, 'id');
    if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_action_items_eligible_assignees', { p_id: id });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  const user = await requirePermission(req, res, 'actions.view');
  if (!user) return;
  const { allAgents, authorizedAgentIds } = toActionScopeArgs(toAgentAccess(user));
  const supabase = getServiceRoleClient();

  if (action === 'get') {
    const id = queryStr(req, 'id');
    if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_action_items_get', {
      p_id: id, p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    if (!data) { res.status(404).json({ detail: 'Action item not found' }); return; }
    res.status(200).json({ data });
    return;
  }

  const status = queryStr(req, 'status') ?? null;
  const { data, error } = await supabase.rpc('call_center_action_items_list', {
    p_status: status, p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
  });
  if (error) { res.status(500).json({ detail: error.message }); return; }
  res.status(200).json({ data });
}

/**
 * assign/takeOwnership/setStatus/resolve all require at least
 * `actions.resolve` — the floor that lets anyone take unassigned work.
 * `actorHasManageAny` (true only when the caller also holds
 * `actions.assign`) is passed through to the RPC, which re-enforces the
 * ownership rule itself rather than trusting this flag blindly from the
 * route (plan §7 — Functional Permission + Business Data Scope + Work
 * Ownership, never a role-name check).
 */
async function handleActionsPost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = queryStr(req, 'action');

  if (action === 'generate') {
    const user = await requirePermission(req, res, 'actions.view');
    if (!user) return;
    try {
      const result = await runActionItemsGeneration({ actorType: 'user', actorUserId: user.id });
      res.status(200).json({ data: { triggeredBy: 'manual', ...result } });
    } catch (err) {
      res.status(502).json({ detail: err instanceof Error ? err.message : 'Generation failed' });
    }
    return;
  }

  const actingUser = await requirePermission(req, res, 'actions.resolve');
  if (!actingUser) return;
  const actorHasManageAny = actingUser.permissions.includes('actions.assign');
  const supabase = getServiceRoleClient();

  if (action === 'assign' || action === 'takeOwnership') {
    const body = (req.body ?? {}) as { id?: string; assigneeUserId?: string };
    const id = body.id;
    const assigneeUserId = action === 'takeOwnership' ? actingUser.id : body.assigneeUserId;
    if (typeof id !== 'string' || typeof assigneeUserId !== 'string') {
      res.status(422).json({ detail: 'id (and assigneeUserId for assign) are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_action_items_assign', {
      p_id: id, p_assignee_user_id: assigneeUserId, p_actor_user_id: actingUser.id, p_actor_has_manage_any: actorHasManageAny,
    });
    if (error) { res.status(mapActionItemError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'setStatus') {
    const { id, status } = (req.body ?? {}) as { id?: string; status?: string };
    if (typeof id !== 'string' || typeof status !== 'string') {
      res.status(422).json({ detail: 'id and status are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_action_items_set_status', {
      p_id: id, p_status: status, p_actor_user_id: actingUser.id, p_actor_has_manage_any: actorHasManageAny,
    });
    if (error) { res.status(mapActionItemError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'resolve') {
    const { id, resolutionCode, resolutionNote } = (req.body ?? {}) as { id?: string; resolutionCode?: string; resolutionNote?: string };
    if (typeof id !== 'string' || typeof resolutionCode !== 'string') {
      res.status(422).json({ detail: 'id and resolutionCode are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_action_items_resolve', {
      p_id: id, p_resolution_code: resolutionCode, p_resolution_note: resolutionNote?.trim() || null,
      p_actor_user_id: actingUser.id, p_actor_has_manage_any: actorHasManageAny,
    });
    if (error) { res.status(mapActionItemError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  res.status(400).json({ detail: `Unknown action: ${action}` });
}

/**
 * Session 16.1's QA RPCs return `to_jsonb(row)` directly (snake_case
 * columns) rather than hand-building a camelCase `jsonb_build_object`
 * the way call_center_action_items_* does — the QA review payload is
 * wide and nests two child arrays (turnReviews, findings), so building
 * it by hand in SQL would be error-prone to keep in sync as fields are
 * added. This is the one, isolated bridge back to the frontend's
 * camelCase convention, applied only to this resource's responses.
 */
function toCamelCaseDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => toCamelCaseDeep(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
      out[camelKey] = toCamelCaseDeep(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Session 16.1 — Manual QA Review. Maps the RPCs' `raise exception`
 * codes to the right HTTP status, same convention as
 * mapActionItemError above.
 */
function mapQaError(message: string): number {
  if (/qa_review_not_found/.test(message)) return 404;
  if (/qa_review_already_submitted/.test(message)) return 409;
  if (/qa_review_incomplete/.test(message)) return 422;
  return 500;
}

interface QaReviewRow {
  id: string;
  interactionId: string;
  channel: 'voice' | 'chat';
  agentId: string;
  reviewerUserId: string;
  status: 'in_progress' | 'submitted';
  [key: string]: unknown;
}

/**
 * Every QA mutation re-validates BOTH (a) the caller is the review's own
 * reviewer — Human QA is a personal, non-shared workspace while
 * in_progress, there is no "supervisor edits someone else's draft"
 * concept in v1 — and (b) the review's stamped agentId is still within
 * the caller's current Agent Scope, re-checked on every call rather than
 * trusted from the original `start`. Returns null (and has already
 * written the response) on any failure.
 */
async function loadOwnedReviewOrRespond(
  res: VercelResponse,
  supabase: ReturnType<typeof getServiceRoleClient>,
  user: AuthenticatedCallCenterUser,
  reviewId: string,
): Promise<QaReviewRow | null> {
  const { data, error } = await supabase.rpc('call_center_qa_review_get', { p_review_id: reviewId });
  if (error) { res.status(500).json({ detail: error.message }); return null; }
  const review = data ? (toCamelCaseDeep(data) as QaReviewRow) : null;
  if (!review) { res.status(404).json({ detail: 'QA review not found' }); return null; }
  if (review.reviewerUserId !== user.id) { res.status(404).json({ detail: 'QA review not found' }); return null; }
  if (!isAgentIdInScope(toAgentAccess(user), review.agentId)) { res.status(404).json({ detail: 'QA review not found' }); return null; }
  return review;
}

async function handleQaGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'qa.review');
  if (!user) return;
  const action = queryStr(req, 'action');
  const supabase = getServiceRoleClient();

  if (action === 'review') {
    const reviewId = queryStr(req, 'reviewId');
    if (!reviewId) { res.status(422).json({ detail: 'reviewId is required' }); return; }
    const review = await loadOwnedReviewOrRespond(res, supabase, user, reviewId);
    if (!review) return;
    res.status(200).json({ data: review });
    return;
  }

  if (action === 'listForInteraction') {
    const interactionId = queryStr(req, 'interactionId');
    const channel = queryStr(req, 'channel');
    if (!interactionId || (channel !== 'voice' && channel !== 'chat')) {
      res.status(422).json({ detail: 'interactionId and channel ("voice"|"chat") are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_qa_review_list_for_interaction', {
      p_interaction_id: interactionId, p_channel: channel,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    const access = toAgentAccess(user);
    const rows = (toCamelCaseDeep(data ?? []) as QaReviewRow[]).filter((r) => isAgentIdInScope(access, r.agentId));
    res.status(200).json({ data: rows });
    return;
  }

  if (action === 'findings') {
    const access = toAgentAccess(user);
    const allAgents = access.allCategories || access.authorizedAgentIds === 'all';
    const { data, error } = await supabase.rpc('call_center_qa_findings_list', {
      p_authorized_agent_ids: allAgents ? [] : access.authorizedAgentIds,
      p_all_agents: allAgents,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }

  res.status(400).json({ detail: `Unknown action: ${action}` });
}

async function handleQaPost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'qa.review');
  if (!user) return;
  const action = queryStr(req, 'action');
  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  if (action === 'start') {
    const { interactionId, channel, agentId } = (req.body ?? {}) as { interactionId?: string; channel?: string; agentId?: string };
    if (typeof interactionId !== 'string' || (channel !== 'voice' && channel !== 'chat') || typeof agentId !== 'string') {
      res.status(422).json({ detail: 'interactionId, channel ("voice"|"chat"), and agentId are required' });
      return;
    }
    if (!isAgentIdInScope(toAgentAccess(user), agentId)) {
      res.status(404).json({ detail: 'Interaction not found' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_qa_review_start', {
      p_interaction_id: interactionId, p_channel: channel, p_agent_id: agentId, p_reviewer_user_id: user.id, p_now: now,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    const started = toCamelCaseDeep(data) as { id?: string } | null;
    await recordAuditEvent({
      actorType: 'user', actorUserId: user.id, action: 'qa_review.started',
      resourceType: 'qa_review', resourceId: started?.id ?? null, result: 'success',
      metadata: { interactionId, channel, agentId }, source: 'api/admin',
    });
    res.status(200).json({ data: started });
    return;
  }

  // Every other action operates on an existing review this reviewer owns.
  const { reviewId } = (req.body ?? {}) as { reviewId?: string };
  if (typeof reviewId !== 'string') { res.status(422).json({ detail: 'reviewId is required' }); return; }
  const review = await loadOwnedReviewOrRespond(res, supabase, user, reviewId);
  if (!review) return;

  if (action === 'initTurns') {
    const { turns } = (req.body ?? {}) as { turns?: Array<{ turnId: string; role: string }> };
    if (!Array.isArray(turns)) { res.status(422).json({ detail: 'turns (array) is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_qa_review_init_turns', {
      p_review_id: reviewId, p_turns: turns, p_now: now,
    });
    if (error) { res.status(mapQaError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }

  if (action === 'submitTurn') {
    const { turnId, role, status, findings } = (req.body ?? {}) as {
      turnId?: string; role?: string; status?: string; findings?: unknown[];
    };
    if (typeof turnId !== 'string' || (role !== 'agent' && role !== 'customer') || typeof status !== 'string') {
      res.status(422).json({ detail: 'turnId, role ("agent"|"customer"), and status are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_qa_turn_submit', {
      p_review_id: reviewId, p_turn_id: turnId, p_role: role, p_status: status,
      p_findings: Array.isArray(findings) ? findings : null, p_now: now,
    });
    if (error) { res.status(mapQaError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }

  if (action === 'setConclusions') {
    const { requestCompletion, fcr, humanAssistanceRequired, businessOutcome, reviewerNote } = (req.body ?? {}) as {
      requestCompletion?: string | null; fcr?: string | null; humanAssistanceRequired?: string | null;
      businessOutcome?: string | null; reviewerNote?: string | null;
    };
    const { data, error } = await supabase.rpc('call_center_qa_review_set_conclusions', {
      p_review_id: reviewId,
      p_request_completion: requestCompletion ?? null,
      p_fcr: fcr ?? null,
      p_human_assistance_required: humanAssistanceRequired ?? null,
      p_business_outcome: businessOutcome ?? null,
      p_reviewer_note: reviewerNote?.trim() || null,
      p_now: now,
    });
    if (error) { res.status(mapQaError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }

  if (action === 'submit') {
    const { data, error } = await supabase.rpc('call_center_qa_review_submit', { p_review_id: reviewId, p_now: now });
    if (error) { res.status(mapQaError(error.message)).json({ detail: error.message }); return; }
    await recordAuditEvent({
      actorType: 'user', actorUserId: user.id, action: 'qa_review.submitted',
      resourceType: 'qa_review', resourceId: reviewId, result: 'success',
      metadata: { interactionId: review.interactionId, channel: review.channel, agentId: review.agentId }, source: 'api/admin',
    });
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }

  res.status(400).json({ detail: `Unknown action: ${action}` });
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

  if (resource === 'customerCategories') {
    if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }
    await handleCustomerCategoriesGet(req, res);
    return;
  }

  if (resource === 'audit') {
    if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }
    await handleAuditGet(req, res);
    return;
  }

  if (resource === 'actions') {
    if (req.method === 'GET') { await handleActionsGet(req, res); return; }
    if (req.method === 'POST') { await handleActionsPost(req, res); return; }
    methodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (resource === 'qa') {
    if (req.method === 'GET') { await handleQaGet(req, res); return; }
    if (req.method === 'POST') { await handleQaPost(req, res); return; }
    methodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  res.status(400).json({ detail: 'Unknown or missing ?resource= — use me, users, roles, permissions, audit, actions, or qa' });
});
