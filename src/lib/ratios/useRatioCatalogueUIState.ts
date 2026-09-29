import { useCallback, useState } from 'react';
import type { RatioAvailability } from '@/types/ratio';

/**
 * Session R4.2 — Ratio Catalogue collapsible-family + status-filter UI
 * state. Deliberately sessionStorage-backed, NOT URL search params: the
 * spec asks only to "preserve expansion state while the user remains in
 * Ratio Explorer" (a session-scoped concern), not to make it
 * bookmarkable/shareable — URL state remains reserved for which ratio
 * is open (`/ratios/:ratioId`, unchanged) and its drill filters
 * (`ratioFilterState.ts`, unchanged). sessionStorage also survives a
 * route change between `/ratios` and `/ratios/:ratioId` regardless of
 * whether React Router happens to remount the page component for that
 * transition — a version-independent guarantee `useState` alone
 * wouldn't give across two distinct route entries.
 */

export type RatioStatusFilter = 'all' | RatioAvailability;

const STORAGE_KEY = 'ratioCatalogueUIState.v1';
const DEFAULT_EXPANDED = ['operations'];

interface StoredState {
  expanded: string[];
  status: RatioStatusFilter;
}

function readStored(): StoredState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { expanded: DEFAULT_EXPANDED, status: 'all' };
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      expanded: Array.isArray(parsed.expanded) ? parsed.expanded : DEFAULT_EXPANDED,
      status: typeof parsed.status === 'string' ? (parsed.status as RatioStatusFilter) : 'all',
    };
  } catch {
    return { expanded: DEFAULT_EXPANDED, status: 'all' };
  }
}

function writeStored(state: StoredState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private-window/blocked storage — catalogue still works, just doesn't persist. Never crash the page over this.
  }
}

export function useRatioCatalogueUIState(): {
  expandedFamilies: Set<string>;
  toggleFamily: (family: string) => void;
  statusFilter: RatioStatusFilter;
  setStatusFilter: (status: RatioStatusFilter) => void;
} {
  const [state, setState] = useState<StoredState>(readStored);

  const toggleFamily = useCallback((family: string) => {
    setState((prev) => {
      const isExpanded = prev.expanded.includes(family);
      const next: StoredState = {
        ...prev,
        expanded: isExpanded ? prev.expanded.filter((f) => f !== family) : [...prev.expanded, family],
      };
      writeStored(next);
      return next;
    });
  }, []);

  const setStatusFilter = useCallback((status: RatioStatusFilter) => {
    setState((prev) => {
      const next: StoredState = { ...prev, status };
      writeStored(next);
      return next;
    });
  }, []);

  return {
    expandedFamilies: new Set(state.expanded),
    toggleFamily,
    statusFilter: state.status,
    setStatusFilter,
  };
}
