import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, methodNotAllowed } from './_voicebot.js';
import { requirePermission, getAuthenticatedUser, getServiceRoleClient, recordAuditEvent, toAgentAccess, toCustomerAccess, isAgentIdInScope, type AuthenticatedCallCenterUser } from './_auth.js';
import { fetchCompleteCallPopulation } from '../src/server/analytics/callPopulationFetcher.js';
import { fetchQaTurnsForInteraction } from '../src/server/qa/transcriptFetcher.js';
import { evaluateInteraction, PROMPT_VERSION } from '../src/server/qa/automatedQaEvaluator.js';
import { persistAttemptDiagnosticsSafely, toCamelAttemptDiagnosticRow } from '../src/lib/automatedQaAttemptDiagnostics.js';
import { runManualCmaSync } from '../src/server/cma/cmaSyncRun.js';
import {
  listCanonicalMeasures, getCanonicalMeasure, listCanonicalMeasureOccurrences, getMeasureOccurrence,
  listDimensions, listBaseFactsForMeasure, listChartVisualizations, getGovernanceStatus,
} from '../src/server/cma/cmaRegistry.js';
import { evaluateCmaMeasure } from '../src/server/cma/cmaEvaluation.js';
import type { CmaDimensionId, CmaQaPopulation } from '../src/server/cma/cmaEvaluationTypes.js';
import crypto from 'node:crypto';

const AUTOMATED_QA_CONTRACT_VERSION = 'v1';
const AUTOMATED_QA_SCHEMA_VERSION = 'v1';

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
 *
 * Session 16.5 adds Corrective Action Management — see the doc comment
 * directly above handleCorrectiveActionsGet/Post below for the full
 * resource=correctiveActions action list.
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

/**
 * Session 16.2 — the read-only counterpart of loadOwnedReviewOrRespond,
 * used ONLY by the GET 'review' action (never by any mutation). A
 * submitted review is the shared, immutable reference record this whole
 * framework is built around (docs/MANUAL_QA_QUALITY_FRAMEWORK.md §4) —
 * an analyst with qa.analytics.view who is NOT the original reviewer
 * must still be able to open it for evidence drill-down (brief §16), or
 * the Explorer's "ratio → failures → interaction → evidence" chain
 * breaks for every review except the viewer's own. An IN-PROGRESS
 * review stays strictly owner-only even for an analyst — it is a
 * private, possibly-incomplete draft, not yet the reference assessment.
 */
/**
 * Pure decision logic, extracted so it's directly unit-testable without
 * a live Supabase call (same convention as mapActionItemError/
 * actionItemBootstrapWindow above — bundled via esbuild into
 * .tooling/tmp/adminRoute.mjs for qa-analysis-authorization-verify.mjs).
 * An owner can always view their own review, any status. A non-owner
 * can view it ONLY once it's submitted (the shared, immutable reference
 * record) AND they hold qa.analytics.view — an in-progress review stays
 * strictly private to its author even from an analyst.
 */
export function qaReviewViewAuthorized(params: { ownerUserId: string; callerUserId: string; status: 'in_progress' | 'submitted'; callerHasAnalyticsPermission: boolean }): boolean {
  if (params.ownerUserId === params.callerUserId) return true;
  return params.status === 'submitted' && params.callerHasAnalyticsPermission;
}

async function loadReviewForViewing(
  res: VercelResponse,
  supabase: ReturnType<typeof getServiceRoleClient>,
  user: AuthenticatedCallCenterUser,
  reviewId: string,
): Promise<QaReviewRow | null> {
  const { data, error } = await supabase.rpc('call_center_qa_review_get', { p_review_id: reviewId });
  if (error) { res.status(500).json({ detail: error.message }); return null; }
  const review = data ? (toCamelCaseDeep(data) as QaReviewRow) : null;
  if (!review) { res.status(404).json({ detail: 'QA review not found' }); return null; }
  const authorized = qaReviewViewAuthorized({
    ownerUserId: review.reviewerUserId, callerUserId: user.id, status: review.status,
    callerHasAnalyticsPermission: user.permissions.includes('qa.analytics.view'),
  });
  if (!authorized) { res.status(404).json({ detail: 'QA review not found' }); return null; }
  if (!isAgentIdInScope(toAgentAccess(user), review.agentId)) { res.status(404).json({ detail: 'QA review not found' }); return null; }
  return review;
}

