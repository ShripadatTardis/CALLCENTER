/**
 * Session CMA-4A — frontend DTOs for the CMA evaluation API
 * (`POST /api/admin?resource=cmaEvaluate`).
 *
 * Deliberately independent of `src/server/cma/cmaEvaluationTypes.ts`:
 * frontend code never imports from `src/server/*` in this codebase (that
 * boundary is why `src/server/cma/cmaEvaluation.ts` itself duck-types its
 * own `EvaluationScopeAccess` instead of importing from `api/*`). This is
 * the same wire-shape, kept in sync by hand like every other `src/types/*`
 * DTO already does for its own API family (e.g. `src/types/ratio.ts`).
 */

export type CmaDimensionId = 'agent' | 'channel' | 'campaign';
export type CmaMeasureUnit = 'percent' | 'seconds' | 'score' | 'count';

export type CmaMeasureValue =
  | { kind: 'value'; value: number; unit: CmaMeasureUnit }
  | { kind: 'zero_denominator'; displayAs: 'null' }
  | { kind: 'not_yet_governed' }
  | { kind: 'unimplemented'; reason: string }
  | { kind: 'mock'; warning: string }
  | { kind: 'not_found'; reason: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'missing_required_facts'; reason: string }
  | { kind: 'unauthorized_filter'; reason: string }
  | { kind: 'unsupported_dimension'; reason: string };

export interface CmaMeasureResponseGroup {
  groupKey?: string;
  result: CmaMeasureValue;
  evidence?: { numerator: number | null; denominator: number; population: number };
}

export interface CmaMeasureResponse {
  canonicalMeasureId: string;
  resolvedMeasureId?: string;
  algorithmRef?: string;
  algorithmStatus: 'decided' | 'pending_decision' | 'unimplemented' | 'mock' | 'not_applicable' | 'not_found';
  requestedFilters: Partial<Record<CmaDimensionId, string>>;
  appliedFilters: Partial<Record<CmaDimensionId, string>>;
  scopeApplied: { allAgents: boolean; agentIds: string[] | 'all' };
  groups: CmaMeasureResponseGroup[];
  dataCompleteness: { populationSize: number; note: string };
  evaluatedAt: string;
}

/** Session 4D — only meaningful for QA-family measures; 'combined' (the default) preserves every pre-existing caller's behavior unchanged. */
export type CmaQaPopulation = 'human' | 'automated' | 'combined';

export interface CmaMeasureRequest {
  canonicalMeasureId: string;
  window: { from: string; to: string };
  filters?: Partial<Record<CmaDimensionId, string>>;
  groupBy?: CmaDimensionId;
  qaPopulation?: CmaQaPopulation;
  /** Session 7.1 — dataset mode. Omitted/null = NORMAL (real operational data only). A real label (e.g. 'CMA_POC_500_V1') = TEST mode, only that dataset's rows — never mixed with NORMAL. */
  datasetId?: string | null;
}

// ---------------------------------------------------------------------
// Session 10 — complete CMA ownership. Same hand-kept-in-sync convention
// as the rest of this file; mirrors src/server/cma/cmaEvaluationTypes.ts.
// ---------------------------------------------------------------------

export type CmaOwnershipMode = 'CMA_NATIVE' | 'CMA_PROVISIONAL' | 'CMA_LEGACY_ADAPTER' | 'CMA_UNAVAILABLE' | 'CMA_NON_AGGREGATE';
export type CmaAccuracyStatus = 'verified' | 'unverified' | 'not_applicable';
export type CmaSourceType = 'cma_rpc' | 'voiceforce_api' | 'local_aggregation' | 'none';

export type CmaNonAggregateResult =
  | { kind: 'record_lookup'; fields: Record<string, string | number | boolean | null> }
  | { kind: 'distribution'; buckets: Array<{ label: string; count: number }>; totalPopulation: number }
  | { kind: 'paired_comparison'; rows: Array<{ dimension: string; humanValue: string | number | boolean | null; automatedValue: string | number | boolean | null; agreement: boolean | null }> }
  | { kind: 'no_eligible_rows'; reason: string };

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
  value?: CmaMeasureValue | CmaNonAggregateResult;
  dataWindow?: { from: string; to: string };
  appliedDimensions?: Partial<Record<CmaDimensionId, string>>;
  appliedBusinessDataScope?: { allAgents: boolean; agentIds: string[] | 'all' };
  datasetMode?: string | null;
  dataQualityWarnings?: string[];
}

const CMA_MEASURE_VALUE_KINDS = new Set([
  'value', 'zero_denominator', 'not_yet_governed', 'unimplemented', 'mock', 'not_found',
  'unsupported', 'missing_required_facts', 'unauthorized_filter', 'unsupported_dimension',
]);

/** Session 10 — narrows the CmaOwnedMeasure.value union (CmaMeasureValue | CmaNonAggregateResult)
 *  down to the ratio-shaped CmaMeasureValue member, for the CMA_NATIVE/CMA_PROVISIONAL/
 *  CMA_LEGACY_ADAPTER call sites that only ever receive that shape in practice. */
export function isCmaMeasureValue(result: CmaMeasureValue | CmaNonAggregateResult | undefined): result is CmaMeasureValue {
  return Boolean(result) && CMA_MEASURE_VALUE_KINDS.has(result!.kind);
}

/** A human-readable reason for every non-value CmaMeasureValue kind, matching the existing Performance Ratio card's `unavailableReason` display convention (never a raw internal kind string shown to a user). */
export function cmaMeasureUnavailableReason(result: CmaMeasureValue): string {
  switch (result.kind) {
    case 'zero_denominator':
      return 'No eligible population';
    case 'not_yet_governed':
      return 'Pending business definition decision';
    case 'unimplemented':
      return result.reason;
    case 'mock':
      return result.warning;
    case 'not_found':
      return result.reason;
    case 'unsupported':
      return result.reason;
    case 'missing_required_facts':
      return result.reason;
    case 'unauthorized_filter':
      return result.reason;
    case 'unsupported_dimension':
      return result.reason;
    default:
      return 'No eligible population';
  }
}
