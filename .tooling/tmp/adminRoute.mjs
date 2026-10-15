// api/_voicebot.ts
function getBackendConfig() {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
  }
  return { baseUrl, apiKey };
}
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

// src/services/calls/callsMapper.ts
function mapSessionInteractionEntry(entry) {
  return {
    timestamp: entry.timestamp,
    speaker: "customer",
    text: entry.user_message
  };
}
function mapSessionTranscriptToInteraction(dto) {
  const transcript = [];
  for (const entry of dto.interactions) {
    transcript.push(mapSessionInteractionEntry(entry));
    if (entry.bot_response) {
      transcript.push({
        timestamp: entry.timestamp,
        speaker: "ai",
        text: entry.bot_response
      });
    }
  }
  return {
    interactionId: dto.session_id,
    channel: dto.type,
    status: dto.status,
    transcript
  };
}

// src/lib/qaTurnIdentity.ts
function computeVoiceTurnId(interactionId, entries) {
  const seen = /* @__PURE__ */ new Map();
  return entries.map((entry) => {
    const key = `${entry.timestamp}:${entry.speaker}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return occurrence === 0 ? `${interactionId}:${entry.timestamp}:${entry.speaker}` : `${interactionId}:${entry.timestamp}:${entry.speaker}:${occurrence}`;
  });
}

// src/lib/qaConversation.ts
function voiceTurnsFromTranscript(interactionId, entries) {
  const ids = computeVoiceTurnId(interactionId, entries);
  return entries.map((entry, i) => ({
    turnId: ids[i],
    role: entry.speaker === "customer" ? "customer" : "agent",
    speakerLabel: entry.speaker === "customer" ? "Customer" : entry.speaker === "ai" ? "AI" : "Agent",
    timestamp: entry.timestamp,
    text: entry.text
  }));
}
function chatTurnsFromMessages(messages) {
  return messages.map((m) => ({
    turnId: m.id,
    role: m.role === "user" ? "customer" : "agent",
    speakerLabel: m.role === "user" ? "Customer" : "AI",
    timestamp: m.timestamp,
    text: m.text
  }));
}

// src/server/qa/transcriptFetcher.ts
async function fetchQaTurnsForInteraction(interactionId, channel) {
  const { baseUrl, apiKey } = getBackendConfig();
  if (channel === "voice") {
    const res2 = await fetch(`${baseUrl}/api/v1/sessions/${encodeURIComponent(interactionId)}`, {
      headers: { "X-API-Key": apiKey }
    });
    if (!res2.ok) {
      throw new Error(`Voice session transcript fetch failed: HTTP ${res2.status}`);
    }
    const dto2 = await res2.json();
    const { transcript } = mapSessionTranscriptToInteraction(dto2);
    return voiceTurnsFromTranscript(interactionId, transcript ?? []);
  }
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions/${encodeURIComponent(interactionId)}`, {
    headers: { "X-API-Key": apiKey }
  });
  if (!res.ok) {
    throw new Error(`Chat session transcript fetch failed: HTTP ${res.status}`);
  }
  const dto = await res.json();
  const messages = (dto.data.messages ?? []).map((m) => ({
    id: `${interactionId}-${m.number}`,
    role: m.role === "customer" ? "user" : "ai",
    text: m.message,
    timestamp: m.timestamp
  }));
  return chatTurnsFromMessages(messages);
}

// src/server/qa/automatedQaEvaluator.ts
import { randomUUID } from "node:crypto";

// src/server/qa/genericLlmClient.ts
function isRetryableLlmError(errorCode) {
  return errorCode === "rate_limited" || errorCode === "llm_unavailable" || errorCode === "inference_timeout";
}
function toCamelResponse(raw, rawResponseText) {
  return {
    success: !!raw?.success,
    requestId: raw?.request_id ?? null,
    output: raw?.output ?? null,
    modelId: raw?.model_id ?? "",
    finishReason: raw?.finish_reason ?? "error",
    latencyMs: raw?.latency_ms ?? null,
    usage: {
      promptTokens: raw?.usage?.prompt_tokens ?? null,
      completionTokens: raw?.usage?.completion_tokens ?? null
    },
    errorCode: raw?.error_code ?? null,
    errorMessage: raw?.error_message ?? null,
    rawResponseText
  };
}
async function callGenericLlm(req) {
  const { baseUrl, apiKey } = getBackendConfig();
  const body = {
    request_id: req.requestId,
    system_prompt: req.systemPrompt ?? null,
    user_prompt: req.userPrompt,
    response_format: { type: "json_schema", json_schema: req.jsonSchema },
    temperature: req.temperature ?? 0,
    max_output_tokens: req.maxOutputTokens ?? 2048,
    model_id: req.modelId ?? null
  };
  let res;
  try {
    res = await fetch(`${baseUrl}/api/v1/llm/generate`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (err) {
    return {
      success: false,
      requestId: req.requestId,
      output: null,
      modelId: req.modelId ?? "",
      finishReason: "error",
      latencyMs: null,
      usage: { promptTokens: null, completionTokens: null },
      errorCode: "network_error",
      errorMessage: err instanceof Error ? err.message : String(err),
      rawResponseText: null
    };
  }
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return {
      success: false,
      requestId: req.requestId,
      output: null,
      modelId: req.modelId ?? "",
      finishReason: "error",
      latencyMs: null,
      usage: { promptTokens: null, completionTokens: null },
      errorCode: "invalid_model_output",
      errorMessage: `Non-JSON response body (HTTP ${res.status})`,
      rawResponseText: text
    };
  }
  const raw = parsed;
  if (!res.ok && (!raw || typeof raw.error_code !== "string")) {
    const detail = raw && typeof raw.detail === "string" ? raw.detail : text.slice(0, 200);
    return {
      success: false,
      requestId: req.requestId,
      output: null,
      modelId: req.modelId ?? "",
      finishReason: "error",
      latencyMs: null,
      usage: { promptTokens: null, completionTokens: null },
      errorCode: "http_error",
      errorMessage: `HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      rawResponseText: text
    };
  }
  return toCamelResponse(parsed, text);
}

// src/lib/qaParameters.ts
var QA_PARAMETERS = {
  context_continuity_rate: {
    code: "context_continuity_rate",
    displayName: "Context Continuity",
    dimension: "Conversation",
    allowedValues: ["PASS", "FAIL", "N_A"],
    cleanValue: "PASS",
    problemValues: ["FAIL"],
    tier: 1,
    appliesTo: "agent",
    reasonCodes: ["PREVIOUS_INFORMATION_IGNORED", "PREVIOUS_INFORMATION_CONTRADICTED", "WRONG_CONTEXT_CARRIED_FORWARD", "CONTEXT_LOST_AFTER_TRANSITION", "OTHER"],
    directionality: "higher_better",
    shortHelp: "Did the agent correctly carry forward information already established earlier in the conversation?"
  },
  followup_understanding_rate: {
    code: "followup_understanding_rate",
    displayName: "Follow-up Understanding",
    dimension: "Understanding",
    allowedValues: ["PASS", "FAIL", "N_A"],
    cleanValue: "PASS",
    problemValues: ["FAIL"],
    tier: 1,
    appliesTo: "agent",
    reasonCodes: ["FOLLOW_UP_MISUNDERSTOOD", "WRONG_INTERPRETATION", "RELATION_TO_PRIOR_TURN_MISSED", "OTHER"],
    directionality: "higher_better",
    shortHelp: "Did the agent correctly understand this turn as a follow-up to what the customer just said?"
  },
  reference_resolution_accuracy: {
    code: "reference_resolution_accuracy",
    displayName: "Reference Resolution",
    dimension: "Understanding",
    allowedValues: ["PASS", "FAIL", "N_A"],
    cleanValue: "PASS",
    problemValues: ["FAIL"],
    tier: 2,
    appliesTo: "agent",
    reasonCodes: ["WRONG_ENTITY", "REFERENCE_NOT_RESOLVED", "AMBIGUITY_HANDLED_INCORRECTLY", "OTHER"],
    directionality: "higher_better",
    shortHelp: 'Did the agent correctly resolve a pronoun or implicit reference ("it", "that one") to the right entity?'
  },
  task_progression_rate: {
    code: "task_progression_rate",
    displayName: "Task Progression",
    dimension: "Resolution",
    allowedValues: ["PASS", "FAIL", "N_A"],
    cleanValue: "PASS",
    problemValues: ["FAIL"],
    tier: 1,
    appliesTo: "agent",
    reasonCodes: ["RESPONSE_DID_NOT_ADVANCE_TASK", "IRRELEVANT_RESPONSE", "CONVERSATION_STALLED", "WRONG_NEXT_STEP", "OTHER"],
    directionality: "higher_better",
    shortHelp: "Did this response move the customer's request forward, rather than stalling or going off-track?"
  },
  unnecessary_clarification_rate: {
    code: "unnecessary_clarification_rate",
    displayName: "Unnecessary Clarification",
    dimension: "Efficiency",
    allowedValues: ["NO_ISSUE", "ISSUE", "N_A"],
    cleanValue: "NO_ISSUE",
    problemValues: ["ISSUE"],
    tier: 2,
    appliesTo: "agent",
    reasonCodes: ["INFORMATION_ALREADY_AVAILABLE", "DUPLICATE_QUESTION", "QUESTION_NOT_REQUIRED", "OTHER"],
    directionality: "lower_better",
    shortHelp: "Did the agent ask the customer for something it should already have known or didn't actually need?"
  },
  repetition_loop_rate: {
    code: "repetition_loop_rate",
    displayName: "Repetition / Loop",
    dimension: "Efficiency",
    allowedValues: ["NO_ISSUE", "ISSUE", "N_A"],
    cleanValue: "NO_ISSUE",
    problemValues: ["ISSUE"],
    tier: 2,
    appliesTo: "interaction",
    reasonCodes: ["AGENT_REPEATED_QUESTION", "AGENT_REPEATED_ANSWER", "CUSTOMER_FORCED_TO_REPEAT", "CONVERSATION_LOOP", "OTHER"],
    directionality: "lower_better",
    shortHelp: "Did the conversation get stuck repeating the same question, answer or exchange instead of progressing? Assessed once per interaction, not per turn \u2014 a loop is a property of a span of turns."
  },
  customer_correction_rate: {
    code: "customer_correction_rate",
    displayName: "Customer Correction",
    dimension: "Understanding",
    allowedValues: ["NO_ISSUE", "ISSUE", "N_A"],
    cleanValue: "NO_ISSUE",
    problemValues: ["ISSUE"],
    tier: 2,
    appliesTo: "customer",
    reasonCodes: ["INTENT_CORRECTION", "FACTUAL_CORRECTION", "CONTEXT_CORRECTION", "ENTITY_CORRECTION", "OTHER"],
    directionality: "lower_better",
    shortHelp: "Did the customer have to correct something the agent got wrong (intent, a fact, context, or an entity)? Assessed on the customer's correcting turn, usable as evidence linked to the agent turn it responds to."
  },
  conversation_recovery_rate: {
    code: "conversation_recovery_rate",
    displayName: "Conversation Recovery",
    dimension: "Conversation",
    allowedValues: ["SUCCESSFUL", "UNSUCCESSFUL", "N_A"],
    cleanValue: "SUCCESSFUL",
    problemValues: ["UNSUCCESSFUL"],
    tier: 2,
    appliesTo: "agent",
    reasonCodes: ["CORRECTION_NOT_ACCEPTED", "ERROR_REPEATED", "WRONG_RECOVERY", "RECOVERY_STALLED", "OTHER"],
    directionality: "higher_better",
    shortHelp: "After an error or correction occurred, did the agent recover gracefully from it?"
  },
  response_grounding_rate: {
    code: "response_grounding_rate",
    displayName: "Response Grounding",
    dimension: "Answer Quality",
    allowedValues: ["GROUNDED", "NOT_GROUNDED", "CANNOT_VERIFY", "N_A"],
    cleanValue: "GROUNDED",
    problemValues: ["NOT_GROUNDED", "CANNOT_VERIFY"],
    tier: 2,
    appliesTo: "agent",
    reasonCodes: ["UNSUPPORTED_RESPONSE", "CONTRADICTS_AVAILABLE_EVIDENCE", "WRONG_SOURCE_OR_CONTEXT", "CANNOT_VERIFY_SOURCE", "OTHER"],
    directionality: "higher_better",
    shortHelp: `Is the agent's answer actually supported by the book/source it should be grounded in? If you cannot check the source either way, record "Cannot verify" \u2014 that's a data gap, not a quality failure.`
  }
};
var QA_PARAMETER_CODES = Object.keys(QA_PARAMETERS);
var QA_TIER_1_PARAMETERS = QA_PARAMETER_CODES.filter((code) => QA_PARAMETERS[code].tier === 1);
function requiresReasonCode(code, value) {
  return QA_PARAMETERS[code].problemValues.includes(value);
}
function isValidReasonCode(code, reasonCode) {
  return QA_PARAMETERS[code].reasonCodes.includes(reasonCode);
}
function isValidResultValue(code, value) {
  return QA_PARAMETERS[code].allowedValues.includes(value);
}

// src/lib/automatedQaPrompt.ts
var PROMPT_VERSION = "v2";
function parameterLine(code) {
  const def = QA_PARAMETERS[code];
  return `- ${code} ("${def.displayName}", ${def.dimension}): allowed values [${def.allowedValues.join(", ")}], clean value "${def.cleanValue}", problem reason codes [${def.reasonCodes.join(", ")}]. ${def.shortHelp}`;
}
function buildSystemPrompt() {
  const paramLines = QA_PARAMETER_CODES.map(parameterLine).join("\n");
  return [
    "You are an independent conversation-quality evaluator for a banking voice/chat assistant. You assess ONLY the nine parameters below, using ONLY the conversation given to you.",
    "",
    "For each parameter, first decide whether a genuine opportunity to assess it exists in this conversation (applicability). If no such opportunity exists, add an entry to unassessable_parameters instead of guessing a value. Do not record a parameter as PASS (or its clean value) just because nothing seems wrong when there was never a real opportunity to test it.",
    "",
    "For each applicable parameter, decide the value using exactly its own allowed values. Use the clean value when the agent handled it correctly. Use a problem value \u2014 with a reason_code from that parameter's own list \u2014 when there is a genuine issue. For response_grounding_rate specifically: if you cannot verify whether the agent's claim is factually supported because no source/policy evidence is available to you, use CANNOT_VERIFY, which is a data-availability gap, not a quality failure \u2014 never guess GROUNDED or NOT_GROUNDED without a basis.",
    "",
    // Session 16.3.8 (A3) — N/A and CANNOT_VERIFY are frequently confused
    // by a small model under pressure to resolve a large parameter list
    // quickly. Spelled out explicitly, separate from any one parameter's
    // own line, because the distinction applies to every parameter (N/A)
    // and specifically to response_grounding_rate (CANNOT_VERIFY).
    "N/A and CANNOT_VERIFY mean different things \u2014 do not use one for the other. Use N/A (an unassessable_parameters entry) only when this conversation never presented a genuine opportunity to assess that parameter at all \u2014 there is nothing to judge, not even uncertainly. Use CANNOT_VERIFY (response_grounding_rate only) when the agent DID make a factual/evidence-backed claim \u2014 a real opportunity existed \u2014 but you have no way to check that specific claim against evidence. A claim you cannot verify is never, by itself, evidence that the claim was wrong: absence of visible evidence is a data gap, not a finding of NOT_GROUNDED, and it is never silently treated as GROUNDED either.",
    "",
    // Session 16.3.8 (A4) — every unassessable_parameters.reason must be
    // specific to that parameter and this conversation. A generic
    // placeholder ("N_A", "NA", "-", or similar) will be rejected and the
    // response retried — write one concrete sentence explaining what
    // about THIS conversation made the parameter inapplicable.
    'Every unassessable_parameters entry needs a real, parameter-specific reason \u2014 one sentence saying what about this specific conversation made that parameter inapplicable (e.g. "The agent never asked a clarifying question, so there was nothing to assess for unnecessary clarification."). Never write a placeholder like "N_A", "NA", "-", or leave the reason effectively empty. It is entirely normal, and not a failure on your part, for several or even all nine parameters to genuinely have no opportunity in a short conversation \u2014 just say specifically why for each one.',
    "",
    "Parameters:",
    paramLines,
    "",
    "Every observation must reference primary_turn_id using one of the exact turn ids given in the conversation \u2014 never invent a turn id, never use a position number.",
    "",
    "You are evaluating independently. You have not seen and must not assume any prior human review of this conversation.",
    "",
    "Respond only with JSON matching the given schema."
  ].join("\n");
}
function buildConsistencyRetryInstruction(conflictingCodes) {
  const names = conflictingCodes.map((c) => `${c} ("${QA_PARAMETERS[c].displayName}")`).join(", ");
  return `

CORRECTION REQUIRED: in your previous response, the following parameter(s) appeared in BOTH \`observations\` and \`unassessable_parameters\` at the same time: ${names}. Each parameter must appear in EXACTLY ONE of the two collections. Re-decide ONLY ${conflictingCodes.length === 1 ? "this parameter" : "these parameters"}: look again at whether a genuine assessment opportunity existed for ${conflictingCodes.length === 1 ? "it" : "each of them"}, and place it in exactly one collection accordingly \u2014 do not default to either PASS or N/A, decide based on the actual conversation. Every OTHER parameter in your previous response was NOT part of this conflict \u2014 keep those exact same assessments unchanged; do not re-evaluate, remove, or weaken them.`;
}
function buildPlaceholderReasonRetryInstruction(placeholderCodes) {
  const names = placeholderCodes.map((c) => `${c} ("${QA_PARAMETERS[c].displayName}")`).join(", ");
  return `

CORRECTION REQUIRED: in your previous response, unassessable_parameters gave a placeholder, non-specific reason (like "N_A", "NA", or "-") for: ${names}. Keep every assessment from your previous response exactly as it was \u2014 observations and the other unassessable_parameters entries are unchanged. Only rewrite the reason text for the parameter(s) named above: write one concrete sentence, specific to this conversation, explaining what made a genuine assessment opportunity absent for that parameter. If, on reflection, a real opportunity actually did exist, move that parameter to \`observations\` with a proper value instead.`;
}
function formatTurn(turn) {
  return `[${turn.turnId}] ${turn.speakerLabel}: ${turn.text}`;
}
function buildUserPrompt(turns, windowIndex, windowCount) {
  const header = windowCount > 1 ? `This is part ${windowIndex + 1} of ${windowCount} of one conversation, shown in order. Only use the turn ids shown in this part.` : "This is the full conversation.";
  const body = turns.map(formatTurn).join("\n");
  return `${header}

${body}`;
}

// src/lib/automatedQaSchema.ts
var ALL_RESULT_VALUES = [
  "PASS",
  "FAIL",
  "NO_ISSUE",
  "ISSUE",
  "GROUNDED",
  "NOT_GROUNDED",
  "CANNOT_VERIFY",
  "SUCCESSFUL",
  "UNSUCCESSFUL",
  "N_A"
];
function buildAutomatedQaJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["interaction_assessment", "observations", "unassessable_parameters"],
    properties: {
      interaction_assessment: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "evaluation_completeness"],
        properties: {
          summary: { type: "string", maxLength: 400, description: "One or two sentences on what the customer wanted and what happened." },
          evaluation_completeness: { type: "string", enum: ["COMPLETE", "PARTIAL"] }
        }
      },
      observations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["parameter_code", "primary_turn_id", "value"],
          properties: {
            parameter_code: { type: "string", enum: [...QA_PARAMETER_CODES] },
            primary_turn_id: { type: "string", description: "Must be one of the turn ids given in the conversation." },
            value: { type: "string", enum: [...ALL_RESULT_VALUES] },
            reason_code: { type: "string", description: "Required when value is a problem value. Must be one of this parameter's own reason codes." },
            evidence_turn_ids: { type: "array", items: { type: "string" } },
            explanation: { type: "string", maxLength: 300 }
          }
        }
      },
      unassessable_parameters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["parameter_code", "reason"],
          properties: {
            parameter_code: { type: "string", enum: [...QA_PARAMETER_CODES] },
            reason: { type: "string", maxLength: 200 }
          }
        }
      }
    }
  };
}

