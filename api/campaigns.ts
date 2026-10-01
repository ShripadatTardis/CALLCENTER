import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore } from './_voicebot.js';
import { requireAdminToken, readIntQuery, resolveAccessForRequest } from './_customer360.js';
import type { AuthorizedAccess } from '../src/server/customer360/authorizationService.js';
import { supabaseCampaignRepository } from '../src/server/campaigns/supabaseCampaignRepository.js';
import { runCampaignBatch, voiceAgentCallBackend } from '../src/server/campaigns/campaignRunner.js';
import { reconcilePendingExecutions, enrichReconciledExecutionsWithActualOutcome } from '../src/server/campaigns/reconcileExecutions.js';
import { defaultResultRules } from '../src/server/campaigns/resultRules.js';
import { validateMappingSourceUniqueness } from '../src/server/campaigns/inputMapping.js';
import type {
  CallAgentContract,
  CampaignStatus,
  CampaignWithStats,
  InputMappingSourceType,
  NewCampaignAgentInputMappingInput,
  NewTargetRow,
  NextActionType,
} from '../src/server/campaigns/types.js';

/**
 * One consolidated route for every Campaign operation, dispatched by
 * `?action=` + HTTP method (plan §21/§23) — the proven query-param-
 * dispatch pattern from Session 4.5, no dynamic catch-all segments.
 *
 *   GET  /api/campaigns?action=list
 *   GET  /api/campaigns?action=get&id=...
 *   GET  /api/campaigns?action=listTargets&id=...
 *   POST /api/campaigns?action=create
 *   POST /api/campaigns?action=importTargets&id=...
 *   POST /api/campaigns?action=start|pause|resume|stop&id=...
 *   POST /api/campaigns?action=retryTarget&targetId=...
 *   POST /api/campaigns?action=scheduleFollowup
 *   POST /api/campaigns?action=runBatch      [admin-gated]
 *   POST /api/campaigns?action=reconcile     [admin-gated]
 *
 * Session 9.2: applies the SAME category/role authorization already
 * proven for Call Logs/Chat Logs (Session 6.2) — a campaign's own
 * `agent_id` plays the identical role a call/chat's `agent_id` already
 * plays for `resolveAccessForRequest`. Read actions are filtered/404'd,
 * management actions are 403/404'd, admin/internal actions (runBatch,
 * reconcile) keep their existing, stronger, separate admin-token gate —
 * unchanged and never weakened by this.
 */

const repo = supabaseCampaignRepository;

function queryStr(req: VercelRequest, key: string): string | undefined {
  const raw = req.query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function isAgentAuthorized(access: AuthorizedAccess, agentId: string): boolean {
  return access.allCategories || access.authorizedAgentIds === 'all' || access.authorizedAgentIds.includes(agentId);
}

/** 404, not 403, for a resource that exists but isn't authorized — same "don't confirm existence" precedent Chat Session Detail already established (Session 6.2). */
function notFound(res: VercelResponse): void {
  res.status(404).json({ detail: 'Campaign not found' });
}

async function handleList(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);
  const { rows, totalCount } = await repo.listCampaigns(page, pageSize);

  if (access.allCategories || access.authorizedAgentIds === 'all') {
    res.status(200).json({ data: rows, pagination: { page, pageSize, totalCount } });
    return;
  }

  const authorized = new Set(access.authorizedAgentIds);
  const scopedRows: CampaignWithStats[] = rows.filter((c) => authorized.has(c.agentId));
  // Honest page-scoped total, exactly the same limitation calls/data.ts
  // already documents — no authorized-aggregate RPC exists for campaigns
  // (plan Phase A/§17), so this counts only the current fetched page.
  res.status(200).json({
    data: scopedRows,
    pagination: { page, pageSize, totalCount: scopedRows.length },
    scoped: true,
  });
}

async function handleGet(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = queryStr(req, 'id');
  if (!id) {
    res.status(400).json({ detail: 'id is required' });
    return;
  }
  const campaign = await repo.getCampaign(id);
  if (!campaign) {
    notFound(res);
    return;
  }
  if (!isAgentAuthorized(access, campaign.agentId)) {
    notFound(res);
    return;
  }
  res.status(200).json(campaign);
}

