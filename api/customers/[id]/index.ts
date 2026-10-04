import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, withErrorBoundary, noStore, readIntQuery } from '../../_customer360.js';
import { refreshExistingCustomer } from '../../../src/server/customer360/aggregationService.js';
import {
  buildAuthorizedCustomerView,
  listAuthorizedInteractions,
  type AuthorizedAccess,
} from '../../../src/server/customer360/authorizationService.js';
import { supabaseCampaignRepository } from '../../../src/server/campaigns/supabaseCampaignRepository.js';
import { supabaseActivityRepository } from '../../../src/server/customer360/supabaseActivityRepository.js';
import type { ActivityStatus, ActivityType } from '../../../src/server/customer360/activityRepository.js';
import { requirePermission, recordAuditEvent, resolveAccessForAuthenticatedUser, toCustomerAccess } from '../../_auth.js';

/**
 * Session 14.3 — closes the direct-ID bypass this route previously had:
 * customer identity (handleGetView) and activity create/update were
 * gated only by "does this customer id exist", never by data scope. A
 * customer is now "visible" to a scoped caller only if they have ≥1
 * interaction the caller's Customer Category Scope authorizes — the
 * same existence-style check api/customers/index.ts's phone-search
 * branch already used for exactly this reason. 404 (not 403), matching
 * the existing api/campaigns.ts convention of not revealing a resource's
 * existence to a caller outside its scope.
 */
async function isCustomerVisible(customerId: string, access: AuthorizedAccess): Promise<boolean> {
  if (access.allCategories) return true;
  const { totalCount } = await repo.listInteractions(customerId, { page: 1, pageSize: 1, authorizedAgentIds: access.authorizedAgentIds });
  return totalCount > 0;
}

/**
 * GET /api/customers/{id}                       — authorized Customer 360 view (plan §4, §11, §12, §15)
 * GET /api/customers/{id}?action=interactions    — authorized, paginated interaction timeline (plan §10/§15)
 * GET /api/customers/{id}?action=campaigns       — authorized campaign-participation rows (Session 11.5A workstream B)
 * GET /api/customers/{id}?action=activities      — customer activity/diary feed (Session 11.5A workstream D)
 * POST /api/customers/{id}?action=activities     — create a customer activity (Session 11.5A workstream D)
 * POST /api/customers/{id}?action=refresh        — explicit forced refresh (plan §15)
 *
 * Session 5 consolidation (docs/CALL_CENTRE_SESSION5_CAMPAIGNS_PLAN.md §21/§23):
 * originally three separate route files (index.ts, interactions.ts,
 * refresh.ts). Merged into this one file, dispatched by `?action=`, to
 * free two Vercel function slots for api/campaigns.ts — the identical,
 * already-proven pattern used for api/customers/admin.ts (Session 4) and
 * api/chat/logs.ts (Session 4.5). No behavior changed: same three
 * operations, same authorization/refresh logic, same response shapes.
 */

async function handleGetView(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string;
  const access = await resolveAccessForAuthenticatedUser(req, 'customer');

  if (!(await isCustomerVisible(id, access))) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  let refresh: { attempted: boolean; failed: boolean; insertedCount: number; error?: string } = {
    attempted: true,
    failed: false,
    insertedCount: 0,
  };
  try {
    const result = await refreshExistingCustomer(repo, source, id);
    if (result.status === 'not_found') {
      res.status(404).json({ detail: 'Customer not found' });
      return;
    }
    refresh.insertedCount = result.insertedCount;
  } catch (err) {
    refresh = { attempted: true, failed: true, insertedCount: 0, error: err instanceof Error ? err.message : 'Refresh failed' };
  }

  const customer = await repo.getCustomer(id);
  if (!customer) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const view = await buildAuthorizedCustomerView(repo, customer, access);
  res.status(200).json({ ...view, refresh });
}

async function handleInteractions(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string;
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);

  const access = await resolveAccessForAuthenticatedUser(req, 'customer');
  const { rows, totalCount } = await listAuthorizedInteractions(repo, id, access, page, pageSize);

  res.status(200).json({ data: rows, pagination: { page, pageSize, totalCount } });
}

