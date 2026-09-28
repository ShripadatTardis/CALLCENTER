import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RatioFilterState } from '@/types/ratio';

/**
 * URL-serializable Ratio Explorer filter/drill state (Session R1, spec
 * §14). Backed by react-router-dom's useSearchParams — no new global
 * store, no redesign of an existing filter pattern (Call Logs/Campaigns
 * use local component state instead; Ratio Explorer's drill journey
 * specifically needs share/revisit/back-button support the spec asks
 * for, which URL state gives for free).
 *
 * Produces exactly docs' example shape:
 * /ratios/arr?range=7d&direction=outbound&campaign=emi-reminder&breakdown=intent&intent=dispute
 */
const KEYS: readonly (keyof RatioFilterState)[] = [
  'range', 'direction', 'channel', 'domain', 'campaign', 'agent', 'intent', 'breakdown', 'breakdownValue', 'driver',
];

export function useRatioFilterState(): {
  filters: RatioFilterState;
  setFilter: (key: keyof RatioFilterState, value: string | undefined) => void;
  clearFilter: (key: keyof RatioFilterState) => void;
  /** Removes breakdown/breakdownValue/driver only — "back" one drill layer without resetting date/direction/campaign/agent/intent context (spec §4.1: "Back navigation removes the latest drill layer; it must not reset the full analysis."). */
  popDrillLayer: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<RatioFilterState>(() => {
    const out: RatioFilterState = {};
    for (const key of KEYS) {
      const v = searchParams.get(key);
      if (v) (out as Record<string, string>)[key] = v;
    }
    return out;
  }, [searchParams]);

  const setFilter = useCallback(
    (key: keyof RatioFilterState, value: string | undefined) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearFilter = useCallback((key: keyof RatioFilterState) => setFilter(key, undefined), [setFilter]);

  const popDrillLayer = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.has('driver')) {
          next.delete('driver');
        } else if (next.has('breakdownValue')) {
          next.delete('breakdownValue');
        } else {
          next.delete('breakdown');
          next.delete('breakdownValue');
          next.delete('driver');
        }
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { filters, setFilter, clearFilter, popDrillLayer };
}
