import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * The one shared "honest unavailable" visual — reused by RatioTrend,
 * BreakdownTable, DriverPanel, InteractionTable whenever the backend
 * reports backend_gap or a not-yet-instrumented view. Mirrors the
 * existing empty-state visual language already used elsewhere in the
 * product (e.g. CampaignGrid's "No campaigns yet" panel) rather than
 * inventing a new one.
 */
export const RatioUnavailableState: React.FC<{ reason: string; compact?: boolean }> = ({ reason, compact }) => (
  <div
    className={`border border-border rounded-md text-center text-muted-foreground bg-card/40 flex flex-col items-center gap-1.5 ${
      compact ? 'p-4 text-xs' : 'p-8 text-sm'
    }`}
  >
    <AlertTriangle size={compact ? 14 : 18} className="text-muted-foreground" aria-hidden="true" />
    <span>{reason}</span>
  </div>
);
