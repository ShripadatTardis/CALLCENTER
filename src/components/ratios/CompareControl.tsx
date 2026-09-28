import React from 'react';

/**
 * Spec §6 — "Previous period or one selected dimension; no arbitrary
 * unsupported comparison." R1: the only comparison mode this product can
 * honestly offer is "previous period", and even that isn't computed yet
 * (see src/server/analytics/ratioService.ts's R1 scope) — shown as a
 * disabled, honestly-labeled control rather than omitted entirely, so
 * the architecture is visible without claiming a working feature.
 */
export const CompareControl: React.FC = () => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground">Compare</span>
    <select disabled className="border border-border bg-card text-muted-foreground rounded-md px-2 h-7 text-xs opacity-70 cursor-not-allowed" aria-label="Compare (not yet available)">
      <option>Previous period — not yet available</option>
    </select>
  </div>
);
