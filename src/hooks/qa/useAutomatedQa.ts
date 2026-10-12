import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  startAutomatedQaEvaluation,
  fetchAutomatedQaEvaluation,
  listAutomatedQaEvaluationsForInteraction,
  listAutomatedQaEvaluations,
  type AutomatedQaEvaluation,
  type AutomatedQaStatus,
} from '@/services/qa/automatedQaService';
import type { QaChannel } from '@/services/qa/qaService';

export const automatedQaKeys = {
  evaluation: (evaluationId: string) => ['automatedQa', 'evaluation', evaluationId] as const,
  forInteraction: (interactionId: string, channel: QaChannel) => ['automatedQa', 'forInteraction', channel, interactionId] as const,
  list: (status?: AutomatedQaStatus) => ['automatedQa', 'list', status ?? 'all'] as const,
};

export function useAutomatedQaEvaluation(evaluationId: string | null) {
  return useQuery({
    queryKey: automatedQaKeys.evaluation(evaluationId ?? ''),
    queryFn: () => fetchAutomatedQaEvaluation(evaluationId as string),
    enabled: Boolean(evaluationId),
  });
}

export function useAutomatedQaEvaluationsForInteraction(interactionId: string | null, channel: QaChannel) {
  return useQuery({
    queryKey: automatedQaKeys.forInteraction(interactionId ?? '', channel),
    queryFn: () => listAutomatedQaEvaluationsForInteraction(interactionId as string, channel),
    enabled: Boolean(interactionId),
  });
}

export function useAutomatedQaEvaluations(status?: AutomatedQaStatus) {
  return useQuery({
    queryKey: automatedQaKeys.list(status),
    queryFn: () => listAutomatedQaEvaluations(status),
  });
}

/** Run Automated QA takes up to ~60s synchronously (brief §13 scope decision — see api/admin.ts); the mutation stays pending for the full duration, the caller shows a progress/spinner state while it's in flight. */
export function useStartAutomatedQaEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interactionId, channel, agentId }: { interactionId: string; channel: QaChannel; agentId: string }) =>
      startAutomatedQaEvaluation(interactionId, channel, agentId),
    onSuccess: (evaluation: AutomatedQaEvaluation) => {
      queryClient.setQueryData(automatedQaKeys.evaluation(evaluation.id), evaluation);
      queryClient.invalidateQueries({ queryKey: automatedQaKeys.forInteraction(evaluation.interactionId, evaluation.channel) });
      queryClient.invalidateQueries({ queryKey: ['automatedQa', 'list'] });
    },
  });
}
