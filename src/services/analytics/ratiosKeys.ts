import type { RatioFilterState } from '@/types/ratio';

/**
 * Query key factory for the Ratio Explorer (Session R1) — filter-aware,
 * per spec §5 "Performance: Ratio queries use filter-aware query keys."
 */
export const ratiosKeys = {
  all: ['ratios'] as const,
  summary: (ratioId: string, filters: RatioFilterState) => [...ratiosKeys.all, 'summary', ratioId, filters] as const,
  trend: (ratioId: string, filters: RatioFilterState) => [...ratiosKeys.all, 'trend', ratioId, filters] as const,
  breakdown: (ratioId: string, by: string, filters: RatioFilterState) => [...ratiosKeys.all, 'breakdown', ratioId, by, filters] as const,
  drivers: (ratioId: string, filters: RatioFilterState) => [...ratiosKeys.all, 'drivers', ratioId, filters] as const,
  interactions: (ratioId: string, filters: RatioFilterState, page: number, pageSize: number) =>
    [...ratiosKeys.all, 'interactions', ratioId, filters, page, pageSize] as const,
};
