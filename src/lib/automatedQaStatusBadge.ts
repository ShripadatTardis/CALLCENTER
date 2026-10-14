import type { AutomatedQaStatus } from '@/services/qa/automatedQaService';

/** Session 16.3 — shared status-color map, single source so AutomatedQaInspector and AutomatedQaPanel never drift apart.
 * Session 7.10.1 — migrated from literal Tailwind color classes to the
 * centralized `--status-*` CSS custom properties (src/theme/schema.ts's
 * `color.semantic.*`), so changing the active customer config now
 * changes every consumer of this map. Real-meaning mapping:
 * queued="not yet started" -> neutral; running="in progress" -> pending
 * (matches Badge's own existing "Pending/Open"+"Information/Running"
 * convention); completed -> positive; partial="needs attention,
 * incomplete" -> caution; failed -> negative. Same real hue families as
 * before (slate/blue/emerald/amber/red), now config-driven. */
export const AUTOMATED_QA_STATUS_BADGE: Record<AutomatedQaStatus, string> = {
  queued: 'border-[var(--status-neutral-border)] text-[var(--status-neutral-text)]',
  running: 'border-[var(--status-pending-border)] text-[var(--status-pending-text)]',
  completed: 'border-[var(--status-positive-border)] text-[var(--status-positive-text)]',
  partial: 'border-[var(--status-caution-border)] text-[var(--status-caution-text)]',
  failed: 'border-[var(--status-negative-border)] text-[var(--status-negative-text)]',
};