async function handleQaGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = queryStr(req, 'action');
  const supabase = getServiceRoleClient();

  if (action === 'review') {
    // Either permission can reach this action — ownership/submitted-
    // status is enforced inside loadReviewForViewing, not here.
    const user = await getAuthenticatedUser(req);
    if (!user || (!user.permissions.includes('qa.review') && !user.permissions.includes('qa.analytics.view'))) {
      res.status(user ? 403 : 401).json({ detail: user ? 'Missing required permission: qa.review or qa.analytics.view' : 'Authentication required' });
      return;
    }
    const reviewId = queryStr(req, 'reviewId');
    if (!reviewId) { res.status(422).json({ detail: 'reviewId is required' }); return; }
    const review = await loadReviewForViewing(res, supabase, user, reviewId);
    if (!review) return;
    res.status(200).json({ data: review });
    return;
  }

  if (action === 'listForInteraction') {
    const user = await getAuthenticatedUser(req);
    if (!user || (!user.permissions.includes('qa.review') && !user.permissions.includes('qa.analytics.view'))) {
      res.status(user ? 403 : 401).json({ detail: user ? 'Missing required permission: qa.review or qa.analytics.view' : 'Authentication required' });
      return;
    }
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

  // Bulk review-status lookup for the Interaction Quality table's "Human
  // QA" column (follow-up fix — the table previously always showed
  // "Review" even for an already-submitted interaction, with no
  // indication it had been reviewed, letting a reviewer re-review it).
  // Reuses the EXACT same scoped RPC as `population` below, but gated on
  // the lower `qa.review` bar (same pair as `review`/`listForInteraction`
  // above) rather than `qa.analytics.view` — this endpoint only returns
  // id/interactionId/channel/status/reviewerUserId, never aggregate
  // findings/ratios, so it doesn't carry the broader-access concern §21
  // reserves for `findings`/`population`.
  if (action === 'statusForInteractions') {
    const user = await getAuthenticatedUser(req);
    if (!user || (!user.permissions.includes('qa.review') && !user.permissions.includes('qa.analytics.view'))) {
      res.status(user ? 403 : 401).json({ detail: user ? 'Missing required permission: qa.review or qa.analytics.view' : 'Authentication required' });
      return;
    }
    const access = toAgentAccess(user);
    const allAgents = access.allCategories || access.authorizedAgentIds === 'all';
    const authorizedAgentIds = allAgents ? [] : access.authorizedAgentIds;
    const { data, error } = await supabase.rpc('call_center_qa_reviews_population', {
      p_authorized_agent_ids: authorizedAgentIds, p_all_agents: allAgents,
      p_channel: null, p_date_from: null, p_date_to: null, p_reviewer_user_id: null,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    const rows = (toCamelCaseDeep(data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id, interactionId: r.interactionId, channel: r.channel, status: r.status, reviewerUserId: r.reviewerUserId,
    }));
    res.status(200).json({ data: rows });
    return;
  }

  // §21 — aggregate/trend/reason-distribution data is gated on
  // qa.analytics.view, a materially broader capability than conducting
  // one review (qa.review), per the brief's explicit instruction not to
  // grant broad analytical access merely because a user can submit a
  // review.
  if (action === 'findings' || action === 'population') {
    const user = await requirePermission(req, res, 'qa.analytics.view');
    if (!user) return;
    const access = toAgentAccess(user);
    const allAgents = access.allCategories || access.authorizedAgentIds === 'all';
    const authorizedAgentIds = allAgents ? [] : access.authorizedAgentIds;
    const channel = queryStr(req, 'channel');
    const dateFrom = queryStr(req, 'dateFrom');
    const dateTo = queryStr(req, 'dateTo');
    const reviewerUserId = queryStr(req, 'reviewerUserId');
    // Session 7.1 — dataset mode. Omitted/absent -> NORMAL (RPC default
    // null -> dataset_id is null). A real label (e.g. 'CMA_POC_500_V1')
    // -> TEST mode, only rows tagged with that exact dataset_id. Never
    // both at once — see 20261113000000_cma_dataset_isolation.sql.
    const datasetId = queryStr(req, 'datasetId');
    if (channel && channel !== 'voice' && channel !== 'chat') { res.status(422).json({ detail: 'channel must be "voice" or "chat"' }); return; }

    if (action === 'findings') {
      const { data, error } = await supabase.rpc('call_center_qa_findings_list', {
        p_authorized_agent_ids: authorizedAgentIds, p_all_agents: allAgents,
        p_channel: channel ?? null, p_date_from: dateFrom ?? null, p_date_to: dateTo ?? null, p_reviewer_user_id: reviewerUserId ?? null,
        p_dataset_id: datasetId ?? null,
      });
      if (error) { res.status(500).json({ detail: error.message }); return; }
      res.status(200).json({ data: toCamelCaseDeep(data) });
      return;
    }

    const { data, error } = await supabase.rpc('call_center_qa_reviews_population', {
      p_authorized_agent_ids: authorizedAgentIds, p_all_agents: allAgents,
      p_channel: channel ?? null, p_date_from: dateFrom ?? null, p_date_to: dateTo ?? null, p_reviewer_user_id: reviewerUserId ?? null,
      p_dataset_id: datasetId ?? null,
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

/**
 * Session 16.3 — Automated Qualitative Analysis. Independent of Human QA
 * by construction (brief §5): this handler never reads qa_reviews/
 * qa_findings, never receives them from the client, and the LLM prompt
 * (automatedQaPrompt.ts) is built from the raw transcript alone.
 *
 * `qa.automated.run` and `qa.automated.view` are deliberately separate
 * from `qa.review`/`qa.analytics.view` (brief §19 — do not automatically
 * grant automated-result access to every Human QA reviewer).
 */
function toCamelAutomatedQa<T>(value: T): T {
  return toCamelCaseDeep(value);
}

async function handleAutomatedQaGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = queryStr(req, 'action');
  const supabase = getServiceRoleClient();

  if (action === 'get') {
    const user = await requirePermission(req, res, 'qa.automated.view');
    if (!user) return;
    const evaluationId = queryStr(req, 'evaluationId');
    if (!evaluationId) { res.status(422).json({ detail: 'evaluationId is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_automated_qa_get', { p_evaluation_id: evaluationId });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    const evaluation = data ? (toCamelAutomatedQa(data) as { agentId?: string }) : null;
    if (!evaluation) { res.status(404).json({ detail: 'Automated QA evaluation not found' }); return; }
    if (!isAgentIdInScope(toAgentAccess(user), evaluation.agentId)) { res.status(404).json({ detail: 'Automated QA evaluation not found' }); return; }
    res.status(200).json({ data: evaluation });
    return;
  }

  if (action === 'listForInteraction') {
    const user = await requirePermission(req, res, 'qa.automated.view');
    if (!user) return;
    const interactionId = queryStr(req, 'interactionId');
    const channel = queryStr(req, 'channel');
    if (!interactionId || (channel !== 'voice' && channel !== 'chat')) {
      res.status(422).json({ detail: 'interactionId and channel ("voice"|"chat") are required' });
      return;
    }
    const { data, error } = await supabase.rpc('call_center_automated_qa_list_for_interaction', {
      p_interaction_id: interactionId, p_channel: channel,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    const access = toAgentAccess(user);
    const rows = (toCamelAutomatedQa(data ?? []) as Array<{ agentId: string }>).filter((r) => isAgentIdInScope(access, r.agentId));
    res.status(200).json({ data: rows });
    return;
  }

  if (action === 'list') {
    const user = await requirePermission(req, res, 'qa.automated.view');
    if (!user) return;
    const access = toAgentAccess(user);
    const allAgents = access.allCategories || access.authorizedAgentIds === 'all';
    const authorizedAgentIds = allAgents ? [] : access.authorizedAgentIds;
    const status = queryStr(req, 'status') ?? null;
    const { data, error } = await supabase.rpc('call_center_automated_qa_list', {
      p_authorized_agent_ids: authorizedAgentIds, p_all_agents: allAgents, p_status: status,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data: toCamelAutomatedQa(data) });
    return;
  }

  // Session 16.4.4.1 — read-only LLM attempt diagnostics (brief §3). A
  // narrower permission than `qa.automated.view` on purpose (brief §2):
  // holding `automated_qa.diagnostics.view` is necessary but not
  // sufficient — the caller must ALSO be in-scope for the underlying
  // evaluation's agent (the same `call_center_automated_qa_get` +
  // isAgentIdInScope check the `get` action above already uses), so a
  // diagnostics-only grant can never be used to read an evaluation
  // outside the caller's own Business Data Scope. The attempts
  // themselves are still read via the EXISTING Session 16.4.4
  // service_role-only RPC (`call_center_automated_qa_attempts_list`) —
  // no new RPC, no broadened grant on it, no new Vercel function (this
  // is one more branch on the existing `resource=automatedQa`
  // dispatcher). Every access is audited (brief §2's "record diagnostic-
  // access events"), with only ids/counts in the audit metadata — never
  // the raw response text itself (brief §3's "do not expose raw
  // responses in application logs" extends, by the same reasoning, to
  // never writing it into the audit trail either).
  if (action === 'diagnostics') {
    const user = await requirePermission(req, res, 'automated_qa.diagnostics.view');
    if (!user) return;
    const evaluationId = queryStr(req, 'evaluationId');
    if (!evaluationId) { res.status(422).json({ detail: 'evaluationId is required' }); return; }

    const { data: evalData, error: evalError } = await supabase.rpc('call_center_automated_qa_get', { p_evaluation_id: evaluationId });
    if (evalError) { res.status(500).json({ detail: evalError.message }); return; }
    const evaluation = evalData ? (toCamelAutomatedQa(evalData) as { agentId?: string }) : null;
    if (!evaluation || !isAgentIdInScope(toAgentAccess(user), evaluation.agentId)) {
      res.status(404).json({ detail: 'Automated QA evaluation not found' });
      return;
    }

    const { data, error } = await supabase.rpc('call_center_automated_qa_attempts_list', { p_evaluation_id: evaluationId });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    // toCamelAttemptDiagnosticRow (not the generic recursive
    // toCamelCaseDeep) — validation_detail's nested object keys are
    // sometimes real stored data (a QA parameter code), not schema field
    // names; see that function's own comment for the exact bug this
    // avoids.
    const attempts = (data ?? []).map((row: Record<string, unknown>) => toCamelAttemptDiagnosticRow(row)) as Array<{ id: string }>;

    await recordAuditEvent({
      actorType: 'user', actorUserId: user.id, action: 'automated_qa.diagnostics.viewed',
      resourceType: 'automated_qa_evaluation', resourceId: evaluationId, result: 'success',
      metadata: { attemptCount: attempts.length }, source: 'api/admin',
    });

    // Brief §3 — "prevent caching of sensitive diagnostic responses in
    // shared or persistent caches". This response can carry raw
    // customer-conversation-derived LLM output; it must never be cached
    // by a shared proxy/CDN layer or reused across requests.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ data: attempts });
    return;
  }

  res.status(400).json({ detail: `Unknown action: ${action}` });
}

/**
 * Session 16.4.4 — persists this run's per-attempt diagnostics
 * (automatedQaAttemptDiagnostics.ts) via the new, separate
 * call_center_automated_qa_attempts_record RPC. Never allowed to affect
 * the evaluation's own terminal status/response (brief §6) —
 * persistAttemptDiagnosticsSafely is provably unable to throw, so a
 * diagnostic-write failure (e.g. the migration hasn't been applied yet)
 * degrades to a logged no-op, not a 500.
 */
async function persistAutomatedQaAttempts(
  supabase: ReturnType<typeof getServiceRoleClient>,
  evaluationId: string,
  attempts: unknown[],
  now: string,
): Promise<void> {
  await persistAttemptDiagnosticsSafely(
    async (evalId, atts, p_now) => {
      const { error } = await supabase.rpc('call_center_automated_qa_attempts_record', {
        p_evaluation_id: evalId, p_attempts: atts, p_now,
      });
      return { error };
    },
    evaluationId, attempts, now,
  );
}

async function handleAutomatedQaPost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'qa.automated.run');
  if (!user) return;
  const action = queryStr(req, 'action');
  if (action !== 'start') { res.status(400).json({ detail: `Unknown action: ${action}` }); return; }

  const { interactionId, channel, agentId } = (req.body ?? {}) as { interactionId?: string; channel?: string; agentId?: string };
  if (typeof interactionId !== 'string' || (channel !== 'voice' && channel !== 'chat') || typeof agentId !== 'string') {
    res.status(422).json({ detail: 'interactionId, channel ("voice"|"chat"), and agentId are required' });
    return;
  }
  if (!isAgentIdInScope(toAgentAccess(user), agentId)) {
    res.status(404).json({ detail: 'Interaction not found' });
    return;
  }

  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  // Independence boundary: the transcript is fetched fresh from the
  // upstream source here, server-side — never supplied by the client,
  // never touching qa_reviews/qa_findings (brief §5).
  let turns;
  try {
    turns = await fetchQaTurnsForInteraction(interactionId, channel);
  } catch (err) {
    res.status(502).json({ detail: `Transcript fetch failed: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  if (turns.length === 0) {
    res.status(422).json({ detail: 'This interaction has no transcript to evaluate.' });
    return;
  }

  const transcriptHash = crypto.createHash('sha256').update(JSON.stringify(turns)).digest('hex');

  const { data: createdRaw, error: createError } = await supabase.rpc('call_center_automated_qa_create', {
    p_interaction_id: interactionId, p_channel: channel, p_agent_id: agentId, p_upstream_sid: null,
    p_initiated_by: user.id, p_prompt_version: PROMPT_VERSION, p_contract_version: AUTOMATED_QA_CONTRACT_VERSION,
    p_schema_version: AUTOMATED_QA_SCHEMA_VERSION, p_transcript_snapshot: turns, p_transcript_hash: transcriptHash, p_now: now,
  });
  if (createError) { res.status(500).json({ detail: createError.message }); return; }
  const created = toCamelAutomatedQa(createdRaw) as { id: string; alreadyInFlight: boolean };

  if (created.alreadyInFlight) {
    // Idempotent — a concurrent/duplicate request returns the already
    // in-flight evaluation rather than starting a second one (brief
    // §13/§20).
    res.status(200).json({ data: created });
    return;
  }

  await supabase.rpc('call_center_automated_qa_set_running', { p_evaluation_id: created.id, p_now: now });
  await recordAuditEvent({
    actorType: 'user', actorUserId: user.id, action: 'automated_qa.started',
    resourceType: 'automated_qa_evaluation', resourceId: created.id, result: 'success',
    metadata: { interactionId, channel, agentId, turnCount: turns.length }, source: 'api/admin',
  });

  // Hobby-plan serverless timeout is the practical ceiling here (see
  // vercel.json's functions.maxDuration for this route) — this is a
  // development/integration-test deployment per the brief's own §0
  // framing, and the Generic Local LLM's documented sample latency is
  // two orders of magnitude below that ceiling, so running synchronously
  // within the initiating request (rather than building a durable
  // cron-polled job queue this project has no other precedent for) is
  // the scale-appropriate choice. A genuinely slow/stuck inference fails
  // closed as FAILED — retryable by starting a new evaluation — rather
  // than hanging indefinitely.
  let result;
  try {
    result = await evaluateInteraction(turns);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.rpc('call_center_automated_qa_fail', {
      p_evaluation_id: created.id, p_error_code: 'internal_error', p_error_message: message, p_request_ids: [], p_now: new Date().toISOString(),
    });
    await recordAuditEvent({
      actorType: 'user', actorUserId: user.id, action: 'automated_qa.failed',
      resourceType: 'automated_qa_evaluation', resourceId: created.id, result: 'error',
      metadata: { errorMessage: message }, source: 'api/admin',
    });
    res.status(502).json({ detail: `Automated QA evaluation failed: ${message}` });
    return;
  }

  const finishedAt = new Date().toISOString();
  if (result.status === 'failed') {
    // Session 16.3.8 (follow-up) — a failed evaluation still carries real
    // diagnostics (model id, turn coverage, token usage, latency) from
    // whichever windows actually ran before the failure; persist them so
    // the Inspector never shows "Model id: —" / "0/0 turns" for data the
    // evaluator already had.
    const { data, error } = await supabase.rpc('call_center_automated_qa_fail', {
      p_evaluation_id: created.id, p_error_code: result.errorCode, p_error_message: result.errorMessage,
      p_request_ids: result.requestIds, p_now: finishedAt,
      p_model_id: result.modelId, p_evaluated_turn_ids: result.evaluatedTurnIds, p_uncovered_turn_ids: result.uncoveredTurnIds,
      p_evaluation_completeness: result.evaluationCompleteness, p_window_count: result.windowCount,
      p_token_usage: result.tokenUsage, p_latency_ms: result.latencyMs,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    await persistAutomatedQaAttempts(supabase, created.id, result.attempts, finishedAt);
    await recordAuditEvent({
      actorType: 'user', actorUserId: user.id, action: 'automated_qa.failed',
      resourceType: 'automated_qa_evaluation', resourceId: created.id, result: 'error',
      metadata: { errorCode: result.errorCode, errorMessage: result.errorMessage }, source: 'api/admin',
    });
    res.status(200).json({ data: toCamelAutomatedQa(data) });
    return;
  }

  const { data, error } = await supabase.rpc('call_center_automated_qa_complete', {
    p_evaluation_id: created.id,
    p_status: result.status,
    p_model_id: result.modelId,
    p_request_ids: result.requestIds,
    p_evaluated_turn_ids: result.evaluatedTurnIds,
    p_uncovered_turn_ids: result.uncoveredTurnIds,
    p_unassessable_parameters: result.unassessableParameters.map((u) => ({ parameter_code: u.parameterCode, reason: u.reason })),
    p_evaluation_completeness: result.evaluationCompleteness,
    p_window_count: result.windowCount,
    p_token_usage: result.tokenUsage,
    p_latency_ms: result.latencyMs,
    p_observations: result.observations.map((o) => ({
      parameterCode: o.parameterCode, value: o.value, primaryTurnId: o.primaryTurnId,
      evidenceTurnIds: o.evidenceTurnIds, reasonCode: o.reasonCode, explanation: o.explanation,
    })),
    p_now: finishedAt,
  });
  if (error) { res.status(500).json({ detail: error.message }); return; }
  await persistAutomatedQaAttempts(supabase, created.id, result.attempts, finishedAt);

  await recordAuditEvent({
    actorType: 'user', actorUserId: user.id, action: `automated_qa.${result.status}`,
    resourceType: 'automated_qa_evaluation', resourceId: created.id, result: 'success',
    metadata: {
      interactionId, channel, agentId, observationCount: result.observations.length,
      windowCount: result.windowCount, evaluationCompleteness: result.evaluationCompleteness,
    },
    source: 'api/admin',
  });

  res.status(200).json({ data: toCamelAutomatedQa(data) });
}

/**
 * Session 16.5 — Corrective Action Management (CAM). Same 12-function-
 * ceiling reason every other resource lives here instead of its own
 * route file. The CA domain is deliberately source-independent — this
 * handler has ZERO QA-specific knowledge (no evaluationId/reviewId
 * parsing, no parameter-code validation); a QA-originated CA arrives
 * here as an already-normalized `{title, description, sourceType,
 * sourceReferenceId, sourceContext, ...}` payload built by the QA
 * adapter in src/services/correctiveActions, exactly like a manually
 * created CA. Ownership gate mirrors Session 15's action_items exactly
 * (`corrective_actions.assign` = manage-any, re-validated inside every
 * RPC, never trusted blindly from this route).
 *
 *   GET  /api/admin?resource=correctiveActions[&status=&priority=&category=&sourceType=&assignedTo=&agentId=&groupId=&search=&limit=&offset=]
 *   GET  /api/admin?resource=correctiveActions&action=get&id=...
 *   GET  /api/admin?resource=correctiveActions&action=candidates&excludeId=&agentId=&category=&parameterCode=
 *   GET  /api/admin?resource=correctiveActions&action=eligiblePeople&id=...
 *   GET  /api/admin?resource=correctiveActions&action=activity&id=...        (CA activity history)
 *   GET  /api/admin?resource=correctiveActions&action=groupActivity&groupId=... (group activity history)
 *   GET  /api/admin?resource=correctiveActions&action=group&id=...
 *   GET  /api/admin?resource=correctiveActions&action=groups[&status=]
 *   GET  /api/admin?resource=correctiveActions&action=groupMembers&groupId=...
 *   POST /api/admin?resource=correctiveActions&action=create          body {title, description, category, priority?, agentId?, sourceType?, sourceReferenceId?, sourceContext?, dueAt?, assignedTo?, idempotencyKey?}
 *   POST /api/admin?resource=correctiveActions&action=update          body {id, title?, description?, category?, priority?, dueAt?}
 *   POST /api/admin?resource=correctiveActions&action=assign          body {id, assigneeUserId}
 *   POST /api/admin?resource=correctiveActions&action=assignVerifier  body {id, verifierUserId}
 *   POST /api/admin?resource=correctiveActions&action=takeOwnership   body {id}
 *   POST /api/admin?resource=correctiveActions&action=setStatus       body {id, status, reason?}
 *   POST /api/admin?resource=correctiveActions&action=recordCorrection body {id, resolutionSummary}
 *   POST /api/admin?resource=correctiveActions&action=verify          body {id, result, testDescription?, evidenceRef?, notes?}
 *   POST /api/admin?resource=correctiveActions&action=bulkVerify      body {ids[], result, testDescription?, evidenceRef?, notes?, groupId?}
 *   POST /api/admin?resource=correctiveActions&action=groupCreate     body {title, description?}
 *   POST /api/admin?resource=correctiveActions&action=groupUpdate     body {id, title?, description?, rootCause?, proposedCorrection?, implementedCorrection?, assignedInvestigator?, assignedFixer?, assignedVerifier?, status?}
 *   POST /api/admin?resource=correctiveActions&action=groupLink       body {groupId, caIds[]}
 *   POST /api/admin?resource=correctiveActions&action=groupUnlink     body {groupId, caId}
 */
export function toCorrectiveActionScopeArgs(access: ReturnType<typeof toAgentAccess>): { allAgents: boolean; authorizedAgentIds: string[] } {
  const allAgents = access.allCategories || access.authorizedAgentIds === 'all';
  return { allAgents, authorizedAgentIds: allAgents ? [] : (access.authorizedAgentIds as string[]) };
}

/**
 * Maps the RPCs' `raise exception '<code>'` messages to the right HTTP
 * status, same convention as mapActionItemError/mapQaError above.
 */
export function mapCorrectiveActionError(message: string): number {
  if (/corrective_action_not_found|corrective_action_group_not_found|not_a_member_of_group/.test(message)) return 404;
  if (/assignment_not_permitted|ownership_required/.test(message)) return 403;
  if (
    /assignee_inactive_or_not_found|assignee_out_of_scope|agent_out_of_scope|invalid_status_transition|invalid_role|invalid_verification_result|title_and_description_required|title_required|cancellation_reason_required|administrative_closure_reason_required|resolution_summary_required|not_eligible_for_verification|cross_tenant_link_rejected|already_in_another_group/.test(message)
  ) return 422;
  return 500;
}

async function handleCorrectiveActionsGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = queryStr(req, 'action');
  const user = await requirePermission(req, res, 'corrective_actions.view');
  if (!user) return;
  const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
  const supabase = getServiceRoleClient();

  if (action === 'get') {
    const id = queryStr(req, 'id');
    if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_corrective_actions_get', {
      p_id: id, p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    if (!data) { res.status(404).json({ detail: 'Corrective action not found' }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'candidates') {
    const { data, error } = await supabase.rpc('call_center_corrective_actions_candidates', {
      p_exclude_id: queryStr(req, 'excludeId') ?? null,
      p_agent_id: queryStr(req, 'agentId') ?? null,
      p_category: queryStr(req, 'category') ?? null,
      p_parameter_code: queryStr(req, 'parameterCode') ?? null,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
      p_limit: 20,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'eligiblePeople') {
    const id = queryStr(req, 'id');
    if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_corrective_actions_eligible_people', { p_id: id });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'activity') {
    const id = queryStr(req, 'id');
    if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_corrective_actions_activity', { p_corrective_action_id: id, p_group_id: null });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'groupActivity') {
    const groupId = queryStr(req, 'groupId');
    if (!groupId) { res.status(422).json({ detail: 'groupId is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_corrective_actions_activity', { p_corrective_action_id: null, p_group_id: groupId });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'group') {
    const id = queryStr(req, 'id');
    if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_corrective_action_groups_get', { p_id: id });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    if (!data) { res.status(404).json({ detail: 'Corrective action group not found' }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'groups') {
    const { data, error } = await supabase.rpc('call_center_corrective_action_groups_list', {
      p_status: queryStr(req, 'status') ?? null, p_limit: 100, p_offset: 0,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'groupMembers') {
    const groupId = queryStr(req, 'groupId');
    if (!groupId) { res.status(422).json({ detail: 'groupId is required' }); return; }
    const { data, error } = await supabase.rpc('call_center_corrective_action_groups_members', {
      p_group_id: groupId, p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(500).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  // Default: scoped, filtered list.
  const { data, error } = await supabase.rpc('call_center_corrective_actions_list', {
    p_status: queryStr(req, 'status') ?? null,
    p_priority: queryStr(req, 'priority') ?? null,
    p_category: queryStr(req, 'category') ?? null,
    p_source_type: queryStr(req, 'sourceType') ?? null,
    p_assigned_to: queryStr(req, 'assignedTo') ?? null,
    p_agent_id: queryStr(req, 'agentId') ?? null,
    p_group_id: queryStr(req, 'groupId') ?? null,
    p_search: queryStr(req, 'search') ?? null,
    p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    p_limit: 200, p_offset: 0,
  });
  if (error) { res.status(500).json({ detail: error.message }); return; }
  res.status(200).json({ data });
}

async function handleCorrectiveActionsPost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = queryStr(req, 'action');

  if (action === 'create') {
    const user = await requirePermission(req, res, 'corrective_actions.create');
    if (!user) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_actions_create', {
      p_input: {
        title: body.title, description: body.description, category: body.category, priority: body.priority,
        agentId: body.agentId, sourceType: body.sourceType, sourceReferenceId: body.sourceReferenceId,
        sourceContext: body.sourceContext, dueAt: body.dueAt, assignedTo: body.assignedTo,
      },
      p_actor_user_id: user.id,
      p_idempotency_key: typeof body.idempotencyKey === 'string' && body.idempotencyKey ? body.idempotencyKey : null,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'groupCreate') {
    const user = await requirePermission(req, res, 'corrective_actions.link');
    if (!user) return;
    const { title, description } = (req.body ?? {}) as { title?: string; description?: string };
    if (typeof title !== 'string') { res.status(422).json({ detail: 'title is required' }); return; }
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_action_groups_create', {
      p_title: title, p_description: description ?? null, p_actor_user_id: user.id,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'groupUpdate') {
    const user = await requirePermission(req, res, 'corrective_actions.link');
    if (!user) return;
    const body = (req.body ?? {}) as Record<string, unknown> & { id?: string };
    if (typeof body.id !== 'string') { res.status(422).json({ detail: 'id is required' }); return; }
    const supabase = getServiceRoleClient();
    const actorHasManageAny = user.permissions.includes('corrective_actions.assign');
    const { id, ...patch } = body;
    const { data, error } = await supabase.rpc('call_center_corrective_action_groups_update', {
      p_id: id, p_patch: patch, p_actor_user_id: user.id, p_actor_has_manage_any: actorHasManageAny,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'groupLink') {
    const user = await requirePermission(req, res, 'corrective_actions.link');
    if (!user) return;
    const { groupId, caIds } = (req.body ?? {}) as { groupId?: string; caIds?: string[] };
    if (typeof groupId !== 'string' || !Array.isArray(caIds)) { res.status(422).json({ detail: 'groupId and caIds[] are required' }); return; }
    const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_action_groups_link', {
      p_group_id: groupId, p_ca_ids: caIds, p_actor_user_id: user.id,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'groupUnlink') {
    const user = await requirePermission(req, res, 'corrective_actions.link');
    if (!user) return;
    const { groupId, caId } = (req.body ?? {}) as { groupId?: string; caId?: string };
    if (typeof groupId !== 'string' || typeof caId !== 'string') { res.status(422).json({ detail: 'groupId and caId are required' }); return; }
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_action_groups_unlink', {
      p_group_id: groupId, p_ca_id: caId, p_actor_user_id: user.id,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  // Everything below requires at minimum `.edit` (update) or the
  // specific lifecycle permission checked per-action; ownership itself
  // is re-enforced inside the RPC regardless of what this route decides.
  if (action === 'update') {
    const user = await requirePermission(req, res, 'corrective_actions.edit');
    if (!user) return;
    const body = (req.body ?? {}) as Record<string, unknown> & { id?: string };
    if (typeof body.id !== 'string') { res.status(422).json({ detail: 'id is required' }); return; }
    const actorHasManageAny = user.permissions.includes('corrective_actions.assign');
    const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
    const supabase = getServiceRoleClient();
    const { id, ...patch } = body;
    const { data, error } = await supabase.rpc('call_center_corrective_actions_update', {
      p_id: id, p_patch: patch, p_actor_user_id: user.id, p_actor_has_manage_any: actorHasManageAny,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'assign' || action === 'takeOwnership' || action === 'assignVerifier') {
    const user = await requirePermission(req, res, action === 'assignVerifier' ? 'corrective_actions.verify' : 'corrective_actions.resolve');
    if (!user) return;
    const body = (req.body ?? {}) as { id?: string; assigneeUserId?: string; verifierUserId?: string };
    const id = body.id;
    const role = action === 'assignVerifier' ? 'verifier' : 'assignee';
    const personUserId = action === 'takeOwnership' ? user.id : action === 'assignVerifier' ? body.verifierUserId : body.assigneeUserId;
    if (typeof id !== 'string' || typeof personUserId !== 'string') {
      res.status(422).json({ detail: 'id (and assigneeUserId/verifierUserId) are required' });
      return;
    }
    const actorHasManageAny = user.permissions.includes('corrective_actions.assign');
    const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_actions_assign', {
      p_id: id, p_role: role, p_person_user_id: personUserId, p_actor_user_id: user.id, p_actor_has_manage_any: actorHasManageAny,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'setStatus') {
    const { id, status } = (req.body ?? {}) as { id?: string; status?: string; reason?: string };
    const reason = (req.body ?? {}) as { reason?: string };
    if (typeof id !== 'string' || typeof status !== 'string') { res.status(422).json({ detail: 'id and status are required' }); return; }
    const permission = status === 'cancelled' || status === 'reopened' ? 'corrective_actions.reopen_cancel'
      : status === 'closed' ? 'corrective_actions.verify' : 'corrective_actions.resolve';
    const user = await requirePermission(req, res, permission);
    if (!user) return;
    const actorHasManageAny = user.permissions.includes('corrective_actions.assign');
    const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_actions_set_status', {
      p_id: id, p_status: status, p_actor_user_id: user.id, p_actor_has_manage_any: actorHasManageAny, p_reason: reason.reason ?? null,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'recordCorrection') {
    const user = await requirePermission(req, res, 'corrective_actions.resolve');
    if (!user) return;
    const { id, resolutionSummary } = (req.body ?? {}) as { id?: string; resolutionSummary?: string };
    if (typeof id !== 'string' || typeof resolutionSummary !== 'string') { res.status(422).json({ detail: 'id and resolutionSummary are required' }); return; }
    const actorHasManageAny = user.permissions.includes('corrective_actions.assign');
    const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_actions_record_correction', {
      p_id: id, p_resolution_summary: resolutionSummary, p_actor_user_id: user.id, p_actor_has_manage_any: actorHasManageAny,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'verify') {
    const user = await requirePermission(req, res, 'corrective_actions.verify');
    if (!user) return;
    const { id, result, testDescription, evidenceRef, notes } = (req.body ?? {}) as {
      id?: string; result?: string; testDescription?: string; evidenceRef?: string; notes?: string;
    };
    if (typeof id !== 'string' || typeof result !== 'string') { res.status(422).json({ detail: 'id and result are required' }); return; }
    const actorHasManageAny = user.permissions.includes('corrective_actions.assign');
    const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_actions_record_verification', {
      p_id: id, p_result: result, p_test_description: testDescription ?? null, p_evidence_ref: evidenceRef ?? null, p_notes: notes ?? null,
      p_actor_user_id: user.id, p_actor_has_manage_any: actorHasManageAny,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  if (action === 'bulkVerify') {
    const user = await requirePermission(req, res, 'corrective_actions.verify');
    if (!user) return;
    const { ids, result, testDescription, evidenceRef, notes, groupId } = (req.body ?? {}) as {
      ids?: string[]; result?: string; testDescription?: string; evidenceRef?: string; notes?: string; groupId?: string;
    };
    if (!Array.isArray(ids) || ids.length === 0 || typeof result !== 'string') {
      res.status(422).json({ detail: 'ids[] and result are required' });
      return;
    }
    const actorHasManageAny = user.permissions.includes('corrective_actions.assign');
    const { allAgents, authorizedAgentIds } = toCorrectiveActionScopeArgs(toAgentAccess(user));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('call_center_corrective_actions_bulk_verify', {
      p_ids: ids, p_result: result, p_test_description: testDescription ?? null, p_evidence_ref: evidenceRef ?? null, p_notes: notes ?? null,
      p_actor_user_id: user.id, p_actor_has_manage_any: actorHasManageAny, p_group_id: groupId ?? null,
      p_all_agents: allAgents, p_authorized_agent_ids: authorizedAgentIds,
    });
    if (error) { res.status(mapCorrectiveActionError(error.message)).json({ detail: error.message }); return; }
    res.status(200).json({ data });
    return;
  }

  res.status(400).json({ detail: `Unknown action: ${action}` });
}

/**
 * CMA Synchronization — Manual UI Control. Replaces the originally-
 * planned Vercel Cron polling (CMA-1B.3 Step 5), abandoned because this
 * team's confirmed Hobby plan only supports daily cron — too coarse for
 * CMA freshness. Gated by the real session-based RBAC (`cma.sync.manage`),
 * NOT the separate `requireAdminToken` shared-secret mechanism the other
 * CMA actions (`api/customers/admin.ts`) use — that secret must never be
 * embedded in client code, so a browser-facing control cannot use it.
 *
 *   GET  /api/admin?resource=cmaSync                 — { latest, history } (last 10 runs)
 *   POST /api/admin?resource=cmaSync&action=start     body { lookbackHours?: number }
 */
async function handleCmaSyncGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'cma.sync.manage');
  if (!user) return;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('call_center_cma_sync_runs_list', { p_limit: 10 });
  if (error) { res.status(500).json({ detail: error.message }); return; }
  const history = (data as unknown[]) ?? [];
  res.status(200).json({ data: { latest: history[0] ?? null, history } });
}

async function handleCmaSyncPost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = queryStr(req, 'action');
  if (action !== 'start') {
    res.status(400).json({ detail: 'Unknown or missing ?action= — use start' });
    return;
  }
  const user = await requirePermission(req, res, 'cma.sync.manage');
  if (!user) return;
  const { lookbackHours } = (req.body ?? {}) as { lookbackHours?: number };
  const supabase = getServiceRoleClient();
  const outcome = await runManualCmaSync(supabase, user.id, lookbackHours ?? null);
  res.status(200).json({ data: outcome });
}

/**
 * CMA-2 — Central Measures and Dimensions Registry read API. Exposes
 * governance DEFINITIONS only — never executes a calculation (CMA-3's
 * scope, untouched here). Gated by `cma.registry.view`, the same
 * session-based RBAC pattern as `cmaSync` above.
 *
 *   GET /api/admin?resource=cmaRegistry&action=canonicalMeasures
 *   GET /api/admin?resource=cmaRegistry&action=canonicalMeasure&id=CANON-...
 *   GET /api/admin?resource=cmaRegistry&action=occurrences&id=CANON-...
 *   GET /api/admin?resource=cmaRegistry&action=measure&id=FCR-03
 *   GET /api/admin?resource=cmaRegistry&action=dimensions
 *   GET /api/admin?resource=cmaRegistry&action=measureBaseFacts&id=FCR-03
 *   GET /api/admin?resource=cmaRegistry&action=charts
 *   GET /api/admin?resource=cmaRegistry&action=status (default)
 */
async function handleCmaRegistryGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'cma.registry.view');
  if (!user) return;
  const action = queryStr(req, 'action') ?? 'status';
  const id = queryStr(req, 'id');
  const supabase = getServiceRoleClient();
  try {
    if (action === 'canonicalMeasures') { res.status(200).json({ data: await listCanonicalMeasures(supabase) }); return; }
    if (action === 'canonicalMeasure') {
      if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
      res.status(200).json({ data: await getCanonicalMeasure(supabase, id) });
      return;
    }
    if (action === 'occurrences') {
      if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
      res.status(200).json({ data: await listCanonicalMeasureOccurrences(supabase, id) });
      return;
    }
    if (action === 'measure') {
      if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
      res.status(200).json({ data: await getMeasureOccurrence(supabase, id) });
      return;
    }
    if (action === 'dimensions') { res.status(200).json({ data: await listDimensions(supabase) }); return; }
    if (action === 'measureBaseFacts') {
      if (!id) { res.status(422).json({ detail: 'id is required' }); return; }
      res.status(200).json({ data: await listBaseFactsForMeasure(supabase, id) });
      return;
    }
    if (action === 'charts') { res.status(200).json({ data: await listChartVisualizations(supabase) }); return; }
    if (action === 'status') { res.status(200).json({ data: await getGovernanceStatus(supabase) }); return; }
    res.status(400).json({ detail: `Unknown ?action= — use canonicalMeasures, canonicalMeasure, occurrences, measure, dimensions, measureBaseFacts, charts, or status` });
  } catch (err) {
    res.status(500).json({ detail: err instanceof Error ? err.message : 'cmaRegistry lookup failed' });
  }
}

/**
 * CMA-3A — Central Calculation & Evaluation Engine. The ONLY API route
 * that ever calls evaluateCmaMeasure() — any future Dashboard/Analytics/
 * Reports consumer is expected to call this same route rather than
 * re-implementing calculation logic (brief §2). Gated by `cma.evaluate`,
 * the same minimal-first-grant pattern `cma.sync.manage`/`cma.registry.view`
 * used.
 *
 *   POST /api/admin?resource=cmaEvaluate
 *   body: {
 *     canonicalMeasureId: string,
 *     window: { from: string, to: string },      // ISO timestamps, half-open [from, to)
 *     filters?: { agent?: string, channel?: string, campaign?: string },
 *     groupBy?: 'agent' | 'channel',
 *   }
 */
async function handleCmaEvaluatePost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requirePermission(req, res, 'cma.evaluate');
  if (!user) return;

  const body = (req.body ?? {}) as {
    canonicalMeasureId?: string;
    window?: { from?: string; to?: string };
    filters?: Partial<Record<CmaDimensionId, string>>;
    groupBy?: CmaDimensionId;
    qaPopulation?: CmaQaPopulation;
    /** Session 7.1 — dataset mode; omitted/null = NORMAL. */
    datasetId?: string | null;
  };
  if (!body.canonicalMeasureId || typeof body.canonicalMeasureId !== 'string') {
    res.status(422).json({ detail: 'canonicalMeasureId is required' });
    return;
  }
  if (!body.window?.from || !body.window?.to) {
    res.status(422).json({ detail: 'window.from and window.to are required (ISO timestamps)' });
    return;
  }

  const access = toAgentAccess(user);
  // [Session 8] Resolved unconditionally for every cmaEvaluate call, same as `access` above —
  // zero behavior change for the 19 pre-existing measures (their algorithms never read it),
  // and lets the new 'customer' source family evaluate without a second route/branch.
  const categoryAccess = toCustomerAccess(user);
  const supabase = getServiceRoleClient();
  try {
    const result = await evaluateCmaMeasure(
      supabase,
      {
        canonicalMeasureId: body.canonicalMeasureId,
        window: { from: body.window.from, to: body.window.to },
        filters: body.filters,
        groupBy: body.groupBy,
        qaPopulation: body.qaPopulation,
        datasetId: body.datasetId ?? null,
      },
      { allCategories: access.allCategories, authorizedAgentIds: access.authorizedAgentIds },
      { allCategories: categoryAccess.allCategories, authorizedAgentIds: categoryAccess.authorizedAgentIds },
    );
    res.status(200).json({ data: result });
  } catch (err) {
    res.status(500).json({ detail: err instanceof Error ? err.message : 'cmaEvaluate failed' });
  }
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

  if (resource === 'automatedQa') {
    if (req.method === 'GET') { await handleAutomatedQaGet(req, res); return; }
    if (req.method === 'POST') { await handleAutomatedQaPost(req, res); return; }
    methodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (resource === 'correctiveActions') {
    if (req.method === 'GET') { await handleCorrectiveActionsGet(req, res); return; }
    if (req.method === 'POST') { await handleCorrectiveActionsPost(req, res); return; }
    methodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (resource === 'cmaSync') {
    if (req.method === 'GET') { await handleCmaSyncGet(req, res); return; }
    if (req.method === 'POST') { await handleCmaSyncPost(req, res); return; }
    methodNotAllowed(res, ['GET', 'POST']);
    return;
  }

  if (resource === 'cmaRegistry') {
    if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }
    await handleCmaRegistryGet(req, res);
    return;
  }

  if (resource === 'cmaEvaluate') {
    if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }
    await handleCmaEvaluatePost(req, res);
    return;
  }

  res.status(400).json({ detail: 'Unknown or missing ?resource= — use me, users, roles, permissions, audit, actions, qa, automatedQa, correctiveActions, cmaSync, cmaRegistry, or cmaEvaluate' });
});
