import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { MetricStrip } from '@/components/common/MetricStrip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Search, FileText, UserPlus, Loader2 } from 'lucide-react';
import { useLiveCallData } from '@/hooks/calls/useLiveCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { AgentActivityPanel } from '@/components/agents/AgentActivityPanel';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import {
  formatDurationExact,
  formatDurationLong,
  formatFractionAsPercent,
  formatPhoneNumber,
  formatStatusLabel,
} from '@/lib/format';
import type { Interaction } from '@/types/interaction';

/**
 * Session 3: live data via call-data?status=active, polled every 4s
 * (useLiveCallData). The former industry-generated mock calls/agents,
 * the fake 1s local duration-increment simulation, the dead
 * Transfer-to-Human dialog (previously unreachable via `&& false &&`),
 * the hidden Listen-In/Mute controls, and the fabricated "Sarah
 * Johnson" fallback in the transfer-alerts panel are all removed —
 * none had backend support (per the Session 3 product decision, no
 * transfer/listen-in action is implemented without one).
 *
 * Session 11.2 (docs/SCREEN_REVIEW_02_LIVE_VIEW.md /
 * docs/SESSION_11_2_LIVE_VIEW_IMPLEMENTATION.md): focused refinement,
 * reusing the VoiceForce Operational Grid Standard established on
 * Dashboard (11.1/11.1A/11.1 XYZ/11.1 XYZ-A) rather than redesigning
 * this screen. Metric semantics/calculations are UNCHANGED — the three
 * disagreeing escalation signals (row Status badge vs. "Escalated
 * (live)" vs. "Escalations w/ trigger") are a real, documented, still-
 * OPEN Partner API clarification (see the doc), not resolved here.
 */
