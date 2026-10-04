// api/_voicebot.ts
function withErrorBoundary(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      res.status(500).json({
        detail: err instanceof Error ? err.message : "Internal server error"
      });
    }
  };
}
function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  res.status(405).json({ detail: `Method not allowed. Use ${allowed.join(" or ")}.` });
}
function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

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

// api/admin.ts
function queryStr(req, key) {
  const raw = req.query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}
function getAppOrigin() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:8080";
}
async function findAuthUserIdByEmail(supabase, email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
async function handleMe(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ detail: "No Call Centre profile for this identity" });
    return;
  }
  res.status(200).json({ data: user });
}
async function enrichWithIdentityStatus(supabase, rows) {
  const result = {};
  await Promise.all(
    rows.map(async (row) => {
      const subject = row.identitySubject;
      if (!subject) {
        result[row.id] = "unknown";
        return;
      }
      try {
        const { data, error } = await supabase.auth.admin.getUserById(subject);
        if (error || !data?.user) {
          result[row.id] = "unknown";
          return;
        }
        result[row.id] = data.user.confirmed_at || data.user.email_confirmed_at ? "confirmed" : "pending";
      } catch {
        result[row.id] = "unknown";
      }
    })
  );
  return result;
}
async function handleUsersGet(req, res) {
  const user = await requirePermission(req, res, "users.view");
  if (!user) return;
  const supabase = getServiceRoleClient();
  const userId = queryStr(req, "id");
  if (userId) {
    const { data: data2, error: error2 } = await supabase.rpc("call_center_users_get_detail", { p_user_id: userId });
    if (error2) {
      res.status(500).json({ detail: error2.message });
      return;
    }
    if (!data2) {
      res.status(404).json({ detail: "User not found" });
      return;
    }
    res.status(200).json({ data: data2 });
    return;
  }
  const { data, error } = await supabase.rpc("call_center_users_list");
  if (error) {
    res.status(500).json({ detail: error.message });
    return;
  }
  const rows = data ?? [];
  const identityStatus = await enrichWithIdentityStatus(supabase, rows.map((r) => ({ id: r.id, identitySubject: r.identitySubject })));
  res.status(200).json({
    data: rows.map(({ identitySubject: _identitySubject, ...rest }) => ({
      ...rest,
      identityStatus: identityStatus[rest.id] ?? "unknown"
    }))
  });
}
async function handleUsersPost(req, res) {
  const actingUser = await requirePermission(req, res, "users.manage");
  if (!actingUser) return;
  const action = queryStr(req, "action");
  const supabase = getServiceRoleClient();
  if (action === "setStatus") {
    const { userId, status } = req.body ?? {};
    if (typeof userId !== "string" || status !== "active" && status !== "inactive") {
      res.status(422).json({ detail: 'userId and status ("active"|"inactive") are required' });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_users_set_status", { p_user_id: userId, p_status: status, p_actor_user_id: actingUser.id });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }
  if (action === "assignRole") {
    const { userId, roleCode } = req.body ?? {};
    if (typeof userId !== "string" || typeof roleCode !== "string") {
      res.status(422).json({ detail: "userId and roleCode are required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_users_assign_role", { p_user_id: userId, p_role_code: roleCode, p_actor_user_id: actingUser.id });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }
  if (action === "removeRole") {
    const { userId, roleCode } = req.body ?? {};
    if (typeof userId !== "string" || typeof roleCode !== "string") {
      res.status(422).json({ detail: "userId and roleCode are required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_users_remove_role", { p_user_id: userId, p_role_code: roleCode, p_actor_user_id: actingUser.id });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }
  if (action === "provision") {
    await handleUsersProvision(req, res, actingUser, supabase);
    return;
  }
  res.status(400).json({ detail: `Unknown action: ${action}` });
}
async function handleUsersProvision(req, res, actingUser, supabase) {
  const { email, displayName, roleCode } = req.body ?? {};
  if (typeof email !== "string" || !email.trim() || typeof roleCode !== "string" || !roleCode.trim()) {
    res.status(422).json({ detail: "email and roleCode are required" });
    return;
  }
  const normalizedEmail = email.trim();
  const { data: existing, error: existingError } = await supabase.rpc("call_center_users_find_by_email", { p_email: normalizedEmail });
  if (existingError) {
    res.status(500).json({ detail: existingError.message });
    return;
  }
  if (existing) {
    res.status(409).json({ detail: "A Call Centre user already exists for this email.", data: existing });
    return;
  }
  const redirectTo = `${getAppOrigin()}/reset-password`;
  const invite = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: displayName ? { display_name: displayName } : void 0
  });
  let authUserId = null;
  if (invite.error) {
    const alreadyRegistered = /already.*(registered|exists)/i.test(invite.error.message);
    if (!alreadyRegistered) {
      await recordAuditEvent({
        actorType: "user",
        actorUserId: actingUser.id,
        action: "user.provision_failed",
        resourceType: "user",
        resourceId: null,
        result: "error",
        metadata: { email: normalizedEmail, stage: "invite" },
        source: "api/admin"
      });
      res.status(502).json({ detail: `Invitation failed: ${invite.error.message}` });
      return;
    }
    authUserId = await findAuthUserIdByEmail(supabase, normalizedEmail);
    if (!authUserId) {
      await recordAuditEvent({
        actorType: "user",
        actorUserId: actingUser.id,
        action: "user.provision_failed",
        resourceType: "user",
        resourceId: null,
        result: "error",
        metadata: { email: normalizedEmail, stage: "resolve_existing_identity" },
        source: "api/admin"
      });
      res.status(502).json({ detail: "This email already has a Supabase Auth identity, but it could not be resolved." });
      return;
    }
  } else {
    authUserId = invite.data.user.id;
  }
  const { data: provisioned, error: provisionError } = await supabase.rpc("call_center_users_provision", {
    p_identity_provider: "supabase_auth",
    p_identity_subject: authUserId,
    p_email: normalizedEmail,
    p_display_name: displayName?.trim() || null,
    p_role_code: roleCode,
    p_actor_user_id: actingUser.id
  });
  if (provisionError) {
    const unknownRole = /unknown_role_code/.test(provisionError.message);
    res.status(unknownRole ? 422 : 500).json({
      detail: unknownRole ? `Unknown role: ${roleCode}` : provisionError.message
    });
    return;
  }
  res.status(201).json({ data: provisioned });
}
async function handleRolesGet(req, res) {
  const user = await requirePermission(req, res, "roles.view");
  if (!user) return;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc("call_center_roles_list");
  if (error) {
    res.status(500).json({ detail: error.message });
    return;
  }
  res.status(200).json({ data });
}
async function handlePermissionsGet(req, res) {
  const user = await requirePermission(req, res, "roles.view");
  if (!user) return;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc("call_center_permissions_list");
  if (error) {
    res.status(500).json({ detail: error.message });
    return;
  }
  res.status(200).json({ data });
}
async function handleRolesPost(req, res) {
  const actingUser = await requirePermission(req, res, "roles.manage");
  if (!actingUser) return;
  const action = queryStr(req, "action");
  if (action === "setPermissions") {
    const { roleCode, permissionKeys } = req.body ?? {};
    if (typeof roleCode !== "string" || !Array.isArray(permissionKeys)) {
      res.status(422).json({ detail: "roleCode and permissionKeys (array) are required" });
      return;
    }
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc("call_center_roles_set_permissions", {
      p_role_code: roleCode,
      p_permission_keys: permissionKeys,
      p_actor_user_id: actingUser.id
    });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }
  res.status(400).json({ detail: `Unknown action: ${action}` });
}
async function handleAuditGet(req, res) {
  const user = await requirePermission(req, res, "audit.view");
  if (!user) return;
  const limitRaw = queryStr(req, "limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : 100;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc("call_center_audit_list", {
    p_limit: Number.isFinite(limit) ? limit : 100,
    p_actor_user_id: queryStr(req, "actorUserId") ?? null,
    p_action: queryStr(req, "action") ?? null,
    p_resource_type: queryStr(req, "resourceType") ?? null,
    p_result: queryStr(req, "result") ?? null
  });
  if (error) {
    res.status(500).json({ detail: error.message });
    return;
  }
  res.status(200).json({ data });
}
var admin_default = withErrorBoundary(async (req, res) => {
  noStore(res);
  const resource = queryStr(req, "resource");
  if (resource === "me") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }
    await handleMe(req, res);
    return;
  }
  if (resource === "users") {
    if (req.method === "GET") {
      await handleUsersGet(req, res);
      return;
    }
    if (req.method === "POST") {
      await handleUsersPost(req, res);
      return;
    }
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }
  if (resource === "roles") {
    if (req.method === "GET") {
      await handleRolesGet(req, res);
      return;
    }
    if (req.method === "POST") {
      await handleRolesPost(req, res);
      return;
    }
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }
  if (resource === "permissions") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }
    await handlePermissionsGet(req, res);
    return;
  }
  if (resource === "audit") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }
    await handleAuditGet(req, res);
    return;
  }
  res.status(400).json({ detail: "Unknown or missing ?resource= \u2014 use me, users, roles, permissions, or audit" });
});
export {
  admin_default as default,
  getAppOrigin
};
