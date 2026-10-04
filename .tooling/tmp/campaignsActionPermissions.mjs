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
function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

// src/server/customer360/supabaseCustomerRepository.ts
import { createClient } from "@supabase/supabase-js";
var client = null;
function getClient() {
  if (client) return client;
  const url = process.env.CUSTOMER360_SUPABASE_URL;
  const serviceRoleKey = process.env.CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("CUSTOMER360_SUPABASE_URL / CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY are not configured on the server");
  }
  client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return client;
}
async function rpc(fn, args) {
  const { data, error } = await getClient().rpc(fn, args);
  if (error) throw new Error(`Supabase RPC ${fn} error: ${error.message}`);
  return data;
}
function mapCustomer(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    sourceCustomerRef: row.source_customer_ref,
    primaryPhoneMasked: row.primary_phone_masked ?? null,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    totalInteractions: row.total_interactions,
    inboundCount: row.inbound_count,
    outboundCount: row.outbound_count,
    latestIntent: row.latest_intent,
    latestOutcome: row.latest_outcome,
    latestSentimentLabel: row.latest_sentiment_label,
    latestSentimentScore: row.latest_sentiment_score,
    escalationCount: row.escalation_count,
    channels: row.channels ?? [],
    latestAgentId: row.latest_agent_id,
    latestAgentDisplayName: row.latest_agent_display_name,
    authSummary: row.auth_summary,
    aggregationVersion: row.aggregation_version,
    aggregatedAt: row.aggregated_at
  };
}
function mapContactPoint(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    rawValue: row.raw_value,
    normalizedValue: row.normalized_value,
    isPrimary: row.is_primary,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen
  };
}
function mapInteraction(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    contactPointId: row.contact_point_id,
    interactionId: row.interaction_id,
    channel: row.channel,
    direction: row.direction,
    agentId: row.agent_id,
    agentDisplayName: row.agent_display_name,
    categoryId: row.category_id,
    startedAt: row.started_at,
    durationSeconds: row.duration_seconds,
    intent: row.intent,
    outcome: row.outcome,
    sentimentScore: row.sentiment_score,
    wasAuthenticated: row.was_authenticated,
    escalationTrigger: row.escalation_trigger,
    campaignName: row.campaign_name,
    recordingAvailable: row.recording_available,
    source: row.source
  };
}
function agentIdsArg(authorizedAgentIds) {
  return authorizedAgentIds === "all" ? { p_agent_ids: null, p_all: true } : { p_agent_ids: authorizedAgentIds, p_all: false };
}
var supabaseCustomerRepository = {
  async getCustomer(customerId) {
    const row = await rpc("call_center_get_customer", { p_id: customerId });
    return row ? mapCustomer(row) : null;
  },
  async getCustomerAuthorized(customerId, authorizedAgentIds) {
    const { p_agent_ids, p_all } = agentIdsArg(authorizedAgentIds);
    const row = await rpc("call_center_get_customer_authorized", {
      p_id: customerId,
      p_agent_ids,
      p_all
    });
    return row ? mapCustomer(row) : null;
  },
  async findContactPoint(type, normalizedValue) {
    const row = await rpc("call_center_find_contact_point", {
      p_type: type,
      p_normalized: normalizedValue
    });
    return row ? mapContactPoint(row) : null;
  },
  async listContactPoints(customerId) {
    const rows = await rpc("call_center_list_contact_points", { p_customer_id: customerId });
    return (rows ?? []).map(mapContactPoint);
  },
  async createCustomerWithContactPoint({ type, rawValue, normalizedValue, displayName, now }) {
    const result = await rpc(
      "call_center_create_customer_with_contact_point",
      { p_type: type, p_raw: rawValue, p_normalized: normalizedValue, p_display_name: displayName, p_now: now }
    );
    return { customer: mapCustomer(result.customer), contactPoint: mapContactPoint(result.contactPoint) };
  },
  async touchContactPoint(contactPointId, seenAt) {
    await rpc("call_center_touch_contact_point", { p_id: contactPointId, p_seen_at: seenAt });
  },
  async upsertInteraction(input) {
    const result = await rpc("call_center_upsert_interaction", {
      p_payload: {
        customerId: input.customerId,
        contactPointId: input.contactPointId,
        interactionId: input.interactionId,
        channel: input.channel,
        direction: input.direction,
        agentId: input.agentId,
        agentDisplayName: input.agentDisplayName,
        startedAt: input.startedAt,
        durationSeconds: input.durationSeconds,
        intent: input.intent,
        outcome: input.outcome,
        sentimentScore: input.sentimentScore,
        wasAuthenticated: input.wasAuthenticated,
        escalationTrigger: input.escalationTrigger,
        campaignName: input.campaignName,
        recordingAvailable: input.recordingAvailable,
        source: input.source
      }
    });
    return result;
  },
  async listInteractions(customerId, { page = 1, pageSize = 25, authorizedAgentIds }) {
    const { p_agent_ids, p_all } = agentIdsArg(authorizedAgentIds);
    const result = await rpc("call_center_list_interactions", {
      p_customer_id: customerId,
      p_page: page,
      p_page_size: pageSize,
      p_agent_ids,
      p_all
    });
    return { rows: (result.rows ?? []).map(mapInteraction), totalCount: result.totalCount ?? 0 };
  },
  async listAllInteractions(customerId, authorizedAgentIds) {
    const { p_agent_ids, p_all } = agentIdsArg(authorizedAgentIds);
    const rows = await rpc("call_center_list_all_interactions", {
      p_customer_id: customerId,
      p_agent_ids,
      p_all
    });
    return (rows ?? []).map(mapInteraction);
  },
  async recomputeCustomerAggregate(customerId, now) {
    const row = await rpc("call_center_recompute_customer_aggregate", {
      p_customer_id: customerId,
      p_now: now
    });
    return mapCustomer(row);
  },
  async listCustomers({ search, authorizedAgentIds, page = 1, pageSize = 25 }) {
    const { p_agent_ids, p_all } = agentIdsArg(authorizedAgentIds);
    const result = await rpc("call_center_list_customers", {
      p_search: search ?? null,
      p_agent_ids,
      p_all,
      p_page: page,
      p_page_size: pageSize
    });
    return { rows: (result.rows ?? []).map(mapCustomer), totalCount: result.totalCount ?? 0 };
  },
  async listCategories() {
    const rows = await rpc(
      "call_center_list_categories",
      {}
    );
    return (rows ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description, active: r.active }));
  },
  async getCategoryAgentMap() {
    const obj = await rpc("call_center_get_category_agent_map", {});
    return new Map(Object.entries(obj ?? {}));
  },
  async upsertCategoryForAgent(agentId, categoryName) {
    await rpc("call_center_upsert_category_for_agent", { p_agent_id: agentId, p_category_name: categoryName });
  },
  async getRoleAccess(role) {
    const result = await rpc("call_center_get_role_access", { p_role: role });
    return { role: result.role, allCategories: result.allCategories, categoryIds: result.categoryIds ?? [] };
  },
  async getHighWaterMark(source = "voice") {
    return rpc("call_center_get_high_water_mark", { p_source: source });
  },
  async setHighWaterMark(iso, source = "voice") {
    await rpc("call_center_set_high_water_mark", { p_iso: iso, p_source: source });
  },
  async refreshInteractionCategoryCache(agentId, categoryId) {
    const count = await rpc("call_center_refresh_interaction_category_cache", {
      p_agent_id: agentId,
      p_category_id: categoryId
    });
    return count ?? 0;
  },
  async findCustomerByExternalIdentity(source, identityType, identityValue) {
    const row = await rpc("call_center_find_customer_by_external_identity", {
      p_source: source,
      p_identity_type: identityType,
      p_identity_value: identityValue
    });
    return row ? mapCustomer(row) : null;
  },
  async attachExternalIdentity(customerId, source, identityType, identityValue, now) {
    await rpc("call_center_attach_external_identity", {
      p_customer_id: customerId,
      p_source: source,
      p_identity_type: identityType,
      p_identity_value: identityValue,
      p_now: now
    });
  },
  async addContactPointToCustomer(customerId, type, rawValue, normalizedValue, now) {
    const row = await rpc("call_center_add_contact_point_to_customer", {
      p_customer_id: customerId,
      p_type: type,
      p_raw: rawValue,
      p_normalized: normalizedValue,
      p_now: now
    });
    return mapContactPoint(row);
  },
  async createCustomer(now) {
    const row = await rpc("call_center_create_customer", { p_now: now });
    return mapCustomer(row);
  },
  async mergeCustomers(survivorId, loserId, now, reason) {
    const result = await rpc("call_center_merge_customers", {
      p_survivor_id: survivorId,
      p_loser_id: loserId,
      p_now: now,
      p_reason: reason
    });
    return {
      survivor: mapCustomer(result.survivor),
      interactionsMoved: result.interactionsMoved ?? 0,
      contactPointsMoved: result.contactPointsMoved ?? 0,
      campaignTargetsMoved: result.campaignTargetsMoved ?? 0,
      externalIdentitiesMoved: result.externalIdentitiesMoved ?? 0
    };
  }
};

// src/server/customer360/authorizationService.ts
async function resolveAuthorizedAccess(repo3, role) {
  const access = await repo3.getRoleAccess(role);
  if (access.allCategories) {
    return { role, allCategories: true, authorizedAgentIds: "all" };
  }
  if (access.categoryIds.length === 0) {
    return { role, allCategories: false, authorizedAgentIds: [] };
  }
  const categoryAgentMap = await repo3.getCategoryAgentMap();
  const authorizedCategorySet = new Set(access.categoryIds);
  const authorizedAgentIds = Array.from(categoryAgentMap.entries()).filter(([, categoryId]) => authorizedCategorySet.has(categoryId)).map(([agentId]) => agentId);
  return { role, allCategories: false, authorizedAgentIds };
}

