import { useQuery } from '@tanstack/react-query';
import { fetchQaAnalysisFindings, fetchQaAnalysisPopulation, type QaAnalysisFilterParams } from '@/services/qa/qaAnalysisService';

/**
 * Session 16.2 — one bulk fetch each for findings and the review
 * population (both already server-filtered by Agent Scope and the
 * caller's date/channel/reviewer params), not a request per metric —
 * every ratio/trend/reason/agent breakdown the Explorer shows is then
 * computed client-side from these two arrays via src/lib/qaAnalysis.ts.
 * This matches §22's "prefer server-side aggregation, avoid N+1" intent
 * for a dataset this bounded (findings/reviews, never raw transcripts)
 * — the same pattern the existing Ratio Explorer already uses for its
 * own bounded row-sets.
 */
export function useQaAnalysisFindings(filters: QaAnalysisFilterParams) {
  return useQuery({
    queryKey: ['qa', 'analysis', 'findings', filters],
    queryFn: () => fetchQaAnalysisFindings(filters),
  });
}

export function useQaAnalysisPopulation(filters: QaAnalysisFilterParams) {
  return useQuery({
    queryKey: ['qa', 'analysis', 'population', filters],
    queryFn: () => fetchQaAnalysisPopulation(filters),
  });
}
