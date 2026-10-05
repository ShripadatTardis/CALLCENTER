import { request } from '@/services/transport/httpClient';
import type {
  CallAgentContract,
  CampaignAgentInputMapping,
  CampaignAuditEvent,
  CampaignClassification,
  CampaignConfigurationVersion,
  CampaignDetail,
  CampaignExecution,
  CampaignListResponse,
  CampaignSkipReason,
  CampaignTargetMutationResult,
  CampaignTargetsResponse,
  CampaignWithStats,
  CreateCampaignInput,
  ImportTargetRow,
  ImportTargetsResult,
  NewCampaignAgentInputMappingInput,
  OutcomePolicySnapshot,
} from '@/types/campaign';

/**
 * `runBatch`/`reconcile` are deliberately NOT exposed here — like
 * Customer 360's backfill/reconcile (plan §16/§17), they are
 * admin-token-gated internal jobs invoked manually (curl / a future
 * scheduler), never from browser JS, since the admin token must never
 * reach the browser bundle.
 */

/**
 * Campaigns domain service. Calls this app's own /api/campaigns route
 * (docs/CALL_CENTRE_SESSION5_CAMPAIGNS_PLAN.md §21), one consolidated
 * file dispatched by ?action= — same pattern as Chat's chatService.ts.
 *
 * Session 9.2: every function takes an optional `role`, which drives
 * the SAME server-side category authorization Call Logs/Chat Logs
 * already have (Session 6.2) — `x-user-role` header, fail-closed to
 * 'unauthenticated' server-side when omitted. See useCampaigns.ts /
 * useCampaignDetail.ts / useCampaignActions.ts for the real call sites,
 * which always pass the current session's role.
 */

function roleHeaders(role: string): Record<string, string> {
  return { 'x-user-role': role };
}

export async function fetchCampaigns(
  opts: { page?: number; pageSize?: number } = {},
  role = 'unauthenticated',
): Promise<CampaignListResponse> {
  return request<CampaignListResponse>('/campaigns', {
    method: 'GET',
    query: { action: 'list', page: opts.page, pageSize: opts.pageSize },
    headers: roleHeaders(role),
  });
}

export async function fetchCampaignDetail(id: string, role = 'unauthenticated'): Promise<CampaignDetail> {
  return request<CampaignDetail>('/campaigns', {
    method: 'GET',
    query: { action: 'get', id },
    headers: roleHeaders(role),
  });
}

export async function fetchCampaignTargets(
  id: string,
  opts: { page?: number; pageSize?: number } = {},
  role = 'unauthenticated',
): Promise<CampaignTargetsResponse> {
  return request<CampaignTargetsResponse>('/campaigns', {
    method: 'GET',
    query: { action: 'listTargets', id, page: opts.page, pageSize: opts.pageSize },
    headers: roleHeaders(role),
  });
}

/**
 * Session 12.6 — the ONLY place the Universal Campaign Classification
 * vocabulary should be fetched from; never hardcode these codes/labels
 * in a component.
 */
export async function fetchCampaignClassifications(): Promise<CampaignClassification[]> {
  const { data } = await request<{ data: CampaignClassification[] }>('/campaigns', {
    method: 'GET',
    query: { action: 'listClassifications' },
  });
  return data;
}

export async function createCampaign(input: CreateCampaignInput, role = 'unauthenticated'): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', {
    method: 'POST',
    query: { action: 'create' },
    body: input,
    headers: roleHeaders(role),
  });
}

export async function importCampaignTargets(
  id: string,
  rows: ImportTargetRow[],
  role = 'unauthenticated',
): Promise<ImportTargetsResult> {
  return request<ImportTargetsResult>('/campaigns', {
    method: 'POST',
    query: { action: 'importTargets', id },
    body: { rows },
    headers: roleHeaders(role),
  });
}

export async function setCampaignInputMappings(
  id: string,
  mappings: NewCampaignAgentInputMappingInput[],
  role = 'unauthenticated',
): Promise<CampaignAgentInputMapping[]> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'setInputMappings', id },
    body: { mappings },
    headers: roleHeaders(role),
  });
}

export async function startCampaign(id: string, role = 'unauthenticated'): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', {
    method: 'POST',
    query: { action: 'start', id },
    headers: roleHeaders(role),
  });
}

/** Session 12.7 §14 — the server now requires a non-empty reason to pause. */
export async function pauseCampaign(id: string, reason: string, role = 'unauthenticated'): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', {
    method: 'POST',
    query: { action: 'pause', id },
    body: { reason },
    headers: roleHeaders(role),
  });
}

export async function resumeCampaign(id: string, role = 'unauthenticated'): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', {
    method: 'POST',
    query: { action: 'resume', id },
    headers: roleHeaders(role),
  });
}

/** Session 12.7 §14 — the server now requires a non-empty reason AND confirm:true to stop. */
export async function stopCampaign(id: string, reason: string, role = 'unauthenticated'): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', {
    method: 'POST',
    query: { action: 'stop', id },
    body: { reason, confirm: true },
    headers: roleHeaders(role),
  });
}

export async function retryTarget(
  targetId: string,
  reason?: string | null,
  role = 'unauthenticated',
): Promise<{ targetId: string; status: string }> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'retryTarget', targetId },
    body: { reason: reason ?? null },
    headers: roleHeaders(role),
  });
}

