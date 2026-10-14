import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ListChecks, Phone, MessageCircle, ChevronLeft, ChevronRight, BarChart3, ChevronDown, History } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
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
import { ActiveFilterChips } from '@/components/common/ActiveFilterChips';
import { FilterPopover } from '@/components/common/FilterPopover';
import { typography } from '@/lib/typography';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { QaReviewDialog } from '@/components/qa/QaReviewDialog';
import { ClipboardCheck, ClipboardList, Bot, CheckCircle2 } from 'lucide-react';
import { useStartAutomatedQaEvaluation, useAutomatedQaEvaluations } from '@/hooks/qa/useAutomatedQa';
import type { AutomatedQaEvaluation } from '@/services/qa/automatedQaService';
import { useQaReviewStatuses } from '@/hooks/qa/useQa';
import type { QaReviewStatus } from '@/services/qa/qaService';

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

/** Compact, 24-hour, QA-table-local time format ("Oct 12, 18:05") — saves
 * the AM/PM suffix the shared formatTimestamp() always includes, kept
 * local to this table rather than changed app-wide. */
function formatCompactTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}


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
  const navigate = useNavigate();
  const { data: callData, isLoading: callsLoading, isError: callsError, error: callsErr, refetch: refetchCalls, isFetching: callsFetching } =
    useCallData({ status: 'inactive', page_size: 50 });
  const { data: chatData, isLoading: chatLoading, isError: chatIsError, error: chatErr, refetch: refetchChat, isFetching: chatFetching } =
    useChatLogs(1);

  const { user } = useAuth();
  const canReview = hasPermission(user, 'qa.review');
  const canRunAutomated = hasPermission(user, 'qa.automated.run');

  // Bulk review-status lookup so the "Human QA" column can show
  // "Reviewed"/"In Progress" instead of always "Review" — and so
  // clicking an already-submitted row opens that exact submitted review
  // read-only (viewReviewId) instead of silently start-or-resuming a
  // brand new one (the start RPC only ever resumes an IN-PROGRESS review
  // of the same interaction; a submitted one was previously invisible to
  // it, so re-clicking "Review" always began a fresh review).
  const { data: reviewStatuses } = useQaReviewStatuses();
  const reviewStatusByKey = useMemo(() => {
    const map = new Map<string, { id: string; status: QaReviewStatus }>();
    for (const r of reviewStatuses ?? []) {
      const key = `${r.channel}:${r.interactionId}`;
      const existing = map.get(key);
      // Prefer a submitted review over an in-progress one for display —
      // once any review is submitted, the interaction IS reviewed.
      if (!existing || (existing.status !== 'submitted' && r.status === 'submitted')) {
        map.set(key, { id: r.id, status: r.status });
      }
    }
    return map;
  }, [reviewStatuses]);

  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);
  const [qaReviewTarget, setQaReviewTarget] = useState<{ channel: 'voice' | 'chat'; interactionId: string; agentId: string; viewReviewId?: string } | null>(null);
  const startAutomatedQa = useStartAutomatedQaEvaluation();
  const [runningAutomatedFor, setRunningAutomatedFor] = useState<string | null>(null);

  // Bulk automated-evaluation lookup, same reasoning as the Human QA
  // status map above: once an interaction has an automated evaluation,
  // there's no need to run it again by default — the "Run Auto" button
  // becomes "Auto Run Completed" and opens the existing result instead
  // (the Interaction Detail dialog's own AutomatedQaPanel still offers
  // an explicit "Run Again" for anyone who genuinely wants a fresh run).
  const { data: automatedEvaluations } = useAutomatedQaEvaluations();
  const automatedStatusByKey = useMemo(() => {
    const map = new Map<string, { id: string; status: string }>();
    for (const e of automatedEvaluations ?? []) {
      const key = `${e.channel}:${e.interactionId}`;
      const existing = map.get(key);
      const rank = (s: string) => (s === 'completed' ? 3 : s === 'partial' ? 2 : s === 'running' || s === 'queued' ? 1 : 0);
      // The list is already newest-first (call_center_automated_qa_list
      // orders by created_at desc), so only overwrite on a STRICTLY
      // better status — ties keep the first (newest) one seen.
      if (!existing || rank(e.status) > rank(existing.status)) {
        map.set(key, { id: e.id, status: e.status });
      }
    }
    return map;
  }, [automatedEvaluations]);

  // Session 16.3.8 (B1/B3) — every evaluation per interaction, newest
  // first (the source list is already ordered that way), for the
  // "Previous evaluations" history entry on this listing. Re-run never
  // deletes or overwrites a prior evaluation (B2) — this is simply every
  // row that already exists, grouped by interaction.
  const automatedEvaluationsByKey = useMemo(() => {
    const map = new Map<string, AutomatedQaEvaluation[]>();
    for (const e of automatedEvaluations ?? []) {
      const key = `${e.channel}:${e.interactionId}`;
      const arr = map.get(key);
      if (arr) arr.push(e); else map.set(key, [e]);
    }
    return map;
  }, [automatedEvaluations]);

  const [channelFilter, setChannelFilter] = useState(ALL);
  const [agentFilter, setAgentFilter] = useState(ALL);
  const [outcomeFilter, setOutcomeFilter] = useState(ALL);
  const [escalationFilter, setEscalationFilter] = useState(ALL);
  const [fcrFilter, setFcrFilter] = useState(ALL);
  const [sentimentFilter, setSentimentFilter] = useState(ALL);
  const [intentSearch, setIntentSearch] = useState('');
  const [campaignOnly, setCampaignOnly] = useState(false);

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
  }, [channelFilter, agentFilter, outcomeFilter, escalationFilter, fcrFilter, sentimentFilter, intentSearch, campaignOnly]);

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
        <div className="flex items-start justify-between gap-3 flex-shrink-0">
          <p className={`${typography.pageDescription} max-w-3xl`}>
            Review of real Voice and Chat interactions — Operational Signals (outcome, FCR, escalation),
            Conversation Signals (intent, confidence/accuracy, sentiment, authentication), Technical Signals
            (duration, latency where available). No composite quality score — see AI Agents for the agent-level
            breakdown. Use Human QA → Review to start or resume a manual quality review of an interaction.
          </p>
          {hasPermission(user, 'qa.analytics.view') && (
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
              onClick={() => navigate('/qa-review/explorer')}
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Human QA Quality Explorer
            </Button>
          )}
        </div>

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
          <FilterPopover activeCount={activeFilterCount} onClear={clearAdvanced}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Channel</label>
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Channel" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All channels</SelectItem>
                    <SelectItem value="voice">Voice</SelectItem>
                    <SelectItem value="chat">Chat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
        </div>

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
          // Session 7.8 — centralized `panels.dense` token (rounded-md,
          // border-border, no background/padding — same real values).
          <div className="flex-1 min-h-0 overflow-auto rounded-[var(--panel-dense-radius)] border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {[
                    { label: 'Time', className: 'w-20' },
                    { label: '', className: 'w-8' },
                    { label: 'Agent', className: 'w-24' },
                    { label: 'Outcome', className: 'w-20' },
                    { label: 'FCR', className: 'w-10' },
                    { label: 'Escalation', className: 'w-20' },
                    { label: 'Intent', className: 'w-24' },
                    { label: 'Acc/Conf', className: 'w-14' },
                    { label: 'Sentiment', className: 'w-16' },
                    { label: 'Auth', className: 'w-10' },
                    { label: 'Dur/Lat', className: 'w-16' },
                    { label: 'Campaign', className: 'w-24' },
                    ...(canReview ? [{ label: 'Human QA', className: 'w-28' }] : []),
                    ...(canRunAutomated ? [{ label: 'Automated QA', className: 'w-36' }] : []),
                  ].map((h) => (
                    <TableHead key={h.label} className={`${typography.tableHeader} ${h.className} px-2`}>{h.label}</TableHead>
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
                    <TableCell className={`w-20 whitespace-nowrap px-2 ${typography.metadata}`}>{formatCompactTime(row.startTime)}</TableCell>
                    <TableCell className="w-8 px-1" title={row.channel === 'voice' ? 'Voice' : 'Chat'}>
                      {row.channel === 'voice' ? (
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="sr-only">{row.channel === 'voice' ? 'Voice' : 'Chat'}</span>
                    </TableCell>
                    <TableCell className={`w-24 truncate px-2 ${typography.tableBody}`} title={row.agentName}>{row.agentName}</TableCell>
                    <TableCell className={`w-20 truncate px-2 ${typography.tableBody}`}>{row.outcome ? formatStatusLabel(row.outcome) : '—'}</TableCell>
                    <TableCell className={`w-10 px-2 ${typography.tableBody}`}>{row.channel === 'voice' ? (row.fcr ? 'Yes' : 'No') : '—'}</TableCell>
                    <TableCell className="w-20 px-2">
                      {row.escalationTrigger ? (
                        <Badge variant="destructive" className="text-xs truncate max-w-full" title={row.escalationTrigger}>{row.escalationTrigger}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{row.channel === 'voice' ? 'No' : '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className={`w-24 truncate px-2 ${typography.tableBody}`} title={row.intent ?? undefined}>{row.intent ?? '—'}</TableCell>
                    <TableCell className={`w-14 px-2 ${typography.tableBody}`}>
                      {row.channel === 'voice'
                        ? formatPercent(row.intentAccuracyPct, 0)
                        : row.chatConfidenceFraction != null
                          ? formatFractionAsPercent(row.chatConfidenceFraction)
                          : '—'}
                    </TableCell>
                    <TableCell className={`w-16 truncate px-2 ${typography.tableBody}`}>{row.channel === 'voice' ? (row.sentiment ?? '—') : '—'}</TableCell>
                    <TableCell className={`w-10 px-2 ${typography.tableBody}`}>
                      {row.authenticated === null || row.authenticated === undefined ? '—' : row.authenticated ? 'Yes' : 'No'}
                    </TableCell>
                    <TableCell className={`w-16 whitespace-nowrap px-2 ${typography.tableBody}`}>
                      {row.channel === 'voice'
                        ? formatDurationLong(row.durationSeconds)
                        : row.latencyMs != null
                          ? `${row.latencyMs}ms`
                          : '—'}
                    </TableCell>
                    <TableCell className={`w-24 truncate px-2 ${typography.metadata}`} title={row.campaignName}>{row.campaignName ?? '—'}</TableCell>
                    {canReview && (() => {
                      const interactionId = row.channel === 'voice' ? row.voiceInteraction?.interactionId : row.chatSessionId;
                      const existingReview = interactionId ? reviewStatusByKey.get(`${row.channel}:${interactionId}`) : undefined;
                      return (
                        <TableCell className="w-28 px-2">
                          {row.agentId && interactionId ? (
                            <Button
                              variant="outline"
                              size="xs"
                              className={
                                existingReview?.status === 'submitted'
                                  ? 'border-emerald-600 bg-transparent text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400 dark:text-emerald-400'
                                  : 'border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground'
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setQaReviewTarget({
                                  channel: row.channel, interactionId, agentId: row.agentId as string,
                                  viewReviewId: existingReview?.status === 'submitted' ? existingReview.id : undefined,
                                });
                              }}
                            >
                              {existingReview?.status === 'submitted' ? (
                                <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                              ) : (
                                <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              {existingReview?.status === 'submitted' ? 'Reviewed' : existingReview?.status === 'in_progress' ? 'Resume' : 'Review'}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })()}
                    {canRunAutomated && (() => {
                      const interactionId = row.channel === 'voice' ? row.voiceInteraction?.interactionId : row.chatSessionId;
                      const existingAutomated = interactionId ? automatedStatusByKey.get(`${row.channel}:${interactionId}`) : undefined;
                      const history = interactionId ? automatedEvaluationsByKey.get(`${row.channel}:${interactionId}`) ?? [] : [];
                      const isDone = existingAutomated?.status === 'completed' || existingAutomated?.status === 'partial';
                      const isFailed = existingAutomated?.status === 'failed';
                      const isRunning = runningAutomatedFor === interactionId || existingAutomated?.status === 'running' || existingAutomated?.status === 'queued';
                      const triggerLabel = isRunning ? 'Evaluating…' : isDone ? 'Auto Run Completed' : isFailed ? 'Evaluation Failed' : 'Auto QA';
                      const runAgain = async () => {
                        if (!row.agentId || !interactionId) return;
                        setRunningAutomatedFor(interactionId);
                        try {
                          const evaluation = await startAutomatedQa.mutateAsync({ interactionId, channel: row.channel, agentId: row.agentId });
                          navigate(`/qa-review/automated/${evaluation.id}`);
                        } finally {
                          setRunningAutomatedFor(null);
                        }
                      };
                      return (
                        <TableCell className="w-36 px-2">
                          {!row.agentId || !interactionId ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : history.length === 0 ? (
                            // Session 16.3.8 — no evaluation exists yet: a
                            // single action ("Run Auto") that starts the
                            // first one. The View/Re-run/History split only
                            // makes sense once there's something to view.
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={runningAutomatedFor !== null && !isRunning}
                              title={runningAutomatedFor !== null && !isRunning ? 'Another evaluation is starting — please wait' : 'Run Automated QA evaluation'}
                              className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); void runAgain(); }}
                            >
                              {isRunning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Bot className="h-3.5 w-3.5 mr-1.5" />}
                              Run Auto
                            </Button>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  disabled={runningAutomatedFor !== null && runningAutomatedFor !== interactionId}
                                  title={isDone ? 'Automated QA — view, re-run, or browse history' : isFailed ? 'Last evaluation failed — view diagnostics or re-run' : 'Automated QA evaluation in progress'}
                                  className={
                                    isDone
                                      ? 'border-emerald-600 bg-transparent text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400 dark:text-emerald-400'
                                      : isFailed
                                        ? 'border-red-600 bg-transparent text-red-700 hover:bg-red-500/10 dark:border-red-400 dark:text-red-400'
                                        : 'border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground'
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {isRunning ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                  ) : isDone ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                  ) : (
                                    <Bot className="h-3.5 w-3.5 mr-1.5" />
                                  )}
                                  {triggerLabel}
                                  {!isRunning && <ChevronDown className="h-3 w-3 ml-1" />}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-64" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuItem
                                  disabled={!existingAutomated || isRunning}
                                  onClick={() => existingAutomated && navigate(`/qa-review/automated/${existingAutomated.id}`)}
                                >
                                  View latest evaluation
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={isRunning} onClick={() => void runAgain()}>
                                  Re-run QA
                                </DropdownMenuItem>
                                {history.length > 1 && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
                                      <History className="h-3 w-3" /> Previous evaluations
                                    </DropdownMenuLabel>
                                    {history.slice(0, 8).map((ev) => (
                                      <DropdownMenuItem key={ev.id} onClick={() => navigate(`/qa-review/automated/${ev.id}`)} className="text-xs">
                                        <span className="flex-1 truncate">{ev.completedAt ? formatTimestamp(ev.completedAt) : formatTimestamp(ev.createdAt)}</span>
                                        <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">{ev.status} · {ev.promptVersion}</span>
                                      </DropdownMenuItem>
                                    ))}
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      );
                    })()}
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
        viewReviewId={qaReviewTarget?.viewReviewId}
      />
    </Layout>
  );
};

export default QAReview;
