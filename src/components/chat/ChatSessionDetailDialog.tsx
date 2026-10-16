import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check, UserRound } from 'lucide-react';
import { MetricStrip, type MetricStripItem } from '@/components/common/MetricStrip';
import { SectionCard } from '@/components/interaction-detail/SectionCard';
import { CollapsibleSectionCard } from '@/components/interaction-detail/CollapsibleSectionCard';
import { AgentContractSection } from '@/components/interaction-detail/AgentContractSection';
import { ConversationTranscript, type ConversationEntry } from '@/components/interaction-detail/ConversationTranscript';
import { AutomatedQaInlinePanel } from '@/components/qa/AutomatedQaInlinePanel';
import { ManualQaInlinePanel } from '@/components/qa/ManualQaInlinePanel';
import { InteractionTracePanel } from '@/components/interaction-detail/InteractionTracePanel';
import { useChatSessionDetail } from '@/hooks/chat/useChatSessionDetail';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCampaignExecutionByInteraction } from '@/hooks/campaigns/useCampaigns';
import { buildAgentContractFromRoster } from '@/lib/campaignAgentContract';
import { formatDurationLong, formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';
import { formatOutputValue } from '@/lib/campaignActualOutcome';
import type { InteractionDetailTab } from '@/lib/interactionDetailTabs';

interface ChatSessionDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  /** Session 16.5.1 — which tab opens first, same mechanism as Call
   * Logs' `InteractionDetailDialog`. Used by `ChatLogs.tsx` to reopen
   * on a specific tab (e.g. 'qa') when returning from the Automated QA
   * Inspector's "Open Full Inspector" round trip. */
  initialTab?: InteractionDetailTab;
}

/**
 * Session 16.5.1 — rebuilt onto the SAME five-tab workspace architecture
 * as Call Logs' `InteractionDetailDialog` (Overview, Interaction Trace,
 * Automated QA, Manual QA, Agent Performance): same `Tabs`/`TabsList`/
 * `TabsTrigger`/`TabsContent` primitives, same `--dialog-large-*`
 * centrally-configured sizing, same `AutomatedQaInlinePanel`/
 * `ManualQaInlinePanel` tab content Call Detail now uses — replacing
 * the prior flat, non-tabbed stack (which predated Call Detail's own
 * Session 16.4.3.1 tab rework and was never updated to match). Data
 * source and semantics (GET /api/v1/chat/sessions/{id}, local-fallback
 * flag) are unchanged — this is a presentation/structure rebuild.
 *
 * Chat-only facts (message count, data-source badge, trial badge,
 * Customer 360 link, copy-session-id, local-fallback banner) are
 * preserved; Call-only facts with no Chat equivalent (recording/audio
 * player, Technical Performance — voice-only per its own component
 * comment, Agent Outcome — `actualOutcomeCode`/`structuredOutputs` do
 * not exist on a chat session) are simply not rendered, never
 * fabricated.
 */

function speakerTreatment(role: 'user' | 'ai'): { label: string; className: string } {
  return role === 'ai'
    ? { label: 'AI', className: 'text-cyan-700 dark:text-cyan-400' }
    : { label: 'Customer', className: 'text-foreground' };
}

const CopySessionIdButton: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy session ID"
      className="inline-flex items-center justify-center p-1 -m-1 min-h-6 min-w-6 text-muted-foreground hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(sessionId);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard access denied — no crash, just no visual confirmation
        }
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </button>
  );
};

