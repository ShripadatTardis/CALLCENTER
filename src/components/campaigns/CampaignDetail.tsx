import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle } from 'lucide-react';
import { CampaignStatusBadge } from './CampaignStatusBadge';
import { ReasonDialog } from './ReasonDialog';
import { TargetActionsMenu } from './TargetActionsMenu';
import { AddTargetsDialog } from './AddTargetsDialog';
import { CampaignHistory } from './CampaignHistory';
import { CampaignConfigurationHistory } from './CampaignConfigurationHistory';
import { CampaignSettingsDialog } from './CampaignSettingsDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCampaignActions } from '@/hooks/campaigns/useCampaignActions';
import { useCampaignClassifications, useCampaignConfigurationVersions } from '@/hooks/campaigns/useCampaigns';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCallData } from '@/services/calls/callsService';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { formatTimestamp } from '@/lib/format';
import { typography } from '@/lib/typography';
import { classifyActualOutcome, classifyStructuredOutputs, formatOutputValue } from '@/lib/campaignActualOutcome';
import type { CampaignClassification, CampaignConfigurationVersion, CampaignDetail as CampaignDetailType, CampaignTargetRow } from '@/types/campaign';
import type { Interaction } from '@/types/interaction';

/**
 * Session 12.6 — resolves a classification code to its live label,
 * never a hardcoded lookup. Returns the raw code itself (never
 * fabricated) if the live master list doesn't have it for some reason
 * (e.g. a race with the list query still loading).
 */
