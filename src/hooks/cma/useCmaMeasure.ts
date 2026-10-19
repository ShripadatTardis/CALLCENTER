import { useQuery } from '@tanstack/react-query';
import { evaluateCmaMeasure } from '@/services/cma/cmaEvaluationService';
import type { CmaMeasureRequest } from '@/types/cma';

/**
 * Session CMA-4A. `enabled` must be false whenever the viewer lacks
 * `cma.evaluate` (checked by the caller via `hasPermission`) — this hook
 * does not itself decide whether the request should be attempted.
 */
export function useCmaMeasure(enabled: boolean, req: CmaMeasureRequest) {
  return useQuery({
    queryKey: [
      'cma', 'evaluate', req.canonicalMeasureId, req.window.from, req.window.to,
      req.filters?.agent, req.filters?.channel, req.filters?.campaign, req.groupBy, req.qaPopulation, req.datasetId ?? null,
    ],
    queryFn: () => evaluateCmaMeasure(req),
    enabled,
  });
}