/**
 * Session 11.5A workstream B. Applies the SAME authorizedAgentIds
 * discipline used everywhere else in this file — here against the
 * campaign's own configured agent (campaignAgentId), the established
 * precedent from 20261003000000_campaigns_authorization_support.sql
 * ("campaign.agent_id plays the same role agent_id already plays for
 * calls/chats"). Campaign rows must never become a side-channel to
 * restricted interactions (design doc §10).
 */
async function handleCampaigns(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string;
  const access = await resolveAccessForAuthenticatedUser(req, 'customer');

  if (!(await isCustomerVisible(id, access))) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }
  const customer = await repo.getCustomer(id);
  if (!customer) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const rows = await supabaseCampaignRepository.listCustomerTargets(id);
  const authorized =
    access.authorizedAgentIds === 'all'
      ? rows
      : rows.filter((row) => (access.authorizedAgentIds as string[]).includes(row.campaignAgentId));

  res.status(200).json({ data: authorized });
}

/**
 * Session 11.5A workstream D. `activeInstructionsOnly=true` narrows to
 * the Active Instructions surface (design doc §4.2/§7.2). No
 * authorization filtering beyond "the customer exists" — activity
 * read/write role scoping is an explicitly flagged open decision (see
 * docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md), not guessed at here.
 *
 * Session 13.1 (DEC-CUST-02) — confirmed deliberate, not an oversight:
 * activities are customer-level records with no agent/category
 * dimension of their own (unlike interactions, which ARE filtered by
 * authorizedAgentIds in authorizationService.ts). This treats them the
 * same way customer identity itself is already treated in
 * buildAuthorizedCustomerView (not category-gated — see that function's
 * own doc comment). A caller who cannot see this customer at all is
 * already blocked upstream by the "customer exists" check above; no new
 * RBAC model is introduced. Residual limitation: an activity linked to a
 * specific campaign or interaction is NOT additionally filtered by that
 * campaign's/interaction's agent authorization in this session — closing
 * that gap correctly requires the general User Management/RBAC work
 * tracked in docs/CALL_CENTRE_PHASE_4_DECISION_REGISTER.md (DEC-USER-01),
 * not a speculative filter invented here.
 */
async function handleListActivities(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string;
  const activeInstructionsOnly = (Array.isArray(req.query.activeInstructionsOnly) ? req.query.activeInstructionsOnly[0] : req.query.activeInstructionsOnly) === 'true';

  const access = await resolveAccessForAuthenticatedUser(req, 'customer');
  if (!(await isCustomerVisible(id, access))) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }
  const customer = await repo.getCustomer(id);
  if (!customer) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const rows = await supabaseActivityRepository.listActivitiesForCustomer(id, { activeInstructionsOnly });
  res.status(200).json({ data: rows });
}

const ACTIVITY_TYPES: ActivityType[] = ['note', 'instruction', 'task', 'reminder', 'appointment'];

async function handleCreateActivity(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string;

  const actingUser = await requirePermission(req, res, 'customers.activity.create');
  if (!actingUser) return;

  if (!(await isCustomerVisible(id, toCustomerAccess(actingUser)))) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }
  const customer = await repo.getCustomer(id);
  if (!customer) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const activityType = body.activityType as ActivityType | undefined;
  const activityBody = body.body as string | undefined;
  if (!activityType || !ACTIVITY_TYPES.includes(activityType) || !activityBody || !activityBody.trim()) {
    res.status(400).json({ detail: `activityType (one of ${ACTIVITY_TYPES.join(', ')}) and body are required` });
    return;
  }

  const created = await supabaseActivityRepository.createActivity(
    {
      customerId: id,
      activityType,
      title: (body.title as string | null) ?? null,
      body: activityBody,
      priority: (body.priority as string | null) ?? null,
      scheduledAt: (body.scheduledAt as string | null) ?? null,
      dueAt: (body.dueAt as string | null) ?? null,
      assignedUserId: (body.assignedUserId as string | null) ?? null,
      assignedTeamId: (body.assignedTeamId as string | null) ?? null,
      campaignId: (body.campaignId as string | null) ?? null,
      campaignTargetId: (body.campaignTargetId as string | null) ?? null,
      interactionId: (body.interactionId as string | null) ?? null,
      // Session 14.1 — now the real, verified actor's display name/email,
      // not a client-claimed string. Still a display label, not a FK;
      // customer_activities.created_by stays plain text (Session 11.5A
      // schema, untouched this session).
      createdBy: actingUser.displayName ?? actingUser.email,
      effectiveFrom: (body.effectiveFrom as string | null) ?? null,
      effectiveUntil: (body.effectiveUntil as string | null) ?? null,
    },
    new Date().toISOString(),
  );

  await recordAuditEvent({
    actorType: 'user',
    actorUserId: actingUser.id,
    action: 'customer.activity_created',
    resourceType: 'customer',
    resourceId: id,
    result: 'success',
    metadata: { activityType },
    source: 'api/customers/[id]',
  });

  res.status(201).json(created);
}

