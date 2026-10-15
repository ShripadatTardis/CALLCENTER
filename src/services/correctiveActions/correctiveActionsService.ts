import { request } from '@/services/transport/httpClient';

/**
 * Session 16.5 — Corrective Action Management. Thin service layer over
 * the consolidated /api/admin route (`?resource=correctiveActions`),
 * same reason every other admin.ts resource exists (see
 * actionsService.ts / adminService.ts) — the Vercel Hobby-plan
 * 12-serverless-function ceiling. Authorization is entirely server-side
 * (requirePermission + the ownership rule re-enforced inside the RPCs).
 *
 * This file is the GENERIC, source-independent CA API (brief §6 — "a
 * future UI must be able to initiate a CA using the same public
 * application service/API"). QA-specific mapping lives in
 * qaAdapter.ts, which only ever produces a plain `CreateCorrectiveActionInput`
 * — it never reaches into this file's internals.
 */

export type CorrectiveActionStatus = 'open' | 'in_progress' | 'pending_verification' | 'closed' | 'reopened' | 'cancelled';
export type CorrectiveActionPriority = 'low' | 'medium' | 'high' | 'critical';
export type CorrectiveActionCategory = 'agent_behavior' | 'knowledge_base' | 'campaign_configuration' | 'process' | 'technical' | 'other';
export type CorrectiveActionSourceType = 'manual' | 'automated_qa_observation' | 'human_qa_finding';

export interface CorrectiveAction {
  id: string;
  caNumber: number;
  title: string;
  description: string;
  category: CorrectiveActionCategory;
  priority: CorrectiveActionPriority;
  status: CorrectiveActionStatus;
  sourceType: CorrectiveActionSourceType;
  sourceReferenceId: string | null;
  sourceContext: Record<string, unknown> | null;
  agentId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  verifierId: string | null;
  verifierName: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  resolutionSummary: string | null;
  verificationResult: 'passed' | 'failed' | null;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CorrectiveActionGroup {
  id: string;
  groupNumber: number;
  title: string;
  description: string | null;
  rootCause: string | null;
  proposedCorrection: string | null;
  implementedCorrection: string | null;
  assignedInvestigator: string | null;
  assignedFixer: string | null;
  assignedVerifier: string | null;
  status: CorrectiveActionStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CorrectiveActionActivity {
  id: string;
  correctiveActionId: string | null;
  groupId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  eventType: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  comment: string | null;
  evidenceRef: string | null;
  createdAt: string;
}

export interface EligiblePerson {
  id: string;
  email: string;
  displayName: string | null;
}

export interface CreateCorrectiveActionInput {
  title: string;
  description: string;
  category: CorrectiveActionCategory;
  priority?: CorrectiveActionPriority;
  agentId?: string | null;
  sourceType?: CorrectiveActionSourceType;
  sourceReferenceId?: string | null;
  sourceContext?: Record<string, unknown> | null;
  dueAt?: string | null;
  assignedTo?: string | null;
  /** Caller-generated request identity — a repeated submission with the
   * same key returns the already-created CA instead of a duplicate. */
  idempotencyKey?: string;
}

export interface CorrectiveActionListFilters {
  status?: CorrectiveActionStatus;
  priority?: CorrectiveActionPriority;
  category?: CorrectiveActionCategory;
  sourceType?: CorrectiveActionSourceType;
  assignedTo?: string;
  agentId?: string;
  groupId?: string;
  search?: string;
}

export interface BulkVerifyResult {
  results: Array<{ id: string; success: boolean; error?: string }>;
  succeeded: number;
  failed: number;
}

/** The generic creation entry point every source — manual UI, QA
 * adapter, or a future integration — calls identically. */
export async function createCorrectiveAction(input: CreateCorrectiveActionInput): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'create' },
    body: input,
  });
  return res.data;
}

export async function fetchCorrectiveActions(filters: CorrectiveActionListFilters = {}): Promise<CorrectiveAction[]> {
  const res = await request<{ data: CorrectiveAction[] }>('/admin', {
    query: { resource: 'correctiveActions', ...filters },
  });
  return res.data;
}

export async function fetchCorrectiveAction(id: string): Promise<CorrectiveAction | null> {
  const res = await request<{ data: CorrectiveAction | null }>('/admin', {
    query: { resource: 'correctiveActions', action: 'get', id },
  });
  return res.data;
}

export async function fetchCandidateCorrectiveActions(params: { excludeId: string; agentId?: string | null; category?: string | null; parameterCode?: string | null }): Promise<CorrectiveAction[]> {
  const res = await request<{ data: CorrectiveAction[] }>('/admin', {
    query: { resource: 'correctiveActions', action: 'candidates', excludeId: params.excludeId, agentId: params.agentId ?? undefined, category: params.category ?? undefined, parameterCode: params.parameterCode ?? undefined },
  });
  return res.data;
}

export async function fetchEligiblePeople(id: string): Promise<EligiblePerson[]> {
  const res = await request<{ data: EligiblePerson[] }>('/admin', {
    query: { resource: 'correctiveActions', action: 'eligiblePeople', id },
  });
  return res.data;
}