async function handleListTargets(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = queryStr(req, 'id');
  if (!id) {
    res.status(400).json({ detail: 'id is required' });
    return;
  }
  const campaign = await repo.getCampaign(id);
  if (!campaign || !isAgentAuthorized(access, campaign.agentId)) {
    notFound(res);
    return;
  }
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 50);
  const { rows, totalCount } = await repo.listTargets(id, page, pageSize);
  res.status(200).json({ data: rows, pagination: { page, pageSize, totalCount } });
}

interface CreateCampaignBody {
  name: string;
  description?: string;
  agentId: string;
  createdBy?: string;
  sourceMeta?: Record<string, unknown>;
  rules?: Array<{
    priority?: number;
    matchField: string;
    matchValue: string;
    resultCode: string;
    resultLabel: string;
    isSuccess: boolean | null;
    nextActionType?: string | null;
    nextActionDelayDays?: number | null;
    active?: boolean;
  }>;
  /** Session 9.1 — immutable Agent Contract snapshot, captured at create time. */
  agentName?: string;
  agentContractSnapshot?: CallAgentContract;
  mappings?: Array<{
    agentInputFieldCode: string;
    sourceType: InputMappingSourceType;
    sourceField: string;
    required?: boolean;
    dataType?: string | null;
  }>;
}

async function handleCreate(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const body = req.body as CreateCampaignBody | undefined;
  if (!body?.name || !body?.agentId) {
    res.status(400).json({ detail: 'name and agentId are required' });
    return;
  }
  if (!isAgentAuthorized(access, body.agentId)) {
    res.status(403).json({ detail: 'Not authorized to create a campaign for this agent' });
    return;
  }
  const now = new Date().toISOString();
  const rules = (body.rules && body.rules.length > 0 ? body.rules : defaultResultRules()).map((r) => ({
    priority: r.priority ?? 100,
    matchField: r.matchField,
    matchValue: r.matchValue,
    resultCode: r.resultCode,
    resultLabel: r.resultLabel,
    isSuccess: r.isSuccess ?? null,
    nextActionType: (r.nextActionType ?? null) as NextActionType | null,
    nextActionDelayDays: r.nextActionDelayDays ?? null,
    active: r.active ?? true,
  }));
  const campaign = await repo.createCampaign({
    name: body.name,
    description: body.description ?? null,
    agentId: body.agentId,
    createdBy: body.createdBy ?? null,
    sourceMeta: body.sourceMeta ?? null,
    now,
    rules,
    agentName: body.agentName ?? null,
    agentContractSnapshot: body.agentContractSnapshot ?? null,
    mappings: (body.mappings ?? []).map((m) => ({
      agentInputFieldCode: m.agentInputFieldCode,
      sourceType: m.sourceType,
      sourceField: m.sourceField,
      required: m.required ?? false,
      dataType: m.dataType ?? null,
    })),
  });
  res.status(201).json(campaign);
}

/** Shared "fetch campaign, check authorization, 404 if either fails" guard for every id-scoped management action. */
async function requireAuthorizedCampaign(
  id: string | undefined,
  res: VercelResponse,
  access: AuthorizedAccess,
): Promise<string | null> {
  if (!id) {
    res.status(400).json({ detail: 'id is required' });
    return null;
  }
  const campaign = await repo.getCampaign(id);
  if (!campaign || !isAgentAuthorized(access, campaign.agentId)) {
    notFound(res);
    return null;
  }
  return id;
}

