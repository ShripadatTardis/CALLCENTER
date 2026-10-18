import { request } from '@/services/transport/httpClient';
import type { CmaMeasureRequest, CmaMeasureResponse } from '@/types/cma';

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
