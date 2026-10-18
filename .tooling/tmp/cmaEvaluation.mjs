// src/server/cma/cmaRegistry.ts
async function callRpc(supabase, fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}
async function getCanonicalMeasure(supabase, canonicalId) {
  return callRpc(supabase, "call_center_cma_canonical_measure_get", { p_canonical_id: canonicalId });
}
async function listDimensionsForMeasure(supabase, measureId) {
  return callRpc(supabase, "call_center_cma_measure_dimensions_list", { p_measure_id: measureId });
}
async function listBaseFactsForMeasure(supabase, measureId) {
  return callRpc(supabase, "call_center_cma_measure_base_facts_list", { p_measure_id: measureId });
}

// src/server/cma/cmaEvaluationAlgorithms.ts
var CMA_ALGORITHM_REGISTRY = {
  // Resolution Rate — resolved / (resolved ∪ escalated), the "handled" population.
  // Register occurrence RES-01, src/server/analytics/ratioMath.ts computeResolutionRate()
  // (this engine reimplements the same business rule server-side in SQL; it does not call
  // the existing TS function, since that function reads from the upstream Call Data API page
  // fetcher, not this table — see the report's "relationship to existing screen calculations" note).
  "CANON-RES-RATE": {
    canonicalMeasureId: "CANON-RES-RATE",
    unit: "percent",
    expectedBaseFactIds: ["FACT-OUTCOME"],
    eligiblePopulationDescription: "voice interactions in the window with outcome in ('resolved','escalated')"
  },
  // Authentication Success Rate — was_authenticated=true / was_authenticated is not null.
  // Register occurrence AUTH-01.
  "CANON-AUTH-SUCCESS-RATE": {
    canonicalMeasureId: "CANON-AUTH-SUCCESS-RATE",
    unit: "percent",
    expectedBaseFactIds: ["FACT-WAS-AUTHENTICATED"],
    eligiblePopulationDescription: "voice interactions in the window where was_authenticated is non-null (an authentication flow was genuinely attempted)"
  },
  // Successful Resolution Time — mean duration_seconds over resolved, non-stale calls.
  // Register occurrence SRT-01. The ~4h (14400s) stale-duration guard matches this codebase's
  // existing isStaleDuration() convention (src/lib/format.ts), reapplied here in SQL rather than
  // imported, since this engine never loads rows into application memory to filter them (brief §8).
  "CANON-SUCCESSFUL-RES-TIME": {
    canonicalMeasureId: "CANON-SUCCESSFUL-RES-TIME",
    unit: "seconds",
    expectedBaseFactIds: ["FACT-DURATION-SECONDS", "FACT-OUTCOME"],
    eligiblePopulationDescription: "resolved voice interactions in the window with duration_seconds < 14400 (the ~4h stale-duration guard)"
  },
  // Avg Sentiment Score — mean sentiment_score over interactions where it is non-null.
  // Register occurrence AGENT-SENT-01 — naturally meaningful grouped by agent.
  "CANON-AVG-SENT-SCORE": {
    canonicalMeasureId: "CANON-AVG-SENT-SCORE",
    unit: "score",
    expectedBaseFactIds: ["FACT-SENTIMENT-SCORE"],
    eligiblePopulationDescription: "voice interactions in the window with a non-null sentiment_score"
  }
};

