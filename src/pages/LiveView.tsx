import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { MetricStrip } from '@/components/common/MetricStrip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, FileText, UserPlus, Loader2 } from 'lucide-react';
import { useLiveCallData } from '@/hooks/calls/useLiveCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { useAuth } from '@/contexts/AuthContext';
import { AgentActivityPanel } from '@/components/agents/AgentActivityPanel';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { findCallBySidAndPhone } from '@/lib/callLookup';
import type { DetailNavigationState } from '@/lib/detailOrigin';
import {
  formatDurationExact,
  formatDurationLong,
  formatFractionAsPercent,
  formatPhoneNumber,
  formatStatusLabel,
} from '@/lib/format';
import type { Interaction } from '@/types/interaction';
import { typography } from '@/lib/typography';

/**
 * Session 13.5 (DEC-LIVE-01) — the shared InteractionDetailDialog resolved
 * two ways: the current call object from the live, still-polling `calls`
 * array when the call is still in the active subset (§10/§11 — this is
 * what keeps Duration/Sentiment/transcript genuinely live without any
 * Live-specific detail logic), or, once a selected call disappears from
 * that subset (completed and rolled off status=active), a single
 * non-polled lookup by phone+call_sid (the same proven pattern
 * InitiateCall.tsx/CampaignDetail.tsx already use) so the shared dialog
 * can reflect real final data if it has materialized yet (§12 — never
 * fabricated; a graceful "not available yet" state otherwise). Selection
 * is tracked by stable interactionId + phone, never by a snapshotted
 * object, so a 4s poll can never close the dialog or swap its contents
 * under another id.
 */
const LiveCallDetailDialog: React.FC<{
  callId: string;
  phone: string;
  liveMatch: Interaction | undefined;
  onClose: () => void;
}> = ({ callId, phone, liveMatch, onClose }) => {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const fallback = useQuery({
    queryKey: ['live-view', 'completed-call-lookup', callId, phone, role],
    queryFn: () => findCallBySidAndPhone(phone, callId, role),
    enabled: !liveMatch,
  });

  if (liveMatch) {
    return <InteractionDetailDialog isOpen onClose={onClose} interaction={liveMatch} />;
  }

  if (fallback.isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-card border border-border rounded-lg p-6 flex items-center gap-3 text-sm text-foreground" onClick={(e) => e.stopPropagation()}>
          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
          This call just ended — loading final details…
          <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (fallback.data) {
    return <InteractionDetailDialog isOpen onClose={onClose} interaction={fallback.data} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-6 max-w-sm text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        This call has ended and left the active list. Final details are not available yet — it may still be
        materializing in Call Data.
        <div className="mt-3">
          <Button size="sm" variant="outline" className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

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
  const location = useLocation();
  // Session (Dashboard IA) — Live View has no "detail page" origin concept
  // of its own (it's a top-level sidebar destination, normally entered
  // with no Back link at all); this only adds one when Dashboard's
  // "Active calls" tile is genuinely how the operator got here (the same
  // navigation-state mechanism src/lib/detailOrigin.ts already
  // establishes for Agent/Customer/Campaign Detail).
  const fromDashboard = (location.state as DetailNavigationState | null)?.origin === 'dashboard';
  const live = useLiveCallData();
  const agents = useAgents();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  // Session 13.5 — stable id+phone identity, not a snapshotted Interaction object (§12).
  const [selected, setSelected] = useState<{ callId: string; phone: string } | null>(null);

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
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-shrink-0">
          {fromDashboard ? (
            <Button variant="ghost" size="xs" className="-ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate('/dashboard')}>
              ← Back to Dashboard
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${live.isFetching ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
            <span>{live.isFetching ? 'Refreshing…' : 'Live — updates every 4s'}</span>
          </div>
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
            title="Agent Activity"
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
                {/* G1 dense operational grid (docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md
                    §G1): ~32-36px header, not the shadcn default h-12/px-4. */}
                <TableRow className={`border-border hover:bg-transparent ${typography.tableHeader}`}>
                  {['Caller', 'Intent', 'Agent', 'Duration', 'Sentiment', 'Status', 'Actions'].map((h) => (
                    <TableHead key={h} className={`h-9 px-3 ${h === 'Duration' ? 'text-right' : ''}`}>{h}</TableHead>
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
                    {/* G1: single-line identity cell (Session 11.2A) — the
                        prior two-line name/phone stack was the main reason
                        this table still read as stacked cards rather than a
                        dense grid row. Name and phone now share one line;
                        phone remains available in full via View Details. */}
                    <TableCell className="py-1.5 px-3 max-w-[220px]">
                      <span
                        className="font-medium text-foreground truncate block"
                        title={`${call.callerName || '—'} · ${formatPhoneNumber(call.phoneNumber)}`}
                      >
                        {call.callerName || '—'} <span className="text-muted-foreground font-normal">· {formatPhoneNumber(call.phoneNumber)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-3">
                      <Badge variant="outline" className="whitespace-nowrap text-xs border-border text-foreground">{call.intent || '—'}</Badge>
                    </TableCell>
                    {/* Session 11.1 XYZ-A / C1 adaptive sizing (see docs/
                        VOICEFORCE_OPERATIONAL_GRID_STANDARD.md): a bounded-
                        but-generous min/max, not the old fixed max-w-[140px]
                        that truncated normal agent names ("Inbound Banking
                        Assistant") even with unused row width elsewhere. */}
                    <TableCell className="py-1.5 px-3 min-w-[7rem] max-w-[14rem]">
                      <span className="font-medium text-foreground truncate block" title={agentLabel}>{agentLabel}</span>
                    </TableCell>
                    <TableCell className="py-1.5 px-3 text-right">
                      <span className="font-mono tabular-nums text-foreground whitespace-nowrap text-xs" title={formatDurationExact(call.durationSeconds)}>
                        {formatDurationLong(call.durationSeconds)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-3">
                      {/* VoiceForce design system — neutral data-value rule: sentiment is an
                          ordinary metric, not a status/warning state, so it no longer shifts
                          hue by magnitude (text or meter fill) — same treatment as every other
                          plain percentage value on this page. */}
                      <div className="flex items-center space-x-2">
                        <span className="font-medium whitespace-nowrap text-xs text-foreground">
                          {formatFractionAsPercent(call.sentimentScore)}
                        </span>
                        {call.sentimentScore !== undefined && (
                          <div className="w-10 bg-muted rounded-full h-1.5">
                            <div
                              className="bg-foreground/50 h-1.5 rounded-full"
                              style={{ width: `${call.sentimentScore * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 px-3">
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
                    <TableCell className="py-1.5 px-3">
                      <Button
                        variant="outline"
                        size="xs"
                        className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setSelected({ callId: call.interactionId, phone: call.phoneNumber })}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        View Details
                      </Button>
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

        {selected && (
          <LiveCallDetailDialog
            callId={selected.callId}
            phone={selected.phone}
            liveMatch={calls.find((c) => c.interactionId === selected.callId)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </Layout>
  );
};

export default LiveView;
