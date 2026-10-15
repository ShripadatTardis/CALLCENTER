import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { CorrectiveActionStatus } from '@/services/correctiveActions/correctiveActionsService';

/**
 * Session 16.5 — centralized status presentation for Corrective Action
 * Management. Reuses the 5 existing `color.semantic.*` Badge variants
 * (src/theme/schema.ts / src/components/ui/badge.tsx) rather than
 * introducing a 6th hue — no schema change, per
 * .claude/rules/ui-centralization.md Rule 2. `reopened` intentionally
 * reuses the `escalated` (negative) variant: a reopened CA previously
 * passed through closure and needs attention again, the same semantic
 * class Dashboard/Action Required already uses for "needs attention."
 */
const STATUS_LABEL: Record<CorrectiveActionStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_verification: 'Pending Verification',
  closed: 'Closed',
  reopened: 'Reopened',
  cancelled: 'Cancelled',
};

export function correctiveActionStatusLabel(status: CorrectiveActionStatus): string {
  return STATUS_LABEL[status];
}

export function CorrectiveActionStatusBadge({ status, className }: { status: CorrectiveActionStatus; className?: string }) {
  const cls = className ? `text-xs ${className}` : 'text-xs';
  switch (status) {
    case 'in_progress':
      return <Badge variant="secondary" className={cls}>{STATUS_LABEL[status]}</Badge>;
    case 'pending_verification':
      return <Badge variant="warning" className={cls}>{STATUS_LABEL[status]}</Badge>;
    case 'closed':
      return <Badge variant="positive" className={cls}>{STATUS_LABEL[status]}</Badge>;
    case 'reopened':
      return <Badge variant="escalated" className={cls}>{STATUS_LABEL[status]}</Badge>;
    case 'cancelled':
      return <Badge variant="neutral" className={cls}>{STATUS_LABEL[status]}</Badge>;
    case 'open':
    default:
      return <Badge variant="pending" className={cls}>{STATUS_LABEL[status]}</Badge>;
  }
}

const PRIORITY_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

export function CorrectiveActionPriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const cls = className ? `text-xs ${className}` : 'text-xs';
  if (priority === 'critical') return <Badge variant="escalated" className={cls}>{PRIORITY_LABEL[priority]}</Badge>;
  if (priority === 'high') return <Badge variant="warning" className={cls}>{PRIORITY_LABEL[priority]}</Badge>;
  if (priority === 'low') return <Badge variant="neutral" className={cls}>{PRIORITY_LABEL[priority]}</Badge>;
  return <Badge variant="outline" className={cls}>{PRIORITY_LABEL[priority] ?? priority}</Badge>;
}
