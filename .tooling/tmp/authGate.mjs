// api/_auth.ts
import { createClient } from "@supabase/supabase-js";
var client = null;
function getServiceRoleClient() {
  if (client) return client;
  const url = process.env.CUSTOMER360_SUPABASE_URL;
  const serviceRoleKey = process.env.CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("CUSTOMER360_SUPABASE_URL / CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY are not configured on the server");
  }
  client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return client;
}
function readBearerToken(req) {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
}
async function getAuthenticatedUser(req) {
  const token = readBearerToken(req);
  if (!token) return null;
  const supabase = getServiceRoleClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return null;
  const { data, error } = await supabase.rpc("call_center_users_resolve_identity", {
    p_provider: "supabase_auth",
    p_subject: authData.user.id
  });
  if (error || !data) return null;
  const identity = data;
  if (identity.status !== "active") return null;
  return {
    id: identity.id,
    email: identity.email,
    displayName: identity.displayName,
    status: identity.status,
    roles: identity.roles,
    permissions: identity.permissions
  };
}
function evaluatePermission(user, permissionKey) {
  if (!user || user.status !== "active") return { outcome: "unauthenticated" };
  if (!user.permissions.includes(permissionKey)) return { outcome: "forbidden" };
  return { outcome: "allowed" };
}
async function requirePermission(req, res, permissionKey) {
  const user = await getAuthenticatedUser(req);
  const evaluation = evaluatePermission(user, permissionKey);
  if (evaluation.outcome === "unauthenticated") {
    res.status(401).json({ detail: "Authentication required" });
    return null;
  }
  if (evaluation.outcome === "forbidden") {
    res.status(403).json({ detail: `Missing required permission: ${permissionKey}` });
    return null;
  }
  return user;
}
async function recordAuditEvent(params) {
  try {
    const supabase = getServiceRoleClient();
    await supabase.rpc("call_center_audit_record", {
      p_actor_type: params.actorType,
      p_actor_user_id: params.actorUserId,
      p_actor_label: params.actorLabel ?? null,
      p_action: params.action,
      p_resource_type: params.resourceType ?? null,
      p_resource_id: params.resourceId ?? null,
      p_result: params.result,
      p_metadata: params.metadata ?? null,
      p_request_id: params.requestId ?? null,
      p_source: params.source ?? null
    });
  } catch {
  }
}
export {
  evaluatePermission,
  getAuthenticatedUser,
  getServiceRoleClient,
  recordAuditEvent,
  requirePermission
};
