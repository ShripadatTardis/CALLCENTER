// src/lib/qaParameters.ts
var QA_PARAMETERS = {
  context_continuity_rate: {
    code: "context_continuity_rate",
    displayName: "Context Continuity",
    dimension: "Conversation",
    allowedValues: ["PASS", "FAIL", "N_A"],
    cleanValue: "PASS",
    problemValues: ["FAIL"],
    tier: 1,
    appliesTo: "agent",
    reasonCodes: ["PREVIOUS_INFORMATION_IGNORED", "PREVIOUS_INFORMATION_CONTRADICTED", "WRONG_CONTEXT_CARRIED_FORWARD", "CONTEXT_LOST_AFTER_TRANSITION", "OTHER"],
    directionality: "higher_better",
    shortHelp: "Did the agent correctly carry forward information already established earlier in the conversation?"
  },
  followup_understanding_rate: {
    code: "followup_understanding_rate",
    displayName: "Follow-up Understanding",
    dimension: "Understanding",
    allowedValues: ["PASS", "FAIL", "N_A"],
    cleanValue: "PASS",
    problemValues: ["FAIL"],
    tier: 1,
    appliesTo: "agent",
    reasonCodes: ["FOLLOW_UP_MISUNDERSTOOD", "WRONG_INTERPRETATION", "RELATION_TO_PRIOR_TURN_MISSED", "OTHER"],
    directionality: "higher_better",
    shortHelp: "Did the agent correctly understand this turn as a follow-up to what the customer just said?"
  },
  reference_resolution_accuracy: {
    code: "reference_resolution_accuracy",
    displayName: "Reference Resolution",
    dimension: "Understanding",
    allowedValues: ["PASS", "FAIL", "N_A"],
    cleanValue: "PASS",
    problemValues: ["FAIL"],
    tier: 2,
    appliesTo: "agent",
    reasonCodes: ["WRONG_ENTITY", "REFERENCE_NOT_RESOLVED", "AMBIGUITY_HANDLED_INCORRECTLY", "OTHER"],
    directionality: "higher_better",
    shortHelp: 'Did the agent correctly resolve a pronoun or implicit reference ("it", "that one") to the right entity?'
  },
  task_progression_rate: {
    code: "task_progression_rate",
    displayName: "Task Progression",
    dimension: "Resolution",
    allowedValues: ["PASS", "FAIL", "N_A"],
    cleanValue: "PASS",
    problemValues: ["FAIL"],
    tier: 1,
    appliesTo: "agent",
    reasonCodes: ["RESPONSE_DID_NOT_ADVANCE_TASK", "IRRELEVANT_RESPONSE", "CONVERSATION_STALLED", "WRONG_NEXT_STEP", "OTHER"],
    directionality: "higher_better",
    shortHelp: "Did this response move the customer's request forward, rather than stalling or going off-track?"
  },
  unnecessary_clarification_rate: {
    code: "unnecessary_clarification_rate",
    displayName: "Unnecessary Clarification",
    dimension: "Efficiency",
    allowedValues: ["NO_ISSUE", "ISSUE", "N_A"],
    cleanValue: "NO_ISSUE",
    problemValues: ["ISSUE"],
    tier: 2,
    appliesTo: "agent",
    reasonCodes: ["INFORMATION_ALREADY_AVAILABLE", "DUPLICATE_QUESTION", "QUESTION_NOT_REQUIRED", "OTHER"],
    directionality: "lower_better",
    shortHelp: "Did the agent ask the customer for something it should already have known or didn't actually need?"
  },
  repetition_loop_rate: {
    code: "repetition_loop_rate",
    displayName: "Repetition / Loop",
    dimension: "Efficiency",
    allowedValues: ["NO_ISSUE", "ISSUE", "N_A"],
    cleanValue: "NO_ISSUE",
    problemValues: ["ISSUE"],
    tier: 2,
    appliesTo: "interaction",
    reasonCodes: ["AGENT_REPEATED_QUESTION", "AGENT_REPEATED_ANSWER", "CUSTOMER_FORCED_TO_REPEAT", "CONVERSATION_LOOP", "OTHER"],
    directionality: "lower_better",
    shortHelp: "Did the conversation get stuck repeating the same question, answer or exchange instead of progressing? Assessed once per interaction, not per turn \u2014 a loop is a property of a span of turns."
  },
  customer_correction_rate: {
    code: "customer_correction_rate",
    displayName: "Customer Correction",
    dimension: "Understanding",
    allowedValues: ["NO_ISSUE", "ISSUE", "N_A"],
    cleanValue: "NO_ISSUE",
    problemValues: ["ISSUE"],
    tier: 2,
    appliesTo: "customer",
    reasonCodes: ["INTENT_CORRECTION", "FACTUAL_CORRECTION", "CONTEXT_CORRECTION", "ENTITY_CORRECTION", "OTHER"],
    directionality: "lower_better",
    shortHelp: "Did the customer have to correct something the agent got wrong (intent, a fact, context, or an entity)? Assessed on the customer's correcting turn, usable as evidence linked to the agent turn it responds to."
  },
  conversation_recovery_rate: {
    code: "conversation_recovery_rate",
    displayName: "Conversation Recovery",
    dimension: "Conversation",
    allowedValues: ["SUCCESSFUL", "UNSUCCESSFUL", "N_A"],
    cleanValue: "SUCCESSFUL",
    problemValues: ["UNSUCCESSFUL"],
    tier: 2,
    appliesTo: "agent",
    reasonCodes: ["CORRECTION_NOT_ACCEPTED", "ERROR_REPEATED", "WRONG_RECOVERY", "RECOVERY_STALLED", "OTHER"],
    directionality: "higher_better",
    shortHelp: "After an error or correction occurred, did the agent recover gracefully from it?"
  },
  response_grounding_rate: {
    code: "response_grounding_rate",
    displayName: "Response Grounding",
    dimension: "Answer Quality",
    allowedValues: ["GROUNDED", "NOT_GROUNDED", "CANNOT_VERIFY", "N_A"],
    cleanValue: "GROUNDED",
    problemValues: ["NOT_GROUNDED", "CANNOT_VERIFY"],
    tier: 2,
    appliesTo: "agent",
    reasonCodes: ["UNSUPPORTED_RESPONSE", "CONTRADICTS_AVAILABLE_EVIDENCE", "WRONG_SOURCE_OR_CONTEXT", "CANNOT_VERIFY_SOURCE", "OTHER"],
    directionality: "higher_better",
    shortHelp: `Is the agent's answer actually supported by the book/source it should be grounded in? If you cannot check the source either way, record "Cannot verify" \u2014 that's a data gap, not a quality failure.`
  }
};
var QA_PARAMETER_CODES = Object.keys(QA_PARAMETERS);
var QA_TIER_1_PARAMETERS = QA_PARAMETER_CODES.filter((code) => QA_PARAMETERS[code].tier === 1);

