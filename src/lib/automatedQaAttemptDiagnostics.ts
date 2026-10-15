/**
 * Session 16.4.4 — Automated QA attempt diagnostics. Pure types/helpers,
 * no persistence and no LLM/network code here (consistent with this
 * project's convention of keeping orchestration in
 * src/server/qa/automatedQaEvaluator.ts and dumb I/O in
 * src/server/qa/genericLlmClient.ts).
 *
 * Does NOT redesign the evaluation response schema, scoring, or
 * applicability rules — this module only describes what happened on
 * each individual LLM call attempt within a window, for diagnosis.
 */

/**
 * Raw LLM response text may contain customer transcript content
 * (brief §3 — server-side storage only, never console/localStorage).
 * Bounded so a pathological/runaway response can't grow a diagnostic
 * row without limit; the bound is generous relative to the evaluator's
 * own MAX_OUTPUT_TOKENS_CAP (6144 tokens, ~24-30k chars of JSON) so a
 * real response is never truncated in practice — only a genuinely
 * malformed/runaway body is.
 */
export const RAW_RESPONSE_MAX_CHARS = 60_000;

export function boundRawResponse(text: string | null | undefined): string | null {
  if (text == null) return null;
  if (text.length <= RAW_RESPONSE_MAX_CHARS) return text;
  const omitted = text.length - RAW_RESPONSE_MAX_CHARS;
  return `${text.slice(0, RAW_RESPONSE_MAX_CHARS)}\n...[truncated, ${omitted} more characters omitted]`;
}

/**
 * Coarse outcome classification for an individual attempt — the
 * vocabulary brief §3 asks for: did it return a response, fail during
 * transport, fail during JSON parsing, fail schema/semantic validation,
 * or pass. `llm_error` covers every other documented, non-transport
 * error_code the Generic Local LLM API itself returns (rate_limited,
 * context_length_exceeded, output_truncated, etc. — src/server/qa/
 * genericLlmClient.ts's LLM_ERROR_CODES) that isn't one of this
 * application's own two semantic-validation defects.
 */
export type QaAttemptOutcome =
  | 'success'
  | 'transport_failure'
  | 'parse_failure'
  | 'llm_error'
  | 'contradictory_applicability'
  | 'uninformative_unassessability';

export interface QaAttemptContradictionDetail {
  parameterCodes: string[];
  /** Raw per-code occurrence counts in the model's own `observations` array, before validation filtering — diagnoses whether the model emitted the code once or duplicated it. */
  observationOccurrences: Record<string, number>;
  /** Raw per-code occurrence counts in the model's own `unassessable_parameters` array. */
  unassessableOccurrences: Record<string, number>;
  detectedAt: 'cross_array_contradiction';
}

export interface QaAttemptPlaceholderDetail {
  parameterCodes: string[];
  detectedAt: 'placeholder_unassessability';
}

export interface QaAttemptValidationDetail {
  /** Individually-rejected observation entries (bad turn id, unknown parameter, duplicate opportunity, etc.) — preserved for diagnosis even when the attempt otherwise succeeds; never changes what gets persisted as a real observation. */
  rejectedObservations: Array<{ reason: string }>;
  contradiction: QaAttemptContradictionDetail | null;
  placeholder: QaAttemptPlaceholderDetail | null;
}

export interface QaAttemptDiagnostic {
  attemptId: string;
  windowIndex: number;
  /** 1-based within this window (brief §2.1). */
  attemptNumber: number;
  requestId: string;
  modelId: string | null;
  outcome: QaAttemptOutcome;
  errorCode: string | null;
  errorMessage: string | null;
  /** Exact response body text, before any parsing/validation — null only when the attempt never received a body (a transport-level failure). */
  rawResponseText: string | null;
  validationDetail: QaAttemptValidationDetail | null;
  /** Why this attempt happened — the previous attempt's error/defect code, or null for the first attempt in a window. */
  retryReason: string | null;
  /** Identifies which correction instruction (if any) was appended to this attempt's prompt relative to the window's base prompt. */
  correctionInstructionId: string | null;
  previousAttemptId: string | null;
  requestedMaxOutputTokens: number;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  startedAt: string;
  completedAt: string;
}

/**
 * Session 16.4.4 (brief §6) — "a failure to write optional diagnostics
 * must not turn a valid QA evaluation into a failure." `write` is
 * injected (never a real Supabase client here, keeping this module free
 * of DB/network code) so the resilience guarantee is testable
 * deterministically: this function is provably unable to throw or
 * reject — every failure path, whether the write call rejects or
 * resolves with an `error`, is caught and reported as a safe
 * {ok:false} result instead of propagating. The caller (api/admin.ts)
 * can therefore `await` this without its own try/catch and persist the
 * evaluation's own terminal state unconditionally.
 */
export async function persistAttemptDiagnosticsSafely(
  write: (evaluationId: string, attempts: unknown[], now: string) => Promise<{ error: { message: string } | null }>,
  evaluationId: string,
  attempts: unknown[],
  now: string,
): Promise<{ ok: boolean; error: string | null }> {
  if (!attempts || attempts.length === 0) return { ok: true, error: null };
  try {
    const { error } = await write(evaluationId, attempts, now);
    if (error) {
      // Never log the raw response body here — only the evaluation id
      // and the write failure's own message (a DB/constraint error, not
      // customer transcript content).
      console.error(`[automatedQa] attempt-diagnostics write failed for evaluation ${evaluationId}: ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(`[automatedQa] attempt-diagnostics write threw for evaluation ${evaluationId}: ${message}`);
    return { ok: false, error: message };
  }
}

/** Counts occurrences of each target parameter code in a raw (unvalidated) model array entry list, keyed by `parameter_code`. */
export function countRawParameterOccurrences(
  rawEntries: unknown,
  targetCodes: readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const code of targetCodes) counts[code] = 0;
  if (!Array.isArray(rawEntries)) return counts;
  for (const entry of rawEntries) {
    const code = (entry as { parameter_code?: unknown })?.parameter_code;
    if (typeof code === 'string' && code in counts) counts[code] += 1;
  }
  return counts;
}
