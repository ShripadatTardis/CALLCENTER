import { request } from '@/services/transport/httpClient';
import type {
  CampaignDetail,
  CampaignListResponse,
  CampaignTargetsResponse,
  CampaignWithStats,
  CreateCampaignInput,
  ImportTargetRow,
  ImportTargetsResult,
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
 */

export async function fetchCampaigns(opts: { page?: number; pageSize?: number } = {}): Promise<CampaignListResponse> {
  return request<CampaignListResponse>('/campaigns', {
    method: 'GET',
    query: { action: 'list', page: opts.page, pageSize: opts.pageSize },
  });
}

export async function fetchCampaignDetail(id: string): Promise<CampaignDetail> {
  return request<CampaignDetail>('/campaigns', { method: 'GET', query: { action: 'get', id } });
}

export async function fetchCampaignTargets(
  id: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<CampaignTargetsResponse> {
  return request<CampaignTargetsResponse>('/campaigns', {
    method: 'GET',
    query: { action: 'listTargets', id, page: opts.page, pageSize: opts.pageSize },
  });
}

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', { method: 'POST', query: { action: 'create' }, body: input });
}

export async function importCampaignTargets(id: string, rows: ImportTargetRow[]): Promise<ImportTargetsResult> {
  return request<ImportTargetsResult>('/campaigns', {
    method: 'POST',
    query: { action: 'importTargets', id },
    body: { rows },
  });
}

export async function startCampaign(id: string): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', { method: 'POST', query: { action: 'start', id } });
}

export async function pauseCampaign(id: string): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', { method: 'POST', query: { action: 'pause', id } });
}

export async function resumeCampaign(id: string): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', { method: 'POST', query: { action: 'resume', id } });
}

export async function stopCampaign(id: string): Promise<CampaignWithStats> {
  return request<CampaignWithStats>('/campaigns', { method: 'POST', query: { action: 'stop', id } });
}

export async function retryTarget(targetId: string): Promise<{ targetId: string; status: string }> {
  return request('/campaigns', { method: 'POST', query: { action: 'retryTarget', targetId } });
}

export async function scheduleFollowup(input: {
  targetId: string;
  resultId?: string | null;
  type: 'retry' | 'scheduled_contact' | 'move_to_campaign' | 'manual_review';
  dueAt: string;
  nextCampaignId?: string | null;
  notes?: string | null;
}): Promise<unknown> {
  return request('/campaigns', { method: 'POST', query: { action: 'scheduleFollowup' }, body: input });
}

