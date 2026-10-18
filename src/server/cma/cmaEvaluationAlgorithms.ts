// CMA-3A — the algorithm registry: an explicit, in-code association
// between a registered canonical measure id and the server-side
// implementation that is allowed to evaluate it (brief §9: "Establish an
// explicit association between a registered calculation reference and
// its server-side implementation... do not assume that a calculation is
// approved merely because code exists for it"). The evaluation pipeline
// (cmaEvaluation.ts) only ever runs the SQL branch for a canonical
// measure id that both this registry AND the live CMA registry (via
// getCanonicalMeasure) agree is decided and implemented — an id present
// in only one of the two is rejected, never silently executed.
//
// Selection (brief §6 — read the full rationale in
// docs/SESSION_CMA_3A_CALCULATION_ENGINE.md): 4 canonical measures,
// chosen directly from the live, applied CMA-2 registry
// (dtbaczafdzgctkbqviod), each already governed_algorithm_status =
// 'decided' (never FCR/Escalation Rate/AHT/Call Technical Performance,
// all still pending_decision), each with a numerator/denominator/
// zero-denominator-handling the register itself already documents
// clearly, and each backed by a real, persisted column on
// call_center.customer_interactions (no upstream-opaque passthrough).

export type CmaMeasureUnit = 'percent' | 'seconds' | 'score';

export interface CmaAlgorithmDefinition {
  canonicalMeasureId: string;
  unit: CmaMeasureUnit;
  /** cma_base_facts ids this algorithm expects to be registered for its resolved occurrence
   *  (cma_measure_base_facts) — cross-checked at evaluation time, not just asserted here. */
  expectedBaseFactIds: string[];
  eligiblePopulationDescription: string;
}

export const CMA_ALGORITHM_REGISTRY: Readonly<Record<string, CmaAlgorithmDefinition>> = {
  // Resolution Rate — resolved / (resolved ∪ escalated), the "handled" population.
  // Register occurrence RES-01, src/server/analytics/ratioMath.ts computeResolutionRate()
  // (this engine reimplements the same business rule server-side in SQL; it does not call
  // the existing TS function, since that function reads from the upstream Call Data API page
  // fetcher, not this table — see the report's "relationship to existing screen calculations" note).
  'CANON-RES-RATE': {
    canonicalMeasureId: 'CANON-RES-RATE',
    unit: 'percent',
    expectedBaseFactIds: ['FACT-OUTCOME'],
    eligiblePopulationDescription: "voice interactions in the window with outcome in ('resolved','escalated')",
  },
  // Authentication Success Rate — was_authenticated=true / was_authenticated is not null.
  // Register occurrence AUTH-01.
  'CANON-AUTH-SUCCESS-RATE': {
    canonicalMeasureId: 'CANON-AUTH-SUCCESS-RATE',
    unit: 'percent',
    expectedBaseFactIds: ['FACT-WAS-AUTHENTICATED'],
    eligiblePopulationDescription: 'voice interactions in the window where was_authenticated is non-null (an authentication flow was genuinely attempted)',
  },
  // Successful Resolution Time — mean duration_seconds over resolved, non-stale calls.
  // Register occurrence SRT-01. The ~4h (14400s) stale-duration guard matches this codebase's
  // existing isStaleDuration() convention (src/lib/format.ts), reapplied here in SQL rather than
  // imported, since this engine never loads rows into application memory to filter them (brief §8).
  'CANON-SUCCESSFUL-RES-TIME': {
    canonicalMeasureId: 'CANON-SUCCESSFUL-RES-TIME',
    unit: 'seconds',
    expectedBaseFactIds: ['FACT-DURATION-SECONDS', 'FACT-OUTCOME'],
    eligiblePopulationDescription: 'resolved voice interactions in the window with duration_seconds < 14400 (the ~4h stale-duration guard)',
  },
  // Avg Sentiment Score — mean sentiment_score over interactions where it is non-null.
  // Register occurrence AGENT-SENT-01 — naturally meaningful grouped by agent.
  'CANON-AVG-SENT-SCORE': {
    canonicalMeasureId: 'CANON-AVG-SENT-SCORE',
    unit: 'score',
    expectedBaseFactIds: ['FACT-SENTIMENT-SCORE'],
    eligiblePopulationDescription: 'voice interactions in the window with a non-null sentiment_score',
  },
};
