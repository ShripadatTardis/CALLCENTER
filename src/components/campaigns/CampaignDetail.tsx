import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle } from 'lucide-react';
import { CampaignStatusBadge } from './CampaignStatusBadge';
import { useCampaignActions } from '@/hooks/campaigns/useCampaignActions';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCallData } from '@/services/calls/callsService';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { formatTimestamp } from '@/lib/format';
import { classifyActualOutcome, classifyStructuredOutputs, formatOutputValue } from '@/lib/campaignActualOutcome';
import type { CampaignDetail as CampaignDetailType, CampaignTargetRow } from '@/types/campaign';
import type { Interaction } from '@/types/interaction';

const MAX_LOOKUP_PAGES = 3;
const LOOKUP_PAGE_SIZE = 100;

/**
 * Session 12.3 fix (92ec1f4) — /call-data has no call_id-keyed lookup
 * param, only `search`, which matches caller_number/caller_name, not
 * call_id. Fixed by searching by the target's own phone number instead,
 * then filtering the bounded, paged results down to the exact call_id.
 * Does not touch the proven call_sid_equals_call_id correlation — this
 * is a display-layer lookup, not reconciliation.
 *
 * Session 12.3 follow-up fix — 92ec1f4 was still insufficient: this
 * function called fetchCallData() without a `role`, which defaults to
 * 'unauthenticated'. api/calls/data.ts applies server-side category
 * authorization (Session 6.2) keyed on that role and strips every row
 * whose agent isn't in the caller's authorized set — for
 * 'unauthenticated' that's every row, so `calls` always came back empty
 * regardless of whether the phone/call_id logic was correct (confirmed
 * live: an unauthenticated /api/calls/data request for this exact phone
 * returns `total_records: 6, calls: []`). useCallData (the hook Call
 * Logs' own, working detail path relies on) resolves the session's real
 * role via useAuth() and passes it through for exactly this reason —
 * this function now does the same, reusing that same authorization
 * mechanism rather than inventing a fourth lookup variant.
 */
async function findCallByPhoneAndId(phone: string, callId: string, role: string) {
  for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
    const result = await fetchCallData({ search: phone, page, page_size: LOOKUP_PAGE_SIZE }, role);
    const match = result.interactions.find((i) => i.interactionId === callId);
    if (match) return match;
    if (page >= result.pagination.total_pages) break;
  }
  return null;
}

/**
 * Reuses the existing InteractionDetailDialog rather than a
 * campaign-local transcript/recording viewer (plan §19) — the exact
 * pattern CustomerDetail.tsx already established in Session 4. Only
 * shown for a target with a reconciled interactionId; a target with no
 * reconciled call has nothing to show yet, honestly (plan §19).
 */
