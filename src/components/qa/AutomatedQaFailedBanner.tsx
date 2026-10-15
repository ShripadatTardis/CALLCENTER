import React from 'react';

/**
 * Session 16.4.3.1 — extracted from `AutomatedQaInspector.tsx`'s own
 * failed-evaluation banner (unchanged visually), shared with Call
 * Logs' new inline Automated QA tab so a failed evaluation gets the
 * SAME explicit, honest message in both places — never the blank
 * panel `docs/AUTOMATED_QA_FAILED_EVALUATION_INVESTIGATION.md` §4
 * documented (there, the left column had nothing at all once the
 * `status !== 'failed'` measurements gate and the `observations.length
 * > 0` findings gate both correctly evaluated to "hide," with no
 * fallback message filling the space). This component IS that
 * fallback message, reused everywhere a failed evaluation can be
 * shown so neither surface can reintroduce that gap.
 */
export interface AutomatedQaFailedBannerProps {
  errorCode: string | null;
  errorMessage: string | null;
}

export const AutomatedQaFailedBanner: React.FC<AutomatedQaFailedBannerProps> = ({ errorCode, errorMessage }) => (
  <div className="rounded-md border p-3 text-xs border-[var(--status-negative-border)] bg-[var(--status-negative-fill)] text-[var(--status-negative-text)]">
    Evaluation failed ({errorCode ?? 'unknown_error'}): {errorMessage ?? 'No further detail available.'}
  </div>
);
