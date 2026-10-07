import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ListChecks, Phone, MessageCircle, LayoutList, Network, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallData } from '@/hooks/calls/useCallData';
import { useChatLogs } from '@/hooks/chat/useChatLogs';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import { Interaction } from '@/types/interaction';
import {
  formatDurationLong,
  formatFractionAsPercent,
  formatPercent,
  formatStatusLabel,
  formatTimestamp,
} from '@/lib/format';
import { useClassification } from '@/hooks/classification/useClassification';
import { groupInteractions } from '@/lib/interactionGrouping';
import { GroupedInteractionTree, type SelectedGroup } from '@/components/classification/GroupedInteractionTree';
import { ActiveFilterChips } from '@/components/common/ActiveFilterChips';
import { FilterPopover } from '@/components/common/FilterPopover';
import { typography } from '@/lib/typography';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { QaReviewDialog } from '@/components/qa/QaReviewDialog';
import { ClipboardCheck } from 'lucide-react';

type QARow = {
  key: string;
  channel: 'voice' | 'chat';
  agentId: string | null;
  agentName: string;
  startTime: string;
  durationSeconds?: number;
  outcome?: string;
  fcr?: boolean;
  intent?: string | null;
  intentAccuracyPct?: number;
  chatConfidenceFraction?: number | null;
  sentiment?: string;
  escalationTrigger?: string;
  authenticated?: boolean | null;
  latencyMs?: number | null;
  campaignName?: string;
  voiceInteraction?: Interaction;
  chatSessionId?: string;
};

const ALL = '__all__';

/**
 * Client-side pagination (follow-up fix, 2026-10-07) — this screen
 * merges two already-fetched, already-paginated sources (Calls + Chat
 * Logs) into one filterable list, so there is no single server page to
 * request further pages from; the page is sliced from the already-
 * loaded, filtered set instead. 10 rows is chosen so a full page plus
 * the toolbar/filter chrome above it fits one viewport without an outer
 * page scroll — only the table's own internal scroll region (if any)
 * absorbs overflow, and that overflow is now rare at this row count.
 */
const PAGE_SIZE = 8;

/**
 * Interaction Quality — Session 6.1. Replaces the former QAReview/
 * QualityScoring modules, which showed a fully fabricated review queue,
 * reviewer assignments, and a weighted 0-100 "quality score" computed
 * from a slider with no persistence (see
 * docs/CALL_CENTRE_SESSION6_1_QA_REVIEW_AUDIT.md). This list itself
 * remains interaction-centric and factual: it surfaces the same real
 * signals Call Logs/Chat Logs/Agent Detail already source, grouped as
 * Operational / Conversation / Technical signals, with no composite
 * score — that stays Session 6's explicit, separate design decision.
 * Session 16.1 adds the real, persisted manual review workflow as a
 * per-row entry point ("Human QA" column, Table view only) — see
 * src/components/qa/QaReviewDialog.tsx.
 */
