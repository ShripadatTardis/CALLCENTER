// CMA-3A — Evaluation contract types.
//
// Follows docs/CMA_EVALUATION_CONTRACT_v0_3_1.md's shape (branded
// identifiers, a discriminated-union CmaMeasureValue result, the
// canonical-vs-occurrence-vs-algorithm identity separation) with one
// deliberate, disclosed deviation: that document's CmaDimensionId union
// ('agent' | 'campaign' | 'channel' | 'direction' | 'category' |
// 'time_bucket' | 'qa_parameter' | 'outcome' | 'tool_name') does not
// match the dimension ids the real, deployed CMA-2 registry actually
// uses ('time' | 'channel' | 'agent' | 'campaign' | 'interaction_source'
// | 'outcome' | 'customer' — supabase/migrations/20261027000000_cma_governance_registry.sql).
// Per this session's brief ("inspect the actual implemented database
// schema... rather than assuming the design proposal exactly matches the
// deployed implementation"), CmaDimensionId here is a SUBSET of the real
// registry's ids, not the contract doc's hypothetical list — see the
// session report for the full account of which of the 7 real dimensions
// this session's evaluation engine actually wires up (2: agent, channel;
// campaign as a filter-only extra) versus which remain unimplemented
// (time as a *grouping* dimension — the mandatory window parameter
// already covers time as a *filter*; outcome, customer, interaction_source).

export type CanonicalMeasureId = string & { readonly __brand: 'CanonicalMeasureId' };
export type ImplementationMeasureId = string & { readonly __brand: 'ImplementationMeasureId' };
export type AlgorithmRef = string & { readonly __brand: 'AlgorithmRef' };

/** The real, deployed CMA-2 registry dimension ids this engine supports requesting against. */
export type CmaDimensionId = 'agent' | 'channel' | 'campaign';

export type CmaMeasureUnit = 'percent' | 'seconds' | 'score' | 'count';

export type CmaMeasureValue =
  | { kind: 'value'; value: number; unit: CmaMeasureUnit }
  | { kind: 'zero_denominator'; displayAs: 'null' }
  /** Governance status is pending_decision — per brief §3/§6, never calculated with an unapproved formula. */
  | { kind: 'not_yet_governed' }
  /** Registry status is unimplemented — a real, defined measure with no live algorithm anywhere yet. */
  | { kind: 'unimplemented'; reason: string }
  /** Registry status is mock — an explicitly fabricated indicator, never evaluated as real. */
  | { kind: 'mock'; warning: string }
  /** The canonical measure id does not exist in the registry at all. */
  | { kind: 'not_found'; reason: string }
  /** The registry marks this id a chart/visualization (not_applicable), or this evaluation
   *  engine simply has no algorithm wired up for an otherwise-decided measure (brief §9: never
   *  assume code exists just because the registry says "decided"). */
  | { kind: 'unsupported'; reason: string }
  /** The resolved occurrence's registered Base Facts don't match what the algorithm requires —
   *  a real drift-detection check between the registry and this engine's own expectations. */
  | { kind: 'missing_required_facts'; reason: string }
  /** A requested filter value is outside the caller's authorized Business Data Scope — this
   *  engine refuses to narrow-then-silently-widen or to pretend the filter was never given. */
  | { kind: 'unauthorized_filter'; reason: string }
  /** A requested filter or groupBy dimension is not supported by this engine, or is not
   *  registered as applicable to the resolved occurrence in cma_measure_dimensions. */
  | { kind: 'unsupported_dimension'; reason: string };

export interface CmaMeasureResponseGroup {
  groupKey?: string;
  result: CmaMeasureValue;
  evidence?: { numerator: number | null; denominator: number; population: number };
}

export interface CmaMeasureResponse {
  canonicalMeasureId: CanonicalMeasureId;
  resolvedMeasureId?: ImplementationMeasureId;
  algorithmRef?: AlgorithmRef;
  algorithmStatus: 'decided' | 'pending_decision' | 'unimplemented' | 'mock' | 'not_applicable' | 'not_found';
  requestedFilters: Partial<Record<CmaDimensionId, string>>;
  appliedFilters: Partial<Record<CmaDimensionId, string>>;
  scopeApplied: { allAgents: boolean; agentIds: string[] | 'all' };
  /**
   * Session 8 — Customer Category Scope, as actually applied by a
   * 'customer'-source-family algorithm. Present ONLY when a real
   * category-scoped query ran (the success path of evaluateCmaMeasure
   * for that family) — omitted on every terminal/early-exit response
   * and on every other source family, since those never enforce this
   * scope dimension at all. Never conflated with `scopeApplied`
   * (Agent Scope): the two dimensions are independent and reported
   * independently.
   */
  categoryScopeApplied?: { allCategories: boolean; categoryAgentIds: string[] | 'all' };
  groups: CmaMeasureResponseGroup[];
  dataCompleteness: { populationSize: number; note: string };
  evaluatedAt: string;
}

/**
 * Session 4D — the central, governed QA population selector. Only
 * meaningful for 'qa' source-family measures; requesting it against any
 * other measure is rejected (see cmaEvaluation.ts), never silently
 * ignored. 'combined' is the default when omitted — the same behavior
 * every existing caller already got before this field existed.
 */
