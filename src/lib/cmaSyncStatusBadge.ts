/**
 * CMA Synchronization status-color map, same centralized `--status-*`
 * convention as `automatedQaStatusBadge.ts` (Session 7.10.1's migration
 * to config-driven status tokens — never literal Tailwind colors).
 * Real-meaning mapping: neverRun="nothing has happened yet" -> neutral;
 * running="in progress" -> pending; success -> positive;
 * partial="completed with some failures, needs attention" -> caution;
 * failed -> negative.
 */
export type CmaSyncDisplayStatus = 'neverRun' | 'running' | 'success' | 'partial' | 'failed';

export const CMA_SYNC_STATUS_BADGE: Record<CmaSyncDisplayStatus, string> = {
  neverRun: 'border-[var(--status-neutral-border)] text-[var(--status-neutral-text)]',
  running: 'border-[var(--status-pending-border)] text-[var(--status-pending-text)]',
  success: 'border-[var(--status-positive-border)] text-[var(--status-positive-text)]',
  partial: 'border-[var(--status-caution-border)] text-[var(--status-caution-text)]',
  failed: 'border-[var(--status-negative-border)] text-[var(--status-negative-text)]',
};

export const CMA_SYNC_STATUS_LABEL: Record<CmaSyncDisplayStatus, string> = {
  neverRun: 'Never Run',
  running: 'Running',
  success: 'Success',
  partial: 'Partial',
  failed: 'Failed',
};
