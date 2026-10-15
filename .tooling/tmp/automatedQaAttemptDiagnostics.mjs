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
export {
  RAW_RESPONSE_MAX_CHARS,
  boundRawResponse,
  countRawParameterOccurrences,
  persistAttemptDiagnosticsSafely
};
