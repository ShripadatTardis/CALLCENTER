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
    helpText: 'A connected call that drops before completion is not counted as completed.',
    declaredAvailability: 'derived', declaredDrillDimensions: [], declaredDriverDimension: null,
  },
  resolution_rate: {
    id: 'resolution_rate', name: 'Resolution Rate', shortLabel: 'Resolution', family: 'operations',
    description: 'Share of completed interactions that ended in a resolved outcome.',
    formulaText: 'Resolved ÷ eligible completed', unit: 'percent', preferredVisualization: 'trend_line', goodDirection: 'up',
    helpText: 'Sourced from the interaction\'s own outcome field (resolved vs. escalated).',
    declaredAvailability: 'direct', declaredDrillDimensions: [], declaredDriverDimension: null,
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
    helpText: 'A duration-only view filtered to the resolved subset, distinct from overall AHT.',
    declaredAvailability: 'derived', declaredDrillDimensions: [], declaredDriverDimension: null,
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
    helpText: 'A real "was authenticated" flag exists; a distinct "attempted" signal does not yet.',
    declaredAvailability: 'partial', declaredDrillDimensions: [], declaredDriverDimension: null,
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
};

export function getFrontendRatioDefinition(ratioId: string): FrontendRatioDefinition | null {
  return FRONTEND_RATIO_REGISTRY[ratioId] ?? null;
}

export const RATIO_FAMILY_LABELS: Record<string, string> = {
  operations: 'Operations',
  intelligence: 'Intelligence',
  quality: 'Quality & Experience',
  business: 'Business & Economics',
};

export const RATIO_FAMILY_ORDER: readonly string[] = ['operations', 'intelligence', 'quality', 'business'];
