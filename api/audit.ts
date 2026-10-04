import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, methodNotAllowed } from './_voicebot.js';
import { requirePermission, getServiceRoleClient } from './_auth.js';

/**
 * GET /api/audit — the security/operational Audit Trail (Session 14.1),
 * gated by `audit.view`. Optional filters: actorUserId, action,
 * resourceType, result, limit.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  const user = await requirePermission(req, res, 'audit.view');
  if (!user) return;

  const q = (key: string): string | undefined => {
    const v = req.query[key];
    return typeof v === 'string' ? v : undefined;
  };
  const limitRaw = q('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 100;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc('call_center_audit_list', {
    p_limit: Number.isFinite(limit) ? limit : 100,
    p_actor_user_id: q('actorUserId') ?? null,
    p_action: q('action') ?? null,
    p_resource_type: q('resourceType') ?? null,
    p_result: q('result') ?? null,
  });
  if (error) {
    res.status(500).json({ detail: error.message });
    return;
  }
  res.status(200).json({ data });
});
