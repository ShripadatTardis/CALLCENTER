// CMA-2 — Central Measures and Dimensions Registry service.
//
// Minimal read-only server-side interface over the governance tables
// created by supabase/migrations/20261027000000_cma_governance_registry.sql.
// Exposes DEFINITIONS only — never executes a calculation (that is
// CMA-3's scope). Every function here is a thin, typed wrapper around
// one of that migration's read-only RPCs; no business logic lives here
// beyond shaping the RPC's jsonb response into a typed object.
//
// Uses the real @supabase/supabase-js SupabaseClient type directly, the
// same convention as cmaSyncRun.ts — a hand-rolled "client-like"
// interface doesn't structurally match the real client's `.rpc()`
// return type (a thenable query builder, not a plain Promise).

import type { SupabaseClient } from '@supabase/supabase-js';

export type GovernedAlgorithmStatus = 'pending_decision' | 'decided' | 'unimplemented' | 'mock' | 'not_applicable';
export type MeasureClass = 'business_measure' | 'mock_indicator';
export type MeasureOccurrenceStatus = 'live' | 'backend_gap' | 'partial' | 'awaiting_telemetry' | 'mock';
export type BaseFactRole = 'numerator' | 'denominator' | 'eligibility_filter' | 'grouping';

export interface CmaCanonicalMeasure {
  id: string;
  canonical_name: string;
  business_definition: string;
  measure_class: MeasureClass;
  governed_algorithm_status: GovernedAlgorithmStatus;
  governed_formula_ref: string | null;
  migration_reference_measure_id: string | null;
  created_at: string;
}

export interface CmaMeasureOccurrence {
  id: string;
  canonical_measure_id: string;
  formula_ref: string;
  eligible_population: string;
  numerator: string;
  denominator: string;
  zero_denominator_handling: string;
  aggregation_method: string;
  depends_on_measures: string[] | null;
  status: MeasureOccurrenceStatus;
  created_at: string;
}

export interface CmaDimension {
  id: string;
  label: string;
  canonical_values: unknown;
  normalization_rule: string | null;
  mapping_source: string | null;
  created_at: string;
}

export interface CmaBaseFact {
  id: string;
  entity: string;
  field_name: string;
  data_type: string;
  source_table: string;
  description: string;
  created_at: string;
}

export interface CmaChartVisualization {
  id: string;
  chart_name: string;
  visualizes_canonical_measure_id: string | null;
  visualizes_base_fact_id: string | null;
  presentation_dimension_id: string | null;
  created_at: string;
}

export interface CmaRegistryGovernanceStatus {
  canonicalMeasureCount: number;
  measureOccurrenceCount: number;
  chartVisualizationCount: number;
  dimensionCount: number;
  baseFactCount: number;
  canonicalMeasuresByStatus: Record<string, number>;
  measureOccurrencesByStatus: Record<string, number>;
}

async function callRpc<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function listCanonicalMeasures(supabase: SupabaseClient): Promise<CmaCanonicalMeasure[]> {
  return callRpc<CmaCanonicalMeasure[]>(supabase, 'call_center_cma_canonical_measures_list');
}

export async function getCanonicalMeasure(supabase: SupabaseClient, canonicalId: string): Promise<CmaCanonicalMeasure | null> {
  return callRpc<CmaCanonicalMeasure | null>(supabase, 'call_center_cma_canonical_measure_get', { p_canonical_id: canonicalId });
}

export async function listCanonicalMeasureOccurrences(supabase: SupabaseClient, canonicalId: string): Promise<CmaMeasureOccurrence[]> {
  return callRpc<CmaMeasureOccurrence[]>(supabase, 'call_center_cma_canonical_measure_occurrences_list', { p_canonical_id: canonicalId });
}

export async function getMeasureOccurrence(supabase: SupabaseClient, measureId: string): Promise<CmaMeasureOccurrence | null> {
  return callRpc<CmaMeasureOccurrence | null>(supabase, 'call_center_cma_measure_get', { p_measure_id: measureId });
}

export async function listDimensions(supabase: SupabaseClient): Promise<CmaDimension[]> {
  return callRpc<CmaDimension[]>(supabase, 'call_center_cma_dimensions_list');
}

export async function getDimension(supabase: SupabaseClient, dimensionId: string): Promise<CmaDimension | null> {
  return callRpc<CmaDimension | null>(supabase, 'call_center_cma_dimension_get', { p_dimension_id: dimensionId });
}

export async function listDimensionsForMeasure(supabase: SupabaseClient, measureId: string): Promise<CmaDimension[]> {
  return callRpc<CmaDimension[]>(supabase, 'call_center_cma_measure_dimensions_list', { p_measure_id: measureId });
}

export interface MeasureBaseFactEntry { baseFact: CmaBaseFact; role: BaseFactRole }

export async function listBaseFactsForMeasure(supabase: SupabaseClient, measureId: string): Promise<MeasureBaseFactEntry[]> {
  return callRpc<MeasureBaseFactEntry[]>(supabase, 'call_center_cma_measure_base_facts_list', { p_measure_id: measureId });
}

export async function listChartVisualizations(supabase: SupabaseClient): Promise<CmaChartVisualization[]> {
  return callRpc<CmaChartVisualization[]>(supabase, 'call_center_cma_chart_visualizations_list');
}

export async function getChartVisualization(supabase: SupabaseClient, chartId: string): Promise<CmaChartVisualization | null> {
  return callRpc<CmaChartVisualization | null>(supabase, 'call_center_cma_chart_visualization_get', { p_chart_id: chartId });
}

export async function getGovernanceStatus(supabase: SupabaseClient): Promise<CmaRegistryGovernanceStatus> {
  return callRpc<CmaRegistryGovernanceStatus>(supabase, 'call_center_cma_registry_governance_status');
}