// api/_customer360.ts
var repo = supabaseCustomerRepository;
function getClientSuppliedRole(req) {
  const header = req.headers["x-user-role"];
  const role = Array.isArray(header) ? header[0] : header;
  return role || "unauthenticated";
}
async function resolveAccessForRequest(req) {
  const role = getClientSuppliedRole(req);
  return resolveAuthorizedAccess(repo, role);
}
function requireAdminToken(req, res) {
  const expected = process.env.CUSTOMER360_ADMIN_TOKEN;
  if (!expected) {
    res.status(500).json({ detail: "CUSTOMER360_ADMIN_TOKEN is not configured on the server" });
    return false;
  }
  const header = req.headers["x-admin-token"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (provided !== expected) {
    res.status(401).json({ detail: "Invalid or missing admin token" });
    return false;
  }
  return true;
}
function readIntQuery(req, key, fallback) {
  const raw = req.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

// api/_auth.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
var client2 = null;
function getServiceRoleClient() {
  if (client2) return client2;
  const url = process.env.CUSTOMER360_SUPABASE_URL;
  const serviceRoleKey = process.env.CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("CUSTOMER360_SUPABASE_URL / CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY are not configured on the server");
  }
  client2 = createClient2(url, serviceRoleKey, { auth: { persistSession: false } });
  return client2;
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

// src/server/campaigns/supabaseCampaignRepository.ts
import { createClient as createClient3 } from "@supabase/supabase-js";

// src/lib/phoneIdentity.ts
function normalizePhoneNumber(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return digits;
}

// src/server/customer360/identityResolver.ts
var EXTERNAL_IDENTITY_SOURCE = "voice_agent_backend";
var EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID = "customer_id";
function pickSurvivor(a, b) {
  if (a.totalInteractions !== b.totalInteractions) {
    return a.totalInteractions > b.totalInteractions ? { survivor: a, loser: b } : { survivor: b, loser: a };
  }
  return new Date(a.firstSeen).getTime() <= new Date(b.firstSeen).getTime() ? { survivor: a, loser: b } : { survivor: b, loser: a };
}
async function resolveCustomerIdentity(repo3, signal, now) {
  const normalized = signal.phoneNumber ? normalizePhoneNumber(signal.phoneNumber) : null;
  if (!signal.externalCustomerId && !normalized && !signal.preferredCustomerId) return null;
  const byIdentity = signal.externalCustomerId ? await repo3.findCustomerByExternalIdentity(EXTERNAL_IDENTITY_SOURCE, EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID, signal.externalCustomerId) : null;
  const byPhoneContactPoint = normalized ? await repo3.findContactPoint("phone", normalized) : null;
  if (byIdentity && byPhoneContactPoint && byIdentity.id !== byPhoneContactPoint.customerId) {
    const phoneCustomer = await repo3.getCustomer(byPhoneContactPoint.customerId);
    if (!phoneCustomer) {
      return { customerId: byIdentity.id, contactPointId: byPhoneContactPoint.id, merged: false, created: false };
    }
    const { survivor, loser } = pickSurvivor(byIdentity, phoneCustomer);
    await repo3.mergeCustomers(
      survivor.id,
      loser.id,
      now,
      `external-identity-merge:${EXTERNAL_IDENTITY_SOURCE}:${EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID}:${signal.externalCustomerId}`
    );
    await repo3.recomputeCustomerAggregate(survivor.id, now);
    return { customerId: survivor.id, contactPointId: byPhoneContactPoint.id, merged: true, created: false };
  }
  if (byIdentity) {
    let contactPointId = byPhoneContactPoint?.id ?? null;
    if (normalized && !byPhoneContactPoint) {
      const cp = await repo3.addContactPointToCustomer(byIdentity.id, "phone", signal.phoneNumber, normalized, now);
      contactPointId = cp.id;
    }
    return { customerId: byIdentity.id, contactPointId, merged: false, created: false };
  }
  if (signal.preferredCustomerId && (!byPhoneContactPoint || byPhoneContactPoint.customerId === signal.preferredCustomerId)) {
    const preferred = await repo3.getCustomer(signal.preferredCustomerId);
    if (preferred) {
      let contactPointId = byPhoneContactPoint?.id ?? null;
      if (normalized && !byPhoneContactPoint) {
        const cp = await repo3.addContactPointToCustomer(preferred.id, "phone", signal.phoneNumber, normalized, now);
        contactPointId = cp.id;
      }
      if (signal.externalCustomerId) {
        await repo3.attachExternalIdentity(preferred.id, EXTERNAL_IDENTITY_SOURCE, EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID, signal.externalCustomerId, now);
      }
      return { customerId: preferred.id, contactPointId, merged: false, created: false };
    }
  }
  if (byPhoneContactPoint) {
    if (signal.externalCustomerId) {
      await repo3.attachExternalIdentity(
        byPhoneContactPoint.customerId,
        EXTERNAL_IDENTITY_SOURCE,
        EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID,
        signal.externalCustomerId,
        now
      );
    }
    return { customerId: byPhoneContactPoint.customerId, contactPointId: byPhoneContactPoint.id, merged: false, created: false };
  }
  if (normalized) {
    const newCustomer = await repo3.createCustomerWithContactPoint({
      type: "phone",
      rawValue: signal.phoneNumber,
      normalizedValue: normalized,
      displayName: null,
      now
    });
    if (signal.externalCustomerId) {
      await repo3.attachExternalIdentity(newCustomer.customer.id, EXTERNAL_IDENTITY_SOURCE, EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID, signal.externalCustomerId, now);
    }
    return { customerId: newCustomer.customer.id, contactPointId: newCustomer.contactPoint.id, merged: false, created: true };
  }
  if (signal.externalCustomerId) {
    const newCustomer = await repo3.createCustomer(now);
    await repo3.attachExternalIdentity(newCustomer.id, EXTERNAL_IDENTITY_SOURCE, EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID, signal.externalCustomerId, now);
    return { customerId: newCustomer.id, contactPointId: null, merged: false, created: true };
  }
  return null;
}

// src/server/campaigns/supabaseCampaignRepository.ts
var client3 = null;
function getClient2() {
  if (client3) return client3;
  const url = process.env.CUSTOMER360_SUPABASE_URL;
  const serviceRoleKey = process.env.CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("CUSTOMER360_SUPABASE_URL / CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY are not configured on the server");
  }
  client3 = createClient3(url, serviceRoleKey, { auth: { persistSession: false } });
  return client3;
}
async function rpc2(fn, args) {
  const { data, error } = await getClient2().rpc(fn, args);
  if (error) throw new Error(`Supabase RPC ${fn} error: ${error.message}`);
  return data;
}
function mapCampaign(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    agentId: row.agent_id,
    agentName: row.agent_name ?? null,
    agentContractSnapshot: row.agent_contract_snapshot ?? null,
    outcomePolicySnapshot: row.outcome_policy_snapshot ?? null,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scheduledStartAt: row.scheduled_start_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    sourceMeta: row.source_meta
  };
}
function mapStats(row) {
  return {
    targetCount: row?.target_count ?? 0,
    triggeredCount: row?.triggered_count ?? 0,
    classifiedCount: row?.classified_count ?? 0,
    successCount: row?.success_count ?? 0,
    policyClassifiedCount: row?.policy_classified_count ?? 0,
    policySuccessfulCount: row?.policy_successful_count ?? 0,
    classificationCounts: row?.classification_counts ?? {}
  };
}
function mapRule(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    priority: row.priority,
    matchField: row.match_field,
    matchValue: row.match_value,
    resultCode: row.result_code,
    resultLabel: row.result_label,
    isSuccess: row.is_success,
    nextActionType: row.next_action_type,
    nextActionDelayDays: row.next_action_delay_days,
    active: row.active
  };
}
function mapMapping(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    agentInputFieldCode: row.agent_input_field_code,
    sourceType: row.source_type,
    sourceField: row.source_field,
    required: row.required,
    dataType: row.data_type,
    configurationVersionId: row.configuration_version_id ?? null
  };
}
function mapTargetRow(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    customerId: row.customer_id,
    contactPointId: row.contact_point_id,
    status: row.status,
    sourceAttributes: row.source_attributes ?? {},
    attemptCount: row.attempt_count,
    lastActionAt: row.last_action_at,
    nextActionAt: row.next_action_at,
    effectiveResultId: row.effective_result_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactRawValue: row.contact_raw_value,
    customerDisplayName: row.customer_display_name,
    campaignResultCode: row.campaign_result_code,
    campaignResultLabel: row.campaign_result_label,
    resultIsSuccess: row.result_is_success,
    resultNextAction: row.result_next_action,
    // Session 12.5 — undefined (not an explicit null) on the
    // Customer360-scoped listCustomerTargets row shape, since that SQL
    // function deliberately does not select these columns (item 10:
    // no duplication of the Campaign-specific result model into
    // Customer360); `?? null` normalizes both cases to the same
    // honest "not available here" value.
    resultActualOutcomeCode: row.result_actual_outcome_code ?? null,
    resultActualOutcomeName: row.result_actual_outcome_name ?? null,
    resultStructuredOutputs: row.result_structured_outputs ?? null,
    resultClassificationCode: row.result_classification_code ?? null,
    resultClassificationContractDrift: row.result_classification_contract_drift ?? false,
    resultClassificationNextActionType: row.result_classification_next_action_type ?? null,
    latestExecutionStatus: row.latest_execution_status,
    latestReconciliationStatus: row.latest_reconciliation_status,
    latestReconciledInteractionId: row.latest_reconciled_interaction_id,
    latestConfigurationVersionId: row.latest_configuration_version_id ?? null,
    skipReasonCode: row.skip_reason_code ?? null,
    skipComment: row.skip_comment ?? null,
    holdReason: row.hold_reason ?? null,
    holdNote: row.hold_note ?? null,
    originalSourceAttributes: row.original_source_attributes ?? null,
    importBatchId: row.import_batch_id ?? null
  };
}
function mapCustomerTargetRow(row) {
  return {
    ...mapTargetRow(row),
    campaignName: row.campaign_name,
    campaignAgentId: row.campaign_agent_id,
    campaignAgentName: row.campaign_agent_name
  };
}
function mapRunnableTarget(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    customerId: row.customer_id,
    contactPointId: row.contact_point_id,
    status: row.status,
    sourceAttributes: row.source_attributes ?? {},
    attemptCount: row.attempt_count,
    lastActionAt: row.last_action_at,
    nextActionAt: row.next_action_at,
    effectiveResultId: row.effective_result_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactRawValue: row.contact_raw_value,
    sourceCustomerRef: row.source_customer_ref,
    campaignAgentId: row.campaign_agent_id
  };
}
function mapExecution(row) {
  return {
    id: row.id,
    campaignTargetId: row.campaign_target_id,
    sequence: row.sequence,
    status: row.status,
    callSid: row.call_sid,
    reconciliationStatus: row.reconciliation_status,
    reconciledInteractionId: row.reconciled_interaction_id,
    reconciliationCandidate: row.reconciliation_candidate,
    reconciledAt: row.reconciled_at,
    triggeredAt: row.triggered_at,
    errorDetail: row.error_detail,
    createdAt: row.created_at,
    requestPayloadSnapshot: row.request_payload_snapshot ?? null,
    configurationVersionId: row.configuration_version_id ?? null
  };
}
function mapFollowup(row) {
  return {
    id: row.id,
    campaignTargetId: row.campaign_target_id,
    campaignResultId: row.campaign_result_id,
    followUpType: row.follow_up_type,
    dueAt: row.due_at,
    status: row.status,
    nextCampaignId: row.next_campaign_id,
    notes: row.notes,
    createdAt: row.created_at
  };
}
function mapConfigurationVersion(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    versionNumber: row.version_number,
    status: row.status,
    agentId: row.agent_id,
    agentName: row.agent_name,
    agentContractSnapshot: row.agent_contract_snapshot ?? null,
    outcomePolicySnapshot: row.outcome_policy_snapshot ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by,
    changeReason: row.change_reason,
    previousVersionId: row.previous_version_id
  };
}
function mapAuditEvent(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    eventType: row.event_type,
    actor: row.actor,
    occurredAt: row.occurred_at,
    campaignTargetId: row.campaign_target_id,
    campaignExecutionId: row.campaign_execution_id,
    configurationVersionId: row.configuration_version_id,
    reason: row.reason,
    comment: row.comment,
    detail: row.detail
  };
}
function mapSkipReason(row) {
  return {
    code: row.code,
    label: row.label,
    description: row.description,
    requiresComment: row.requires_comment,
    sortOrder: row.sort_order,
    active: row.active
  };
}
function mapTargetMutationResult(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    customerId: row.customer_id,
    contactPointId: row.contact_point_id,
    status: row.status,
    sourceAttributes: row.source_attributes ?? {},
    attemptCount: row.attempt_count,
    lastActionAt: row.last_action_at,
    nextActionAt: row.next_action_at,
    effectiveResultId: row.effective_result_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    skipReasonCode: row.skip_reason_code,
    skipComment: row.skip_comment,
    holdReason: row.hold_reason,
    holdNote: row.hold_note,
    originalSourceAttributes: row.original_source_attributes,
    importBatchId: row.import_batch_id
  };
}
var supabaseCampaignRepository = {
  async createCampaign({ name, description, agentId, createdBy, sourceMeta, now, rules, agentName, agentContractSnapshot, mappings, outcomePolicySnapshot }) {
    const row = await rpc2("call_center_campaign_create", {
      p_name: name,
      p_description: description,
      p_agent_id: agentId,
      p_created_by: createdBy,
      p_source_meta: sourceMeta,
      p_now: now,
      p_rules: rules.map((r) => ({
        priority: r.priority,
        matchField: r.matchField,
        matchValue: r.matchValue,
        resultCode: r.resultCode,
        resultLabel: r.resultLabel,
        isSuccess: r.isSuccess,
        nextActionType: r.nextActionType,
        nextActionDelayDays: r.nextActionDelayDays,
        active: r.active
      })),
      p_agent_name: agentName ?? null,
      p_agent_contract_snapshot: agentContractSnapshot ?? null,
      p_mappings: (mappings ?? []).map((m) => ({
        agentInputFieldCode: m.agentInputFieldCode,
        sourceType: m.sourceType,
        sourceField: m.sourceField,
        required: m.required,
        dataType: m.dataType
      })),
      p_outcome_policy_snapshot: outcomePolicySnapshot ?? null
    });
    return mapCampaign(row);
  },
  async listClassifications() {
    const rows = await rpc2("call_center_campaign_classifications_list", {});
    return (rows ?? []).map((r) => ({
      code: r.code,
      label: r.label,
      description: r.description,
      isSuccess: r.is_success,
      isFallbackUnresolved: r.is_fallback_unresolved,
      sortOrder: r.sort_order,
      active: r.active
    }));
  },
  async setInputMappings(campaignId, mappings) {
    const rows = await rpc2("call_center_campaign_set_input_mappings", {
      p_campaign_id: campaignId,
      p_mappings: mappings.map((m) => ({
        agentInputFieldCode: m.agentInputFieldCode,
        sourceType: m.sourceType,
        sourceField: m.sourceField,
        required: m.required,
        dataType: m.dataType
      }))
    });
    return (rows ?? []).map(mapMapping);
  },
  async listCampaigns(page, pageSize) {
    const result = await rpc2("call_center_campaign_list", {
      p_page: page,
      p_page_size: pageSize
    });
    const rows = (result.rows ?? []).map((row) => ({
      ...mapCampaign(row),
      stats: mapStats(row)
    }));
    return { rows, totalCount: result.totalCount ?? 0 };
  },
  async getCampaign(id) {
    const result = await rpc2(
      "call_center_campaign_get",
      { p_id: id }
    );
    if (!result) return null;
    const detail = {
      ...mapCampaign(result),
      rules: (result.rules ?? []).map(mapRule),
      mappings: (result.mappings ?? []).map(mapMapping),
      stats: mapStats(result.stats)
    };
    return detail;
  },
  async updateCampaignStatus(id, status, now) {
    const row = await rpc2("call_center_campaign_update_status", { p_id: id, p_status: status, p_now: now });
    return mapCampaign(row);
  },
  /**
   * Session 11.5A correction (docs/SCREEN_REVIEW_05_CUSTOMER_360.md §11,
   * docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md §C): every row now
   * resolves through the SAME identityResolver.ts precedence Voice/Chat
   * already use (CIF -> phone -> create) instead of the old
   * call_center_campaign_import_targets bulk RPC's phone-only SQL-side
   * match. That RPC is left in the schema, unused by this path.
   */
  async importTargets(campaignId, rows, now) {
    let customersCreated = 0;
    let customersMatched = 0;
    let rowsSkipped = 0;
    for (const row of rows) {
      if (!row.phone || !row.phone.trim()) {
        rowsSkipped++;
        continue;
      }
      const resolved = await resolveCustomerIdentity(
        supabaseCustomerRepository,
        { externalCustomerId: row.customerReference || null, phoneNumber: row.phone, preferredCustomerId: null },
        now
      );
      if (!resolved || !resolved.contactPointId) {
        rowsSkipped++;
        continue;
      }
      await rpc2("call_center_campaign_insert_resolved_target", {
        p_campaign_id: campaignId,
        p_customer_id: resolved.customerId,
        p_contact_point_id: resolved.contactPointId,
        p_source_attributes: row.sourceAttributes,
        p_now: now
      });
      if (resolved.created) customersCreated++;
      else customersMatched++;
    }
    return { customersCreated, customersMatched, rowsSkipped };
  },
  async listTargets(campaignId, page, pageSize) {
    const result = await rpc2("call_center_campaign_list_targets", {
      p_campaign_id: campaignId,
      p_page: page,
      p_page_size: pageSize
    });
    return { rows: (result.rows ?? []).map(mapTargetRow), totalCount: result.totalCount ?? 0 };
  },
  async listCustomerTargets(customerId) {
    const rows = await rpc2("call_center_campaign_list_customer_targets", {
      p_customer_id: customerId
    });
    return (rows ?? []).map(mapCustomerTargetRow);
  },
  async selectRunnableTargets(batchSize) {
    const rows = await rpc2("call_center_campaign_select_runnable_targets", { p_batch_size: batchSize });
    return (rows ?? []).map(mapRunnableTarget);
  },
  async createExecution(targetId, now, requestPayloadSnapshot) {
    const row = await rpc2("call_center_campaign_create_execution", {
      p_target_id: targetId,
      p_now: now,
      p_request_payload_snapshot: requestPayloadSnapshot ?? null
    });
    return mapExecution(row);
  },
  async markExecutionTriggered(executionId, callSid, now) {
    await rpc2("call_center_campaign_mark_execution_triggered", { p_execution_id: executionId, p_call_sid: callSid, p_now: now });
  },
  async markExecutionFailed(executionId, errorDetail) {
    await rpc2("call_center_campaign_mark_execution_failed", { p_execution_id: executionId, p_error_detail: errorDetail });
  },
  async listPendingReconciliations(limit) {
    const rows = await rpc2("call_center_campaign_list_pending_reconciliations", { p_limit: limit });
    return (rows ?? []).map((row) => ({
      ...mapExecution(row),
      customerId: row.customer_id,
      campaignId: row.campaign_id,
      contactRawValue: row.contact_raw_value
    }));
  },
  // Session 12.5 §7 — same row shape as listPendingReconciliations
  // (both join executions -> targets -> contact points identically),
  // just a disjoint WHERE clause server-side; reuses the same
  // PendingReconciliationRow/mapExecution mapping rather than a
  // parallel shape.
  async listReconciledMissingActualOutcome(limit) {
    const rows = await rpc2("call_center_campaign_list_reconciled_missing_actual_outcome", { p_limit: limit });
    return (rows ?? []).map((row) => ({
      ...mapExecution(row),
      customerId: row.customer_id,
      campaignId: row.campaign_id,
      contactRawValue: row.contact_raw_value
    }));
  },
  async enrichActualOutcome(executionId, actualOutcomeCode, actualOutcomeName, structuredOutputs, now, classification) {
    const outcome = await rpc2(
      "call_center_campaign_enrich_actual_outcome",
      {
        p_execution_id: executionId,
        p_actual_outcome_code: actualOutcomeCode,
        p_actual_outcome_name: actualOutcomeName,
        p_structured_outputs: structuredOutputs,
        p_now: now,
        p_campaign_classification_code: classification?.campaignClassificationCode ?? null,
        p_classification_contract_drift: classification?.classificationContractDrift ?? false,
        p_classification_next_action_type: classification?.classificationNextActionType ?? null
      }
    );
    return outcome;
  },
  async updateReconciliationStatus(executionId, status, reconciledInteractionId, candidate, now, result) {
    const payload = result ? {
      callStatus: result.callStatus,
      callOutcome: result.callOutcome,
      intent: result.intent,
      resultCode: result.resultCode,
      resultLabel: result.resultLabel,
      isSuccess: result.isSuccess,
      resultDetail: result.resultDetail,
      resultSource: result.resultSource,
      nextAction: result.nextAction,
      nextActionType: result.nextActionType,
      agentId: result.agentId,
      agentName: result.agentName,
      structuredOutputs: result.structuredOutputs,
      actualOutcomeCode: result.actualOutcomeCode,
      actualOutcomeName: result.actualOutcomeName,
      campaignClassificationCode: result.campaignClassificationCode,
      classificationContractDrift: result.classificationContractDrift,
      classificationNextActionType: result.classificationNextActionType
    } : null;
    const outcome = await rpc2("call_center_campaign_update_reconciliation_status", {
      p_execution_id: executionId,
      p_status: status,
      p_reconciled_interaction_id: reconciledInteractionId,
      p_candidate: candidate,
      p_now: now,
      p_result: payload
    });
    return outcome;
  },
  async createFollowup({ targetId, resultId, type, dueAt, nextCampaignId, notes, now }) {
    const row = await rpc2("call_center_campaign_create_followup", {
      p_target_id: targetId,
      p_result_id: resultId,
      p_type: type,
      p_due_at: dueAt,
      p_next_campaign_id: nextCampaignId,
      p_notes: notes,
      p_now: now
    });
    return mapFollowup(row);
  },
  async retryTarget(targetId, now, actor, reason) {
    return rpc2("call_center_campaign_retry_target", {
      p_target_id: targetId,
      p_now: now,
      p_actor: actor ?? null,
      p_reason: reason ?? null
    });
  },
  async getTargetContext(targetId) {
    return rpc2(
      "call_center_campaign_get_target_context",
      { p_target_id: targetId }
    );
  },
  async listSkipReasons() {
    const rows = await rpc2("call_center_campaign_skip_reasons_list", {});
    return (rows ?? []).map(mapSkipReason);
  },
  async listConfigurationVersions(campaignId) {
    const rows = await rpc2("call_center_campaign_list_configuration_versions", {
      p_campaign_id: campaignId
    });
    return (rows ?? []).map(mapConfigurationVersion);
  },
  async getConfigurationVersion(versionId) {
    const row = await rpc2("call_center_campaign_get_configuration_version", {
      p_version_id: versionId
    });
    return row ? mapConfigurationVersion(row) : null;
  },
  async listAuditEvents(campaignId, limit = 200) {
    const rows = await rpc2("call_center_campaign_list_audit_events", {
      p_campaign_id: campaignId,
      p_limit: limit
    });
    return (rows ?? []).map(mapAuditEvent);
  },
  async createConfigurationVersion({
    campaignId,
    expectedCurrentVersionId,
    now,
    actor,
    reason,
    agentId,
    agentName,
    agentContractSnapshot,
    outcomePolicySnapshot,
    mappings,
    eventType
  }) {
    const result = await rpc2(
      "call_center_campaign_create_configuration_version",
      {
        p_campaign_id: campaignId,
        p_expected_current_version_id: expectedCurrentVersionId,
        p_now: now,
        p_actor: actor,
        p_reason: reason,
        p_agent_id: agentId ?? null,
        p_agent_name: agentName ?? null,
        p_agent_contract_snapshot: agentContractSnapshot ?? null,
        p_outcome_policy_snapshot: outcomePolicySnapshot ?? null,
        p_mappings: mappings ? mappings.map((m) => ({
          agentInputFieldCode: m.agentInputFieldCode,
          sourceType: m.sourceType,
          sourceField: m.sourceField,
          required: m.required,
          dataType: m.dataType
        })) : null,
        p_event_type: eventType ?? "outcome_mapping_changed"
      }
    );
    return result;
  },
  async updateDraftConfiguration({ campaignId, now, actor, agentId, agentName, agentContractSnapshot, outcomePolicySnapshot, mappings }) {
    const row = await rpc2("call_center_campaign_update_draft_configuration", {
      p_campaign_id: campaignId,
      p_now: now,
      p_actor: actor,
      p_agent_id: agentId ?? null,
      p_agent_name: agentName ?? null,
      p_agent_contract_snapshot: agentContractSnapshot ?? null,
      p_outcome_policy_snapshot: outcomePolicySnapshot ?? null,
      p_mappings: mappings ? mappings.map((m) => ({
        agentInputFieldCode: m.agentInputFieldCode,
        sourceType: m.sourceType,
        sourceField: m.sourceField,
        required: m.required,
        dataType: m.dataType
      })) : null
    });
    return mapCampaign(row);
  },
  async setStatusAudited(id, status, now, actor, reason) {
    const row = await rpc2("call_center_campaign_set_status_audited", {
      p_id: id,
      p_status: status,
      p_now: now,
      p_actor: actor,
      p_reason: reason
    });
    return mapCampaign(row);
  },
  async skipTarget(targetId, reasonCode, comment, now, actor) {
    const row = await rpc2("call_center_campaign_skip_target", {
      p_target_id: targetId,
      p_reason_code: reasonCode,
      p_comment: comment,
      p_now: now,
      p_actor: actor
    });
    return mapTargetMutationResult(row);
  },
  async holdTarget(targetId, reason, note, now, actor) {
    const row = await rpc2("call_center_campaign_hold_target", {
      p_target_id: targetId,
      p_reason: reason,
      p_note: note,
      p_now: now,
      p_actor: actor
    });
    return mapTargetMutationResult(row);
  },
  async releaseHold(targetId, now, actor) {
    const row = await rpc2("call_center_campaign_release_hold", {
      p_target_id: targetId,
      p_now: now,
      p_actor: actor
    });
    return mapTargetMutationResult(row);
  },
  async amendTarget(targetId, sourceAttributes, now, actor, reason) {
    const row = await rpc2("call_center_campaign_amend_target", {
      p_target_id: targetId,
      p_source_attributes: sourceAttributes,
      p_now: now,
      p_actor: actor,
      p_reason: reason
    });
    return mapTargetMutationResult(row);
  },
  /**
   * §12 — reuses the exact same identityResolver.ts-based per-row path
   * as importTargets above (never the old phone-only SQL bulk path),
   * then stamps the resulting target ids with one batch id via
   * call_center_campaign_stamp_import_batch (see migration
   * 20261013000000_campaign_configuration_version_lookup_and_batch_stamp.sql)
   * — precise id-based stamping, not a timestamp heuristic.
   */
  async addTargets(campaignId, rows, now, actor) {
    let customersCreated = 0;
    let customersMatched = 0;
    let rowsSkipped = 0;
    const createdTargetIds = [];
    for (const row of rows) {
      if (!row.phone || !row.phone.trim()) {
        rowsSkipped++;
        continue;
      }
      const resolved = await resolveCustomerIdentity(
        supabaseCustomerRepository,
        { externalCustomerId: row.customerReference || null, phoneNumber: row.phone, preferredCustomerId: null },
        now
      );
      if (!resolved || !resolved.contactPointId) {
        rowsSkipped++;
        continue;
      }
      const target = await rpc2("call_center_campaign_insert_resolved_target", {
        p_campaign_id: campaignId,
        p_customer_id: resolved.customerId,
        p_contact_point_id: resolved.contactPointId,
        p_source_attributes: row.sourceAttributes,
        p_now: now
      });
      createdTargetIds.push(target.id);
      if (resolved.created) customersCreated++;
      else customersMatched++;
    }
    const batchId = crypto.randomUUID();
    if (createdTargetIds.length > 0) {
      await rpc2("call_center_campaign_stamp_import_batch", {
        p_campaign_id: campaignId,
        p_target_ids: createdTargetIds,
        p_batch_id: batchId,
        p_now: now,
        p_actor: actor
      });
    }
    return { customersCreated, customersMatched, rowsSkipped, batchId };
  }
};

