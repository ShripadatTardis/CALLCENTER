import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricStrip } from '@/components/common/MetricStrip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Bot, ChevronDown, ChevronLeft, ChevronRight, Info, Loader2 } from 'lucide-react';
import { useAgentDetail } from '@/hooks/agents/useAgentDetail';
import { useClassification } from '@/hooks/classification/useClassification';
import { buildAgentContractFromRoster } from '@/lib/campaignAgentContract';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import type { Interaction } from '@/types/interaction';
import { resolveDetailOrigin, type DetailNavigationState } from '@/lib/detailOrigin';
import {
  formatDurationLong,
  formatFractionAsPercent,
  formatPercent,
  formatStatusLabel,
  formatTimestamp,
} from '@/lib/format';
import { typography } from '@/lib/typography';

const FALLBACK = '—';
const RECENT_INTERACTIONS_PAGE_SIZES = [5, 10, 25, 50] as const;
const DEFAULT_RECENT_INTERACTIONS_PAGE_SIZE = 5;

/**
 * Small, keyboard-accessible "Data notes" disclosure (Radix Popover —
 * click/Enter/Space to open, Escape to close, proper focus handling) —
 * the AGENT_DETAIL_UX_RESTRUCTURE session's replacement for long
 * provenance/limitation prose previously inlined under every metric
 * group. Nothing in the notes array is summarized away — every
 * sentence that was previously visible by default is still here,
 * verbatim, just one click away instead of always-on.
 */
const DataNotes: React.FC<{ notes: string[]; title?: string; ariaLabel?: string }> = ({
  notes,
  title = 'Data notes',
  ariaLabel = 'Data notes — field provenance and limitations',
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={ariaLabel}
        className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-80 text-xs space-y-1.5" align="end">
      <div className="font-semibold text-foreground">{title}</div>
      <ul className="space-y-1.5 text-muted-foreground list-disc list-inside">
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    </PopoverContent>
  </Popover>
);

/** A compact label/value pair for the Operational Performance grid — replaces one `flex justify-between` row per card, now in a responsive grid instead of three stacked full-width cards. */
const MetricRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-0.5">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-foreground text-sm tabular-nums">{value}</span>
  </div>
);

/**
 * One operational view per agent (docs/CALL_CENTRE_SESSION6_AGENTS_QUALITY_PLAN.md
 * §12) — every field traces to a real, already-confirmed source. Drill-down
 * reuses the existing Call Logs / Chat Session detail dialogs unmodified.
 *
 * AGENT_DETAIL_UX_RESTRUCTURE session — presentation/density pass only,
 * zero backend/semantic changes. Restructured into four layers (see
 * docs/AGENT_DETAIL_UX_RESTRUCTURE.md for the full before/after):
 *
 * A. Compact Agent Header — identity (name/id/default/direction/persona/
 *    language/Customer360 category) and the three usage counters
 *    consolidated into one bar, replacing four previously separate
 *    blocks (heading, contract-identity rows, MetricStrip, Customer360
 *    card).
 * B. Operational Performance — the same Business Outcomes/Conversational
 *    Quality/Technical Performance metrics as one compact grid instead of
 *    three large cards; provenance prose moved into a "Data notes"
 *    popover (DataNotes above) rather than always-on paragraphs.
 *    "Intent accuracy (voice)" relabeled "Intent confidence (voice)" —
 *    the underlying call-data `intent_accuracy` field is the model's own
 *    classifier confidence, never a measured accuracy against ground
 *    truth (the same finding already established for the Ratio Explorer
 *    registry's own `intent_accuracy` entry, Session 13.6) — the VALUE
 *    and its source are byte-for-byte unchanged, only the label is
 *    corrected.
 * C. Agent Contract — the full Session 13.3 contract exposure, now a
 *    collapsible section (default collapsed) with an at-a-glance summary
 *    line. A contract with zero declared inputs/outcomes/outputs (e.g.
 *    Inbound Banking Assistant) collapses the three previous "— none
 *    declared" headers into one concise sentence; the legacy/partial
 *    contract case is unchanged in substance, only in container.
 * D. Campaign Usage — unchanged data/semantics, compact MetricStrip.
 * E. Recent Interactions — unchanged identity/drill-through, given more
 *    visual priority by the density reduction above it.
 */
