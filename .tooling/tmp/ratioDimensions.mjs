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
function withAttemptedAuthentication(calls) {
  return calls.filter((c) => c.was_authenticated !== null && c.was_authenticated !== void 0);
}
function computeAuthenticationSuccessRate(calls) {
  const attempted = withAttemptedAuthentication(calls);
  const denominator = attempted.length;
  const numerator = attempted.filter((c) => c.was_authenticated === true).length;
  return { value: rateOrNull(numerator, denominator), numerator, denominator };
}
var RATIO_CALCULATORS = {
  fcr: computeFcr,
  escalation_rate: computeEscalationRate,
  resolution_rate: computeResolutionRate,
  aht: computeAht,
  successful_resolution_time: computeSuccessfulResolutionTime,
  authentication_success_rate: computeAuthenticationSuccessRate
};

// src/server/analytics/ratioDimensions.ts
function dimensionValue(call, dimension) {
  switch (dimension) {
    case "intent":
      return call.intent || null;
    case "agent":
      return call.ai_agent_name || call.ai_agent_id || null;
    case "campaign":
      return call.campaign_name || null;
    case "outcome":
      return call.outcome || null;
    case "direction":
      return call.direction || null;
    case "escalation_reason":
      return call.escalation_trigger || null;
    default:
      return null;
  }
}
function groupByDimension(calls, dimension) {
  const groups = /* @__PURE__ */ new Map();
  for (const call of calls) {
    const value = dimensionValue(call, dimension);
    if (value === null) continue;
    const list = groups.get(value) ?? [];
    list.push(call);
    groups.set(value, list);
  }
  return groups;
}
function computeBreakdownRows(ratioId, calls, dimension) {
  const calculate = RATIO_CALCULATORS[ratioId];
  if (!calculate) return [];
  const groups = groupByDimension(calls, dimension);
  const rows = [];
  for (const [value, groupCalls] of groups) {
    const agg = calculate(groupCalls);
    rows.push({
      dimension,
      dimensionValue: value,
      label: value,
      value: agg.value,
      numerator: agg.numerator,
      denominator: agg.denominator,
      population: groupCalls.length,
      comparison: null
    });
  }
  return rows.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
}
function bucketGranularity(range) {
  return range === "7d" || range === "30d" ? "day" : "hour";
}
function bucketKey(startTime, granularity) {
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return "unknown";
  const iso = d.toISOString();
  return granularity === "hour" ? iso.slice(0, 13) + ":00" : iso.slice(0, 10);
}
function computeTrendPoints(ratioId, calls, granularity) {
  const calculate = RATIO_CALCULATORS[ratioId];
  if (!calculate) return [];
  const buckets = /* @__PURE__ */ new Map();
  for (const call of calls) {
    if (!call.start_time) continue;
    const key = bucketKey(call.start_time, granularity);
    if (key === "unknown") continue;
    const list = buckets.get(key) ?? [];
    list.push(call);
    buckets.set(key, list);
  }
  const points = [];
  for (const [bucket, bucketCalls] of buckets) {
    const agg = calculate(bucketCalls);
    points.push({ bucket, value: agg.value, numerator: agg.numerator, denominator: agg.denominator, population: bucketCalls.length });
  }
  return points.sort((a, b) => a.bucket.localeCompare(b.bucket));
}
export {
  bucketGranularity,
  computeBreakdownRows,
  computeTrendPoints,
  dimensionValue,
  groupByDimension
};
