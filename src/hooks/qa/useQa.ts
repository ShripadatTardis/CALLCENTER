import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  startQaReview,
  fetchQaReview,
  listQaReviewsForInteraction,
  initQaReviewTurns,
  submitQaTurn,
  setQaReviewConclusions,
  submitQaReview,
  type QaChannel,
  type QaReview,
  type QaFindingInput,
  type QaTurnReviewStatus,
  type RequestCompletion,
  type QaFcr,
  type HumanAssistanceRequired,
} from '@/services/qa/qaService';

export const qaKeys = {
  review: (reviewId: string) => ['qa', 'review', reviewId] as const,
  forInteraction: (interactionId: string, channel: QaChannel) => ['qa', 'forInteraction', channel, interactionId] as const,
};

export function useQaReviewsForInteraction(interactionId: string | null, channel: QaChannel) {
  return useQuery({
    queryKey: qaKeys.forInteraction(interactionId ?? '', channel),
    queryFn: () => listQaReviewsForInteraction(interactionId as string, channel),
    enabled: Boolean(interactionId),
  });
}

export function useQaReview(reviewId: string | null) {
  return useQuery({
    queryKey: qaKeys.review(reviewId ?? ''),
    queryFn: () => fetchQaReview(reviewId as string),
    enabled: Boolean(reviewId),
  });
}

function putReview(queryClient: ReturnType<typeof useQueryClient>, review: QaReview) {
  queryClient.setQueryData(qaKeys.review(review.id), review);
}

export function useStartQaReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interactionId, channel, agentId }: { interactionId: string; channel: QaChannel; agentId: string }) =>
      startQaReview(interactionId, channel, agentId),
    onSuccess: (review) => putReview(queryClient, review),
  });
}

export function useInitQaReviewTurns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, turns }: { reviewId: string; turns: Array<{ turnId: string; role: 'agent' | 'customer' }> }) =>
      initQaReviewTurns(reviewId, turns),
    onSuccess: (review) => putReview(queryClient, review),
  });
}

export function useSubmitQaTurn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { reviewId: string; turnId: string; role: 'agent' | 'customer'; status: QaTurnReviewStatus; findings: QaFindingInput[] }) =>
      submitQaTurn(params),
    onSuccess: (review) => putReview(queryClient, review),
  });
}

export function useSetQaReviewConclusions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      reviewId: string;
      requestCompletion: RequestCompletion | null;
      fcr: QaFcr | null;
      humanAssistanceRequired: HumanAssistanceRequired | null;
      businessOutcome: string | null;
      reviewerNote: string | null;
    }) => setQaReviewConclusions(params),
    onSuccess: (review) => putReview(queryClient, review),
  });
}

export function useSubmitQaReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => submitQaReview(reviewId),
    onSuccess: (review) => putReview(queryClient, review),
  });
}
