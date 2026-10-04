import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, methodNotAllowed } from './_voicebot.js';
import { requirePermission, getServiceRoleClient } from './_auth.js';

/**
 * /api/users — User Management (Session 14.1). `?action=` dispatch,
 * mirroring the existing /api/campaigns.ts convention. Every mutation
 * is gated server-side by `users.manage` (frontend hiding a button is
 * never the real boundary) and writes a call_center.audit_events row
 * with the real, verified actor. Every read/write goes through a
 * public.call_center_users_* SECURITY DEFINER RPC — call_center is not
 * in PostgREST's exposed-schema allow-list, same as every other
 * call_center repository in this app.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;

  if (req.method === 'GET') {
    const user = await requirePermission(req, res, 'users.view');
    if (!user) return;

    const userId = typeof req.query.id === 'string' ? req.query.id : undefined;
    const supabase = getServiceRoleClient();

    if (userId) {
      const { data, error } = await supabase.rpc('call_center_users_get_detail', { p_user_id: userId });
      if (error) {
        res.status(500).json({ detail: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ detail: 'User not found' });
        return;
      }
      res.status(200).json({ data });
      return;
    }

    const { data, error } = await supabase.rpc('call_center_users_list');
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }

  if (req.method === 'POST') {
    const actingUser = await requirePermission(req, res, 'users.manage');
    if (!actingUser) return;
    const supabase = getServiceRoleClient();

    if (action === 'setStatus') {
      const { userId, status } = req.body ?? {};
      if (typeof userId !== 'string' || (status !== 'active' && status !== 'inactive')) {
        res.status(422).json({ detail: 'userId and status ("active"|"inactive") are required' });
        return;
      }
      const { data, error } = await supabase.rpc('call_center_users_set_status', {
        p_user_id: userId,
        p_status: status,
        p_actor_user_id: actingUser.id,
      });
      if (error) {
        res.status(500).json({ detail: error.message });
        return;
      }
      res.status(200).json({ data });
      return;
    }

    if (action === 'assignRole') {
      const { userId, roleCode } = req.body ?? {};
      if (typeof userId !== 'string' || typeof roleCode !== 'string') {
        res.status(422).json({ detail: 'userId and roleCode are required' });
        return;
      }
      const { data, error } = await supabase.rpc('call_center_users_assign_role', {
        p_user_id: userId,
        p_role_code: roleCode,
        p_actor_user_id: actingUser.id,
      });
      if (error) {
        res.status(500).json({ detail: error.message });
        return;
      }
      res.status(200).json({ data });
      return;
    }

    if (action === 'removeRole') {
      const { userId, roleCode } = req.body ?? {};
      if (typeof userId !== 'string' || typeof roleCode !== 'string') {
        res.status(422).json({ detail: 'userId and roleCode are required' });
        return;
      }
      const { data, error } = await supabase.rpc('call_center_users_remove_role', {
        p_user_id: userId,
        p_role_code: roleCode,
        p_actor_user_id: actingUser.id,
      });
      if (error) {
        res.status(500).json({ detail: error.message });
        return;
      }
      res.status(200).json({ data });
      return;
    }

    res.status(400).json({ detail: `Unknown action: ${action}` });
    return;
  }

  methodNotAllowed(res, ['GET', 'POST']);
});
