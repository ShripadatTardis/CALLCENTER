import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { CampaignStatusBadge } from './CampaignStatusBadge';
import { useCampaignActions } from '@/hooks/campaigns/useCampaignActions';
import { useCallData } from '@/hooks/calls/useCallData';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { formatTimestamp } from '@/lib/format';
import type { CampaignDetail as CampaignDetailType, CampaignTargetRow } from '@/types/campaign';
import type { Interaction } from '@/types/interaction';

/**
 * Reuses the existing InteractionDetailDialog rather than a
 * campaign-local transcript/recording viewer (plan §19) — the exact
 * pattern CustomerDetail.tsx already established in Session 4. Only
 * shown for a target with a reconciled interactionId; a target with no
 * reconciled call has nothing to show yet, honestly (plan §19).
 */
const InteractionLookupDialog: React.FC<{ interactionId: string; onClose: () => void }> = ({ interactionId, onClose }) => {
  const { data, isLoading, isError } = useCallData({ search: interactionId, page_size: 1 });
  const interaction = data?.interactions.find((i) => i.interactionId === interactionId) ?? data?.interactions[0];

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-lg p-6 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading interaction…
        </div>
      </div>
    );
  }

  if (isError || !interaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-white rounded-lg p-6 max-w-sm text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          Could not load full interaction detail for {interactionId} right now.
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <InteractionDetailDialog isOpen onClose={onClose} interaction={interaction as Interaction} />;
};

function reconciliationLabel(target: CampaignTargetRow): string {
  if (target.effectiveResultId) return target.campaignResultLabel ?? 'Classified';
  switch (target.latestReconciliationStatus) {
    case 'reconciled':
      return 'Reconciled';
    case 'unresolved':
      return 'Could not be matched to a call';
    case 'error':
      return 'Reconciliation error';
    case 'pending':
      return target.latestExecutionStatus ? 'Awaiting reconciliation' : 'Not yet contacted';
    default:
      return 'Not yet contacted';
  }
}

interface CampaignDetailProps {
  campaign: CampaignDetailType;
  targets: CampaignTargetRow[];
  onBack: () => void;
  onRefetch: () => void;
}

export const CampaignDetail: React.FC<CampaignDetailProps> = ({ campaign, targets, onBack, onRefetch }) => {
  const actions = useCampaignActions(campaign.id);
  const [openInteractionId, setOpenInteractionId] = useState<string | null>(null);

  const rate = campaign.stats.classifiedCount > 0 ? (campaign.stats.successCount / campaign.stats.classifiedCount) * 100 : null;
  const unclassified = campaign.stats.targetCount - campaign.stats.classifiedCount;

  const runAction = (mutation: { mutateAsync: (id: string) => Promise<unknown> }) => {
    mutation.mutateAsync(campaign.id).then(onRefetch);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack} className="flex items-center space-x-2">
            <span>← Back to Campaigns</span>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{campaign.name}</h1>
            <p className="text-slate-600">{campaign.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CampaignStatusBadge status={campaign.status} />
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <Button size="sm" onClick={() => runAction(actions.start)} disabled={actions.start.isPending}>
              Start
            </Button>
          )}
          {campaign.status === 'running' && (
            <Button size="sm" variant="outline" onClick={() => runAction(actions.pause)} disabled={actions.pause.isPending}>
              Pause
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button size="sm" onClick={() => runAction(actions.resume)} disabled={actions.resume.isPending}>
              Resume
            </Button>
          )}
          {(campaign.status === 'running' || campaign.status === 'paused') && (
            <Button size="sm" variant="destructive" onClick={() => runAction(actions.stop)} disabled={actions.stop.isPending}>
              Stop
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Targets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.stats.targetCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calls Triggered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaign.stats.triggeredCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rate === null ? '—' : `${rate.toFixed(1)}%`}</div>
            <div className="text-xs text-muted-foreground mt-1">{unclassified} unclassified / pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">{campaign.agentName ?? campaign.agentId}</div>
            {campaign.agentContractSnapshot && (
              <div className="text-xs text-muted-foreground">
                Contract: {campaign.agentContractSnapshot.contractSource} / {campaign.agentContractSnapshot.contractCompleteness}
              </div>
            )}
            <div className="text-xs text-muted-foreground">Created {formatTimestamp(campaign.createdAt)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Targets ({targets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-700">Name</th>
                  <th className="text-left py-2 font-medium text-slate-700">Phone</th>
                  <th className="text-left py-2 font-medium text-slate-700">Status</th>
                  <th className="text-left py-2 font-medium text-slate-700">Campaign Result</th>
                  <th className="text-left py-2 font-medium text-slate-700">Next Action</th>
                  <th className="text-left py-2 font-medium text-slate-700">Attempts</th>
                  <th className="text-center py-2 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-700">{target.customerDisplayName ?? '—'}</td>
                    <td className="py-2 text-slate-600">{target.contactRawValue}</td>
                    <td className="py-2">
                      <Badge variant="outline">{target.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="py-2 text-slate-600">
                      {target.effectiveResultId ? (
                        <span className={target.resultIsSuccess === true ? 'text-green-700' : target.resultIsSuccess === false ? 'text-red-700' : ''}>
                          {reconciliationLabel(target)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{reconciliationLabel(target)}</span>
                      )}
                    </td>
                    <td className="py-2 text-slate-600">{target.resultNextAction ?? '-'}</td>
                    <td className="py-2 text-slate-600">{target.attemptCount}</td>
                    <td className="py-2 text-center">
                      <div className="flex justify-center gap-1">
                        {target.latestReconciledInteractionId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => setOpenInteractionId(target.latestReconciledInteractionId)}
                          >
                            Transcript / Recording
                          </Button>
                        )}
                        {(target.status === 'failed' || target.status === 'follow_up_due') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled={actions.retry.isPending}
                            onClick={() => actions.retry.mutateAsync(target.id).then(onRefetch)}
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {targets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No targets imported yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {openInteractionId && <InteractionLookupDialog interactionId={openInteractionId} onClose={() => setOpenInteractionId(null)} />}
    </div>
  );
};
