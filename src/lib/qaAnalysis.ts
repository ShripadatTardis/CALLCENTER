import { QA_PARAMETER_CODES, QA_PARAMETERS, type QaParameterCode, type QaResultValue } from './qaParameters';
import { computeQaRatios, type QaRatioResult } from './qaRatios';

/**
 * Session 16.2 — pure, deterministic aggregation for the Human QA
 * Quality Explorer. Operates over an already-fetched, already-scoped
 * (Agent Scope, submitted-only) set of findings/reviews — no DB access
 * here, matching this codebase's established "pure lib + thin API"
 * convention (qaRatios.ts, qaApplicability.ts, qaExceptionEditor.ts).
 *
 * Per the Measurement Contract and the 16.2 brief's explicit
 * correctness requirements (§6-§9): ratio math itself is NOT
 * reimplemented here — computeQaRatios (qaRatios.ts, already tested in
 * Session 16.1) already gets every one of these right: N_A excluded
 * from every denominator, CANNOT_VERIFY additionally excluded from
 * response_grounding_rate's denominator, repetition_loop_rate rolled up
 * to one assessment per REVIEW (interaction-level) rather than counted
 * per turn. This module only adds the SCOPE this data needs to be
 * trustworthy: filtering, reason-code distribution, per-agent
 * breakdown, time-bucketed trends, review-population/coverage, and
 * interaction-level outcome aggregation — all built on that same
 * verified ratio function, never a second ratio formula.
 */

export interface QaAnalysisFinding {
  id: string;
  reviewId: string;
  parameterCode: QaParameterCode;
  value: QaResultValue;
  reasonCode: string | null;
  primaryTurnId: string;
  evidenceTurnIds: string[];
  note: string | null;
  createdAt: string;
  channel: 'voice' | 'chat';
  agentId: string;
  interactionId: string;
  reviewerUserId: string;
  submittedAt: string;
}

export type QaReviewStatus = 'in_progress' | 'submitted';

export interface QaAnalysisReview {
  id: string;
  interactionId: string;
  channel: 'voice' | 'chat';
  agentId: string;
  reviewerUserId: string;
  status: QaReviewStatus;
  startedAt: string;
  submittedAt: string | null;
  requestCompletion: 'YES' | 'PARTIAL' | 'NO' | 'CANNOT_DETERMINE' | null;
  fcr: 'YES' | 'NO' | 'CANNOT_DETERMINE' | null;
  humanAssistanceRequired: 'YES' | 'NO' | 'CANNOT_DETERMINE' | null;
  businessOutcome: string | null;
}

export interface QaAnalysisFilters {
  channel?: 'voice' | 'chat';
  agentId?: string;
  reviewerUserId?: string;
  /** Applied to each finding's/review's submittedAt — see docs/HUMAN_QA_QUALITY_EXPLORER.md's "Date semantics" section for why submission date, not interaction date, is this Explorer's date field. */
  dateFrom?: string;
  dateTo?: string;
}

function inRange(iso: string | null, dateFrom?: string, dateTo?: string): boolean {
  if (!iso) return false;
  if (dateFrom && iso < dateFrom) return false;
  if (dateTo && iso > dateTo) return false;
  return true;
}

export function filterFindings(findings: QaAnalysisFinding[], filters: QaAnalysisFilters): QaAnalysisFinding[] {
  return findings.filter((f) => {
    if (filters.channel && f.channel !== filters.channel) return false;
    if (filters.agentId && f.agentId !== filters.agentId) return false;
    if (filters.reviewerUserId && f.reviewerUserId !== filters.reviewerUserId) return false;
    if ((filters.dateFrom || filters.dateTo) && !inRange(f.submittedAt, filters.dateFrom, filters.dateTo)) return false;
    return true;
  });
}

export function filterReviews(reviews: QaAnalysisReview[], filters: QaAnalysisFilters): QaAnalysisReview[] {
  return reviews.filter((r) => {
    if (filters.channel && r.channel !== filters.channel) return false;
    if (filters.agentId && r.agentId !== filters.agentId) return false;
    if (filters.reviewerUserId && r.reviewerUserId !== filters.reviewerUserId) return false;
    if (filters.dateFrom || filters.dateTo) {
      // Population rows are date-filtered on startedAt server-side
      // (so in-progress reviews, which have no submittedAt, aren't
      // silently dropped from "reviews in progress" counts); a
      // submitted-only consumer should pre-filter to status==='submitted'
      // and use submittedAt via inRange itself where exact submission-date
      // filtering matters.
      if (!inRange(r.startedAt, filters.dateFrom, filters.dateTo)) return false;
    }
    return true;
  });
}