const InteractionLookupDialog: React.FC<{ interactionId: string; phone: string; onClose: () => void }> = ({ interactionId, phone, onClose }) => {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const { data: interaction, isLoading, isError } = useQuery({
    queryKey: ['campaigns', 'voice-interaction-lookup', interactionId, phone, role],
    queryFn: () => findCallByPhoneAndId(phone, interactionId, role),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-card rounded-lg p-6 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading interaction…
        </div>
      </div>
    );
  }

  if (isError || !interaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-card rounded-lg p-6 max-w-sm text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          Could not load full interaction detail for {interactionId} right now.
          <div className="mt-3">
            <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <InteractionDetailDialog isOpen onClose={onClose} interaction={interaction as Interaction} />;
};

/**
 * Session 12.5 §8 — shows both result levels clearly without redesigning
 * the Campaign screen: the existing generic "Current Result" (call-level
 * outcome, unchanged) alongside the new agent-specific business outcome
 * and its structured outputs, rendered with the captured agent-contract
 * snapshot's display names where the backend's returned code/field is
 * one the campaign's own contract actually declares. An unrecognized
 * code/field (contract drift) is shown with its raw value and a visible
 * flag rather than silently dropped or guessed at.
 */
const AgentResultDialog: React.FC<{
  campaign: CampaignDetailType;
  target: CampaignTargetRow;
  onClose: () => void;
}> = ({ campaign, target, onClose }) => {
  const contract = campaign.agentContractSnapshot;
  const outcome = classifyActualOutcome(contract, target.resultActualOutcomeCode, target.resultActualOutcomeName);
  const outputs = classifyStructuredOutputs(contract, target.resultStructuredOutputs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg p-4 max-w-md w-full text-[13px] text-foreground space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold">Agent result</h3>

        <div className="space-y-0.5">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Call outcome</div>
          <div>{target.campaignResultLabel ?? 'Unclassified'}</div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Agent outcome</div>
          {outcome.availability === 'unavailable' ? (
            <div className="text-muted-foreground">Not available for this call</div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>{outcome.displayName ?? outcome.code}</span>
              {outcome.availability === 'unrecognized' && (
                <Badge
                  variant="outline"
                  className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400"
                  title="This outcome code is not declared in the campaign's captured agent contract — shown as returned by the backend, not guessed."
                >
                  unrecognised
                </Badge>
              )}
            </div>
          )}
        </div>

        {outputs.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Structured outputs</div>
            <div className="border border-border rounded divide-y divide-border">
              {outputs.map((field) => (
                <div key={field.fieldCode} className="flex items-center justify-between gap-2 px-2 py-1">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {field.displayName}
                    {!field.known && (
                      <Badge
                        variant="outline"
                        className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400"
                        title="This field code is not declared in the campaign's captured agent contract."
                      >
                        unrecognised
                      </Badge>
                    )}
                  </span>
                  <span className="text-foreground">{formatOutputValue(field.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
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
  const [agentResultTargetId, setAgentResultTargetId] = useState<string | null>(null);

  const rate = campaign.stats.classifiedCount > 0 ? (campaign.stats.successCount / campaign.stats.classifiedCount) * 100 : null;
  const unclassified = campaign.stats.targetCount - campaign.stats.classifiedCount;

  const runAction = (mutation: { mutateAsync: (id: string) => Promise<unknown> }) => {
    mutation.mutateAsync(campaign.id).then(onRefetch);
  };

  return (
    <div className="min-h-full bg-background p-4 space-y-3 text-foreground">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" size="sm" onClick={onBack}>
            ← Campaigns
          </Button>
          <div>
            <h1 className="text-base font-semibold text-foreground">{campaign.name}</h1>
            {campaign.description && <p className="text-[12px] text-muted-foreground">{campaign.description}</p>}
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
            <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => runAction(actions.pause)} disabled={actions.pause.isPending}>
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2.5 border border-border rounded-md bg-card/40 text-[13px]">
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-foreground">{campaign.stats.targetCount}</span>
          <span className="text-muted-foreground text-[11px]">targets</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-foreground">{campaign.stats.triggeredCount}</span>
          <span className="text-muted-foreground text-[11px]">calls triggered</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold tabular-nums text-foreground">{rate === null ? '—' : `${rate.toFixed(1)}%`}</span>
          <span className="text-muted-foreground text-[11px]">success rate</span>
        </div>
        {unclassified > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">{unclassified}</span>
            <span className="text-muted-foreground text-[11px]">unclassified / pending</span>
          </div>
        )}
        <div className="h-4 w-px bg-muted" aria-hidden="true" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-foreground">{campaign.agentName ?? campaign.agentId}</span>
          <span className="text-muted-foreground text-[11px] font-mono">{campaign.agentId}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground text-[11px]">Created {formatTimestamp(campaign.createdAt)}</span>
        </div>
      </div>

      {campaign.agentContractSnapshot && campaign.agentContractSnapshot.contractCompleteness !== 'complete' && (
        <p className="text-[12px] text-muted-foreground px-3">
          Agent contract: partial / legacy — expected input, outcome and output metadata are not currently exposed
          by Call Centre for this agent. This is a Call Centre capability state, not an application error; the
          campaign uses the existing legacy Trigger Call contract.
        </p>
      )}

      <div>
        <h2 className="text-[13px] font-semibold text-foreground mb-1.5 px-0.5">
          Targets ({campaign.stats.targetCount})
        </h2>
        {/*
          Session 12.1 — the heading now uses campaign.stats.targetCount
          (a plain COUNT over campaign_targets, always correct) rather
          than targets.length (the rows actually returned by
          listTargets, which INNER JOINs customer/contact-point and can
          therefore silently omit a target whose customer or contact
          point row doesn't resolve — the root cause of the previously
          reported "0 targets" vs "Targets (3)" contradiction). If the
          two disagree, that join-level gap is real and is surfaced
          honestly here rather than hidden — flagged for a future
          session, not fixed in 12.1 (fixing it requires a migration
          change to call_center_campaign_list_targets, out of scope).
        */}
        {campaign.stats.targetCount !== targets.length && (
          <div className="mb-1.5 px-0.5 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle size={11} aria-hidden="true" />
            {campaign.stats.targetCount} target{campaign.stats.targetCount === 1 ? '' : 's'} exist for this
            campaign, but only {targets.length} could be loaded below — some targets may reference a customer or
            contact record that could not be resolved. This is a known backend gap, not lost data.
          </div>
        )}
        <div className="overflow-x-auto border border-border rounded-md bg-card/40">
          <table className="w-full text-[13px] text-foreground">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="text-left py-2 px-3 font-medium">Name</th>
                <th className="text-left py-2 px-3 font-medium">Phone</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium">Current Result</th>
                <th className="text-left py-2 px-3 font-medium">Agent Outcome</th>
                <th className="text-left py-2 px-3 font-medium">Next Action</th>
                <th className="text-left py-2 px-3 font-medium">Follow-up Due</th>
                <th className="text-right py-2 px-3 font-medium">Attempts</th>
                <th className="text-center py-2 px-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.id} className="border-b border-border/60 last:border-b-0">
                  <td className="py-2 px-3 text-foreground">{target.customerDisplayName ?? '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{target.contactRawValue}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="border-border text-foreground">
                      {target.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">
                    {target.effectiveResultId ? (
                      <span
                        className={
                          target.resultIsSuccess === true
                            ? 'text-green-700 dark:text-green-400'
                            : target.resultIsSuccess === false
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-muted-foreground'
                        }
                      >
                        {reconciliationLabel(target)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        {target.latestReconciliationStatus === 'unresolved' && <AlertTriangle size={11} className="text-amber-700 dark:text-amber-400" aria-hidden="true" />}
                        {reconciliationLabel(target)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {(() => {
                      const outcome = classifyActualOutcome(campaign.agentContractSnapshot, target.resultActualOutcomeCode, target.resultActualOutcomeName);
                      if (outcome.availability === 'unavailable') return <span className="text-muted-foreground">—</span>;
                      return (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-foreground">{outcome.displayName ?? outcome.code}</span>
                          {outcome.availability === 'unrecognized' && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400"
                              title="Not declared in this campaign's captured agent contract"
                            >
                              unrecognised
                            </Badge>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{target.resultNextAction ?? '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {target.status === 'follow_up_due' && target.nextActionAt ? formatTimestamp(target.nextActionAt) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{target.attemptCount}</td>
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
                      {(target.resultActualOutcomeCode || target.resultStructuredOutputs) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7"
                          onClick={() => setAgentResultTargetId(target.id)}
                        >
                          Agent Result
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
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    No targets imported yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openInteractionId && (() => {
        const owningTarget = targets.find((t) => t.latestReconciledInteractionId === openInteractionId);
        return owningTarget ? (
          <InteractionLookupDialog
            interactionId={openInteractionId}
            phone={owningTarget.contactRawValue}
            onClose={() => setOpenInteractionId(null)}
          />
        ) : null;
      })()}

      {agentResultTargetId && (() => {
        const target = targets.find((t) => t.id === agentResultTargetId);
        return target ? (
          <AgentResultDialog campaign={campaign} target={target} onClose={() => setAgentResultTargetId(null)} />
        ) : null;
      })()}
    </div>
  );
};
