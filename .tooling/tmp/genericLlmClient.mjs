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
var LLM_ERROR_CODES = [
  "invalid_request_body",
  "unauthorized",
  "invalid_request",
  "invalid_json_schema",
  "unsupported_model",
  "context_length_exceeded",
  "output_truncated",
  "rate_limited",
  "llm_unavailable",
  "invalid_model_output",
  "inference_timeout"
];
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
export {
  LLM_ERROR_CODES,
  callGenericLlm,
  isRetryableLlmError
};