/**
 * §10 — policy, documented: "reviewed interactions" / coverage counts
 * DISTINCT interaction_id among SUBMITTED reviews (a second independent
 * review of the same interaction — the calibration case this schema
 * explicitly supports — still counts that interaction once here).
 * Parameter ratios (computeQaRatios) deliberately do NOT apply this
 * dedup — every submitted review's findings are independently real
 * measurements and both count.
 */
export function reviewedInteractionsCount(reviews: QaAnalysisReview[]): number {
  const submitted = reviews.filter((r) => r.status === 'submitted');
  return new Set(submitted.map((r) => `${r.channel}:${r.interactionId}`)).size;
}

export interface QaCoveragePopulation {
  submittedReviewsCount: number;
  inProgressReviewsCount: number;
  reviewedInteractionsCount: number;
  findingsCount: number;
}

export function computeCoveragePopulation(reviews: QaAnalysisReview[], findings: QaAnalysisFinding[]): QaCoveragePopulation {
  return {
    submittedReviewsCount: reviews.filter((r) => r.status === 'submitted').length,
    inProgressReviewsCount: reviews.filter((r) => r.status === 'in_progress').length,
    reviewedInteractionsCount: reviewedInteractionsCount(reviews),
    findingsCount: findings.length,
  };
}

/** null (not 0%) when eligibleInteractions is 0 or not supplied — §11/§13: never fabricate a coverage percentage with no real denominator. */
export function computeCoverageRate(reviewedInteractions: number, eligibleInteractions: number | null): number | null {
  if (eligibleInteractions === null || eligibleInteractions === 0) return null;
  return reviewedInteractions / eligibleInteractions;
}

export interface QaReasonCount {
  parameterCode: QaParameterCode;
  reasonCode: string;
  count: number;
}

/**
 * §15 — only PROBLEM-direction findings have a reason code at all
 * (requiresReasonCode), so grouping on reasonCode !== null already
 * restricts this to genuine failures — a clean/PASS finding never has
 * one. Counts here are FINDING counts (one reviewed turn/opportunity
 * each); labeled as such by the UI, never presented as "affected
 * interactions" (§15's explicit warning) — reasonCodeCountsByInteraction
 * below exists separately for when that different unit is needed.
 */
