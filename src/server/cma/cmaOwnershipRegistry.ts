// Session 10 — the static CMA ownership classification table: one row
// per canonical measure id, naming its delivery mode and the real
// reasoning behind it. This is the one place this session's judgment
// calls are made explicit and auditable (per the Session 10 brief:
// "This table is the one piece of real, auditable judgment this
// session has to encode — write it explicitly, with a one-line reason
// per id, not inferred silently").
//
// This table NEVER decides a measure's live VALUE — only its ownership
// mode, source type, and accuracy status. The actual value (or
// unavailable/non-aggregate result) comes from cmaOwnershipResolver.ts,
// which dispatches to the real existing evaluation engine
// (evaluateCmaMeasure, unchanged) or one of the new adapter/
// non-aggregate functions, per the mode recorded here.

import type { CmaOwnershipMode, CmaAccuracyStatus, CmaSourceType } from './cmaEvaluationTypes.js';

export interface CmaOwnershipEntry {
  ownershipMode: CmaOwnershipMode;
  accuracyStatus: CmaAccuracyStatus;
  sourceType: CmaSourceType;
  sourceReference: string | null;
  calculationVersion: string | null;
  /** One-line, human-auditable reason this id got this classification. */
  reason: string;
}

// ---- The 22 CMA_NATIVE operational measures (CMA_ALGORITHM_REGISTRY, unchanged) ----
const NATIVE_IDS = [
  'CANON-RES-RATE', 'CANON-AUTH-SUCCESS-RATE', 'CANON-SUCCESSFUL-RES-TIME', 'CANON-AVG-SENT-SCORE',
  'CANON-INTENT-CONFIDENCE', 'CANON-CONTEXT-CONTINUITY-RATE', 'CANON-FOLLOWUP-UNDERSTANDING-RATE',
  'CANON-TASK-PROGRESSION-RATE', 'CANON-REFERENCE-RES-ACC', 'CANON-RESPONSE-GROUNDING-RATE',
  'CANON-CONVERSATION-RECOVERY-RATE', 'CANON-UNNECESSARY-CLARIFICATION-RATE', 'CANON-REPETITION-LOOP-RATE',
  'CANON-CUSTOMER-CORRECTION-RATE', 'CANON-CAMPAIGN-TARGET-COUNT', 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI',
  'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS', 'CANON-CHAT-SESSION-SPAN', 'CANON-ACTION-REQUIRED-QUEUE-ITEMS',
  'CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA', 'CANON-CUSTOMER-360-ESC-COUNT', 'CANON-CUSTOMER-360-AUTH-SUMMARY',
] as const;

// ---- The 3 Session 9 candidates — CMA_PROVISIONAL, not CMA_NATIVE. Governance stays
// pending_decision (no silent rewrite); accuracyStatus stays 'unverified' because what's
// missing is business approval of the DEFINITION, not calculation correctness (which
// Session 9 did independently verify, in disposable PostgreSQL and against live production
// data — see docs/SESSION_9_FCR_ESC_AHT_CMA_OWNERSHIP.md). ----
const PROVISIONAL: Record<string, CmaOwnershipEntry> = {
  'CANON-FIRST-CONTACT-RES': {
    ownershipMode: 'CMA_PROVISIONAL', accuracyStatus: 'unverified', sourceType: 'cma_rpc',
    sourceReference: 'cmaCandidateAlgorithms9.ts / FCR-03 (migration 20261114000000)', calculationVersion: 'candidate-v1',
    reason: 'FCR-03 calculation independently verified (Session 9); business approval of the definition is the only remaining gap.',
  },
  'CANON-ESC-RATE': {
    ownershipMode: 'CMA_PROVISIONAL', accuracyStatus: 'unverified', sourceType: 'cma_rpc',
    sourceReference: 'cmaCandidateAlgorithms9.ts / ESC-03 (migration 20261114000000)', calculationVersion: 'candidate-v1',
    reason: 'ESC-03 calculation independently verified (Session 9), including the documented legacy discrepancy; pending business approval.',
  },
  'CANON-AVG-HANDLE-TIME': {
    ownershipMode: 'CMA_PROVISIONAL', accuracyStatus: 'unverified', sourceType: 'cma_rpc',
    sourceReference: 'cmaCandidateAlgorithms9.ts / AHT-03 (migration 20261114000000)', calculationVersion: 'candidate-v1',
    reason: 'AHT-03 calculation independently verified (Session 9), including the stale-duration boundary; pending business approval.',
  },
};

