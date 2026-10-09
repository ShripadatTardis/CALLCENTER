/**
 * Session 16.1 — the canonical QA parameter dictionary. Mirrors
 * docs/MANUAL_QA_MEASUREMENT_CONTRACT.md §2-5 exactly; if one changes,
 * the other must change in the same commit. Every parameter code here
 * is the SAME id as its Ratio Explorer "Conversation Quality" ratio
 * (src/server/analytics/ratioRegistry.ts) — never a synonym.
 */

export type QaResultValue =
  | 'PASS' | 'FAIL'
  | 'NO_ISSUE' | 'ISSUE'
  | 'GROUNDED' | 'NOT_GROUNDED' | 'CANNOT_VERIFY'
  | 'SUCCESSFUL' | 'UNSUCCESSFUL'
  | 'N_A';

export type QaParameterCode =
  | 'context_continuity_rate'
  | 'followup_understanding_rate'
  | 'reference_resolution_accuracy'
  | 'task_progression_rate'
  | 'unnecessary_clarification_rate'
  | 'repetition_loop_rate'
  | 'customer_correction_rate'
  | 'conversation_recovery_rate'
  | 'response_grounding_rate';

export interface QaParameterDefinition {
  code: QaParameterCode;
  displayName: string;
  dimension: 'Understanding' | 'Conversation' | 'Answer Quality' | 'Resolution' | 'Efficiency';
  allowedValues: QaResultValue[];
  /** The value "Good + Next" auto-records for a Tier-1-eligible turn. */
  cleanValue: QaResultValue;
  /** Values that require a reason code (the "problem" direction). */
  problemValues: QaResultValue[];
  /**
   * Tier 1 = structurally, deterministically applicable; auto-recorded
   * as cleanValue on "Good + Next" unless the reviewer overrides to N_A.
   * Tier 2 = applicability is a judgment call; never auto-recorded —
   * requires the reviewer to explicitly engage via the exception editor.
   */
  tier: 1 | 2;
  /** Which turn role this parameter is assessed on. 'interaction' = assessed once per reviewed interaction, not per turn (repetition_loop_rate only). */
  appliesTo: 'agent' | 'customer' | 'interaction';
  reasonCodes: string[];
  directionality: 'higher_better' | 'lower_better';
  /**
   * Session 16.1.1 — one-sentence reviewer-facing help, shown as a
   * tooltip on the parameter's chip in the exception editor rather than
   * occupying permanent screen space. Distinguishes parameters a
   * reviewer might otherwise conflate (e.g. Context Continuity vs.
   * Follow-up Understanding vs. Reference Resolution).
   */
  shortHelp: string;
}

