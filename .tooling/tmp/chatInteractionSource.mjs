// src/server/chat/supabaseChatRepository.ts
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
function mapSession(row) {
  return {
    id: row.id,
    upstreamSessionId: row.upstream_session_id,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    status: row.status,
    customerId: row.customer_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    backendCustomerId: row.backend_customer_id,
    backendContactId: row.backend_contact_id,
    callerName: row.caller_name,
    phoneNumber: row.phone_number,
    isBankCustomer: row.is_bank_customer,
    upstreamStatus: row.upstream_status,
    historyDocId: row.history_doc_id,
    // Defensive fallback: matches the migration's own column defaults,
    // and covers any environment where
    // 20261007000000_chat_campaign_context_and_trial_marker.sql has not
    // yet been applied (the columns are simply absent from the row).
    campaignId: row.campaign_id ?? null,
    campaignTargetId: row.campaign_target_id ?? null,
    isTrial: row.is_trial ?? false,
    createdBy: row.created_by,
    messageCount: row.message_count,
    latestIntent: row.latest_intent,
    latestConfidence: row.latest_confidence,
    latestAuthenticated: row.latest_authenticated,
    latestDataSource: row.latest_data_source,
    latestDetectionMethod: row.latest_detection_method,
    latestLatencyMs: row.latest_latency_ms
  };
}
function mapMessage(row) {
  return {
    id: row.id,
    chatSessionId: row.chat_session_id,
    sequence: row.sequence,
    role: row.role,
    rawText: row.raw_text,
    intent: row.intent,
    confidence: row.confidence,
    authenticated: row.authenticated,
    dataSource: row.data_source,
    detectionMethod: row.detection_method,
    latencyMs: row.latency_ms,
    createdAt: row.created_at
  };
}
var supabaseChatRepository = {
  async createOrTouchSession(upstreamSessionId, now, createdBy, identity = {}) {
    const row = await rpc("call_center_chat_create_session", {
      p_upstream_session_id: upstreamSessionId,
      p_now: now,
      p_created_by: createdBy,
      p_agent_id: identity.agentId ?? null,
      p_agent_name: identity.agentName ?? null,
      p_backend_customer_id: identity.backendCustomerId ?? null,
      p_backend_contact_id: identity.backendContactId ?? null,
      p_caller_name: identity.callerName ?? null,
      p_phone_number: identity.phoneNumber ?? null,
      p_is_bank_customer: identity.isBankCustomer ?? null,
      p_upstream_status: identity.upstreamStatus ?? null,
      p_history_doc_id: identity.historyDocId ?? null,
      p_customer360_customer_id: identity.customer360CustomerId ?? null,
      p_campaign_id: identity.campaignId ?? null,
      p_campaign_target_id: identity.campaignTargetId ?? null,
      p_is_trial: identity.isTrial ?? false
    });
    return mapSession(row);
  },
  async getSessionByUpstreamId(upstreamSessionId) {
    const row = await rpc("call_center_chat_get_session_by_upstream_id", {
      p_upstream_session_id: upstreamSessionId
    });
    return row ? mapSession(row) : null;
  },
  async getSession(id) {
    const row = await rpc("call_center_chat_get_session", { p_id: id });
    return row ? mapSession(row) : null;
  },
  async appendMessage(chatSessionId, input) {
    const row = await rpc("call_center_chat_append_message", {
      p_session_id: chatSessionId,
      p_role: input.role,
      p_raw_text: input.rawText,
      p_now: input.now,
      p_intent: input.intent ?? null,
      p_confidence: input.confidence ?? null,
      p_authenticated: input.authenticated ?? null,
      p_data_source: input.dataSource ?? null,
      p_detection_method: input.detectionMethod ?? null,
      p_latency_ms: input.latencyMs ?? null
    });
    return mapMessage(row);
  },
  async closeSession(id) {
    await rpc("call_center_chat_close_session", { p_session_id: id });
  },
  async listSessions({ page = 1, pageSize = 25 }) {
    const result = await rpc("call_center_chat_list_sessions", {
      p_page: page,
      p_page_size: pageSize
    });
    return { rows: (result.rows ?? []).map(mapSession), totalCount: result.totalCount ?? 0 };
  },
  async listMessages(chatSessionId) {
    const rows = await rpc("call_center_chat_list_messages", { p_session_id: chatSessionId });
    return (rows ?? []).map(mapMessage);
  },
  async getCustomerLinks(upstreamSessionIds) {
    if (upstreamSessionIds.length === 0) return {};
    const rows = await rpc("call_center_chat_customer_links", { p_upstream_session_ids: upstreamSessionIds });
    const out = {};
    for (const r of rows ?? []) {
      out[r.upstream_session_id] = {
        customerId: r.customer_id,
        displayName: r.display_name,
        sourceCustomerRef: r.source_customer_ref,
        primaryPhoneMasked: r.primary_phone_masked
      };
    }
    return out;
  },
  async getTrialFlags(upstreamSessionIds) {
    if (upstreamSessionIds.length === 0) return {};
    const rows = await rpc(
      "call_center_chat_session_trial_flags",
      { p_upstream_session_ids: upstreamSessionIds }
    );
    const out = {};
    for (const r of rows ?? []) out[r.upstream_session_id] = r.is_trial;
    return out;
  },
  async getCampaignContext(upstreamSessionIds) {
    if (upstreamSessionIds.length === 0) return {};
    const rows = await rpc("call_center_chat_session_campaign_context", { p_upstream_session_ids: upstreamSessionIds });
    const out = {};
    for (const r of rows ?? []) {
      out[r.upstream_session_id] = {
        campaignId: r.campaign_id,
        campaignTargetId: r.campaign_target_id,
        campaignName: r.campaign_name
      };
    }
    return out;
  }
};