// src/lib/qaRatios.ts
var GROUNDING_DENOMINATOR_VALUES = ["GROUNDED", "NOT_GROUNDED"];
function computeOneRatio(code, findings) {
  const def = QA_PARAMETERS[code];
  const relevant = findings.filter((f) => f.parameterCode === code);
  if (code === "response_grounding_rate") {
    const eligible2 = relevant.filter((f) => GROUNDING_DENOMINATOR_VALUES.includes(f.value));
    const numerator2 = eligible2.filter((f) => f.value === "GROUNDED").length;
    const denominator = eligible2.length;
    return { parameterCode: code, numerator: numerator2, denominator, rate: denominator === 0 ? null : numerator2 / denominator };
  }
  if (def.appliesTo === "interaction" || code === "customer_correction_rate") {
    const byReview = /* @__PURE__ */ new Map();
    for (const f of relevant) {
      if (f.value === "N_A") continue;
      const list = byReview.get(f.reviewId) ?? [];
      list.push(f.value);
      byReview.set(f.reviewId, list);
    }
    const denominator = byReview.size;
    let numerator2 = 0;
    for (const values of byReview.values()) {
      if (values.some((v) => def.problemValues.includes(v))) numerator2 += 1;
    }
    return { parameterCode: code, numerator: numerator2, denominator, rate: denominator === 0 ? null : numerator2 / denominator };
  }
  const eligible = relevant.filter((f) => f.value !== "N_A");
  const numerator = def.directionality === "higher_better" ? eligible.filter((f) => f.value === def.cleanValue).length : eligible.filter((f) => def.problemValues.includes(f.value)).length;
  return { parameterCode: code, numerator, denominator: eligible.length, rate: eligible.length === 0 ? null : numerator / eligible.length };
}
function computeQaRatios(findings) {
  const result = {};
  for (const code of QA_PARAMETER_CODES) {
    result[code] = computeOneRatio(code, findings);
  }
  return result;
}

