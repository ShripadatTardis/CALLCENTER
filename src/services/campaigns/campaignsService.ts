import { request } from '@/services/transport/httpClient';
import type {
  CampaignAgentInputMapping,
  CampaignClassification,
  CampaignDetail,
  CampaignListResponse,
  CampaignTargetsResponse,
  CampaignWithStats,
  CreateCampaignInput,
  ImportTargetRow,
  ImportTargetsResult,
  NewCampaignAgentInputMappingInput,
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

export async function pauseCampaign(id: string, role = 'unauthenticated'): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', {
    method: 'POST',
    query: { action: 'pause', id },
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

export async function stopCampaign(id: string, role = 'unauthenticated'): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', {
    method: 'POST',
    query: { action: 'stop', id },
    headers: roleHeaders(role),
  });
}

export async function retryTarget(
  targetId: string,
  role = 'unauthenticated',
): Promise<{ targetId: string; status: string }> {
  return request('/campaigns', {
    method: 'POST',
    query: { action: 'retryTarget', targetId },
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

