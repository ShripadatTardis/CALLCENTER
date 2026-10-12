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
    permissions: identity.permissions,
    dataScope: identity.dataScope
  };
}
function toAgentAccess(user) {
  return {
    role: user.id,
    allCategories: user.dataScope.allAgents,
    authorizedAgentIds: user.dataScope.allAgents ? "all" : user.dataScope.agentIds
  };
}
function isAgentIdInScope(access, agentId) {
  if (access.allCategories || access.authorizedAgentIds === "all") return true;
  return !!agentId && access.authorizedAgentIds.includes(agentId);
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

// src/server/analytics/callPopulationFetcher.ts
var DEFAULT_PAGE_SIZE = 100;
var DEFAULT_MAX_PAGES = 30;
var CallDataFetchError = class extends Error {
  kind;
  status;
  constructor(kind, message, status = null) {
    super(message);
    this.name = "CallDataFetchError";
    this.kind = kind;
    this.status = status;
  }
};
async function fetchCallDataPage(filters, page, pageSize) {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new CallDataFetchError("unavailable", "VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
  }
  const query = {
    status: "inactive",
    page: String(page),
    page_size: String(pageSize)
  };
  if (filters.dateFrom) query.date_from = filters.dateFrom;
  if (filters.dateTo) query.date_to = filters.dateTo;
  if (filters.direction) query.direction = filters.direction;
  if (filters.outcome) query.outcome = filters.outcome;
  const search = new URLSearchParams(query).toString();
  let res;
  try {
    res = await fetch(`${baseUrl}/api/v1/call-data?${search}`, { headers: { "X-API-Key": apiKey } });
  } catch {
    throw new CallDataFetchError("unavailable", "Call Centre could not be reached.");
  }
  if (!res.ok) {
    const kind = res.status >= 400 && res.status < 500 ? "rejected" : "unavailable";
    throw new CallDataFetchError(kind, `call-data request failed: ${res.status}`, res.status);
  }
  return await res.json();
}
async function fetchCompleteCallPopulation(filters, maxPages = DEFAULT_MAX_PAGES, pageSize = DEFAULT_PAGE_SIZE) {
  const calls = [];
  let trueTotalRecords = 0;
  let capped = false;
  for (let page = 1; page <= maxPages; page++) {
    const dto = await fetchCallDataPage(filters, page, pageSize);
    calls.push(...dto.data.calls ?? []);
    trueTotalRecords = dto.data.pagination?.total_records ?? calls.length;
    const totalPages = dto.data.pagination?.total_pages ?? page;
    if (page >= totalPages) {
      capped = false;
      break;
    }
    if (page === maxPages) {
      capped = true;
    }
  }
  return { calls, trueTotalRecords, capped };
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
  const supabase = getServiceRoleClient();
  if (action === "setPermissions") {
    const { roleCode, permissionKeys } = req.body ?? {};
    if (typeof roleCode !== "string" || !Array.isArray(permissionKeys)) {
      res.status(422).json({ detail: "roleCode and permissionKeys (array) are required" });
      return;
    }
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
  if (action === "setAgentScope") {
    const { roleCode, allAgents, agentIds } = req.body ?? {};
    if (typeof roleCode !== "string" || typeof allAgents !== "boolean" || !Array.isArray(agentIds)) {
      res.status(422).json({ detail: "roleCode, allAgents (boolean), and agentIds (array) are required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_roles_set_agent_scope", {
      p_role_code: roleCode,
      p_all_agents: allAgents,
      p_agent_ids: agentIds,
      p_actor_user_id: actingUser.id
    });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }
  if (action === "setCustomerCategoryScope") {
    const { roleCode, allCategories, categoryIds } = req.body ?? {};
    if (typeof roleCode !== "string" || typeof allCategories !== "boolean" || !Array.isArray(categoryIds)) {
      res.status(422).json({ detail: "roleCode, allCategories (boolean), and categoryIds (array) are required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_roles_set_customer_category_scope", {
      p_role_code: roleCode,
      p_all_categories: allCategories,
      p_category_ids: categoryIds,
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
async function handleCustomerCategoriesGet(req, res) {
  const user = await requirePermission(req, res, "roles.view");
  if (!user) return;
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc("call_center_customer_categories_list");
  if (error) {
    res.status(500).json({ detail: error.message });
    return;
  }
  res.status(200).json({ data });
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
function toActionScopeArgs(access) {
  const allAgents = access.allCategories || access.authorizedAgentIds === "all";
  return { allAgents, authorizedAgentIds: allAgents ? [] : access.authorizedAgentIds };
}
function mapActionItemError(message) {
  if (/action_item_not_found/.test(message)) return 404;
  if (/assignment_not_permitted|ownership_required/.test(message)) return 403;
  if (/assignee_inactive_or_not_found|assignee_out_of_scope|invalid_status_transition/.test(message)) return 422;
  return 500;
}
var ACTION_ITEM_BOOTSTRAP_WINDOW_DAYS = 30;
function actionItemBootstrapWindow(days = ACTION_ITEM_BOOTSTRAP_WINDOW_DAYS) {
  const now = /* @__PURE__ */ new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1e3);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(now) };
}
async function runActionItemsGeneration(actor) {
  const { dateFrom, dateTo } = actionItemBootstrapWindow();
  const population = await fetchCompleteCallPopulation({ outcome: "escalated", dateFrom, dateTo }, 5, 100);
  const candidates = population.calls.map((c) => ({
    sourceInteractionId: c.call_id,
    agentId: c.ai_agent_id || c.agent_id || null,
    reasonText: c.escalation_trigger || null
  }));
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc("call_center_action_items_generate", {
    p_candidates: candidates,
    p_actor_type: actor.actorType,
    p_actor_user_id: actor.actorUserId
  });
  if (error) throw new Error(error.message);
  return data;
}
function isAuthorizedActionsCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}
async function handleActionsGet(req, res) {
  const action = queryStr(req, "action");
  if (action === "generate") {
    if (!isAuthorizedActionsCronRequest(req)) {
      res.status(401).json({ detail: "Invalid or missing cron authorization" });
      return;
    }
    try {
      const result = await runActionItemsGeneration({ actorType: "system", actorUserId: null });
      res.status(200).json({ data: { triggeredBy: "cron", ...result } });
    } catch (err) {
      res.status(502).json({ detail: err instanceof Error ? err.message : "Generation failed" });
    }
    return;
  }
  if (action === "eligibleAssignees") {
    const user2 = await requirePermission(req, res, "actions.resolve");
    if (!user2) return;
    const id = queryStr(req, "id");
    if (!id) {
      res.status(422).json({ detail: "id is required" });
      return;
    }
    const supabase2 = getServiceRoleClient();
    const { data: data2, error: error2 } = await supabase2.rpc("call_center_action_items_eligible_assignees", { p_id: id });
    if (error2) {
      res.status(500).json({ detail: error2.message });
      return;
    }
    res.status(200).json({ data: data2 });
    return;
  }
  const user = await requirePermission(req, res, "actions.view");
  if (!user) return;
  const { allAgents, authorizedAgentIds } = toActionScopeArgs(toAgentAccess(user));
  const supabase = getServiceRoleClient();
  if (action === "get") {
    const id = queryStr(req, "id");
    if (!id) {
      res.status(422).json({ detail: "id is required" });
      return;
    }
    const { data: data2, error: error2 } = await supabase.rpc("call_center_action_items_get", {
      p_id: id,
      p_all_agents: allAgents,
      p_authorized_agent_ids: authorizedAgentIds
    });
    if (error2) {
      res.status(500).json({ detail: error2.message });
      return;
    }
    if (!data2) {
      res.status(404).json({ detail: "Action item not found" });
      return;
    }
    res.status(200).json({ data: data2 });
    return;
  }
  const status = queryStr(req, "status") ?? null;
  const { data, error } = await supabase.rpc("call_center_action_items_list", {
    p_status: status,
    p_all_agents: allAgents,
    p_authorized_agent_ids: authorizedAgentIds
  });
  if (error) {
    res.status(500).json({ detail: error.message });
    return;
  }
  res.status(200).json({ data });
}
async function handleActionsPost(req, res) {
  const action = queryStr(req, "action");
  if (action === "generate") {
    const user = await requirePermission(req, res, "actions.view");
    if (!user) return;
    try {
      const result = await runActionItemsGeneration({ actorType: "user", actorUserId: user.id });
      res.status(200).json({ data: { triggeredBy: "manual", ...result } });
    } catch (err) {
      res.status(502).json({ detail: err instanceof Error ? err.message : "Generation failed" });
    }
    return;
  }
  const actingUser = await requirePermission(req, res, "actions.resolve");
  if (!actingUser) return;
  const actorHasManageAny = actingUser.permissions.includes("actions.assign");
  const supabase = getServiceRoleClient();
  if (action === "assign" || action === "takeOwnership") {
    const body = req.body ?? {};
    const id = body.id;
    const assigneeUserId = action === "takeOwnership" ? actingUser.id : body.assigneeUserId;
    if (typeof id !== "string" || typeof assigneeUserId !== "string") {
      res.status(422).json({ detail: "id (and assigneeUserId for assign) are required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_action_items_assign", {
      p_id: id,
      p_assignee_user_id: assigneeUserId,
      p_actor_user_id: actingUser.id,
      p_actor_has_manage_any: actorHasManageAny
    });
    if (error) {
      res.status(mapActionItemError(error.message)).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }
  if (action === "setStatus") {
    const { id, status } = req.body ?? {};
    if (typeof id !== "string" || typeof status !== "string") {
      res.status(422).json({ detail: "id and status are required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_action_items_set_status", {
      p_id: id,
      p_status: status,
      p_actor_user_id: actingUser.id,
      p_actor_has_manage_any: actorHasManageAny
    });
    if (error) {
      res.status(mapActionItemError(error.message)).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }
  if (action === "resolve") {
    const { id, resolutionCode, resolutionNote } = req.body ?? {};
    if (typeof id !== "string" || typeof resolutionCode !== "string") {
      res.status(422).json({ detail: "id and resolutionCode are required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_action_items_resolve", {
      p_id: id,
      p_resolution_code: resolutionCode,
      p_resolution_note: resolutionNote?.trim() || null,
      p_actor_user_id: actingUser.id,
      p_actor_has_manage_any: actorHasManageAny
    });
    if (error) {
      res.status(mapActionItemError(error.message)).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data });
    return;
  }
  res.status(400).json({ detail: `Unknown action: ${action}` });
}
function toCamelCaseDeep(value) {
  if (Array.isArray(value)) return value.map((v) => toCamelCaseDeep(v));
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      const camelKey = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
      out[camelKey] = toCamelCaseDeep(v);
    }
    return out;
  }
  return value;
}
function mapQaError(message) {
  if (/qa_review_not_found/.test(message)) return 404;
  if (/qa_review_already_submitted/.test(message)) return 409;
  if (/qa_review_incomplete/.test(message)) return 422;
  return 500;
}
async function loadOwnedReviewOrRespond(res, supabase, user, reviewId) {
  const { data, error } = await supabase.rpc("call_center_qa_review_get", { p_review_id: reviewId });
  if (error) {
    res.status(500).json({ detail: error.message });
    return null;
  }
  const review = data ? toCamelCaseDeep(data) : null;
  if (!review) {
    res.status(404).json({ detail: "QA review not found" });
    return null;
  }
  if (review.reviewerUserId !== user.id) {
    res.status(404).json({ detail: "QA review not found" });
    return null;
  }
  if (!isAgentIdInScope(toAgentAccess(user), review.agentId)) {
    res.status(404).json({ detail: "QA review not found" });
    return null;
  }
  return review;
}
function qaReviewViewAuthorized(params) {
  if (params.ownerUserId === params.callerUserId) return true;
  return params.status === "submitted" && params.callerHasAnalyticsPermission;
}
async function loadReviewForViewing(res, supabase, user, reviewId) {
  const { data, error } = await supabase.rpc("call_center_qa_review_get", { p_review_id: reviewId });
  if (error) {
    res.status(500).json({ detail: error.message });
    return null;
  }
  const review = data ? toCamelCaseDeep(data) : null;
  if (!review) {
    res.status(404).json({ detail: "QA review not found" });
    return null;
  }
  const authorized = qaReviewViewAuthorized({
    ownerUserId: review.reviewerUserId,
    callerUserId: user.id,
    status: review.status,
    callerHasAnalyticsPermission: user.permissions.includes("qa.analytics.view")
  });
  if (!authorized) {
    res.status(404).json({ detail: "QA review not found" });
    return null;
  }
  if (!isAgentIdInScope(toAgentAccess(user), review.agentId)) {
    res.status(404).json({ detail: "QA review not found" });
    return null;
  }
  return review;
}
async function handleQaGet(req, res) {
  const action = queryStr(req, "action");
  const supabase = getServiceRoleClient();
  if (action === "review") {
    const user = await getAuthenticatedUser(req);
    if (!user || !user.permissions.includes("qa.review") && !user.permissions.includes("qa.analytics.view")) {
      res.status(user ? 403 : 401).json({ detail: user ? "Missing required permission: qa.review or qa.analytics.view" : "Authentication required" });
      return;
    }
    const reviewId = queryStr(req, "reviewId");
    if (!reviewId) {
      res.status(422).json({ detail: "reviewId is required" });
      return;
    }
    const review = await loadReviewForViewing(res, supabase, user, reviewId);
    if (!review) return;
    res.status(200).json({ data: review });
    return;
  }
  if (action === "listForInteraction") {
    const user = await getAuthenticatedUser(req);
    if (!user || !user.permissions.includes("qa.review") && !user.permissions.includes("qa.analytics.view")) {
      res.status(user ? 403 : 401).json({ detail: user ? "Missing required permission: qa.review or qa.analytics.view" : "Authentication required" });
      return;
    }
    const interactionId = queryStr(req, "interactionId");
    const channel = queryStr(req, "channel");
    if (!interactionId || channel !== "voice" && channel !== "chat") {
      res.status(422).json({ detail: 'interactionId and channel ("voice"|"chat") are required' });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_qa_review_list_for_interaction", {
      p_interaction_id: interactionId,
      p_channel: channel
    });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    const access = toAgentAccess(user);
    const rows = toCamelCaseDeep(data ?? []).filter((r) => isAgentIdInScope(access, r.agentId));
    res.status(200).json({ data: rows });
    return;
  }
  if (action === "findings" || action === "population") {
    const user = await requirePermission(req, res, "qa.analytics.view");
    if (!user) return;
    const access = toAgentAccess(user);
    const allAgents = access.allCategories || access.authorizedAgentIds === "all";
    const authorizedAgentIds = allAgents ? [] : access.authorizedAgentIds;
    const channel = queryStr(req, "channel");
    const dateFrom = queryStr(req, "dateFrom");
    const dateTo = queryStr(req, "dateTo");
    const reviewerUserId = queryStr(req, "reviewerUserId");
    if (channel && channel !== "voice" && channel !== "chat") {
      res.status(422).json({ detail: 'channel must be "voice" or "chat"' });
      return;
    }
    if (action === "findings") {
      const { data: data2, error: error2 } = await supabase.rpc("call_center_qa_findings_list", {
        p_authorized_agent_ids: authorizedAgentIds,
        p_all_agents: allAgents,
        p_channel: channel ?? null,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
        p_reviewer_user_id: reviewerUserId ?? null
      });
      if (error2) {
        res.status(500).json({ detail: error2.message });
        return;
      }
      res.status(200).json({ data: toCamelCaseDeep(data2) });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_qa_reviews_population", {
      p_authorized_agent_ids: authorizedAgentIds,
      p_all_agents: allAgents,
      p_channel: channel ?? null,
      p_date_from: dateFrom ?? null,
      p_date_to: dateTo ?? null,
      p_reviewer_user_id: reviewerUserId ?? null
    });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }
  res.status(400).json({ detail: `Unknown action: ${action}` });
}
async function handleQaPost(req, res) {
  const user = await requirePermission(req, res, "qa.review");
  if (!user) return;
  const action = queryStr(req, "action");
  const supabase = getServiceRoleClient();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (action === "start") {
    const { interactionId, channel, agentId } = req.body ?? {};
    if (typeof interactionId !== "string" || channel !== "voice" && channel !== "chat" || typeof agentId !== "string") {
      res.status(422).json({ detail: 'interactionId, channel ("voice"|"chat"), and agentId are required' });
      return;
    }
    if (!isAgentIdInScope(toAgentAccess(user), agentId)) {
      res.status(404).json({ detail: "Interaction not found" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_qa_review_start", {
      p_interaction_id: interactionId,
      p_channel: channel,
      p_agent_id: agentId,
      p_reviewer_user_id: user.id,
      p_now: now
    });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    const started = toCamelCaseDeep(data);
    await recordAuditEvent({
      actorType: "user",
      actorUserId: user.id,
      action: "qa_review.started",
      resourceType: "qa_review",
      resourceId: started?.id ?? null,
      result: "success",
      metadata: { interactionId, channel, agentId },
      source: "api/admin"
    });
    res.status(200).json({ data: started });
    return;
  }
  const { reviewId } = req.body ?? {};
  if (typeof reviewId !== "string") {
    res.status(422).json({ detail: "reviewId is required" });
    return;
  }
  const review = await loadOwnedReviewOrRespond(res, supabase, user, reviewId);
  if (!review) return;
  if (action === "initTurns") {
    const { turns } = req.body ?? {};
    if (!Array.isArray(turns)) {
      res.status(422).json({ detail: "turns (array) is required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_qa_review_init_turns", {
      p_review_id: reviewId,
      p_turns: turns,
      p_now: now
    });
    if (error) {
      res.status(mapQaError(error.message)).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }
  if (action === "submitTurn") {
    const { turnId, role, status, findings } = req.body ?? {};
    if (typeof turnId !== "string" || role !== "agent" && role !== "customer" || typeof status !== "string") {
      res.status(422).json({ detail: 'turnId, role ("agent"|"customer"), and status are required' });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_qa_turn_submit", {
      p_review_id: reviewId,
      p_turn_id: turnId,
      p_role: role,
      p_status: status,
      p_findings: Array.isArray(findings) ? findings : null,
      p_now: now
    });
    if (error) {
      res.status(mapQaError(error.message)).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }
  if (action === "setConclusions") {
    const { requestCompletion, fcr, humanAssistanceRequired, businessOutcome, reviewerNote } = req.body ?? {};
    const { data, error } = await supabase.rpc("call_center_qa_review_set_conclusions", {
      p_review_id: reviewId,
      p_request_completion: requestCompletion ?? null,
      p_fcr: fcr ?? null,
      p_human_assistance_required: humanAssistanceRequired ?? null,
      p_business_outcome: businessOutcome ?? null,
      p_reviewer_note: reviewerNote?.trim() || null,
      p_now: now
    });
    if (error) {
      res.status(mapQaError(error.message)).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }
  if (action === "submit") {
    const { data, error } = await supabase.rpc("call_center_qa_review_submit", { p_review_id: reviewId, p_now: now });
    if (error) {
      res.status(mapQaError(error.message)).json({ detail: error.message });
      return;
    }
    await recordAuditEvent({
      actorType: "user",
      actorUserId: user.id,
      action: "qa_review.submitted",
      resourceType: "qa_review",
      resourceId: reviewId,
      result: "success",
      metadata: { interactionId: review.interactionId, channel: review.channel, agentId: review.agentId },
      source: "api/admin"
    });
    res.status(200).json({ data: toCamelCaseDeep(data) });
    return;
  }
  res.status(400).json({ detail: `Unknown action: ${action}` });
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
  if (resource === "customerCategories") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }
    await handleCustomerCategoriesGet(req, res);
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
  if (resource === "actions") {
    if (req.method === "GET") {
      await handleActionsGet(req, res);
      return;
    }
    if (req.method === "POST") {
      await handleActionsPost(req, res);
      return;
    }
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }
  if (resource === "qa") {
    if (req.method === "GET") {
      await handleQaGet(req, res);
      return;
    }
    if (req.method === "POST") {
      await handleQaPost(req, res);
      return;
    }
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }
  res.status(400).json({ detail: "Unknown or missing ?resource= \u2014 use me, users, roles, permissions, audit, actions, or qa" });
});
export {
  actionItemBootstrapWindow,
  admin_default as default,
  getAppOrigin,
  mapActionItemError,
  qaReviewViewAuthorized,
  toActionScopeArgs
};