// src/lib/automatedQaWindowPlanner.ts
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function turnTokenCost(turn) {
  return estimateTokens(`[${turn.turnId}] ${turn.speakerLabel}: ${turn.text}`) + 2;
}
function planQaTurnWindows(turns, transcriptTokenBudget) {
  if (turns.length === 0) return [];
  const windows = [];
  let current = [];
  let currentCost = 0;
  for (const turn of turns) {
    const cost = turnTokenCost(turn);
    if (current.length > 0 && currentCost + cost > transcriptTokenBudget) {
      windows.push({ index: windows.length, turns: current });
      current = [];
      currentCost = 0;
    }
    current.push(turn);
    currentCost += cost;
  }
  if (current.length > 0) {
    windows.push({ index: windows.length, turns: current });
  }
  return windows;
}

// src/lib/automatedQaValidation.ts
function isQaParameterCode(x) {
  return typeof x === "string" && QA_PARAMETER_CODES.includes(x);
}
function validateAutomatedObservations(raw, validTurnIds) {
  const accepted = [];
  const rejected = [];
  const seenOpportunities = /* @__PURE__ */ new Set();
  if (!Array.isArray(raw)) {
    return { accepted, rejected: [{ raw, reason: "observations is not an array" }] };
  }
  for (const entry of raw) {
    const parameterCode = entry?.parameter_code;
    const primaryTurnId = entry?.primary_turn_id;
    const value = entry?.value;
    const reasonCode = entry?.reason_code;
    const evidenceTurnIdsRaw = entry?.evidence_turn_ids;
    const explanation = entry?.explanation;
    if (!isQaParameterCode(parameterCode)) {
      rejected.push({ raw: entry, reason: `unknown parameter_code: ${String(parameterCode)}` });
      continue;
    }
    if (typeof value !== "string" || !isValidResultValue(parameterCode, value)) {
      rejected.push({ raw: entry, reason: `value "${String(value)}" is not allowed for ${parameterCode}` });
      continue;
    }
    if (typeof primaryTurnId !== "string" || !validTurnIds.has(primaryTurnId)) {
      rejected.push({ raw: entry, reason: `primary_turn_id "${String(primaryTurnId)}" does not exist in the evaluated transcript snapshot` });
      continue;
    }
    const evidenceTurnIds = Array.isArray(evidenceTurnIdsRaw) ? evidenceTurnIdsRaw.filter((t) => typeof t === "string") : [];
    const fabricatedEvidence = evidenceTurnIds.find((t) => !validTurnIds.has(t));
    if (fabricatedEvidence) {
      rejected.push({ raw: entry, reason: `evidence_turn_ids references "${fabricatedEvidence}", which does not exist in the evaluated transcript snapshot` });
      continue;
    }
    const needsReason = requiresReasonCode(parameterCode, value);
    if (needsReason) {
      if (typeof reasonCode !== "string" || !isValidReasonCode(parameterCode, reasonCode)) {
        rejected.push({ raw: entry, reason: `reason_code "${String(reasonCode)}" is required and must belong to ${parameterCode}'s vocabulary for value "${value}"` });
        continue;
      }
    }
    const opportunityKey = `${parameterCode}:${primaryTurnId}`;
    if (seenOpportunities.has(opportunityKey)) {
      rejected.push({ raw: entry, reason: `duplicate/contradictory observation for the same opportunity (${opportunityKey}) \u2014 first accepted observation wins` });
      continue;
    }
    seenOpportunities.add(opportunityKey);
    accepted.push({
      parameterCode,
      value,
      primaryTurnId,
      evidenceTurnIds,
      reasonCode: needsReason ? reasonCode : null,
      explanation: typeof explanation === "string" ? explanation.slice(0, 300) : null
    });
  }
  return { accepted, rejected };
}
function validateUnassessableParameters(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (isQaParameterCode(entry?.parameter_code) && typeof entry?.reason === "string") {
      out.push({ parameterCode: entry.parameter_code, reason: entry.reason.slice(0, 200) });
    }
  }
  return out;
}
function detectCrossArrayContradiction(observations, unassessableParameters) {
  const observedCodes = new Set(observations.map((o) => o.parameterCode));
  const conflicts = /* @__PURE__ */ new Set();
  for (const u of unassessableParameters) {
    if (observedCodes.has(u.parameterCode)) conflicts.add(u.parameterCode);
  }
  return Array.from(conflicts);
}
var PLACEHOLDER_UNASSESSABILITY_REASONS = /* @__PURE__ */ new Set(["", "na", "n a", "none", "unknown", "notapplicable", "nil", "tbd"]);
function isPlaceholderUnassessabilityReason(reason) {
  const normalized = reason.toLowerCase().replace(/[^a-z0-9]/g, " ").trim().replace(/\s+/g, " ");
  return PLACEHOLDER_UNASSESSABILITY_REASONS.has(normalized);
}
function detectPlaceholderUnassessability(unassessableParameters) {
  return unassessableParameters.filter((u) => isPlaceholderUnassessabilityReason(u.reason)).map((u) => u.parameterCode);
}

