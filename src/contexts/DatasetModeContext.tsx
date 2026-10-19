import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth, hasPermission } from '@/contexts/AuthContext';

/**
 * Session 7.1 Part E — NORMAL/TEST dataset mode, app-wide.
 *
 * NORMAL (the default, and the only mode an unauthorized viewer can
 * ever reach): real operational data only (`dataset_id is null` on
 * every CMA RPC this engine calls — see
 * supabase/migrations/20261113000000_cma_dataset_isolation.sql).
 *
 * TEST: only the CMA_POC_500_V1 synthetic population, never mixed with
 * NORMAL data. Gated on the existing `cma.evaluate` permission — the
 * same permission that already controls whether a viewer can see any
 * CMA measure at all, reused rather than inventing a new permission
 * key (brief: "Do not change existing role permissions without
 * explicit authorization").
 *
 * Persisted per-tab via sessionStorage so navigating between screens
 * (and a reload within the same tab) keeps the selection, without
 * silently surviving a full logout/login as a stale selection would.
 */

export type DatasetMode = 'normal' | 'test';

/** The one synthetic dataset this mechanism knows about (Session 7-T). */
export const CMA_TEST_DATASET_ID = 'CMA_POC_500_V1';

const STORAGE_KEY = 'callcentre.datasetMode';

interface DatasetModeContextValue {
  mode: DatasetMode;
  /** null in NORMAL mode, CMA_TEST_DATASET_ID in TEST mode — pass straight into any CmaMeasureRequest.datasetId / QaAnalysisFilterParams.datasetId. */
  datasetId: string | null;
  /** Whether the current viewer is even allowed to select TEST mode. */
  canUseTestMode: boolean;
  setMode: (mode: DatasetMode) => void;
}

const DatasetModeContext = createContext<DatasetModeContextValue | null>(null);

export const DatasetModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const canUseTestMode = hasPermission(user, 'cma.evaluate');

  const [mode, setModeState] = useState<DatasetMode>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === 'test' ? 'test' : 'normal';
    } catch {
      return 'normal';
    }
  });

  // Fail-closed: the instant the viewer is no longer authorized for TEST
  // mode (permissions not yet loaded, or genuinely lacking cma.evaluate),
  // reset to NORMAL — never leave a stale TEST selection active for an
  // unauthorized viewer (brief: "Reset safely to NORMAL if an
  // unauthorized user attempts to access TEST mode").
  useEffect(() => {
    if (mode === 'test' && !canUseTestMode) {
      setModeState('normal');
      try { sessionStorage.setItem(STORAGE_KEY, 'normal'); } catch { /* best-effort only */ }
    }
  }, [mode, canUseTestMode]);

  const setMode = useCallback((next: DatasetMode) => {
    const resolved = next === 'test' && !canUseTestMode ? 'normal' : next;
    setModeState(resolved);
    try { sessionStorage.setItem(STORAGE_KEY, resolved); } catch { /* best-effort only */ }
  }, [canUseTestMode]);

  const value: DatasetModeContextValue = {
    mode,
    datasetId: mode === 'test' ? CMA_TEST_DATASET_ID : null,
    canUseTestMode,
    setMode,
  };

  return <DatasetModeContext.Provider value={value}>{children}</DatasetModeContext.Provider>;
};

export function useDatasetMode(): DatasetModeContextValue {
  const ctx = useContext(DatasetModeContext);
  if (!ctx) throw new Error('useDatasetMode must be used within a DatasetModeProvider');
  return ctx;
}
