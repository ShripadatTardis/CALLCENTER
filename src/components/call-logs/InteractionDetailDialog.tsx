import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MetricStrip, type MetricStripItem } from '@/components/common/MetricStrip';
import { SectionCard } from '@/components/interaction-detail/SectionCard';
import { CollapsibleSectionCard } from '@/components/interaction-detail/CollapsibleSectionCard';
import { AgentContractSection } from '@/components/interaction-detail/AgentContractSection';
import { ConversationTranscript, type ConversationEntry } from '@/components/interaction-detail/ConversationTranscript';
import { Interaction, TranscriptEntry } from '@/types/interaction';
import { useInteractionTranscript } from '@/hooks/calls/useInteractionTranscript';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCampaignExecutionByInteraction } from '@/hooks/campaigns/useCampaigns';
import { buildAgentContractFromRoster } from '@/lib/campaignAgentContract';
import {
  formatDurationExact,
  formatDurationLong,
  formatFractionAsPercent,
  formatPercent,
  formatPhoneNumber,
  formatTimestamp,
} from '@/lib/format';
import { classifyActualOutcome, classifyStructuredOutputs, formatOutputValue } from '@/lib/campaignActualOutcome';

interface InteractionDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  interaction: Interaction | null;
}

/**
 * UI Session (2026-10-02) — theme-aligned rebuild. Reused primitives
 * (see the session report for the full audit): `MetricStrip` (the same
 * compact summary-row component Call Logs/Dashboard/Customer Detail
 * already use for their own key metrics), `Badge`'s existing
 * `positive`/`escalated`/`secondary` semantic variants (the same
 * mapping CallLogs.tsx's own table already uses for the Outcome
 * column), the `SectionCard`-style quiet container
 * (`rounded-md border border-border bg-card p-3`, uppercase muted
 * section label) already established by CustomerDetail.tsx and
 * CampaignDetail.tsx's result dialogs, and the sidebar's existing
 * cyan accent token for the one place a restrained AI/customer speaker
 * distinction is useful in Conversation. No new colors, no new font,
 * no new dialog shell — only `Dialog`/`DialogContent`/`DialogHeader`/
 * `DialogTitle` from the existing `@/components/ui/dialog`.
 *
 * Still the single shared detail surface for Call Logs, Campaign
 * Detail's Transcript/Recording, and Customer Detail's Voice timeline
 * lookup (all three already import this exact component) — redesigning
 * it once upgrades all three, per the session's explicit reuse
 * requirement. Data mapping, transcript source reconciliation, and
 * recording URL are all byte-for-byte unchanged from before this pass.
 */

function outcomeBadge(outcome: string | undefined): { label: string; variant: 'positive' | 'escalated' | 'secondary' } {
  if (!outcome) return { label: 'Unclassified', variant: 'secondary' };
  const label = outcome.charAt(0).toUpperCase() + outcome.slice(1);
  if (outcome === 'resolved') return { label, variant: 'positive' };
  if (outcome === 'escalated') return { label, variant: 'escalated' };
  return { label, variant: 'secondary' };
}

function speakerTreatment(speaker: string): { label: string; className: string } {
  switch (speaker) {
    case 'customer':
      return { label: 'Customer', className: 'text-foreground' };
    case 'ai':
      return { label: 'AI', className: 'text-cyan-700 dark:text-cyan-400' };
    case 'agent':
      return { label: 'Agent', className: 'text-foreground' };
    default:
      return { label: speaker.toUpperCase(), className: 'text-muted-foreground' };
  }
}