function classificationLabel(classifications: CampaignClassification[], code: string): string {
  return classifications.find((c) => c.code === code)?.label ?? code;
}

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

  // VoiceForce design system (Phase 2B) — these two transient states
  // previously hand-rolled their own `fixed inset-0 bg-black/30` overlay
  // instead of the shared Dialog primitive, so they had no focus trap
  // and no Escape-to-close. Migrated to the real Dialog — same visual
  // footprint (a small centered panel), real keyboard/focus behavior.
  if (isLoading) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-sm">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading interaction…
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError || !interaction) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-sm">
          <p className="text-sm text-muted-foreground">
            Could not load full interaction detail for {interactionId} right now.
          </p>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
  configurationVersions: CampaignConfigurationVersion[];
  onClose: () => void;
}> = ({ campaign, target, configurationVersions, onClose }) => {
  const contract = campaign.agentContractSnapshot;
  const outcome = classifyActualOutcome(contract, target.resultActualOutcomeCode, target.resultActualOutcomeName);
  const outputs = classifyStructuredOutputs(contract, target.resultStructuredOutputs);
  const { data: classifications = [] } = useCampaignClassifications();
  // Session 13.4 (DEC-CAMP-01 §5) — execution provenance: which configuration version governed this target's most recent execution. Null is a real, honest state (pre-12.7 execution, or a campaign never versioned) — never guessed.
  const governingVersion = target.latestConfigurationVersionId
    ? (configurationVersions.find((v) => v.id === target.latestConfigurationVersionId) ?? null)
    : null;

  return (
    // VoiceForce design system (Phase 2B) — migrated from a hand-rolled
    // `fixed inset-0` overlay to the real Dialog primitive (same reason
    // as InteractionLookupDialog above): real focus trap/Escape-to-close,
    // same visual footprint otherwise.
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md text-[13px] text-foreground space-y-3">
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

        {/* Session 12.6 §11 — the business-policy layer, strictly below
            the agent-reported level above: Campaign Classification is
            derived from Agent Outcome via this campaign's OWN captured
            policy, never re-derived from today's live catalogue. */}
        <div className="space-y-0.5">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Campaign Classification</div>
          {!campaign.outcomePolicySnapshot ? (
            <div className="text-muted-foreground">No outcome policy captured for this campaign (legacy)</div>
          ) : !target.resultClassificationCode ? (
            <div className="text-muted-foreground">Agent outcome unavailable — not classified</div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>{classificationLabel(classifications, target.resultClassificationCode)}</span>
              {target.resultClassificationContractDrift && (
                <Badge
                  variant="outline"
                  className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400"
                  title="This agent outcome has no mapping in the campaign's captured policy — classified as the safe fallback, not guessed."
                >
                  policy drift
                </Badge>
              )}
            </div>
          )}
        </div>

        {target.resultClassificationNextActionType && (
          <div className="space-y-0.5">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Next Action</div>
            <div className="text-foreground">{target.resultClassificationNextActionType.replace('_', ' ')}</div>
          </div>
        )}

        <div className="space-y-0.5">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Configuration</div>
          {governingVersion ? (
            <div className="text-foreground">
              v{governingVersion.versionNumber}
              {governingVersion.status === 'superseded' && (
                <span className="text-muted-foreground"> (superseded)</span>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">
              {target.latestConfigurationVersionId ? 'Configuration version not found' : 'Unversioned (pre-12.7 or never-edited campaign)'}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const navigate = useNavigate();
  const actions = useCampaignActions(campaign.id);
  const { data: classifications = [] } = useCampaignClassifications();
  const [openInteractionId, setOpenInteractionId] = useState<string | null>(null);
  const [agentResultTargetId, setAgentResultTargetId] = useState<string | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<'pause' | 'stop' | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [configHistoryOpen, setConfigHistoryOpen] = useState(false);
  const [addTargetsOpen, setAddTargetsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: configurationVersions = [] } = useCampaignConfigurationVersions(campaign.id);
  const activeConfigurationVersion = configurationVersions.find((v) => v.status === 'active') ?? null;

  const rate = campaign.stats.classifiedCount > 0 ? (campaign.stats.successCount / campaign.stats.classifiedCount) * 100 : null;
  const unclassified = campaign.stats.targetCount - campaign.stats.classifiedCount;
  // Session 12.6 §9/§12 — a SEPARATE, additional statistic, computed
  // only from the new policy-driven classification layer; the existing
  // `rate`/`unclassified` above (driven by the generic is_success
  // column) are completely untouched and remain this campaign's real
  // statistics regardless of whether it has an outcome policy.
  const isPolicyEnabled = Boolean(campaign.outcomePolicySnapshot);
  const policyRate = campaign.stats.policyClassifiedCount > 0 ? (campaign.stats.policySuccessfulCount / campaign.stats.policyClassifiedCount) * 100 : null;

  const runAction = (mutation: { mutateAsync: (id: string) => Promise<unknown> }) => {
    mutation.mutateAsync(campaign.id).then(onRefetch);
  };

  return (
    // App-wide viewport-framing correction (follow-up to Session 15) —
    // Pattern B: root is the single scroll region.
    <div className="h-full min-h-0 overflow-y-auto bg-background p-4 space-y-3 text-foreground">
      {/* VoiceForce design system (Phase 2C) — this header carries the
          campaign's primary identity AND the live lifecycle controls
          (Start/Pause/Resume/Stop) — the single most operationally
          important row on the page. It previously had zero container
          weight while the secondary stats strip below it was fully
          boxed (flagged as a real hierarchy inversion in the Phase 1
          addendum). Now it gets real container weight; the stats strip
          keeps its lighter bg-card/40 treatment so the two read as
          primary/secondary, not two unrelated boxes. */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" size="sm" onClick={onBack}>
            ← Campaigns
          </Button>
          <div>
            <h1 className={typography.pageTitle}>{campaign.name}</h1>
            {campaign.description && <p className={typography.pageDescription}>{campaign.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => setSettingsOpen(true)}>
            Configuration
          </Button>
          <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => setHistoryOpen(true)}>
            History
          </Button>
          <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => setConfigHistoryOpen(true)}>
            Config History
          </Button>
          <CampaignStatusBadge status={campaign.status} />
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <Button size="sm" onClick={() => runAction(actions.start)} disabled={actions.start.isPending}>
              Start
            </Button>
          )}
          {campaign.status === 'running' && (
            <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => setLifecycleDialog('pause')} disabled={actions.pause.isPending}>
              Pause
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button size="sm" onClick={() => runAction(actions.resume)} disabled={actions.resume.isPending}>
              Resume
            </Button>
          )}
          {(campaign.status === 'running' || campaign.status === 'paused') && (
            <Button size="sm" variant="destructive" onClick={() => setLifecycleDialog('stop')} disabled={actions.stop.isPending}>
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
            {/* VoiceForce design system — neutral data-value rule: an
                ordinary summary count is not a warning badge. */}
            <span className="font-semibold tabular-nums text-foreground">{unclassified}</span>
            <span className="text-muted-foreground text-[11px]">unclassified / pending</span>
          </div>
        )}
        {isPolicyEnabled && (
          <>
            <div className="h-4 w-px bg-muted" aria-hidden="true" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold tabular-nums text-foreground">{campaign.stats.policyClassifiedCount}</span>
              <span className="text-muted-foreground text-[11px]">classified (policy)</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold tabular-nums text-foreground">{policyRate === null ? '—' : `${policyRate.toFixed(1)}%`}</span>
              <span className="text-muted-foreground text-[11px]">successful (policy)</span>
            </div>
          </>
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

      {/* Session 12.6 §16 — a campaign created before 12.6, or one whose
          agent advertised no outcomes to map, has no captured policy.
          Shown only when the agent genuinely has outcomes that COULD
          have been mapped, so this never clutters a campaign using an
          agent with none. Never synthesized — Call Outcome/Agent
          Outcome keep displaying exactly as Session 12.5 left them. */}
      {!campaign.outcomePolicySnapshot && (campaign.agentContractSnapshot?.expectedOutcomes.length ?? 0) > 0 && (
        <p className="text-[12px] text-muted-foreground px-3">
          No Outcome Policy captured for this campaign (legacy) — Agent Outcome is still shown per target where
          available, but no Campaign Classification is derived from it.
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <h2 className={typography.sectionTitle}>
            Targets ({campaign.stats.targetCount})
          </h2>
          <Button size="sm" variant="outline" className="h-7 text-[11px] border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => setAddTargetsOpen(true)}>
            Add Targets
          </Button>
        </div>
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
                <th className="text-left py-2 px-3 font-medium">Campaign Classification</th>
                <th className="text-left py-2 px-3 font-medium">Next Action</th>
                <th className="text-left py-2 px-3 font-medium">Follow-up Due</th>
                <th className="text-right py-2 px-3 font-medium">Attempts</th>
                <th className="text-center py-2 px-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.id} className="border-b border-border/60 last:border-b-0">
                  <td className="py-2 px-3 text-foreground">
                    {/* Session 13.1 (DEC-CUST-03) — target.customerId is a
                        real, non-nullable FK already on every target row;
                        this is the proven linkage, not a new lookup. */}
                    {target.customerId ? (
                      <button
                        type="button"
                        className="text-cyan-600 dark:text-cyan-400 hover:underline text-left"
                        onClick={() => navigate(`/customers/${target.customerId}`, { state: { origin: 'outbound-campaigns' } })}
                      >
                        {target.customerDisplayName ?? '—'}
                      </button>
                    ) : (
                      target.customerDisplayName ?? '—'
                    )}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{target.contactRawValue}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="border-border text-foreground" title={target.skipReasonCode ? `${target.skipReasonCode}${target.skipComment ? ': ' + target.skipComment : ''}` : target.holdReason ?? undefined}>
                      {target.status.replace('_', ' ')}
                    </Badge>
                    {target.originalSourceAttributes && (
                      <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1 border-border text-muted-foreground" title="Target data has been amended — original values preserved">
                        amended
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {target.effectiveResultId ? (
                      // VoiceForce design system — neutral data-value rule:
                      // an ordinary outcome column is not a status badge,
                      // so it doesn't get semantic success/failure color
                      // merely because the value is positive/negative.
                      <span className="text-foreground">
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
                  <td className="py-2 px-3">
                    {!campaign.outcomePolicySnapshot || !target.resultClassificationCode ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-foreground">{classificationLabel(classifications, target.resultClassificationCode)}</span>
                        {target.resultClassificationContractDrift && (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400"
                            title="No captured policy mapping for this agent outcome — safe fallback, not guessed."
                          >
                            drift
                          </Badge>
                        )}
                      </span>
                    )}
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
                          onClick={() => actions.retry.mutateAsync({ targetId: target.id, reason: null }).then(onRefetch)}
                        >
                          Retry
                        </Button>
                      )}
                      <TargetActionsMenu campaignId={campaign.id} target={target} />
                    </div>
                  </td>
                </tr>
              ))}
              {targets.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
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
          <AgentResultDialog
            campaign={campaign}
            target={target}
            configurationVersions={configurationVersions}
            onClose={() => setAgentResultTargetId(null)}
          />
        ) : null;
      })()}

      <ReasonDialog
        isOpen={lifecycleDialog !== null}
        title={lifecycleDialog === 'stop' ? 'Stop campaign' : 'Pause campaign'}
        description={
          lifecycleDialog === 'stop'
            ? 'Stopping is a terminal state — the campaign cannot be resumed afterwards. All history is preserved.'
            : 'The campaign can be resumed later from where it left off.'
        }
        confirmLabel={lifecycleDialog === 'stop' ? 'Stop campaign' : 'Pause campaign'}
        confirmVariant={lifecycleDialog === 'stop' ? 'destructive' : 'default'}
        isPending={lifecycleDialog === 'stop' ? actions.stop.isPending : actions.pause.isPending}
        onCancel={() => setLifecycleDialog(null)}
        onConfirm={(reason) => {
          const mutation = lifecycleDialog === 'stop' ? actions.stop : actions.pause;
          mutation.mutateAsync({ id: campaign.id, reason }).then(() => {
            setLifecycleDialog(null);
            onRefetch();
          });
        }}
      />

      {historyOpen && (
        <Dialog open onOpenChange={(open) => !open && setHistoryOpen(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Campaign History</DialogTitle>
              <DialogDescription className="text-xs">
                A read-only log of status changes, skips, holds, amendments, retries, and target additions for this
                campaign.
              </DialogDescription>
            </DialogHeader>
            <CampaignHistory campaignId={campaign.id} />
          </DialogContent>
        </Dialog>
      )}

      {configHistoryOpen && (
        <Dialog open onOpenChange={(open) => !open && setConfigHistoryOpen(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Configuration History</DialogTitle>
              <DialogDescription className="text-xs">
                Read-only. Every configuration version that has governed this campaign — Agent, Agent Contract, Input
                Mapping and Outcome Mapping — with the current version marked and a structural diff against the
                version before it.
              </DialogDescription>
            </DialogHeader>
            <CampaignConfigurationHistory campaign={campaign} />
          </DialogContent>
        </Dialog>
      )}

      {settingsOpen && (
        <CampaignSettingsDialog
          campaign={campaign}
          expectedCurrentVersionId={activeConfigurationVersion?.id ?? null}
          onClose={() => {
            setSettingsOpen(false);
            onRefetch();
          }}
        />
      )}

      {addTargetsOpen && (
        <AddTargetsDialog
          campaignId={campaign.id}
          onClose={() => {
            setAddTargetsOpen(false);
            onRefetch();
          }}
        />
      )}
    </div>
  );
};
