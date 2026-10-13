import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQaAnalysisPopulation } from './useQaAnalysis';
import { useAutomatedQaEvaluations } from './useAutomatedQa';
import { useQaReview } from './useQa';
import { useAutomatedQaEvaluation } from './useAutomatedQa';
import { fetchQaReview } from '@/services/qa/qaService';
import { fetchAutomatedQaEvaluation } from '@/services/qa/automatedQaService';
import {
  findPairCandidates, compareAssessments, type QaPairCandidate, type QaComparisonResult,
} from '@/lib/qaComparison';

/**
 * Session 16.4 — QA Calibration data layer. Deliberately adds NO new API
 * route or RPC: every fetch here goes through endpoints that already
 * existed and were already Agent-Scope/permission-enforced server-side
 * before this session (qa.analytics.view for the Human population,
 * qa.automated.view for Automated evaluations/evaluation detail,
 * qa.review-or-analytics.view for a single review's detail). This module
 * only composes them and runs the pure comparison engine
 * (src/lib/qaComparison.ts) over the results — "reuse existing services,
 * do not create a second measurement engine" (brief Part A).
 */

/** Every interaction with at least one submitted Human review AND one eligible (completed/partial) Automated evaluation, within the caller's own Agent Scope (enforced server-side by the two underlying endpoints this composes). */
export function useQaPairCandidates() {
  const population = useQaAnalysisPopulation({});
  const evaluations = useAutomatedQaEvaluations();

  const candidates = useMemo<QaPairCandidate[]>(() => {
    if (!population.data || !evaluations.data) return [];
    return findPairCandidates(
      population.data.map((r) => ({ id: r.id, interactionId: r.interactionId, channel: r.channel, agentId: r.agentId, status: r.status, submittedAt: r.submittedAt, reviewerUserId: r.reviewerUserId })),
      evaluations.data.map((e) => ({ id: e.id, interactionId: e.interactionId, channel: e.channel, agentId: e.agentId, status: e.status, completedAt: e.completedAt, createdAt: e.createdAt, promptVersion: e.promptVersion, modelId: e.modelId })),
    );
  }, [population.data, evaluations.data]);

  return { candidates, isLoading: population.isLoading || evaluations.isLoading, isError: population.isError || evaluations.isError };
}

/** Full detail + comparison for one SPECIFIC, user-selected (reviewId, evaluationId) pair — never assumed to be "the latest" (brief B2). */
export function useQaComparisonDetail(reviewId: string | null, evaluationId: string | null) {
  const review = useQaReview(reviewId);
  const evaluation = useAutomatedQaEvaluation(evaluationId);

  const comparison = useMemo<QaComparisonResult | null>(() => {
    if (!review.data || !evaluation.data) return null;
    return compareAssessments(review.data, evaluation.data);
  }, [review.data, evaluation.data]);

  return {
    review: review.data ?? null,
    evaluation: evaluation.data ?? null,
    comparison,
    isLoading: review.isLoading || evaluation.isLoading,
    isError: review.isError || evaluation.isError,
  };
}

export interface QaCalibrationBatchEntry {
  candidate: QaPairCandidate;
  reviewId: string;
  evaluationId: string;
  promptVersion: string;
  comparison: QaComparisonResult;
}

/**
 * Bounded batch comparison for the dashboard's Summary (D1) and Insights
 * (Part E) — one comparison per pair candidate, using each side's own
 * LATEST eligible record (a defensible, documented default for an
 * aggregate view; the drill-down view lets the user pick any historical
 * version instead — see QaCalibration.tsx). Capped at `limit` candidates
 * (oldest-interaction-first dropped, newest kept) to avoid an unbounded
 * fan-out of detail fetches on a page that otherwise needs none —
 * documented in docs/QA_CALIBRATION_COMPARISON.md as a scale-appropriate
 * choice for this project's current data volume, not a hidden cap.
 */
export function useQaCalibrationBatch(candidates: QaPairCandidate[], limit = 50) {
  const bounded = useMemo(() => candidates.slice(0, limit), [candidates, limit]);
  const key = useMemo(() => bounded.map((c) => `${c.reviews[0].id}:${c.evaluations[0].id}`), [bounded]);

  const query = useQuery({
    queryKey: ['qa', 'calibration', 'batch', key],
    queryFn: async (): Promise<QaCalibrationBatchEntry[]> => {
      const results = await Promise.all(
        bounded.map(async (candidate) => {
          const reviewId = candidate.reviews[0].id;
          const evaluationId = candidate.evaluations[0].id;
          const [review, evaluation] = await Promise.all([fetchQaReview(reviewId), fetchAutomatedQaEvaluation(evaluationId)]);
          return {
            candidate, reviewId, evaluationId, promptVersion: evaluation.promptVersion,
            comparison: compareAssessments(review, evaluation),
          };
        }),
      );
      return results;
    },
    enabled: bounded.length > 0,
  });

  return { entries: query.data ?? [], isLoading: query.isLoading, isError: query.isError, truncated: candidates.length > limit };
}
