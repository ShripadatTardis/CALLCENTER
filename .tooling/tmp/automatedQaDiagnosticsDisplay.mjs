// src/lib/automatedQaDiagnosticsDisplay.ts
var OUTCOME_BADGE_VARIANT = {
  success: "positive",
  transport_failure: "destructive",
  parse_failure: "destructive",
  llm_error: "destructive",
  contradictory_applicability: "warning",
  uninformative_unassessability: "warning"
};
function outcomeLabel(outcome) {
  return outcome.replace(/_/g, " ");
}
var RAW_RESPONSE_TRUNCATION_THRESHOLD = 6e4;
function isLikelyTruncated(text) {
  return text.length >= RAW_RESPONSE_TRUNCATION_THRESHOLD;
}
function extractContradiction(validationDetail) {
  if (!validationDetail) return null;
  const c = validationDetail.contradiction;
  return c ?? null;
}
function attemptsWithContradiction(attempts) {
  return attempts.filter((a) => extractContradiction(a.validationDetail) !== null);
}
function countRetries(attempts) {
  return attempts.filter((a) => a.attemptNumber > 1).length;
}
function sortAttemptsForDisplay(attempts) {
  return [...attempts].sort((a, b) => a.windowIndex - b.windowIndex || a.attemptNumber - b.attemptNumber);
}
export {
  OUTCOME_BADGE_VARIANT,
  RAW_RESPONSE_TRUNCATION_THRESHOLD,
  attemptsWithContradiction,
  countRetries,
  extractContradiction,
  isLikelyTruncated,
  outcomeLabel,
  sortAttemptsForDisplay
};