// ---- Legacy adapters — real existing calculations, normalized and delivered through
// CMA rather than reimplemented (Mode C). ----
const LEGACY_ADAPTERS: Record<string, CmaOwnershipEntry> = {
  'CANON-AVG-INTENT-ACC': {
    ownershipMode: 'CMA_LEGACY_ADAPTER', accuracyStatus: 'unverified', sourceType: 'voiceforce_api',
    sourceReference: 'GET /api/v1/analytics/metrics avg_intent_accuracy field', calculationVersion: null,
    reason: 'Register\'s own numerator/denominator/eligible_population are documented "unknown" — an upstream-opaque passthrough with no formula this codebase can reimplement. Delivered as-is, never claimed independently verified.',
  },
  'CANON-CALL-TECH-PERF': {
    ownershipMode: 'CMA_LEGACY_ADAPTER', accuracyStatus: 'unverified', sourceType: 'local_aggregation',
    sourceReference: 'src/services/agents/agentPerformanceAggregator.ts computeAgentCallTechnicalPerformance()', calculationVersion: null,
    reason: 'A real, already-deployed per-agent correlation (Session 15.4) over already-scoped, already-fetched Voice API call metrics. Owned/labeled through CMA; computation stays where its data dependencies already are rather than being re-plumbed into a new server RPC (disproportionate to this session for a measure still pending_decision).',
  },
};

// ---- CMA_NON_AGGREGATE — real, working resolvers in cmaNonAggregateAlgorithms.ts (Mode E). ----
const NON_AGGREGATE: Record<string, CmaOwnershipEntry> = {
  'CANON-SENT': {
    ownershipMode: 'CMA_NON_AGGREGATE', accuracyStatus: 'not_applicable', sourceType: 'cma_rpc',
    sourceReference: 'cmaNonAggregateAlgorithms.ts resolveSentimentDistribution() — call_center.customer_interactions.sentiment_score', calculationVersion: 'non-agg-v1',
    reason: 'A categorical sentiment distribution, not a scalar ratio/average — CANON-AVG-SENT-SCORE already covers the numeric aggregate. "Accuracy" does not apply the same way to a raw bucketed distribution.',
  },
  'CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY': {
    ownershipMode: 'CMA_NON_AGGREGATE', accuracyStatus: 'not_applicable', sourceType: 'cma_rpc',
    sourceReference: 'cmaNonAggregateAlgorithms.ts resolveCorrectiveActionLookup() — call_center.corrective_actions', calculationVersion: 'non-agg-v1',
    reason: 'Direct fields on one record, not a population aggregate — a lookup, by design, not a ratio/average.',
  },
  'CANON-QA-CALIBRATION-PERPARAMETER-CLASSIFICATI': {
    ownershipMode: 'CMA_NON_AGGREGATE', accuracyStatus: 'not_applicable', sourceType: 'cma_rpc',
    sourceReference: 'cmaNonAggregateAlgorithms.ts resolveQaCalibrationPerParameter() — qa_findings + automated_qa_observations, joined by interaction', calculationVersion: 'non-agg-v1',
    reason: 'A paired human-vs-automated comparison per (interaction, parameter), not a population ratio — a genuinely different aggregation shape.',
  },
  'CANON-QA-CALIBRATION-COVERAGE-DIVERGENCE': {
    ownershipMode: 'CMA_NON_AGGREGATE', accuracyStatus: 'not_applicable', sourceType: 'cma_rpc',
    sourceReference: 'cmaNonAggregateAlgorithms.ts resolveQaCalibrationCoverageDivergence() — same join, grouped by parameter_code coverage gap', calculationVersion: 'non-agg-v1',
    reason: 'A per-parameter coverage-gap distribution (human-only / automated-only / both), not a scalar ratio.',
  },
  'CANON-QA-CALIBRATION-PROMPT-VERSION-DISAGREEME': {
    ownershipMode: 'CMA_NON_AGGREGATE', accuracyStatus: 'not_applicable', sourceType: 'cma_rpc',
    sourceReference: 'cmaNonAggregateAlgorithms.ts resolveQaCalibrationPromptVersionDisagreement() — same join, grouped by automated_qa_evaluations.prompt_version', calculationVersion: 'non-agg-v1',
    reason: 'A disagreement-rate-by-prompt-version comparison, not a single population ratio.',
  },
};

// ---- The 3 mock indicators — genuinely handled natively by evaluateCmaMeasure()'s own
// governance short-circuit today (terminal() returns {kind:'mock'} before any RPC is ever
// attempted) — a real, working code path, never a registry label with nothing behind it. ----
const MOCK_IDS = ['CANON-NPS-CAMPAIGNS', 'CANON-ORCHESTRATOR-FLOW-METRICS', 'CANON-WHATSAPP-CONNECTION-STATUS'] as const;

