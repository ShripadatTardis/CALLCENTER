import { request } from '@/services/transport/httpClient';
import type { QaParameterCode, QaResultValue } from '@/lib/qaParameters';

/**
 * Session 16.1 — Manual QA Review. Thin service layer over the
 * consolidated /api/admin route (`?resource=qa`), same 12-function
 * Hobby-plan ceiling reason as actionsService.ts (see adminService.ts).
 */

export type QaChannel = 'voice' | 'chat';
export type QaReviewStatus = 'in_progress' | 'submitted';
export type QaTurnReviewStatus = 'not_reviewed' | 'good' | 'flagged' | 'na';

export interface QaFinding {
  id: string;
  reviewId: string;
  parameterCode: QaParameterCode;
  value: QaResultValue;
  primaryTurnId: string;
  evidenceTurnIds: string[];
  reasonCode: string | null;
  note: string | null;
  createdAt: string;
}

export interface QaTurnReview {
  id: string;
  reviewId: string;
  turnId: string;
  role: 'agent' | 'customer';
  status: QaTurnReviewStatus;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RequestCompletion = 'YES' | 'PARTIAL' | 'NO' | 'CANNOT_DETERMINE';
export type QaFcr = 'YES' | 'NO' | 'CANNOT_DETERMINE';
export type HumanAssistanceRequired = 'YES' | 'NO' | 'CANNOT_DETERMINE';

export interface QaReview {
  id: string;
  interactionId: string;
  channel: QaChannel;
  agentId: string;
  reviewerUserId: string;
  status: QaReviewStatus;
  startedAt: string;
  submittedAt: string | null;
  requestCompletion: RequestCompletion | null;
  fcr: QaFcr | null;
  humanAssistanceRequired: HumanAssistanceRequired | null;
  businessOutcome: string | null;
  reviewerNote: string | null;
  contractVersion: string;
  turnReviews: QaTurnReview[];
  findings: QaFinding[];
}

export interface QaFindingInput {
  parameterCode: QaParameterCode;
  value: QaResultValue;
  evidenceTurnIds: string[];
  reasonCode: string | null;
  note: string | null;
}

export async function startQaReview(interactionId: string, channel: QaChannel, agentId: string): Promise<QaReview> {
  const res = await request<{ data: QaReview }>('/admin', {
    method: 'POST',
    query: { resource: 'qa', action: 'start' },
    body: { interactionId, channel, agentId },
  });
  return res.data;
}

export async function fetchQaReview(reviewId: string): Promise<QaReview> {
  const res = await request<{ data: QaReview }>('/admin', {
    query: { resource: 'qa', action: 'review', reviewId },
  });
  return res.data;
}

export async function listQaReviewsForInteraction(interactionId: string, channel: QaChannel): Promise<QaReview[]> {
  const res = await request<{ data: QaReview[] }>('/admin', {
    query: { resource: 'qa', action: 'listForInteraction', interactionId, channel },
  });
  return res.data;
}

export async function initQaReviewTurns(
  reviewId: string,
  turns: Array<{ turnId: string; role: 'agent' | 'customer' }>,
): Promise<QaReview> {
  const res = await request<{ data: QaReview }>('/admin', {
    method: 'POST',
    query: { resource: 'qa', action: 'initTurns' },
    body: { reviewId, turns },
  });
  return res.data;
}

export async function submitQaTurn(params: {
  reviewId: string;
  turnId: string;
  role: 'agent' | 'customer';
  status: QaTurnReviewStatus;
  findings: QaFindingInput[];
}): Promise<QaReview> {
  const res = await request<{ data: QaReview }>('/admin', {
    method: 'POST',
    query: { resource: 'qa', action: 'submitTurn' },
    body: params,
  });
  return res.data;
}

export async function setQaReviewConclusions(params: {
  reviewId: string;
  requestCompletion: RequestCompletion | null;
  fcr: QaFcr | null;
  humanAssistanceRequired: HumanAssistanceRequired | null;
  businessOutcome: string | null;
  reviewerNote: string | null;
}): Promise<QaReview> {
  const res = await request<{ data: QaReview }>('/admin', {
    method: 'POST',
    query: { resource: 'qa', action: 'setConclusions' },
    body: params,
  });
  return res.data;
}

export async function submitQaReview(reviewId: string): Promise<QaReview> {
  const res = await request<{ data: QaReview }>('/admin', {
    method: 'POST',
    query: { resource: 'qa', action: 'submit' },
    body: { reviewId },
  });
  return res.data;
}
