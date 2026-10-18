import { useQueries } from '@tanstack/react-query';
import { evaluateCmaMeasure } from '@/services/cma/cmaEvaluationService';
import type { CmaMeasureRequest, CmaMeasureResponse } from '@/types/cma';

/**
 * Session 4D — batches several CMA evaluations behind one `useQueries`
 * call (e.g. Human QA Quality Explorer's 9 parameter tiles) so they fetch
 * in parallel, each independently cached exactly like a single
 * `useCmaMeasure` call would be (same query key shape) — never an N+1
 * waterfall, never a bespoke combined endpoint.
 */
export function useCmaMeasures(enabled: boolean, reqs: CmaMeasureRequest[]) {
  return useQueries({
    queries: reqs.map((req) => ({
      queryKey: [
        'cma', 'evaluate', req.canonicalMeasureId, req.window.from, req.window.to,
        req.filters?.agent, req.filters?.channel, req.filters?.campaign, req.groupBy, req.qaPopulation,
      ],
      queryFn: (): Promise<CmaMeasureResponse> => evaluateCmaMeasure(req),
      enabled,
    })),
  });
}