// src/server/campaigns/inputMapping.ts
function validateInputMapping(contract, mappings) {
  const mappedCodes = new Set(mappings.map((m) => m.agentInputFieldCode));
  const missingRequiredFieldCodes = contract.expectedInputFields.filter((f) => f.required && !mappedCodes.has(f.fieldCode)).map((f) => f.fieldCode);
  return { valid: missingRequiredFieldCodes.length === 0, missingRequiredFieldCodes };
}
function validateMappingSourceUniqueness(mappings) {
  const counts = /* @__PURE__ */ new Map();
  for (const m of mappings) {
    if (!m.sourceField) continue;
    const key = `${m.sourceType}:${m.sourceField}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateSourceKeys = Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key);
  return { valid: duplicateSourceKeys.length === 0, duplicateSourceKeys };
}
function resolveMappedInputValues(mappings, sources) {
  const values = {};
  const unresolvedRequiredFieldCodes = [];
  for (const mapping of mappings) {
    const sourceBag = mapping.sourceType === "customer360" ? sources.customer360Fields : mapping.sourceType === "csv" ? sources.csvFields : sources.campaignFields;
    const value = sourceBag[mapping.sourceField];
    if (value === void 0 || value === null || value === "") {
      if (mapping.required) unresolvedRequiredFieldCodes.push(mapping.agentInputFieldCode);
      continue;
    }
    values[mapping.agentInputFieldCode] = value;
  }
  return { values, unresolvedRequiredFieldCodes };
}

// src/server/campaigns/triggerCallPayload.ts
function buildTriggerCallPayload(target, contract, mappings) {
  const { values, unresolvedRequiredFieldCodes: unresolvedMapped } = resolveMappedInputValues(mappings, {
    customer360Fields: { phone_number: target.contactRawValue, customer_id: target.sourceCustomerRef ?? void 0 },
    csvFields: target.sourceAttributes ?? {},
    campaignFields: {}
  });
  const missingMapping = contract ? validateInputMapping(contract, mappings).missingRequiredFieldCodes : [];
  const unresolvedRequiredFieldCodes = Array.from(/* @__PURE__ */ new Set([...missingMapping, ...unresolvedMapped]));
  const request = {
    to_phone_number: target.contactRawValue,
    agent_id: target.campaignAgentId,
    // Never fabricated — only populated when Customer 360 already has a
    // sourceCustomerRef for this customer (unchanged from the original
    // Session 5 behavior).
    customer_id: target.sourceCustomerRef ?? void 0
  };
  const declaredFieldCodes = new Set((contract?.expectedInputFields ?? []).map((f) => f.fieldCode));
  if (declaredFieldCodes.size > 0) {
    const agentInputs = {};
    let hasAny = false;
    for (const [code, value] of Object.entries(values)) {
      if (!declaredFieldCodes.has(code)) continue;
      agentInputs[code] = value;
      hasAny = true;
    }
    if (hasAny) request.agent_inputs = agentInputs;
  }
  return { request, resolvedInputValues: values, unresolvedRequiredFieldCodes };
}

// src/server/campaigns/campaignRunner.ts
function classifyTriggerCallFailure(status, body, text) {
  const bodyStr = typeof body === "object" ? JSON.stringify(body) : text;
  if (status === 409) {
    const code = typeof body === "object" && body !== null ? body.error : void 0;
    if (code === "idempotency_key_conflict") {
      return `Trigger Call idempotency conflict: the same Idempotency-Key was reused with a different request body \u2014 no call was placed. ${bodyStr}`;
    }
    if (code === "request_in_progress") {
      return `Trigger Call idempotency conflict: a request with this Idempotency-Key is already in progress \u2014 no additional call was placed. ${bodyStr}`;
    }
    return `Trigger Call idempotency conflict (409): ${bodyStr}`;
  }
  if (status === 503) {
    return `Trigger Call failed: 503 (Voice Gateway unavailable \u2014 nothing was dialled, safe to retry via retryTarget) ${bodyStr}`;
  }
  return `Trigger Call failed: ${status} ${bodyStr}`;
}
var voiceAgentCallBackend = {
  async triggerCall(payload, idempotencyKey) {
    const baseUrl = process.env.VOICEBOT_BASE_URL;
    const apiKey = process.env.VOICEBOT_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
    }
    const res = await fetch(`${baseUrl}/api/v1/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey, "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : void 0;
    if (!res.ok) {
      throw new Error(classifyTriggerCallFailure(res.status, body, text));
    }
    if (body && typeof body === "object" && "error" in body) {
      throw new Error(`Trigger Call gateway error: ${JSON.stringify(body)}`);
    }
    return body;
  }
};
async function runCampaignBatch(repo3, backend, batchSize) {
  const targets = await repo3.selectRunnableTargets(batchSize);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const campaignCache = /* @__PURE__ */ new Map();
  async function getCampaignContract(campaignId) {
    const cached = campaignCache.get(campaignId);
    if (cached) return cached;
    const campaign = await repo3.getCampaign(campaignId);
    const entry = { contract: campaign?.agentContractSnapshot ?? null, mappings: campaign?.mappings ?? [] };
    campaignCache.set(campaignId, entry);
    return entry;
  }
  let triggered = 0;
  let failed = 0;
  for (const target of targets) {
    const { contract, mappings } = await getCampaignContract(target.campaignId);
    const built = buildTriggerCallPayload(target, contract, mappings);
    const execution = await repo3.createExecution(target.id, now, built.request);
    if (built.unresolvedRequiredFieldCodes.length > 0) {
      await repo3.markExecutionFailed(
        execution.id,
        `Not dialled \u2014 missing required agent input value(s): ${built.unresolvedRequiredFieldCodes.join(", ")}`
      );
      failed++;
      continue;
    }
    try {
      const result = await backend.triggerCall(built.request, execution.id);
      await repo3.markExecutionTriggered(execution.id, result.call_sid, (/* @__PURE__ */ new Date()).toISOString());
      triggered++;
    } catch (err) {
      await repo3.markExecutionFailed(execution.id, err instanceof Error ? err.message : "Trigger Call failed");
      failed++;
    }
  }
  return { processed: targets.length, triggered, failed };
}