const AgentDetail: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = resolveDetailOrigin((location.state as DetailNavigationState | null)?.origin);
  const {
    agent,
    callInteractions,
    chatSessions,
    agentCampaigns,
    callMetrics,
    chatMetrics,
    campaignOutcomes,
    isLoading,
  } = useAgentDetail(agentId);

  const classification = useClassification();

  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [interactionsPage, setInteractionsPage] = useState(1);
  const [interactionsPageSize, setInteractionsPageSize] = useState<number>(DEFAULT_RECENT_INTERACTIONS_PAGE_SIZE);

  // Both source populations (callInteractions/chatSessions) are already
  // fully loaded in memory by useAgentDetail — this is a client-side
  // pagination over a genuinely complete bounded dataset (§2.B of the
  // Agent Detail density-pass brief), not a slice-and-discard of 20.
  // Merge BEFORE paginating so Voice and Chat interleave in one true
  // newest-first order; paginating each source independently and
  // concatenating pages would silently break chronological order.
  const allRecentInteractions = [
    ...callInteractions.map((i) => ({ kind: 'call' as const, at: i.startTime, call: i })),
    ...chatSessions.map((s) => ({ kind: 'chat' as const, at: s.updatedAt, chat: s })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Reset to page 1 whenever the agent changes (a stale page number from
  // a previous agent's longer history must never silently persist).
  useEffect(() => {
    setInteractionsPage(1);
  }, [agentId]);

  const interactionsTotalPages = Math.max(1, Math.ceil(allRecentInteractions.length / interactionsPageSize));
  const interactionsCurrentPage = Math.min(interactionsPage, interactionsTotalPages);
  const interactionsStart = (interactionsCurrentPage - 1) * interactionsPageSize;
  const recentInteractions = allRecentInteractions.slice(interactionsStart, interactionsStart + interactionsPageSize);

  // Customer 360 category mapping — VoiceForce's own agent_id -> category
  // assignment (never inferred from intent/transcript/sentiment), reusing
  // the existing classification endpoint — no new backend capability.
  const agentCategories = (classification.data?.categories ?? []).filter((c) => c.agentIds.includes(agentId ?? ''));

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-background min-h-full flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!agent) {
    return (
      <Layout>
        <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground p-4 space-y-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate(returnTo.path)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to {returnTo.label}
          </Button>
          <p className="text-sm text-muted-foreground px-1">
            No agent found for id "{agentId}" in the live roster (GET /api/v1/agents).
          </p>
        </div>
      </Layout>
    );
  }

  // Canonical Agent Contract (Session 9.1, already consumed by
  // Campaigns' CreateCampaign.tsx) — honestly 'legacy'/'partial' today
  // since the live /agents roster has no expected-input/outcome/output
  // metadata for some agents. Never fabricated here.
  const contract = buildAgentContractFromRoster(agent);
  const contractIsEmpty =
    contract.contractCompleteness === 'complete' &&
    contract.expectedInputFields.length === 0 &&
    contract.expectedOutcomes.length === 0 &&
    contract.outputFields.length === 0;
  const contractSummary =
    contract.contractCompleteness === 'partial'
      ? 'Not yet published by Partner API'
      : contractIsEmpty
        ? 'No declared inputs, outcomes or output fields'
        : `${contract.expectedInputFields.length} input${contract.expectedInputFields.length === 1 ? '' : 's'} · ${contract.expectedOutcomes.length} expected outcome${contract.expectedOutcomes.length === 1 ? '' : 's'} · ${contract.outputFields.length} output field${contract.outputFields.length === 1 ? '' : 's'}`;

  const performanceNotes = [
    'Voice business outcomes: call-data outcome/fcr, aggregated. Chat has no documented business-outcome field today — intentionally not shown.',
    'Intent confidence (voice/chat): the model\'s own classifier confidence, not a measured accuracy against a human-verified ground-truth label — never presented as "accuracy".',
    callMetrics.staleAhtExcludedCount > 0
      ? `${callMetrics.staleAhtExcludedCount} call${callMetrics.staleAhtExcludedCount === 1 ? '' : 's'} excluded from Avg handle time (implausible/stale duration, same 4h guard used elsewhere).`
      : null,
    'Per-agent voice turn latency has no confirmed API source today (analytics/metrics is global/direction-scoped only) — intentionally not shown.',
  ].filter((n): n is string => Boolean(n));

  // Session (Agent Detail density pass §1/§24) — traced exactly how each
  // source is bounded. Voice and Chat are NOT bounded the same way:
  // Chat is a genuine "this agent's own most recent 100 sessions" (the
  // live API is called with agentId, server-filtered). Voice is this
  // agent's share of the company-wide most-recent-100 call-data rows
  // (useCallData has no server-side agent filter; filtering happens
  // client-side after the fetch) — so a low-volume agent's older Voice
  // calls can fall outside that global window even though they're real,
  // recent-ish history for THIS agent. Never presented as "this agent's
  // last 100 calls" anywhere in this file for that reason.
  const recentInteractionsNotes = [
    'Chat: this agent\'s own most recent 100 chat sessions (server-filtered by agent).',
    'Voice: this agent\'s share of the most recent 100 call-data rows company-wide — if this agent has more history than shown, older Voice calls may currently be outside that global window. Not a per-agent cap.',
    'The count below reflects everything currently loaded for this agent, not this agent\'s all-time interaction total.',
  ];

  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) —
          Pattern B: root is the single scroll region. */}
      <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground p-4 space-y-2">
        <Button variant="ghost" size="sm" className="h-6 -ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate(returnTo.path)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to {returnTo.label}
        </Button>

        {/* A. Compact Agent Header — identity + counters, ONE bordered
            composition (vertical-density refinement, follow-up to the
            Phase 2 pilot review) instead of a bare identity row sitting
            above a separately-boxed metadata strip. Name/id share one
            line; direction/persona/language/category/counters sit below
            a thin divider within the same box. */}
        <div className="rounded-md border border-border bg-card/40 px-3 py-2 space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Bot className="h-5 w-5 text-cyan-400 shrink-0" />
            <h1 className={typography.pageTitle}>{agent.displayName}</h1>
            {agent.isDefault && <Badge variant="outline" className="text-xs border-slate-600 text-foreground">Default</Badge>}
            <span className="text-[11px] text-muted-foreground font-mono">{agent.agentId}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/50 pt-1 text-[13px]">
            <span><span className="text-muted-foreground">Direction</span> <span className="text-foreground">{formatStatusLabel(agent.direction)}</span></span>
            <span><span className="text-muted-foreground">Persona</span> <span className="text-foreground">{agent.personaName || FALLBACK}</span></span>
            <span><span className="text-muted-foreground">Language</span> <span className="text-foreground">{agent.language || FALLBACK}</span></span>
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-muted-foreground">Category</span>
              {agentCategories.length === 0 ? (
                <span className="text-foreground">{FALLBACK}</span>
              ) : (
                agentCategories.map((c) => (
                  <Badge key={c.id} variant="outline" className="text-[11px] py-0 px-1.5 border-slate-600 text-foreground">{c.name}</Badge>
                ))
              )}
            </span>
            <div className="h-4 w-px bg-muted" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5">
              <span className="font-semibold tabular-nums text-foreground">{callMetrics.callsHandled}</span>
              <span className="text-muted-foreground text-[11px]">Calls handled</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-semibold tabular-nums text-foreground">{chatMetrics.chatsHandled}</span>
              <span className="text-muted-foreground text-[11px]">Chats handled</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-semibold tabular-nums text-foreground">{campaignOutcomes.campaignCount}</span>
              <span className="text-muted-foreground text-[11px]">Campaigns</span>
            </span>
            {/* Session (Agent Detail UX restructure) HIG fix — counter
                scope ("most recent 100 rows") was previously reachable
                only via a hover-only native `title`, unreachable on
                touch/keyboard (WCAG 1.4.13). Same keyboard/tap-accessible
                Popover pattern as DataNotes below, not a third mechanism. */}
            <DataNotes
              title="Counter scope"
              ariaLabel="Counter scope — what each usage count is based on"
              notes={[
                'Calls handled: most recent 100 call-data rows.',
                'Chats handled: most recent 100 chat sessions.',
                'Campaigns: most recent 100 campaigns.',
              ]}
            />
          </div>
        </div>

        {/* B. Operational Performance — one compact grid instead of three
            large cards. Internal padding/gaps tightened (vertical-density
            refinement) without changing the approved typography scale. */}
        <div className="rounded-md border border-border bg-card p-2 space-y-1">
          <div className="flex items-center justify-between">
            <div className={typography.sectionTitle}>Operational Performance</div>
            <DataNotes notes={performanceNotes} />
          </div>
          {/* VoiceForce design system (Phase 2C) — the 3 sub-clusters were
              previously distinguished ONLY by a text-[10px] label and grid
              column position, no visual separation (flagged in the Phase 1
              addendum's hierarchy audit). Now each gets a light background
              tint — real grouping, not just a smaller label — matching the
              nested-tile recipe already used elsewhere on this page
              (bg-background/40, see the per-agent tiles pattern). */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5">
            <div className="space-y-0.5 bg-background/40 rounded p-1.5">
              <div className={typography.subsectionTitle}>Business Outcomes</div>
              <MetricRow label="Resolved" value={callMetrics.resolvedCount} />
              <MetricRow label="Escalated" value={callMetrics.escalatedCount} />
              <MetricRow label="FCR" value={callMetrics.fcrRate === null ? FALLBACK : formatFractionAsPercent(callMetrics.fcrRate)} />
            </div>
            <div className="space-y-0.5 bg-background/40 rounded p-1.5">
              <div className={typography.subsectionTitle}>Conversational Quality</div>
              <MetricRow label="Intent confidence (voice)" value={callMetrics.avgIntentAccuracy === null ? FALLBACK : formatPercent(callMetrics.avgIntentAccuracy)} />
              <MetricRow label="Intent confidence (chat)" value={chatMetrics.avgConfidence === null ? FALLBACK : formatFractionAsPercent(chatMetrics.avgConfidence)} />
              <MetricRow label="Sentiment (voice)" value={callMetrics.avgSentimentScore === null ? FALLBACK : callMetrics.avgSentimentScore.toFixed(2)} />
              <MetricRow label="Authenticated (voice/chat)" value={`${callMetrics.authenticatedCount} / ${chatMetrics.authenticatedCount}`} />
            </div>
            <div className="space-y-0.5 bg-background/40 rounded p-1.5">
              <div className={typography.subsectionTitle}>Technical Performance</div>
              <MetricRow label="Avg handle time (voice)" value={formatDurationLong(callMetrics.avgAhtSeconds ?? undefined)} />
              <MetricRow label="Avg turn latency (chat)" value={chatMetrics.avgLatencyMs === null ? FALLBACK : `${Math.round(chatMetrics.avgLatencyMs)} ms`} />
            </div>
          </div>
        </div>

        {/* C. Agent Contract — collapsible, collapsed by default; same Session 13.3 content, just not dominating the page. */}
        <Collapsible open={contractOpen} onOpenChange={setContractOpen}>
          <div className="rounded-md border border-border bg-card">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
                aria-expanded={contractOpen}
                aria-controls="agent-contract-panel"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {contractOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className={typography.sectionTitle}>Agent Contract</span>
                  <span className="text-sm text-foreground truncate">{contractSummary}</span>
                </span>
                <span className="text-[11px] text-muted-foreground flex-shrink-0">Source: {contract.contractSource}</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent id="agent-contract-panel">
              <div className="px-3 pb-3 pt-1 border-t border-border space-y-3 text-sm">
                {contract.contractCompleteness === 'partial' ? (
                  <p className="text-[11px] text-muted-foreground">
                    Expected inputs, expected outcomes and structured outputs are not yet published by the live Partner
                    API (contract source: legacy roster only). Nothing is fabricated here — this section will populate
                    automatically once the revised /agents contract is live.
                  </p>
                ) : contractIsEmpty ? (
                  <p className="text-[11px] text-muted-foreground">No declared inputs, outcomes or output fields for this agent.</p>
                ) : (
                  <>
                    {contract.expectedInputFields.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Expected Inputs</div>
                        <div className="space-y-1">
                          {contract.expectedInputFields.map((f) => (
                            <div key={f.fieldCode} className="flex flex-wrap items-baseline gap-x-2 text-xs" title={f.description}>
                              <span className="text-foreground font-medium">{f.displayName}</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1 border-border text-muted-foreground">{f.dataType || 'string'}</Badge>
                              {f.required ? (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1">Required</Badge>
                              ) : (
                                <span className="text-muted-foreground">Optional</span>
                              )}
                              {f.format && <span className="text-muted-foreground">Format: {f.format}</span>}
                              {f.allowedValues && f.allowedValues.length > 0 && (
                                <span className="text-muted-foreground">Values: {f.allowedValues.join(', ')}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {contract.expectedOutcomes.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Expected Outcomes</div>
                        <div className="flex flex-wrap gap-1.5">
                          {contract.expectedOutcomes.map((o) => (
                            <Badge key={o.outcomeCode} variant="outline" className="text-[10px] py-0 px-1.5 border-border text-foreground" title={o.description}>
                              {o.displayName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {contract.outputFields.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Output Fields</div>
                        <div className="space-y-1">
                          {contract.outputFields.map((f) => (
                            <div key={f.fieldCode} className="flex flex-wrap items-baseline gap-x-2 text-xs" title={f.description}>
                              <span className="text-foreground font-medium">{f.displayName}</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1 border-border text-muted-foreground">{f.dataType || 'string'}</Badge>
                              {f.nullable && <span className="text-muted-foreground">Nullable</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* D. Recent interactions — drill-down into existing detail mechanisms
            only. Session (Agent Detail density pass) — dense rows (~40-44px,
            matching the "G1 dense operational grid" convention already
            established on Call Logs/Live View: h-9 head, py-1.5 cells, not
            shadcn's default p-4/h-12), full pagination over the complete
            already-loaded merged population (never an arbitrary 20-row
            slice-and-discard), and a truthful scope disclosure for the
            Voice/Chat cap asymmetry traced in recentInteractionsNotes above.
            VoiceForce design system (Phase 2C) — previously three stacked
            flat pieces (free-floating heading, separately-boxed table, bare
            pagination row); now one cohesive card matching Operational
            Performance's own container recipe, so heading + table +
            pagination read as one section. Reordered ahead of Campaign Usage
            per the approved pilot spec — large-contract and small-contract
            agents retain the same section order either way. */}
        <div className="rounded-md border border-border bg-card p-2 space-y-1">
          <div className="flex items-center justify-between">
            <div className={typography.sectionTitle}>Recent Interactions</div>
            {allRecentInteractions.length > 0 && <DataNotes title="Interaction scope" ariaLabel="Interaction scope — what this list represents" notes={recentInteractionsNotes} />}
          </div>
          {allRecentInteractions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent interactions for this agent.</p>
          ) : (
            <>
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      {['Channel', 'When', 'Outcome / Status', ''].map((h) => (
                        <TableHead key={h} className="h-9 px-3 text-muted-foreground text-xs">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentInteractions.map((row) =>
                      row.kind === 'call' ? (
                        <TableRow key={`call-${row.call.interactionId}`} className="border-border/60 hover:bg-card">
                          <TableCell className="py-1.5 px-3"><Badge variant="outline" className="text-xs py-0 px-1.5 border-slate-600 text-foreground">Voice</Badge></TableCell>
                          <TableCell className="py-1.5 px-3 text-foreground text-xs whitespace-nowrap">{formatTimestamp(row.call.startTime)}</TableCell>
                          <TableCell className="py-1.5 px-3 text-foreground text-xs">{formatStatusLabel(row.call.outcome || row.call.status)}</TableCell>
                          <TableCell className="py-1.5 px-3 text-right">
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-muted" onClick={() => setSelectedInteraction(row.call)}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow key={`chat-${row.chat.sessionId}`} className="border-border/60 hover:bg-card">
                          <TableCell className="py-1.5 px-3"><Badge variant="outline" className="text-xs py-0 px-1.5 border-slate-600 text-foreground">Chat</Badge></TableCell>
                          <TableCell className="py-1.5 px-3 text-foreground text-xs whitespace-nowrap">{formatTimestamp(row.chat.updatedAt)}</TableCell>
                          <TableCell className="py-1.5 px-3 text-foreground text-xs">{formatStatusLabel(row.chat.status)}</TableCell>
                          <TableCell className="py-1.5 px-3 text-right">
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-muted" onClick={() => setSelectedChatSessionId(row.chat.sessionId)}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination footer — kept outside the table body (no nested
                  scroll region; §16 explicitly prefers pagination over a
                  second internal scrollbar). Always shown once there is at
                  least one row, so the page-size selector stays reachable
                  even on a single page. */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span role="status" aria-live="polite">
                  Showing {interactionsStart + 1}–{Math.min(interactionsStart + interactionsPageSize, allRecentInteractions.length)} of {allRecentInteractions.length} · Page {interactionsCurrentPage} of {interactionsTotalPages}
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span>Rows</span>
                    <Select
                      value={String(interactionsPageSize)}
                      onValueChange={(v) => {
                        setInteractionsPageSize(Number(v));
                        setInteractionsPage(1);
                      }}
                    >
                      <SelectTrigger aria-label="Rows per page" className="h-7 w-16 text-xs border-border bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECENT_INTERACTIONS_PAGE_SIZES.map((size) => (
                          <SelectItem key={size} value={String(size)} className="text-xs">
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      onClick={() => setInteractionsPage(Math.max(1, interactionsCurrentPage - 1))}
                      disabled={interactionsCurrentPage <= 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      onClick={() => setInteractionsPage(Math.min(interactionsTotalPages, interactionsCurrentPage + 1))}
                      disabled={interactionsCurrentPage >= interactionsTotalPages}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* E. Campaign Usage — unchanged data/semantics (Session 11.5A "latest attempt wins" policy), compact. Follows Recent Interactions per the approved pilot ordering. */}
        {agent.direction === 'outbound' && agentCampaigns.length > 0 && (
          <div className="space-y-1">
            <div className={`${typography.sectionTitle} px-1`} title="Reflects each target's current effective result (latest reconciled attempt) — see Session 11.5A">
              Campaign Usage
            </div>
            <MetricStrip
              items={[
                { label: 'Campaigns', value: campaignOutcomes.campaignCount },
                { label: 'Targets', value: campaignOutcomes.targetCount },
                { label: 'Classified', value: campaignOutcomes.classifiedCount },
                { label: 'Success rate', value: campaignOutcomes.successRate === null ? FALLBACK : formatFractionAsPercent(campaignOutcomes.successRate) },
              ]}
            />
          </div>
        )}

        <InteractionDetailDialog
          isOpen={Boolean(selectedInteraction)}
          onClose={() => setSelectedInteraction(null)}
          interaction={selectedInteraction}
        />
        <ChatSessionDetailDialog
          isOpen={Boolean(selectedChatSessionId)}
          onClose={() => setSelectedChatSessionId(null)}
          sessionId={selectedChatSessionId}
        />
      </div>
    </Layout>
  );
};

export default AgentDetail;