export function reasonCodeDistribution(findings: QaAnalysisFinding[], parameterCode?: QaParameterCode): QaReasonCount[] {
  const scoped = parameterCode ? findings.filter((f) => f.parameterCode === parameterCode) : findings;
  const counts = new Map<string, number>();
  for (const f of scoped) {
    if (!f.reasonCode) continue;
    const key = `${f.parameterCode}\u0000${f.reasonCode}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => {
      const [code, reasonCode] = key.split('\u0000');
      return { parameterCode: code as QaParameterCode, reasonCode, count };
    })
    .sort((a, b) => b.count - a.count);
}

/** The distinct-interaction count behind a given parameter+reason combination — the "affected interactions" unit §15 warns not to conflate with the finding count above. */
export function reasonCodeAffectedInteractions(findings: QaAnalysisFinding[], parameterCode: QaParameterCode, reasonCode: string): number {
  const matching = findings.filter((f) => f.parameterCode === parameterCode && f.reasonCode === reasonCode);
  return new Set(matching.map((f) => `${f.channel}:${f.interactionId}`)).size;
}

export interface QaAgentAggregate {
  agentId: string;
  reviewedInteractionsCount: number;
  ratios: Record<QaParameterCode, QaRatioResult>;
}

/** §18 — every agent's ratios come from computeQaRatios over ONLY that agent's own findings, so each percentage keeps its own real denominator; reviewedInteractionsCount is shown alongside every row so a 6-review agent is never visually equated with a 45-review one. */
export function agentAggregation(findings: QaAnalysisFinding[], reviews: QaAnalysisReview[]): QaAgentAggregate[] {
  const agentIds = new Set<string>([...findings.map((f) => f.agentId), ...reviews.filter((r) => r.status === 'submitted').map((r) => r.agentId)]);
  return Array.from(agentIds)
    .map((agentId) => ({
      agentId,
      reviewedInteractionsCount: reviewedInteractionsCount(reviews.filter((r) => r.agentId === agentId)),
      ratios: computeQaRatios(findings.filter((f) => f.agentId === agentId)),
    }))
    .sort((a, b) => b.reviewedInteractionsCount - a.reviewedInteractionsCount);
}

export type QaTrendGranularity = 'week' | 'month';

export interface QaTrendBucket {
  /** ISO date of the bucket's start (Monday for week, 1st for month), in UTC. */
  periodStart: string;
  numerator: number;
  denominator: number;
  rate: number | null;
  reviewedInteractionsCount: number;
}

function bucketStart(iso: string, granularity: QaTrendGranularity): string {
  const d = new Date(iso);
  if (granularity === 'month') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
  }
  // Week bucket — Monday start (ISO week), UTC.
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  return monday.toISOString().slice(0, 10);
}

/**
 * §17 — one bucket per period with its OWN numerator/denominator/rate,
 * computed via the same computeQaRatios used everywhere else in this
 * module (never a parallel "rough" trend formula). A period with zero
 * eligible observations gets rate=null ("No eligible population"),
 * never a fabricated 0% — the caller renders that distinctly, never
 * plots it as if quality collapsed. Buckets with no data are simply
 * absent from the result — never interpolated or smoothed in.
 */
export function trendBuckets(
  findings: QaAnalysisFinding[],
  reviews: QaAnalysisReview[],
  parameterCode: QaParameterCode,
  granularity: QaTrendGranularity,
): QaTrendBucket[] {
  const submittedReviews = reviews.filter((r) => r.status === 'submitted' && r.submittedAt);
  const periods = new Set<string>();
  for (const f of findings) periods.add(bucketStart(f.submittedAt, granularity));
  for (const r of submittedReviews) periods.add(bucketStart(r.submittedAt as string, granularity));

  return Array.from(periods)
    .sort()
    .map((periodStart) => {
      const periodFindings = findings.filter((f) => bucketStart(f.submittedAt, granularity) === periodStart);
      const periodReviews = submittedReviews.filter((r) => bucketStart(r.submittedAt as string, granularity) === periodStart);
      const ratio = computeQaRatios(periodFindings)[parameterCode];
      return {
        periodStart,
        numerator: ratio.numerator,
        denominator: ratio.denominator,
        rate: ratio.rate,
        reviewedInteractionsCount: reviewedInteractionsCount(periodReviews),
      };
    });
}

export interface QaOutcomeBreakdown<V extends string> {
  counts: Partial<Record<V, number>>;
  /** Reviews where this field was never set (left null) — excluded from `counts`, shown separately so an un-answered conclusion is never silently folded into any one answer. */
  notSet: number;
  total: number;
}

function breakdownField<V extends string>(reviews: QaAnalysisReview[], field: 'requestCompletion' | 'fcr' | 'humanAssistanceRequired'): QaOutcomeBreakdown<V> {
  const submitted = reviews.filter((r) => r.status === 'submitted');
  const counts: Partial<Record<V, number>> = {};
  let notSet = 0;
  for (const r of submitted) {
    const value = r[field] as V | null;
    if (value === null) { notSet += 1; continue; }
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return { counts, notSet, total: submitted.length };
}

/**
 * §19 — these are Human QA JUDGMENTS captured at review time, not Voice
 * Agent API facts; kept as their own breakdown, never blended into
 * computeQaRatios' 9-parameter output. PARTIAL and CANNOT_DETERMINE are
 * their own buckets, never folded into YES (the brief's explicit
 * warning).
 */
export function interactionOutcomeAggregation(reviews: QaAnalysisReview[]) {
  return {
    requestCompletion: breakdownField<'YES' | 'PARTIAL' | 'NO' | 'CANNOT_DETERMINE'>(reviews, 'requestCompletion'),
    fcr: breakdownField<'YES' | 'NO' | 'CANNOT_DETERMINE'>(reviews, 'fcr'),
    humanAssistanceRequired: breakdownField<'YES' | 'NO' | 'CANNOT_DETERMINE'>(reviews, 'humanAssistanceRequired'),
  };
}

export { QA_PARAMETER_CODES, QA_PARAMETERS };
