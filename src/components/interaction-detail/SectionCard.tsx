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
export const SectionCard: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  children,
  action,
}) => (
  <div className="rounded-md border border-border bg-card p-3 space-y-2 flex-shrink-0">
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
      {action}
    </div>
    {children}
  </div>
);
