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

/** Dark operational palette (Session 10.1) — same lifecycle states, no new business states. */
const STATUS_CONFIG_DARK: Record<string, { color: string; label: string }> = {
  draft: { color: 'bg-slate-800 text-slate-300', label: 'Draft' },
  scheduled: { color: 'bg-cyan-950 text-cyan-300', label: 'Scheduled' },
  running: { color: 'bg-green-950 text-green-400', label: 'Running' },
  paused: { color: 'bg-amber-950 text-amber-400', label: 'Paused' },
  completed: { color: 'bg-cyan-950 text-cyan-300', label: 'Completed' },
  stopped: { color: 'bg-slate-800 text-slate-400', label: 'Stopped' },
  failed: { color: 'bg-red-950 text-red-400', label: 'Failed' },
};

export const CampaignStatusBadge: React.FC<{ status: string; dark?: boolean }> = ({ status, dark = false }) => {
  const table = dark ? STATUS_CONFIG_DARK : STATUS_CONFIG;
  const config = table[status] ?? table.draft;
  return <Badge className={config.color}>{config.label}</Badge>;
};
