import type { AutomatedQaStatus } from '@/services/qa/automatedQaService';

/** Session 16.3 — shared status-color map, single source so AutomatedQaInspector and AutomatedQaPanel never drift apart. */
export const AUTOMATED_QA_STATUS_BADGE: Record<AutomatedQaStatus, string> = {
  queued: 'border-slate-400 text-slate-600 dark:border-slate-500 dark:text-slate-400',
  running: 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400',
  completed: 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400',
  partial: 'border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-400',
  failed: 'border-red-600 text-red-700 dark:border-red-400 dark:text-red-400',
};