// ---- The 25 unimplemented measures — CMA_UNAVAILABLE, each with its own real,
// previously-investigated reason (docs/CMA_CALCULATION_COVERAGE.md §5, re-stated here so
// the reason travels with the code, not only a separate doc). ----
const UNAVAILABLE_REASONS: Record<string, string> = {
  'CANON-CSAT': 'No customer-satisfaction survey response capture exists in any integrated system.',
  'CANON-NPS': 'No NPS survey response persistence exists — NPS Campaigns manages delivery only, confirmed mock for responses.',
  'CANON-COST-PER-RES': 'No cost/billing fact exists anywhere in this system\'s integrations.',
  'CANON-REPEAT-CONTACT-RATE': 'Needs a cross-interaction, same-customer-same-issue linkage over time that neither upstream API nor any internal table expresses.',
  'CANON-CONTACT-RATE': 'Needs a "connected to customer" signal distinct from "triggered" — not recorded by campaign_results/campaign_targets.',
  'CANON-COMPLETION-RATE': 'The only candidate field traces only to legacy mock data — no confirmed real field for "answered-connected" vs "confirmed completed."',
  'CANON-TOOL-SUCCESS-RATE': 'Needs tool_calls evidence per turn — present in the Interaction Trace API, never ingested into Supabase.',
  'CANON-FALLBACK-RATE': 'Needs final_plan.action/fallback-classification evidence per turn — same ingestion gap.',
  'CANON-AVOIDABLE-ESC-RATE': 'Needs escalation_event with an attributable cause — documented always-null in the data captured today.',
  'CANON-AUTONOMOUS-RES-RATE': 'Needs a per-call AI-only vs. human-assisted classification — no such field is synced anywhere.',
  'CANON-INTENT-ACC': 'Needs ground-truth intent labels to compare against — no ground-truth capture mechanism exists.',
  'CANON-INTENT-ROUTING-ACC': 'Needs router_decision evidence per turn — same Trace-API-ingestion gap.',
  'CANON-CONTEXT-CONTINUITY-RATE-POPULATION-RATIO': 'Would need every turn of the full population classified — same un-ingested Trace-API evidence as the Tool/Fallback gaps, at full-population scale.',
  'CANON-FOLLOWUP-UNDERSTANDING-RATE-POPULATION-R': 'Same full-population Trace-API-ingestion gap.',
  'CANON-TASK-PROGRESSION-RATE-POPULATION-RATIO': 'Same full-population Trace-API-ingestion gap.',
  'CANON-REFERENCE-RES-ACC-POPULATION-RATIO': 'Same full-population Trace-API-ingestion gap.',
  'CANON-RESPONSE-GROUNDING-RATE-POPULATION-RATIO': 'Same full-population Trace-API-ingestion gap.',
  'CANON-CONVERSATION-RECOVERY-RATE-POPULATION-RA': 'Same full-population Trace-API-ingestion gap.',
  'CANON-UNNECESSARY-CLARIFICATION-RATE-POPULATIO': 'Same full-population Trace-API-ingestion gap.',
  'CANON-REPETITION-LOOP-RATE-POPULATION-RATIO': 'Same full-population Trace-API-ingestion gap.',
  'CANON-CUSTOMER-CORRECTION-RATE-POPULATION-RATI': 'Same full-population Trace-API-ingestion gap.',
  'CANON-QA-PASS-RATE': 'Per-parameter PASS/FAIL data is now directly accessible; what is missing is a business decision on the whole-interaction pass threshold, not data.',
  'CANON-COMPLIANCE-PASS-RATE': 'Same shape — needs a defined "critical compliance failure" rule, not new data.',
  'CANON-CONVERSION-RATE': '"Conversion" is undefined at the system level and means something different per campaign type/intent.',
  'CANON-BUSINESS-OUTCOME-SUCCESS': 'Same ambiguity — no single source spans voice + chat + campaigns generically.',
};

export function resolveCmaOwnership(canonicalMeasureId: string): CmaOwnershipEntry {
  if ((NATIVE_IDS as readonly string[]).includes(canonicalMeasureId)) {
    return {
      ownershipMode: 'CMA_NATIVE', accuracyStatus: 'verified', sourceType: 'cma_rpc',
      sourceReference: 'cmaEvaluationAlgorithms.ts CMA_ALGORITHM_REGISTRY', calculationVersion: 'v1',
      reason: 'One of the 22 deployed, independently-verified CMA-native calculations.',
    };
  }
  if (PROVISIONAL[canonicalMeasureId]) return PROVISIONAL[canonicalMeasureId];
  if (LEGACY_ADAPTERS[canonicalMeasureId]) return LEGACY_ADAPTERS[canonicalMeasureId];
  if (NON_AGGREGATE[canonicalMeasureId]) return NON_AGGREGATE[canonicalMeasureId];
  if ((MOCK_IDS as readonly string[]).includes(canonicalMeasureId)) {
    return {
      ownershipMode: 'CMA_NATIVE', accuracyStatus: 'not_applicable', sourceType: 'none',
      sourceReference: 'cmaEvaluation.ts evaluateCmaMeasure() governance short-circuit', calculationVersion: null,
      reason: 'Explicitly fabricated/mock by design — handled natively by the evaluation engine\'s own governance check, never a real measurement.',
    };
  }
  if (UNAVAILABLE_REASONS[canonicalMeasureId]) {
    return {
      ownershipMode: 'CMA_UNAVAILABLE', accuracyStatus: 'not_applicable', sourceType: 'none',
      sourceReference: null, calculationVersion: null,
      reason: UNAVAILABLE_REASONS[canonicalMeasureId],
    };
  }
  // Any canonical id not covered above (should not occur for the 60 registered ids —
  // defensive fallback, never silently treated as available).
  return {
    ownershipMode: 'CMA_UNAVAILABLE', accuracyStatus: 'not_applicable', sourceType: 'none',
    sourceReference: null, calculationVersion: null,
    reason: 'Not classified in this session\'s ownership table — treat as unavailable until investigated.',
  };
}

