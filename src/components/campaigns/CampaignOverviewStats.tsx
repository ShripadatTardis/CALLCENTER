import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle, PhoneCall, Play, TrendingUp, Users } from 'lucide-react';
import type { CampaignWithStats } from '@/types/campaign';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useCmaMeasure } from '@/hooks/cma/useCmaMeasure';
import { campaignAllTimeCmaWindow } from '@/lib/cma/cmaWindow';
import { useDatasetMode } from '@/contexts/DatasetModeContext';

interface CampaignOverviewStatsProps {
  campaigns: CampaignWithStats[];
}

/**
 * Success Rate is target-level via effective_result_id, never a raw
 * campaign_results row count over targets (plan §25's final amendment —
 * multiple executions/results can exist per target; row-level counting
 * could double-count one target). Unclassified/pending targets are
 * surfaced as a separate count, never silently folded into either side
 * of the ratio (plan §20).
 *
 * Session CMA-4C — Total Targets / Success Rate become CMA-authoritative
 * (CANON-CAMPAIGN-TARGET-COUNT / CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI)
 * when the viewer holds `cma.evaluate`, reusing the exact same formula,
 * window-construction helper, and permission-gated fallback pattern
 * already verified byte-identical against production for
 * `CampaignStatStrip.tsx` (Session CMA-4B) — this component reads the
 * identical `CampaignWithStats[]` shape from the same `useCampaigns()`
 * source, so the same equivalence proof applies without re-deriving it.
 * "Total Campaigns" / "Active Campaigns" / "Calls Triggered" / unclassified
 * have no CMA canonical-measure equivalent and stay computed from the
 * fetched campaign list, as before. The Analytics Campaigns tab's CSV
 * export is unaffected — it exports a separate per-campaign row table
 * (`CampaignAnalyticsTab.tsx`), not this component's cross-campaign
 * aggregate, so there is nothing for it to contradict.
 */
export const CampaignOverviewStats: React.FC<CampaignOverviewStatsProps> = ({ campaigns }) => {
  const { user } = useAuth();
  const useCma = hasPermission(user, 'cma.evaluate');
  const { datasetId } = useDatasetMode();
  const cmaWindow = useMemo(() => campaignAllTimeCmaWindow(campaigns), [campaigns]);

  const targetCountResult = useCmaMeasure(useCma && Boolean(cmaWindow), {
    canonicalMeasureId: 'CANON-CAMPAIGN-TARGET-COUNT',
    window: cmaWindow ?? { from: '', to: '' },
    datasetId,
  });
  const successRateResult = useCmaMeasure(useCma && Boolean(cmaWindow), {
    canonicalMeasureId: 'CANON-CAMPAIGN-SUCCESS-COUNT-RATE-RAW-CLASSIFI',
    window: cmaWindow ?? { from: '', to: '' },
    datasetId,
  });

  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === 'running').length;
  const totalTriggered = campaigns.reduce((sum, c) => sum + c.stats.triggeredCount, 0);

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

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCampaigns}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Play className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeCampaigns}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Targets</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTargets.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calls Triggered</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTriggered.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              Success Rate
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Target-level: classified targets whose current result is a success, divided by all classified
                  targets. Targets not yet contacted, still awaiting reconciliation, or unclassified are excluded and
                  shown separately below — never treated as success or failure.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate === null ? '—' : `${successRate.toFixed(1)}%`}</div>
            <div className="text-xs text-muted-foreground mt-1">{totalUnclassified.toLocaleString()} unclassified / pending</div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};