export async function fetchCorrectiveActionActivity(id: string): Promise<CorrectiveActionActivity[]> {
  const res = await request<{ data: CorrectiveActionActivity[] }>('/admin', {
    query: { resource: 'correctiveActions', action: 'activity', id },
  });
  return res.data;
}

export async function updateCorrectiveAction(id: string, patch: Partial<Pick<CreateCorrectiveActionInput, 'title' | 'description' | 'category' | 'priority' | 'dueAt'>>): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'update' },
    body: { id, ...patch },
  });
  return res.data;
}

export async function takeCorrectiveActionOwnership(id: string): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'takeOwnership' },
    body: { id },
  });
  return res.data;
}

export async function assignCorrectiveAction(id: string, assigneeUserId: string): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'assign' },
    body: { id, assigneeUserId },
  });
  return res.data;
}

export async function assignCorrectiveActionVerifier(id: string, verifierUserId: string): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'assignVerifier' },
    body: { id, verifierUserId },
  });
  return res.data;
}

export async function setCorrectiveActionStatus(id: string, status: CorrectiveActionStatus, reason?: string): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'setStatus' },
    body: { id, status, reason },
  });
  return res.data;
}

export async function recordCorrectiveActionCorrection(id: string, resolutionSummary: string): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'recordCorrection' },
    body: { id, resolutionSummary },
  });
  return res.data;
}

export async function recordCorrectiveActionVerification(
  id: string,
  result: 'passed' | 'failed',
  details: { testDescription?: string; evidenceRef?: string; notes?: string } = {},
): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'verify' },
    body: { id, result, ...details },
  });
  return res.data;
}

export async function bulkVerifyCorrectiveActions(
  ids: string[],
  result: 'passed' | 'failed',
  details: { testDescription?: string; evidenceRef?: string; notes?: string; groupId?: string } = {},
): Promise<BulkVerifyResult> {
  const res = await request<{ data: BulkVerifyResult }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'bulkVerify' },
    body: { ids, result, ...details },
  });
  return res.data;
}

// ===== Groups =====

export async function createCorrectiveActionGroup(title: string, description?: string): Promise<CorrectiveActionGroup> {
  const res = await request<{ data: CorrectiveActionGroup }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'groupCreate' },
    body: { title, description },
  });
  return res.data;
}

export async function fetchCorrectiveActionGroup(id: string): Promise<CorrectiveActionGroup | null> {
  const res = await request<{ data: CorrectiveActionGroup | null }>('/admin', {
    query: { resource: 'correctiveActions', action: 'group', id },
  });
  return res.data;
}

export async function fetchCorrectiveActionGroups(status?: CorrectiveActionStatus): Promise<CorrectiveActionGroup[]> {
  const res = await request<{ data: CorrectiveActionGroup[] }>('/admin', {
    query: { resource: 'correctiveActions', action: 'groups', ...(status ? { status } : {}) },
  });
  return res.data;
}

export async function fetchCorrectiveActionGroupMembers(groupId: string): Promise<CorrectiveAction[]> {
  const res = await request<{ data: CorrectiveAction[] }>('/admin', {
    query: { resource: 'correctiveActions', action: 'groupMembers', groupId },
  });
  return res.data;
}

export async function fetchCorrectiveActionGroupActivity(groupId: string): Promise<CorrectiveActionActivity[]> {
  const res = await request<{ data: CorrectiveActionActivity[] }>('/admin', {
    query: { resource: 'correctiveActions', action: 'groupActivity', groupId },
  });
  return res.data;
}

export interface UpdateCorrectiveActionGroupInput {
  title?: string;
  description?: string;
  rootCause?: string;
  proposedCorrection?: string;
  implementedCorrection?: string;
  assignedInvestigator?: string | null;
  assignedFixer?: string | null;
  assignedVerifier?: string | null;
  status?: CorrectiveActionStatus;
}

export async function updateCorrectiveActionGroup(id: string, patch: UpdateCorrectiveActionGroupInput): Promise<CorrectiveActionGroup> {
  const res = await request<{ data: CorrectiveActionGroup }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'groupUpdate' },
    body: { id, ...patch },
  });
  return res.data;
}

export async function linkCorrectiveActionsToGroup(groupId: string, caIds: string[]): Promise<CorrectiveAction[]> {
  const res = await request<{ data: CorrectiveAction[] }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'groupLink' },
    body: { groupId, caIds },
  });
  return res.data;
}

export async function unlinkCorrectiveActionFromGroup(groupId: string, caId: string): Promise<CorrectiveAction> {
  const res = await request<{ data: CorrectiveAction }>('/admin', {
    method: 'POST',
    query: { resource: 'correctiveActions', action: 'groupUnlink' },
    body: { groupId, caId },
  });
  return res.data;
}

/** "CA-000123" display formatting — never store this string, only the
 * numeric caNumber; this is the single place the display format is
 * decided so it can change in one spot. */
export function formatCaNumber(caNumber: number): string {
  return `CA-${String(caNumber).padStart(6, '0')}`;
}
