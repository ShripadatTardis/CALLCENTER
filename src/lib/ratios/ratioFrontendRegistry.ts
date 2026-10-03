import type { FrontendRatioDefinition } from '@/types/ratio';

/**
 * Frontend Ratio Registry (Session R1) — presentation metadata only. No
 * formula/eligibility logic lives here (see
 * src/server/analytics/ratioRegistry.ts for that — a server-only file,
 * deliberately never imported here or by any React component, to keep
 * the client bundle free of domain-layer/server code). This is what
 * RatioCatalogue/RatioHero/RatioExplorer read to decide labels, grouping,
 * units and chart preference. The RUNTIME value/availability for an
 * opened ratio always comes from the live API response
 * (useRatioSummary) — `declaredAvailability` below is a static snapshot
 * used ONLY for the /ratios catalogue's badge, so that page doesn't need
 * to fetch all 21 live summaries just to render a list.
 *
 * The 21 primary ratios, per
 * docs/CALL_CENTRE_RATIO_EXPLORER_UX_AND_RATIO_REGISTRY_v1.1.docx §9/§11.
 */
export const RATIO_CATALOGUE_ORDER: readonly string[] = [
  // Operations
  'contact_rate', 'completion_rate', 'resolution_rate', 'fcr', 'escalation_rate',
  'repeat_contact_rate', 'aht', 'successful_resolution_time',
  // Intelligence
  'autonomous_resolution_rate', 'authentication_success_rate', 'intent_accuracy',
  'tool_success_rate', 'fallback_rate', 'avoidable_escalation_rate',
  // Quality & Experience
  'qa_pass_rate', 'compliance_pass_rate', 'csat', 'nps',
  // Business & Economics
  'business_outcome_success', 'conversion_rate', 'cost_per_resolution',
  // Conversation Quality (Session R6.3A)
  'context_continuity_rate', 'followup_understanding_rate', 'intent_routing_accuracy',
  'conversation_recovery_rate', 'unnecessary_clarification_rate', 'task_progression_rate',
  'reference_resolution_accuracy', 'response_grounding_rate', 'repetition_loop_rate', 'customer_correction_rate',
];

