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
function requiresReasonCode(code, value) {
  return QA_PARAMETERS[code].problemValues.includes(value);
}
function isValidReasonCode(code, reasonCode) {
  return QA_PARAMETERS[code].reasonCodes.includes(reasonCode);
}
function isValidResultValue(code, value) {
  return QA_PARAMETERS[code].allowedValues.includes(value);
}
var INTERACTION_LEVEL_VALUES = {
  requestCompletion: ["YES", "PARTIAL", "NO", "CANNOT_DETERMINE"],
  fcr: ["YES", "NO", "CANNOT_DETERMINE"],
  humanAssistanceRequired: ["YES", "NO", "CANNOT_DETERMINE"],
  businessOutcome: ["RESOLVED", "PARTIALLY_RESOLVED", "HUMAN_ASSISTANCE_REQUIRED", "NOT_RESOLVED", "CUSTOMER_ABANDONED"]
};
export {
  INTERACTION_LEVEL_VALUES,
  QA_PARAMETERS,
  QA_PARAMETER_CODES,
  QA_TIER_1_PARAMETERS,
  isValidReasonCode,
  isValidResultValue,
  requiresReasonCode
};
