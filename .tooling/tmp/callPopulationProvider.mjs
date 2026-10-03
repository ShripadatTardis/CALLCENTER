// src/server/analytics/callPopulationFetcher.ts
var DEFAULT_PAGE_SIZE = 100;
var DEFAULT_MAX_PAGES = 30;
var CallDataFetchError = class extends Error {
  kind;
  status;
  constructor(kind, message, status = null) {
    super(message);
    this.name = "CallDataFetchError";
    this.kind = kind;
    this.status = status;
  }
};
async function fetchCallDataPage(filters, page, pageSize) {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new CallDataFetchError("unavailable", "VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
  }
  const query = {
    status: "inactive",
    page: String(page),
    page_size: String(pageSize)
  };
  if (filters.dateFrom) query.date_from = filters.dateFrom;
  if (filters.dateTo) query.date_to = filters.dateTo;
  if (filters.direction) query.direction = filters.direction;
  if (filters.outcome) query.outcome = filters.outcome;
  const search = new URLSearchParams(query).toString();
  let res;
  try {
    res = await fetch(`${baseUrl}/api/v1/call-data?${search}`, { headers: { "X-API-Key": apiKey } });
  } catch {
    throw new CallDataFetchError("unavailable", "Call Centre could not be reached.");
  }
  if (!res.ok) {
    const kind = res.status >= 400 && res.status < 500 ? "rejected" : "unavailable";
    throw new CallDataFetchError(kind, `call-data request failed: ${res.status}`, res.status);
  }
  return await res.json();
}
function rangeToDateWindow(range) {
  const now = /* @__PURE__ */ new Date();
  const days = {
    "1h": 1,
    "6h": 1,
    "12h": 1,
    "24h": 1,
    "7d": 7,
    "30d": 30
  };
  const windowDays = days[range ?? "24h"] ?? 1;
  const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1e3);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(now) };
}
async function fetchCompleteCallPopulation(filters, maxPages = DEFAULT_MAX_PAGES, pageSize = DEFAULT_PAGE_SIZE) {
  const calls = [];
  let trueTotalRecords = 0;
  let capped = false;
  for (let page = 1; page <= maxPages; page++) {
    const dto = await fetchCallDataPage(filters, page, pageSize);
    calls.push(...dto.data.calls ?? []);
    trueTotalRecords = dto.data.pagination?.total_records ?? calls.length;
    const totalPages = dto.data.pagination?.total_pages ?? page;
    if (page >= totalPages) {
      capped = false;
      break;
    }
    if (page === maxPages) {
      capped = true;
    }
  }
  return { calls, trueTotalRecords, capped };
}

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
var RATIO_ELIGIBLE_POPULATION = {
  fcr: (calls) => calls,
  escalation_rate: handledCalls,
  resolution_rate: handledCalls,
  aht: withValidDuration,
  successful_resolution_time: (calls) => withValidDuration(calls.filter((c) => c.outcome === "resolved")),
  authentication_success_rate: withAttemptedAuthentication
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

// src/server/analytics/callPopulationProvider.ts
function applyDrillFilter(calls, filters) {
  if (!filters.breakdown || !filters.breakdownValue) return calls;
  if (filters.breakdown === "direction" || filters.breakdown === "outcome") return calls;
  const value = filters.breakdownValue;
  return calls.filter((c) => {
    switch (filters.breakdown) {
      case "intent":
        return c.intent === value;
      case "agent":
        return (c.ai_agent_name || c.ai_agent_id) === value;
      case "campaign":
        return c.campaign_name === value;
      case "escalation_reason":
        return c.escalation_trigger === value;
      default:
        return true;
    }
  });
}
function mapCallToInteractionRef(call) {
  return {
    interactionId: call.call_id,
    channel: "voice",
    phoneNumber: call.caller_number,
    timestamp: call.start_time,
    agentLabel: call.ai_agent_name || call.ai_agent_id || null,
    intent: call.intent || null,
    outcome: call.outcome || null
  };
}
async function fetchPopulationForFilters(filters) {
  const { dateFrom, dateTo } = filters.dateOverride ?? rangeToDateWindow(filters.range);
  const result = await fetchCompleteCallPopulation({
    dateFrom,
    dateTo,
    direction: filters.direction,
    outcome: filters.breakdown === "outcome" && filters.breakdownValue ? filters.breakdownValue : void 0
  });
  return { ...result, calls: applyDrillFilter(result.calls, filters), dateFrom, dateTo };
}
var callPopulationProvider = {
  async getSummary(ratioId, filters) {
    const calculate = RATIO_CALCULATORS[ratioId];
    if (!calculate) return { value: null, numerator: null, denominator: null, population: null, capped: false, trueTotalRecords: null };
    const population = await fetchPopulationForFilters(filters);
    const agg = calculate(population.calls);
    return {
      value: agg.value,
      numerator: agg.numerator,
      denominator: agg.denominator,
      population: population.calls.length,
      capped: population.capped,
      trueTotalRecords: population.trueTotalRecords
    };
  },
  async getTrend(ratioId, filters, bucketGranularity) {
    if (!RATIO_CALCULATORS[ratioId]) return { points: [], capped: false, trueTotalRecords: null };
    const population = await fetchPopulationForFilters(filters);
    const points = computeTrendPoints(ratioId, population.calls, bucketGranularity);
    return { points, capped: population.capped, trueTotalRecords: population.trueTotalRecords };
  },
  async getBreakdown(ratioId, filters, dimension) {
    if (!RATIO_CALCULATORS[ratioId]) return { rows: [], capped: false, trueTotalRecords: null };
    const population = await fetchPopulationForFilters(filters);
    const rows = computeBreakdownRows(ratioId, population.calls, dimension);
    return {
      rows: rows.map((r) => ({ dimensionValue: r.dimensionValue, label: r.label, value: r.value, numerator: r.numerator, denominator: r.denominator, population: r.population })),
      capped: population.capped,
      trueTotalRecords: population.trueTotalRecords
    };
  },
  async getInteractions(ratioId, filters, page, pageSize) {
    const eligibleFilter = RATIO_ELIGIBLE_POPULATION[ratioId];
    if (!eligibleFilter) return { rows: [], totalCount: 0, capped: false, trueTotalRecords: null };
    const population = await fetchPopulationForFilters(filters);
    const eligible = eligibleFilter(population.calls);
    const start = (page - 1) * pageSize;
    const rows = eligible.slice(start, start + pageSize).map(mapCallToInteractionRef);
    return { rows, totalCount: eligible.length, capped: population.capped, trueTotalRecords: population.trueTotalRecords };
  }
};
export {
  callPopulationProvider,
  mapCallToInteractionRef
};