// ---------------------------------------------------------------------
// Session 12.7 — Campaign Administration, Configuration Versioning &
// Target Controls.
// ---------------------------------------------------------------------

export async function fetchCampaignSkipReasons(): Promise<CampaignSkipReason[]> {
  const { data } = await request<{ data: CampaignSkipReason[] }>('/campaigns', {
    method: 'GET',
    query: { action: 'listSkipReasons' },
  });
  return data;
}

export async function fetchCampaignConfigurationVersions(
  id: string,
  role = 'unauthenticated',
): Promise<CampaignConfigurationVersion[]> {
  const { data } = await request<{ data: CampaignConfigurationVersion[] }>('/campaigns', {
    method: 'GET',
    query: { action: 'listConfigurationVersions', id },
    headers: roleHeaders(role),
  });
  return data;
}

export async function fetchCampaignAuditEvents(
  id: string,
  limit = 200,
  role = 'unauthenticated',
): Promise<CampaignAuditEvent[]> {
  const { data } = await request<{ data: CampaignAuditEvent[] }>('/campaigns', {
    method: 'GET',
    query: { action: 'listAuditEvents', id, limit },
    headers: roleHeaders(role),
  });
  return data;
}

/**
 * Session 15.3 — the real input VALUES (not just the contract's field
 * definitions) sent for this one interaction, when it was campaign-
 * triggered. No campaign id is required or known up front (the Voice/
 * Calls API never carries a stable one on a call record) — the server
 * resolves the matching execution by interaction id alone and
 * authorizes it via the resolved execution's own governing agent.
 * Returns null, never a fabricated placeholder, when the interaction
 * has no matching execution (not campaign-triggered, e.g. an inbound or
 * ad hoc call, or any chat session), when it's outside the caller's
 * Agent Scope, or when the matching execution predates
 * request_payload_snapshot capture.
 */
export async function fetchCampaignExecutionByInteraction(
  interactionId: string,
  role = 'unauthenticated',
): Promise<CampaignExecution | null> {
  const { data } = await request<{ data: CampaignExecution | null }>('/campaigns', {
    method: 'GET',
    query: { action: 'getExecutionByInteraction', interactionId },
    headers: roleHeaders(role),
  });
  return data;
}

/** §5/§20 — expectedCurrentVersionId must be the version id the caller last saw active (or null if it believes the campaign has never been versioned); a stale value raises a 409. */
export async function createCampaignConfigurationVersion(
  id: string,
  input: {
    expectedCurrentVersionId: string | null;
    reason: string;
    agentId?: string;
    agentName?: string | null;
    agentContractSnapshot?: CallAgentContract | null;
    outcomePolicySnapshot?: OutcomePolicySnapshot | null;
    mappings?: NewCampaignAgentInputMappingInput[] | null;
    eventType?: string;
  },
  role = 'unauthenticated',
): Promise<{ versionId: string; versionNumber: number }> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'createConfigurationVersion', id },
    body: input,
    headers: roleHeaders(role),
  });
}

/** §4 — Draft-only direct edit, no configuration-version churn. The server rejects a non-draft campaign. */
export async function updateDraftCampaignConfiguration(
  id: string,
  input: {
    agentId?: string;
    agentName?: string | null;
    agentContractSnapshot?: CallAgentContract | null;
    outcomePolicySnapshot?: OutcomePolicySnapshot | null;
    mappings?: NewCampaignAgentInputMappingInput[] | null;
  },
  role = 'unauthenticated',
): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', {
    method: 'POST',
    query: { action: 'updateDraftConfiguration', id },
    body: input,
    headers: roleHeaders(role),
  });
}

export async function skipCampaignTarget(
  targetId: string,
  reasonCode: string,
  comment: string | null,
  role = 'unauthenticated',
): Promise<CampaignTargetMutationResult> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'skipTarget', targetId },
    body: { reasonCode, comment },
    headers: roleHeaders(role),
  });
}

export async function holdCampaignTarget(
  targetId: string,
  reason: string | null,
  note: string | null,
  role = 'unauthenticated',
): Promise<CampaignTargetMutationResult> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'holdTarget', targetId },
    body: { reason, note },
    headers: roleHeaders(role),
  });
}

export async function releaseCampaignTargetHold(
  targetId: string,
  role = 'unauthenticated',
): Promise<CampaignTargetMutationResult> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'releaseHold', targetId },
    headers: roleHeaders(role),
  });
}

export async function amendCampaignTarget(
  targetId: string,
  sourceAttributes: Record<string, unknown>,
  reason: string | null,
  role = 'unauthenticated',
): Promise<CampaignTargetMutationResult> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'amendTarget', targetId },
    body: { sourceAttributes, reason },
    headers: roleHeaders(role),
  });
}

export async function addCampaignTargets(
  id: string,
  rows: ImportTargetRow[],
  role = 'unauthenticated',
): Promise<ImportTargetsResult & { batchId: string }> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'addTargets', id },
    body: { rows },
    headers: roleHeaders(role),
  });
}

export async function scheduleFollowup(
  input: {
    targetId: string;
    resultId?: string | null;
    type: 'retry' | 'scheduled_contact' | 'move_to_campaign' | 'manual_review';
    dueAt: string;
    nextCampaignId?: string | null;
    notes?: string | null;
  },
  role = 'unauthenticated',
): Promise<unknown> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'scheduleFollowup' },
    body: input,
    headers: roleHeaders(role),
  });
}