// src/lib/qaAnalysis.ts
function inRange(iso, dateFrom, dateTo) {
  if (!iso) return false;
  if (dateFrom && iso < dateFrom) return false;
  if (dateTo && iso > dateTo) return false;
  return true;
}
function filterFindings(findings, filters) {
  return findings.filter((f) => {
    if (filters.channel && f.channel !== filters.channel) return false;
    if (filters.agentId && f.agentId !== filters.agentId) return false;
    if (filters.reviewerUserId && f.reviewerUserId !== filters.reviewerUserId) return false;
    if ((filters.dateFrom || filters.dateTo) && !inRange(f.submittedAt, filters.dateFrom, filters.dateTo)) return false;
    return true;
  });
}
function filterReviews(reviews, filters) {
  return reviews.filter((r) => {
    if (filters.channel && r.channel !== filters.channel) return false;
    if (filters.agentId && r.agentId !== filters.agentId) return false;
    if (filters.reviewerUserId && r.reviewerUserId !== filters.reviewerUserId) return false;
    if (filters.dateFrom || filters.dateTo) {
      if (!inRange(r.startedAt, filters.dateFrom, filters.dateTo)) return false;
    }
    return true;
  });
}
function reviewedInteractionsCount(reviews) {
  const submitted = reviews.filter((r) => r.status === "submitted");
  return new Set(submitted.map((r) => `${r.channel}:${r.interactionId}`)).size;
}
function computeCoveragePopulation(reviews, findings) {
  return {
    submittedReviewsCount: reviews.filter((r) => r.status === "submitted").length,
    inProgressReviewsCount: reviews.filter((r) => r.status === "in_progress").length,
    reviewedInteractionsCount: reviewedInteractionsCount(reviews),
    findingsCount: findings.length
  };
}
function computeCoverageRate(reviewedInteractions, eligibleInteractions) {
  if (eligibleInteractions === null || eligibleInteractions === 0) return null;
  return reviewedInteractions / eligibleInteractions;
}
function reasonCodeDistribution(findings, parameterCode) {
  const scoped = parameterCode ? findings.filter((f) => f.parameterCode === parameterCode) : findings;
  const counts = /* @__PURE__ */ new Map();
  for (const f of scoped) {
    if (!f.reasonCode) continue;
    const key = `${f.parameterCode}\0${f.reasonCode}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([key, count]) => {
    const [code, reasonCode] = key.split("\0");
    return { parameterCode: code, reasonCode, count };
  }).sort((a, b) => b.count - a.count);
}
function reasonCodeAffectedInteractions(findings, parameterCode, reasonCode) {
  const matching = findings.filter((f) => f.parameterCode === parameterCode && f.reasonCode === reasonCode);
  return new Set(matching.map((f) => `${f.channel}:${f.interactionId}`)).size;
}
function agentAggregation(findings, reviews) {
  const agentIds = /* @__PURE__ */ new Set([...findings.map((f) => f.agentId), ...reviews.filter((r) => r.status === "submitted").map((r) => r.agentId)]);
  return Array.from(agentIds).map((agentId) => ({
    agentId,
    reviewedInteractionsCount: reviewedInteractionsCount(reviews.filter((r) => r.agentId === agentId)),
    ratios: computeQaRatios(findings.filter((f) => f.agentId === agentId))
  })).sort((a, b) => b.reviewedInteractionsCount - a.reviewedInteractionsCount);
}
function bucketStart(iso, granularity) {
  const d = new Date(iso);
  if (granularity === "month") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
  }
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  return monday.toISOString().slice(0, 10);
}
function trendBuckets(findings, reviews, parameterCode, granularity) {
  const submittedReviews = reviews.filter((r) => r.status === "submitted" && r.submittedAt);
  const periods = /* @__PURE__ */ new Set();
  for (const f of findings) periods.add(bucketStart(f.submittedAt, granularity));
  for (const r of submittedReviews) periods.add(bucketStart(r.submittedAt, granularity));
  return Array.from(periods).sort().map((periodStart) => {
    const periodFindings = findings.filter((f) => bucketStart(f.submittedAt, granularity) === periodStart);
    const periodReviews = submittedReviews.filter((r) => bucketStart(r.submittedAt, granularity) === periodStart);
    const ratio = computeQaRatios(periodFindings)[parameterCode];
    return {
      periodStart,
      numerator: ratio.numerator,
      denominator: ratio.denominator,
      rate: ratio.rate,
      reviewedInteractionsCount: reviewedInteractionsCount(periodReviews)
    };
  });
}
function breakdownField(reviews, field) {
  const submitted = reviews.filter((r) => r.status === "submitted");
  const counts = {};
  let notSet = 0;
  for (const r of submitted) {
    const value = r[field];
    if (value === null) {
      notSet += 1;
      continue;
    }
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return { counts, notSet, total: submitted.length };
}
function interactionOutcomeAggregation(reviews) {
  return {
    requestCompletion: breakdownField(reviews, "requestCompletion"),
    fcr: breakdownField(reviews, "fcr"),
    humanAssistanceRequired: breakdownField(reviews, "humanAssistanceRequired")
  };
}
export {
  QA_PARAMETERS,
  QA_PARAMETER_CODES,
  agentAggregation,
  computeCoveragePopulation,
  computeCoverageRate,
  filterFindings,
  filterReviews,
  interactionOutcomeAggregation,
  reasonCodeAffectedInteractions,
  reasonCodeDistribution,
  reviewedInteractionsCount,
  trendBuckets
};
