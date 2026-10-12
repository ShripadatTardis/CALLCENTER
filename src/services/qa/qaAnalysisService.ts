import { request } from '@/services/transport/httpClient';
import type { QaChannel } from './qaService';
import type { QaAnalysisFinding, QaAnalysisReview } from '@/lib/qaAnalysis';

/**
 * Session 16.2 — thin service layer over the consolidated /api/admin
 * route (`?resource=qa&action=findings|population`), same 12-function
 * Hobby-plan ceiling reason as every other admin.ts resource. Gated
 * server-side on `qa.analytics.view` (api/admin.ts), distinct from
 * `qa.review`.
 */

export interface QaAnalysisFilterParams {
  channel?: QaChannel;
  dateFrom?: string;
  dateTo?: string;
  reviewerUserId?: string;
}

export async function fetchQaAnalysisFindings(filters: QaAnalysisFilterParams = {}): Promise<QaAnalysisFinding[]> {
  const res = await request<{ data: QaAnalysisFinding[] }>('/admin', {
    query: { resource: 'qa', action: 'findings', ...filters },
  });
  return res.data;
}

export async function fetchQaAnalysisPopulation(filters: QaAnalysisFilterParams = {}): Promise<QaAnalysisReview[]> {
  const res = await request<{ data: QaAnalysisReview[] }>('/admin', {
    query: { resource: 'qa', action: 'population', ...filters },
  });
  return res.data;
}