// src/server/campaigns/resultRules.ts
function deriveCampaignResult(callData, rules) {
  const fieldValue = {
    status: callData.status,
    outcome: callData.outcome,
    escalation_trigger: callData.escalation_trigger,
    intent: callData.intent,
    // Session 12.5 §9 — made available as a matchField so an operator
    // CAN configure a campaign_result_rule against the agent-specific
    // actual_outcome_code if they choose to (e.g. treat a specific
    // business outcome as the success signal for that campaign's
    // outcome policy), without this function — or defaultResultRules()
    // below — ever doing so automatically. A campaign with no rule
    // referencing this field behaves byte-for-byte as before.
    actual_outcome_code: callData.actual_outcome_code
  };
  const actualOutcomeCode = callData.actual_outcome_code ?? null;
  const actualOutcomeName = callData.actual_outcome_name ?? null;
  const structuredOutputs = callData.structured_outputs ?? null;
  const active = rules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  const match = active.find((rule) => fieldValue[rule.matchField] === rule.matchValue);
  if (!match) {
    return {
      callStatus: callData.status ?? null,
      callOutcome: callData.outcome ?? null,
      intent: callData.intent ?? null,
      resultCode: "unclassified",
      resultLabel: "Unclassified",
      isSuccess: null,
      resultDetail: null,
      resultSource: "rule_match",
      nextAction: null,
      nextActionType: null,
      // Session 9.1 Phase 7 — filled in by the caller (reconcileExecutions.ts)
      // from the campaign's own agent snapshot; this pure function never
      // has campaign context, so it always defaults these to null.
      agentId: null,
      agentName: null,
      structuredOutputs,
      actualOutcomeCode,
      actualOutcomeName,
      // Session 12.6 fields — this pure function has no campaign outcome-
      // policy context, so it never derives a classification itself. The
      // real caller (reconcileExecutions.ts) always spreads its own
      // deriveCampaignClassification() result over this return value, so
      // these defaults are only ever a fallback, matching the same
      // "no policy captured" null/false/null deriveCampaignClassification
      // itself returns.
      campaignClassificationCode: null,
      classificationContractDrift: false,
      classificationNextActionType: null
    };
  }
  const nextAction = match.nextActionType && match.nextActionDelayDays != null ? `${match.nextActionType} in ${match.nextActionDelayDays}d` : match.nextActionType ?? null;
  return {
    callStatus: callData.status ?? null,
    callOutcome: callData.outcome ?? null,
    intent: callData.intent ?? null,
    resultCode: match.resultCode,
    resultLabel: match.resultLabel,
    isSuccess: match.isSuccess,
    resultDetail: null,
    resultSource: "rule_match",
    nextAction,
    nextActionType: match.nextActionType,
    agentId: null,
    agentName: null,
    structuredOutputs,
    actualOutcomeCode,
    actualOutcomeName,
    // See the no-match branch above for why these default to the
    // "no classification derived here" state.
    campaignClassificationCode: null,
    classificationContractDrift: false,
    classificationNextActionType: null
  };
}
function defaultResultRules() {
  return [
    {
      priority: 10,
      matchField: "escalation_trigger",
      matchValue: "escalated",
      resultCode: "needs_review",
      resultLabel: "Needs manual review",
      isSuccess: false,
      nextActionType: "escalate",
      nextActionDelayDays: null,
      active: true
    },
    {
      priority: 20,
      matchField: "outcome",
      matchValue: "resolved",
      resultCode: "resolved",
      resultLabel: "Resolved",
      isSuccess: true,
      nextActionType: "close",
      nextActionDelayDays: null,
      active: true
    }
  ];
}

