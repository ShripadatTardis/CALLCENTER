// Session 10 — the single, central CMA ownership entry point. Every
// canonical measure, regardless of mode, resolves through
// `resolveCmaMeasure()`. Never a parallel engine: CMA_NATIVE dispatches
// to the existing, unchanged `evaluateCmaMeasure()`; CMA_PROVISIONAL
// reuses the same registry/RPC machinery via a focused bypass of just
// the pending_decision governance short-circuit (the three Session 9
// candidates are INTENTIONALLY still pending_decision in the database —
// see cmaOwnershipRegistry.ts's own comment); CMA_LEGACY_ADAPTER and
// CMA_NON_AGGREGATE dispatch to their own small, real resolver modules;
// CMA_UNAVAILABLE never attempts a live call at all.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCanonicalMeasure } from './cmaRegistry.js';
import {
  evaluateCmaMeasure, buildRpcArgs, toValueKind, isAgentIdInEvaluationScope,
  SUPPORTED_FILTER_DIMENSIONS, type EvaluationScopeAccess,
} from './cmaEvaluation.js';
import { CMA_CANDIDATE_ALGORITHMS_SESSION_9 } from './cmaCandidateAlgorithms9.js';
import { resolveCmaOwnership, CMA_SESSION9_CANDIDATE_IDS, CMA_NON_AGGREGATE_IDS } from './cmaOwnershipRegistry.js';
import { resolveAvgIntentAccuracy } from './cmaLegacyAdapters.js';
import {
  resolveSentimentDistribution, resolveCorrectiveActionLookup, resolveQaCalibrationPerParameter,
  resolveQaCalibrationCoverageDivergence, resolveQaCalibrationPromptVersionDisagreement,
} from './cmaNonAggregateAlgorithms.js';
import type { CmaDimensionId, CmaMeasureRequest } from './cmaEvaluationTypes.js';
import type { CmaOwnedMeasure } from './cmaEvaluationTypes.js';

export interface CmaOwnedMeasureRequest {
  window: { from: string; to: string };
  filters?: Partial<Record<CmaDimensionId, string>>;
  groupBy?: CmaDimensionId;
  qaPopulation?: 'human' | 'automated' | 'combined';
  datasetId?: string | null;
  /** Only meaningful for CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY — a record id, not a window-scoped request. */
  recordId?: string;
}

/** The three Session 9 candidates' own dimension support — same as every other
 *  'interaction'-family measure (agent/channel/campaign), since they share that RPC. */
async function evaluateProvisionalMeasure(
  supabase: SupabaseClient, canonicalMeasureId: string, req: CmaOwnedMeasureRequest, access: EvaluationScopeAccess,
) {
  const algorithm = CMA_CANDIDATE_ALGORITHMS_SESSION_9[canonicalMeasureId];
  if (!algorithm) return { kind: 'unsupported' as const, reason: 'No candidate algorithm registered for this id.' };

  const requestedDims = Array.from(new Set<CmaDimensionId>([...(Object.keys(req.filters ?? {}) as CmaDimensionId[]), ...(req.groupBy ? [req.groupBy] : [])]));
  for (const dim of requestedDims) {
    if (!SUPPORTED_FILTER_DIMENSIONS.includes(dim)) return { kind: 'unsupported_dimension' as const, reason: `Dimension '${dim}' is not supported.` };
  }
  const filterAgentId = req.filters?.agent ?? null;
  if (filterAgentId && !isAgentIdInEvaluationScope(access, filterAgentId)) {
    return { kind: 'unauthorized_filter' as const, reason: `agent '${filterAgentId}' is outside your authorized Business Data Scope.` };
  }

  const cmaReq: CmaMeasureRequest = { canonicalMeasureId, window: req.window, filters: req.filters, groupBy: req.groupBy, datasetId: req.datasetId };
  const rpcArgs = buildRpcArgs(algorithm, canonicalMeasureId, cmaReq, access, filterAgentId);
  const { data, error } = await supabase.rpc(algorithm.rpc, rpcArgs);
  if (error) throw new Error(`${algorithm.rpc}: ${error.message}`);
  const result = data as { status: string; population?: number; numerator?: number | null; denominator?: number };
  if (result.status !== 'ok') return { kind: 'unsupported' as const, reason: 'Rejected by the evaluation RPC.' };
  return toValueKind(result.numerator ?? null, result.denominator ?? 0, algorithm.unit);
}

