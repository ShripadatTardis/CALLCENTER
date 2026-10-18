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
import { CMA_ALGORITHM_REGISTRY, type CmaAlgorithmDefinition } from './cmaEvaluationAlgorithms.js';
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

/** This evaluation engine's currently-supported dimensions overall — a
 *  deliberate SUBSET of the real registry's 7 (time, channel, agent,
 *  campaign, interaction_source, outcome, customer). 'time' is covered
 *  by the mandatory `window` request field, not requested as a
 *  dimension here. 'outcome', 'customer', 'interaction_source' are not
 *  wired into this engine at all this session — requesting them returns
 *  unsupported_dimension, never a silently-ignored filter. This is the
 *  outer ceiling (dimension ids this engine implements AT ALL); WHICH of
 *  these apply to a given measure is governed entirely by the CMA
 *  Dimensions Registry (`cma_measure_dimensions`, queried below for
 *  EVERY source family, not just 'interaction') — not by any per-
 *  algorithm array in this file. [CMA-3B.1] Prior to this correction,
 *  a duplicate `CMA_ALGORITHM_REGISTRY[id].supportedDimensions` array
 *  also gated this decision for the 4 non-interaction families, on the
 *  (incorrect) assumption that CMA-2 had never seeded registry
 *  relationships for them — it had, for all 75 occurrences, including
 *  these. That duplication is removed; the registry is now the single
 *  authority, consistent with how it already governed the 'interaction'
 *  family. */
const SUPPORTED_FILTER_DIMENSIONS: readonly CmaDimensionId[] = ['agent', 'channel', 'campaign'];

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
  // 'count' measures (e.g. Campaign Target Count, Action Required Queue Items) are a raw
  // population size, not a ratio — a count of 0 is a real, meaningful answer ("no eligible rows
  // in this window"), never an "unavailable" state, so this unit never reports zero_denominator.
  if (unit === 'count') return { kind: 'value', value: Math.round(numerator ?? 0), unit };
  if (!denominator || denominator <= 0) return { kind: 'zero_denominator', displayAs: 'null' };
  const raw = (numerator ?? 0) / denominator;
  const value = unit === 'percent' ? Math.round(raw * 1000) / 10 : Math.round(raw * 100) / 100;
  return { kind: 'value', value, unit };
}

/** Builds the exact RPC argument object for this algorithm's source family — each family's RPC
 *  has a different parameter signature (a chat-session-backed RPC has no p_filter_campaign_id,
 *  a campaign-backed RPC has no p_filter_channel, etc.), reflecting the real grain of its source
 *  table rather than forcing one bloated generic signature on every family. */
function buildRpcArgs(
  algorithm: CmaAlgorithmDefinition,
  canonicalId: string,
  req: CmaMeasureRequest,
  access: EvaluationScopeAccess,
  filterAgentId: string | null,
): Record<string, unknown> {
  const common = {
    p_canonical_measure_id: canonicalId,
    p_started_from: req.window.from,
    p_started_to: req.window.to,
    p_all_agents: access.allCategories || access.authorizedAgentIds === 'all',
    p_authorized_agent_ids: access.authorizedAgentIds === 'all' ? [] : access.authorizedAgentIds,
    p_filter_agent_id: filterAgentId,
    p_group_by: req.groupBy ?? null,
  };
  switch (algorithm.sourceFamily) {
    case 'interaction':
      return { ...common, p_filter_channel: req.filters?.channel ?? null, p_filter_campaign_id: req.filters?.campaign ?? null };
    case 'qa':
      return { ...common, p_filter_channel: req.filters?.channel ?? null };
    case 'campaign':
      return { ...common, p_filter_campaign_id: req.filters?.campaign ?? null };
    case 'chat':
    case 'action':
      // [CMA-3B.1] both chat_sessions and action_items have a real campaign_id column (confirmed
      // by direct schema inspection), and the CMA-2 registry already (correctly) lists 'campaign'
      // as a valid dimension for CHAT-SPAN-01/ACTION-01 — this RPC argument is the physical-field
      // mapping that makes runtime capability match that registered claim. Neither table has a
      // 'channel' column, so no p_filter_channel is ever constructed for these two families.
      return { ...common, p_filter_campaign_id: req.filters?.campaign ?? null };
    default:
      return common;
  }
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

  // ---- 1d. VALIDATE: registry/algorithm Base Fact drift check (brief §9). Skipped for source
  // families CMA-2 never seeded interaction-centric Base Fact relationships for (qa/campaign/
  // chat/action — algorithm.expectedBaseFactIds is deliberately empty for those; see
  // cmaEvaluationAlgorithms.ts's own comment on this scope boundary). ----
  if (resolvedMeasureId && algorithm.expectedBaseFactIds.length > 0) {
    const registeredFacts = await listBaseFactsForMeasure(supabase, resolvedMeasureId);
    const registeredIds = new Set(registeredFacts.map((f) => f.baseFact.id));
    const missing = algorithm.expectedBaseFactIds.filter((id) => !registeredIds.has(id));
    if (missing.length > 0) {
      return terminal(req, canonical.governed_algorithm_status, access, requestedFilters,
        { kind: 'missing_required_facts', reason: `The registry does not record the base fact(s) this algorithm requires: ${missing.join(', ')}.` },
        resolvedMeasureId);
    }
  }

  // ---- 1e. VALIDATE: requested filter/groupBy dimensions. [CMA-3B.1] The CMA Dimensions
  // Registry (`cma_measure_dimensions`) is now the SINGLE authority for which dimensions a
  // measure supports, for every source family — not just 'interaction'. CMA-2 seeded real,
  // CSV-derived relationships for all 75 register occurrences, this engine's 4 non-interaction
  // families included; there is no per-algorithm duplicate of this decision left in this
  // codebase. SUPPORTED_FILTER_DIMENSIONS remains this engine's own outer ceiling (which
  // dimension ids it implements at all) — a measure can only be as permissive as the
  // intersection of what the registry allows and what this engine has wired up. ----
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

  // ---- 3. CALCULATE: one RPC call (the one named by this algorithm's source family), all
  // aggregation server-side, Business Data Scope enforced inside that RPC's own WHERE clause —
  // including for the 4 non-interaction source families CMA-3B adds (brief §3: "Apply authorized
  // Business Data Scope before aggregation, including calculations backed by non-interaction
  // sources"). ----
  const rpcArgs = buildRpcArgs(algorithm, canonical.id, req, access, filterAgentId);
  const { data, error } = await supabase.rpc(algorithm.rpc, rpcArgs);
  if (error) throw new Error(`${algorithm.rpc}: ${error.message}`);

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
