import { request } from '@/services/transport/httpClient';
import type { CmaMeasureRequest, CmaMeasureResponse, CmaOwnedMeasure } from '@/types/cma';

/**
 * Session CMA-4A — the one place any frontend code calls the CMA
 * evaluation API (`POST /api/admin?resource=cmaEvaluate`, CMA-3A). Mirrors
 * `src/services/admin/adminService.ts`'s existing request conventions; no
 * other service/hook should build this request directly.
 *
 * The caller is responsible for checking the viewer holds `cma.evaluate`
 * (via `hasPermission(user, 'cma.evaluate')`) before calling this — the
 * API itself also enforces it server-side (403 otherwise), this is just
 * to avoid a guaranteed-to-fail request for viewers who don't have it.
 */
export async function evaluateCmaMeasure(req: CmaMeasureRequest): Promise<CmaMeasureResponse> {
  const res = await request<{ data: CmaMeasureResponse }>('/admin', {
    method: 'POST',
    query: { resource: 'cmaEvaluate' },
    body: req,
  });
  return res.data;
}

/**
 * Session 10 — the central ownership entry point every screen/UI call
 * site uses to ask "what does CMA deliver for this measure" (and
 * optionally its live value). Mirrors evaluateCmaMeasure's convention;
 * no other service/hook should build this request directly.
 */
export async function fetchCmaOwnedMeasure(
  canonicalMeasureId: string,
  live?: { from: string; to: string; datasetId?: string | null; recordId?: string; agent?: string },
): Promise<CmaOwnedMeasure> {
  const res = await request<{ data: CmaOwnedMeasure }>('/admin', {
    method: 'GET',
    query: {
      resource: 'cmaRegistry', action: 'ownership', id: canonicalMeasureId,
      ...(live ? {
        from: live.from, to: live.to,
        ...(live.datasetId ? { datasetId: live.datasetId } : {}),
        ...(live.recordId ? { recordId: live.recordId } : {}),
        ...(live.agent ? { agent: live.agent } : {}),
      } : {}),
    },
  });
  return res.data;
}

export async function fetchCmaOwnershipMap(): Promise<CmaOwnedMeasure[]> {
  const res = await request<{ data: CmaOwnedMeasure[] }>('/admin', {
    method: 'GET',
    query: { resource: 'cmaRegistry', action: 'ownershipMap' },
  });
  return res.data;
}
