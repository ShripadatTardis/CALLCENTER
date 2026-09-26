import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { MetricStrip } from '@/components/common/MetricStrip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Users, Phone, Clock, AlertTriangle, Search, Filter, Monitor, UserPlus, Loader2 } from 'lucide-react';
import { useLiveCallData } from '@/hooks/calls/useLiveCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { AgentActivityPanel } from '@/components/agents/AgentActivityPanel';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import {
  formatDurationExact,
  formatDurationLong,
  formatFractionAsPercent,
  formatPhoneNumber,
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
 */
const LiveView: React.FC = () => {
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
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <div className={`w-1.5 h-1.5 rounded-full ${live.isFetching ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
          <span>{live.isFetching ? 'Refreshing…' : 'Live — updates every 4s'}</span>
        </div>

        {live.isError && (
          <QueryErrorBanner
            error={live.error}
            onRetry={() => void live.refetch()}
            hasStaleData={calls.length > 0}
            isFetching={live.isFetching}
          />
        )}

        <MetricStrip
          items={[
            { label: 'Active calls', value: live.isLoading ? '…' : summary?.active_calls ?? 0, hint: `${connectingCount} connecting` },
            { label: 'Escalated (live)', value: live.isLoading ? '…' : summary?.escalated_calls ?? 0, tone: 'warning' },
            { label: 'Avg handle time', value: live.isLoading ? '…' : formatDurationLong(summary?.avg_handle_time_seconds), hint: formatDurationExact(summary?.avg_handle_time_seconds) },
            { label: 'Escalations w/ trigger', value: transferredCalls.length, tone: transferredCalls.length > 0 ? 'warning' : 'default' },
          ]}
        />

        <AgentActivityPanel
          agents={agentRoster}
          activeInteractions={calls}
          isLoading={agents.isLoading}
          title="AI Agent Roster"
        />

        <div className="flex flex-wrap items-center gap-2">
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

        {live.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : live.isError && calls.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">Live calls are unavailable right now — see the error above.</p>
        ) : calls.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No active calls right now.</p>
        ) : filteredCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No active calls match the current search/filters.</p>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Caller', 'Intent', 'Agent', 'Duration', 'Sentiment', 'Status', 'Actions'].map((h) => (
                    <TableHead key={h} className="text-muted-foreground text-xs">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.slice(0, 20).map((call) => (
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
                    <TableCell className="max-w-[140px]">
                      <span className="text-sm text-foreground truncate block">{call.agentDisplayName ?? call.agentId ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-foreground whitespace-nowrap text-xs" title={formatDurationExact(call.durationSeconds)}>
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
                      <StatusBadge status={call.outcome === 'escalated' ? 'escalated' : (call.stage ?? call.status)} />
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={() => setSelectedCall(call)}>
                            <Monitor className="h-3.5 w-3.5 mr-1" />
                            Monitor
                          </Button>
                        </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Call Monitoring - {call.callerName || call.phoneNumber}</DialogTitle>
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
                    ))}
                  </TableBody>
                </Table>
          </div>
        )}

        {/* Escalation Alerts — only rendered when real data has an escalation trigger; no fake fallback */}
        {transferredCalls.length > 0 && (
          <div className="rounded-md border border-amber-800 bg-amber-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <UserPlus className="h-4 w-4" />
              Active Escalations ({transferredCalls.length})
            </div>
            <div className="space-y-1">
              {transferredCalls.map((call) => (
                <div key={call.interactionId} className="flex items-center justify-between py-1.5 border-b border-amber-900/40 last:border-0 text-xs">
                  <div className="min-w-0">
                    <span className="font-medium text-amber-200">{call.callerName || formatPhoneNumber(call.phoneNumber)}</span>
                    <span className="text-amber-400/80 ml-2">Trigger: {call.escalation?.trigger}</span>
                  </div>
                  <span className="text-amber-400/70 whitespace-nowrap" title={formatDurationExact(call.durationSeconds)}>
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