async function handleSetInputMappings(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const mappings = (req.body as { mappings?: NewCampaignAgentInputMappingInput[] } | undefined)?.mappings;
  if (!mappings || !Array.isArray(mappings)) {
    res.status(400).json({ detail: 'mappings (body) is required' });
    return;
  }
  // Session 12.4.1 — the persistence boundary re-enforces source
  // uniqueness regardless of what the UI already prevented, so a stale
  // or manipulated client payload can never be accepted: the runner must
  // never have to guess which of two duplicate mappings for the same
  // source field was intended.
  const uniqueness = validateMappingSourceUniqueness(mappings);
  if (!uniqueness.valid) {
    res.status(400).json({
      detail: `Duplicate source mapping(s): ${uniqueness.duplicateSourceKeys.join(', ')} — each source field may back only one agent input.`,
      duplicateSourceKeys: uniqueness.duplicateSourceKeys,
    });
    return;
  }
  const result = await repo.setInputMappings(id, mappings);
  res.status(200).json(result);
}

async function handleImportTargets(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const rows = (req.body as { rows?: NewTargetRow[] } | undefined)?.rows;
  if (!rows || !Array.isArray(rows)) {
    res.status(400).json({ detail: 'rows (body) is required' });
    return;
  }
  const result = await repo.importTargets(id, rows, new Date().toISOString());
  res.status(200).json(result);
}

async function handleStatusTransition(
  req: VercelRequest,
  res: VercelResponse,
  access: AuthorizedAccess,
  status: string,
): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const campaign = await repo.updateCampaignStatus(id, status as CampaignStatus, new Date().toISOString());
  res.status(200).json(campaign);
}

async function handleRetryTarget(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const targetId = queryStr(req, 'targetId');
  if (!targetId) {
    res.status(400).json({ detail: 'targetId is required' });
    return;
  }
  const context = await repo.getTargetContext(targetId);
  if (!context || !isAgentAuthorized(access, context.agentId)) {
    notFound(res);
    return;
  }
  const result = await repo.retryTarget(targetId, new Date().toISOString());
  res.status(200).json(result);
}

interface ScheduleFollowupBody {
  targetId: string;
  resultId?: string | null;
  type: 'retry' | 'scheduled_contact' | 'move_to_campaign' | 'manual_review';
  dueAt: string;
  nextCampaignId?: string | null;
  notes?: string | null;
}

async function handleScheduleFollowup(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const body = req.body as ScheduleFollowupBody | undefined;
  if (!body?.targetId || !body?.type || !body?.dueAt) {
    res.status(400).json({ detail: 'targetId, type, and dueAt are required' });
    return;
  }
  const context = await repo.getTargetContext(body.targetId);
  if (!context || !isAgentAuthorized(access, context.agentId)) {
    notFound(res);
    return;
  }
  const followup = await repo.createFollowup({
    targetId: body.targetId,
    resultId: body.resultId ?? null,
    type: body.type,
    dueAt: body.dueAt,
    nextCampaignId: body.nextCampaignId ?? null,
    notes: body.notes ?? null,
    now: new Date().toISOString(),
  });
  res.status(200).json(followup);
}

async function handleRunBatch(req: VercelRequest, res: VercelResponse): Promise<void> {
  const batchSize = readIntQuery(req, 'batchSize', 5);
  const result = await runCampaignBatch(repo, voiceAgentCallBackend, batchSize);
  res.status(200).json(result);
}

async function handleReconcile(req: VercelRequest, res: VercelResponse): Promise<void> {
  const limit = readIntQuery(req, 'limit', 25);
  const result = await reconcilePendingExecutions(repo, limit);
  res.status(200).json(result);
}

/**
 * Session 12.5 §7 — manual/admin-only trigger for the idempotent
 * actual-outcome enrichment path. Deliberately NOT added to any
 * vercel.json cron schedule by this session (Campaign cron schedules
 * are an explicit regression boundary) — invoked the same way
 * runBatch/reconcile were historically exercised before/alongside
 * their own cron wiring, via POST + X-Admin-Token.
 */
async function handleEnrichActualOutcomes(req: VercelRequest, res: VercelResponse): Promise<void> {
  const limit = readIntQuery(req, 'limit', 25);
  const result = await enrichReconciledExecutionsWithActualOutcome(repo, limit);
  res.status(200).json(result);
}

