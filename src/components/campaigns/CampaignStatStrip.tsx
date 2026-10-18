import React, { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import type { CampaignWithStats } from '@/types/campaign';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useCmaMeasure } from '@/hooks/cma/useCmaMeasure';
import { campaignAllTimeCmaWindow } from '@/lib/cma/cmaWindow';

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
 *
 * Session CMA-4B — Targets / success rate are now CMA-authoritative
 * (CANON-CAMPAIGN-TARGET-COUNT / CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI)
 * when the viewer holds `cma.evaluate` (verified byte-identical against
 * the legacy `call_center_campaign_list` totals on production before
 * wiring this up — see docs/SESSION_CMA_4B_OPERATIONAL_INTEGRATION.md).
 * `cma.evaluate` is not yet granted to every role that holds
 * `campaigns.view` (`operator` does not have it) — for viewers without
 * it, this falls back to the exact same client-side sum as before, never
 * a 403, never a fabricated value. "Campaigns" / "Running" / "Calls
 * triggered" / "unclassified" are operational counts with no CMA
 * canonical-measure equivalent and are always computed from the fetched
 * campaign list, CMA or not.
 */
export const CampaignStatStrip: React.FC<CampaignStatStripProps> = ({ campaigns }) => {
  const { user } = useAuth();
  const useCma = hasPermission(user, 'cma.evaluate');
  const cmaWindow = useMemo(() => campaignAllTimeCmaWindow(campaigns), [campaigns]);

  const targetCountResult = useCmaMeasure(useCma && Boolean(cmaWindow), {
    canonicalMeasureId: 'CANON-CAMPAIGN-TARGET-COUNT',
    window: cmaWindow ?? { from: '', to: '' },
  });
  const successRateResult = useCmaMeasure(useCma && Boolean(cmaWindow), {
    canonicalMeasureId: 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI',
    window: cmaWindow ?? { from: '', to: '' },
  });

  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === 'running').length;
  const totalTriggered = campaigns.reduce((sum, c) => sum + c.stats.triggeredCount, 0);

  // CMA is "ready" only once BOTH evaluations have returned an actual
  // computed result (evidence present) — never a partial mix of one CMA
  // number and one legacy number, and never while still loading (the
  // loading state below falls back to the legacy sum so the strip never
  // shows a stale "…" where a real total used to be instantly).
  const cmaTargetEvidence = targetCountResult.data?.groups[0]?.evidence;
  const cmaSuccessEvidence = successRateResult.data?.groups[0]?.evidence;
  const cmaReady = useCma && Boolean(cmaWindow) && Boolean(cmaTargetEvidence) && Boolean(cmaSuccessEvidence);

  const totalTargets = cmaReady
    ? (cmaTargetEvidence?.numerator ?? 0)
    : campaigns.reduce((sum, c) => sum + c.stats.targetCount, 0);
  const totalClassified = cmaReady
    ? (cmaSuccessEvidence?.denominator ?? 0)
    : campaigns.reduce((sum, c) => sum + c.stats.classifiedCount, 0);
  const totalSuccess = cmaReady
    ? (cmaSuccessEvidence?.numerator ?? 0)
    : campaigns.reduce((sum, c) => sum + c.stats.successCount, 0);
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
