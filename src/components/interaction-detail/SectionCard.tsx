import React from 'react';

/**
 * Shared Interaction Detail primitive — extracted from Call Detail's
 * own theme-aligned rebuild (2026-10-02) so Chat Detail (and any future
 * channel detail surface) uses the exact same quiet, bordered section
 * container rather than a parallel copy. Visually identical to the
 * pattern CustomerDetail.tsx/CampaignDetail.tsx's result dialogs
 * already established: a muted uppercase label, optional trailing
 * action, restrained border/radius — no new tokens.
 */
export const SectionCard: React.FC<{
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  /**
   * Session 16.4.3.1 (Overview Recording layout correction, follow-up) —
   * when true, `action` renders immediately after the title and grows
   * to fill the rest of the header row, instead of the default
   * right-aligned (`justify-between`) placement. Opt-in: the existing
   * `action` consumer (`ActionItemDetailDialog.tsx`'s small "View
   * interaction" text link) keeps its original right-aligned behavior
   * unchanged; only Call Summary's full-width audio player (the one
   * consumer that actually needs to span the row, per explicit visual
   * feedback that the default right-aligned/fixed-width placement read
   * as misplaced and too short) opts in.
   */
  actionFillsRow?: boolean;
}> = ({ title, children, action, actionFillsRow = false }) => (
  <div className="rounded-md border border-border bg-card p-3 space-y-2 flex-shrink-0">
    {/* Session 16.4.3.1 — `flex-wrap` added so a wider `action` (e.g.
        Call Summary's header-row audio player) wraps below the title on
        narrow widths instead of clipping/overflowing. No existing
        `action` consumer passes anything wide enough to be affected by
        this on a normal-width row, so this is a pure capability
        addition, not a behavior change for them. */}
    <div className={`flex items-center flex-wrap ${actionFillsRow ? 'gap-3' : 'justify-between gap-2'}`}>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-shrink-0">{title}</div>
      {action && <div className={actionFillsRow ? 'flex-1 min-w-0' : undefined}>{action}</div>}
    </div>
    {children}
  </div>
);