export const ChatSessionDetailDialog: React.FC<ChatSessionDetailDialogProps> = ({
  isOpen,
  onClose,
  sessionId,
  initialTab = 'overview',
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const { data, isLoading, isError, refetch, isFetching } = useChatSessionDetail(sessionId ?? undefined);
  // Real, live agent contract resolved from the roster by this
  // session's own agentId — same resolution InteractionDetailDialog
  // (Call Logs) uses, never fabricated, never campaign-specific.
  const { data: agentsData } = useAgents();
  const resolvedAgent = agentsData?.agents.find((a) => a.agentId === data?.session?.agentId);
  const agentContract = resolvedAgent ? buildAgentContractFromRoster(resolvedAgent) : null;

  // Session 16.5.1 (Agent Performance parity) — the same campaign-
  // execution lookup Call Detail uses, resolved by interactionId alone
  // (a chat session id is a valid interactionId for this lookup — the
  // hook itself is channel-agnostic). Renders nothing when no
  // execution row resolves, same honest-absence behavior as Call.
  const { data: execution, isLoading: isExecutionLoading } = useCampaignExecutionByInteraction(data?.session?.sessionId);

  const conversationEntries: ConversationEntry[] = useMemo(() => {
    if (!data) return [];
    return data.messages.map((m) => {
      const speaker = speakerTreatment(m.role);
      const meta = m.metadata;
      return {
        key: m.id,
        speakerLabel: speaker.label,
        speakerClassName: speaker.className,
        timestamp: formatTimestamp(m.timestamp),
        text: m.text,
        metaParts: meta
          ? [
              meta.intent || null,
              meta.confidence != null ? `${formatFractionAsPercent(meta.confidence)} confidence` : null,
              meta.dataSource || null,
              meta.latencyMs != null ? `${meta.latencyMs}ms` : null,
            ].filter((p): p is string => Boolean(p))
          : [],
      };
    });
  }, [data]);

  if (!sessionId) return null;

  const session = data?.session;

  const durationSeconds =
    session && session.startedAt && session.updatedAt
      ? Math.max(0, (new Date(session.updatedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
      : undefined;

  const keyMetrics: MetricStripItem[] = session
    ? [
        { label: 'Session span', value: formatDurationLong(durationSeconds) },
        { label: 'Messages', value: session.messageCount },
        { label: 'Authenticated', value: session.authenticated ? 'Yes' : 'No' },
        {
          label: 'Intent confidence',
          value: session.latestConfidence != null ? formatFractionAsPercent(session.latestConfidence) : '—',
        },
        {
          label: 'Latest latency',
          value: session.latestLatencyMs != null ? `${session.latestLatencyMs}ms` : '—',
        },
      ]
    : [];

  const sessionContext: Array<[string, React.ReactNode]> = session
    ? [
        ['Backend Customer ID', session.customerId ?? '—'],
        ['Contact / Phone', session.contactId ?? session.phoneNumber ?? '—'],
        ['Agent', session.agentName ?? session.agentId ?? '—'],
        ['Latest intent', session.latestIntent ?? '—'],
        [
          'Latest data source',
          session.latestDataSource ? (
            <Badge variant="outline" className="text-xs">
              {session.latestDataSource}
            </Badge>
          ) : (
            '—'
          ),
        ],
        // Session 13.2 (DEC-CHAT-01) — campaignId is a real, stable id;
        // campaignName is resolved server-side via the authoritative
        // campaigns table, never fabricated. A session with a campaignId
        // but no resolvable name still navigates, labeled "Campaign".
        [
          'Campaign',
          session.campaignId ? (
            <button
              type="button"
              className="text-cyan-600 dark:text-cyan-400 hover:underline inline-block min-h-6 p-1 -m-1"
              onClick={() => navigate(`/outbound-campaigns/${session.campaignId}`)}
            >
              {session.campaignName ?? 'Campaign'}
            </button>
          ) : (
            '—'
          ),
        ],
        // Session 13.2 — isTrial is `null` (shown as —) when no local
        // record exists at all for this upstream session; `No` only when
        // a local record confirms it affirmatively, never defaulted.
        [
          'Trial',
          session.isTrial === null ? '—' : session.isTrial ? (
            <Badge variant="secondary" className="text-xs">Trial</Badge>
          ) : (
            'No'
          ),
        ],
      ]
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Session 16.5.1 — size now resolves from the same customer-
          configurable `dialogs.large` role Call Detail uses, replacing
          the prior hardcoded `max-w-4xl h-[92vh] max-h-[92vh]`. */}
      <DialogContent className="w-[var(--dialog-large-width)] h-[var(--dialog-large-height)] max-w-[var(--dialog-large-max-width)] max-h-[var(--dialog-large-max-height)] overflow-hidden flex flex-col gap-2.5 p-5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-[var(--icon-size-large)] w-[var(--icon-size-large)] animate-spin text-muted-foreground" />
          </div>
        ) : isError || !session ? (
          <>
            <DialogHeader>
              <DialogTitle>Chat Session</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-destructive">Could not load this chat session.</p>
            <Button
              variant="outline"
              size="xs"
              className="w-fit border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? 'Retrying…' : 'Retry'}
            </Button>
          </>
        ) : (
          <>
            <DialogHeader className="space-y-1 flex-shrink-0">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold text-foreground truncate">
                    {session.resolvedCustomerLabel ?? session.contactId ?? session.phoneNumber ?? 'Unknown chat session'}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {['Chat session', session.agentName ?? session.agentId, formatTimestamp(session.startedAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  {/* Session 13.1 (DEC-CUST-03) — only rendered when a real
                      Customer 360 id was resolved server-side. */}
                  {session.customer360Id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-border bg-transparent text-foreground hover:bg-muted"
                      onClick={() => {
                        const id = session.customer360Id as string;
                        onClose();
                        navigate(`/customers/${id}`, { state: { origin: 'chat-logs' } });
                      }}
                    >
                      <UserRound className="h-3.5 w-3.5 mr-1" />
                      Customer 360
                    </Button>
                  )}
                  <Badge variant={session.status === 'active' ? 'secondary' : 'outline'}>
                    {formatStatusLabel(session.status)}
                  </Badge>
                </div>
              </div>
              <p className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                <span className="truncate min-w-0">Session ID {session.sessionId}</span>
                <CopySessionIdButton sessionId={session.sessionId} />
              </p>
            </DialogHeader>

            <div className="flex-shrink-0">
              <MetricStrip items={keyMetrics} />
            </div>

            {session.source === 'local-fallback' && (
              <div className="rounded-md border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex-shrink-0">
                Showing this app's local operational copy — the live chat history service didn't respond.
              </div>
            )}

            <Tabs defaultValue={initialTab} className="flex-1 min-h-0 flex flex-col">
              <TabsList className="flex-shrink-0 w-fit bg-card border border-border">
                <TabsTrigger value="overview" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Overview</TabsTrigger>
                <TabsTrigger value="trace" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Interaction Trace</TabsTrigger>
                <TabsTrigger value="qa" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Automated QA</TabsTrigger>
                <TabsTrigger value="manualQa" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Manual QA</TabsTrigger>
                <TabsTrigger value="agent" className="data-[state=active]:bg-muted data-[state=active]:text-foreground">Agent Performance</TabsTrigger>
              </TabsList>

              {/* TAB 1 — Overview: Session Context, Conversation. No
                  recording/audio player — a chat session has no
                  `recording.url` equivalent (brief §4), so Call
                  Detail's audio-player header-row slot is simply
                  omitted, not left as an empty placeholder.
                  `hidden data-[state=active]:flex` — see Call Detail's
                  identical comment: Radix keeps every TabsContent
                  mounted; an unconditional `flex`/`block` on an
                  inactive panel would keep consuming layout space. */}
              <TabsContent value="overview" className="flex-1 min-h-0 hidden data-[state=active]:flex flex-col gap-2.5 mt-2.5">
                <div className="flex-shrink-0">
                  <SectionCard title="Session Context">
                    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
                      {sessionContext.map(([label, value]) => (
                        <span key={label}>
                          <span className="text-muted-foreground">{label}:</span> <span className="text-foreground">{value}</span>
                        </span>
                      ))}
                    </div>
                  </SectionCard>
                </div>

                <ConversationTranscript
                  entries={conversationEntries}
                  searchTerm={searchTerm}
                  onSearchTermChange={setSearchTerm}
                  emptyLabel="No messages in this session."
                  enableCopyRaw
                />
              </TabsContent>

              {/* TAB 2 — Interaction Trace. `autoExpand` — the tab
                  selection itself is the trigger, no redundant outer
                  accordion (brief §6), matching Call Detail exactly.
                  `InteractionTracePanel` is already fully channel-
                  generic — no changes needed to the component itself. */}
              <TabsContent value="trace" className="flex-1 min-h-0 hidden data-[state=active]:block overflow-y-auto mt-2.5">
                <InteractionTracePanel interactionId={session.sessionId} channel="chat" autoExpand />
              </TabsContent>

              {/* TAB 3 — Automated QA. Session 16.5.1 — swapped from the
                  older, thinner `AutomatedQaPanel` to the same
                  `AutomatedQaInlinePanel` Call Detail uses (brief §7):
                  real measurements/findings/evidence inline, plus a
                  working "Open Full Inspector" return trip back to
                  Chat Logs on this exact tab (see
                  `automatedQaInspectorReturn.ts`'s broadened origin and
                  `ChatLogs.tsx`'s new reopen handling). */}
              <TabsContent value="qa" className="flex-1 min-h-0 hidden data-[state=active]:block overflow-y-auto mt-2.5">
                <AutomatedQaInlinePanel interactionId={session.sessionId} channel="chat" agentId={session.agentId ?? null} />
              </TabsContent>

              {/* TAB 4 — Manual QA (brief §8): the same dedicated tab
                  and `ManualQaInlinePanel` Call Detail uses, reusing the
                  existing Human QA implementation unchanged. */}
              <TabsContent value="manualQa" className="flex-1 min-h-0 hidden data-[state=active]:block overflow-y-auto mt-2.5">
                <ManualQaInlinePanel interactionId={session.sessionId} channel="chat" agentId={session.agentId ?? null} />
              </TabsContent>

              {/* TAB 5 — Agent Performance (brief §9): Call's sections
                  preserved where applicable, Chat showing only the
                  sections genuinely available for it, expanded by
                  default. Agent Outcome and Technical Performance are
                  NOT shown here — a chat session carries neither
                  `actualOutcomeCode`/`structuredOutputs` (Agent Outcome)
                  nor the voice pipeline latency breakdown
                  (`CallTechnicalPerformanceSection` is explicitly
                  voice-only per its own component comment) — rendering
                  either would fabricate data that doesn't exist for
                  this channel. */}
              <TabsContent value="agent" className="flex-1 min-h-0 hidden data-[state=active]:block overflow-y-auto mt-2.5 space-y-2.5">
                <AgentContractSection contract={agentContract} defaultOpen />

                {!isExecutionLoading && execution && (() => {
                  const agentInputs = (execution.requestPayloadSnapshot?.agent_inputs ?? null) as Record<string, unknown> | null;
                  const declaredFields = agentContract?.expectedInputFields ?? [];
                  return (
                    <CollapsibleSectionCard title="Input Values Sent" defaultOpen>
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
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
