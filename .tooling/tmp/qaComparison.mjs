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

// src/lib/automatedQaRatios.ts
function computeAutomatedQaRatios(observations) {
  const findings = observations.map((o) => ({
    reviewId: o.evaluationId,
    parameterCode: o.parameterCode,
    value: o.value
  }));
  return computeQaRatios(findings);
}

// src/lib/qaComparison.ts
function isEligibleHumanReview(status) {
  return status === "submitted";
}
function isEligibleAutomatedEvaluation(status) {
  return status === "completed" || status === "partial";
}
function sortDesc(items, key) {
  return [...items].sort((a, b) => (key(b) ?? "").localeCompare(key(a) ?? ""));
}
function findPairCandidates(reviews, evaluations) {
  const byKey = /* @__PURE__ */ new Map();
  for (const r of reviews) {
    if (!isEligibleHumanReview(r.status)) continue;
    const key = `${r.channel}:${r.interactionId}`;
    const entry = byKey.get(key) ?? { reviews: [], evaluations: [], agentId: r.agentId, channel: r.channel, interactionId: r.interactionId };
    entry.reviews.push(r);
    byKey.set(key, entry);
  }
  for (const e of evaluations) {
    if (!isEligibleAutomatedEvaluation(e.status)) continue;
    const key = `${e.channel}:${e.interactionId}`;
    const entry = byKey.get(key);
    if (!entry) continue;
    entry.evaluations.push(e);
  }
  return Array.from(byKey.values()).filter((e) => e.reviews.length > 0 && e.evaluations.length > 0).map((e) => ({
    interactionId: e.interactionId,
    channel: e.channel,
    agentId: e.agentId,
    reviews: sortDesc(e.reviews, (r) => r.submittedAt),
    evaluations: sortDesc(e.evaluations, (ev) => ev.completedAt ?? ev.createdAt)
  }));
}
function transcriptComparability(humanTranscriptHash, automatedTranscriptHash) {
  if (!humanTranscriptHash || !automatedTranscriptHash) return "unknown";
  return humanTranscriptHash === automatedTranscriptHash ? "matched" : "mismatch";
}
function byTurn(items) {
  const map = /* @__PURE__ */ new Map();
  for (const item of items) {
    if (item.value === "N_A") continue;
    if (!map.has(item.primaryTurnId)) map.set(item.primaryTurnId, item.value);
  }
  return map;
}
function compareParameter(parameterCode, humanFindingsForParameter, automatedObservationsForParameter, humanRatio, automatedRatio) {
  const humanMap = byTurn(humanFindingsForParameter);
  const automatedMap = byTurn(automatedObservationsForParameter);
  const turnComparisons = [];
  const cannotVerifyTurnIds = [];
  const humanOnlyTurnIds = [];
  const automatedOnlyTurnIds = [];
  for (const [turnId, humanValue] of humanMap) {
    const automatedValue = automatedMap.get(turnId);
    if (automatedValue === void 0) {
      humanOnlyTurnIds.push(turnId);
      continue;
    }
    const cannotVerifyInvolved = humanValue === "CANNOT_VERIFY" || automatedValue === "CANNOT_VERIFY";
    if (cannotVerifyInvolved) {
      cannotVerifyTurnIds.push(turnId);
    }
    turnComparisons.push({ turnId, humanValue, automatedValue, cannotVerifyInvolved, agree: !cannotVerifyInvolved && humanValue === automatedValue });
  }
  for (const turnId of automatedMap.keys()) {
    if (!humanMap.has(turnId)) automatedOnlyTurnIds.push(turnId);
  }
  const comparableTurns = turnComparisons.filter((t) => !t.cannotVerifyInvolved);
  let classification;
  let reason;
  if (humanRatio.denominator === 0 && automatedRatio.denominator === 0) {
    classification = "both_not_applicable";
    reason = "Neither Human QA nor Automated QA found an eligible assessment opportunity for this parameter on this interaction.";
  } else if (humanRatio.denominator === 0 || automatedRatio.denominator === 0) {
    classification = "applicability_mismatch";
    reason = humanRatio.denominator === 0 ? "Human QA recorded no eligible opportunity for this parameter, but Automated QA assessed at least one turn." : "Automated QA recorded no eligible opportunity for this parameter, but Human QA assessed at least one turn.";
  } else if (comparableTurns.length === 0) {
    classification = "not_comparable";
    reason = turnComparisons.length > 0 ? "Both sides assessed this parameter, but every overlapping turn involved a CANNOT_VERIFY result \u2014 no defensible agreement/disagreement call can be made." : "Both sides assessed this parameter, but on entirely different turns \u2014 there is no overlapping evidence to compare directly.";
  } else if (comparableTurns.every((t) => t.agree)) {
    classification = "agreement";
    reason = `Both sides reached the same judgment on all ${comparableTurns.length} overlapping turn(s) assessed.`;
  } else {
    const disagreeing = comparableTurns.filter((t) => !t.agree).length;
    classification = "disagreement";
    reason = `${disagreeing} of ${comparableTurns.length} overlapping turn(s) received different judgments from Human QA and Automated QA.`;
  }
  return {
    parameterCode,
    classification,
    reason,
    human: humanRatio,
    automated: automatedRatio,
    turnComparisons,
    cannotVerifyTurnIds,
    humanOnlyTurnIds,
    automatedOnlyTurnIds
  };
}
function compareAssessments(review, evaluation) {
  const humanRatios = computeQaRatios(review.findings.map((f) => ({ reviewId: review.id, parameterCode: f.parameterCode, value: f.value })));
  const automatedRatios = computeAutomatedQaRatios(evaluation.observations?.map((o) => ({ evaluationId: evaluation.id, parameterCode: o.parameterCode, value: o.value })) ?? []);
  const parameters = {};
  for (const code of QA_PARAMETER_CODES) {
    const humanForParam = review.findings.filter((f) => f.parameterCode === code);
    const automatedForParam = (evaluation.observations ?? []).filter((o) => o.parameterCode === code);
    parameters[code] = compareParameter(code, humanForParam, automatedForParam, humanRatios[code], automatedRatios[code]);
  }
  return {
    reviewId: review.id,
    evaluationId: evaluation.id,
    // Human QA has no persisted transcript hash today (see module
    // header) — this is always 'unknown' until that gap is closed, by
    // construction, never guessed from matching interaction ids.
    transcriptComparability: transcriptComparability(null, evaluation.transcriptHash ?? null),
    parameters
  };
}
function summarizeComparisons(candidates, comparisons) {
  const classificationCounts = {
    agreement: 0,
    disagreement: 0,
    applicability_mismatch: 0,
    both_not_applicable: 0,
    not_comparable: 0
  };
  let totalCells = 0;
  let validatedComparablePairsCount = 0;
  for (const c of comparisons) {
    if (c.transcriptComparability === "matched") validatedComparablePairsCount += 1;
    for (const code of QA_PARAMETER_CODES) {
      classificationCounts[c.parameters[code].classification] += 1;
      totalCells += 1;
    }
  }
  return {
    pairedInteractionsCount: candidates.length,
    eligiblePairsCount: comparisons.length,
    validatedComparablePairsCount,
    classificationCounts,
    totalCells
  };
}
function concentrationByParameter(comparisons, classification) {
  return QA_PARAMETER_CODES.map((code) => ({
    parameterCode: code,
    count: comparisons.filter((c) => c.parameters[code].classification === classification).length,
    ofPairs: comparisons.length
  })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}
function applicabilityMismatchConcentration(comparisons) {
  return concentrationByParameter(comparisons, "applicability_mismatch");
}
function judgmentDisagreementConcentration(comparisons) {
  return concentrationByParameter(comparisons, "disagreement");
}
function coverageDivergence(comparisons) {
  return QA_PARAMETER_CODES.map((code) => {
    const both = comparisons.map((c) => c.parameters[code]).filter((p) => p.human.denominator > 0 && p.automated.denominator > 0);
    const meanDenominatorDifference = both.length === 0 ? 0 : both.reduce((sum, p) => sum + (p.automated.denominator - p.human.denominator), 0) / both.length;
    return { parameterCode: code, pairsCompared: both.length, meanDenominatorDifference };
  }).filter((r) => r.pairsCompared > 0);
}
function promptVersionComparison(comparisons) {
  const rows = [];
  for (const code of QA_PARAMETER_CODES) {
    const byVersion = /* @__PURE__ */ new Map();
    for (const { promptVersion, comparison } of comparisons) {
      const p = comparison.parameters[code];
      if (p.classification !== "agreement" && p.classification !== "disagreement") continue;
      const entry = byVersion.get(promptVersion) ?? { comparable: 0, disagree: 0 };
      entry.comparable += 1;
      if (p.classification === "disagreement") entry.disagree += 1;
      byVersion.set(promptVersion, entry);
    }
    for (const [promptVersion, entry] of byVersion) {
      if (entry.comparable === 0) continue;
      rows.push({ parameterCode: code, promptVersion, comparablePairs: entry.comparable, disagreementCount: entry.disagree });
    }
  }
  return rows;
}
export {
  applicabilityMismatchConcentration,
  compareAssessments,
  compareParameter,
  coverageDivergence,
  findPairCandidates,
  isEligibleAutomatedEvaluation,
  isEligibleHumanReview,
  judgmentDisagreementConcentration,
  promptVersionComparison,
  summarizeComparisons,
  transcriptComparability
};
