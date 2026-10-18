// CMA-3A — the central evaluation service. One pipeline, reusable by
// any future consumer (Dashboard, Analytics, Reports, ...) — brief §2:
// "Do not create separate evaluation logic for Dashboard, Analytics or
// Reports." This file is the ONLY place a canonical measure's actual
// numerator/denominator predicate is interpreted; everything else
// (api/admin.ts's route handler, a future UI hook) only ever calls
// evaluateCmaMeasure() and renders its typed result.
//
// Pipeline order (validate -> scope -> calculate -> return) follows
// docs/CMA_EVALUATION_CONTRACT_v0_3_1.md section 5 exactly. See that
// file's own commentary for why this order matters: dimension/measure
// governance is resolved BEFORE Business Data Scope is applied, and
// scope is applied BEFORE any aggregation runs — never after.
//
// Business Data Scope: this file does not import api/_auth.ts (src/server
// must not depend on api/ — the reverse dependency direction every other
// src/server/cma module already follows). The caller (the API route)
// resolves `toAgentAccess(user)` itself and passes in an
// EvaluationScopeAccess value; evaluateCmaMeasure() narrows filters
// against it and passes it into the RPC's own WHERE clause, so scope
// enforcement happens server-side, inside the database query, never as
// an application-layer post-filter a future caller could forget to apply.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCanonicalMeasure, listBaseFactsForMeasure, listDimensionsForMeasure,
  type CmaCanonicalMeasure,
} from './cmaRegistry.js';
import { CMA_ALGORITHM_REGISTRY } from './cmaEvaluationAlgorithms.js';
import type {
  CmaMeasureRequest, CmaMeasureResponse, CmaMeasureResponseGroup, CmaMeasureValue, CmaDimensionId, CmaMeasureUnit,
} from './cmaEvaluationTypes.js';

/** Structurally identical to api/_auth.ts's ScopedAccess — duck-typed on
 *  purpose so this module never imports from api/. */
export interface EvaluationScopeAccess {
  allCategories: boolean;
  authorizedAgentIds: string[] | 'all';
}

export function isAgentIdInEvaluationScope(access: EvaluationScopeAccess, agentId: string | null | undefined): boolean {
  if (access.allCategories || access.authorizedAgentIds === 'all') return true;
  return !!agentId && access.authorizedAgentIds.includes(agentId);
}

/** This evaluation engine's currently-supported dimensions — a deliberate
 *  SUBSET of the real registry's 7 (time, channel, agent, campaign,
 *  interaction_source, outcome, customer). 'time' is covered by the
 *  mandatory `window` request field, not requested as a dimension here.
 *  'outcome', 'customer', 'interaction_source' are not wired into this
 *  engine at all this session — requesting them returns
 *  unsupported_dimension, never a silently-ignored filter. */
const SUPPORTED_FILTER_DIMENSIONS: readonly CmaDimensionId[] = ['agent', 'channel', 'campaign'];
const SUPPORTED_GROUP_BY: readonly CmaDimensionId[] = ['agent', 'channel'];

interface RpcGroupRow { key: string; population: number; numerator: number | null; denominator: number }
interface RpcResult {
  status: 'ok' | 'unsupported' | 'unsupported_dimension';
  groups?: RpcGroupRow[];
  population?: number;
  numerator?: number | null;
  denominator?: number;
}

function scopeAppliedOf(access: EvaluationScopeAccess): { allAgents: boolean; agentIds: string[] | 'all' } {
  if (access.allCategories || access.authorizedAgentIds === 'all') return { allAgents: true, agentIds: 'all' };
  return { allAgents: false, agentIds: access.authorizedAgentIds };
}

function buildResponse(
  req: CmaMeasureRequest,
  algorithmStatus: CmaMeasureResponse['algorithmStatus'],
  access: EvaluationScopeAccess,
  requestedFilters: Partial<Record<CmaDimensionId, string>>,
  appliedFilters: Partial<Record<CmaDimensionId, string>>,
  groups: CmaMeasureResponseGroup[],
  populationSize: number,
  dataCompletenessNote: string,
  resolvedMeasureId?: string | null,
  algorithmRef?: string | null,
): CmaMeasureResponse {
  return {
    canonicalMeasureId: req.canonicalMeasureId as CmaMeasureResponse['canonicalMeasureId'],
    resolvedMeasureId: resolvedMeasureId as CmaMeasureResponse['resolvedMeasureId'] | undefined,
    algorithmRef: algorithmRef as CmaMeasureResponse['algorithmRef'] | undefined,
    algorithmStatus,
    requestedFilters,
    appliedFilters,
    scopeApplied: scopeAppliedOf(access),
    groups,
    dataCompleteness: { populationSize, note: dataCompletenessNote },
    evaluatedAt: new Date().toISOString(),
  };
}