/**
 * Session 12.3 — same narrow scheduler-adapter pattern already proven by
 * api/customers/admin.ts's Customer 360 Voice reconcile cron: Vercel Cron
 * only issues GET requests and cannot set custom headers, so it can't
 * drive the normal POST + X-Admin-Token admin path below. When
 * CRON_SECRET is set, Vercel automatically attaches
 * `Authorization: Bearer <CRON_SECRET>` to every Cron invocation of this
 * deployment. This accepts ONLY that, ONLY for GET, and ONLY for
 * runBatch/reconcile — manual/admin invocation of either action still
 * requires the existing POST + X-Admin-Token path unchanged below.
 * Deliberately duplicated (not imported) from admin.ts's identical
 * check — both are tiny, self-contained, and keeping them local avoids
 * coupling two otherwise-independent route files for a 4-line function.
 */
function isAuthorizedCronRequest(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

const GET_ACTIONS = new Set(['list', 'get', 'listTargets']);
const ADMIN_ACTIONS = new Set(['runBatch', 'reconcile', 'enrichActualOutcomes']);

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);

  const action = queryStr(req, 'action') ?? '';

  // Cron path: a GET on runBatch/reconcile is ONLY ever the scheduler —
  // reject outright with a clear message if CRON_SECRET auth fails,
  // rather than falling through into the admin-token check (which would
  // report a confusing "missing admin token" for what is actually a
  // missing/invalid cron authorization). Manual/admin invocation of
  // either action is unaffected: it still comes in as POST, which never
  // reaches this branch.
  let isCronAuthorized = false;
  if (ADMIN_ACTIONS.has(action) && req.method === 'GET') {
    if (!isAuthorizedCronRequest(req)) {
      res.status(401).json({ detail: 'Invalid or missing cron authorization' });
      return;
    }
    isCronAuthorized = true;
  }

  if (ADMIN_ACTIONS.has(action) && !isCronAuthorized) {
    if (!requireAdminToken(req, res)) return;
  }

  const wantsGet = GET_ACTIONS.has(action) || isCronAuthorized;
  if (wantsGet && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }
  if (!wantsGet && req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }

  // Admin/internal actions (runBatch, reconcile) keep their existing,
  // stronger, separate admin-token gate and never resolve a per-role
  // category access — they operate across every campaign by design,
  // exactly like Customer 360's backfill/reconcile jobs.
  const access = ADMIN_ACTIONS.has(action) ? null : await resolveAccessForRequest(req);

  switch (action) {
    case 'list':
      await handleList(req, res, access as AuthorizedAccess);
      return;
    case 'get':
      await handleGet(req, res, access as AuthorizedAccess);
      return;
    case 'listTargets':
      await handleListTargets(req, res, access as AuthorizedAccess);
      return;
    case 'create':
      await handleCreate(req, res, access as AuthorizedAccess);
      return;
    case 'importTargets':
      await handleImportTargets(req, res, access as AuthorizedAccess);
      return;
    case 'setInputMappings':
      await handleSetInputMappings(req, res, access as AuthorizedAccess);
      return;
    case 'start':
      await handleStatusTransition(req, res, access as AuthorizedAccess, 'running');
      return;
    case 'pause':
      await handleStatusTransition(req, res, access as AuthorizedAccess, 'paused');
      return;
    case 'resume':
      await handleStatusTransition(req, res, access as AuthorizedAccess, 'running');
      return;
    case 'stop':
      await handleStatusTransition(req, res, access as AuthorizedAccess, 'stopped');
      return;
    case 'retryTarget':
      await handleRetryTarget(req, res, access as AuthorizedAccess);
      return;
    case 'scheduleFollowup':
      await handleScheduleFollowup(req, res, access as AuthorizedAccess);
      return;
    case 'runBatch':
      await handleRunBatch(req, res);
      return;
    case 'reconcile':
      await handleReconcile(req, res);
      return;
    case 'enrichActualOutcomes':
      await handleEnrichActualOutcomes(req, res);
      return;
    default:
      res.status(400).json({
        detail:
          'Unknown or missing ?action= — use list, get, listTargets, create, importTargets, setInputMappings, start, pause, resume, stop, retryTarget, scheduleFollowup, runBatch, reconcile, or enrichActualOutcomes',
      });
  }
});