// src/server/cma/cmaEvaluation.ts
function isAgentIdInEvaluationScope(access, agentId) {
  if (access.allCategories || access.authorizedAgentIds === "all") return true;
  return !!agentId && access.authorizedAgentIds.includes(agentId);
}
var SUPPORTED_FILTER_DIMENSIONS = ["agent", "channel", "campaign"];
var SUPPORTED_GROUP_BY = ["agent", "channel"];
function scopeAppliedOf(access) {
  if (access.allCategories || access.authorizedAgentIds === "all") return { allAgents: true, agentIds: "all" };
  return { allAgents: false, agentIds: access.authorizedAgentIds };
}
function buildResponse(req, algorithmStatus, access, requestedFilters, appliedFilters, groups, populationSize, dataCompletenessNote, resolvedMeasureId, algorithmRef) {
  return {
    canonicalMeasureId: req.canonicalMeasureId,
    resolvedMeasureId,
    algorithmRef,
    algorithmStatus,
    requestedFilters,
    appliedFilters,
    scopeApplied: scopeAppliedOf(access),
    groups,
    dataCompleteness: { populationSize, note: dataCompletenessNote },
    evaluatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function terminal(req, algorithmStatus, access, requestedFilters, result, resolvedMeasureId) {
  return buildResponse(req, algorithmStatus, access, requestedFilters, {}, [{ result }], 0, "Not calculated.", resolvedMeasureId);
}
function toValueKind(numerator, denominator, unit) {
  if (!denominator || denominator <= 0) return { kind: "zero_denominator", displayAs: "null" };
  const raw = (numerator ?? 0) / denominator;
  const value = unit === "percent" ? Math.round(raw * 1e3) / 10 : Math.round(raw * 100) / 100;
  return { kind: "value", value, unit };
}
async function evaluateCmaMeasure(supabase, req, access) {
  const requestedFilters = { ...req.filters ?? {} };
  const canonical = await getCanonicalMeasure(supabase, req.canonicalMeasureId);
  if (!canonical) {
    return terminal(req, "not_found", access, requestedFilters, { kind: "not_found", reason: `No canonical measure '${req.canonicalMeasureId}' is registered.` });
  }
  if (canonical.governed_algorithm_status === "mock" || canonical.measure_class === "mock_indicator") {
    return terminal(
      req,
      canonical.governed_algorithm_status,
      access,
      requestedFilters,
      { kind: "mock", warning: "This indicator is explicitly fabricated/non-authoritative and is never evaluated as a real measurement." }
    );
  }
  if (canonical.governed_algorithm_status === "unimplemented") {
    return terminal(
      req,
      canonical.governed_algorithm_status,
      access,
      requestedFilters,
      { kind: "unimplemented", reason: "This canonical measure has a real business definition but no live calculation implementation exists anywhere yet." }
    );
  }
  if (canonical.governed_algorithm_status === "not_applicable") {
    return terminal(
      req,
      canonical.governed_algorithm_status,
      access,
      requestedFilters,
      { kind: "unsupported", reason: "This id identifies a chart/visualization, not an evaluable measure \u2014 use the chart visualization lookup instead." }
    );
  }
  if (canonical.governed_algorithm_status === "pending_decision") {
    return terminal(
      req,
      canonical.governed_algorithm_status,
      access,
      requestedFilters,
      { kind: "not_yet_governed" },
      canonical.migration_reference_measure_id ?? void 0
    );
  }
  const resolvedMeasureId = canonical.migration_reference_measure_id;
  const algorithm = CMA_ALGORITHM_REGISTRY[canonical.id];
  if (!algorithm) {
    return terminal(
      req,
      canonical.governed_algorithm_status,
      access,
      requestedFilters,
      { kind: "unsupported", reason: `No calculation implementation is registered in this evaluation engine for ${canonical.id} yet.` },
      resolvedMeasureId ?? void 0
    );
  }
  if (resolvedMeasureId) {
    const registeredFacts = await listBaseFactsForMeasure(supabase, resolvedMeasureId);
    const registeredIds = new Set(registeredFacts.map((f) => f.baseFact.id));
    const missing = algorithm.expectedBaseFactIds.filter((id) => !registeredIds.has(id));
    if (missing.length > 0) {
      return terminal(
        req,
        canonical.governed_algorithm_status,
        access,
        requestedFilters,
        { kind: "missing_required_facts", reason: `The registry does not record the base fact(s) this algorithm requires: ${missing.join(", ")}.` },
        resolvedMeasureId
      );
    }
  }
  const requestedDimensionIds = Array.from(/* @__PURE__ */ new Set([
    ...Object.keys(req.filters ?? {}),
    ...req.groupBy ? [req.groupBy] : []
  ]));
  for (const dim of requestedDimensionIds) {
    if (!SUPPORTED_FILTER_DIMENSIONS.includes(dim)) {
      return terminal(
        req,
        canonical.governed_algorithm_status,
        access,
        requestedFilters,
        { kind: "unsupported_dimension", reason: `Dimension '${dim}' is not supported by this evaluation engine.` },
        resolvedMeasureId ?? void 0
      );
    }
  }
  if (req.groupBy && !SUPPORTED_GROUP_BY.includes(req.groupBy)) {
    return terminal(
      req,
      canonical.governed_algorithm_status,
      access,
      requestedFilters,
      { kind: "unsupported_dimension", reason: `Grouping by '${req.groupBy}' is not supported by this evaluation engine.` },
      resolvedMeasureId ?? void 0
    );
  }
  if (resolvedMeasureId) {
    const approved = await listDimensionsForMeasure(supabase, resolvedMeasureId);
    const approvedIds = new Set(approved.map((d) => d.id));
    for (const dim of requestedDimensionIds) {
      if (!approvedIds.has(dim)) {
        return terminal(
          req,
          canonical.governed_algorithm_status,
          access,
          requestedFilters,
          { kind: "unsupported_dimension", reason: `Dimension '${dim}' is not registered as applicable to ${resolvedMeasureId} in the CMA registry.` },
          resolvedMeasureId
        );
      }
    }
  }
  const filterAgentId = req.filters?.agent ?? null;
  if (filterAgentId && !isAgentIdInEvaluationScope(access, filterAgentId)) {
    return terminal(
      req,
      canonical.governed_algorithm_status,
      access,
      requestedFilters,
      { kind: "unauthorized_filter", reason: `agent '${filterAgentId}' is outside your authorized Business Data Scope.` },
      resolvedMeasureId
    );
  }
  const { data, error } = await supabase.rpc("call_center_cma_evaluate_measure", {
    p_canonical_measure_id: canonical.id,
    p_started_from: req.window.from,
    p_started_to: req.window.to,
    p_all_agents: access.allCategories || access.authorizedAgentIds === "all",
    p_authorized_agent_ids: access.authorizedAgentIds === "all" ? [] : access.authorizedAgentIds,
    p_filter_agent_id: filterAgentId,
    p_filter_channel: req.filters?.channel ?? null,
    p_filter_campaign_id: req.filters?.campaign ?? null,
    p_group_by: req.groupBy ?? null
  });
  if (error) throw new Error(`call_center_cma_evaluate_measure: ${error.message}`);
  const rpcResult = data;
  if (rpcResult.status !== "ok") {
    return terminal(
      req,
      canonical.governed_algorithm_status,
      access,
      requestedFilters,
      { kind: "unsupported_dimension", reason: "Rejected by the evaluation RPC's own governance allow-list." },
      resolvedMeasureId
    );
  }
  const appliedFilters = {};
  if (filterAgentId) appliedFilters.agent = filterAgentId;
  if (req.filters?.channel) appliedFilters.channel = req.filters.channel;
  if (req.filters?.campaign) appliedFilters.campaign = req.filters.campaign;
  const groups = [];
  let totalPopulation = 0;
  if (req.groupBy && rpcResult.groups) {
    for (const g of rpcResult.groups) {
      totalPopulation += g.population;
      groups.push({
        groupKey: g.key,
        result: toValueKind(g.numerator, g.denominator, algorithm.unit),
        evidence: { numerator: g.numerator, denominator: g.denominator, population: g.population }
      });
    }
  } else {
    const population = rpcResult.population ?? 0;
    totalPopulation = population;
    groups.push({
      result: toValueKind(rpcResult.numerator ?? null, rpcResult.denominator ?? 0, algorithm.unit),
      evidence: { numerator: rpcResult.numerator ?? null, denominator: rpcResult.denominator ?? 0, population }
    });
  }
  return buildResponse(
    req,
    canonical.governed_algorithm_status,
    access,
    requestedFilters,
    appliedFilters,
    groups,
    totalPopulation,
    algorithm.eligiblePopulationDescription,
    resolvedMeasureId ?? void 0,
    resolvedMeasureId ?? void 0
  );
}
export {
  evaluateCmaMeasure,
  isAgentIdInEvaluationScope
};
