import { callGenericLlm, isRetryableLlmError } from './genericLlmClient.js';
import { buildSystemPrompt, buildUserPrompt, PROMPT_VERSION } from '../../lib/automatedQaPrompt.js';
import { buildAutomatedQaJsonSchema } from '../../lib/automatedQaSchema.js';
import { planQaTurnWindows, estimateTokens } from '../../lib/automatedQaWindowPlanner.js';
import { validateAutomatedObservations, validateUnassessableParameters, type AutomatedQaObservationInput, type UnassessableParameter } from '../../lib/automatedQaValidation.js';
import type { QaTurn } from '../../lib/qaConversation.js';

/**
 * Session 16.3 — evaluation orchestration. VoiceForce-owned: this is
 * where the Measurement Contract, conversation preparation, retries, and
 * context-window planning live (brief §4); genericLlmClient.ts is kept a
 * dumb I/O wrapper on purpose.
 *
 * Concurrency (brief §13): "one evaluation per interaction at a time" is
 * enforced by the caller via the DB's partial unique index
 * (automated_qa_evaluations_one_inflight_per_interaction) before this
 * function is ever invoked — this module itself only bounds concurrency
 * WITHIN one evaluation (its own windows run sequentially, never in
 * parallel, so a multi-window evaluation never exceeds the API's 4
 * concurrent-request ceiling even under concurrent evaluations of other
 * interactions).
 */

const CONTEXT_WINDOW_TOKENS = 8192;
// Live verification (2026-10-12) hit `output_truncated` on a real evaluation
// with 1536 — nine parameters' worth of observations (each with a reason
// code, evidence turn ids, and up to a 300-char explanation) plus
// unassessable_parameters can legitimately exceed that. Raised to a safer
// default; MAX_OUTPUT_TOKENS_CAP is the ceiling the adaptive retry below
// escalates toward on an actual output_truncated response, per the API's
// own error message ("Increase max_output_tokens").
const MAX_OUTPUT_TOKENS = 3072;
const MAX_OUTPUT_TOKENS_CAP = 6144;
const SAFETY_MARGIN_TOKENS = 200;
const MAX_RETRIES_PER_WINDOW = 2;
const RETRY_BACKOFF_MS = [500, 1500];