const QAReview: React.FC = () => {
  const { data: callData, isLoading: callsLoading, isError: callsError, error: callsErr, refetch: refetchCalls, isFetching: callsFetching } =
    useCallData({ status: 'inactive', page_size: 50 });
  const { data: chatData, isLoading: chatLoading, isError: chatIsError, error: chatErr, refetch: refetchChat, isFetching: chatFetching } =
    useChatLogs(1);

  const { user } = useAuth();
  const canReview = hasPermission(user, 'qa.review');

  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);
  const [qaReviewTarget, setQaReviewTarget] = useState<{ channel: 'voice' | 'chat'; interactionId: string; agentId: string } | null>(null);

  const [channelFilter, setChannelFilter] = useState(ALL);
  const [agentFilter, setAgentFilter] = useState(ALL);
  const [outcomeFilter, setOutcomeFilter] = useState(ALL);
  const [escalationFilter, setEscalationFilter] = useState(ALL);
  const [fcrFilter, setFcrFilter] = useState(ALL);
  const [sentimentFilter, setSentimentFilter] = useState(ALL);
  const [intentSearch, setIntentSearch] = useState('');
  const [campaignOnly, setCampaignOnly] = useState(false);

  const [view, setView] = useState<'grouped' | 'table'>('grouped');
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);
  const classification = useClassification();

  const [page, setPage] = useState(1);

  const isLoading = callsLoading || chatLoading;
  const isError = callsError || chatIsError;

  const rows: QARow[] = useMemo(() => {
    const voiceRows: QARow[] = (callData?.interactions ?? []).map((call) => ({
      key: `voice-${call.interactionId}`,
      channel: 'voice',
      agentId: call.agentId ?? null,
      agentName: call.agentDisplayName ?? call.agentId ?? '—',
      startTime: call.startTime,
      durationSeconds: call.durationSeconds,
      outcome: call.outcome ?? call.status,
      fcr: call.fcr,
      intent: call.intent ?? null,
      intentAccuracyPct: call.intentAccuracy,
      sentiment: call.sentiment,
      escalationTrigger: call.escalation?.trigger,
      authenticated: call.wasAuthenticated ?? null,
      latencyMs: null, // no confirmed per-call/per-agent latency source for voice — never fabricated
      campaignName: call.campaignName,
      voiceInteraction: call,
    }));

    const chatRows: QARow[] = (chatData?.data ?? []).map((session) => ({
      key: `chat-${session.sessionId}`,
      channel: 'chat',
      agentId: session.agentId ?? null,
      agentName: session.agentName ?? session.agentId ?? '—',
      startTime: session.startedAt,
      outcome: formatStatusLabel(session.status),
      intent: session.latestIntent,
      chatConfidenceFraction: session.latestConfidence,
      authenticated: session.authenticated,
      latencyMs: session.latestLatencyMs,
      chatSessionId: session.sessionId,
    }));

    return [...voiceRows, ...chatRows].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }, [callData, chatData]);

  // Session 6.2 — the always-visible cross-channel Domain -> Category ->
  // Agent -> Channel tree (plan §9: Interaction Quality is the natural
  // combined-channel classified view since it already merges Voice+Chat).
  const grouped = useMemo(
    () => groupInteractions(rows.map((r) => ({ agentId: r.agentId, channel: r.channel })), classification.data, classification.agentsById),
    [rows, classification.data, classification.agentsById],
  );

  // Filter option sets are derived only from real values already present
  // in the fetched data — never a fabricated fixed enum.
  const agentOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.agentName).filter((a) => a && a !== '—'))).sort(),
    [rows],
  );
  const outcomeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.outcome).filter(Boolean))) as string[],
    [rows],
  );
  const sentimentOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sentiment).filter(Boolean))) as string[],
    [rows],
  );

  const filteredRows = rows.filter((r) => {
    if (view === 'grouped' && selectedGroup && (r.agentId !== selectedGroup.agentId || r.channel !== selectedGroup.channel)) return false;
    if (channelFilter !== ALL && r.channel !== channelFilter) return false;
    if (agentFilter !== ALL && r.agentName !== agentFilter) return false;
    if (outcomeFilter !== ALL && r.outcome !== outcomeFilter) return false;
    if (escalationFilter !== ALL) {
      const hasEscalation = Boolean(r.escalationTrigger);
      if (escalationFilter === 'yes' && !hasEscalation) return false;
      if (escalationFilter === 'no' && hasEscalation) return false;
    }
    if (fcrFilter !== ALL) {
      if (fcrFilter === 'yes' && r.fcr !== true) return false;
      if (fcrFilter === 'no' && r.fcr !== false) return false;
    }
    if (sentimentFilter !== ALL && r.sentiment !== sentimentFilter) return false;
    if (intentSearch && !(r.intent ?? '').toLowerCase().includes(intentSearch.toLowerCase())) return false;
    if (campaignOnly && !r.campaignName) return false;
    return true;
  });

  // Reset to page 1 whenever the filtered set could change out from
  // under the current page (never leaves the user stranded on a page
  // past the new end).
  useEffect(() => {
    setPage(1);
  }, [channelFilter, agentFilter, outcomeFilter, escalationFilter, fcrFilter, sentimentFilter, intentSearch, campaignOnly, selectedGroup, view]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredRows.length);

  const handleRowClick = (row: QARow) => {
    if (row.channel === 'voice' && row.voiceInteraction) {
      setSelectedInteraction(row.voiceInteraction);
    } else if (row.channel === 'chat' && row.chatSessionId) {
      setSelectedChatSessionId(row.chatSessionId);
    }
  };

  const activeFilterCount =
    (channelFilter !== ALL ? 1 : 0) + (agentFilter !== ALL ? 1 : 0) + (outcomeFilter !== ALL ? 1 : 0) +
    (escalationFilter !== ALL ? 1 : 0) + (fcrFilter !== ALL ? 1 : 0) + (sentimentFilter !== ALL ? 1 : 0) +
    (campaignOnly ? 1 : 0);

  const clearAdvanced = () => {
    setChannelFilter(ALL);
    setAgentFilter(ALL);
    setOutcomeFilter(ALL);
    setEscalationFilter(ALL);
    setFcrFilter(ALL);
    setSentimentFilter(ALL);
    setCampaignOnly(false);
  };

  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) —
          Pattern A, same recipe as CallLogs.tsx: root fills Layout's main
          height and is a flex column; everything above the table is
          flex-shrink-0; the table alone is flex-1 min-h-0 overflow-auto. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <p className={`${typography.pageDescription} max-w-3xl flex-shrink-0`}>
          Review of real Voice and Chat interactions — Operational Signals (outcome, FCR, escalation),
          Conversation Signals (intent, confidence/accuracy, sentiment, authentication), Technical Signals
          (duration, latency where available). No composite quality score — see AI Agents for the agent-level
          breakdown. In Table view, use Human QA → Review to start or resume a manual quality review of an
          interaction.
        </p>

        {isError && (
          <QueryErrorBanner
            error={callsError ? callsErr : chatErr}
            onRetry={() => {
              void refetchCalls();
              void refetchChat();
            }}
            hasStaleData={rows.length > 0}
            isFetching={callsFetching || chatFetching}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <div className="relative w-52">
            <Input
              placeholder="Search intent…"
              value={intentSearch}
              onChange={(e) => setIntentSearch(e.target.value)}
              uiSize="sm"
              className="border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger uiSize="sm" className="w-32 border-border bg-card text-foreground"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All channels</SelectItem>
              <SelectItem value="voice">Voice</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
            </SelectContent>
          </Select>
          <FilterPopover activeCount={activeFilterCount} onClear={clearAdvanced}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Agent</label>
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Agent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All agents</SelectItem>
                    {agentOptions.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Outcome</label>
                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Outcome" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All outcomes</SelectItem>
                    {outcomeOptions.map((o) => (
                      <SelectItem key={o} value={o}>{formatStatusLabel(o)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Escalation</label>
                  <Select value={escalationFilter} onValueChange={setEscalationFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escalation" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any</SelectItem>
                      <SelectItem value="yes">Escalated</SelectItem>
                      <SelectItem value="no">Not escalated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block text-muted-foreground">FCR</label>
                  <Select value={fcrFilter} onValueChange={setFcrFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="FCR" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {sentimentOptions.length > 0 && (
                <div>
                  <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Sentiment</label>
                  <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sentiment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All sentiment</SelectItem>
                      {sentimentOptions.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={campaignOnly} onCheckedChange={(v) => setCampaignOnly(Boolean(v))} />
                Campaign interactions only
              </label>
            </div>
          </FilterPopover>
          <div className="flex-1" />
          <Button
            variant={view === 'grouped' ? 'default' : 'outline'}
            size="xs"
            className={view === 'grouped' ? '' : 'border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground'}
            onClick={() => setView('grouped')}
          >
            <Network className="h-3.5 w-3.5 mr-1.5" />
            Grouped
          </Button>
          <Button
            variant={view === 'table' ? 'default' : 'outline'}
            size="xs"
            className={view === 'table' ? '' : 'border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground'}
            onClick={() => { setView('table'); setSelectedGroup(null); }}
          >
            <LayoutList className="h-3.5 w-3.5 mr-1.5" />
            Table
          </Button>
        </div>

        {view === 'grouped' && !isLoading && rows.length > 0 && (
          <div className="flex-shrink-0 max-h-[30vh] overflow-y-auto">
            <GroupedInteractionTree group={grouped} selected={selectedGroup} onSelect={setSelectedGroup} countsAreExhaustive={false} />
          </div>
        )}

        <div className="flex-shrink-0">
          <ActiveFilterChips
            chips={[
              ...(channelFilter !== ALL ? [{ key: 'channel', label: `Channel: ${channelFilter}`, onRemove: () => setChannelFilter(ALL) }] : []),
              ...(agentFilter !== ALL ? [{ key: 'agent', label: `Agent: ${agentFilter}`, onRemove: () => setAgentFilter(ALL) }] : []),
              ...(outcomeFilter !== ALL ? [{ key: 'outcome', label: `Outcome: ${outcomeFilter}`, onRemove: () => setOutcomeFilter(ALL) }] : []),
              ...(escalationFilter !== ALL ? [{ key: 'escalation', label: `Escalation: ${escalationFilter}`, onRemove: () => setEscalationFilter(ALL) }] : []),
              ...(fcrFilter !== ALL ? [{ key: 'fcr', label: `FCR: ${fcrFilter}`, onRemove: () => setFcrFilter(ALL) }] : []),
              ...(sentimentFilter !== ALL ? [{ key: 'sentiment', label: `Sentiment: ${sentimentFilter}`, onRemove: () => setSentimentFilter(ALL) }] : []),
              ...(intentSearch ? [{ key: 'intent', label: `Intent: ${intentSearch}`, onRemove: () => setIntentSearch('') }] : []),
              ...(campaignOnly ? [{ key: 'campaign', label: 'Campaign interactions only', onRemove: () => setCampaignOnly(false) }] : []),
              ...(selectedGroup ? [{ key: 'group', label: 'Category/Agent group', onRemove: () => setSelectedGroup(null) }] : []),
            ]}
            onClearAll={() => {
              setChannelFilter(ALL);
              setAgentFilter(ALL);
              setOutcomeFilter(ALL);
              setEscalationFilter(ALL);
              setFcrFilter(ALL);
              setSentimentFilter(ALL);
              setIntentSearch('');
              setCampaignOnly(false);
              setSelectedGroup(null);
            }}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 flex-shrink-0">
          <ListChecks className="h-3.5 w-3.5" />
          {filteredRows.length === 0
            ? 'Interactions — 0 shown'
            : `Interactions — ${pageStart}–${pageEnd} of ${filteredRows.length}`}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No interactions match the current filters.</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {[
                    { label: 'Time', className: 'w-24' },
                    { label: 'Channel', className: 'w-20' },
                    { label: 'Agent', className: 'w-36' },
                    { label: 'Outcome', className: 'w-24' },
                    { label: 'FCR', className: 'w-12' },
                    { label: 'Escalation', className: 'w-24' },
                    { label: 'Intent', className: 'w-28' },
                    { label: 'Acc/Conf', className: 'w-16' },
                    { label: 'Sentiment', className: 'w-20' },
                    { label: 'Auth', className: 'w-12' },
                    { label: 'Dur/Latency', className: 'w-20' },
                    { label: 'Campaign', className: 'w-28' },
                    ...(canReview ? [{ label: 'Human QA', className: 'w-24' }] : []),
                  ].map((h) => (
                    <TableHead key={h.label} className={`${typography.tableHeader} ${h.className}`}>{h.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map((row) => (
                  <TableRow
                    key={row.key}
                    className="cursor-pointer border-border/60 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleRowClick(row);
                      }
                    }}
                  >
                    <TableCell className={`w-24 whitespace-nowrap ${typography.metadata}`}>{formatTimestamp(row.startTime)}</TableCell>
                    <TableCell className="w-20">
                      <Badge variant="outline" className="flex items-center gap-1 w-fit text-xs border-slate-600 text-foreground">
                        {row.channel === 'voice' ? <Phone className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                        {row.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className={`w-36 truncate ${typography.tableBody}`} title={row.agentName}>{row.agentName}</TableCell>
                    <TableCell className={`w-24 truncate ${typography.tableBody}`}>{row.outcome ? formatStatusLabel(row.outcome) : '—'}</TableCell>
                    <TableCell className={`w-12 ${typography.tableBody}`}>{row.channel === 'voice' ? (row.fcr ? 'Yes' : 'No') : '—'}</TableCell>
                    <TableCell className="w-24">
                      {row.escalationTrigger ? (
                        <Badge variant="destructive" className="text-xs truncate max-w-full" title={row.escalationTrigger}>{row.escalationTrigger}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{row.channel === 'voice' ? 'No' : '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className={`w-28 truncate ${typography.tableBody}`} title={row.intent ?? undefined}>{row.intent ?? '—'}</TableCell>
                    <TableCell className={`w-16 ${typography.tableBody}`}>
                      {row.channel === 'voice'
                        ? formatPercent(row.intentAccuracyPct, 0)
                        : row.chatConfidenceFraction != null
                          ? formatFractionAsPercent(row.chatConfidenceFraction)
                          : '—'}
                    </TableCell>
                    <TableCell className={`w-20 truncate ${typography.tableBody}`}>{row.channel === 'voice' ? (row.sentiment ?? '—') : '—'}</TableCell>
                    <TableCell className={`w-12 ${typography.tableBody}`}>
                      {row.authenticated === null || row.authenticated === undefined ? '—' : row.authenticated ? 'Yes' : 'No'}
                    </TableCell>
                    <TableCell className={`w-20 whitespace-nowrap ${typography.tableBody}`}>
                      {row.channel === 'voice'
                        ? formatDurationLong(row.durationSeconds)
                        : row.latencyMs != null
                          ? `${row.latencyMs}ms`
                          : '—'}
                    </TableCell>
                    <TableCell className={`w-28 truncate ${typography.metadata}`} title={row.campaignName}>{row.campaignName ?? '—'}</TableCell>
                    {canReview && (
                      <TableCell className="w-24">
                        {row.agentId ? (
                          <Button
                            variant="outline"
                            size="xs"
                            className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              const interactionId = row.channel === 'voice' ? row.voiceInteraction?.interactionId : row.chatSessionId;
                              if (interactionId) setQaReviewTarget({ channel: row.channel, interactionId, agentId: row.agentId as string });
                            }}
                          >
                            <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                            Review
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && filteredRows.length > 0 && (
          <div className="flex items-center justify-between flex-shrink-0 text-xs text-muted-foreground px-1">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

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
      <QaReviewDialog
        isOpen={Boolean(qaReviewTarget)}
        onClose={() => setQaReviewTarget(null)}
        channel={qaReviewTarget?.channel ?? 'voice'}
        interactionId={qaReviewTarget?.interactionId ?? null}
        agentId={qaReviewTarget?.agentId ?? null}
      />
    </Layout>
  );
};

export default QAReview;