export async function resolveCmaMeasure(
  supabase: SupabaseClient,
  canonicalMeasureId: string,
  access: EvaluationScopeAccess,
  categoryAccess?: EvaluationScopeAccess,
  liveReq?: CmaOwnedMeasureRequest,
  consumingScreens: string[] = [],
): Promise<CmaOwnedMeasure> {
  const ownership = resolveCmaOwnership(canonicalMeasureId);
  const canonical = await getCanonicalMeasure(supabase, canonicalMeasureId);
  const base: CmaOwnedMeasure = {
    canonicalMeasureId,
    measureName: canonical?.canonical_name ?? canonicalMeasureId,
    governanceStatus: canonical?.governed_algorithm_status ?? 'unimplemented',
    ownershipMode: ownership.ownershipMode,
    accuracyStatus: ownership.accuracyStatus,
    sourceType: ownership.sourceType,
    sourceReference: ownership.sourceReference,
    calculationVersion: ownership.calculationVersion,
    consumingScreens,
    unavailableReason: ownership.ownershipMode === 'CMA_UNAVAILABLE' ? ownership.reason : null,
  };

  if (!liveReq || ownership.ownershipMode === 'CMA_UNAVAILABLE') return base;

  if (ownership.ownershipMode === 'CMA_NATIVE' && !CMA_SESSION9_CANDIDATE_IDS.includes(canonicalMeasureId)) {
    const response = await evaluateCmaMeasure(
      supabase,
      { canonicalMeasureId, window: liveReq.window, filters: liveReq.filters, groupBy: liveReq.groupBy, qaPopulation: liveReq.qaPopulation, datasetId: liveReq.datasetId },
      access, categoryAccess,
    );
    return {
      ...base,
      value: response.groups[0]?.result,
      dataWindow: liveReq.window,
      appliedDimensions: response.appliedFilters,
      appliedBusinessDataScope: response.scopeApplied,
      datasetMode: liveReq.datasetId ?? null,
    };
  }

  if (ownership.ownershipMode === 'CMA_PROVISIONAL') {
    const value = await evaluateProvisionalMeasure(supabase, canonicalMeasureId, liveReq, access);
    return { ...base, value, dataWindow: liveReq.window, datasetMode: liveReq.datasetId ?? null };
  }

  if (ownership.ownershipMode === 'CMA_LEGACY_ADAPTER') {
    if (canonicalMeasureId === 'CANON-AVG-INTENT-ACC') {
      const value = await resolveAvgIntentAccuracy(access, liveReq.window);
      return { ...base, value, dataWindow: liveReq.window };
    }
    return { ...base, unavailableReason: 'This legacy-adapted measure has no server-side live evaluation path this session — see sourceReference for where it is actually computed.' };
  }

  if (ownership.ownershipMode === 'CMA_NON_AGGREGATE' && CMA_NON_AGGREGATE_IDS.includes(canonicalMeasureId)) {
    const nonAggReq = { window: liveReq.window, filterAgentId: liveReq.filters?.agent ?? null, datasetId: liveReq.datasetId };
    switch (canonicalMeasureId) {
      case 'CANON-SENT':
        return { ...base, value: await resolveSentimentDistribution(supabase, access, nonAggReq), dataWindow: liveReq.window };
      case 'CANON-CORRECTIVE-ACTION-STATUSPRIORITYCATEGORY':
        if (!liveReq.recordId) return { ...base, unavailableReason: 'This measure requires a specific corrective action recordId.' };
        return { ...base, value: await resolveCorrectiveActionLookup(supabase, access, liveReq.recordId) };
      case 'CANON-QA-CALIBRATION-PERPARAMETER-CLASSIFICATI':
        return { ...base, value: await resolveQaCalibrationPerParameter(supabase, access, nonAggReq), dataWindow: liveReq.window };
      case 'CANON-QA-CALIBRATION-COVERAGE-DIVERGENCE':
        return { ...base, value: await resolveQaCalibrationCoverageDivergence(supabase, access, nonAggReq), dataWindow: liveReq.window };
      case 'CANON-QA-CALIBRATION-PROMPT-VERSION-DISAGREEME':
        return { ...base, value: await resolveQaCalibrationPromptVersionDisagreement(supabase, access, nonAggReq), dataWindow: liveReq.window };
    }
  }

  return base;
}

/** Static-only listing for the "all 60" ownership map — no live evaluation, cheap,
 *  safe to call for every canonical id on a single page load. */
export async function listAllCmaOwnedMeasures(
  supabase: SupabaseClient, access: EvaluationScopeAccess, categoryAccess: EvaluationScopeAccess | undefined,
  consumingScreensByMeasureId: Record<string, string[]>,
): Promise<CmaOwnedMeasure[]> {
  const { listCanonicalMeasures } = await import('./cmaRegistry.js');
  const all = await listCanonicalMeasures(supabase);
  return Promise.all(all.map((m) => resolveCmaMeasure(supabase, m.id, access, categoryAccess, undefined, consumingScreensByMeasureId[m.id] ?? [])));
}
