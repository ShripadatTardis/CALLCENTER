import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore, methodNotAllowed } from './_voicebot.js';
import { requirePermission, getServiceRoleClient } from './_auth.js';

/**
 * /api/roles — Role Management (Session 14.1). GET (roles.view) lists
 * roles with their permission sets and user counts, and (with
 * ?resource=permissions) the full permission vocabulary for the matrix
 * UI. POST ?action=setPermissions (roles.manage) replaces a role's
 * permission set atomically and audits the change.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);
  const supabase = getServiceRoleClient();

  if (req.method === 'GET') {
    const user = await requirePermission(req, res, 'roles.view');
    if (!user) return;

    if (req.query.resource === 'permissions') {
      const { data, error } = await supabase.rpc('call_center_permissions_list');
      if (error) {
        res.status(500).json({ detail: error.message });
        return;
      }
      res.status(200).json({ data });
      return;
    }

    const { data, error } = await supabase.rpc('call_center_roles_list');
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }

  if (req.method === 'POST') {
    const actingUser = await requirePermission(req, res, 'roles.manage');
    if (!actingUser) return;

    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    if (action === 'setPermissions') {
      const { roleCode, permissionKeys } = req.body ?? {};
      if (typeof roleCode !== 'string' || !Array.isArray(permissionKeys)) {
        res.status(422).json({ detail: 'roleCode and permissionKeys (array) are required' });
        return;
      }
      const { data, error } = await supabase.rpc('call_center_roles_set_permissions', {
        p_role_code: roleCode,
        p_permission_keys: permissionKeys,
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
