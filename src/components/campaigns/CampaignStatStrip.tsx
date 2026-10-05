import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import type { CampaignWithStats } from '@/types/campaign';

interface CampaignStatStripProps {
  campaigns: CampaignWithStats[];
}

/**
 * Session 10.1 — compact dark stat strip for Outbound Campaigns,
 * replacing the 5-card grid (CampaignOverviewStats.tsx) with alignment +
 * dividers ("objects, not boxes", §22). CampaignOverviewStats.tsx itself
 * is left untouched — Analytics' Campaign tab still uses it as-is.
 * Same real formulas: target-level success via effective_result_id
 * (never raw campaign_results row counts), unclassified surfaced
 * separately, never folded into success/failure.
 */
export const CampaignStatStrip: React.FC<CampaignStatStripProps> = ({ campaigns }) => {
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === 'running').length;
  const totalTargets = campaigns.reduce((sum, c) => sum + c.stats.targetCount, 0);
  const totalTriggered = campaigns.reduce((sum, c) => sum + c.stats.triggeredCount, 0);
  const totalClassified = campaigns.reduce((sum, c) => sum + c.stats.classifiedCount, 0);
  const totalSuccess = campaigns.reduce((sum, c) => sum + c.stats.successCount, 0);
  const totalUnclassified = totalTargets - totalClassified;
  const successRate = totalClassified > 0 ? (totalSuccess / totalClassified) * 100 : null;

  // VoiceForce design system — neutral data-value rule: these are
  // ordinary counts, not status badges, so none carry a tone color
  // (Running previously rendered green merely because it's a count of
  // "good" campaigns, not because it communicates alert/warning state).
  const items: Array<{ label: string; value: string }> = [
    { label: 'Campaigns', value: String(totalCampaigns) },
    { label: 'Running', value: String(activeCampaigns) },
    { label: 'Targets', value: totalTargets.toLocaleString() },
    { label: 'Calls triggered', value: totalTriggered.toLocaleString() },
  ];

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2.5 border border-border rounded-md bg-card/40 text-[13px]">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline gap-1.5">
            <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
            <span className="text-muted-foreground text-[11px]">{item.label}</span>
          </div>
        ))}
        <div className="h-4 w-px bg-muted" aria-hidden="true" />
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-foreground">{successRate === null ? '—' : `${successRate.toFixed(1)}%`}</span>
          <span className="text-muted-foreground text-[11px] flex items-center gap-1">
            success rate
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 cursor-help" aria-label="Success rate definition" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Target-level: classified targets whose current result is a success, divided by all classified
                targets. Not-yet-contacted or unclassified targets are excluded and shown separately — never
                treated as success or failure.
              </TooltipContent>
            </Tooltip>
          </span>
        </div>
        {totalUnclassified > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold tabular-nums text-foreground">{totalUnclassified.toLocaleString()}</span>
            <span className="text-muted-foreground text-[11px]">unclassified / pending</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
