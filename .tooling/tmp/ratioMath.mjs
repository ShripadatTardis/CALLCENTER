// src/lib/format.ts
var STALE_DURATION_SECONDS = 4 * 60 * 60;
function isStaleDuration(seconds) {
  return seconds !== void 0 && seconds >= STALE_DURATION_SECONDS;
}

// src/server/analytics/ratioMath.ts
function rateOrNull(numerator, denominator) {
  if (denominator === 0) return null;
  return Math.round(numerator / denominator * 1e3) / 10;
}
function handledCalls(calls) {
  return calls.filter((c) => c.outcome === "resolved" || c.outcome === "escalated");
}
function withValidDuration(calls) {
  return calls.filter((c) => typeof c.duration_seconds === "number" && Number.isFinite(c.duration_seconds) && !isStaleDuration(c.duration_seconds));
}
function computeFcr(calls) {
  const denominator = calls.length;
  const numerator = calls.filter((c) => c.fcr === true).length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}
function computeEscalationRate(calls) {
  const handled = handledCalls(calls);
  const denominator = handled.length;
  const numerator = handled.filter((c) => c.outcome === "escalated").length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}
function computeResolutionRate(calls) {
  const handled = handledCalls(calls);
  const denominator = handled.length;
  const numerator = handled.filter((c) => c.outcome === "resolved").length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}
function computeAht(calls) {
  const durations = withValidDuration(calls).map((c) => c.duration_seconds);
  const denominator = durations.length;
  const numerator = durations.reduce((sum, d) => sum + d, 0);
  const value = denominator === 0 ? null : Math.round(numerator / denominator);
  return { value, numerator: Math.round(numerator), denominator };
}
function computeSuccessfulResolutionTime(calls) {
  const resolved = calls.filter((c) => c.outcome === "resolved");
  const durations = withValidDuration(resolved).map((c) => c.duration_seconds);
  const denominator = durations.length;
  const numerator = durations.reduce((sum, d) => sum + d, 0);
  const value = denominator === 0 ? null : Math.round(numerator / denominator);
  return { value, numerator: Math.round(numerator), denominator };
}
var RATIO_CALCULATORS = {
  fcr: computeFcr,
  escalation_rate: computeEscalationRate,
  resolution_rate: computeResolutionRate,
  aht: computeAht,
  successful_resolution_time: computeSuccessfulResolutionTime
};
var RATIO_ELIGIBLE_POPULATION = {
  fcr: (calls) => calls,
  escalation_rate: handledCalls,
  resolution_rate: handledCalls,
  aht: withValidDuration,
  successful_resolution_time: (calls) => withValidDuration(calls.filter((c) => c.outcome === "resolved"))
};
function computeComparison(current, previous, isPercent) {
  if (current === null || previous === null) return null;
  return {
    previousValue: previous,
    delta: Math.round((current - previous) * 10) / 10,
    isPercentagePoints: isPercent
  };
}
export {
  RATIO_CALCULATORS,
  RATIO_ELIGIBLE_POPULATION,
  computeAht,
  computeComparison,
  computeEscalationRate,
  computeFcr,
  computeResolutionRate,
  computeSuccessfulResolutionTime
};
