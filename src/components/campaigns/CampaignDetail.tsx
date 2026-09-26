import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle } from 'lucide-react';
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
            <Button size="sm" variant="outline" className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white" onClick={onClose}>
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
    <div className="min-h-full bg-slate-950 p-4 space-y-3 text-slate-200">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white" size="sm" onClick={onBack}>
            ← Campaigns
          </Button>
          <div>
            <h1 className="text-base font-semibold text-white">{campaign.name}</h1>
            {campaign.description && <p className="text-[12px] text-slate-400">{campaign.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CampaignStatusBadge status={campaign.status} dark />
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <Button size="sm" onClick={() => runAction(actions.start)} disabled={actions.start.isPending}>
              Start
            </Button>
          )}
          {campaign.status === 'running' && (
            <Button size="sm" variant="outline" className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => runAction(actions.pause)} disabled={actions.pause.isPending}>
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2.5 border border-slate-800 rounded-md bg-slate-900/40 text-[13px]">
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-white">{campaign.stats.targetCount}</span>
          <span className="text-slate-400 text-[11px]">targets</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-white">{campaign.stats.triggeredCount}</span>
          <span className="text-slate-400 text-[11px]">calls triggered</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-white">{rate === null ? '—' : `${rate.toFixed(1)}%`}</span>
          <span className="text-slate-400 text-[11px]">success rate</span>
        </div>
        {unclassified > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold tabular-nums text-amber-400">{unclassified}</span>
            <span className="text-slate-400 text-[11px]">unclassified / pending</span>
          </div>
        )}
        <div className="h-4 w-px bg-slate-800" aria-hidden="true" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-slate-300">{campaign.agentName ?? campaign.agentId}</span>
          <span className="text-slate-400 text-[11px] font-mono">{campaign.agentId}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-slate-400 text-[11px]">Created {formatTimestamp(campaign.createdAt)}</span>
        </div>
      </div>

      {campaign.agentContractSnapshot && campaign.agentContractSnapshot.contractCompleteness !== 'complete' && (
        <p className="text-[12px] text-slate-400 px-3">
          Agent contract: partial / legacy — expected input, outcome and output metadata are not currently exposed
          by Call Centre for this agent. This is a Call Centre capability state, not an application error; the
          campaign uses the existing legacy Trigger Call contract.
        </p>
      )}

      <div>
        <h2 className="text-[13px] font-semibold text-slate-300 mb-1.5 px-0.5">Targets ({targets.length})</h2>
        <div className="overflow-x-auto border border-slate-800 rounded-md bg-slate-900/40">
          <table className="w-full text-[13px] text-slate-200">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-800">
                <th className="text-left py-2 px-3 font-medium">Name</th>
                <th className="text-left py-2 px-3 font-medium">Phone</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium">Campaign Result</th>
                <th className="text-left py-2 px-3 font-medium">Next Action</th>
                <th className="text-left py-2 px-3 font-medium">Follow-up Due</th>
                <th className="text-right py-2 px-3 font-medium">Attempts</th>
                <th className="text-center py-2 px-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.id} className="border-b border-slate-800/60 last:border-b-0">
                  <td className="py-2 px-3 text-slate-200">{target.customerDisplayName ?? '—'}</td>
                  <td className="py-2 px-3 text-slate-400">{target.contactRawValue}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="border-slate-700 text-slate-300">
                      {target.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">
                    {target.effectiveResultId ? (
                      <span
                        className={
                          target.resultIsSuccess === true
                            ? 'text-green-400'
                            : target.resultIsSuccess === false
                              ? 'text-red-400'
                              : 'text-slate-400'
                        }
                      >
                        {reconciliationLabel(target)}
                      </span>
                    ) : (
                      <span className="text-slate-400 inline-flex items-center gap-1">
                        {target.latestReconciliationStatus === 'unresolved' && <AlertTriangle size={11} className="text-amber-400" aria-hidden="true" />}
                        {reconciliationLabel(target)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-400">{target.resultNextAction ?? '—'}</td>
                  <td className="py-2 px-3 text-slate-400">
                    {target.status === 'follow_up_due' && target.nextActionAt ? formatTimestamp(target.nextActionAt) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-400">{target.attemptCount}</td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex justify-center gap-1">
                      {target.latestReconciledInteractionId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7"
                          onClick={() => setOpenInteractionId(target.latestReconciledInteractionId)}
                        >
                          Transcript / Recording
                        </Button>
                      )}
                      {(target.status === 'failed' || target.status === 'follow_up_due') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7"
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
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No targets imported yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openInteractionId && <InteractionLookupDialog interactionId={openInteractionId} onClose={() => setOpenInteractionId(null)} />}
    </div>
  );
};