export const FRONTEND_RATIO_REGISTRY: Record<string, FrontendRatioDefinition> = {
  contact_rate: {
    id: 'contact_rate', name: 'Contact Rate', shortLabel: 'Contact Rate', family: 'operations',
    description: 'Share of outbound attempts that connected to the customer.',
    formulaText: 'Connected ÷ attempts', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Measures outbound dialing effectiveness before any conversation quality is assessed.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  completion_rate: {
    id: 'completion_rate', name: 'Completion Rate', shortLabel: 'Completion', family: 'operations',
    description: 'Share of connected interactions that reached a completed state.',
    formulaText: 'Completed ÷ connected/answered', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Not yet available — the real value set of the backend\'s completion-state field has never been live-verified in this product; only mock-data guesses exist. Requires Call Centre to confirm the connected-vs-completed distinction before this can be built defensibly.',
    declaredAvailability: 'partial', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  resolution_rate: {
    id: 'resolution_rate', name: 'Resolution Rate', shortLabel: 'Resolution', family: 'operations',
    description: 'Share of completed interactions that ended in a resolved outcome.',
    formulaText: 'Resolved ÷ eligible completed', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Computed server-side over the complete qualifying call population, sharing the same "handled" (resolved-or-escalated) population Escalation Rate uses.',
    declaredAvailability: 'direct', declaredDrillDimensions: ['intent', 'agent', 'campaign', 'direction'], declaredDriverDimension: null,
  },
  fcr: {
    id: 'fcr', name: 'First Contact Resolution', shortLabel: 'FCR', family: 'operations',
    description: 'Share of eligible interactions resolved on the first contact, no follow-up needed.',
    formulaText: 'First-contact resolved ÷ eligible', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Directly sourced from Call Centre\'s own fcr flag, aggregated server-side over the complete qualifying call population for the selected window.',
    declaredAvailability: 'direct', declaredDrillDimensions: ['intent', 'agent', 'campaign', 'direction', 'outcome'], declaredDriverDimension: null,
  },
  escalation_rate: {
    id: 'escalation_rate', name: 'Escalation Rate', shortLabel: 'Escalation', family: 'operations',
    description: 'Share of handled interactions that were escalated.',
    formulaText: 'Escalated ÷ handled', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'down',
    helpText: 'Directly sourced from Call Centre\'s own outcome field, aggregated server-side over the complete qualifying call population for the selected window.',
    declaredAvailability: 'direct', declaredDrillDimensions: ['intent', 'agent', 'campaign', 'direction', 'outcome'], declaredDriverDimension: 'escalation_reason',
  },
  repeat_contact_rate: {
    id: 'repeat_contact_rate', name: 'Repeat Contact Rate', shortLabel: 'Repeat Contact', family: 'operations',
    description: 'Share of eligible interactions that represent a repeat contact for the same issue.',
    formulaText: 'Repeat same-issue contacts ÷ eligible', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'down',
    helpText: 'Requires linking contacts by customer identity and issue over time.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  aht: {
    id: 'aht', name: 'Average Handle Time', shortLabel: 'AHT', family: 'operations',
    description: 'Average time spent handling an interaction.',
    formulaText: 'Total handle time ÷ handled', unit: 'seconds', preferredVisualization: 'distribution', goodDirection: 'down',
    helpText: 'Computed server-side from real per-call durations over the complete qualifying call population, excluding stale/garbage-duration rows (the same isStaleDuration guard already used for Agent Detail).',
    declaredAvailability: 'direct', declaredDrillDimensions: ['intent', 'agent', 'campaign', 'direction', 'outcome'], declaredDriverDimension: null,
  },
  successful_resolution_time: {
    id: 'successful_resolution_time', name: 'Successful Resolution Time', shortLabel: 'Resolution Time', family: 'operations',
    description: 'Average duration of interactions that ended in a resolved outcome.',
    formulaText: 'Resolved-call duration ÷ resolved calls', unit: 'seconds', preferredVisualization: 'distribution', goodDirection: 'down',
    helpText: 'A duration-only view filtered to the resolved subset, distinct from overall AHT — reuses the same stale-duration exclusion rule.',
    declaredAvailability: 'direct', declaredDrillDimensions: ['intent', 'agent', 'campaign', 'direction'], declaredDriverDimension: null,
  },
  autonomous_resolution_rate: {
    id: 'autonomous_resolution_rate', name: 'Autonomous Resolution Rate', shortLabel: 'Autonomous Resolution', family: 'intelligence',
    description: 'Share of eligible AI-handled interactions resolved without human hand-off.',
    formulaText: 'AI-only resolved ÷ eligible AI interactions', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Requires an explicit resolution-mode signal distinguishing AI-only from human-assisted.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  authentication_success_rate: {
    id: 'authentication_success_rate', name: 'Authentication Success Rate', shortLabel: 'Auth Success', family: 'intelligence',
    description: 'Share of authentication attempts that succeeded.',
    formulaText: 'Successful auth ÷ auth attempts', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Computed server-side over interactions where authentication was genuinely attempted (was_authenticated is non-null) — a call that never attempted authentication is excluded, not counted as a failure.',
    declaredAvailability: 'direct', declaredDrillDimensions: ['intent', 'agent', 'campaign'], declaredDriverDimension: null,
  },
  intent_accuracy: {
    id: 'intent_accuracy', name: 'Intent Accuracy', shortLabel: 'Intent Accuracy', family: 'intelligence',
    description: 'Share of intent classifications confirmed correct against evaluated ground truth.',
    formulaText: 'Correct intent classifications ÷ evaluated', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Not the same as the model\'s own classifier confidence score, which this product never presents as measured accuracy.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  tool_success_rate: {
    id: 'tool_success_rate', name: 'Tool Success Rate', shortLabel: 'Tool Success', family: 'intelligence',
    description: 'Share of AI tool calls that completed successfully.',
    formulaText: 'Successful tool calls ÷ tool attempts', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Requires interaction-level AI tool-call event telemetry.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  fallback_rate: {
    id: 'fallback_rate', name: 'Fallback Rate', shortLabel: 'Fallback', family: 'intelligence',
    description: 'Share of AI turns that fell back to a generic or hand-off response.',
    formulaText: 'Fallback turns ÷ AI turns', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'down',
    helpText: 'Requires turn-level AI event telemetry.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  avoidable_escalation_rate: {
    id: 'avoidable_escalation_rate', name: 'Avoidable Escalation Rate', shortLabel: 'Avoidable Escalation', family: 'intelligence',
    description: 'Share of escalations attributable to an AI or technical failure rather than genuine complexity.',
    formulaText: 'AI-failure + technical escalations ÷ escalations', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'down',
    helpText: 'A real escalation-reason field exists; a normalized avoidable/unavoidable taxonomy does not yet.',
    declaredAvailability: 'partial', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  qa_pass_rate: {
    id: 'qa_pass_rate', name: 'QA Pass Rate', shortLabel: 'QA Pass', family: 'quality',
    description: 'Share of QA-evaluated interactions that met the pass threshold.',
    formulaText: 'Interactions meeting QA threshold ÷ evaluated', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Requires a persisted QA score/pass-fail record.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  compliance_pass_rate: {
    id: 'compliance_pass_rate', name: 'Compliance Pass Rate', shortLabel: 'Compliance', family: 'quality',
    description: 'Share of evaluated interactions with zero critical compliance failures.',
    formulaText: 'Zero-critical-failure interactions ÷ evaluated', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Requires a persisted compliance rule-evaluation record.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  csat: {
    id: 'csat', name: 'Customer Satisfaction', shortLabel: 'CSAT', family: 'quality',
    description: 'Share of survey responses indicating satisfaction.',
    formulaText: 'Satisfied responses ÷ valid responses', unit: 'percent', preferredVisualization: 'distribution', goodDirection: 'up',
    helpText: 'Requires a customer-satisfaction survey capture mechanism.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  nps: {
    id: 'nps', name: 'Net Promoter Score', shortLabel: 'NPS', family: 'quality',
    description: 'Percentage of promoters minus percentage of detractors.',
    formulaText: '% promoters − % detractors', unit: 'score', preferredVisualization: 'composition', goodDirection: 'up',
    helpText: 'Requires an NPS survey response capture mechanism.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  business_outcome_success: {
    id: 'business_outcome_success', name: 'Business Outcome Success', shortLabel: 'Outcome Success', family: 'business',
    description: 'Share of eligible interactions that produced a successful business outcome.',
    formulaText: 'Successful business outcomes ÷ eligible', unit: 'percent', preferredVisualization: 'funnel', goodDirection: 'up',
    helpText: 'Requires a domain-neutral business-outcome model at the interaction level.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  conversion_rate: {
    id: 'conversion_rate', name: 'Conversion Rate', shortLabel: 'Conversion', family: 'business',
    description: 'Share of eligible contacts that converted.',
    formulaText: 'Conversions ÷ eligible contacts', unit: 'percent', preferredVisualization: 'funnel', goodDirection: 'up',
    helpText: 'Requires a confirmed conversion-event capture, distinct from campaign result-rule labels.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  cost_per_resolution: {
    id: 'cost_per_resolution', name: 'Cost per Resolution', shortLabel: 'Cost/Resolution', family: 'business',
    description: 'Operating cost per resolved interaction.',
    formulaText: 'Operating cost ÷ resolved interactions', unit: 'currency', preferredVisualization: 'trend_line', goodDirection: 'down',
    helpText: 'Requires cost telemetry, which does not exist in this product yet.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },

  // ---------------------------------------------------------------------
  // Session R6.3A — Conversation Quality family, per
  // docs/SESSION_R6_2_CONVERSATION_QUALITY_ARCHITECTURE.md §C. Ratios 1-6
  // (context_continuity_rate .. task_progression_rate) are fully defined
  // but have no live evidence source yet (declaredAvailability:
  // 'awaiting_telemetry', with a qualityDefinition block RatioHero
  // renders in place of a live KPI). Ratios 7-10 remain 'backend_gap'
  // (the existing, unmodified not-yet-instrumented treatment) — their
  // operational definitions are not yet fixed enough to specify a
  // denominator/numerator defensibly (see R6.2 §C.2 for exactly why
  // each one is deferred, not merely "harder").
  // ---------------------------------------------------------------------
  context_continuity_rate: {
    id: 'context_continuity_rate', name: 'Context Continuity Rate', shortLabel: 'Context Continuity', family: 'conversation_quality',
    description: 'When the router continues an existing conversation frame rather than starting a new one, was that objectively correct?',
    formulaText: 'Correct continuations ÷ continue decisions', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Fully defined (R6.2 §C.1) — awaiting the Interaction Trace API for live per-turn router/frame evidence.',
    declaredAvailability: 'awaiting_telemetry', declaredDrillDimensions: [], declaredDriverDimension: null,
    qualityDefinition: {
      purpose: 'When the router chooses to continue an existing conversation frame instead of starting a new one, was that objectively the correct choice?',
      whatIsMeasured: 'Correctness of continue-vs-new frame routing decisions.',
      numerator: 'Continuations judged correct by the Conversation Quality evaluator.',
      denominator: 'Turns where the router recorded a "continue" decision into an existing frame.',
      exclusions: 'Turns with a "new"-frame decision, and turns where router/frame evidence wasn’t captured at all.',
      dependency: 'Structured, event-time router/frame evidence via the Interaction Trace API — not yet available.',
    },
  },
  followup_understanding_rate: {
    id: 'followup_understanding_rate', name: 'Follow-up Understanding Rate', shortLabel: 'Follow-up Understanding', family: 'conversation_quality',
    description: 'When the bot asks a question or makes an offer and the customer gives a short reply, does the system correctly understand and act on it?',
    formulaText: 'Correctly grounded follow-ups ÷ follow-up replies', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Fully defined (R6.2 §C.1) — awaiting the Interaction Trace API for reliable per-turn ordering and evidence.',
    declaredAvailability: 'awaiting_telemetry', declaredDrillDimensions: [], declaredDriverDimension: null,
    qualityDefinition: {
      purpose: 'When the bot asks a question or makes an offer, and the customer gives a short affirmative, negative, or clarifying reply, does the system correctly understand and act on it?',
      whatIsMeasured: 'Correct grounding of short follow-up replies into the prior offer/question.',
      numerator: 'Follow-ups where the bot’s response correctly acts on the customer’s reply.',
      denominator: 'Turns where the prior bot turn ended in a question/offer and the customer’s reply is a short affirmative/negative/clarifying response.',
      exclusions: 'Replies that introduce a genuinely new topic rather than answering the preceding question.',
      dependency: 'Per-turn trace evidence with reliable turn ordering via the Interaction Trace API — not yet available.',
    },
  },
  intent_routing_accuracy: {
    id: 'intent_routing_accuracy', name: 'Intent Routing Accuracy', shortLabel: 'Intent Routing', family: 'conversation_quality',
    description: 'Independent of continuity, was the intent the router assigned to a turn the objectively correct read of the customer’s utterance?',
    formulaText: 'Correctly routed turns ÷ evaluated turns', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Fully defined (R6.2 §C.1) — awaiting the Interaction Trace API for structured router-decision evidence.',
    declaredAvailability: 'awaiting_telemetry', declaredDrillDimensions: [], declaredDriverDimension: null,
    qualityDefinition: {
      purpose: 'Independent of continuity, was the intent the router assigned (new or continued) the objectively correct read of the customer’s utterance?',
      whatIsMeasured: 'Correctness of intent assignment.',
      numerator: 'Turns where the assigned/continued intent matches the utterance’s actual topic.',
      denominator: 'Every turn with captured router/frame evidence.',
      exclusions: 'Turns with no captured router/frame evidence.',
      dependency: 'Structured router decision evidence via the Interaction Trace API — not yet available.',
    },
  },
  conversation_recovery_rate: {
    id: 'conversation_recovery_rate', name: 'Conversation Recovery Rate', shortLabel: 'Recovery', family: 'conversation_quality',
    description: 'After a turn is judged a routing/understanding failure, does the system recover within the next 1–2 turns rather than repeating the same failure?',
    formulaText: 'Recovered failures ÷ detected failures', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Fully defined (R6.2 §C.1) — awaiting the Interaction Trace API; depends on the same evidence as Context Continuity/Follow-up Understanding/Intent Routing.',
    declaredAvailability: 'awaiting_telemetry', declaredDrillDimensions: [], declaredDriverDimension: null,
    qualityDefinition: {
      purpose: 'After a turn is judged a routing/understanding failure, does the system recover within the next 1–2 turns rather than repeating the same failure?',
      whatIsMeasured: 'Whether a detected failure is followed by correct grounding of the same underlying request.',
      numerator: 'Failures followed within 1–2 turns by a correctly grounded response to the same request.',
      denominator: 'Turns already judged a failure by Context Continuity, Follow-up Understanding, or Intent Routing.',
      exclusions: 'Failures at the end of a trace with no subsequent turn to evaluate recovery against.',
      dependency: 'The same trace evidence as Context Continuity/Follow-up Understanding/Intent Routing, plus reliable turn adjacency, via the Interaction Trace API — not yet available.',
    },
  },
  unnecessary_clarification_rate: {
    id: 'unnecessary_clarification_rate', name: 'Unnecessary Clarification Rate', shortLabel: 'Unnecessary Clarification', family: 'conversation_quality',
    description: 'How often does the bot ask a clarifying question when the information needed was already available from prior evidence?',
    formulaText: 'Unnecessary clarifications ÷ clarifying turns', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'down',
    helpText: 'Fully defined (R6.2 §C.1) — awaiting the Interaction Trace API for structured frame/tool-result evidence.',
    declaredAvailability: 'awaiting_telemetry', declaredDrillDimensions: [], declaredDriverDimension: null,
    qualityDefinition: {
      purpose: 'How often does the bot ask a clarifying question when the information needed to proceed directly was already available (in active frames, prior tool results, or the utterance itself)?',
      whatIsMeasured: 'Clarifying questions that duplicate already-available evidence.',
      numerator: 'Clarifications judged unnecessary against that already-available evidence.',
      denominator: 'Turns whose action is primarily a clarifying question.',
      exclusions: 'The first clarifying question in a genuinely ambiguous request, where no prior evidence exists.',
      dependency: 'Structured frame/tool-result evidence via the Interaction Trace API — not yet available.',
    },
  },
  task_progression_rate: {
    id: 'task_progression_rate', name: 'Task Progression Rate', shortLabel: 'Task Progression', family: 'conversation_quality',
    description: 'Once a task-oriented tool action succeeds, does the conversation move forward rather than re-asking a question that action already answered or made moot?',
    formulaText: 'Progressed turns ÷ post-success turns', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Fully defined (R6.2 §C.1) — awaiting the Interaction Trace API for explicit tool success/failure status.',
    declaredAvailability: 'awaiting_telemetry', declaredDrillDimensions: [], declaredDriverDimension: null,
    qualityDefinition: {
      purpose: 'Once a task-oriented tool action succeeds (e.g. a payment link is resent, a lookup completes), does the conversation move forward (confirm, close, or advance) rather than re-asking a question that action already answered or made moot?',
      whatIsMeasured: 'Whether the turn(s) immediately following a successful task action progress the conversation.',
      numerator: 'Turns that correctly progress (acknowledge completion, advance, or close) after a successful task action.',
      denominator: 'Turns immediately following a successful tool_exec in a task-oriented (non-informational-lookup) flow.',
      exclusions: 'Informational lookups where re-confirming ("anything else?") is a legitimate next step, not repetition.',
      dependency: 'Explicit per-call tool success/failure status via the Interaction Trace API — not yet available.',
    },
  },
  reference_resolution_accuracy: {
    id: 'reference_resolution_accuracy', name: 'Reference Resolution Accuracy', shortLabel: 'Reference Resolution', family: 'conversation_quality',
    description: 'Did the system correctly resolve pronouns/implicit references ("that account," "the remittance") to the right entity?',
    formulaText: 'Correct resolutions ÷ coreference turns', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Not yet instrumented — too little real coreference-sourced evidence exists yet (R6.2 §A.5 found exactly one example across both audited traces) to define a defensible eligible population or failure taxonomy.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  response_grounding_rate: {
    id: 'response_grounding_rate', name: 'Response Grounding Rate', shortLabel: 'Response Grounding', family: 'conversation_quality',
    description: 'Is every factual claim in the bot’s response traceable to a specific tool result or RAG reference, with no ungrounded/fabricated detail?',
    formulaText: 'Grounded claims ÷ evaluated claims', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Not yet instrumented — requires reference/chunk IDs on RAG results (R6.2 §B.2 item 10) to anchor grounding checks structurally rather than comparing free text against free text.',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  repetition_loop_rate: {
    id: 'repetition_loop_rate', name: 'Repetition / Loop Rate', shortLabel: 'Repetition / Loop', family: 'conversation_quality',
    description: 'How often does the system ask the identical (or functionally identical) question 2+ times without the conversation state changing?',
    formulaText: 'Repeated turns ÷ eligible turns', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'down',
    helpText: 'Not yet instrumented — needs a precise, non-overlapping definition from Task Progression Rate and Conversation Recovery Rate before it can be defined defensibly (R6.2 §C.2).',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  customer_correction_rate: {
    id: 'customer_correction_rate', name: 'Customer Correction Rate', shortLabel: 'Customer Correction', family: 'conversation_quality',
    description: 'How often does the customer have to explicitly correct or restate something the bot got wrong?',
    formulaText: 'Corrections ÷ eligible turns', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'down',
    helpText: 'Not yet instrumented — requires a reliable way to distinguish a correction from the customer simply adding new information (R6.2 §C.2).',
    declaredAvailability: 'backend_gap', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
};

export function getFrontendRatioDefinition(ratioId: string): FrontendRatioDefinition | null {
  return FRONTEND_RATIO_REGISTRY[ratioId] ?? null;
}

export const RATIO_FAMILY_LABELS: Record<string, string> = {
  operations: 'Operations',
  intelligence: 'Intelligence',
  quality: 'Quality & Experience',
  business: 'Business & Economics',
  conversation_quality: 'Conversation Quality',
};

export const RATIO_FAMILY_ORDER: readonly string[] = ['operations', 'intelligence', 'quality', 'business', 'conversation_quality'];
