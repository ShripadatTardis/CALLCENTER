
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, variant }) => {
  // Session 7.8 — migrated from literal `bg-{color}-100 text-{color}-800`
  // classes (light-mode only, no `dark:` variant anywhere in this file
  // before this session — confirmed by the Session 7.8 status-color
  // audit) onto the centralized `--status-*` CSS custom properties, the
  // same tokens `Badge`'s `positive`/`warning`/`escalated`/`pending`
  // variants now use. This both centralizes the color AND fixes dark
  // mode for every consumer of this component in one change.
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'engaged':
      case 'in-progress':
      case 'resolved':
        return 'bg-[var(--status-positive-fill)] text-[var(--status-positive-text)] hover:bg-[var(--status-positive-fill)]';
      case 'idle':
      case 'pending':
      case 'awaiting_input':
        return 'bg-[var(--status-caution-fill)] text-[var(--status-caution-text)] hover:bg-[var(--status-caution-fill)]';
      case 'escalated':
      case 'escalation_triggered':
      case 'dropped':
        return 'bg-[var(--status-negative-fill)] text-[var(--status-negative-text)] hover:bg-[var(--status-negative-fill)]';
      case 'complete':
      case 'callback_scheduled':
        return 'bg-[var(--status-pending-fill)] text-[var(--status-pending-text)] hover:bg-[var(--status-pending-fill)]';
      default:
        return 'bg-muted text-foreground hover:bg-muted';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Badge
      variant={variant || "outline"}
      className={cn("font-medium", !variant && getStatusColor(status))}
    >
      {formatStatus(status)}
    </Badge>
  );
};
