// src/lib/interactionTraceErrorMessage.ts
function mapInteractionTraceError(status, code) {
  if (status === 404 || code === "trace_not_found") {
    return { message: "No trace is available for this interaction (not recorded, or outside the retention period).", canRetry: false };
  }
  if (status === 409 || code === "trace_not_ready") {
    return { message: "This interaction is still in progress \u2014 no turn has been recorded yet. Try again shortly.", canRetry: true };
  }
  if (status === 422 || code === "invalid_interaction_id") {
    return { message: "This interaction id is not a valid trace identifier.", canRetry: false };
  }
  if (status === 401) {
    return { message: "The trace service rejected the server credential (401). Contact an administrator.", canRetry: false };
  }
  if (status === 403) {
    return { message: "The configured trace credential lacks the transcripts permission (403). Contact an administrator.", canRetry: false };
  }
  if (status === 502 || code === "trace_store_unavailable") {
    return { message: "The trace store is temporarily unavailable. Try again shortly.", canRetry: true };
  }
  return { message: "Could not load the interaction trace.", canRetry: true };
}
export {
  mapInteractionTraceError
};
