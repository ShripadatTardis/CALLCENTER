import type { InteractionDetailDialogTab } from '@/components/call-logs/InteractionDetailDialog';

/**
 * Session 16.4.3.1 — the Automated QA tab's "Open Full Inspector" action
 * needs real return-navigation (brief §6/§7): the Inspector's Back
 * button must bring the user back to Call Logs with the SAME
 * interaction's dialog reopened on the SAME tab, but ONLY when the
 * Inspector was reached from this exact path — every other existing
 * entry point into the Inspector (QA Review's own navigation) must be
 * completely unaffected.
 *
 * Deliberately a narrow, dedicated type rather than overloading
 * `src/lib/detailOrigin.ts`'s existing `DetailOrigin` mechanism: that
 * mechanism answers "which PAGE to return to" (a fixed path/label per
 * origin); this answers the richer "return to this page AND reopen
 * this specific dialog on this specific tab" — a different shape, not
 * a drop-in replacement for it. Shared between the two real consumers
 * (`InteractionDetailDialog.tsx`, which sets this state when
 * navigating to the Inspector, and `CallLogs.tsx`/`AutomatedQaInspector.tsx`,
 * which read it) so the shape is defined exactly once.
 */
export interface AutomatedQaInspectorReturnState {
  /** Only ever `'call-logs'` today — a discriminant kept explicit (not
   * just presence-checked) so a future second return path doesn't have
   * to guess at this one's absent fields. */
  qaInspectorReturnOrigin: 'call-logs';
  reopenInteraction: {
    interactionId: string;
    tab: InteractionDetailDialogTab;
  };
}

export function isAutomatedQaInspectorReturnState(value: unknown): value is AutomatedQaInspectorReturnState {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).qaInspectorReturnOrigin === 'call-logs' &&
    typeof (value as Record<string, unknown>).reopenInteraction === 'object'
  );
}