export const QA_PARAMETERS: Record<QaParameterCode, QaParameterDefinition> = {
  context_continuity_rate: {
    code: 'context_continuity_rate',
    displayName: 'Context Continuity',
    dimension: 'Conversation',
    allowedValues: ['PASS', 'FAIL', 'N_A'],
    cleanValue: 'PASS',
    problemValues: ['FAIL'],
    tier: 1,
    appliesTo: 'agent',
    reasonCodes: ['PREVIOUS_INFORMATION_IGNORED', 'PREVIOUS_INFORMATION_CONTRADICTED', 'WRONG_CONTEXT_CARRIED_FORWARD', 'CONTEXT_LOST_AFTER_TRANSITION', 'OTHER'],
    directionality: 'higher_better',
    shortHelp: 'Did the agent correctly carry forward information already established earlier in the conversation?',
  },
  followup_understanding_rate: {
    code: 'followup_understanding_rate',
    displayName: 'Follow-up Understanding',
    dimension: 'Understanding',
    allowedValues: ['PASS', 'FAIL', 'N_A'],
    cleanValue: 'PASS',
    problemValues: ['FAIL'],
    tier: 1,
    appliesTo: 'agent',
    reasonCodes: ['FOLLOW_UP_MISUNDERSTOOD', 'WRONG_INTERPRETATION', 'RELATION_TO_PRIOR_TURN_MISSED', 'OTHER'],
    directionality: 'higher_better',
    shortHelp: 'Did the agent correctly understand this turn as a follow-up to what the customer just said?',
  },
  reference_resolution_accuracy: {
    code: 'reference_resolution_accuracy',
    displayName: 'Reference Resolution',
    dimension: 'Understanding',
    allowedValues: ['PASS', 'FAIL', 'N_A'],
    cleanValue: 'PASS',
    problemValues: ['FAIL'],
    tier: 2,
    appliesTo: 'agent',
    reasonCodes: ['WRONG_ENTITY', 'REFERENCE_NOT_RESOLVED', 'AMBIGUITY_HANDLED_INCORRECTLY', 'OTHER'],
    directionality: 'higher_better',
    shortHelp: 'Did the agent correctly resolve a pronoun or implicit reference ("it", "that one") to the right entity?',
  },
  task_progression_rate: {
    code: 'task_progression_rate',
    displayName: 'Task Progression',
    dimension: 'Resolution',
    allowedValues: ['PASS', 'FAIL', 'N_A'],
    cleanValue: 'PASS',
    problemValues: ['FAIL'],
    tier: 1,
    appliesTo: 'agent',
    reasonCodes: ['RESPONSE_DID_NOT_ADVANCE_TASK', 'IRRELEVANT_RESPONSE', 'CONVERSATION_STALLED', 'WRONG_NEXT_STEP', 'OTHER'],
    directionality: 'higher_better',
    shortHelp: 'Did this response move the customer\'s request forward, rather than stalling or going off-track?',
  },
  unnecessary_clarification_rate: {
    code: 'unnecessary_clarification_rate',
    displayName: 'Unnecessary Clarification',
    dimension: 'Efficiency',
    allowedValues: ['NO_ISSUE', 'ISSUE', 'N_A'],
    cleanValue: 'NO_ISSUE',
    problemValues: ['ISSUE'],
    tier: 2,
    appliesTo: 'agent',
    reasonCodes: ['INFORMATION_ALREADY_AVAILABLE', 'DUPLICATE_QUESTION', 'QUESTION_NOT_REQUIRED', 'OTHER'],
    directionality: 'lower_better',
    shortHelp: 'Did the agent ask the customer for something it should already have known or didn\'t actually need?',
  },
  repetition_loop_rate: {
    code: 'repetition_loop_rate',
    displayName: 'Repetition / Loop',
    dimension: 'Efficiency',
    allowedValues: ['NO_ISSUE', 'ISSUE', 'N_A'],
    cleanValue: 'NO_ISSUE',
    problemValues: ['ISSUE'],
    tier: 2,
    appliesTo: 'interaction',
    reasonCodes: ['AGENT_REPEATED_QUESTION', 'AGENT_REPEATED_ANSWER', 'CUSTOMER_FORCED_TO_REPEAT', 'CONVERSATION_LOOP', 'OTHER'],
    directionality: 'lower_better',
    shortHelp: 'Did the conversation get stuck repeating the same question, answer or exchange instead of progressing? Assessed once per interaction, not per turn — a loop is a property of a span of turns.',
  },
  customer_correction_rate: {
    code: 'customer_correction_rate',
    displayName: 'Customer Correction',
    dimension: 'Understanding',
    allowedValues: ['NO_ISSUE', 'ISSUE', 'N_A'],
    cleanValue: 'NO_ISSUE',
    problemValues: ['ISSUE'],
    tier: 2,
    appliesTo: 'customer',
    reasonCodes: ['INTENT_CORRECTION', 'FACTUAL_CORRECTION', 'CONTEXT_CORRECTION', 'ENTITY_CORRECTION', 'OTHER'],
    directionality: 'lower_better',
    shortHelp: 'Did the customer have to correct something the agent got wrong (intent, a fact, context, or an entity)? Assessed on the customer\'s correcting turn, usable as evidence linked to the agent turn it responds to.',
  },
  conversation_recovery_rate: {
    code: 'conversation_recovery_rate',
    displayName: 'Conversation Recovery',
    dimension: 'Conversation',
    allowedValues: ['SUCCESSFUL', 'UNSUCCESSFUL', 'N_A'],
    cleanValue: 'SUCCESSFUL',
    problemValues: ['UNSUCCESSFUL'],
    tier: 2,
    appliesTo: 'agent',
    reasonCodes: ['CORRECTION_NOT_ACCEPTED', 'ERROR_REPEATED', 'WRONG_RECOVERY', 'RECOVERY_STALLED', 'OTHER'],
    directionality: 'higher_better',
    shortHelp: 'After an error or correction occurred, did the agent recover gracefully from it?',
  },
  response_grounding_rate: {
    code: 'response_grounding_rate',
    displayName: 'Response Grounding',
    dimension: 'Answer Quality',
    allowedValues: ['GROUNDED', 'NOT_GROUNDED', 'CANNOT_VERIFY', 'N_A'],
    cleanValue: 'GROUNDED',
    problemValues: ['NOT_GROUNDED', 'CANNOT_VERIFY'],
    tier: 2,
    appliesTo: 'agent',
    reasonCodes: ['UNSUPPORTED_RESPONSE', 'CONTRADICTS_AVAILABLE_EVIDENCE', 'WRONG_SOURCE_OR_CONTEXT', 'CANNOT_VERIFY_SOURCE', 'OTHER'],
    directionality: 'higher_better',
    shortHelp: 'Is the agent\'s answer actually supported by the book/source it should be grounded in? If you cannot check the source either way, record "Cannot verify" — that\'s a data gap, not a quality failure.',
  },
};

export const QA_PARAMETER_CODES = Object.keys(QA_PARAMETERS) as QaParameterCode[];

export const QA_TIER_1_PARAMETERS = QA_PARAMETER_CODES.filter((code) => QA_PARAMETERS[code].tier === 1);

/** True when a reason code is required for the given parameter/value combination. */
export function requiresReasonCode(code: QaParameterCode, value: QaResultValue): boolean {
  return QA_PARAMETERS[code].problemValues.includes(value);
}

export function isValidReasonCode(code: QaParameterCode, reasonCode: string): boolean {
  return QA_PARAMETERS[code].reasonCodes.includes(reasonCode);
}

export function isValidResultValue(code: QaParameterCode, value: string): value is QaResultValue {
  return (QA_PARAMETERS[code].allowedValues as string[]).includes(value);
}

export const INTERACTION_LEVEL_VALUES = {
  requestCompletion: ['YES', 'PARTIAL', 'NO', 'CANNOT_DETERMINE'] as const,
  fcr: ['YES', 'NO', 'CANNOT_DETERMINE'] as const,
  humanAssistanceRequired: ['YES', 'NO', 'CANNOT_DETERMINE'] as const,
  businessOutcome: ['RESOLVED', 'PARTIALLY_RESOLVED', 'HUMAN_ASSISTANCE_REQUIRED', 'NOT_RESOLVED', 'CUSTOMER_ABANDONED'] as const,
};

export type RequestCompletion = (typeof INTERACTION_LEVEL_VALUES.requestCompletion)[number];
export type QaFcr = (typeof INTERACTION_LEVEL_VALUES.fcr)[number];
export type HumanAssistanceRequired = (typeof INTERACTION_LEVEL_VALUES.humanAssistanceRequired)[number];
export type QaBusinessOutcome = (typeof INTERACTION_LEVEL_VALUES.businessOutcome)[number];
