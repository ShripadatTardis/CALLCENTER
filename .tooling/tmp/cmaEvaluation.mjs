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
  // ===== CMA-3A (unchanged — production-verified) =====
  "CANON-RES-RATE": {
    canonicalMeasureId: "CANON-RES-RATE",
    unit: "percent",
    sourceFamily: "interaction",
    rpc: "call_center_cma_evaluate_measure",
    expectedBaseFactIds: ["FACT-OUTCOME"],
    eligiblePopulationDescription: "voice interactions in the window with outcome in ('resolved','escalated')"
  },
  "CANON-AUTH-SUCCESS-RATE": {
    canonicalMeasureId: "CANON-AUTH-SUCCESS-RATE",
    unit: "percent",
    sourceFamily: "interaction",
    rpc: "call_center_cma_evaluate_measure",
    expectedBaseFactIds: ["FACT-WAS-AUTHENTICATED"],
    eligiblePopulationDescription: "voice interactions in the window where was_authenticated is non-null"
  },
  "CANON-SUCCESSFUL-RES-TIME": {
    canonicalMeasureId: "CANON-SUCCESSFUL-RES-TIME",
    unit: "seconds",
    sourceFamily: "interaction",
    rpc: "call_center_cma_evaluate_measure",
    expectedBaseFactIds: ["FACT-DURATION-SECONDS", "FACT-OUTCOME"],
    eligiblePopulationDescription: "resolved voice interactions in the window with duration_seconds < 14400 (the ~4h stale-duration guard)"
  },
  "CANON-AVG-SENT-SCORE": {
    canonicalMeasureId: "CANON-AVG-SENT-SCORE",
    unit: "score",
    sourceFamily: "interaction",
    rpc: "call_center_cma_evaluate_measure",
    expectedBaseFactIds: ["FACT-SENTIMENT-SCORE"],
    eligiblePopulationDescription: "voice interactions in the window with a non-null sentiment_score"
  },
  // ===== CMA-3B — same 'interaction' family, one new measure =====
  "CANON-INTENT-CONFIDENCE": {
    canonicalMeasureId: "CANON-INTENT-CONFIDENCE",
    unit: "score",
    sourceFamily: "interaction",
    rpc: "call_center_cma_evaluate_measure",
    expectedBaseFactIds: ["FACT-INTENT-CONFIDENCE"],
    eligiblePopulationDescription: "voice interactions in the window with a non-null intent_confidence (aggregated as an average, extending the register's per-call DIRECT field the same way CANON-AVG-SENT-SCORE already extends per-call sentiment)"
  },
  // ===== CMA-3B — 'qa' family: call_center.qa_findings+qa_reviews (Human QA, status='submitted')
  // UNION call_center.automated_qa_observations+automated_qa_evaluations (Automated QA,
  // status='completed') — the exact two sources src/lib/qaRatios.ts/automatedQaRatios.ts already
  // feed from today, reimplemented in SQL rather than imported (this engine never loads rows into
  // application memory to compute a value). Real, observed value vocabulary per parameter (queried
  // live from production, not assumed) differs by parameter family — see the session report. =====
  "CANON-CONTEXT-CONTINUITY-RATE": {
    canonicalMeasureId: "CANON-CONTEXT-CONTINUITY-RATE",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "submitted Human QA reviews + completed Automated QA evaluations, context_continuity_rate parameter, value not in ('N_A') \u2014 PASS counted in numerator"
  },
  "CANON-FOLLOWUP-UNDERSTANDING-RATE": {
    canonicalMeasureId: "CANON-FOLLOWUP-UNDERSTANDING-RATE",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "followup_understanding_rate parameter, value not in ('N_A') \u2014 PASS counted in numerator"
  },
  "CANON-TASK-PROGRESSION-RATE": {
    canonicalMeasureId: "CANON-TASK-PROGRESSION-RATE",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "task_progression_rate parameter, value not in ('N_A') \u2014 PASS counted in numerator"
  },
  "CANON-REFERENCE-RES-ACC": {
    canonicalMeasureId: "CANON-REFERENCE-RES-ACC",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "reference_resolution_accuracy parameter, value not in ('N_A') \u2014 PASS counted in numerator (no Human QA data recorded for this parameter in production as of this session \u2014 Automated QA only)"
  },
  "CANON-RESPONSE-GROUNDING-RATE": {
    canonicalMeasureId: "CANON-RESPONSE-GROUNDING-RATE",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "response_grounding_rate parameter, value not in ('N_A','CANNOT_VERIFY') \u2014 GROUNDED counted in numerator (CANNOT_VERIFY explicitly excluded, per the register's own documented rule)"
  },
  "CANON-CONVERSATION-RECOVERY-RATE": {
    canonicalMeasureId: "CANON-CONVERSATION-RECOVERY-RATE",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "conversation_recovery_rate parameter, value not in ('N_A') \u2014 SUCCESSFUL counted in numerator"
  },
  "CANON-UNNECESSARY-CLARIFICATION-RATE": {
    canonicalMeasureId: "CANON-UNNECESSARY-CLARIFICATION-RATE",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "unnecessary_clarification_rate parameter, value not in ('N_A') \u2014 ISSUE (the problem value) counted in numerator, per the register's documented lower-is-better convention"
  },
  "CANON-REPETITION-LOOP-RATE": {
    canonicalMeasureId: "CANON-REPETITION-LOOP-RATE",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "review-level rollup: count of distinct reviews/evaluations with >=1 ISSUE finding for repetition_loop_rate / count of distinct reviews/evaluations with any non-N_A finding for it"
  },
  "CANON-CUSTOMER-CORRECTION-RATE": {
    canonicalMeasureId: "CANON-CUSTOMER-CORRECTION-RATE",
    unit: "percent",
    sourceFamily: "qa",
    rpc: "call_center_cma_evaluate_qa_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "review-level rollup: count of distinct reviews/evaluations with >=1 ISSUE finding for customer_correction_rate / count of distinct reviews/evaluations with any non-N_A finding for it"
  },
  // ===== CMA-3B — 'campaign' family: call_center.campaign_targets + campaign_results +
  // campaign_classifications. Scoped by campaign_results.agent_id (the AI agent that handled the
  // execution) — the same Agent Scope mechanism, not a second authorization model. Neither
  // campaign_targets nor campaign_results has a `channel` column — confirmed by direct schema
  // inspection this session; the registry's prior 'channel' relationship for these 3 occurrences
  // was not factually supported and was removed (CMA-3B.1, see the migration). =====
  "CANON-CAMPAIGN-TARGET-COUNT": {
    canonicalMeasureId: "CANON-CAMPAIGN-TARGET-COUNT",
    unit: "count",
    sourceFamily: "campaign",
    rpc: "call_center_cma_evaluate_campaign_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "campaign_targets loaded in the window, within the authorized agent scope (targets with no assigned agent yet are only visible to an all-access caller)"
  },
  "CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI": {
    canonicalMeasureId: "CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI",
    unit: "percent",
    sourceFamily: "campaign",
    rpc: "call_center_cma_evaluate_campaign_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "targets with a classified effective result (campaign_results.is_success non-null) \u2014 numerator: is_success = true"
  },
  "CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS": {
    canonicalMeasureId: "CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS",
    unit: "percent",
    sourceFamily: "campaign",
    rpc: "call_center_cma_evaluate_campaign_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "targets whose result has a non-null campaign_classification_code \u2014 numerator: the matched campaign_classifications.is_success = true"
  },
  // ===== CMA-3B — 'chat' family: call_center.chat_sessions. Has a real campaign_id column (no
  // channel column — confirmed by direct schema inspection) — the CMA-3B.1 migration extends the
  // chat RPC to physically support campaign filtering/grouping, matching the registry's own
  // (correct) 'campaign' relationship for CHAT-SPAN-01, and removes its prior 'channel' claim. =====
  "CANON-CHAT-SESSION-SPAN": {
    canonicalMeasureId: "CANON-CHAT-SESSION-SPAN",
    unit: "seconds",
    sourceFamily: "chat",
    rpc: "call_center_cma_evaluate_chat_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "chat sessions started in the window with a non-null last_activity_at \u2014 span = last_activity_at - started_at"
  },
  // ===== CMA-3B — 'action' family: call_center.action_items (Session 15's Action Required queue).
  // Has a real campaign_id column (no channel or outcome column — confirmed by direct schema
  // inspection; its `status` column is a lifecycle state, open/in_progress/resolved, a different
  // concept from the interaction-domain 'outcome' dimension) — the CMA-3B.1 migration extends the
  // action RPC to physically support campaign filtering/grouping and removes the registry's prior
  // unsupported 'channel'/'outcome' claims for ACTION-01. =====
  "CANON-ACTION-REQUIRED-QUEUE-ITEMS": {
    canonicalMeasureId: "CANON-ACTION-REQUIRED-QUEUE-ITEMS",
    unit: "count",
    sourceFamily: "action",
    rpc: "call_center_cma_evaluate_action_measure",
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "action_items created in the window, within the authorized agent scope"
  }
};