export interface EvaluateInteractionResult {
  status: 'completed' | 'partial' | 'failed';
  modelId: string | null;
  requestIds: string[];
  evaluatedTurnIds: string[];
  uncoveredTurnIds: string[];
  unassessableParameters: UnassessableParameter[];
  evaluationCompleteness: 'COMPLETE' | 'PARTIAL';
  windowCount: number;
  tokenUsage: { promptTokens: number; completionTokens: number };
  latencyMs: number;
  observations: AutomatedQaObservationInput[];
  errorCode: string | null;
  errorMessage: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function evaluateInteraction(turns: QaTurn[]): Promise<EvaluateInteractionResult> {
  const systemPrompt = buildSystemPrompt();
  const schema = buildAutomatedQaJsonSchema();
  const fixedOverhead = estimateTokens(systemPrompt) + estimateTokens(JSON.stringify(schema)) + MAX_OUTPUT_TOKENS + SAFETY_MARGIN_TOKENS;
  const transcriptBudget = Math.max(CONTEXT_WINDOW_TOKENS - fixedOverhead, 500);

  const windows = planQaTurnWindows(turns, transcriptBudget);
  if (windows.length === 0) {
    return {
      status: 'failed', modelId: null, requestIds: [], evaluatedTurnIds: [], uncoveredTurnIds: [],
      unassessableParameters: [], evaluationCompleteness: 'PARTIAL', windowCount: 0,
      tokenUsage: { promptTokens: 0, completionTokens: 0 }, latencyMs: 0, observations: [],
      errorCode: 'no_reviewable_turns', errorMessage: 'The transcript had no turns to evaluate.',
    };
  }

  const allValidTurnIds = new Set(turns.map((t) => t.turnId));
  const observations: AutomatedQaObservationInput[] = [];
  const unassessable: UnassessableParameter[] = [];
  const requestIds: string[] = [];
  const evaluatedTurnIds: string[] = [];
  const uncoveredTurnIds: string[] = [];
  let modelId: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let latencyMs = 0;
  let anyWindowFailed = false;
  let lastErrorCode: string | null = null;
  let lastErrorMessage: string | null = null;

  for (const window of windows) {
    const windowTurnIds = new Set(window.turns.map((t) => t.turnId));
    const requestId = `qa-${Math.random().toString(36).slice(2)}-${window.index}`;
    const userPrompt = buildUserPrompt(window.turns, window.index, windows.length);

    let attempt = 0;
    let succeeded = false;
    let windowMaxOutputTokens = MAX_OUTPUT_TOKENS;
    while (attempt <= MAX_RETRIES_PER_WINDOW) {
      const res = await callGenericLlm({
        requestId, systemPrompt, userPrompt, jsonSchema: schema,
        temperature: 0, maxOutputTokens: windowMaxOutputTokens,
      });
      requestIds.push(requestId);
      if (res.latencyMs) latencyMs += res.latencyMs;
      if (res.usage.promptTokens) promptTokens += res.usage.promptTokens;
      if (res.usage.completionTokens) completionTokens += res.usage.completionTokens;
      if (res.modelId) modelId = res.modelId;

      // TEMP diagnostic (2026-10-12) — tracking a live output_truncated
      // failure that a direct reproduction of the same transcript could
      // not reproduce. Remove once root-caused.
      console.log('[automatedQaEvaluator] window', window.index, 'attempt', attempt, 'maxOutputTokens', windowMaxOutputTokens, 'success', res.success, 'errorCode', res.errorCode, 'completionTokens', res.usage.completionTokens, 'finishReason', res.finishReason, 'turnCount', window.turns.length, 'userPromptLen', userPrompt.length);

      if (res.success && res.output && typeof res.output === 'object') {
        const out = res.output as { observations?: unknown; unassessable_parameters?: unknown };
        const validation = validateAutomatedObservations(out.observations, windowTurnIds);
        observations.push(...validation.accepted);
        unassessable.push(...validateUnassessableParameters(out.unassessable_parameters));
        evaluatedTurnIds.push(...window.turns.map((t) => t.turnId));
        succeeded = true;
        break;
      }

      lastErrorCode = res.errorCode;
      lastErrorMessage = res.errorMessage;
      if (attempt === MAX_RETRIES_PER_WINDOW) break;

      // output_truncated is deterministic, not transient — the API's own
      // error message says exactly what to do ("Increase max_output_tokens").
      // Escalate the budget and retry immediately (no backoff needed, this
      // isn't rate limiting), capped at MAX_OUTPUT_TOKENS_CAP.
      if (res.errorCode === 'output_truncated' && windowMaxOutputTokens < MAX_OUTPUT_TOKENS_CAP) {
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

  // Cross-window repetition/loop visibility caveat (brief §12 — never
  // silently under-report a span-crossing repetition as NO_ISSUE when
  // the evaluator could only ever see one window at a time).
  if (windows.length > 1) {
    unassessable.push({
      parameterCode: 'repetition_loop_rate',
      reason: `Interaction was evaluated across ${windows.length} separate context windows; repetition/loop detection only covers exchanges within a single window, not across window boundaries.`,
    });
  }

  const dedupUnassessable = Array.from(
    new Map(unassessable.map((u) => [`${u.parameterCode}:${u.reason}`, u])).values(),
  );

  const allTurnsCovered = evaluatedTurnIds.length > 0 && uncoveredTurnIds.length === 0;
  const status: EvaluateInteractionResult['status'] =
    evaluatedTurnIds.length === 0 ? 'failed' : anyWindowFailed ? 'partial' : 'completed';

  return {
    status,
    modelId,
    requestIds,
    evaluatedTurnIds: Array.from(new Set(evaluatedTurnIds)).filter((id) => allValidTurnIds.has(id)),
    uncoveredTurnIds: Array.from(new Set(uncoveredTurnIds)),
    unassessableParameters: dedupUnassessable,
    evaluationCompleteness: allTurnsCovered ? 'COMPLETE' : 'PARTIAL',
    windowCount: windows.length,
    tokenUsage: { promptTokens, completionTokens },
    latencyMs,
    observations,
    errorCode: status === 'failed' ? lastErrorCode : null,
    errorMessage: status === 'failed' ? lastErrorMessage : null,
  };
}

export { PROMPT_VERSION };
