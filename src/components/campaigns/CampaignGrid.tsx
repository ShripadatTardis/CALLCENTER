import React from 'react';
import { CampaignStatusBadge } from './CampaignStatusBadge';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { CampaignWithStats } from '@/types/campaign';
import { typography } from '@/lib/typography';

interface CampaignGridProps {
  campaigns: CampaignWithStats[];
  onViewCampaign: (campaign: CampaignWithStats) => void;
}

/**
 * Session 10.1 — Direction A's compact operational table, styled with the
 * selected dark visual language. Columns are exactly the fields
 * CampaignStats already provides (targetCount/triggeredCount/
 * classifiedCount/successCount) — "Unclassified" is a real subtraction
 * (targets - classified), never a fabricated value. No card grid.
 */
export const CampaignGrid: React.FC<CampaignGridProps> = ({ campaigns, onViewCampaign }) => {
  if (campaigns.length === 0) {
    return (
      <div className="border border-border rounded-md p-8 text-center text-sm text-muted-foreground bg-card/40">
        No campaigns yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border rounded-md bg-card/40">
      <table className="w-full text-[13px] text-foreground">
        <thead>
          {/* Session 7.10 — migrated from literal py-2/px-3 to the
              centralized table-geometry tokens (Session 7.9), the real
              gap a Session 7.9 investigation flagged as unresolved
              because this child component wasn't located via the
              OutboundCampaigns.tsx page file alone. */}
          <tr className={`${typography.tableHeader} border-b border-border`}>
            <th className="text-left h-[var(--table-header-height)] px-[var(--table-header-padding-x)]">Campaign</th>
            <th className="text-left h-[var(--table-header-height)] px-[var(--table-header-padding-x)]">Status</th>
            <th className="text-left h-[var(--table-header-height)] px-[var(--table-header-padding-x)]">Call Agent</th>
            <th className="text-right h-[var(--table-header-height)] px-[var(--table-header-padding-x)]">Targets</th>
            <th className="text-right h-[var(--table-header-height)] px-[var(--table-header-padding-x)]">Attempted</th>
            <th className="text-right h-[var(--table-header-height)] px-[var(--table-header-padding-x)]">Classified</th>
            <th className="text-right h-[var(--table-header-height)] px-[var(--table-header-padding-x)]">Unclassified</th>
            <th className="text-right h-[var(--table-header-height)] px-[var(--table-header-padding-x)]">Success rate</th>
            <th className="h-[var(--table-header-height)] px-[var(--table-header-padding-x)]" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const unclassified = campaign.stats.targetCount - campaign.stats.classifiedCount;
            const rate =
              campaign.stats.classifiedCount > 0 ? (campaign.stats.successCount / campaign.stats.classifiedCount) * 100 : null;
            return (
              <tr
                key={campaign.id}
                onClick={() => onViewCampaign(campaign)}
                className="border-b border-border/60 last:border-b-0 hover:bg-[hsl(var(--table-row-hover-bg))] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                tabIndex={0}
                role="button"
                aria-label={`Open campaign ${campaign.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onViewCampaign(campaign);
                  }
                }}
              >
                <td className="px-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)]">
                  <div className="font-medium text-foreground">{campaign.name}</div>
                  <div className="text-[11px] text-muted-foreground">by {campaign.createdBy ?? 'unknown'}</div>
                </td>
                <td className="px-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)]">
                  <CampaignStatusBadge status={campaign.status} />
                </td>
                <td className="px-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)] text-foreground">{campaign.agentName ?? campaign.agentId}</td>
                <td className="px-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)] text-right tabular-nums text-foreground">{campaign.stats.targetCount}</td>
                <td className="px-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)] text-right tabular-nums text-foreground">{campaign.stats.triggeredCount}</td>
                <td className="px-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)] text-right tabular-nums text-foreground">{campaign.stats.classifiedCount}</td>
                <td className="px-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)] text-right tabular-nums">
                  {unclassified > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={11} aria-hidden="true" />
                      {unclassified}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)] text-right tabular-nums text-foreground">
                  {rate === null ? <span className="text-muted-foreground">—</span> : `${rate.toFixed(0)}%`}
                </td>
                <td className="pr-[var(--table-row-standard-padding-x)] py-[var(--table-row-standard-padding-y)] text-right">
                  <ChevronRight size={14} className="text-muted-foreground" aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