const LiveView: React.FC = () => {
  const navigate = useNavigate();
  const live = useLiveCallData();
  const agents = useAgents();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  const [selectedCall, setSelectedCall] = useState<Interaction | null>(null);

  const calls = live.data?.interactions ?? [];
  const summary = live.data?.summary;
  const agentRoster = agents.data?.agents ?? [];

  const filteredCalls = calls.filter((call) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      (call.callerName ?? '').toLowerCase().includes(term) ||
      call.phoneNumber.includes(searchTerm) ||
      (call.intent ?? '').toLowerCase().includes(term);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'escalated' ? call.outcome === 'escalated' : call.stage === statusFilter);

    const matchesIntent = intentFilter === 'all' || call.intent === intentFilter;

    return matchesSearch && matchesStatus && matchesIntent;
  });

  const connectingCount = summary?.connecting_calls ?? 0;
  const transferredCalls = calls.filter((call) => Boolean(call.escalation?.trigger));

  const uniqueIntents = [...new Set(calls.map((c) => c.intent).filter((v): v is string => Boolean(v)))];

  const getSentimentColor = (score?: number) => {
    if (score === undefined) return 'text-muted-foreground';
    if (score >= 0.7) return 'text-green-600';
    if (score >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Layout>
      {/* Session 11.2: bounded operational console. The page root fills
          the full height Layout's <main> makes available and is itself a
          flex column with min-h-0 — everything above the interaction
          table is fixed/compact (flex-shrink-0), and the table region
          alone is flex-1 + overflow-auto, so it is the one part of the
          screen that scrolls when call volume grows. 10, 50 or 500 rows
          must never make the *page* taller — only the table's own
          internal scroll region. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground flex-shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${live.isFetching ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
          <span>{live.isFetching ? 'Refreshing…' : 'Live — updates every 4s'}</span>
        </div>

        {live.isError && (
          <div className="flex-shrink-0">
            <QueryErrorBanner
              error={live.error}
              onRetry={() => void live.refetch()}
              hasStaleData={calls.length > 0}
              isFetching={live.isFetching}
            />
          </div>
        )}

        <div className="flex-shrink-0">
          <MetricStrip
            items={[
              { label: 'Active calls', value: live.isLoading ? '…' : summary?.active_calls ?? 0, hint: `${connectingCount} connecting` },
              { label: 'Escalated (live)', value: live.isLoading ? '…' : summary?.escalated_calls ?? 0, tone: 'warning' },
              { label: 'Avg handle time (active)', value: live.isLoading ? '…' : formatDurationLong(summary?.avg_handle_time_seconds), hint: formatDurationExact(summary?.avg_handle_time_seconds) },
              { label: 'Escalations w/ trigger', value: transferredCalls.length, tone: transferredCalls.length > 0 ? 'warning' : 'default' },
            ]}
          />
        </div>

        {/* Session 11.1A/11.2: compact "Agent Load" treatment (Dashboard's
            established pattern), not the old full agent-card roster —
            this screen's roster is uniquely live-scoped (same poll as the
            table), so it stays, but no longer dominates the fold. Bounded
            with max-h + overflow-y-auto so a much larger roster can never
            grow this fixed-height region. */}
        <div className="flex-shrink-0 max-h-[150px] overflow-y-auto">
          <AgentActivityPanel
            agents={agentRoster}
            activeInteractions={calls}
            isLoading={agents.isLoading}
            title="Agent Load"
            variant="compact"
            onAgentClick={(agentId) => navigate(`/ai-agents/${agentId}`, { state: { origin: 'live-view' } })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, number, or intent…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-7 text-xs border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs border-border bg-card text-foreground">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="connecting">Connecting</SelectItem>
              <SelectItem value="in-progress">In progress</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={intentFilter} onValueChange={setIntentFilter}>
            <SelectTrigger className="h-8 w-40 text-xs border-border bg-card text-foreground">
              <SelectValue placeholder="Intent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All intents</SelectItem>
              {uniqueIntents.map((intent) => (
                <SelectItem key={intent} value={intent}>{intent}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-1">{filteredCalls.length} shown</span>
        </div>

        {/* The interaction table is the sole flex-grow, internally-
            scrolling region on this page — see the header comment. */}
        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
        {live.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : live.isError && calls.length === 0 ? (
          <p className="text-sm text-muted-foreground px-3 py-4">Live calls are unavailable right now — see the error above.</p>
        ) : calls.length === 0 ? (
          <p className="text-sm text-muted-foreground px-3 py-4">No active calls right now.</p>
        ) : filteredCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground px-3 py-4">No active calls match the current search/filters.</p>
        ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Caller', 'Intent', 'Agent', 'Duration', 'Sentiment', 'Status', 'Actions'].map((h) => (
                    <TableHead key={h} className={`text-muted-foreground text-xs ${h === 'Duration' ? 'text-right' : ''}`}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.slice(0, 20).map((call) => {
                  const agentLabel = call.agentDisplayName ?? call.agentId ?? 'Unknown agent';
                  const statusValue = call.outcome === 'escalated' ? 'escalated' : (call.stage ?? call.status);
                  const statusVariant =
                    statusValue === 'escalated' ? 'escalated' : statusValue === 'resolved' ? 'positive' : 'secondary';
                  return (
                  <TableRow key={call.interactionId} className="border-border/60 hover:bg-card">
                    <TableCell className="max-w-[180px]">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{call.callerName || '—'}</div>
                        <div className="text-xs text-muted-foreground truncate">{formatPhoneNumber(call.phoneNumber)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap text-xs border-slate-600 text-foreground">{call.intent || '—'}</Badge>
                    </TableCell>
                    {/* Session 11.1 XYZ-A adaptive sizing (see docs/VOICEFORCE_
                        OPERATIONAL_GRID_STANDARD.md): a bounded-but-generous
                        min/max, not the old fixed max-w-[140px] that truncated
                        normal agent names ("Inbound Banking Assistant") even
                        with unused row width elsewhere. */}
                    <TableCell className="min-w-[7rem] max-w-[14rem]">
                      <span className="text-sm text-foreground truncate block" title={agentLabel}>{agentLabel}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono tabular-nums text-foreground whitespace-nowrap text-xs" title={formatDurationExact(call.durationSeconds)}>
                        {formatDurationLong(call.durationSeconds)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span className={`font-medium whitespace-nowrap text-xs ${getSentimentColor(call.sentimentScore)}`}>
                          {formatFractionAsPercent(call.sentimentScore)}
                        </span>
                        {call.sentimentScore !== undefined && (
                          <div className="w-10 bg-muted rounded-full h-1.5">
                            <div
                              className="bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 h-1.5 rounded-full"
                              style={{ width: `${call.sentimentScore * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Session 11.1 XYZ corporate semantic status language:
                          same field/label as before (outcome==='escalated'
                          takes precedence over stage/status — unchanged),
                          only the visual treatment is restrained instead of
                          a saturated destructive-red pill for every business
                          exception. */}
                      <Badge variant={statusVariant} className="whitespace-nowrap text-xs">
                        {formatStatusLabel(statusValue)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => setSelectedCall(call)}>
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            View Details
                          </Button>
                        </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Interaction Details - {call.callerName || call.phoneNumber}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Caller Information</Label>
                                    <div className="text-sm bg-muted p-3 rounded-lg">
                                      <p><strong>Name:</strong> {call.callerName || '—'}</p>
                                      <p><strong>Phone:</strong> {call.phoneNumber}</p>
                                      <p><strong>Intent:</strong> {call.intent || '—'}</p>
                                      <p><strong>Channel:</strong> {call.channel}</p>
                                      <p><strong>Direction:</strong> {call.direction ?? '—'}</p>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Call Details</Label>
                                    <div className="text-sm bg-muted p-3 rounded-lg">
                                      <p title={formatDurationExact(call.durationSeconds)}>
                                        <strong>Duration:</strong> {formatDurationLong(call.durationSeconds)}
                                      </p>
                                      <p><strong>Stage:</strong> {call.stage ?? call.status}</p>
                                      <p><strong>Sentiment:</strong> {formatFractionAsPercent(call.sentimentScore)}</p>
                                      <p><strong>Agent:</strong> {call.agentDisplayName ?? call.agentId ?? '—'}</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Recent Transcript</Label>
                                  <div className="bg-muted p-3 rounded-lg text-sm max-h-40 overflow-y-auto space-y-1">
                                    {call.transcript && call.transcript.length > 0 ? (
                                      call.transcript.slice(-6).map((entry, i) => (
                                        <p key={i}>
                                          <strong>{entry.speaker === 'ai' ? 'AI Agent' : 'Customer'}:</strong> {entry.text}
                                        </p>
                                      ))
                                    ) : (
                                      <p className="text-muted-foreground">No transcript available yet for this call.</p>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Call Analysis</Label>
                                  <div className="bg-muted p-3 rounded-lg text-sm">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <p><strong>Sentiment Trend:</strong> {call.analysis?.sentimentTrend ?? '—'}</p>
                                        <p><strong>Key Topics:</strong> {call.analysis?.keyTopics?.join(', ') || '—'}</p>
                                      </div>
                                      <div>
                                        <p><strong>Resolution Status:</strong> {call.analysis?.resolutionStatus ?? '—'}</p>
                                        <p><strong>Confidence Score:</strong> {call.analysis?.confidenceScore !== undefined ? `${call.analysis.confidenceScore}%` : '—'}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                  );
                })}
                  </TableBody>
                </Table>
        )}
        </div>

        {/* Escalation Alerts — only rendered when real data has an escalation
            trigger; no fake fallback. Session 11.2: bounded to the first 5
            (same pattern as Dashboard's Needs Attention) — this panel used
            to render every matching row with no cap at all, which is
            exactly the unbounded-page defect this session's main acceptance
            requirement rules out; the full count still shows in the header.
            Recolored onto the theme-aware corporate `warning` tokens
            (matching the Badge variant) instead of hardcoded amber-950/
            amber-300 literals, which read poorly in Light mode. */}
        {transferredCalls.length > 0 && (
          <div className="flex-shrink-0 rounded-md border border-amber-600/50 bg-amber-500/10 dark:border-amber-500/40 dark:bg-amber-500/10 p-3 space-y-2 max-h-[180px] overflow-y-auto">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <UserPlus className="h-4 w-4" />
              Active Escalations ({transferredCalls.length}{transferredCalls.length > 5 ? ', showing 5' : ''})
            </div>
            <div className="space-y-1">
              {transferredCalls.slice(0, 5).map((call) => (
                <div key={call.interactionId} className="flex items-center justify-between py-1.5 border-b border-amber-600/20 dark:border-amber-500/20 last:border-0 text-xs">
                  <div className="min-w-0">
                    <span className="font-medium text-amber-800 dark:text-amber-300">{call.callerName || formatPhoneNumber(call.phoneNumber)}</span>
                    <span className="text-amber-700/80 dark:text-amber-400/80 ml-2">Trigger: {call.escalation?.trigger}</span>
                  </div>
                  <span className="text-amber-700/70 dark:text-amber-400/70 whitespace-nowrap" title={formatDurationExact(call.durationSeconds)}>
                    {formatDurationLong(call.durationSeconds)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default LiveView;
