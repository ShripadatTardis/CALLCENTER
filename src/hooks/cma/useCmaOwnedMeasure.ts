import { useQuery } from '@tanstack/react-query';
import { fetchCmaOwnedMeasure } from '@/services/cma/cmaEvaluationService';

/**
 * Session 10 — the single hook every screen uses to ask CMA for a
 * measure's ownership + (optionally) its live value, replacing any
 * screen-local calculation for a measure CMA now owns. `enabled` should
 * be true whenever the viewer holds `cma.evaluate` for a live request;
 * a static-only (no `live`) call works for any authenticated viewer
 * (ownership metadata itself is not sensitive).
 */
export function useCmaOwnedMeasure(
  enabled: boolean,
  canonicalMeasureId: string,
  live?: { from: string; to: string; datasetId?: string | null; recordId?: string; agent?: string },
) {
  return useQuery({
    queryKey: ['cma', 'owned', canonicalMeasureId, live?.from, live?.to, live?.datasetId ?? null, live?.recordId ?? null, live?.agent ?? null],
    queryFn: () => fetchCmaOwnedMeasure(canonicalMeasureId, live),
    enabled,
  });
}