// src/server/cma/cmaEvaluation.ts
function isAgentIdInEvaluationScope(access, agentId) {
  if (access.allCategories || access.authorizedAgentIds === "all") return true;
  return !!agentId && access.authorizedAgentIds.includes(agentId);
}
var SUPPORTED_FILTER_DIMENSIONS = ["agent", "channel", "campaign"];
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
  if (unit === "count") return { kind: "value", value: Math.round(numerator ?? 0), unit };
  if (!denominator || denominator <= 0) return { kind: "zero_denominator", displayAs: "null" };
  const raw = (numerator ?? 0) / denominator;
  const value = unit === "percent" ? Math.round(raw * 1e3) / 10 : Math.round(raw * 100) / 100;
  return { kind: "value", value, unit };
}
function buildRpcArgs(algorithm, canonicalId, req, access, filterAgentId) {
  const common = {
    p_canonical_measure_id: canonicalId,
    p_started_from: req.window.from,
    p_started_to: req.window.to,
    p_all_agents: access.allCategories || access.authorizedAgentIds === "all",
    p_authorized_agent_ids: access.authorizedAgentIds === "all" ? [] : access.authorizedAgentIds,
    p_filter_agent_id: filterAgentId,
    p_group_by: req.groupBy ?? null
  };
  switch (algorithm.sourceFamily) {
    case "interaction":
      return { ...common, p_filter_channel: req.filters?.channel ?? null, p_filter_campaign_id: req.filters?.campaign ?? null };
    case "qa":
      return { ...common, p_filter_channel: req.filters?.channel ?? null };
    case "campaign":
      return { ...common, p_filter_campaign_id: req.filters?.campaign ?? null };
    case "chat":
    case "action":
      return { ...common, p_filter_campaign_id: req.filters?.campaign ?? null };
    default:
      return common;
  }
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
  if (resolvedMeasureId && algorithm.expectedBaseFactIds.length > 0) {
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
  const rpcArgs = buildRpcArgs(algorithm, canonical.id, req, access, filterAgentId);
  const { data, error } = await supabase.rpc(algorithm.rpc, rpcArgs);
  if (error) throw new Error(`${algorithm.rpc}: ${error.message}`);
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
