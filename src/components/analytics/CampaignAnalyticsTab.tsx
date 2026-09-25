import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { CampaignOverviewStats } from '@/components/campaigns/CampaignOverviewStats';
import { MetricSourceCaption } from './MetricSourceCaption';
import { AnalyticsExportButton } from './AnalyticsExportButton';

/**
 * Session 7 §10/§11 — reuses CampaignOverviewStats.tsx's existing,
 * already-correct target-level success-rate formula unchanged (no
 * second, divergent implementation). Campaign call correlation
 * (Trigger Call <-> Call Data) is NOT CONFIRMED (post-outage
 * verification), so classified/unclassified is surfaced prominently
 * rather than presenting an incomplete rate as definitive.
 *
 * Campaign authorization audit (plan §1 revision / this prompt's §11):
 * api/campaigns.ts applies no category/role filtering today — every
 * authenticated user sees every campaign's aggregates, matching the
 * existing Outbound Campaigns page's own unchanged behavior. Session 7
 * does not invent a new campaign-role permission model.
 */
export const CampaignAnalyticsTab: React.FC = () => {
  const { data, isLoading } = useCampaigns({ page: 1, pageSize: 200 });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground my-8 mx-auto" />;
  if (!data || data.data.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">No campaigns yet.</p>;

  const exportRows = data.data.map((c) => ({
    name: c.name,
    status: c.status,
    targets: c.stats.targetCount,
    triggered: c.stats.triggeredCount,
    classified: c.stats.classifiedCount,
    successful: c.stats.successCount,
    successRatePct: c.stats.classifiedCount > 0 ? ((c.stats.successCount / c.stats.classifiedCount) * 100).toFixed(1) : '',
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AnalyticsExportButton
          rows={exportRows}
          headers={['name', 'status', 'targets', 'triggered', 'classified', 'successful', 'successRatePct']}
          filename="campaign-summary.csv"
          label="Export Campaign Summary CSV"
        />
      </div>
      <CampaignOverviewStats campaigns={data.data} />
      <MetricSourceCaption
        origin="server-aggregate"
        source="campaign_targets / campaign_executions / campaign_results via effective_result_id (Session 5's formula, reused unchanged)"
      />
      <Card>
        <CardHeader><CardTitle className="text-base">Backend correlation constraint</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Trigger Call ↔ Call Data correlation is not yet empirically confirmed by the backend (Session 5 §26, reconfirmed
          in the post-outage verification pass). Until it is, campaign executions largely stay pending/unresolved
          reconciliation, so the success-rate figure above may be based on few or no classified targets — this is an
          honest reflection of the current backend gap, not an Analytics defect.
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Campaign aggregates are currently visible to every authenticated user — no category/role permission model exists
        for campaign objects today. Preserved as-is; not changed in Session 7.
      </p>
    </div>
  );
};