/** Static screen-occurrence map — updated as each screen is wired this session (§7 of the
 *  brief: "a machine-checkable screen occurrence mapping"). A measure legitimately having
 *  zero consumers is not a defect and is left as an empty array, not omitted. */
export const CMA_CONSUMING_SCREENS: Record<string, string[]> = {
  'CANON-RES-RATE': ['Dashboard (Performance Ratios)', 'Ratio Explorer', 'Analytics'],
  'CANON-AUTH-SUCCESS-RATE': ['Dashboard (Performance Ratios)', 'Ratio Explorer'],
  'CANON-SUCCESSFUL-RES-TIME': ['Dashboard (Performance Ratios)', 'Ratio Explorer'],
  'CANON-AVG-SENT-SCORE': ['Agent Detail'],
  'CANON-INTENT-CONFIDENCE': ['Agent Detail'],
  'CANON-CONTEXT-CONTINUITY-RATE': ['Human QA Quality Explorer'],
  'CANON-FOLLOWUP-UNDERSTANDING-RATE': ['Human QA Quality Explorer'],
  'CANON-TASK-PROGRESSION-RATE': ['Human QA Quality Explorer'],
  'CANON-REFERENCE-RES-ACC': ['Human QA Quality Explorer'],
  'CANON-RESPONSE-GROUNDING-RATE': ['Human QA Quality Explorer'],
  'CANON-CONVERSATION-RECOVERY-RATE': ['Human QA Quality Explorer'],
  'CANON-UNNECESSARY-CLARIFICATION-RATE': ['Human QA Quality Explorer'],
  'CANON-REPETITION-LOOP-RATE': ['Human QA Quality Explorer'],
  'CANON-CUSTOMER-CORRECTION-RATE': ['Human QA Quality Explorer'],
  'CANON-CAMPAIGN-TARGET-COUNT': ['Outbound Campaigns'],
  'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI': ['Outbound Campaigns'],
  'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS': ['Outbound Campaigns'],
  'CANON-CHAT-SESSION-SPAN': [],
  'CANON-ACTION-REQUIRED-QUEUE-ITEMS': ['Dashboard (Action Required)'],
  'CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA': [],
  'CANON-CUSTOMER-360-ESC-COUNT': [],
  'CANON-CUSTOMER-360-AUTH-SUMMARY': [],
  'CANON-FIRST-CONTACT-RES': ['Dashboard (Performance Ratios)', 'Call Logs', 'Ratio Explorer'],
  'CANON-ESC-RATE': ['Dashboard (Performance Ratios)', 'Call Logs', 'Ratio Explorer'],
  'CANON-AVG-HANDLE-TIME': ['Dashboard (Performance Ratios)', 'Call Logs', 'Ratio Explorer'],
  'CANON-CALL-TECH-PERF': ['Agent Detail'],
  'CANON-AVG-INTENT-ACC': ['Analytics'],
  'CANON-SENT': [],
  'CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY': ['Corrective Actions'],
  'CANON-QA-CALIBRATION-PERPARAMETER-CLASSIFICATI': [],
  'CANON-QA-CALIBRATION-COVERAGE-DIVERGENCE': [],
  'CANON-QA-CALIBRATION-PROMPT-VERSION-DISAGREEME': [],
  'CANON-NPS-CAMPAIGNS': ['NPS Campaigns'],
  'CANON-ORCHESTRATOR-FLOW-METRICS': [],
  'CANON-WHATSAPP-CONNECTION-STATUS': [],
};

export const CMA_SESSION9_CANDIDATE_IDS = Object.keys(PROVISIONAL);
export const CMA_NON_AGGREGATE_IDS = Object.keys(NON_AGGREGATE);
export const CMA_LEGACY_ADAPTER_IDS = Object.keys(LEGACY_ADAPTERS);
export const CMA_MOCK_IDS: readonly string[] = MOCK_IDS;
