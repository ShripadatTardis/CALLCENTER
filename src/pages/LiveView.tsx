import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
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
    if (score === undefined) return 'text-slate-500';
    if (score >= 0.7) return 'text-green-600';
    if (score >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Live View Dashboard</h1>
            <p className="text-slate-600">Real-time monitoring of active AI-agent calls</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 text-sm text-slate-500">
              <div className={`w-2 h-2 rounded-full ${live.isFetching ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
              <span>{live.isFetching ? 'Refreshing…' : 'Live — updates every 4s'}</span>
            </div>
          </div>
        </div>

        {live.isError && (
          <QueryErrorBanner
            error={live.error}
            onRetry={() => void live.refetch()}
            hasStaleData={calls.length > 0}
            isFetching={live.isFetching}
          />
        )}

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {live.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : summary?.active_calls ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">{connectingCount} connecting</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Escalated (live)</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {live.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : summary?.escalated_calls ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Of currently active calls</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Handle Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold text-purple-600"
                title={formatDurationExact(summary?.avg_handle_time_seconds)}
              >
                {live.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatDurationLong(summary?.avg_handle_time_seconds)}
              </div>
              <p className="text-xs text-muted-foreground">Current active calls</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Escalations with Trigger</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{transferredCalls.length}</div>
              <p className="text-xs text-muted-foreground">Active calls with an escalation trigger recorded</p>
            </CardContent>
          </Card>
        </div>

        <AgentActivityPanel
          agents={agentRoster}
          activeInteractions={calls}
          isLoading={agents.isLoading}
          title="AI Agent Roster"
        />

        {/* Live Calls with Search and Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Phone className="h-5 w-5" />
                <span>Live Calls ({filteredCalls.length})</span>
              </CardTitle>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search by name, number, or intent..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="connecting">Connecting</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="escalated">Escalated</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={intentFilter} onValueChange={setIntentFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Intent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Intents</SelectItem>
                      {uniqueIntents.map((intent) => (
                        <SelectItem key={intent} value={intent}>{intent}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {live.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : live.isError && calls.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Live calls are unavailable right now — see the error above.
              </p>
            ) : calls.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No active calls right now.</p>
            ) : filteredCalls.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No active calls match the current search/filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Caller</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Sentiment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCalls.slice(0, 20).map((call) => (
                      <TableRow key={call.interactionId}>
                        <TableCell className="max-w-[180px]">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate">{call.callerName || '—'}</div>
                            <div className="text-sm text-slate-500 truncate">{formatPhoneNumber(call.phoneNumber)}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="whitespace-nowrap">{call.intent || '—'}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[140px]">
                          <span className="text-sm text-slate-700 truncate block">{call.agentDisplayName ?? call.agentId ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className="font-mono text-slate-700 whitespace-nowrap"
                            title={formatDurationExact(call.durationSeconds)}
                          >
                            {formatDurationLong(call.durationSeconds)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span className={`font-medium whitespace-nowrap ${getSentimentColor(call.sentimentScore)}`}>
                              {formatFractionAsPercent(call.sentimentScore)}
                            </span>
                            {call.sentimentScore !== undefined && (
                              <div className="w-12 bg-slate-200 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full"
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
                              <Button variant="outline" size="sm" onClick={() => setSelectedCall(call)}>
                                <Monitor className="h-4 w-4 mr-1" />
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
                                    <div className="text-sm bg-slate-50 p-3 rounded-lg">
                                      <p><strong>Name:</strong> {call.callerName || '—'}</p>
                                      <p><strong>Phone:</strong> {call.phoneNumber}</p>
                                      <p><strong>Intent:</strong> {call.intent || '—'}</p>
                                      <p><strong>Channel:</strong> {call.channel}</p>
                                      <p><strong>Direction:</strong> {call.direction ?? '—'}</p>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Call Details</Label>
                                    <div className="text-sm bg-slate-50 p-3 rounded-lg">
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
                                  <div className="bg-slate-50 p-3 rounded-lg text-sm max-h-40 overflow-y-auto space-y-1">
                                    {call.transcript && call.transcript.length > 0 ? (
                                      call.transcript.slice(-6).map((entry, i) => (
                                        <p key={i}>
                                          <strong>{entry.speaker === 'ai' ? 'AI Agent' : 'Customer'}:</strong> {entry.text}
                                        </p>
                                      ))
                                    ) : (
                                      <p className="text-slate-500">No transcript available yet for this call.</p>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Call Analysis</Label>
                                  <div className="bg-slate-50 p-3 rounded-lg text-sm">
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
          </CardContent>
        </Card>

        {/* Escalation Alerts — only rendered when real data has an escalation trigger; no fake fallback */}
        {transferredCalls.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-800 flex items-center space-x-2">
                <UserPlus className="h-5 w-5" />
                <span>Active Escalations ({transferredCalls.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transferredCalls.map((call) => (
                  <div key={call.interactionId} className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-200 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-orange-900 truncate">{call.callerName || formatPhoneNumber(call.phoneNumber)}</div>
                      <div className="text-sm text-orange-700 truncate">Trigger: {call.escalation?.trigger}</div>
                      <div
                        className="text-xs text-orange-600"
                        title={formatDurationExact(call.durationSeconds)}
                      >
                        Duration: {formatDurationLong(call.durationSeconds)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default LiveView;
