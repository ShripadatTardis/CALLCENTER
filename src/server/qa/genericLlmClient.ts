/**
 * Session 16.3 — thin, dumb client for the Generic Local LLM API
 * (docs/Generic_Local_LLM_API.docx, VoiceForce Banking Voicebot
 * integration suite). Deliberately owns NOTHING about QA — no prompts,
 * no schemas, no parameter vocabulary, no persistence (brief §4: "Do
 * not move QA business logic into the generic LLM API [client]"). It
 * only knows how to POST a request and type the response.
 *
 * Reuses the SAME VOICEBOT_BASE_URL/VOICEBOT_API_KEY env vars as
 * api/_voicebot.ts — the Generic Local LLM endpoint
 * (/api/v1/llm/generate) lives on the same host as the rest of the
 * Banking Voicebot integration suite this project already talks to.
 * Not reusing proxyRequest() itself: that helper forwards an inbound
 * client request body as-is, where this client constructs its own
 * request body server-side — a different shape of helper, same config
 * source.
 */

import { getBackendConfig } from '../../../api/_voicebot.js';

export interface LlmJsonSchemaRequest {
  requestId: string;
  systemPrompt?: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  modelId?: string;
}

export interface LlmResponse {
  success: boolean;
  requestId: string | null;
  output: unknown;
  modelId: string;
  finishReason: 'stop' | 'length' | 'error';
  latencyMs: number | null;
  usage: { promptTokens: number | null; completionTokens: number | null };
  errorCode: string | null;
  errorMessage: string | null;
}

/** The documented error_code vocabulary (brief §13 / API spec's ERROR RESPONSES table) — exhaustive, used to classify retryable vs. permanent failures. */
export const LLM_ERROR_CODES = [
  'invalid_request_body', 'unauthorized', 'invalid_request', 'invalid_json_schema',
  'unsupported_model', 'context_length_exceeded', 'output_truncated',
  'rate_limited', 'llm_unavailable', 'invalid_model_output', 'inference_timeout',
] as const;
export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number];

/** Per brief §13: retry rate limits/unavailability/timeouts with backoff; never retry a permanent validation error (the request itself is wrong and retrying won't fix it). */
export function isRetryableLlmError(errorCode: string | null): boolean {
  return errorCode === 'rate_limited' || errorCode === 'llm_unavailable' || errorCode === 'inference_timeout';
}

function toCamelResponse(raw: any): LlmResponse {
  return {
    success: !!raw?.success,
    requestId: raw?.request_id ?? null,
    output: raw?.output ?? null,
    modelId: raw?.model_id ?? '',
    finishReason: raw?.finish_reason ?? 'error',
    latencyMs: raw?.latency_ms ?? null,
    usage: {
      promptTokens: raw?.usage?.prompt_tokens ?? null,
      completionTokens: raw?.usage?.completion_tokens ?? null,
    },
    errorCode: raw?.error_code ?? null,
    errorMessage: raw?.error_message ?? null,
  };
}

/**
 * One call, one attempt — bounded retry policy lives in the orchestrator
 * (automatedQaEvaluator.ts), not here, so this stays a pure I/O wrapper.
 * Network-level failures (fetch throw, non-JSON body) are normalized
 * into the same LlmResponse shape with a synthetic error_code so callers
 * never need two different failure paths.
 */
export async function callGenericLlm(req: LlmJsonSchemaRequest): Promise<LlmResponse> {
  const { baseUrl, apiKey } = getBackendConfig();
  const body = {
    request_id: req.requestId,
    system_prompt: req.systemPrompt ?? null,
    user_prompt: req.userPrompt,
    response_format: { type: 'json_schema', json_schema: req.jsonSchema },
    temperature: req.temperature ?? 0,
    max_output_tokens: req.maxOutputTokens ?? 2048,
    model_id: req.modelId ?? null,
  };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/llm/generate`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      success: false, requestId: req.requestId, output: null, modelId: req.modelId ?? '',
      finishReason: 'error', latencyMs: null, usage: { promptTokens: null, completionTokens: null },
      errorCode: 'network_error', errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return {
      success: false, requestId: req.requestId, output: null, modelId: req.modelId ?? '',
      finishReason: 'error', latencyMs: null, usage: { promptTokens: null, completionTokens: null },
      errorCode: 'invalid_model_output', errorMessage: `Non-JSON response body (HTTP ${res.status})`,
    };
  }

  // Defensive: a response that doesn't carry the documented contract's
  // own error_code field (e.g. a platform-level 404/502 from something
  // other than the LLM endpoint itself — a reverse proxy, a route that
  // isn't actually deployed yet) must still surface a diagnosable error
  // rather than silently producing a FAILED evaluation with no error
  // code/message at all.
  const raw = parsed as Record<string, unknown> | null;
  if (!res.ok && (!raw || typeof raw.error_code !== 'string')) {
    const detail = raw && typeof raw.detail === 'string' ? raw.detail : text.slice(0, 200);
    return {
      success: false, requestId: req.requestId, output: null, modelId: req.modelId ?? '',
      finishReason: 'error', latencyMs: null, usage: { promptTokens: null, completionTokens: null },
      errorCode: 'http_error', errorMessage: `HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
    };
  }

  return toCamelResponse(parsed);
}