// src/server/customer360/chatInteractionSource.ts
var RETRY_ATTEMPTS = 3;
var RETRY_DELAY_MS = 800;
function getBackendConfig() {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
  }
  return { baseUrl, apiKey };
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchSessions(query) {
  const { baseUrl, apiKey } = getBackendConfig();
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl}/api/v1/chat/sessions${search ? `?${search}` : ""}`;
  let lastError;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
      const text = await res.text();
      const body = text ? JSON.parse(text) : void 0;
      if (!res.ok) {
        throw new Error(`chat/sessions request failed: ${res.status} ${typeof body === "object" ? JSON.stringify(body) : text}`);
      }
      return body;
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("chat/sessions request failed after retries");
}
function mapRow(dto, preferredCustomerId = null, campaignName = null) {
  if (!dto.phone_number && !dto.customer_id && !preferredCustomerId) return null;
  const durationSeconds = dto.started_at && dto.updated_at ? Math.max(0, Math.round((new Date(dto.updated_at).getTime() - new Date(dto.started_at).getTime()) / 1e3)) : null;
  return {
    interactionId: dto.session_id,
    channel: "chat",
    phoneNumber: dto.phone_number,
    externalCustomerId: dto.customer_id,
    preferredCustomerId,
    direction: null,
    // chat has no inbound/outbound concept
    agentId: dto.agent_id,
    agentDisplayName: dto.agent_name,
    startedAt: dto.started_at,
    durationSeconds,
    intent: dto.intent,
    outcome: null,
    // session lifecycle status is not a business outcome
    sentimentScore: null,
    // genuinely absent from the Chat API contract
    wasAuthenticated: dto.authenticated,
    escalationTrigger: null,
    // genuinely absent from the Chat API contract
    campaignName,
    recordingAvailable: false,
    source: "chat-sessions"
  };
}
async function getTrialFlagsSafely(upstreamSessionIds) {
  try {
    return await supabaseChatRepository.getTrialFlags(upstreamSessionIds);
  } catch (err) {
    console.error(
      `Failed to look up Chat Trial/Test flags for ${upstreamSessionIds.length} session(s) \u2014 failing closed: none of them will proceed into Customer 360 reconciliation this run.`,
      err
    );
    return {};
  }
}
async function getCampaignNamesSafely(upstreamSessionIds) {
  try {
    const contexts = await supabaseChatRepository.getCampaignContext(upstreamSessionIds);
    const out = {};
    for (const id of upstreamSessionIds) out[id] = contexts[id]?.campaignName ?? null;
    return out;
  } catch (err) {
    console.error(`Failed to look up Chat campaign context for ${upstreamSessionIds.length} session(s) \u2014 campaignName will be null this run.`, err);
    return {};
  }
}
var chatInteractionSource = {
  async searchByContactPoint(type, normalizedValue) {
    if (type !== "phone") return [];
    const dto = await fetchSessions({ page_size: "100" });
    const matched = dto.data.sessions.filter(
      (s) => s.phone_number && s.phone_number.replace(/[^0-9]/g, "") === normalizedValue
    );
    const sessionIds = matched.map((s) => s.session_id);
    const [links, trialFlags, campaignNames] = await Promise.all([
      supabaseChatRepository.getCustomerLinks(sessionIds),
      getTrialFlagsSafely(sessionIds),
      getCampaignNamesSafely(sessionIds)
    ]);
    return matched.filter((s) => trialFlags[s.session_id] === false).map((s) => mapRow(s, links[s.session_id]?.customerId ?? null, campaignNames[s.session_id] ?? null)).filter((s) => s !== null);
  },
  async listPage(page, pageSize) {
    const dto = await fetchSessions({ page: String(page), page_size: String(pageSize) });
    const sessionIds = dto.data.sessions.map((s) => s.session_id);
    const [links, trialFlags, campaignNames] = await Promise.all([
      supabaseChatRepository.getCustomerLinks(sessionIds),
      getTrialFlagsSafely(sessionIds),
      getCampaignNamesSafely(sessionIds)
    ]);
    return {
      rows: dto.data.sessions.filter((s) => trialFlags[s.session_id] === false).map((s) => mapRow(s, links[s.session_id]?.customerId ?? null, campaignNames[s.session_id] ?? null)).filter((s) => s !== null),
      totalPages: dto.data.pagination.total_pages
    };
  }
};
export {
  chatInteractionSource,
  mapRow
};
