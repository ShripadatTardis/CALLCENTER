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

export interface CmaMeasureRequest {
  canonicalMeasureId: string;
  window: { from: string; to: string };
  filters?: Partial<Record<CmaDimensionId, string>>;
  groupBy?: CmaDimensionId;
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
