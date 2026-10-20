// CMA-3A/3B/3B.1 — the algorithm registry: an explicit, in-code
// association between a registered canonical measure id and the
// server-side implementation (RPC + CASE arm) allowed to evaluate it
// (brief §9: "do not assume that a calculation is approved merely
// because code exists for it"). The evaluation pipeline
// (cmaEvaluation.ts) only ever executes a SQL branch for a canonical
// measure id that both this registry AND the live CMA registry (via
// getCanonicalMeasure) agree is decided and implemented.
//
// CMA-3A (production-verified, 4 measures, source family 'interaction'
// only — do not change their definitions or population semantics):
// CANON-RES-RATE, CANON-AUTH-SUCCESS-RATE, CANON-SUCCESSFUL-RES-TIME,
// CANON-AVG-SENT-SCORE.
//
// CMA-3B adds 15 more measures across 4 additional source families —
// every one backed by a real, persisted Supabase table this codebase
// already writes to (never customer_interactions alone; brief §2: "do
// not assume all measures must be derived from customer_interactions").
// `rpc` names the Postgres function that evaluates this family.
//
// [CMA-3B.1 CORRECTION] This file previously also carried a
// `supportedDimensions` field used as a GOVERNANCE gate (which
// dimensions a caller may request). That duplicated the CMA Dimensions
// Registry's own authority (`cma_measure_dimensions`, which CMA-2 had
// in fact already seeded real, CSV-derived relationships for every one
// of these 15 occurrences — a finding CMA-3B's own session report
// stated incorrectly) and created exactly the inconsistency CMA-3B.1's
// brief asks to correct: two sources of truth for the same governance
// question, one in a database table, one in this file, with no
// guarantee they agreed. The registry is now the ONLY place that
// decides which dimensions a measure supports (cmaEvaluation.ts queries
// it for every source family, not just 'interaction' — see that file).
// What legitimately remains here, per the brief's own instruction to
// "preserve source-specific physical field mappings in central source
// adapters/resolvers," is which RPC parameters each source family's
// function signature physically has — that lives in
// cmaEvaluation.ts's `buildRpcArgs()`, the one central resolver, not
// duplicated per algorithm here.

export type CmaMeasureUnit = 'percent' | 'seconds' | 'score' | 'count';
export type CmaSourceFamily = 'interaction' | 'qa' | 'campaign' | 'chat' | 'action' | 'customer';

export interface CmaAlgorithmDefinition {
  canonicalMeasureId: string;
  unit: CmaMeasureUnit;
  sourceFamily: CmaSourceFamily;
  rpc: string;
  /** cma_base_facts ids this algorithm expects to be registered for its resolved occurrence
   *  (cma_measure_base_facts) — cross-checked at evaluation time for the 'interaction' family,
   *  where CMA-2 seeded these relationships from the real register. The 4 new source families
   *  (qa/campaign/chat/action) were not part of CMA-2's interaction-centric Base Fact seeding
   *  (distinct from cma_measure_dimensions, which WAS seeded for all 75 occurrences — see the
   *  CMA-3B.1 correction note above), so this check is skipped for them (empty array) rather than
   *  failing a drift check against facts the registry was never asked to record. */
  expectedBaseFactIds: string[];
  eligiblePopulationDescription: string;
}

