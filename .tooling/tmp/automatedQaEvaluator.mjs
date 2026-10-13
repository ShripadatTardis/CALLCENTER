// api/_voicebot.ts
function getBackendConfig() {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
  }
  return { baseUrl, apiKey };
}

// src/server/qa/genericLlmClient.ts
function isRetryableLlmError(errorCode) {
  return errorCode === "rate_limited" || errorCode === "llm_unavailable" || errorCode === "inference_timeout";
}
function toCamelResponse(raw) {
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
    errorMessage: raw?.error_message ?? null
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
      errorMessage: err instanceof Error ? err.message : String(err)
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
      errorMessage: `Non-JSON response body (HTTP ${res.status})`
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
      errorMessage: `HTTP ${res.status}${detail ? `: ${detail}` : ""}`
    };
  }
  return toCamelResponse(parsed);
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
var PROMPT_VERSION = "v1";
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

// src/server/qa/automatedQaEvaluator.ts
var CONTEXT_WINDOW_TOKENS = 8192;
var MAX_OUTPUT_TOKENS = 3072;
var MAX_OUTPUT_TOKENS_CAP = 6144;
var SAFETY_MARGIN_TOKENS = 200;
var MAX_RETRIES_PER_WINDOW = 2;
var RETRY_BACKOFF_MS = [500, 1500];
var CONSISTENCY_RETRY_INSTRUCTION = "\n\nCORRECTION REQUIRED: Your previous response classified the same parameter in BOTH `observations` and `unassessable_parameters`. Each parameter must appear in EXACTLY ONE of the two collections, never both. If a parameter has no genuine assessment opportunity, list it ONLY in `unassessable_parameters` and do not also add an `observations` entry for it.";
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
      errorMessage: "The transcript had no turns to evaluate."
    };
  }
  const allValidTurnIds = new Set(turns.map((t) => t.turnId));
  const observations = [];
  const unassessable = [];
  const requestIds = [];
  const evaluatedTurnIds = [];
  const uncoveredTurnIds = [];
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
    const requestId = `qa-${Math.random().toString(36).slice(2)}-${window.index}`;
    const baseUserPrompt = buildUserPrompt(aliasedTurns, window.index, windows.length);
    let userPrompt = baseUserPrompt;
    let attempt = 0;
    let succeeded = false;
    let windowMaxOutputTokens = MAX_OUTPUT_TOKENS;
    let contradictionRetried = false;
    while (attempt <= MAX_RETRIES_PER_WINDOW) {
      const res = await callGenericLlm({
        requestId,
        systemPrompt,
        userPrompt,
        jsonSchema: schema,
        temperature: 0,
        maxOutputTokens: windowMaxOutputTokens
      });
      requestIds.push(requestId);
      if (res.latencyMs) latencyMs += res.latencyMs;
      if (res.usage.promptTokens) promptTokens += res.usage.promptTokens;
      if (res.usage.completionTokens) completionTokens += res.usage.completionTokens;
      if (res.modelId) modelId = res.modelId;
      if (res.success && res.output && typeof res.output === "object") {
        const out = res.output;
        const validation = validateAutomatedObservations(out.observations, windowTurnIds);
        const windowUnassessable = validateUnassessableParameters(out.unassessable_parameters);
        const conflicts = detectCrossArrayContradiction(validation.accepted, windowUnassessable);
        if (conflicts.length > 0) {
          lastErrorCode = "contradictory_applicability";
          lastErrorMessage = `The model classified the same parameter(s) as both assessed and unassessable in one response: ${conflicts.join(", ")}.`;
          if (!contradictionRetried && attempt < MAX_RETRIES_PER_WINDOW) {
            contradictionRetried = true;
            userPrompt = baseUserPrompt + CONSISTENCY_RETRY_INSTRUCTION;
            attempt += 1;
            continue;
          }
          break;
        }
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
      if (attempt === MAX_RETRIES_PER_WINDOW) break;
      if (res.errorCode === "output_truncated" && windowMaxOutputTokens < MAX_OUTPUT_TOKENS_CAP) {
        windowMaxOutputTokens = Math.min(windowMaxOutputTokens * 2, MAX_OUTPUT_TOKENS_CAP);
        attempt += 1;
        continue;
      }
      if (!isRetryableLlmError(res.errorCode)) break;
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
    errorMessage: status === "failed" ? lastErrorMessage : null
  };
}
export {
  PROMPT_VERSION,
  evaluateInteraction
};