/**
 * Session 13.1 (DEC-CUST-02) — closes the Phase 2/3 audit's finding that
 * `call_center_activity_update_status` exists in the repository/RPC
 * layer but was not reachable from this route. Status semantics mirror
 * the table's own check constraint and its activity-type-specific
 * resting states (20261005000000_...sql comment): notes have no
 * meaningful lifecycle; instructions toggle active/inactive;
 * task/reminder/appointment move between open/completed/cancelled. No
 * new status values are invented here.
 */
const ACTIVITY_STATUSES_BY_TYPE: Record<ActivityType, ActivityStatus[]> = {
  note: [],
  instruction: ['active', 'inactive'],
  task: ['open', 'completed', 'cancelled'],
  reminder: ['open', 'completed', 'cancelled'],
  appointment: ['open', 'completed', 'cancelled'],
};

async function handleUpdateActivityStatus(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string;

  const actingUser = await requirePermission(req, res, 'customers.activity.update');
  if (!actingUser) return;

  if (!(await isCustomerVisible(id, toCustomerAccess(actingUser)))) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }
  const customer = await repo.getCustomer(id);
  if (!customer) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const activityId = body.activityId as string | undefined;
  const activityType = body.activityType as ActivityType | undefined;
  const status = body.status as ActivityStatus | undefined;

  if (!activityId || !activityType || !ACTIVITY_TYPES.includes(activityType) || !status) {
    res.status(400).json({ detail: 'activityId, activityType, and status are required' });
    return;
  }

  const allowed = ACTIVITY_STATUSES_BY_TYPE[activityType];
  if (!allowed.includes(status)) {
    res.status(400).json({
      detail: allowed.length === 0
        ? `Activities of type "${activityType}" have no status lifecycle`
        : `status for "${activityType}" must be one of: ${allowed.join(', ')}`,
    });
    return;
  }

  const updated = await supabaseActivityRepository.updateActivityStatus(
    activityId,
    status,
    actingUser.displayName ?? actingUser.email,
    new Date().toISOString(),
  );

  await recordAuditEvent({
    actorType: 'user',
    actorUserId: actingUser.id,
    action: 'customer.activity_status_changed',
    resourceType: 'customer',
    resourceId: id,
    result: 'success',
    metadata: { activityId, status },
    source: 'api/customers/[id]',
  });

  res.status(200).json(updated);
}

async function handleRefresh(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string;
  const access = await resolveAccessForAuthenticatedUser(req, 'customer');

  if (!(await isCustomerVisible(id, access))) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const result = await refreshExistingCustomer(repo, source, id, { force: true });
  if (result.status === 'not_found') {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const customer = await repo.getCustomer(id);
  if (!customer) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const view = await buildAuthorizedCustomerView(repo, customer, access);
  res.status(200).json({ ...view, refresh: { attempted: true, failed: false, insertedCount: result.insertedCount } });
}

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  if (action === 'interactions') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ detail: 'Method not allowed. Use GET.' });
      return;
    }
    await handleInteractions(req, res);
    return;
  }

  if (action === 'refresh') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ detail: 'Method not allowed. Use POST.' });
      return;
    }
    await handleRefresh(req, res);
    return;
  }

  if (action === 'campaigns') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ detail: 'Method not allowed. Use GET.' });
      return;
    }
    await handleCampaigns(req, res);
    return;
  }

  if (action === 'activities') {
    if (req.method === 'GET') {
      await handleListActivities(req, res);
      return;
    }
    if (req.method === 'POST') {
      await handleCreateActivity(req, res);
      return;
    }
    if (req.method === 'PATCH') {
      await handleUpdateActivityStatus(req, res);
      return;
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    res.status(405).json({ detail: 'Method not allowed. Use GET, POST, or PATCH.' });
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }
  await handleGetView(req, res);
});
