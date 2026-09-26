import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ListChecks, Phone, MessageCircle, LayoutList, Network } from 'lucide-react';
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
 * Read-only Interaction Quality review — Session 6.1. Replaces the
 * former QAReview/QualityScoring modules, which showed a fully
 * fabricated review queue, reviewer assignments, and a weighted
 * 0-100 "quality score" computed from a slider with no persistence
 * (see docs/CALL_CENTRE_SESSION6_1_QA_REVIEW_AUDIT.md). No manual-review
 * backend exists, so this screen is interaction-centric and factual:
 * it surfaces the same real signals Call Logs/Chat Logs/Agent Detail
 * already source, grouped as Operational / Conversation / Technical
 * signals, with no composite score — that stays Session 6's explicit,
 * separate design decision.
 */
const QAReview: React.FC = () => {
  const { data: callData, isLoading: callsLoading, isError: callsError, error: callsErr, refetch: refetchCalls, isFetching: callsFetching } =
    useCallData({ status: 'inactive', page_size: 50 });
  const { data: chatData, isLoading: chatLoading, isError: chatIsError, error: chatErr, refetch: refetchChat, isFetching: chatFetching } =
    useChatLogs(1);

  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);

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

  const handleRowClick = (row: QARow) => {
    if (row.channel === 'voice' && row.voiceInteraction) {
      setSelectedInteraction(row.voiceInteraction);
    } else if (row.channel === 'chat' && row.chatSessionId) {
      setSelectedChatSessionId(row.chatSessionId);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <PageHeader
          pillar="Improve"
          title="Interaction Quality"
          description={
            <span className="max-w-3xl block">
              Read-only review of real Voice and Chat interactions — grouped as{' '}
              <span className="font-medium text-foreground">Operational Signals</span> (outcome, FCR,
              escalation), <span className="font-medium text-foreground">Conversation Signals</span>{' '}
              (intent, confidence/accuracy, sentiment, authentication), and{' '}
              <span className="font-medium text-foreground">Technical Signals</span> (duration, latency
              where available). There is no composite quality score here — see AI Agents for the
              agent-level Business Outcome / Conversational / Technical Performance breakdown. No manual
              review, reviewer assignment, or approval workflow exists yet; see the roadmap notes in
              docs/CALL_CENTRE_SESSION6_1_QA_REVIEW_AUDIT.md.
            </span>
          }
        />

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

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">By Domain / Category / Agent</h2>
          <div className="flex gap-1">
            <Button variant={view === 'grouped' ? 'default' : 'outline'} size="sm" onClick={() => setView('grouped')}>
              <Network className="h-4 w-4 mr-1" />
              Grouped View
            </Button>
            <Button
              variant={view === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setView('table');
                setSelectedGroup(null);
              }}
            >
              <LayoutList className="h-4 w-4 mr-1" />
              Table View
            </Button>
          </div>
        </div>

        {view === 'grouped' && !isLoading && rows.length > 0 && (
          <GroupedInteractionTree group={grouped} selected={selectedGroup} onSelect={setSelectedGroup} countsAreExhaustive={false} />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-center">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All channels</SelectItem>
                <SelectItem value="voice">Voice</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
              </SelectContent>
            </Select>

            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All agents</SelectItem>
                {agentOptions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Outcome" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All outcomes</SelectItem>
                {outcomeOptions.map((o) => (
                  <SelectItem key={o} value={o}>{formatStatusLabel(o)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={escalationFilter} onValueChange={setEscalationFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Escalation" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Escalation: any</SelectItem>
                <SelectItem value="yes">Escalated</SelectItem>
                <SelectItem value="no">Not escalated</SelectItem>
              </SelectContent>
            </Select>

            <Select value={fcrFilter} onValueChange={setFcrFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="FCR" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>FCR: any</SelectItem>
                <SelectItem value="yes">FCR: Yes</SelectItem>
                <SelectItem value="no">FCR: No</SelectItem>
              </SelectContent>
            </Select>

            {sentimentOptions.length > 0 && (
              <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Sentiment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sentiment</SelectItem>
                  {sentimentOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Input
              placeholder="Search intent…"
              value={intentSearch}
              onChange={(e) => setIntentSearch(e.target.value)}
              className="w-44"
            />

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={campaignOnly} onCheckedChange={(v) => setCampaignOnly(Boolean(v))} />
              Campaign interactions only
            </label>
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4" />
              Interactions ({filteredRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No interactions match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>FCR</TableHead>
                      <TableHead>Escalation</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead>Accuracy / Confidence</TableHead>
                      <TableHead>Sentiment</TableHead>
                      <TableHead>Authenticated</TableHead>
                      <TableHead>Duration / Latency</TableHead>
                      <TableHead>Campaign</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow
                        key={row.key}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleRowClick(row)}
                      >
                        <TableCell className="whitespace-nowrap text-xs">{formatTimestamp(row.startTime)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            {row.channel === 'voice' ? <Phone className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                            {row.channel}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.agentName}</TableCell>
                        <TableCell>{row.outcome ? formatStatusLabel(row.outcome) : '—'}</TableCell>
                        <TableCell>{row.channel === 'voice' ? (row.fcr ? 'Yes' : 'No') : '—'}</TableCell>
                        <TableCell>
                          {row.escalationTrigger ? (
                            <Badge variant="destructive" className="text-xs">{row.escalationTrigger}</Badge>
                          ) : row.channel === 'voice' ? 'No' : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.intent ?? '—'}</TableCell>
                        <TableCell>
                          {row.channel === 'voice'
                            ? formatPercent(row.intentAccuracyPct, 0)
                            : row.chatConfidenceFraction != null
                              ? formatFractionAsPercent(row.chatConfidenceFraction)
                              : '—'}
                        </TableCell>
                        <TableCell>{row.channel === 'voice' ? (row.sentiment ?? '—') : '—'}</TableCell>
                        <TableCell>
                          {row.authenticated === null || row.authenticated === undefined ? '—' : row.authenticated ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.channel === 'voice'
                            ? formatDurationLong(row.durationSeconds)
                            : row.latencyMs != null
                              ? `${row.latencyMs}ms`
                              : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.campaignName ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
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
    </Layout>
  );
};

export default QAReview;
