// Session 10 — real resolver functions for the 6 CMA_NON_AGGREGATE
// canonical measures, each calling one of the 3 real RPCs in
// supabase/migrations/20261021000000_cma_non_aggregate_measures.sql.
// No fabricated values anywhere — an empty/no-match result returns
// `{ kind: 'no_eligible_rows', reason }`, never an invented number.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EvaluationScopeAccess } from './cmaEvaluation.js';
import type { CmaNonAggregateResult } from './cmaEvaluationTypes.js';

export interface NonAggregateWindowRequest {
  window: { from: string; to: string };
  filterAgentId?: string | null;
  datasetId?: string | null;
}

export async function resolveSentimentDistribution(
  supabase: SupabaseClient, access: EvaluationScopeAccess, req: NonAggregateWindowRequest,
): Promise<CmaNonAggregateResult> {
  const { data, error } = await supabase.rpc('call_center_cma_sentiment_distribution', {
    p_started_from: req.window.from, p_started_to: req.window.to,
    p_all_agents: access.allCategories || access.authorizedAgentIds === 'all',
    p_authorized_agent_ids: access.authorizedAgentIds === 'all' ? [] : access.authorizedAgentIds,
    p_filter_agent_id: req.filterAgentId ?? null,
    p_dataset_id: req.datasetId ?? null,
  });
  if (error) throw new Error(`call_center_cma_sentiment_distribution: ${error.message}`);
  const result = data as { status: string; totalPopulation: number; buckets: Array<{ label: string; count: number }> };
  if (result.status !== 'ok' || result.totalPopulation === 0) {
    return { kind: 'no_eligible_rows', reason: 'No voice interactions with a sentiment_score value in this window/scope.' };
  }
  return { kind: 'distribution', buckets: result.buckets, totalPopulation: result.totalPopulation };
}

export async function resolveCorrectiveActionLookup(
  supabase: SupabaseClient, access: EvaluationScopeAccess, id: string,
): Promise<CmaNonAggregateResult> {
  const { data, error } = await supabase.rpc('call_center_cma_corrective_action_lookup', {
    p_id: id,
    p_all_agents: access.allCategories || access.authorizedAgentIds === 'all',
    p_authorized_agent_ids: access.authorizedAgentIds === 'all' ? [] : access.authorizedAgentIds,
  });
  if (error) throw new Error(`call_center_cma_corrective_action_lookup: ${error.message}`);
  const result = data as { status: string; fields?: Record<string, string | number | boolean | null> };
  if (result.status !== 'ok' || !result.fields) {
    return { kind: 'no_eligible_rows', reason: 'No corrective action with this id exists, or it is outside your authorized Agent Scope.' };
  }
  return { kind: 'record_lookup', fields: result.fields };
}

interface CalibrationPairedRow {
  interactionId: string; parameterCode: string;
  humanValue: string | null; automatedValue: string | null; promptVersion: string | null;
}

async function fetchCalibrationPairedRows(
  supabase: SupabaseClient, access: EvaluationScopeAccess, req: NonAggregateWindowRequest,
): Promise<CalibrationPairedRow[]> {
  const { data, error } = await supabase.rpc('call_center_cma_qa_calibration_paired', {
    p_started_from: req.window.from, p_started_to: req.window.to,
    p_all_agents: access.allCategories || access.authorizedAgentIds === 'all',
    p_authorized_agent_ids: access.authorizedAgentIds === 'all' ? [] : access.authorizedAgentIds,
    p_dataset_id: req.datasetId ?? null,
  });
  if (error) throw new Error(`call_center_cma_qa_calibration_paired: ${error.message}`);
  const result = data as { status: string; rows: CalibrationPairedRow[] };
  return result.status === 'ok' ? result.rows : [];
}

/** CALIB-01 — per (interaction, parameter), classify into one of 5 categories. Only rows
 *  present on BOTH sides are classified agree/disagree; one-sided rows are their own category
 *  (never silently dropped, never forced into agree/disagree). */
export async function resolveQaCalibrationPerParameter(
  supabase: SupabaseClient, access: EvaluationScopeAccess, req: NonAggregateWindowRequest,
): Promise<CmaNonAggregateResult> {
  const rows = await fetchCalibrationPairedRows(supabase, access, req);
  if (rows.length === 0) return { kind: 'no_eligible_rows', reason: 'No overlapping Human QA + Automated QA findings in this window/scope.' };
  return {
    kind: 'paired_comparison',
    rows: rows.map((r) => ({
      dimension: `${r.interactionId}:${r.parameterCode}`,
      humanValue: r.humanValue,
      automatedValue: r.automatedValue,
      agreement: r.humanValue === null || r.automatedValue === null ? null : r.humanValue === r.automatedValue,
    })),
  };
}

/** CALIB-02 — per parameter_code, how many interactions had human-only, automated-only, or
 *  both-sides coverage. A distribution, not a ratio. */
export async function resolveQaCalibrationCoverageDivergence(
  supabase: SupabaseClient, access: EvaluationScopeAccess, req: NonAggregateWindowRequest,
): Promise<CmaNonAggregateResult> {
  const rows = await fetchCalibrationPairedRows(supabase, access, req);
  if (rows.length === 0) return { kind: 'no_eligible_rows', reason: 'No overlapping Human QA + Automated QA findings in this window/scope.' };
  const byParam = new Map<string, { both: number; humanOnly: number; automatedOnly: number }>();
  for (const r of rows) {
    const bucket = byParam.get(r.parameterCode) ?? { both: 0, humanOnly: 0, automatedOnly: 0 };
    if (r.humanValue !== null && r.automatedValue !== null) bucket.both += 1;
    else if (r.humanValue !== null) bucket.humanOnly += 1;
    else if (r.automatedValue !== null) bucket.automatedOnly += 1;
    byParam.set(r.parameterCode, bucket);
  }
  const buckets = Array.from(byParam.entries()).flatMap(([param, b]) => [
    { label: `${param}:both`, count: b.both },
    { label: `${param}:human_only`, count: b.humanOnly },
    { label: `${param}:automated_only`, count: b.automatedOnly },
  ]);
  return { kind: 'distribution', buckets, totalPopulation: rows.length };
}

/** CALIB-03 — disagreement rate grouped by the automated evaluation's prompt_version, over
 *  the both-sides-covered population only (a disagreement rate needs both values present). */
export async function resolveQaCalibrationPromptVersionDisagreement(
  supabase: SupabaseClient, access: EvaluationScopeAccess, req: NonAggregateWindowRequest,
): Promise<CmaNonAggregateResult> {
  const rows = await fetchCalibrationPairedRows(supabase, access, req);
  const both = rows.filter((r) => r.humanValue !== null && r.automatedValue !== null && r.promptVersion !== null);
  if (both.length === 0) return { kind: 'no_eligible_rows', reason: 'No both-sides-covered, prompt-version-tagged findings in this window/scope.' };
  const byVersion = new Map<string, { agree: number; disagree: number }>();
  for (const r of both) {
    const key = r.promptVersion as string;
    const bucket = byVersion.get(key) ?? { agree: 0, disagree: 0 };
    if (r.humanValue === r.automatedValue) bucket.agree += 1; else bucket.disagree += 1;
    byVersion.set(key, bucket);
  }
  return {
    kind: 'paired_comparison',
    rows: Array.from(byVersion.entries()).map(([version, b]) => ({
      dimension: version,
      humanValue: `${b.agree} agree`,
      automatedValue: `${b.disagree} disagree`,
      agreement: b.disagree === 0,
    })),
  };
}
