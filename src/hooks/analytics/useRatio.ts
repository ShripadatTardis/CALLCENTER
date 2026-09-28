import { useQuery } from '@tanstack/react-query';
import { ratiosKeys } from '@/services/analytics/ratiosKeys';
import {
  fetchRatioBreakdown,
  fetchRatioDrivers,
  fetchRatioInteractions,
  fetchRatioSummary,
  fetchRatioTrend,
} from '@/services/analytics/ratiosService';
import type { RatioFilterState } from '@/types/ratio';

/** Ratio Explorer hooks (Session R1) — the only thing a page/component calls; no fetch/DTO ever touches a component directly. */

export function useRatioSummary(ratioId: string | undefined, filters: RatioFilterState) {
  return useQuery({
    queryKey: ratiosKeys.summary(ratioId ?? '', filters),
    queryFn: () => fetchRatioSummary(ratioId as string, filters),
    enabled: Boolean(ratioId),
  });
}

export function useRatioTrend(ratioId: string | undefined, filters: RatioFilterState) {
  return useQuery({
    queryKey: ratiosKeys.trend(ratioId ?? '', filters),
    queryFn: () => fetchRatioTrend(ratioId as string, filters),
    enabled: Boolean(ratioId),
  });
}

export function useRatioBreakdown(ratioId: string | undefined, by: string | undefined, filters: RatioFilterState) {
  return useQuery({
    queryKey: ratiosKeys.breakdown(ratioId ?? '', by ?? '', filters),
    queryFn: () => fetchRatioBreakdown(ratioId as string, by as string, filters),
    enabled: Boolean(ratioId) && Boolean(by),
  });
}

export function useRatioDrivers(ratioId: string | undefined, filters: RatioFilterState, enabled: boolean) {
  return useQuery({
    queryKey: ratiosKeys.drivers(ratioId ?? '', filters),
    queryFn: () => fetchRatioDrivers(ratioId as string, filters),
    enabled: Boolean(ratioId) && enabled,
  });
}

export function useRatioInteractions(ratioId: string | undefined, filters: RatioFilterState, page: number, pageSize: number, enabled: boolean) {
  return useQuery({
    queryKey: ratiosKeys.interactions(ratioId ?? '', filters, page, pageSize),
    queryFn: () => fetchRatioInteractions(ratioId as string, filters, page, pageSize),
    enabled: Boolean(ratioId) && enabled,
  });
}