export const InteractionDetailDialog: React.FC<InteractionDetailDialogProps> = ({
  isOpen,
  onClose,
  interaction,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Real, live agent contract resolved from the roster by this
  // interaction's own agentId — never campaign-specific, never
  // fabricated (buildAgentContractFromRoster only ever reflects fields
  // the /agents API actually returned). Null when the agent can't be
  // resolved (e.g. a historical interaction whose agent id no longer
  // exists in the live roster) — the Agent Contract section and the
  // Agent Outcome classification below both render honestly either way.
  const { data: agentsData } = useAgents();
  const resolvedAgent = agentsData?.agents.find((a) => a.agentId === interaction?.agentId);
  const agentContract = resolvedAgent ? buildAgentContractFromRoster(resolvedAgent) : null;

  // Session 15.3 — the real input VALUES sent for this interaction
  // (distinct from Agent Contract above, which is only the field
  // DEFINITIONS). Resolved by interactionId alone — the Voice/Calls API
  // never carries a stable campaignId on a call record, so this cannot
  // be gated on interaction.campaignId. Honest either way: no execution
  // row at all means this was never campaign-triggered (or is outside
  // this user's Agent Scope), not that the data was lost.
  const { data: execution, isLoading: isExecutionLoading } = useCampaignExecutionByInteraction(interaction?.interactionId);

  const isActive = interaction?.status === 'active';
  const needsLiveFetch = isActive || (interaction?.transcript?.length ?? 0) === 0;

  const liveTranscript = useInteractionTranscript(interaction?.interactionId, {
    enabled: isOpen && Boolean(interaction) && needsLiveFetch,
    poll: isOpen && isActive,
  });

  const transcript: TranscriptEntry[] = useMemo(() => {
    if (needsLiveFetch && liveTranscript.data?.transcript?.length) {
      return liveTranscript.data.transcript;
    }
    return interaction?.transcript ?? [];
  }, [needsLiveFetch, liveTranscript.data, interaction?.transcript]);

  const conversationEntries: ConversationEntry[] = transcript.map((entry, index) => {
    const speaker = speakerTreatment(entry.speaker);
    return {
      key: index,
      speakerLabel: speaker.label,
      speakerClassName: speaker.className,
      timestamp: entry.timestamp,
      text: entry.text,
      metaParts: [
        entry.sentiment || null,
        entry.confidence !== undefined ? `${formatFractionAsPercent(entry.confidence)} confidence` : null,
      ].filter((p): p is string => Boolean(p)),
    };
  });

  if (!interaction) return null;

  const outcome = outcomeBadge(interaction.outcome);

  // Session note (see §5 of the report): every `interaction.analysis`
  // sub-field was confirmed, across a live sample, to always mirror an
  // already-shown top-level field 1:1 (sentimentTrend === sentiment,
  // resolutionStatus === outcome, confidenceScore === intentAccuracy,
  // keyTopics === tags) — never genuinely unique data. The separate
  // "Call Centre analysis" box is therefore not rendered; nothing from
  // it is dropped, since every value it held is already shown in Key
  // Metrics (Intent confidence, Sentiment), the header badge (outcome),
  // or the Call Summary tag chips (tags).

  const keyMetrics: MetricStripItem[] = [
    {
      label: 'Duration',
      value: formatDurationLong(interaction.durationSeconds),
      hint: formatDurationExact(interaction.durationSeconds),
    },
    {
      label: 'FCR',
      value: interaction.fcr === undefined ? '—' : interaction.fcr ? 'Yes' : 'No',
    },
    {
      // Deliberately labeled "confidence", not "accuracy" — this is the
      // agent's own reported confidence in its intent classification,
      // never a measured/verified accuracy figure (see report §4).
      label: 'Intent confidence',
      value: formatPercent(interaction.intentAccuracy, 0),
    },
    {
      label: 'Sentiment',
      value: interaction.sentiment ?? '—',
    },
  ];

  const secondaryFacts: Array<[string, React.ReactNode]> = [
    ['Phone', formatPhoneNumber(interaction.phoneNumber)],
    [
      'Authenticated',
      interaction.wasAuthenticated === null || interaction.wasAuthenticated === undefined
        ? 'N/A'
        : interaction.wasAuthenticated
          ? 'Yes'
          : 'No',
    ],
    ['Escalation', interaction.escalation?.trigger ?? 'None'],
    ['Campaign', interaction.campaignName ?? '—'],
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[92vh] max-h-[92vh] overflow-hidden flex flex-col gap-2.5 p-5">
        <DialogHeader className="space-y-1 flex-shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground truncate">
                {interaction.callerName || formatPhoneNumber(interaction.phoneNumber)}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {[interaction.direction, interaction.agentDisplayName ?? interaction.agentId, formatTimestamp(interaction.startTime)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Badge variant={outcome.variant} className="flex-shrink-0 mt-0.5">
              {outcome.label}
            </Badge>
          </div>
          <p className="text-xs font-mono text-muted-foreground truncate">Interaction ID {interaction.interactionId}</p>
        </DialogHeader>

        <div className="flex-shrink-0">
          <MetricStrip items={keyMetrics} />
        </div>

        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-muted-foreground px-0.5 flex-shrink-0">
          {secondaryFacts.map(([label, value]) => (
            <span key={label}>
              <span className="text-muted-foreground">{label}:</span> <span className="text-foreground">{value}</span>
            </span>
          ))}
        </div>

        {(interaction.summary || (interaction.tags && interaction.tags.length > 0)) && (
          <CollapsibleSectionCard title="Call Summary">
            {interaction.summary && <p className="text-sm text-foreground leading-relaxed">{interaction.summary}</p>}
            {interaction.tags && interaction.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {interaction.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </CollapsibleSectionCard>
        )}

        {/* Session 13.2 (DEC-CALL-01, §20) — "candidate for user-facing
            exposure" when genuinely populated; historical/Chat-sourced
            interactions correctly render nothing here (no empty section,
            per §21). Reuses the exact Session 12.5/12.6 classification
            helpers Campaign's own Agent Result dialog uses. Session 15.2
            follow-up — now passes the interaction's own live agent
            contract (resolved above by agentId) instead of null, so
            field display names/required-ness resolve to the agent's
            real declared contract rather than a generic fallback; this
            still does not duplicate Campaign Detail's Agent Result
            dialog, which additionally shows Campaign Classification
            against the campaign's captured (possibly historical) outcome
            policy snapshot — out of scope here, this is always the
            agent's CURRENT live contract. */}
        {(() => {
          const actualOutcome = classifyActualOutcome(agentContract, interaction.actualOutcomeCode ?? null, interaction.actualOutcomeName ?? null);
          const outputFields = classifyStructuredOutputs(agentContract, interaction.structuredOutputs ?? null);
          if (actualOutcome.availability === 'unavailable' && outputFields.length === 0) return null;
          return (
            <CollapsibleSectionCard title="Agent Outcome">
              {actualOutcome.availability !== 'unavailable' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{actualOutcome.displayName ?? actualOutcome.code}</span>
                </div>
              )}
              {outputFields.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {outputFields.map((f) => (
                    <div key={f.fieldCode} className="text-xs">
                      <span className="text-muted-foreground">{f.displayName}:</span>{' '}
                      <span className="text-foreground break-words">{formatOutputValue(f.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSectionCard>
          );
        })()}

        <AgentContractSection contract={agentContract} />

        {/* Session 15.3 — only rendered once a matching execution is
            actually confirmed to exist, same as Agent Outcome above
            renders nothing when there's genuinely no data; most
            calls/chats are not campaign-triggered at all (no stable
            campaignId is even available upstream to gate on — see the
            hook's own comment), so showing a permanent empty "not
            applicable" row on every interaction would be worse noise
            than the brief loading gap while this single-row lookup
            resolves. */}
        {!isExecutionLoading && execution && (() => {
          const agentInputs = (execution.requestPayloadSnapshot?.agent_inputs ?? null) as Record<string, unknown> | null;
          const declaredFields = agentContract?.expectedInputFields ?? [];
          return (
            <CollapsibleSectionCard title="Input Values Sent">
              {!agentInputs || Object.keys(agentInputs).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No declared input-field values were captured for this execution (legacy/partial contract at the
                  time it ran, or the agent declares no input fields).
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(agentInputs).map(([fieldCode, value]) => {
                    const field = declaredFields.find((f) => f.fieldCode === fieldCode);
                    return (
                      <div key={fieldCode} className="text-xs">
                        <span className="text-muted-foreground">{field?.displayName ?? fieldCode}:</span>{' '}
                        <span className="text-foreground break-words">{formatOutputValue(value)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleSectionCard>
          );
        })()}

        <SectionCard title="Recording">
          {interaction.recording?.url ? (
            <audio controls className="w-full h-9" src={interaction.recording.url}>
              Your browser does not support the audio element.
            </audio>
          ) : (
            <p className="text-sm text-muted-foreground">Recording not available for this interaction.</p>
          )}
        </SectionCard>

        {isActive && liveTranscript.isPollingCapped && (
          <p className="text-xs text-amber-700 dark:text-amber-400 flex-shrink-0">
            This call is still active. Live updates have paused after 60s to avoid excessive polling — use Refresh
            below to check for the latest transcript.
          </p>
        )}

        {/* Session §7/§8 — the one scroll region: everything above is
            fixed-height, so Conversation gets whatever vertical space
            remains, with one predictable scrollbar rather than several
            competing boxes. Now the shared ConversationTranscript
            primitive (src/components/interaction-detail) — also used by
            Chat Detail — rather than a page-local implementation. */}
        <ConversationTranscript
          entries={conversationEntries}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          isLoading={liveTranscript.isLoading && needsLiveFetch}
          isError={liveTranscript.isError}
          onRetry={() => liveTranscript.refetch()}
          onRefresh={() => liveTranscript.refetch()}
          isRefreshing={liveTranscript.isFetching}
          showRefresh={needsLiveFetch}
        />
      </DialogContent>
    </Dialog>
  );
};