export type CmaQaPopulation = 'human' | 'automated' | 'combined';

// ---------------------------------------------------------------------
// Session 10 — complete CMA ownership. Additive only: every type above
// this line, and every existing CmaMeasureResponse/CmaMeasureValue
// consumer, is unchanged. These types describe a NEW layer —
// "does CMA own this measure, and through what delivery mode" — that
// sits alongside the existing per-request evaluation contract, never
// replacing it. See cmaOwnershipRegistry.ts for the resolver that
// produces these.
// ---------------------------------------------------------------------

/**
 * How CMA currently delivers a given canonical measure. Deliberately
 * distinct from `governed_algorithm_status` (cmaRegistry.ts) and from
 * `accuracyStatus` below — a measure can be CMA_PROVISIONAL (owned,
 * real calculation exists) while its governance status stays
 * `pending_decision` (not yet business-approved) and its accuracy
 * status stays `unverified` (approval, not correctness, is what's
 * missing). Ownership, governance, and accuracy are three independent
 * axes — never collapsed into one combined number anywhere in this
 * codebase (brief §8, user correction confirming this for the 22-vs-60
 * counts specifically).
 */
export type CmaOwnershipMode =
  | 'CMA_NATIVE'          // one of the 22 already-deployed, accuracy-verified algorithms (also used for the 3 'mock' indicators, which are natively handled by this same engine's own governance short-circuit — never fabricated as a real measurement, see accuracyStatus)
  | 'CMA_PROVISIONAL'     // a real CMA calculation exists and was independently tested, but business approval of the definition itself is still pending
  | 'CMA_LEGACY_ADAPTER'  // the value is sourced from an existing upstream API or local aggregation, normalized and delivered through CMA rather than reimplemented
  | 'CMA_UNAVAILABLE'     // no source data or formula exists anywhere in this system
  | 'CMA_NON_AGGREGATE';  // a record lookup, distribution, or paired comparison — not a scalar ratio/average

export type CmaAccuracyStatus = 'verified' | 'unverified' | 'not_applicable';

export type CmaSourceType = 'cma_rpc' | 'voiceforce_api' | 'local_aggregation' | 'none';

/** Session 10 — the typed result shapes for CMA_NON_AGGREGATE measures.
 *  Never forced into `{value, unit}` — a record lookup or a
 *  distribution is not a ratio, and pretending otherwise would be
 *  exactly the kind of invented calculation this session's brief
 *  forbids ("do not force every measure into a percentage/average"). */
export type CmaNonAggregateResult =
  | { kind: 'record_lookup'; fields: Record<string, string | number | boolean | null> }
  | { kind: 'distribution'; buckets: Array<{ label: string; count: number }>; totalPopulation: number }
  | {
      kind: 'paired_comparison';
      rows: Array<{ dimension: string; humanValue: string | number | boolean | null; automatedValue: string | number | boolean | null; agreement: boolean | null }>;
    }
  | { kind: 'no_eligible_rows'; reason: string };

/**
 * One canonical measure's complete ownership record — the unified
 * shape `resolveCmaMeasure()` (cmaOwnershipRegistry.ts) returns for
 * every one of the 60 registered canonical ids, with or without a live
 * evaluation request. See that file's own header comment for exactly
 * which fields are populated in the static-only vs. live-evaluated case.
 */
export interface CmaOwnedMeasure {
  canonicalMeasureId: string;
  measureName: string;
  governanceStatus: 'pending_decision' | 'decided' | 'unimplemented' | 'mock' | 'not_applicable';
  ownershipMode: CmaOwnershipMode;
  accuracyStatus: CmaAccuracyStatus;
  sourceType: CmaSourceType;
  sourceReference: string | null;
  calculationVersion: string | null;
  consumingScreens: string[];
  unavailableReason: string | null;
  /** Populated only when a live evaluation (CMA_NATIVE/CMA_PROVISIONAL via evaluateCmaMeasure,
   *  or a CMA_LEGACY_ADAPTER/CMA_NON_AGGREGATE wrapper) actually ran — never for
   *  CMA_UNAVAILABLE, which never attempts one regardless of whether a request was passed. */
  value?: CmaMeasureValue | CmaNonAggregateResult;
  dataWindow?: { from: string; to: string };
  appliedDimensions?: Partial<Record<CmaDimensionId, string>>;
  appliedBusinessDataScope?: { allAgents: boolean; agentIds: string[] | 'all' };
  datasetMode?: string | null;
  dataQualityWarnings?: string[];
}

export interface CmaMeasureRequest {
  canonicalMeasureId: string;
  window: { from: string; to: string };
  filters?: Partial<Record<CmaDimensionId, string>>;
  groupBy?: CmaDimensionId;
  qaPopulation?: CmaQaPopulation;
  /**
   * Session 7.1 — dataset mode. Omitted/null (the default) is NORMAL
   * mode: only rows with no dataset_id (every real operational row).
   * A real label (e.g. 'CMA_POC_500_V1') is TEST mode: only rows
   * tagged with that exact dataset_id. The two populations are never
   * mixed — every CMA RPC this engine calls enforces the same
   * either/or predicate server-side.
   */
  datasetId?: string | null;
}
