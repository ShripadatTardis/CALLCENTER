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
    directionality: "higher_better"
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
    directionality: "higher_better"
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
    directionality: "higher_better"
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
    directionality: "higher_better"
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
    directionality: "lower_better"
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
    directionality: "lower_better"
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
    directionality: "lower_better"
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
    directionality: "higher_better"
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
    directionality: "higher_better"
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
export {
  computeQaRatios
};
