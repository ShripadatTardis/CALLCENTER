import { request } from '@/services/transport/httpClient';

/**
 * CMA Synchronization — Manual UI Control. Thin service layer over the
 * consolidated /api/admin route (`?resource=cmaSync`) — same 12-function
 * Hobby-plan ceiling reason every other admin.ts resource exists for
 * (see actionsService.ts). Authorization is server-side
 * (`requirePermission('cma.sync.manage')`) via the Authorization: Bearer
 * header httpClient already attaches — never a client-held secret.
 */

export type CmaSyncRunStatus = 'running' | 'success' | 'partial' | 'failed';
export type CmaSyncLookbackMode = 'since_last_success' | 'explicit';

export interface CmaSyncSourceCounts {
  processed: number;
  inserted: number;
  updated: number;
  failed: number;
}

export interface CmaSyncRun {
  id: string;
  triggeredBy: string | null;
  triggeredByEmail: string | null;
  status: CmaSyncRunStatus;
  startedAt: string;
  finishedAt: string | null;
  windowStartedFrom: string;
  windowStartedTo: string;
  lookbackMode: CmaSyncLookbackMode;
  calls: CmaSyncSourceCounts;
  chats: CmaSyncSourceCounts;
  errorDetail: string | null;
}

export interface CmaSyncStatus {
  latest: CmaSyncRun | null;
  history: CmaSyncRun[];
}

export interface CmaSyncStartOutcome {
  alreadyRunning: boolean;
  runId: string;
  status?: CmaSyncRunStatus;
}

export async function fetchCmaSyncStatus(): Promise<CmaSyncStatus> {
  const res = await request<{ data: CmaSyncStatus }>('/admin', { query: { resource: 'cmaSync' } });
  return res.data;
}

export async function startCmaSync(lookbackHours?: number): Promise<CmaSyncStartOutcome> {
  const res = await request<{ data: CmaSyncStartOutcome }>('/admin', {
    method: 'POST',
    query: { resource: 'cmaSync', action: 'start' },
    body: lookbackHours != null ? { lookbackHours } : {},
  });
  return res.data;
}
