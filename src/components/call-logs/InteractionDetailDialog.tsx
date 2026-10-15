import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MetricStrip, type MetricStripItem } from '@/components/common/MetricStrip';
import { SectionCard } from '@/components/interaction-detail/SectionCard';
import { CollapsibleSectionCard } from '@/components/interaction-detail/CollapsibleSectionCard';
import { AgentContractSection } from '@/components/interaction-detail/AgentContractSection';
import { CallTechnicalPerformanceSection } from '@/components/interaction-detail/CallTechnicalPerformanceSection';
import { ConversationTranscript, type ConversationEntry } from '@/components/interaction-detail/ConversationTranscript';
import { AutomatedQaInlinePanel } from '@/components/qa/AutomatedQaInlinePanel';
import { InteractionTracePanel } from '@/components/interaction-detail/InteractionTracePanel';
import { Interaction, TranscriptEntry } from '@/types/interaction';
import { useInteractionTranscript } from '@/hooks/calls/useInteractionTranscript';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCampaignExecutionByInteraction } from '@/hooks/campaigns/useCampaigns';
import { useCallMetricsForInteraction } from '@/hooks/calls/useCallMetrics';
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

export type InteractionDetailDialogTab = 'overview' | 'trace' | 'qa' | 'agent';

interface InteractionDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  interaction: Interaction | null;
  /** Session 16.4.3.1 — which tab opens first. Defaults to 'overview' (the pre-existing single-pane behavior's natural equivalent). Used by `CallLogs.tsx` to reopen on a specific tab (e.g. 'qa') when returning from the Automated QA Inspector's "Open Full Inspector" round trip. */
  initialTab?: InteractionDetailDialogTab;
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
 *
 * Session 16.4.3.1 — four-tab restructure (brief: too many vertically
 * stacked sections). The identity/metric header above the tabs is
 * unchanged; everything that used to stack below it now groups into
 * Overview (Call Summary, Recording, Conversation — the three things a
 * reviewer reads first), Interaction Trace (unchanged `InteractionTracePanel`),
 * Automated QA (unchanged `AutomatedQaPanel`), and Agent Performance
 * (Agent Outcome, Agent Contract, Input Values Sent, Technical
 * Performance — everything about how the agent itself performed,
 * grouped together per the brief's own Tab 4 definition). No section's
 * content, data source, or behavior changed — only which container it
 * renders inside. The dialog's own size (`--dialog-large-*`) and the
 * shared `Tabs` primitive's presentation (`bg-muted`/`text-foreground`/
 * etc., already customer-configurable since Session 7.6+) are the only
 * two things this restructure centrally controls — see
 * docs/SESSION_16_4_3_1_INTERACTION_DETAIL_TABS.md for the full mapping
 * and the two real configuration-control acceptance tests.
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
  initialTab = 'overview',
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

  // Session 15.4 — Technical Performance (brief §5), the real per-call
  // Voice pipeline latency breakdown. Voice-only; the hook itself is
  // disabled for a chat interaction.
  const { data: technicalPerformance, isLoading: isTechnicalPerformanceLoading } = useCallMetricsForInteraction(interaction);

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
      {/* Session 16.4.3.1 — size resolves entirely from the
          customer-configurable `dialogs.large` role (schema.ts ->
          voiceforce.config.ts/katon.config.ts -> generateCssVariables.ts
          -> these 4 CSS vars). No literal vw/vh/px value here. */}
      <DialogContent className="w-[var(--dialog-large-width)] h-[var(--dialog-large-height)] max-w-[var(--dialog-large-max-width)] max-h-[var(--dialog-large-max-height)] overflow-hidden flex flex-col gap-2.5 p-5">
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

        {/* Session 16.4.3.1 — the four-tab restructure. `Tabs`/
            `TabsList`/`TabsTrigger`/`TabsContent` are the existing
            shared shadcn primitives (src/components/ui/tabs.tsx).
            Follow-up correction — per explicit visual feedback, the
            default `bg-muted` TabsList sitting directly on the
            dialog's own `bg-background` (nearly the same lightness in
            this theme) left the active tab barely distinguishable.
            Reused, not invented: `Analytics.tsx` and `Settings.tsx`
            are this app's two other multi-tab screens, and both
            already establish the same higher-contrast pattern —
            `bg-card border border-border` on `TabsList` (a crisp
            card surface against the page) plus
            `data-[state=active]:bg-muted` on `TabsTrigger` (a clearly
            separate shade for the active tab) — reused here
            byte-for-byte rather than introducing a third variant. */}
        <Tabs defaultValue={initialTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="flex-shrink-0 w-fit bg-card border border-border">
            <TabsTrigger value="overview" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Overview</TabsTrigger>
            <TabsTrigger value="trace" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Interaction Trace</TabsTrigger>
            <TabsTrigger value="qa" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Automated QA</TabsTrigger>
            <TabsTrigger value="agent" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Agent Performance</TabsTrigger>
          </TabsList>

          {/* TAB 1 — Overview: Call Summary, Recording, Conversation.
              ConversationTranscript manages its own internal flex-1/
              overflow-y-auto region (it's designed to be the one
              variable-height child of a bounded flex-col parent), so
              this tab's own wrapper is a flex column, NOT a second
              overflow-y-auto — avoiding a nested double scrollbar.

              `data-[state=active]:flex` instead of a bare `flex` —
              Session 16.4.3.1 bug fix. Radix's `TabsContent` ALWAYS
              keeps every tab's content mounted (it passes a function
              as `children` to its internal `Presence`, which forces
              `forceMount=true` unconditionally — `present`/`isSelected`
              only controls the DOM `hidden` attribute, confirmed by
              reading node_modules/@radix-ui/react-tabs's source). The
              inactive panels rely entirely on the browser's native
              `[hidden]{display:none}` user-agent rule to disappear —
              but a bare `flex` class is an AUTHOR-origin style, and
              author styles always beat user-agent styles in the CSS
              cascade regardless of specificity or source order. So an
              unconditional `flex` here kept this panel laid out (still
              consuming its `flex-1` share of the Tabs container's
              height) even while every OTHER tab was active, silently
              stealing space and pushing that tab's real content down —
              reproducing exactly the reported symptom (same ~500px gap
              regardless of the other tab's own content size, since the
              gap was never caused by that tab's content at all).
              Gating the `flex` behind `data-[state=active]:` means it
              only applies when Radix's own `data-state="active"`
              attribute is present, so an inactive panel has no authored
              `display` override and correctly falls back to the native
              `hidden`-driven `display:none`. */}
          <TabsContent value="overview" className="flex-1 min-h-0 hidden data-[state=active]:flex flex-col gap-2.5 mt-2.5">
            {/* Session 16.4.3.1 (brief §4) — Call Summary displays
                directly, no accordion: it's the first thing a reviewer
                reads on the default tab, so it shouldn't need an extra
                click the way the Agent Performance tab's sections
                (genuinely secondary, so defaulted open rather than
                hidden entirely) do. `SectionCard` (not
                `CollapsibleSectionCard`) is the existing always-visible
                variant of the exact same visual recipe. */}
            {/* Session 16.4.3.1 (Overview Recording layout correction) —
                the recording player moved into Call Summary's own header
                row (via SectionCard's existing `action` slot) rather than
                sitting in its own standalone panel below, per the user's
                explicit follow-up. No "Recording"/"Call Recording"
                heading is introduced — the player is identified by its
                native controls alone. `h-[var(--height-control)]`
                replaces the prior hardcoded `h-9`, consuming the same
                36px "everything else" control-height token Button's `sm`
                size already uses (newly exposed as a standalone CSS var
                for this site — see generateCssVariables.ts's
                heightDeclarations).
                Follow-up correction — per explicit visual feedback, the
                player previously sat right-aligned at a fixed `w-56`,
                reading as misplaced and too short. `actionFillsRow`
                places it immediately after the "CALL SUMMARY" title and
                lets it grow (`w-full` in place of `w-56`) to fill the
                remaining header-row width instead. SectionCard's header
                row still wraps (`flex-wrap`) so this drops to its own
                full-width line below the title on narrow widths rather
                than clipping. Renders only when a summary/tags/recording
                actually exists, same visibility rule the two source
                panels had individually. */}
            {(interaction.summary || (interaction.tags && interaction.tags.length > 0) || interaction.recording?.url) && (
              <div className="flex-shrink-0">
                <SectionCard
                  title="Call Summary"
                  actionFillsRow
                  action={
                    interaction.recording?.url ? (
                      <audio controls className="w-full h-[var(--height-control)]" src={interaction.recording.url}>
                        Your browser does not support the audio element.
                      </audio>
                    ) : undefined
                  }
                >
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
                </SectionCard>
              </div>
            )}

            {isActive && liveTranscript.isPollingCapped && (
              <p className="text-xs text-amber-700 dark:text-amber-400 flex-shrink-0">
                This call is still active. Live updates have paused after 60s to avoid excessive polling — use
                Refresh below to check for the latest transcript.
              </p>
            )}

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
          </TabsContent>

          {/* TAB 2 — Interaction Trace. Session 16.4.3.1 (brief §5) —
              the outer collapsed accordion is removed: the tab itself
              IS the trigger (`autoExpand`), so selecting this tab
              fetches and shows turns/status/version directly. Fine
              per-turn "Technical detail" disclosure is untouched.
              `hidden data-[state=active]:block` — see the Overview
              tab's comment above for why every TabsContent needs this
              explicit pattern (Radix keeps all four panels mounted at
              all times; without an authored display rule gated on the
              real `data-state`, an inactive panel's visibility depends
              entirely on the native `hidden` attribute, which a later
              unconditional `flex`/`block`/`grid` class elsewhere could
              silently re-break the same way the Overview tab's bare
              `flex` already did). */}
          <TabsContent value="trace" className="flex-1 min-h-0 hidden data-[state=active]:block overflow-y-auto mt-2.5">
            <InteractionTracePanel interactionId={interaction.interactionId} channel="call" autoExpand />
          </TabsContent>

          {/* TAB 3 — Automated QA. Session 16.4.3.1 (brief §6/§7) —
              real measurements/findings/evidence inline, via the new
              `AutomatedQaInlinePanel` (a SEPARATE component from
              `AutomatedQaPanel`, which stays untouched for Chat's own
              dialog — see that component's own header comment for the
              full rationale). "Open Full Inspector" carries real
              return-navigation state so the Inspector's Back button
              can bring the user back here, on this tab, for this
              interaction — only when reached this way. */}
          <TabsContent value="qa" className="flex-1 min-h-0 hidden data-[state=active]:block overflow-y-auto mt-2.5">
            <AutomatedQaInlinePanel interactionId={interaction.interactionId} channel="voice" agentId={interaction.agentId} />
          </TabsContent>

          {/* TAB 4 — Agent Performance: Agent Outcome, Agent Contract,
              Input Values Sent, Technical Performance — everything
              about how the agent itself performed on this interaction,
              grouped together per the brief's own Tab 4 definition.
              Same data, same loading/empty-state logic as before.
              Session 16.4.3.1 (brief §8) — all three (Agent Outcome,
              Agent Contract, Technical Performance) are now expanded
              by default (`defaultOpen`), not collapsed — unlike
              Overview's Call Summary (always fully visible, no
              accordion at all), these stay genuine accordions so a
              reviewer who doesn't need them can still collapse any
              one, but the default state shows everything without an
              extra click. */}
          <TabsContent value="agent" className="flex-1 min-h-0 hidden data-[state=active]:block overflow-y-auto mt-2.5 space-y-2.5">
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
                <CollapsibleSectionCard title="Agent Outcome" defaultOpen>
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

            <AgentContractSection contract={agentContract} defaultOpen />

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

            <CallTechnicalPerformanceSection metrics={technicalPerformance} isLoading={isTechnicalPerformanceLoading} defaultOpen />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