function terminal(
  req: CmaMeasureRequest,
  algorithmStatus: CmaMeasureResponse['algorithmStatus'],
  access: EvaluationScopeAccess,
  requestedFilters: Partial<Record<CmaDimensionId, string>>,
  result: CmaMeasureValue,
  resolvedMeasureId?: string | null,
): CmaMeasureResponse {
  return buildResponse(req, algorithmStatus, access, requestedFilters, {}, [{ result }], 0, 'Not calculated.', resolvedMeasureId);
}

function toValueKind(numerator: number | null, denominator: number, unit: CmaMeasureUnit): CmaMeasureValue {
  if (!denominator || denominator <= 0) return { kind: 'zero_denominator', displayAs: 'null' };
  const raw = (numerator ?? 0) / denominator;
  const value = unit === 'percent' ? Math.round(raw * 1000) / 10 : Math.round(raw * 100) / 100;
  return { kind: 'value', value, unit };
}

export async function evaluateCmaMeasure(
  supabase: SupabaseClient,
  req: CmaMeasureRequest,
  access: EvaluationScopeAccess,
): Promise<CmaMeasureResponse> {
  const requestedFilters: Partial<Record<CmaDimensionId, string>> = { ...(req.filters ?? {}) };

  // ---- 1a. VALIDATE: does the canonical measure exist? ----
  const canonical: CmaCanonicalMeasure | null = await getCanonicalMeasure(supabase, req.canonicalMeasureId);
  if (!canonical) {
    return terminal(req, 'not_found', access, requestedFilters, { kind: 'not_found', reason: `No canonical measure '${req.canonicalMeasureId}' is registered.` });
  }

  // ---- 1b. VALIDATE: governance short-circuits (brief §3 — never calculate a mock, unimplemented, or pending measure). ----
  if (canonical.governed_algorithm_status === 'mock' || canonical.measure_class === 'mock_indicator') {
    return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
      { kind: 'mock', warning: 'This indicator is explicitly fabricated/non-authoritative and is never evaluated as a real measurement.' });
  }
  if (canonical.governed_algorithm_status === 'unimplemented') {
    return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
      { kind: 'unimplemented', reason: 'This canonical measure has a real business definition but no live calculation implementation exists anywhere yet.' });
  }
  if (canonical.governed_algorithm_status === 'not_applicable') {
    return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
      { kind: 'unsupported', reason: 'This id identifies a chart/visualization, not an evaluable measure — use the chart visualization lookup instead.' });
  }
  if (canonical.governed_algorithm_status === 'pending_decision') {
    // Per brief §3: "For a measure marked pending_decision, return an explicit governed
    // status. Do not calculate it using an unapproved formula." The migration reference is
    // surfaced for traceability only — it is NEVER executed as if it were the authoritative answer.
    return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
      { kind: 'not_yet_governed' }, canonical.migration_reference_measure_id ?? undefined);
  }

  // canonical.governed_algorithm_status === 'decided' from here on.
  const resolvedMeasureId = canonical.migration_reference_measure_id;

  // ---- 1c. VALIDATE: does THIS engine have an algorithm for it? (brief §9 — never assume
  // code exists just because the registry says "decided"; the converse also holds: never run
  // a SQL branch for an id the registry doesn't actually mark decided, enforced by the RPC's
  // own allow-list too, defense in depth.) ----
  const algorithm = CMA_ALGORITHM_REGISTRY[canonical.id];
  if (!algorithm) {
    return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
      { kind: 'unsupported', reason: `No calculation implementation is registered in this evaluation engine for ${canonical.id} yet.` },
      resolvedMeasureId ?? undefined);
  }

  // ---- 1d. VALIDATE: registry/algorithm Base Fact drift check (brief §9). ----
  if (resolvedMeasureId) {
    const registeredFacts = await listBaseFactsForMeasure(supabase, resolvedMeasureId);
    const registeredIds = new Set(registeredFacts.map((f) => f.baseFact.id));
    const missing = algorithm.expectedBaseFactIds.filter((id) => !registeredIds.has(id));
    if (missing.length > 0) {
      return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
        { kind: 'missing_required_facts', reason: `The registry does not record the base fact(s) this algorithm requires: ${missing.join(', ')}.` },
        resolvedMeasureId);
    }
  }

  // ---- 1e. VALIDATE: requested filter/groupBy dimensions — supported by this engine AND
  // registered as applicable to the resolved occurrence (cma_measure_dimensions). ----
  const requestedDimensionIds = Array.from(new Set<CmaDimensionId>([
    ...(Object.keys(req.filters ?? {}) as CmaDimensionId[]),
    ...(req.groupBy ? [req.groupBy] : []),
  ]));
  for (const dim of requestedDimensionIds) {
    if (!SUPPORTED_FILTER_DIMENSIONS.includes(dim)) {
      return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
        { kind: 'unsupported_dimension', reason: `Dimension '${dim}' is not supported by this evaluation engine.` }, resolvedMeasureId ?? undefined);
    }
  }
  if (req.groupBy && !SUPPORTED_GROUP_BY.includes(req.groupBy)) {
    return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
      { kind: 'unsupported_dimension', reason: `Grouping by '${req.groupBy}' is not supported by this evaluation engine.` }, resolvedMeasureId ?? undefined);
  }
  if (resolvedMeasureId) {
    const approved = await listDimensionsForMeasure(supabase, resolvedMeasureId);
    const approvedIds = new Set(approved.map((d) => d.id));
    for (const dim of requestedDimensionIds) {
      if (!approvedIds.has(dim)) {
        return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
          { kind: 'unsupported_dimension', reason: `Dimension '${dim}' is not registered as applicable to ${resolvedMeasureId} in the CMA registry.` },
          resolvedMeasureId);
      }
    }
  }

  // ---- 2. SCOPE: a requested agent filter may only NARROW the caller's authorized scope, never expand it. ----
  const filterAgentId = req.filters?.agent ?? null;
  if (filterAgentId && !isAgentIdInEvaluationScope(access, filterAgentId)) {
    return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
      { kind: 'unauthorized_filter', reason: `agent '${filterAgentId}' is outside your authorized Business Data Scope.` }, resolvedMeasureId);
  }

  // ---- 3. CALCULATE: one RPC call, all aggregation server-side, scope enforced inside its own WHERE clause. ----
  const { data, error } = await supabase.rpc('call_center_cma_evaluate_measure', {
    p_canonical_measure_id: canonical.id,
    p_started_from: req.window.from,
    p_started_to: req.window.to,
    p_all_agents: access.allCategories || access.authorizedAgentIds === 'all',
    p_authorized_agent_ids: access.authorizedAgentIds === 'all' ? [] : access.authorizedAgentIds,
    p_filter_agent_id: filterAgentId,
    p_filter_channel: req.filters?.channel ?? null,
    p_filter_campaign_id: req.filters?.campaign ?? null,
    p_group_by: req.groupBy ?? null,
  });
  if (error) throw new Error(`call_center_cma_evaluate_measure: ${error.message}`);

  const rpcResult = data as RpcResult;
  if (rpcResult.status !== 'ok') {
    return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
      { kind: 'unsupported_dimension', reason: 'Rejected by the evaluation RPC\'s own governance allow-list.' }, resolvedMeasureId);
  }

  const appliedFilters: Partial<Record<CmaDimensionId, string>> = {};
  if (filterAgentId) appliedFilters.agent = filterAgentId;
  if (req.filters?.channel) appliedFilters.channel = req.filters.channel;
  if (req.filters?.campaign) appliedFilters.campaign = req.filters.campaign;

  // ---- 4. RETURN ----
  const groups: CmaMeasureResponseGroup[] = [];
  let totalPopulation = 0;
  if (req.groupBy && rpcResult.groups) {
    for (const g of rpcResult.groups) {
      totalPopulation += g.population;
      groups.push({
        groupKey: g.key,
        result: toValueKind(g.numerator, g.denominator, algorithm.unit),
        evidence: { numerator: g.numerator, denominator: g.denominator, population: g.population },
      });
    }
  } else {
    const population = rpcResult.population ?? 0;
    totalPopulation = population;
    groups.push({
      result: toValueKind(rpcResult.numerator ?? null, rpcResult.denominator ?? 0, algorithm.unit),
      evidence: { numerator: rpcResult.numerator ?? null, denominator: rpcResult.denominator ?? 0, population },
    });
  }

  return buildResponse(
    req, canonical.governed_algorithm_status, access, requestedFilters, appliedFilters,
    groups, totalPopulation, algorithm.eligiblePopulationDescription,
    resolvedMeasureId ?? undefined, resolvedMeasureId ?? undefined,
  );
}
