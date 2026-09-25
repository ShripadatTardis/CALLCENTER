import React from 'react';
import { Badge } from '@/components/ui/badge';

/**
 * Shared status-badge presentational pattern (plan §2/§21) — both
 * Outbound Campaigns and NPS Campaigns independently implemented the
 * same draft/scheduled/running/completed/paused -> color/label mapping.
 * Extracted here as the one low-risk, optional tidy-up; NPS is not
 * required to adopt it this session.
 */
const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft' },
  scheduled: { color: 'bg-blue-100 text-blue-800', label: 'Scheduled' },
  running: { color: 'bg-green-100 text-green-800', label: 'Running' },
  paused: { color: 'bg-yellow-100 text-yellow-800', label: 'Paused' },
  completed: { color: 'bg-purple-100 text-purple-800', label: 'Completed' },
  stopped: { color: 'bg-slate-200 text-slate-700', label: 'Stopped' },
  failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
};

export const CampaignStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return <Badge className={config.color}>{config.label}</Badge>;
};
