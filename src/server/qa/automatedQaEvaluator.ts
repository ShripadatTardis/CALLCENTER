import { randomUUID } from 'node:crypto';
import { callGenericLlm, isRetryableLlmError } from './genericLlmClient.js';
import { buildSystemPrompt, buildUserPrompt, buildConsistencyRetryInstruction, buildPlaceholderReasonRetryInstruction, PROMPT_VERSION } from '../../lib/automatedQaPrompt.js';
import { buildAutomatedQaJsonSchema } from '../../lib/automatedQaSchema.js';
import { planQaTurnWindows, estimateTokens } from '../../lib/automatedQaWindowPlanner.js';
import { validateAutomatedObservations, validateUnassessableParameters, detectCrossArrayContradiction, detectPlaceholderUnassessability, type AutomatedQaObservationInput, type UnassessableParameter } from '../../lib/automatedQaValidation.js';
import { boundRawResponse, countRawParameterOccurrences, type QaAttemptDiagnostic, type QaAttemptOutcome, type QaAttemptValidationDetail } from '../../lib/automatedQaAttemptDiagnostics.js';
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
  /** Session 16.4.4 — one diagnostic record per LLM call attempt (initial + every retry), across every window. Never fed back into scoring/applicability — diagnosis only. */
  attempts: QaAttemptDiagnostic[];
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
      attempts: [],
    };
  }

  const allValidTurnIds = new Set(turns.map((t) => t.turnId));
  const observations: AutomatedQaObservationInput[] = [];
  const unassessable: UnassessableParameter[] = [];
  const requestIds: string[] = [];
  const evaluatedTurnIds: string[] = [];
  const uncoveredTurnIds: string[] = [];
  const attempts: QaAttemptDiagnostic[] = [];
  let modelId: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let latencyMs = 0;
  let anyWindowFailed = false;
  let lastErrorCode: string | null = null;
  let lastErrorMessage: string | null = null;

  for (const window of windows) {
    // Alias real turn ids (e.g. "8d4ea4f4-...:2026-10-12T10:46:11.317212
    // +00:00:customer", ~80 chars) to short "T1"/"T2"/... labels for the
    // LLM. Real turn ids are reused verbatim from Human QA's own
    // identity scheme (brief §11 — never a second id scheme) and must
    // stay that way for persistence/cross-referencing, but a small model
    // asked to echo an 80-char id back once per observation (primary_turn_id
    // AND evidence_turn_ids) reliably runs the completion far past any
    // reasonable output budget — found via live verification 2026-10-12
    // (a real 8-turn/9-parameter evaluation hit output_truncated even at
    // a 6144-token cap, and context_length_exceeded beyond that, while an
    // aliased reproduction of the identical conversation completed
    // cleanly in ~625 tokens). Aliasing only affects what the model
    // reads/writes; every observation is mapped back to its real turn id
    // before validation accepts it.
    const aliasToReal = new Map(window.turns.map((t, i) => [`T${i + 1}`, t.turnId]));
    const aliasedTurns = window.turns.map((t, i) => ({ ...t, turnId: `T${i + 1}` }));
    const windowTurnIds = new Set(aliasToReal.keys());
    // Session 16.4.4 — the base id now only seeds per-attempt ids; every
    // attempt gets its OWN distinct request_id (suffixed with its 1-based
    // attempt number), fixing a real diagnosability defect found in
    // docs/AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md §2.2: a
    // retried window used to log the identical request_id twice, making
    // it impossible to tell from `request_ids` alone that a retry had
    // even happened.
    const baseRequestId = `qa-${Math.random().toString(36).slice(2)}-${window.index}`;
    const baseUserPrompt = buildUserPrompt(aliasedTurns, window.index, windows.length);
    let userPrompt = baseUserPrompt;

    let attempt = 0;
    let succeeded = false;
    let windowMaxOutputTokens = MAX_OUTPUT_TOKENS;
    let contradictionRetried = false;
    let placeholderReasonRetried = false;
    let previousAttemptId: string | null = null;
    let retryReason: string | null = null;
    let correctionInstructionId: string | null = null;
    while (attempt <= MAX_RETRIES_PER_WINDOW) {
      const attemptNumber = attempt + 1;
      const attemptId = randomUUID();
      const requestId = `${baseRequestId}-a${attemptNumber}`;
      const requestedMaxOutputTokens = windowMaxOutputTokens;
      const startedAt = new Date().toISOString();
      const res = await callGenericLlm({
        requestId, systemPrompt, userPrompt, jsonSchema: schema,
        temperature: 0, maxOutputTokens: windowMaxOutputTokens,
      });
      const completedAt = new Date().toISOString();
      requestIds.push(requestId);
      if (res.latencyMs) latencyMs += res.latencyMs;
      if (res.usage.promptTokens) promptTokens += res.usage.promptTokens;
      if (res.usage.completionTokens) completionTokens += res.usage.completionTokens;
      if (res.modelId) modelId = res.modelId;

      const recordAttempt = (outcome: QaAttemptOutcome, errorCode: string | null, errorMessage: string | null, validationDetail: QaAttemptValidationDetail | null) => {
        attempts.push({
          attemptId, windowIndex: window.index, attemptNumber, requestId,
          modelId: res.modelId || null, outcome, errorCode, errorMessage,
          rawResponseText: boundRawResponse(res.rawResponseText),
          validationDetail, retryReason, correctionInstructionId, previousAttemptId,
          requestedMaxOutputTokens, promptTokens: res.usage.promptTokens, completionTokens: res.usage.completionTokens,
          latencyMs: res.latencyMs, startedAt, completedAt,
        });
        previousAttemptId = attemptId;
      };

      if (res.success && res.output && typeof res.output === 'object') {
        const out = res.output as { observations?: unknown; unassessable_parameters?: unknown };
        const validation = validateAutomatedObservations(out.observations, windowTurnIds);
        const windowUnassessable = validateUnassessableParameters(out.unassessable_parameters);
        const rejectedObservations = validation.rejected.map((r) => ({ reason: r.reason }));

        // Session 16.3.5 — a parameter must never appear in BOTH
        // collections (the model classifying something as "not
        // applicable" in unassessable_parameters while also emitting a
        // PASS observation for it produces a misleading 100% measurement
        // for a parameter that had no real opportunity). Never guess
        // which side is correct and never silently drop one — reject the
        // whole response, retry ONCE with an explicit correction
        // instruction, and fail this window closed if it recurs.
        const conflicts = detectCrossArrayContradiction(validation.accepted, windowUnassessable);
        if (conflicts.length > 0) {
          lastErrorCode = 'contradictory_applicability';
          lastErrorMessage = `The model classified the same parameter(s) as both assessed and unassessable in one response: ${conflicts.join(', ')}.`;
          recordAttempt('contradictory_applicability', lastErrorCode, lastErrorMessage, {
            rejectedObservations,
            contradiction: {
              parameterCodes: conflicts,
              observationOccurrences: countRawParameterOccurrences(out.observations, conflicts),
              unassessableOccurrences: countRawParameterOccurrences(out.unassessable_parameters, conflicts),
              detectedAt: 'cross_array_contradiction',
            },
            placeholder: null,
          });
          if (!contradictionRetried && attempt < MAX_RETRIES_PER_WINDOW) {
            // Session 16.3.8 (A2) — names the exact conflicting
            // parameter(s) and instructs the model to leave every other
            // parameter's assessment untouched, replacing the earlier
            // generic "you contradicted yourself" instruction that the
            // 16.3.6 investigation found likely caused an unrelated
            // over-correction into an all-unassessable response.
            contradictionRetried = true;
            userPrompt = baseUserPrompt + buildConsistencyRetryInstruction(conflicts);
            retryReason = lastErrorCode;
            correctionInstructionId = 'consistency_retry_v1';
            attempt += 1;
            continue;
          }
          break;
        }

        // Session 16.3.8 (A4) — an unassessable_parameters entry with a
        // placeholder, non-specific reason ("N_A", "NA", "-", empty) is
        // evidence the model discarded the parameter rather than
        // genuinely reasoning about it (the exact shape found in
        // evaluation cbaa9075 — all nine parameters, reason "N_A").
        // Narrowly scoped: a real all-N/A result with real explanations
        // is accepted as-is; only the placeholder-reason shape is
        // rejected, and only that parameter's reason is asked to be
        // rewritten on retry — nothing else in the response is disturbed.
        const placeholders = detectPlaceholderUnassessability(windowUnassessable);
        if (placeholders.length > 0) {
          lastErrorCode = 'uninformative_unassessability';
          lastErrorMessage = `The model marked parameter(s) unassessable with a placeholder (non-specific) reason instead of a real explanation: ${placeholders.join(', ')}.`;
          recordAttempt('uninformative_unassessability', lastErrorCode, lastErrorMessage, {
            rejectedObservations,
            contradiction: null,
            placeholder: { parameterCodes: placeholders, detectedAt: 'placeholder_unassessability' },
          });
          if (!placeholderReasonRetried && attempt < MAX_RETRIES_PER_WINDOW) {
            placeholderReasonRetried = true;
            userPrompt = baseUserPrompt + buildPlaceholderReasonRetryInstruction(placeholders);
            retryReason = lastErrorCode;
            correctionInstructionId = 'placeholder_retry_v1';
            attempt += 1;
            continue;
          }
          break;
        }

        recordAttempt('success', null, null, { rejectedObservations, contradiction: null, placeholder: null });

        observations.push(...validation.accepted.map((o) => ({
          ...o,
          primaryTurnId: aliasToReal.get(o.primaryTurnId) ?? o.primaryTurnId,
          evidenceTurnIds: o.evidenceTurnIds.map((id) => aliasToReal.get(id) ?? id),
        })));
        unassessable.push(...windowUnassessable);
        evaluatedTurnIds.push(...window.turns.map((t) => t.turnId));
        succeeded = true;
        break;
      }

      lastErrorCode = res.errorCode;
      lastErrorMessage = res.errorMessage;
      const outcome: QaAttemptOutcome =
        res.errorCode === 'network_error' || res.errorCode === 'http_error' ? 'transport_failure'
        : res.errorCode === 'invalid_model_output' ? 'parse_failure'
        : 'llm_error';
      recordAttempt(outcome, res.errorCode, res.errorMessage, null);

      if (attempt === MAX_RETRIES_PER_WINDOW) break;

      // output_truncated is deterministic, not transient — the API's own
      // error message says exactly what to do ("Increase max_output_tokens").
      // Escalate the budget and retry immediately (no backoff needed, this
      // isn't rate limiting), capped at MAX_OUTPUT_TOKENS_CAP.
      if (res.errorCode === 'output_truncated' && windowMaxOutputTokens < MAX_OUTPUT_TOKENS_CAP) {
        windowMaxOutputTokens = Math.min(windowMaxOutputTokens * 2, MAX_OUTPUT_TOKENS_CAP);
        retryReason = res.errorCode;
        correctionInstructionId = 'output_truncated_budget_escalation';
        attempt += 1;
        continue;
      }

      if (!isRetryableLlmError(res.errorCode)) break;
      retryReason = res.errorCode;
      correctionInstructionId = 'transient_backoff_retry';
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
    attempts,
  };
}

export { PROMPT_VERSION };