// src/lib/automatedQaAttemptDiagnostics.ts
var RAW_RESPONSE_MAX_CHARS = 6e4;
function boundRawResponse(text) {
  if (text == null) return null;
  if (text.length <= RAW_RESPONSE_MAX_CHARS) return text;
  const omitted = text.length - RAW_RESPONSE_MAX_CHARS;
  return `${text.slice(0, RAW_RESPONSE_MAX_CHARS)}
...[truncated, ${omitted} more characters omitted]`;
}
async function persistAttemptDiagnosticsSafely(write, evaluationId, attempts, now) {
  if (!attempts || attempts.length === 0) return { ok: true, error: null };
  try {
    const { error } = await write(evaluationId, attempts, now);
    if (error) {
      console.error(`[automatedQa] attempt-diagnostics write failed for evaluation ${evaluationId}: ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[automatedQa] attempt-diagnostics write threw for evaluation ${evaluationId}: ${message}`);
    return { ok: false, error: message };
  }
}
function countRawParameterOccurrences(rawEntries, targetCodes) {
  const counts = {};
  for (const code of targetCodes) counts[code] = 0;
  if (!Array.isArray(rawEntries)) return counts;
  for (const entry of rawEntries) {
    const code = entry?.parameter_code;
    if (typeof code === "string" && code in counts) counts[code] += 1;
  }
  return counts;
}

// src/server/qa/automatedQaEvaluator.ts
var CONTEXT_WINDOW_TOKENS = 8192;
var MAX_OUTPUT_TOKENS = 3072;
var MAX_OUTPUT_TOKENS_CAP = 6144;
var SAFETY_MARGIN_TOKENS = 200;
var MAX_RETRIES_PER_WINDOW = 2;
var RETRY_BACKOFF_MS = [500, 1500];
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function evaluateInteraction(turns) {
  const systemPrompt = buildSystemPrompt();
  const schema = buildAutomatedQaJsonSchema();
  const fixedOverhead = estimateTokens(systemPrompt) + estimateTokens(JSON.stringify(schema)) + MAX_OUTPUT_TOKENS + SAFETY_MARGIN_TOKENS;
  const transcriptBudget = Math.max(CONTEXT_WINDOW_TOKENS - fixedOverhead, 500);
  const windows = planQaTurnWindows(turns, transcriptBudget);
  if (windows.length === 0) {
    return {
      status: "failed",
      modelId: null,
      requestIds: [],
      evaluatedTurnIds: [],
      uncoveredTurnIds: [],
      unassessableParameters: [],
      evaluationCompleteness: "PARTIAL",
      windowCount: 0,
      tokenUsage: { promptTokens: 0, completionTokens: 0 },
      latencyMs: 0,
      observations: [],
      errorCode: "no_reviewable_turns",
      errorMessage: "The transcript had no turns to evaluate.",
      attempts: []
    };
  }
  const allValidTurnIds = new Set(turns.map((t) => t.turnId));
  const observations = [];
  const unassessable = [];
  const requestIds = [];
  const evaluatedTurnIds = [];
  const uncoveredTurnIds = [];
  const attempts = [];
  let modelId = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let latencyMs = 0;
  let anyWindowFailed = false;
  let lastErrorCode = null;
  let lastErrorMessage = null;
  for (const window of windows) {
    const aliasToReal = new Map(window.turns.map((t, i) => [`T${i + 1}`, t.turnId]));
    const aliasedTurns = window.turns.map((t, i) => ({ ...t, turnId: `T${i + 1}` }));
    const windowTurnIds = new Set(aliasToReal.keys());
    const baseRequestId = `qa-${Math.random().toString(36).slice(2)}-${window.index}`;
    const baseUserPrompt = buildUserPrompt(aliasedTurns, window.index, windows.length);
    let userPrompt = baseUserPrompt;
    let attempt = 0;
    let succeeded = false;
    let windowMaxOutputTokens = MAX_OUTPUT_TOKENS;
    let contradictionRetried = false;
    let placeholderReasonRetried = false;
    let previousAttemptId = null;
    let retryReason = null;
    let correctionInstructionId = null;
    while (attempt <= MAX_RETRIES_PER_WINDOW) {
      const attemptNumber = attempt + 1;
      const attemptId = randomUUID();
      const requestId = `${baseRequestId}-a${attemptNumber}`;
      const requestedMaxOutputTokens = windowMaxOutputTokens;
      const startedAt = (/* @__PURE__ */ new Date()).toISOString();
      const res = await callGenericLlm({
        requestId,
        systemPrompt,
        userPrompt,
        jsonSchema: schema,
        temperature: 0,
        maxOutputTokens: windowMaxOutputTokens
      });
      const completedAt = (/* @__PURE__ */ new Date()).toISOString();
      requestIds.push(requestId);
      if (res.latencyMs) latencyMs += res.latencyMs;
      if (res.usage.promptTokens) promptTokens += res.usage.promptTokens;
      if (res.usage.completionTokens) completionTokens += res.usage.completionTokens;
      if (res.modelId) modelId = res.modelId;
      const recordAttempt = (outcome2, errorCode, errorMessage, validationDetail) => {
        attempts.push({
          attemptId,
          windowIndex: window.index,
          attemptNumber,
          requestId,
          modelId: res.modelId || null,
          outcome: outcome2,
          errorCode,
          errorMessage,
          rawResponseText: boundRawResponse(res.rawResponseText),
          validationDetail,
          retryReason,
          correctionInstructionId,
          previousAttemptId,
          requestedMaxOutputTokens,
          promptTokens: res.usage.promptTokens,
          completionTokens: res.usage.completionTokens,
          latencyMs: res.latencyMs,
          startedAt,
          completedAt
        });
        previousAttemptId = attemptId;
      };
      if (res.success && res.output && typeof res.output === "object") {
        const out = res.output;
        const validation = validateAutomatedObservations(out.observations, windowTurnIds);
        const windowUnassessable = validateUnassessableParameters(out.unassessable_parameters);
        const rejectedObservations = validation.rejected.map((r) => ({ reason: r.reason }));
        const conflicts = detectCrossArrayContradiction(validation.accepted, windowUnassessable);
        if (conflicts.length > 0) {
          lastErrorCode = "contradictory_applicability";
          lastErrorMessage = `The model classified the same parameter(s) as both assessed and unassessable in one response: ${conflicts.join(", ")}.`;
          recordAttempt("contradictory_applicability", lastErrorCode, lastErrorMessage, {
            rejectedObservations,
            contradiction: {
              parameterCodes: conflicts,
              observationOccurrences: countRawParameterOccurrences(out.observations, conflicts),
              unassessableOccurrences: countRawParameterOccurrences(out.unassessable_parameters, conflicts),
              detectedAt: "cross_array_contradiction"
            },
            placeholder: null
          });
          if (!contradictionRetried && attempt < MAX_RETRIES_PER_WINDOW) {
            contradictionRetried = true;
            userPrompt = baseUserPrompt + buildConsistencyRetryInstruction(conflicts);
            retryReason = lastErrorCode;
            correctionInstructionId = "consistency_retry_v1";
            attempt += 1;
            continue;
          }
          break;
        }
        const placeholders = detectPlaceholderUnassessability(windowUnassessable);
        if (placeholders.length > 0) {
          lastErrorCode = "uninformative_unassessability";
          lastErrorMessage = `The model marked parameter(s) unassessable with a placeholder (non-specific) reason instead of a real explanation: ${placeholders.join(", ")}.`;
          recordAttempt("uninformative_unassessability", lastErrorCode, lastErrorMessage, {
            rejectedObservations,
            contradiction: null,
            placeholder: { parameterCodes: placeholders, detectedAt: "placeholder_unassessability" }
          });
          if (!placeholderReasonRetried && attempt < MAX_RETRIES_PER_WINDOW) {
            placeholderReasonRetried = true;
            userPrompt = baseUserPrompt + buildPlaceholderReasonRetryInstruction(placeholders);
            retryReason = lastErrorCode;
            correctionInstructionId = "placeholder_retry_v1";
            attempt += 1;
            continue;
          }
          break;
        }
        recordAttempt("success", null, null, { rejectedObservations, contradiction: null, placeholder: null });
        observations.push(...validation.accepted.map((o) => ({
          ...o,
          primaryTurnId: aliasToReal.get(o.primaryTurnId) ?? o.primaryTurnId,
          evidenceTurnIds: o.evidenceTurnIds.map((id) => aliasToReal.get(id) ?? id)
        })));
        unassessable.push(...windowUnassessable);
        evaluatedTurnIds.push(...window.turns.map((t) => t.turnId));
        succeeded = true;
        break;
      }
      lastErrorCode = res.errorCode;
      lastErrorMessage = res.errorMessage;
      const outcome = res.errorCode === "network_error" || res.errorCode === "http_error" ? "transport_failure" : res.errorCode === "invalid_model_output" ? "parse_failure" : "llm_error";
      recordAttempt(outcome, res.errorCode, res.errorMessage, null);
      if (attempt === MAX_RETRIES_PER_WINDOW) break;
      if (res.errorCode === "output_truncated" && windowMaxOutputTokens < MAX_OUTPUT_TOKENS_CAP) {
        windowMaxOutputTokens = Math.min(windowMaxOutputTokens * 2, MAX_OUTPUT_TOKENS_CAP);
        retryReason = res.errorCode;
        correctionInstructionId = "output_truncated_budget_escalation";
        attempt += 1;
        continue;
      }
      if (!isRetryableLlmError(res.errorCode)) break;
      retryReason = res.errorCode;
      correctionInstructionId = "transient_backoff_retry";
      await sleep(RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]);
      attempt += 1;
    }
    if (!succeeded) {
      anyWindowFailed = true;
      uncoveredTurnIds.push(...window.turns.map((t) => t.turnId));
    }
  }
  if (windows.length > 1) {
    unassessable.push({
      parameterCode: "repetition_loop_rate",
      reason: `Interaction was evaluated across ${windows.length} separate context windows; repetition/loop detection only covers exchanges within a single window, not across window boundaries.`
    });
  }
  const dedupUnassessable = Array.from(
    new Map(unassessable.map((u) => [`${u.parameterCode}:${u.reason}`, u])).values()
  );
  const allTurnsCovered = evaluatedTurnIds.length > 0 && uncoveredTurnIds.length === 0;
  const status = evaluatedTurnIds.length === 0 ? "failed" : anyWindowFailed ? "partial" : "completed";
  return {
    status,
    modelId,
    requestIds,
    evaluatedTurnIds: Array.from(new Set(evaluatedTurnIds)).filter((id) => allValidTurnIds.has(id)),
    uncoveredTurnIds: Array.from(new Set(uncoveredTurnIds)),
    unassessableParameters: dedupUnassessable,
    evaluationCompleteness: allTurnsCovered ? "COMPLETE" : "PARTIAL",
    windowCount: windows.length,
    tokenUsage: { promptTokens, completionTokens },
    latencyMs,
    observations,
    errorCode: status === "failed" ? lastErrorCode : null,
    errorMessage: status === "failed" ? lastErrorMessage : null,
    attempts
  };
}

