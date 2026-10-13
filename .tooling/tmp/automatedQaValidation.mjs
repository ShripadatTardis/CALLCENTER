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
function requiresReasonCode(code, value) {
  return QA_PARAMETERS[code].problemValues.includes(value);
}
function isValidReasonCode(code, reasonCode) {
  return QA_PARAMETERS[code].reasonCodes.includes(reasonCode);
}
function isValidResultValue(code, value) {
  return QA_PARAMETERS[code].allowedValues.includes(value);
}

// src/lib/automatedQaValidation.ts
function isQaParameterCode(x) {
  return typeof x === "string" && QA_PARAMETER_CODES.includes(x);
}
function validateAutomatedObservations(raw, validTurnIds) {
  const accepted = [];
  const rejected = [];
  const seenOpportunities = /* @__PURE__ */ new Set();
  if (!Array.isArray(raw)) {
    return { accepted, rejected: [{ raw, reason: "observations is not an array" }] };
  }
  for (const entry of raw) {
    const parameterCode = entry?.parameter_code;
    const primaryTurnId = entry?.primary_turn_id;
    const value = entry?.value;
    const reasonCode = entry?.reason_code;
    const evidenceTurnIdsRaw = entry?.evidence_turn_ids;
    const explanation = entry?.explanation;
    if (!isQaParameterCode(parameterCode)) {
      rejected.push({ raw: entry, reason: `unknown parameter_code: ${String(parameterCode)}` });
      continue;
    }
    if (typeof value !== "string" || !isValidResultValue(parameterCode, value)) {
      rejected.push({ raw: entry, reason: `value "${String(value)}" is not allowed for ${parameterCode}` });
      continue;
    }
    if (typeof primaryTurnId !== "string" || !validTurnIds.has(primaryTurnId)) {
      rejected.push({ raw: entry, reason: `primary_turn_id "${String(primaryTurnId)}" does not exist in the evaluated transcript snapshot` });
      continue;
    }
    const evidenceTurnIds = Array.isArray(evidenceTurnIdsRaw) ? evidenceTurnIdsRaw.filter((t) => typeof t === "string") : [];
    const fabricatedEvidence = evidenceTurnIds.find((t) => !validTurnIds.has(t));
    if (fabricatedEvidence) {
      rejected.push({ raw: entry, reason: `evidence_turn_ids references "${fabricatedEvidence}", which does not exist in the evaluated transcript snapshot` });
      continue;
    }
    const needsReason = requiresReasonCode(parameterCode, value);
    if (needsReason) {
      if (typeof reasonCode !== "string" || !isValidReasonCode(parameterCode, reasonCode)) {
        rejected.push({ raw: entry, reason: `reason_code "${String(reasonCode)}" is required and must belong to ${parameterCode}'s vocabulary for value "${value}"` });
        continue;
      }
    }
    const opportunityKey = `${parameterCode}:${primaryTurnId}`;
    if (seenOpportunities.has(opportunityKey)) {
      rejected.push({ raw: entry, reason: `duplicate/contradictory observation for the same opportunity (${opportunityKey}) \u2014 first accepted observation wins` });
      continue;
    }
    seenOpportunities.add(opportunityKey);
    accepted.push({
      parameterCode,
      value,
      primaryTurnId,
      evidenceTurnIds,
      reasonCode: needsReason ? reasonCode : null,
      explanation: typeof explanation === "string" ? explanation.slice(0, 300) : null
    });
  }
  return { accepted, rejected };
}
function validateUnassessableParameters(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (isQaParameterCode(entry?.parameter_code) && typeof entry?.reason === "string") {
      out.push({ parameterCode: entry.parameter_code, reason: entry.reason.slice(0, 200) });
    }
  }
  return out;
}
function allCanonicalParameterCodesCovered(codes) {
  return QA_PARAMETER_CODES.every((c) => codes.includes(c)) && Object.keys(QA_PARAMETERS).length === QA_PARAMETER_CODES.length;
}
function detectCrossArrayContradiction(observations, unassessableParameters) {
  const observedCodes = new Set(observations.map((o) => o.parameterCode));
  const conflicts = /* @__PURE__ */ new Set();
  for (const u of unassessableParameters) {
    if (observedCodes.has(u.parameterCode)) conflicts.add(u.parameterCode);
  }
  return Array.from(conflicts);
}
export {
  allCanonicalParameterCodesCovered,
  detectCrossArrayContradiction,
  validateAutomatedObservations,
  validateUnassessableParameters
};
