import React from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface CampaignFiltersBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
}

/**
 * Session 10.1 — compact dark-theme filter row for Outbound Campaigns.
 * Replaces CampaignFilters.tsx's bordered card for this page only;
 * CampaignFilters.tsx itself is untouched (no other consumer today, but
 * kept as the light-theme building block rather than deleted).
 */
export const CampaignFiltersBar: React.FC<CampaignFiltersBarProps> = ({
  searchTerm,
  setSearchTerm,
  selectedStatus,
  setSelectedStatus,
}) => {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
        <Input
          placeholder="Search campaigns…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8 h-8 text-[13px] bg-card border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <select
        aria-label="Filter by status"
        value={selectedStatus}
        onChange={(e) => setSelectedStatus(e.target.value)}
        className="border border-border bg-card text-foreground rounded-md px-2 h-8 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <option value="all">All statuses</option>
        <option value="draft">Draft</option>
        <option value="scheduled">Scheduled</option>
        <option value="running">Running</option>
        <option value="paused">Paused</option>
        <option value="completed">Completed</option>
        <option value="stopped">Stopped</option>
        <option value="failed">Failed</option>
      </select>
    </div>
  );
};
