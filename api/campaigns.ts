import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore } from './_voicebot.js';
import { requireAdminToken, readIntQuery } from './_customer360.js';
import { supabaseCampaignRepository } from '../src/server/campaigns/supabaseCampaignRepository.js';
import { runCampaignBatch, voiceAgentCallBackend } from '../src/server/campaigns/campaignRunner.js';
import { reconcilePendingExecutions } from '../src/server/campaigns/reconcileExecutions.js';
import { defaultResultRules } from '../src/server/campaigns/resultRules.js';
import type { CampaignStatus, NewTargetRow, NextActionType } from '../src/server/campaigns/types.js';

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
 */

const repo = supabaseCampaignRepository;

function queryStr(req: VercelRequest, key: string): string | undefined {
  const raw = req.query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

async function handleList(req: VercelRequest, res: VercelResponse): Promise<void> {
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);
  const { rows, totalCount } = await repo.listCampaigns(page, pageSize);
  res.status(200).json({ data: rows, pagination: { page, pageSize, totalCount } });
}

async function handleGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = queryStr(req, 'id');
  if (!id) {
    res.status(400).json({ detail: 'id is required' });
    return;
  }
  const campaign = await repo.getCampaign(id);
  if (!campaign) {
    res.status(404).json({ detail: 'Campaign not found' });
    return;
  }
  res.status(200).json(campaign);
}

async function handleListTargets(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = queryStr(req, 'id');
  if (!id) {
    res.status(400).json({ detail: 'id is required' });
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
}

async function handleCreate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = req.body as CreateCampaignBody | undefined;
  if (!body?.name || !body?.agentId) {
    res.status(400).json({ detail: 'name and agentId are required' });
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
  });
  res.status(201).json(campaign);
}

async function handleImportTargets(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = queryStr(req, 'id');
  const rows = (req.body as { rows?: NewTargetRow[] } | undefined)?.rows;
  if (!id || !rows || !Array.isArray(rows)) {
    res.status(400).json({ detail: 'id (query) and rows (body) are required' });
    return;
  }
  const result = await repo.importTargets(id, rows, new Date().toISOString());
  res.status(200).json(result);
}

async function handleStatusTransition(req: VercelRequest, res: VercelResponse, status: string): Promise<void> {
  const id = queryStr(req, 'id');
  if (!id) {
    res.status(400).json({ detail: 'id is required' });
    return;
  }
  const campaign = await repo.updateCampaignStatus(id, status as CampaignStatus, new Date().toISOString());
  res.status(200).json(campaign);
}

async function handleRetryTarget(req: VercelRequest, res: VercelResponse): Promise<void> {
  const targetId = queryStr(req, 'targetId');
  if (!targetId) {
    res.status(400).json({ detail: 'targetId is required' });
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

async function handleScheduleFollowup(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = req.body as ScheduleFollowupBody | undefined;
  if (!body?.targetId || !body?.type || !body?.dueAt) {
    res.status(400).json({ detail: 'targetId, type, and dueAt are required' });
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

const GET_ACTIONS = new Set(['list', 'get', 'listTargets']);
const ADMIN_ACTIONS = new Set(['runBatch', 'reconcile']);

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);

  const action = queryStr(req, 'action') ?? '';

  if (ADMIN_ACTIONS.has(action)) {
    if (!requireAdminToken(req, res)) return;
  }

  const wantsGet = GET_ACTIONS.has(action);
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

  switch (action) {
    case 'list':
      await handleList(req, res);
      return;
    case 'get':
      await handleGet(req, res);
      return;
    case 'listTargets':
      await handleListTargets(req, res);
      return;
    case 'create':
      await handleCreate(req, res);
      return;
    case 'importTargets':
      await handleImportTargets(req, res);
      return;
    case 'start':
      await handleStatusTransition(req, res, 'running');
      return;
    case 'pause':
      await handleStatusTransition(req, res, 'paused');
      return;
    case 'resume':
      await handleStatusTransition(req, res, 'running');
      return;
    case 'stop':
      await handleStatusTransition(req, res, 'stopped');
      return;
    case 'retryTarget':
      await handleRetryTarget(req, res);
      return;
    case 'scheduleFollowup':
      await handleScheduleFollowup(req, res);
      return;
    case 'runBatch':
      await handleRunBatch(req, res);
      return;
    case 'reconcile':
      await handleReconcile(req, res);
      return;
    default:
      res.status(400).json({
        detail:
          'Unknown or missing ?action= — use list, get, listTargets, create, importTargets, start, pause, resume, stop, retryTarget, scheduleFollowup, runBatch, or reconcile',
      });
  }
});