// src/server/campaigns/outcomePolicy.ts
function deriveCampaignClassification(actualOutcomeCode, policy, unresolvedFallbackCode) {
  if (!actualOutcomeCode) {
    return { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null };
  }
  if (!policy) {
    return { campaignClassificationCode: null, classificationContractDrift: false, classificationNextActionType: null };
  }
  const mapping = policy.mappings.find((m) => m.agentOutcomeCode === actualOutcomeCode);
  if (mapping) {
    return {
      campaignClassificationCode: mapping.campaignClassificationCode,
      classificationContractDrift: false,
      classificationNextActionType: mapping.nextActionType
    };
  }
  return {
    campaignClassificationCode: unresolvedFallbackCode,
    classificationContractDrift: true,
    classificationNextActionType: null
  };
}

// src/server/campaigns/reconcileExecutions.ts
var MIN_AGE_MS = 2 * 60 * 1e3;
var UNRESOLVED_AFTER_MS = 30 * 60 * 1e3;
var CANDIDATE_WINDOW_MS = 10 * 60 * 1e3;
function getCorrelationMode() {
  const raw = process.env.CAMPAIGN_RECONCILIATION_CORRELATION_MODE;
  if (raw === "client_reference" || raw === "call_sid_equals_call_id") return raw;
  return null;
}
async function fetchCallData(query) {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
  }
  const search = new URLSearchParams(query).toString();
  const res = await fetch(`${baseUrl}/api/v1/call-data${search ? `?${search}` : ""}`, { headers: { "X-API-Key": apiKey } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : void 0;
  if (!res.ok) {
    throw new Error(`call-data request failed: ${res.status} ${typeof body === "object" ? JSON.stringify(body) : text}`);
  }
  return body;
}
async function tryAuthoritativeMatch(execution, mode) {
  if (!mode || !execution.callSid) return null;
  if (mode === "call_sid_equals_call_id") {
    if (!execution.triggeredAt) return null;
    const triggeredAt = new Date(execution.triggeredAt).getTime();
    const dateFrom = new Date(triggeredAt - CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
    const dateTo = new Date(triggeredAt + CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
    const dto = await fetchCallData({ date_from: dateFrom, date_to: dateTo, page_size: "25" });
    return dto.data.calls.find((c) => c.call_id === execution.callSid) ?? null;
  }
  return null;
}
async function findDiagnosticCandidate(execution) {
  const phoneNumber = execution.contactRawValue;
  if (!execution.triggeredAt) return null;
  const triggeredAt = new Date(execution.triggeredAt).getTime();
  const dateFrom = new Date(triggeredAt - CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
  const dateTo = new Date(triggeredAt + CANDIDATE_WINDOW_MS).toISOString().slice(0, 10);
  try {
    const dto = await fetchCallData({ search: phoneNumber, date_from: dateFrom, date_to: dateTo, page_size: "5" });
    return dto.data.calls[0] ?? null;
  } catch {
    return null;
  }
}
async function getUnresolvedFallbackCode(repo3) {
  const classifications = await repo3.listClassifications();
  return classifications.find((c) => c.isFallbackUnresolved)?.code ?? null;
}
function makeGoverningConfigResolver(repo3) {
  const campaignByCampaign = /* @__PURE__ */ new Map();
  const configByVersion = /* @__PURE__ */ new Map();
  async function getCampaignInfo(campaignId) {
    const cached = campaignByCampaign.get(campaignId);
    if (cached) return cached;
    const campaign = await repo3.getCampaign(campaignId);
    const entry = {
      rules: campaign?.rules ?? [],
      agentId: campaign?.agentId ?? null,
      agentName: campaign?.agentName ?? null,
      outcomePolicySnapshot: campaign?.outcomePolicySnapshot ?? null
    };
    campaignByCampaign.set(campaignId, entry);
    return entry;
  }
  return async function resolve(campaignId, configurationVersionId) {
    const liveCampaign = await getCampaignInfo(campaignId);
    if (!configurationVersionId) return liveCampaign;
    const cached = configByVersion.get(configurationVersionId);
    if (cached) return cached;
    const version = await repo3.getConfigurationVersion(configurationVersionId);
    const entry = version ? {
      rules: liveCampaign.rules,
      agentId: version.agentId,
      agentName: version.agentName,
      outcomePolicySnapshot: version.outcomePolicySnapshot
    } : liveCampaign;
    configByVersion.set(configurationVersionId, entry);
    return entry;
  };
}
async function reconcilePendingExecutions(repo3, limit = 25) {
  const mode = getCorrelationMode();
  const pending = await repo3.listPendingReconciliations(limit);
  const now = Date.now();
  const unresolvedFallbackCode = await getUnresolvedFallbackCode(repo3);
  const resolveGoverningConfig = makeGoverningConfigResolver(repo3);
  let reconciled = 0;
  let unresolved = 0;
  let stillPending = 0;
  let errors = 0;
  for (const execution of pending) {
    const triggeredAt = execution.triggeredAt ? new Date(execution.triggeredAt).getTime() : now;
    if (now - triggeredAt < MIN_AGE_MS) {
      stillPending++;
      continue;
    }
    try {
      const match = await tryAuthoritativeMatch(execution, mode);
      const candidateEntry = await findDiagnosticCandidate(execution);
      const candidate = candidateEntry ? { callId: candidateEntry.call_id, startTime: candidateEntry.start_time, phone: candidateEntry.caller_number } : null;
      if (match) {
        const { rules, agentId, agentName, outcomePolicySnapshot } = await resolveGoverningConfig(
          execution.campaignId,
          execution.configurationVersionId
        );
        const derivedBase = deriveCampaignResult(match, rules);
        const classification = deriveCampaignClassification(match.actual_outcome_code ?? null, outcomePolicySnapshot, unresolvedFallbackCode);
        const derived = { ...derivedBase, agentId, agentName, ...classification };
        await repo3.updateReconciliationStatus(execution.id, "reconciled", match.call_id, candidate, (/* @__PURE__ */ new Date()).toISOString(), derived);
        reconciled++;
        continue;
      }
      if (now - triggeredAt >= UNRESOLVED_AFTER_MS) {
        await repo3.updateReconciliationStatus(execution.id, "unresolved", null, candidate, (/* @__PURE__ */ new Date()).toISOString(), null);
        unresolved++;
      } else {
        if (candidate) {
          await repo3.updateReconciliationStatus(execution.id, "pending", null, candidate, (/* @__PURE__ */ new Date()).toISOString(), null);
        }
        stillPending++;
      }
    } catch (err) {
      await repo3.updateReconciliationStatus(
        execution.id,
        "error",
        null,
        null,
        (/* @__PURE__ */ new Date()).toISOString(),
        null
      ).catch(() => void 0);
      errors++;
    }
  }
  return { processed: pending.length, reconciled, unresolved, stillPending, errors };
}
async function enrichReconciledExecutionsWithActualOutcome(repo3, limit = 25) {
  const mode = getCorrelationMode();
  const candidates = await repo3.listReconciledMissingActualOutcome(limit);
  const unresolvedFallbackCode = await getUnresolvedFallbackCode(repo3);
  const resolveGoverningConfig = makeGoverningConfigResolver(repo3);
  let enriched = 0;
  let noActualOutcomeYet = 0;
  let skipped = 0;
  let errors = 0;
  for (const execution of candidates) {
    try {
      const match = await tryAuthoritativeMatch(execution, mode);
      if (!match || !match.actual_outcome_code) {
        noActualOutcomeYet++;
        continue;
      }
      const { outcomePolicySnapshot } = await resolveGoverningConfig(execution.campaignId, execution.configurationVersionId);
      const classification = deriveCampaignClassification(match.actual_outcome_code, outcomePolicySnapshot, unresolvedFallbackCode);
      const outcome = await repo3.enrichActualOutcome(
        execution.id,
        match.actual_outcome_code,
        match.actual_outcome_name ?? null,
        match.structured_outputs ?? null,
        (/* @__PURE__ */ new Date()).toISOString(),
        classification
      );
      if (outcome.enriched) {
        enriched++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
    }
  }
  return { processed: candidates.length, enriched, noActualOutcomeYet, skipped, errors };
}

// api/campaigns.ts
var repo2 = supabaseCampaignRepository;
function queryStr(req, key) {
  const raw = req.query[key];
  return Array.isArray(raw) ? raw[0] : raw;
}
function isAgentAuthorized(access, agentId) {
  return access.allCategories || access.authorizedAgentIds === "all" || access.authorizedAgentIds.includes(agentId);
}
function notFound(res) {
  res.status(404).json({ detail: "Campaign not found" });
}
async function handleListClassifications(_req, res) {
  const classifications = await repo2.listClassifications();
  res.status(200).json({ data: classifications });
}
async function handleList(req, res, access) {
  const page = readIntQuery(req, "page", 1);
  const pageSize = readIntQuery(req, "pageSize", 25);
  const { rows, totalCount } = await repo2.listCampaigns(page, pageSize);
  if (access.allCategories || access.authorizedAgentIds === "all") {
    res.status(200).json({ data: rows, pagination: { page, pageSize, totalCount } });
    return;
  }
  const authorized = new Set(access.authorizedAgentIds);
  const scopedRows = rows.filter((c) => authorized.has(c.agentId));
  res.status(200).json({
    data: scopedRows,
    pagination: { page, pageSize, totalCount: scopedRows.length },
    scoped: true
  });
}
async function handleGet(req, res, access) {
  const id = queryStr(req, "id");
  if (!id) {
    res.status(400).json({ detail: "id is required" });
    return;
  }
  const campaign = await repo2.getCampaign(id);
  if (!campaign) {
    notFound(res);
    return;
  }
  if (!isAgentAuthorized(access, campaign.agentId)) {
    notFound(res);
    return;
  }
  res.status(200).json(campaign);
}
async function handleListTargets(req, res, access) {
  const id = queryStr(req, "id");
  if (!id) {
    res.status(400).json({ detail: "id is required" });
    return;
  }
  const campaign = await repo2.getCampaign(id);
  if (!campaign || !isAgentAuthorized(access, campaign.agentId)) {
    notFound(res);
    return;
  }
  const page = readIntQuery(req, "page", 1);
  const pageSize = readIntQuery(req, "pageSize", 50);
  const { rows, totalCount } = await repo2.listTargets(id, page, pageSize);
  res.status(200).json({ data: rows, pagination: { page, pageSize, totalCount } });
}
async function handleCreate(req, res, access) {
  const body = req.body;
  if (!body?.name || !body?.agentId) {
    res.status(400).json({ detail: "name and agentId are required" });
    return;
  }
  if (!isAgentAuthorized(access, body.agentId)) {
    res.status(403).json({ detail: "Not authorized to create a campaign for this agent" });
    return;
  }
  if (body.outcomePolicySnapshot) {
    const classifications = await repo2.listClassifications();
    const validCodes = new Set(classifications.map((c) => c.code));
    const invalid = body.outcomePolicySnapshot.mappings.map((m) => m.campaignClassificationCode).filter((code) => !validCodes.has(code));
    if (invalid.length > 0) {
      res.status(400).json({ detail: `Unknown campaign classification code(s): ${Array.from(new Set(invalid)).join(", ")}` });
      return;
    }
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const rules = (body.rules && body.rules.length > 0 ? body.rules : defaultResultRules()).map((r) => ({
    priority: r.priority ?? 100,
    matchField: r.matchField,
    matchValue: r.matchValue,
    resultCode: r.resultCode,
    resultLabel: r.resultLabel,
    isSuccess: r.isSuccess ?? null,
    nextActionType: r.nextActionType ?? null,
    nextActionDelayDays: r.nextActionDelayDays ?? null,
    active: r.active ?? true
  }));
  const campaign = await repo2.createCampaign({
    name: body.name,
    description: body.description ?? null,
    agentId: body.agentId,
    createdBy: body.createdBy ?? null,
    sourceMeta: body.sourceMeta ?? null,
    now,
    rules,
    agentName: body.agentName ?? null,
    agentContractSnapshot: body.agentContractSnapshot ?? null,
    mappings: (body.mappings ?? []).map((m) => ({
      agentInputFieldCode: m.agentInputFieldCode,
      sourceType: m.sourceType,
      sourceField: m.sourceField,
      required: m.required ?? false,
      dataType: m.dataType ?? null
    })),
    outcomePolicySnapshot: body.outcomePolicySnapshot ? {
      mappings: body.outcomePolicySnapshot.mappings.map((m) => ({
        agentOutcomeCode: m.agentOutcomeCode,
        campaignClassificationCode: m.campaignClassificationCode,
        nextActionType: m.nextActionType ?? null
      })),
      capturedAt: body.outcomePolicySnapshot.capturedAt
    } : null
  });
  res.status(201).json(campaign);
}
async function requireAuthorizedCampaign(id, res, access) {
  if (!id) {
    res.status(400).json({ detail: "id is required" });
    return null;
  }
  const campaign = await repo2.getCampaign(id);
  if (!campaign || !isAgentAuthorized(access, campaign.agentId)) {
    notFound(res);
    return null;
  }
  return id;
}
async function handleSetInputMappings(req, res, access) {
  const id = await requireAuthorizedCampaign(queryStr(req, "id"), res, access);
  if (!id) return;
  const mappings = req.body?.mappings;
  if (!mappings || !Array.isArray(mappings)) {
    res.status(400).json({ detail: "mappings (body) is required" });
    return;
  }
  const uniqueness = validateMappingSourceUniqueness(mappings);
  if (!uniqueness.valid) {
    res.status(400).json({
      detail: `Duplicate source mapping(s): ${uniqueness.duplicateSourceKeys.join(", ")} \u2014 each source field may back only one agent input.`,
      duplicateSourceKeys: uniqueness.duplicateSourceKeys
    });
    return;
  }
  const result = await repo2.setInputMappings(id, mappings);
  res.status(200).json(result);
}
async function handleImportTargets(req, res, access) {
  const id = await requireAuthorizedCampaign(queryStr(req, "id"), res, access);
  if (!id) return;
  const rows = req.body?.rows;
  if (!rows || !Array.isArray(rows)) {
    res.status(400).json({ detail: "rows (body) is required" });
    return;
  }
  const result = await repo2.importTargets(id, rows, (/* @__PURE__ */ new Date()).toISOString());
  res.status(200).json(result);
}
async function handleStatusTransition(req, res, access, status) {
  const id = await requireAuthorizedCampaign(queryStr(req, "id"), res, access);
  if (!id) return;
  const body = req.body ?? {};
  const reason = body.reason?.trim() || null;
  if ((status === "paused" || status === "stopped") && !reason) {
    res.status(400).json({ detail: `A reason is required to ${status === "paused" ? "pause" : "stop"} a campaign.` });
    return;
  }
  if (status === "stopped" && body.confirm !== true) {
    res.status(400).json({ detail: "Stopping a campaign requires confirm: true in the request body." });
    return;
  }
  const actor = body.actor?.trim() || access.role || null;
  const campaign = await repo2.setStatusAudited(id, status, (/* @__PURE__ */ new Date()).toISOString(), actor, reason);
  res.status(200).json(campaign);
}
async function handleRetryTarget(req, res, access) {
  const targetId = queryStr(req, "targetId");
  if (!targetId) {
    res.status(400).json({ detail: "targetId is required" });
    return;
  }
  const context = await repo2.getTargetContext(targetId);
  if (!context || !isAgentAuthorized(access, context.agentId)) {
    notFound(res);
    return;
  }
  const body = req.body ?? {};
  const actor = body.actor?.trim() || access.role || null;
  const result = await repo2.retryTarget(targetId, (/* @__PURE__ */ new Date()).toISOString(), actor, body.reason?.trim() || null);
  res.status(200).json(result);
}
async function handleScheduleFollowup(req, res, access) {
  const body = req.body;
  if (!body?.targetId || !body?.type || !body?.dueAt) {
    res.status(400).json({ detail: "targetId, type, and dueAt are required" });
    return;
  }
  const context = await repo2.getTargetContext(body.targetId);
  if (!context || !isAgentAuthorized(access, context.agentId)) {
    notFound(res);
    return;
  }
  const followup = await repo2.createFollowup({
    targetId: body.targetId,
    resultId: body.resultId ?? null,
    type: body.type,
    dueAt: body.dueAt,
    nextCampaignId: body.nextCampaignId ?? null,
    notes: body.notes ?? null,
    now: (/* @__PURE__ */ new Date()).toISOString()
  });
  res.status(200).json(followup);
}
async function handleListSkipReasons(_req, res) {
  const reasons = await repo2.listSkipReasons();
  res.status(200).json({ data: reasons });
}
async function handleListConfigurationVersions(req, res, access) {
  const id = await requireAuthorizedCampaign(queryStr(req, "id"), res, access);
  if (!id) return;
  const versions = await repo2.listConfigurationVersions(id);
  res.status(200).json({ data: versions });
}
async function handleListAuditEvents(req, res, access) {
  const id = await requireAuthorizedCampaign(queryStr(req, "id"), res, access);
  if (!id) return;
  const limit = readIntQuery(req, "limit", 200);
  const events = await repo2.listAuditEvents(id, limit);
  res.status(200).json({ data: events });
}
async function handleCreateConfigurationVersion(req, res, access) {
  const id = await requireAuthorizedCampaign(queryStr(req, "id"), res, access);
  if (!id) return;
  const body = req.body;
  if (body === void 0 || !("expectedCurrentVersionId" in body) || !body.reason?.trim()) {
    res.status(400).json({ detail: "expectedCurrentVersionId (nullable) and a non-empty reason are required" });
    return;
  }
  if (body.outcomePolicySnapshot) {
    const classifications = await repo2.listClassifications();
    const validCodes = new Set(classifications.map((c) => c.code));
    const invalid = body.outcomePolicySnapshot.mappings.map((m) => m.campaignClassificationCode).filter((code) => !validCodes.has(code));
    if (invalid.length > 0) {
      res.status(400).json({ detail: `Unknown campaign classification code(s): ${Array.from(new Set(invalid)).join(", ")}` });
      return;
    }
  }
  if (body.mappings) {
    const uniqueness = validateMappingSourceUniqueness(body.mappings);
    if (!uniqueness.valid) {
      res.status(400).json({
        detail: `Duplicate source mapping(s): ${uniqueness.duplicateSourceKeys.join(", ")} \u2014 each source field may back only one agent input.`,
        duplicateSourceKeys: uniqueness.duplicateSourceKeys
      });
      return;
    }
  }
  const actor = body.actor?.trim() || access.role || null;
  try {
    const result = await repo2.createConfigurationVersion({
      campaignId: id,
      expectedCurrentVersionId: body.expectedCurrentVersionId,
      now: (/* @__PURE__ */ new Date()).toISOString(),
      actor,
      reason: body.reason.trim(),
      agentId: body.agentId ?? null,
      agentName: body.agentName ?? null,
      agentContractSnapshot: body.agentContractSnapshot ?? null,
      outcomePolicySnapshot: body.outcomePolicySnapshot ?? null,
      mappings: body.mappings ? body.mappings.map((m) => ({
        agentInputFieldCode: m.agentInputFieldCode,
        sourceType: m.sourceType,
        sourceField: m.sourceField,
        required: m.required ?? false,
        dataType: m.dataType ?? null
      })) : null,
      eventType: body.eventType
    });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("stale_configuration_version")) {
      res.status(409).json({ detail: "This campaign's configuration changed since you loaded it. Reload and try again.", code: "stale_configuration_version" });
      return;
    }
    throw err;
  }
}
async function handleUpdateDraftConfiguration(req, res, access) {
  const id = await requireAuthorizedCampaign(queryStr(req, "id"), res, access);
  if (!id) return;
  const body = req.body ?? {};
  if (body.outcomePolicySnapshot) {
    const classifications = await repo2.listClassifications();
    const validCodes = new Set(classifications.map((c) => c.code));
    const invalid = body.outcomePolicySnapshot.mappings.map((m) => m.campaignClassificationCode).filter((code) => !validCodes.has(code));
    if (invalid.length > 0) {
      res.status(400).json({ detail: `Unknown campaign classification code(s): ${Array.from(new Set(invalid)).join(", ")}` });
      return;
    }
  }
  if (body.mappings) {
    const uniqueness = validateMappingSourceUniqueness(body.mappings);
    if (!uniqueness.valid) {
      res.status(400).json({
        detail: `Duplicate source mapping(s): ${uniqueness.duplicateSourceKeys.join(", ")} \u2014 each source field may back only one agent input.`,
        duplicateSourceKeys: uniqueness.duplicateSourceKeys
      });
      return;
    }
  }
  const actor = body.actor?.trim() || access.role || null;
  try {
    const campaign = await repo2.updateDraftConfiguration({
      campaignId: id,
      now: (/* @__PURE__ */ new Date()).toISOString(),
      actor,
      agentId: body.agentId ?? null,
      agentName: body.agentName ?? null,
      agentContractSnapshot: body.agentContractSnapshot ?? null,
      outcomePolicySnapshot: body.outcomePolicySnapshot ?? null,
      mappings: body.mappings ? body.mappings.map((m) => ({
        agentInputFieldCode: m.agentInputFieldCode,
        sourceType: m.sourceType,
        sourceField: m.sourceField,
        required: m.required ?? false,
        dataType: m.dataType ?? null
      })) : null
    });
    res.status(200).json(campaign);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
  }
}
async function handleSkipTarget(req, res, access) {
  const targetId = queryStr(req, "targetId");
  if (!targetId) {
    res.status(400).json({ detail: "targetId is required" });
    return;
  }
  const context = await repo2.getTargetContext(targetId);
  if (!context || !isAgentAuthorized(access, context.agentId)) {
    notFound(res);
    return;
  }
  const body = req.body ?? {};
  if (!body.reasonCode) {
    res.status(400).json({ detail: "reasonCode is required" });
    return;
  }
  const actor = body.actor?.trim() || access.role || null;
  try {
    const result = await repo2.skipTarget(targetId, body.reasonCode, body.comment ?? null, (/* @__PURE__ */ new Date()).toISOString(), actor);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
  }
}
async function handleHoldTarget(req, res, access) {
  const targetId = queryStr(req, "targetId");
  if (!targetId) {
    res.status(400).json({ detail: "targetId is required" });
    return;
  }
  const context = await repo2.getTargetContext(targetId);
  if (!context || !isAgentAuthorized(access, context.agentId)) {
    notFound(res);
    return;
  }
  const body = req.body ?? {};
  const actor = body.actor?.trim() || access.role || null;
  try {
    const result = await repo2.holdTarget(targetId, body.reason ?? null, body.note ?? null, (/* @__PURE__ */ new Date()).toISOString(), actor);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
  }
}
async function handleReleaseHold(req, res, access) {
  const targetId = queryStr(req, "targetId");
  if (!targetId) {
    res.status(400).json({ detail: "targetId is required" });
    return;
  }
  const context = await repo2.getTargetContext(targetId);
  if (!context || !isAgentAuthorized(access, context.agentId)) {
    notFound(res);
    return;
  }
  const body = req.body ?? {};
  const actor = body.actor?.trim() || access.role || null;
  try {
    const result = await repo2.releaseHold(targetId, (/* @__PURE__ */ new Date()).toISOString(), actor);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : String(err) });
  }
}
async function handleAmendTarget(req, res, access) {
  const targetId = queryStr(req, "targetId");
  if (!targetId) {
    res.status(400).json({ detail: "targetId is required" });
    return;
  }
  const context = await repo2.getTargetContext(targetId);
  if (!context || !isAgentAuthorized(access, context.agentId)) {
    notFound(res);
    return;
  }
  const body = req.body ?? {};
  if (!body.sourceAttributes || typeof body.sourceAttributes !== "object") {
    res.status(400).json({ detail: "sourceAttributes (object, body) is required" });
    return;
  }
  const actor = body.actor?.trim() || access.role || null;
  const result = await repo2.amendTarget(targetId, body.sourceAttributes, (/* @__PURE__ */ new Date()).toISOString(), actor, body.reason?.trim() || null);
  res.status(200).json(result);
}
async function handleAddTargets(req, res, access) {
  const id = await requireAuthorizedCampaign(queryStr(req, "id"), res, access);
  if (!id) return;
  const body = req.body ?? {};
  if (!body.rows || !Array.isArray(body.rows)) {
    res.status(400).json({ detail: "rows (body) is required" });
    return;
  }
  const actor = body.actor?.trim() || access.role || null;
  const result = await repo2.addTargets(id, body.rows, (/* @__PURE__ */ new Date()).toISOString(), actor);
  res.status(200).json(result);
}
async function handleRunBatch(req, res) {
  const batchSize = readIntQuery(req, "batchSize", 5);
  const result = await runCampaignBatch(repo2, voiceAgentCallBackend, batchSize);
  res.status(200).json(result);
}
async function handleReconcile(req, res) {
  const limit = readIntQuery(req, "limit", 25);
  const result = await reconcilePendingExecutions(repo2, limit);
  res.status(200).json(result);
}
async function handleEnrichActualOutcomes(req, res) {
  const limit = readIntQuery(req, "limit", 25);
  const result = await enrichReconciledExecutionsWithActualOutcome(repo2, limit);
  res.status(200).json(result);
}
function isAuthorizedCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}
var GET_ACTIONS = /* @__PURE__ */ new Set([
  "list",
  "get",
  "listTargets",
  "listClassifications",
  "listSkipReasons",
  "listConfigurationVersions",
  "listAuditEvents"
]);
var ADMIN_ACTIONS = /* @__PURE__ */ new Set(["runBatch", "reconcile", "enrichActualOutcomes"]);
var ACTION_PERMISSIONS = {
  create: "campaigns.create",
  importTargets: "campaigns.targets.manage",
  setInputMappings: "campaigns.edit",
  start: "campaigns.start",
  pause: "campaigns.pause",
  resume: "campaigns.resume",
  stop: "campaigns.stop",
  retryTarget: "campaigns.targets.manage",
  scheduleFollowup: "campaigns.targets.manage",
  createConfigurationVersion: "campaigns.edit",
  updateDraftConfiguration: "campaigns.edit",
  skipTarget: "campaigns.targets.manage",
  holdTarget: "campaigns.targets.manage",
  releaseHold: "campaigns.targets.manage",
  amendTarget: "campaigns.targets.manage",
  addTargets: "campaigns.targets.manage"
};
var campaigns_default = withErrorBoundary(async (req, res) => {
  noStore(res);
  const action = queryStr(req, "action") ?? "";
  let isCronAuthorized = false;
  if (ADMIN_ACTIONS.has(action) && req.method === "GET") {
    if (!isAuthorizedCronRequest(req)) {
      res.status(401).json({ detail: "Invalid or missing cron authorization" });
      return;
    }
    isCronAuthorized = true;
  }
  if (ADMIN_ACTIONS.has(action) && !isCronAuthorized) {
    if (!requireAdminToken(req, res)) return;
  }
  const wantsGet = GET_ACTIONS.has(action) || isCronAuthorized;
  if (wantsGet && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ detail: "Method not allowed. Use GET." });
    return;
  }
  if (!wantsGet && req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ detail: "Method not allowed. Use POST." });
    return;
  }
  const access = ADMIN_ACTIONS.has(action) ? null : await resolveAccessForRequest(req);
  const requiredPermission = ACTION_PERMISSIONS[action];
  let actingUser = null;
  if (requiredPermission) {
    actingUser = await requirePermission(req, res, requiredPermission);
    if (!actingUser) return;
    req.body = { ...req.body ?? {}, actor: actingUser.displayName ?? actingUser.email };
  }
  const resourceId = queryStr(req, "id") ?? queryStr(req, "targetId") ?? req.body?.id ?? null;
  const auditIfMutating = async () => {
    if (!requiredPermission || !actingUser) return;
    await recordAuditEvent({
      actorType: "user",
      actorUserId: actingUser.id,
      action: `campaign.${action}`,
      resourceType: "campaign",
      resourceId,
      result: res.statusCode >= 200 && res.statusCode < 300 ? "success" : "error",
      metadata: { action },
      source: "api/campaigns"
    });
  };
  switch (action) {
    case "list":
      await handleList(req, res, access);
      return;
    case "get":
      await handleGet(req, res, access);
      return;
    case "listTargets":
      await handleListTargets(req, res, access);
      return;
    case "listClassifications":
      await handleListClassifications(req, res);
      return;
    case "create":
      await handleCreate(req, res, access);
      await auditIfMutating();
      return;
    case "importTargets":
      await handleImportTargets(req, res, access);
      await auditIfMutating();
      return;
    case "setInputMappings":
      await handleSetInputMappings(req, res, access);
      await auditIfMutating();
      return;
    case "start":
      await handleStatusTransition(req, res, access, "running");
      await auditIfMutating();
      return;
    case "pause":
      await handleStatusTransition(req, res, access, "paused");
      await auditIfMutating();
      return;
    case "resume":
      await handleStatusTransition(req, res, access, "running");
      await auditIfMutating();
      return;
    case "stop":
      await handleStatusTransition(req, res, access, "stopped");
      await auditIfMutating();
      return;
    case "retryTarget":
      await handleRetryTarget(req, res, access);
      await auditIfMutating();
      return;
    case "scheduleFollowup":
      await handleScheduleFollowup(req, res, access);
      await auditIfMutating();
      return;
    case "runBatch":
      await handleRunBatch(req, res);
      return;
    case "reconcile":
      await handleReconcile(req, res);
      return;
    case "enrichActualOutcomes":
      await handleEnrichActualOutcomes(req, res);
      return;
    case "listSkipReasons":
      await handleListSkipReasons(req, res);
      return;
    case "listConfigurationVersions":
      await handleListConfigurationVersions(req, res, access);
      return;
    case "listAuditEvents":
      await handleListAuditEvents(req, res, access);
      return;
    case "createConfigurationVersion":
      await handleCreateConfigurationVersion(req, res, access);
      await auditIfMutating();
      return;
    case "updateDraftConfiguration":
      await handleUpdateDraftConfiguration(req, res, access);
      await auditIfMutating();
      return;
    case "skipTarget":
      await handleSkipTarget(req, res, access);
      await auditIfMutating();
      return;
    case "holdTarget":
      await handleHoldTarget(req, res, access);
      await auditIfMutating();
      return;
    case "releaseHold":
      await handleReleaseHold(req, res, access);
      await auditIfMutating();
      return;
    case "amendTarget":
      await handleAmendTarget(req, res, access);
      await auditIfMutating();
      return;
    case "addTargets":
      await handleAddTargets(req, res, access);
      await auditIfMutating();
      return;
    default:
      res.status(400).json({
        detail: "Unknown or missing ?action= \u2014 use list, get, listTargets, listClassifications, create, importTargets, setInputMappings, start, pause, resume, stop, retryTarget, scheduleFollowup, runBatch, reconcile, enrichActualOutcomes, listSkipReasons, listConfigurationVersions, listAuditEvents, createConfigurationVersion, updateDraftConfiguration, skipTarget, holdTarget, releaseHold, amendTarget, or addTargets"
      });
  }
});
export {
  ACTION_PERMISSIONS,
  ADMIN_ACTIONS,
  GET_ACTIONS,
  campaigns_default as default
};
