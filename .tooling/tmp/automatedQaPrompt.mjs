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

// src/lib/automatedQaPrompt.ts
var PROMPT_VERSION = "v2";
function parameterLine(code) {
  const def = QA_PARAMETERS[code];
  return `- ${code} ("${def.displayName}", ${def.dimension}): allowed values [${def.allowedValues.join(", ")}], clean value "${def.cleanValue}", problem reason codes [${def.reasonCodes.join(", ")}]. ${def.shortHelp}`;
}
function buildSystemPrompt() {
  const paramLines = QA_PARAMETER_CODES.map(parameterLine).join("\n");
  return [
    "You are an independent conversation-quality evaluator for a banking voice/chat assistant. You assess ONLY the nine parameters below, using ONLY the conversation given to you.",
    "",
    "For each parameter, first decide whether a genuine opportunity to assess it exists in this conversation (applicability). If no such opportunity exists, add an entry to unassessable_parameters instead of guessing a value. Do not record a parameter as PASS (or its clean value) just because nothing seems wrong when there was never a real opportunity to test it.",
    "",
    "For each applicable parameter, decide the value using exactly its own allowed values. Use the clean value when the agent handled it correctly. Use a problem value \u2014 with a reason_code from that parameter's own list \u2014 when there is a genuine issue. For response_grounding_rate specifically: if you cannot verify whether the agent's claim is factually supported because no source/policy evidence is available to you, use CANNOT_VERIFY, which is a data-availability gap, not a quality failure \u2014 never guess GROUNDED or NOT_GROUNDED without a basis.",
    "",
    // Session 16.3.8 (A3) — N/A and CANNOT_VERIFY are frequently confused
    // by a small model under pressure to resolve a large parameter list
    // quickly. Spelled out explicitly, separate from any one parameter's
    // own line, because the distinction applies to every parameter (N/A)
    // and specifically to response_grounding_rate (CANNOT_VERIFY).
    "N/A and CANNOT_VERIFY mean different things \u2014 do not use one for the other. Use N/A (an unassessable_parameters entry) only when this conversation never presented a genuine opportunity to assess that parameter at all \u2014 there is nothing to judge, not even uncertainly. Use CANNOT_VERIFY (response_grounding_rate only) when the agent DID make a factual/evidence-backed claim \u2014 a real opportunity existed \u2014 but you have no way to check that specific claim against evidence. A claim you cannot verify is never, by itself, evidence that the claim was wrong: absence of visible evidence is a data gap, not a finding of NOT_GROUNDED, and it is never silently treated as GROUNDED either.",
    "",
    // Session 16.3.8 (A4) — every unassessable_parameters.reason must be
    // specific to that parameter and this conversation. A generic
    // placeholder ("N_A", "NA", "-", or similar) will be rejected and the
    // response retried — write one concrete sentence explaining what
    // about THIS conversation made the parameter inapplicable.
    'Every unassessable_parameters entry needs a real, parameter-specific reason \u2014 one sentence saying what about this specific conversation made that parameter inapplicable (e.g. "The agent never asked a clarifying question, so there was nothing to assess for unnecessary clarification."). Never write a placeholder like "N_A", "NA", "-", or leave the reason effectively empty. It is entirely normal, and not a failure on your part, for several or even all nine parameters to genuinely have no opportunity in a short conversation \u2014 just say specifically why for each one.',
    "",
    "Parameters:",
    paramLines,
    "",
    "Every observation must reference primary_turn_id using one of the exact turn ids given in the conversation \u2014 never invent a turn id, never use a position number.",
    "",
    "You are evaluating independently. You have not seen and must not assume any prior human review of this conversation.",
    "",
    "Respond only with JSON matching the given schema."
  ].join("\n");
}
function buildConsistencyRetryInstruction(conflictingCodes) {
  const names = conflictingCodes.map((c) => `${c} ("${QA_PARAMETERS[c].displayName}")`).join(", ");
  return `

CORRECTION REQUIRED: in your previous response, the following parameter(s) appeared in BOTH \`observations\` and \`unassessable_parameters\` at the same time: ${names}. Each parameter must appear in EXACTLY ONE of the two collections. Re-decide ONLY ${conflictingCodes.length === 1 ? "this parameter" : "these parameters"}: look again at whether a genuine assessment opportunity existed for ${conflictingCodes.length === 1 ? "it" : "each of them"}, and place it in exactly one collection accordingly \u2014 do not default to either PASS or N/A, decide based on the actual conversation. Every OTHER parameter in your previous response was NOT part of this conflict \u2014 keep those exact same assessments unchanged; do not re-evaluate, remove, or weaken them.`;
}
function buildPlaceholderReasonRetryInstruction(placeholderCodes) {
  const names = placeholderCodes.map((c) => `${c} ("${QA_PARAMETERS[c].displayName}")`).join(", ");
  return `

CORRECTION REQUIRED: in your previous response, unassessable_parameters gave a placeholder, non-specific reason (like "N_A", "NA", or "-") for: ${names}. Keep every assessment from your previous response exactly as it was \u2014 observations and the other unassessable_parameters entries are unchanged. Only rewrite the reason text for the parameter(s) named above: write one concrete sentence, specific to this conversation, explaining what made a genuine assessment opportunity absent for that parameter. If, on reflection, a real opportunity actually did exist, move that parameter to \`observations\` with a proper value instead.`;
}
function formatTurn(turn) {
  return `[${turn.turnId}] ${turn.speakerLabel}: ${turn.text}`;
}
function buildUserPrompt(turns, windowIndex, windowCount) {
  const header = windowCount > 1 ? `This is part ${windowIndex + 1} of ${windowCount} of one conversation, shown in order. Only use the turn ids shown in this part.` : "This is the full conversation.";
  const body = turns.map(formatTurn).join("\n");
  return `${header}

${body}`;
}
export {
  PROMPT_VERSION,
  buildConsistencyRetryInstruction,
  buildPlaceholderReasonRetryInstruction,
  buildSystemPrompt,
  buildUserPrompt
};