// api/admin.ts
import crypto from "node:crypto";
var AUTOMATED_QA_CONTRACT_VERSION = "v1";
var AUTOMATED_QA_SCHEMA_VERSION = "v1";
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
  if (action === "statusForInteractions") {
    const user = await getAuthenticatedUser(req);
    if (!user || !user.permissions.includes("qa.review") && !user.permissions.includes("qa.analytics.view")) {
      res.status(user ? 403 : 401).json({ detail: user ? "Missing required permission: qa.review or qa.analytics.view" : "Authentication required" });
      return;
    }
    const access = toAgentAccess(user);
    const allAgents = access.allCategories || access.authorizedAgentIds === "all";
    const authorizedAgentIds = allAgents ? [] : access.authorizedAgentIds;
    const { data, error } = await supabase.rpc("call_center_qa_reviews_population", {
      p_authorized_agent_ids: authorizedAgentIds,
      p_all_agents: allAgents,
      p_channel: null,
      p_date_from: null,
      p_date_to: null,
      p_reviewer_user_id: null
    });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    const rows = toCamelCaseDeep(data ?? []).map((r) => ({
      id: r.id,
      interactionId: r.interactionId,
      channel: r.channel,
      status: r.status,
      reviewerUserId: r.reviewerUserId
    }));
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
function toCamelAutomatedQa(value) {
  return toCamelCaseDeep(value);
}
async function handleAutomatedQaGet(req, res) {
  const action = queryStr(req, "action");
  const supabase = getServiceRoleClient();
  if (action === "get") {
    const user = await requirePermission(req, res, "qa.automated.view");
    if (!user) return;
    const evaluationId = queryStr(req, "evaluationId");
    if (!evaluationId) {
      res.status(422).json({ detail: "evaluationId is required" });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_automated_qa_get", { p_evaluation_id: evaluationId });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    const evaluation = data ? toCamelAutomatedQa(data) : null;
    if (!evaluation) {
      res.status(404).json({ detail: "Automated QA evaluation not found" });
      return;
    }
    if (!isAgentIdInScope(toAgentAccess(user), evaluation.agentId)) {
      res.status(404).json({ detail: "Automated QA evaluation not found" });
      return;
    }
    res.status(200).json({ data: evaluation });
    return;
  }
  if (action === "listForInteraction") {
    const user = await requirePermission(req, res, "qa.automated.view");
    if (!user) return;
    const interactionId = queryStr(req, "interactionId");
    const channel = queryStr(req, "channel");
    if (!interactionId || channel !== "voice" && channel !== "chat") {
      res.status(422).json({ detail: 'interactionId and channel ("voice"|"chat") are required' });
      return;
    }
    const { data, error } = await supabase.rpc("call_center_automated_qa_list_for_interaction", {
      p_interaction_id: interactionId,
      p_channel: channel
    });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    const access = toAgentAccess(user);
    const rows = toCamelAutomatedQa(data ?? []).filter((r) => isAgentIdInScope(access, r.agentId));
    res.status(200).json({ data: rows });
    return;
  }
  if (action === "list") {
    const user = await requirePermission(req, res, "qa.automated.view");
    if (!user) return;
    const access = toAgentAccess(user);
    const allAgents = access.allCategories || access.authorizedAgentIds === "all";
    const authorizedAgentIds = allAgents ? [] : access.authorizedAgentIds;
    const status = queryStr(req, "status") ?? null;
    const { data, error } = await supabase.rpc("call_center_automated_qa_list", {
      p_authorized_agent_ids: authorizedAgentIds,
      p_all_agents: allAgents,
      p_status: status
    });
    if (error) {
      res.status(500).json({ detail: error.message });
      return;
    }
    res.status(200).json({ data: toCamelAutomatedQa(data) });
    return;
  }
  res.status(400).json({ detail: `Unknown action: ${action}` });
}
async function persistAutomatedQaAttempts(supabase, evaluationId, attempts, now) {
  await persistAttemptDiagnosticsSafely(
    async (evalId, atts, p_now) => {
      const { error } = await supabase.rpc("call_center_automated_qa_attempts_record", {
        p_evaluation_id: evalId,
        p_attempts: atts,
        p_now
      });
      return { error };
    },
    evaluationId,
    attempts,
    now
  );
}
async function handleAutomatedQaPost(req, res) {
  const user = await requirePermission(req, res, "qa.automated.run");
  if (!user) return;
  const action = queryStr(req, "action");
  if (action !== "start") {
    res.status(400).json({ detail: `Unknown action: ${action}` });
    return;
  }
  const { interactionId, channel, agentId } = req.body ?? {};
  if (typeof interactionId !== "string" || channel !== "voice" && channel !== "chat" || typeof agentId !== "string") {
    res.status(422).json({ detail: 'interactionId, channel ("voice"|"chat"), and agentId are required' });
    return;
  }
  if (!isAgentIdInScope(toAgentAccess(user), agentId)) {
    res.status(404).json({ detail: "Interaction not found" });
    return;
  }
  const supabase = getServiceRoleClient();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let turns;
  try {
    turns = await fetchQaTurnsForInteraction(interactionId, channel);
  } catch (err) {
    res.status(502).json({ detail: `Transcript fetch failed: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  if (turns.length === 0) {
    res.status(422).json({ detail: "This interaction has no transcript to evaluate." });
    return;
  }
  const transcriptHash = crypto.createHash("sha256").update(JSON.stringify(turns)).digest("hex");
  const { data: createdRaw, error: createError } = await supabase.rpc("call_center_automated_qa_create", {
    p_interaction_id: interactionId,
    p_channel: channel,
    p_agent_id: agentId,
    p_upstream_sid: null,
    p_initiated_by: user.id,
    p_prompt_version: PROMPT_VERSION,
    p_contract_version: AUTOMATED_QA_CONTRACT_VERSION,
    p_schema_version: AUTOMATED_QA_SCHEMA_VERSION,
    p_transcript_snapshot: turns,
    p_transcript_hash: transcriptHash,
    p_now: now
  });
  if (createError) {
    res.status(500).json({ detail: createError.message });
    return;
  }
  const created = toCamelAutomatedQa(createdRaw);
  if (created.alreadyInFlight) {
    res.status(200).json({ data: created });
    return;
  }
  await supabase.rpc("call_center_automated_qa_set_running", { p_evaluation_id: created.id, p_now: now });
  await recordAuditEvent({
    actorType: "user",
    actorUserId: user.id,
    action: "automated_qa.started",
    resourceType: "automated_qa_evaluation",
    resourceId: created.id,
    result: "success",
    metadata: { interactionId, channel, agentId, turnCount: turns.length },
    source: "api/admin"
  });
  let result;
  try {
    result = await evaluateInteraction(turns);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.rpc("call_center_automated_qa_fail", {
      p_evaluation_id: created.id,
      p_error_code: "internal_error",
      p_error_message: message,
      p_request_ids: [],
      p_now: (/* @__PURE__ */ new Date()).toISOString()
    });
    await recordAuditEvent({
      actorType: "user",
      actorUserId: user.id,
      action: "automated_qa.failed",
      resourceType: "automated_qa_evaluation",
      resourceId: created.id,
      result: "error",
      metadata: { errorMessage: message },
      source: "api/admin"
    });
    res.status(502).json({ detail: `Automated QA evaluation failed: ${message}` });
    return;
  }
  const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (result.status === "failed") {
    const { data: data2, error: error2 } = await supabase.rpc("call_center_automated_qa_fail", {
      p_evaluation_id: created.id,
      p_error_code: result.errorCode,
      p_error_message: result.errorMessage,
      p_request_ids: result.requestIds,
      p_now: finishedAt,
      p_model_id: result.modelId,
      p_evaluated_turn_ids: result.evaluatedTurnIds,
      p_uncovered_turn_ids: result.uncoveredTurnIds,
      p_evaluation_completeness: result.evaluationCompleteness,
      p_window_count: result.windowCount,
      p_token_usage: result.tokenUsage,
      p_latency_ms: result.latencyMs
    });
    if (error2) {
      res.status(500).json({ detail: error2.message });
      return;
    }
    await persistAutomatedQaAttempts(supabase, created.id, result.attempts, finishedAt);
    await recordAuditEvent({
      actorType: "user",
      actorUserId: user.id,
      action: "automated_qa.failed",
      resourceType: "automated_qa_evaluation",
      resourceId: created.id,
      result: "error",
      metadata: { errorCode: result.errorCode, errorMessage: result.errorMessage },
      source: "api/admin"
    });
    res.status(200).json({ data: toCamelAutomatedQa(data2) });
    return;
  }
  const { data, error } = await supabase.rpc("call_center_automated_qa_complete", {
    p_evaluation_id: created.id,
    p_status: result.status,
    p_model_id: result.modelId,
    p_request_ids: result.requestIds,
    p_evaluated_turn_ids: result.evaluatedTurnIds,
    p_uncovered_turn_ids: result.uncoveredTurnIds,
    p_unassessable_parameters: result.unassessableParameters.map((u) => ({ parameter_code: u.parameterCode, reason: u.reason })),
    p_evaluation_completeness: result.evaluationCompleteness,
    p_window_count: result.windowCount,
    p_token_usage: result.tokenUsage,
    p_latency_ms: result.latencyMs,
    p_observations: result.observations.map((o) => ({
      parameterCode: o.parameterCode,
      value: o.value,
      primaryTurnId: o.primaryTurnId,
      evidenceTurnIds: o.evidenceTurnIds,
      reasonCode: o.reasonCode,
      explanation: o.explanation
    })),
    p_now: finishedAt
  });
  if (error) {
    res.status(500).json({ detail: error.message });
    return;
  }
  await persistAutomatedQaAttempts(supabase, created.id, result.attempts, finishedAt);
  await recordAuditEvent({
    actorType: "user",
    actorUserId: user.id,
    action: `automated_qa.${result.status}`,
    resourceType: "automated_qa_evaluation",
    resourceId: created.id,
    result: "success",
    metadata: {
      interactionId,
      channel,
      agentId,
      observationCount: result.observations.length,
      windowCount: result.windowCount,
      evaluationCompleteness: result.evaluationCompleteness
    },
    source: "api/admin"
  });
  res.status(200).json({ data: toCamelAutomatedQa(data) });
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
  if (resource === "automatedQa") {
    if (req.method === "GET") {
      await handleAutomatedQaGet(req, res);
      return;
    }
    if (req.method === "POST") {
      await handleAutomatedQaPost(req, res);
      return;
    }
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }
  res.status(400).json({ detail: "Unknown or missing ?resource= \u2014 use me, users, roles, permissions, audit, actions, qa, or automatedQa" });
});
export {
  actionItemBootstrapWindow,
  admin_default as default,
  getAppOrigin,
  mapActionItemError,
  qaReviewViewAuthorized,
  toActionScopeArgs
};