export const CMA_ALGORITHM_REGISTRY: Readonly<Record<string, CmaAlgorithmDefinition>> = {
  // ===== CMA-3A (unchanged — production-verified) =====
  'CANON-RES-RATE': {
    canonicalMeasureId: 'CANON-RES-RATE', unit: 'percent', sourceFamily: 'interaction', rpc: 'call_center_cma_evaluate_measure',
    expectedBaseFactIds: ['FACT-OUTCOME'],
    eligiblePopulationDescription: "voice interactions in the window with outcome in ('resolved','escalated')",
  },
  'CANON-AUTH-SUCCESS-RATE': {
    canonicalMeasureId: 'CANON-AUTH-SUCCESS-RATE', unit: 'percent', sourceFamily: 'interaction', rpc: 'call_center_cma_evaluate_measure',
    expectedBaseFactIds: ['FACT-WAS-AUTHENTICATED'],
    eligiblePopulationDescription: 'voice interactions in the window where was_authenticated is non-null',
  },
  'CANON-SUCCESSFUL-RES-TIME': {
    canonicalMeasureId: 'CANON-SUCCESSFUL-RES-TIME', unit: 'seconds', sourceFamily: 'interaction', rpc: 'call_center_cma_evaluate_measure',
    expectedBaseFactIds: ['FACT-DURATION-SECONDS', 'FACT-OUTCOME'],
    eligiblePopulationDescription: 'resolved voice interactions in the window with duration_seconds < 14400 (the ~4h stale-duration guard)',
  },
  'CANON-AVG-SENT-SCORE': {
    canonicalMeasureId: 'CANON-AVG-SENT-SCORE', unit: 'score', sourceFamily: 'interaction', rpc: 'call_center_cma_evaluate_measure',
    expectedBaseFactIds: ['FACT-SENTIMENT-SCORE'],
    eligiblePopulationDescription: 'voice interactions in the window with a non-null sentiment_score',
  },

  // ===== CMA-3B — same 'interaction' family, one new measure =====
  'CANON-INTENT-CONFIDENCE': {
    canonicalMeasureId: 'CANON-INTENT-CONFIDENCE', unit: 'score', sourceFamily: 'interaction', rpc: 'call_center_cma_evaluate_measure',
    expectedBaseFactIds: ['FACT-INTENT-CONFIDENCE'],
    eligiblePopulationDescription: 'voice interactions in the window with a non-null intent_confidence (aggregated as an average, extending the register\'s per-call DIRECT field the same way CANON-AVG-SENT-SCORE already extends per-call sentiment)',
  },

  // ===== CMA-3B — 'qa' family: call_center.qa_findings+qa_reviews (Human QA, status='submitted')
  // UNION call_center.automated_qa_observations+automated_qa_evaluations (Automated QA,
  // status='completed') — the exact two sources src/lib/qaRatios.ts/automatedQaRatios.ts already
  // feed from today, reimplemented in SQL rather than imported (this engine never loads rows into
  // application memory to compute a value). Real, observed value vocabulary per parameter (queried
  // live from production, not assumed) differs by parameter family — see the session report. =====
  'CANON-CONTEXT-CONTINUITY-RATE': {
    canonicalMeasureId: 'CANON-CONTEXT-CONTINUITY-RATE', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "submitted Human QA reviews + completed Automated QA evaluations, context_continuity_rate parameter, value not in ('N_A') — PASS counted in numerator",
  },
  'CANON-FOLLOWUP-UNDERSTANDING-RATE': {
    canonicalMeasureId: 'CANON-FOLLOWUP-UNDERSTANDING-RATE', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "followup_understanding_rate parameter, value not in ('N_A') — PASS counted in numerator",
  },
  'CANON-TASK-PROGRESSION-RATE': {
    canonicalMeasureId: 'CANON-TASK-PROGRESSION-RATE', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "task_progression_rate parameter, value not in ('N_A') — PASS counted in numerator",
  },
  'CANON-REFERENCE-RES-ACC': {
    canonicalMeasureId: 'CANON-REFERENCE-RES-ACC', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "reference_resolution_accuracy parameter, value not in ('N_A') — PASS counted in numerator (no Human QA data recorded for this parameter in production as of this session — Automated QA only)",
  },
  'CANON-RESPONSE-GROUNDING-RATE': {
    canonicalMeasureId: 'CANON-RESPONSE-GROUNDING-RATE', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "response_grounding_rate parameter, value not in ('N_A','CANNOT_VERIFY') — GROUNDED counted in numerator (CANNOT_VERIFY explicitly excluded, per the register's own documented rule)",
  },
  'CANON-CONVERSATION-RECOVERY-RATE': {
    canonicalMeasureId: 'CANON-CONVERSATION-RECOVERY-RATE', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "conversation_recovery_rate parameter, value not in ('N_A') — SUCCESSFUL counted in numerator",
  },
  'CANON-UNNECESSARY-CLARIFICATION-RATE': {
    canonicalMeasureId: 'CANON-UNNECESSARY-CLARIFICATION-RATE', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "unnecessary_clarification_rate parameter, value not in ('N_A') — ISSUE (the problem value) counted in numerator, per the register's documented lower-is-better convention",
  },
  'CANON-REPETITION-LOOP-RATE': {
    canonicalMeasureId: 'CANON-REPETITION-LOOP-RATE', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'review-level rollup: count of distinct reviews/evaluations with >=1 ISSUE finding for repetition_loop_rate / count of distinct reviews/evaluations with any non-N_A finding for it',
  },
  'CANON-CUSTOMER-CORRECTION-RATE': {
    canonicalMeasureId: 'CANON-CUSTOMER-CORRECTION-RATE', unit: 'percent', sourceFamily: 'qa', rpc: 'call_center_cma_evaluate_qa_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'review-level rollup: count of distinct reviews/evaluations with >=1 ISSUE finding for customer_correction_rate / count of distinct reviews/evaluations with any non-N_A finding for it',
  },

  // ===== CMA-3B — 'campaign' family: call_center.campaign_targets + campaign_results +
  // campaign_classifications. Scoped by campaign_results.agent_id (the AI agent that handled the
  // execution) — the same Agent Scope mechanism, not a second authorization model. Neither
  // campaign_targets nor campaign_results has a `channel` column — confirmed by direct schema
  // inspection this session; the registry's prior 'channel' relationship for these 3 occurrences
  // was not factually supported and was removed (CMA-3B.1, see the migration). =====
  'CANON-CAMPAIGN-TARGET-COUNT': {
    canonicalMeasureId: 'CANON-CAMPAIGN-TARGET-COUNT', unit: 'count', sourceFamily: 'campaign', rpc: 'call_center_cma_evaluate_campaign_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'campaign_targets loaded in the window, within the authorized agent scope (targets with no assigned agent yet are only visible to an all-access caller)',
  },
  'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI': {
    canonicalMeasureId: 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI', unit: 'percent', sourceFamily: 'campaign', rpc: 'call_center_cma_evaluate_campaign_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'targets with a classified effective result (campaign_results.is_success non-null) — numerator: is_success = true',
  },
  'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS': {
    canonicalMeasureId: 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-POLICY-CLASS', unit: 'percent', sourceFamily: 'campaign', rpc: 'call_center_cma_evaluate_campaign_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'targets whose result has a non-null campaign_classification_code — numerator: the matched campaign_classifications.is_success = true',
  },

  // ===== CMA-3B — 'chat' family: call_center.chat_sessions. Has a real campaign_id column (no
  // channel column — confirmed by direct schema inspection) — the CMA-3B.1 migration extends the
  // chat RPC to physically support campaign filtering/grouping, matching the registry's own
  // (correct) 'campaign' relationship for CHAT-SPAN-01, and removes its prior 'channel' claim. =====
  'CANON-CHAT-SESSION-SPAN': {
    canonicalMeasureId: 'CANON-CHAT-SESSION-SPAN', unit: 'seconds', sourceFamily: 'chat', rpc: 'call_center_cma_evaluate_chat_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'chat sessions started in the window with a non-null last_activity_at — span = last_activity_at - started_at',
  },

  // ===== CMA-3B — 'action' family: call_center.action_items (Session 15's Action Required queue).
  // Has a real campaign_id column (no channel or outcome column — confirmed by direct schema
  // inspection; its `status` column is a lifecycle state, open/in_progress/resolved, a different
  // concept from the interaction-domain 'outcome' dimension) — the CMA-3B.1 migration extends the
  // action RPC to physically support campaign filtering/grouping and removes the registry's prior
  // unsupported 'channel'/'outcome' claims for ACTION-01. =====
  'CANON-ACTION-REQUIRED-QUEUE-ITEMS': {
    canonicalMeasureId: 'CANON-ACTION-REQUIRED-QUEUE-ITEMS', unit: 'count', sourceFamily: 'action', rpc: 'call_center_cma_evaluate_action_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'action_items created in the window, within the authorized agent scope',
  },

  // ===== Session 8 — 'customer' family: call_center.customers' pre-aggregated per-customer
  // columns (total_interactions, inbound_count, outbound_count, escalation_count, auth_summary —
  // the same facts CUST360-01/02/03's existing per-customer Customer Detail calculation already
  // reads via aggregateMath.ts, FORMULA VERIFIED). CMA's job here is NOT to recompute the
  // per-customer numbers (that calculation is correct and unchanged) — it is to own the
  // POPULATION-level aggregate across every customer the caller's Customer Category Scope
  // authorizes, which no existing code computes today. Scoped exclusively by Customer Category
  // Scope (resolved to an agent_id set via customer360_category_agents, mirroring Customer
  // 360's own `toCustomerAccess`) — NOT Agent Scope, matching every existing Customer 360 route
  // (api/customers/*), none of which apply Agent Scope either. This family is also NOT windowed
  // (CUST360-01/02/03's own approved definition: "n/a (lifetime, not windowed)") — p_started_from/
  // p_started_to are never sent to this RPC, unlike every other family. No filter/groupBy
  // dimensions are registered for these 3 occurrences (no cma_measure_dimensions rows), so
  // requesting one is rejected as unsupported_dimension, not silently ignored. =====
  'CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA': {
    canonicalMeasureId: 'CANON-CUSTOMER-360-TOTALINBOUNDOUTBOUND-INTERA', unit: 'count', sourceFamily: 'customer', rpc: 'call_center_cma_evaluate_customer_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'sum(customers.total_interactions) across every customer within the authorized Customer Category Scope (lifetime, not windowed)',
  },
  'CANON-CUSTOMER-360-ESC-COUNT': {
    canonicalMeasureId: 'CANON-CUSTOMER-360-ESC-COUNT', unit: 'count', sourceFamily: 'customer', rpc: 'call_center_cma_evaluate_customer_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: 'sum(customers.escalation_count) across every customer within the authorized Customer Category Scope (lifetime, not windowed)',
  },
  'CANON-CUSTOMER-360-AUTH-SUMMARY': {
    canonicalMeasureId: 'CANON-CUSTOMER-360-AUTH-SUMMARY', unit: 'percent', sourceFamily: 'customer', rpc: 'call_center_cma_evaluate_customer_measure',
    expectedBaseFactIds: [],
    eligiblePopulationDescription: "percent of customers within the authorized Customer Category Scope whose auth_summary.everAuthenticated is true (lifetime, not windowed)",
  },
};
