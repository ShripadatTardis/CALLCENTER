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
  OutcomePolicySnapshot,
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

/**
 * Session 12.6 — the ONLY server route that serves the Universal
 * Campaign Classification vocabulary. Not category-gated (it's
 * reference data describing the system, not a specific campaign/agent's
 * data) — same treatment as the Agents roster endpoint.
 */
async function handleListClassifications(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const classifications = await repo.listClassifications();
  res.status(200).json({ data: classifications });
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
  /** Session 12.6 — immutable Outcome Policy snapshot, captured at create time. */
  outcomePolicySnapshot?: {
    mappings: Array<{ agentOutcomeCode: string; campaignClassificationCode: string; nextActionType?: string | null }>;
    capturedAt: string;
  };
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
  // Session 12.6 — persistence-boundary validation, same discipline as
  // 12.4.1's mapping-uniqueness check: never trust a client-submitted
  // classification code without checking it against the live,
  // system-owned master list, regardless of what the UI already did.
  if (body.outcomePolicySnapshot) {
    const classifications = await repo.listClassifications();
    const validCodes = new Set(classifications.map((c) => c.code));
    const invalid = body.outcomePolicySnapshot.mappings
      .map((m) => m.campaignClassificationCode)
      .filter((code) => !validCodes.has(code));
    if (invalid.length > 0) {
      res.status(400).json({ detail: `Unknown campaign classification code(s): ${Array.from(new Set(invalid)).join(', ')}` });
      return;
    }
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
    outcomePolicySnapshot: body.outcomePolicySnapshot
      ? {
          mappings: body.outcomePolicySnapshot.mappings.map((m) => ({
            agentOutcomeCode: m.agentOutcomeCode,
            campaignClassificationCode: m.campaignClassificationCode,
            nextActionType: (m.nextActionType ?? null) as NextActionType | null,
          })),
          capturedAt: body.outcomePolicySnapshot.capturedAt,
        }
      : null,
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

interface StatusTransitionBody {
  reason?: string;
  actor?: string;
  /** Required alongside a reason for 'stop' (§14 — "Stop requires reason+confirmation"). Not needed for pause/resume. */
  confirm?: boolean;
}

/**
 * Session 12.7 §14 — every lifecycle transition now goes through the
 * audited RPC (setStatusAudited, which also auto-creates "v1" the first
 * time a campaign starts — see §6 of the migration). Pause and Stop
 * require a non-empty reason; Stop additionally requires
 * `confirm: true` in the body. Start/Resume are audited the same way
 * but carry no reason requirement — same as before this session.
 */
async function handleStatusTransition(
  req: VercelRequest,
  res: VercelResponse,
  access: AuthorizedAccess,
  status: CampaignStatus,
): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const body = (req.body as StatusTransitionBody | undefined) ?? {};
  const reason = body.reason?.trim() || null;

  if ((status === 'paused' || status === 'stopped') && !reason) {
    res.status(400).json({ detail: `A reason is required to ${status === 'paused' ? 'pause' : 'stop'} a campaign.` });
    return;
  }
  if (status === 'stopped' && body.confirm !== true) {
    res.status(400).json({ detail: 'Stopping a campaign requires confirm: true in the request body.' });
    return;
  }

  const actor = body.actor?.trim() || access.role || null;
  const campaign = await repo.setStatusAudited(id, status, new Date().toISOString(), actor, reason);
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
  const body = (req.body as { reason?: string; actor?: string } | undefined) ?? {};
  const actor = body.actor?.trim() || access.role || null;
  const result = await repo.retryTarget(targetId, new Date().toISOString(), actor, body.reason?.trim() || null);
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

// ---------------------------------------------------------------------
// Session 12.7 — Campaign Administration, Configuration Versioning &
// Target Controls. Every mutation below requires an authorized campaign
// (via requireAuthorizedCampaign for campaign-scoped actions, or
// getTargetContext's agentId check for target-scoped ones) — same
// server-side enforcement discipline as every action above (§19).
// ---------------------------------------------------------------------

/** System-configured Skip Reason master — not category-gated, same treatment as listClassifications (reference data, not a specific campaign's data). */
async function handleListSkipReasons(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const reasons = await repo.listSkipReasons();
  res.status(200).json({ data: reasons });
}

async function handleListConfigurationVersions(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const versions = await repo.listConfigurationVersions(id);
  res.status(200).json({ data: versions });
}

async function handleListAuditEvents(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const limit = readIntQuery(req, 'limit', 200);
  const events = await repo.listAuditEvents(id, limit);
  res.status(200).json({ data: events });
}

interface CreateConfigurationVersionBody {
  expectedCurrentVersionId: string | null;
  reason: string;
  actor?: string;
  agentId?: string;
  agentName?: string | null;
  agentContractSnapshot?: CallAgentContract | null;
  outcomePolicySnapshot?: OutcomePolicySnapshot | null;
  mappings?: Array<{
    agentInputFieldCode: string;
    sourceType: InputMappingSourceType;
    sourceField: string;
    required?: boolean;
    dataType?: string | null;
  }>;
  eventType?: string;
}

/**
 * §5/§20 — the ONLY path for a prospective configuration change on a
 * launched/paused/running campaign. `expectedCurrentVersionId` is
 * REQUIRED in the body (explicit null is valid — "I believe this
 * campaign has never been versioned yet") so a stale client can never
 * silently clobber a newer version; a mismatch surfaces as 409, not a
 * generic 500, so the UI can tell the operator to refresh and retry.
 */
async function handleCreateConfigurationVersion(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const body = req.body as CreateConfigurationVersionBody | undefined;
  if (body === undefined || !('expectedCurrentVersionId' in body) || !body.reason?.trim()) {
    res.status(400).json({ detail: 'expectedCurrentVersionId (nullable) and a non-empty reason are required' });
    return;
  }
  if (body.outcomePolicySnapshot) {
    const classifications = await repo.listClassifications();
    const validCodes = new Set(classifications.map((c) => c.code));
    const invalid = body.outcomePolicySnapshot.mappings
      .map((m) => m.campaignClassificationCode)
      .filter((code) => !validCodes.has(code));
    if (invalid.length > 0) {
      res.status(400).json({ detail: `Unknown campaign classification code(s): ${Array.from(new Set(invalid)).join(', ')}` });
      return;
    }
  }
  if (body.mappings) {
    const uniqueness = validateMappingSourceUniqueness(body.mappings as NewCampaignAgentInputMappingInput[]);
    if (!uniqueness.valid) {
      res.status(400).json({
        detail: `Duplicate source mapping(s): ${uniqueness.duplicateSourceKeys.join(', ')} — each source field may back only one agent input.`,
        duplicateSourceKeys: uniqueness.duplicateSourceKeys,
      });
      return;
    }
  }
  const actor = body.actor?.trim() || access.role || null;
  try {
    const result = await repo.createConfigurationVersion({
      campaignId: id,
      expectedCurrentVersionId: body.expectedCurrentVersionId,
      now: new Date().toISOString(),
      actor,
      reason: body.reason.trim(),
      agentId: body.agentId ?? null,
      agentName: body.agentName ?? null,
      agentContractSnapshot: body.agentContractSnapshot ?? null,
      outcomePolicySnapshot: body.outcomePolicySnapshot ?? null,
      mappings: body.mappings
        ? body.mappings.map((m) => ({
            agentInputFieldCode: m.agentInputFieldCode,
            sourceType: m.sourceType,
            sourceField: m.sourceField,
            required: m.required ?? false,
            dataType: m.dataType ?? null,
          }))
        : null,
      eventType: body.eventType,
    });
    res.status(200).json(result);
  } catch (err) {
    // §20 — a stale optimistic-concurrency token surfaces as a clear
    // 409, never a silent overwrite or an opaque 500. The RPC raises
    // this with errcode 40001; the Supabase client surfaces the message
    // text, not the errcode, so we match on the stable prefix instead.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('stale_configuration_version')) {
      res.status(409).json({ detail: 'This campaign\'s configuration changed since you loaded it. Reload and try again.', code: 'stale_configuration_version' });
      return;
    }
    throw err;
  }
}

interface UpdateDraftConfigurationBody {
  actor?: string;
  agentId?: string;
  agentName?: string | null;
  agentContractSnapshot?: CallAgentContract | null;
  outcomePolicySnapshot?: OutcomePolicySnapshot | null;
  mappings?: Array<{
    agentInputFieldCode: string;
    sourceType: InputMappingSourceType;
    sourceField: string;
    required?: boolean;
    dataType?: string | null;
  }>;
}

/** §4 — Campaign Settings/Edit for a DRAFT campaign only; the server-side RPC itself rejects a non-draft campaign. */
async function handleUpdateDraftConfiguration(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const body = (req.body as UpdateDraftConfigurationBody | undefined) ?? {};
  if (body.outcomePolicySnapshot) {
    const classifications = await repo.listClassifications();
    const validCodes = new Set(classifications.map((c) => c.code));
    const invalid = body.outcomePolicySnapshot.mappings
      .map((m) => m.campaignClassificationCode)
      .filter((code) => !validCodes.has(code));
    if (invalid.length > 0) {
      res.status(400).json({ detail: `Unknown campaign classification code(s): ${Array.from(new Set(invalid)).join(', ')}` });
      return;
    }
  }
  if (body.mappings) {
    const uniqueness = validateMappingSourceUniqueness(body.mappings as NewCampaignAgentInputMappingInput[]);
    if (!uniqueness.valid) {
      res.status(400).json({
        detail: `Duplicate source mapping(s): ${uniqueness.duplicateSourceKeys.join(', ')} — each source field may back only one agent input.`,
        duplicateSourceKeys: uniqueness.duplicateSourceKeys,
      });
      return;
    }
  }
  const actor = body.actor?.trim() || access.role || null;
  try {
    const campaign = await repo.updateDraftConfiguration({
      campaignId: id,
      now: new Date().toISOString(),
      actor,
      agentId: body.agentId ?? null,
      agentName: body.agentName ?? null,
      agentContractSnapshot: body.agentContractSnapshot ?? null,
      outcomePolicySnapshot: body.outcomePolicySnapshot ?? null,
      mappings: body.mappings
        ? body.mappings.map((m) => ({
            agentInputFieldCode: m.agentInputFieldCode,
            sourceType: m.sourceType,
            sourceField: m.sourceField,
            required: m.required ?? false,
            dataType: m.dataType ?? null,
          }))
        : null,
    });
    res.status(200).json(campaign);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
  }
}

async function handleSkipTarget(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
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
  const body = (req.body as { reasonCode?: string; comment?: string; actor?: string } | undefined) ?? {};
  if (!body.reasonCode) {
    res.status(400).json({ detail: 'reasonCode is required' });
    return;
  }
  const actor = body.actor?.trim() || access.role || null;
  try {
    const result = await repo.skipTarget(targetId, body.reasonCode, body.comment ?? null, new Date().toISOString(), actor);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
  }
}

async function handleHoldTarget(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
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
  const body = (req.body as { reason?: string; note?: string; actor?: string } | undefined) ?? {};
  const actor = body.actor?.trim() || access.role || null;
  try {
    const result = await repo.holdTarget(targetId, body.reason ?? null, body.note ?? null, new Date().toISOString(), actor);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
  }
}

async function handleReleaseHold(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
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
  const body = (req.body as { actor?: string } | undefined) ?? {};
  const actor = body.actor?.trim() || access.role || null;
  try {
    const result = await repo.releaseHold(targetId, new Date().toISOString(), actor);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
  }
}

async function handleAmendTarget(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
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
  const body = (req.body as { sourceAttributes?: Record<string, unknown>; reason?: string; actor?: string } | undefined) ?? {};
  if (!body.sourceAttributes || typeof body.sourceAttributes !== 'object') {
    res.status(400).json({ detail: 'sourceAttributes (object, body) is required' });
    return;
  }
  const actor = body.actor?.trim() || access.role || null;
  const result = await repo.amendTarget(targetId, body.sourceAttributes, new Date().toISOString(), actor, body.reason?.trim() || null);
  res.status(200).json(result);
}

async function handleAddTargets(req: VercelRequest, res: VercelResponse, access: AuthorizedAccess): Promise<void> {
  const id = await requireAuthorizedCampaign(queryStr(req, 'id'), res, access);
  if (!id) return;
  const body = (req.body as { rows?: NewTargetRow[]; actor?: string } | undefined) ?? {};
  if (!body.rows || !Array.isArray(body.rows)) {
    res.status(400).json({ detail: 'rows (body) is required' });
    return;
  }
  const actor = body.actor?.trim() || access.role || null;
  const result = await repo.addTargets(id, body.rows, new Date().toISOString(), actor);
  res.status(200).json(result);
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

const GET_ACTIONS = new Set([
  'list',
  'get',
  'listTargets',
  'listClassifications',
  'listSkipReasons',
  'listConfigurationVersions',
  'listAuditEvents',
]);
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
    case 'listClassifications':
      await handleListClassifications(req, res);
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
    case 'listSkipReasons':
      await handleListSkipReasons(req, res);
      return;
    case 'listConfigurationVersions':
      await handleListConfigurationVersions(req, res, access as AuthorizedAccess);
      return;
    case 'listAuditEvents':
      await handleListAuditEvents(req, res, access as AuthorizedAccess);
      return;
    case 'createConfigurationVersion':
      await handleCreateConfigurationVersion(req, res, access as AuthorizedAccess);
      return;
    case 'updateDraftConfiguration':
      await handleUpdateDraftConfiguration(req, res, access as AuthorizedAccess);
      return;
    case 'skipTarget':
      await handleSkipTarget(req, res, access as AuthorizedAccess);
      return;
    case 'holdTarget':
      await handleHoldTarget(req, res, access as AuthorizedAccess);
      return;
    case 'releaseHold':
      await handleReleaseHold(req, res, access as AuthorizedAccess);
      return;
    case 'amendTarget':
      await handleAmendTarget(req, res, access as AuthorizedAccess);
      return;
    case 'addTargets':
      await handleAddTargets(req, res, access as AuthorizedAccess);
      return;
    default:
      res.status(400).json({
        detail:
          'Unknown or missing ?action= — use list, get, listTargets, listClassifications, create, importTargets, setInputMappings, start, pause, resume, stop, retryTarget, scheduleFollowup, runBatch, reconcile, enrichActualOutcomes, listSkipReasons, listConfigurationVersions, listAuditEvents, createConfigurationVersion, updateDraftConfiguration, skipTarget, holdTarget, releaseHold, amendTarget, or addTargets',
      });
  }
});
