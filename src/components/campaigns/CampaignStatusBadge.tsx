import React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';

/**
 * Session 12.1 — replaces the previous hardcoded-`dark`-boolean-prop
 * mechanism (which never actually responded to the real Light/Dark theme
 * context; both call sites always passed `dark`, so its "light" config
 * path was dead code — see docs/SCREEN_REVIEW/SESSION_12_0 audit) with
 * the shared S1 semantic status vocabulary
 * (docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md §23) — the same
 * `Badge` variants every other reviewed screen already uses, verified
 * correct in both themes via the component's own paired classes.
 *
 * Lifecycle-state mapping (restrained, not aggressive):
 *  draft/scheduled -> secondary (neutral, not yet active)
 *  running         -> positive  (active/healthy operational state)
 *  paused/stopped  -> warning   (needs attention, not a failure)
 *  completed       -> secondary (neutral end state)
 *  failed          -> destructive (genuine technical failure — the one
 *                     case §23 reserves solid saturated red for)
 */
const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  draft: 'secondary',
  scheduled: 'secondary',
  running: 'positive',
  paused: 'warning',
  stopped: 'warning',
  completed: 'secondary',
  failed: 'destructive',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  running: 'Running',
  paused: 'Paused',
  stopped: 'Stopped',
  completed: 'Completed',
  failed: 'Failed',
};

export const CampaignStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const variant = STATUS_VARIANT[status] ?? 'secondary';
  const label = STATUS_LABEL[status] ?? status;
  return (
    <Badge variant={variant} className="whitespace-nowrap text-xs">
      {label}
    </Badge>
  );
};
