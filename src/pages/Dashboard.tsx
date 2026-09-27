import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useAnalyticsMetrics } from '@/hooks/analytics/useAnalyticsMetrics';
import { useCallData } from '@/hooks/calls/useCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { AgentActivityPanel } from '@/components/agents/AgentActivityPanel';
import { countActiveCallsByAgent } from '@/components/agents/agentActivity';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { MetricStrip } from '@/components/common/MetricStrip';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import type { Interaction } from '@/types/interaction';
import {
  formatDurationExact,
  formatDurationLong,
  formatPercent,
  formatPhoneNumber,
  formatStaleDurationHuman,
  formatStatusLabel,
  isStaleDuration,
} from '@/lib/format';

/**
 * Session 3: live data throughout. Metrics tiles are limited to what's
 * genuinely backed — Avg Sentiment and CSAT Score were removed (no
 * backend field exists anywhere for either, confirmed in the backend
 * capability reconciliation) rather than left hardcoded/random. The
 * "AI Agents" tile is a safely-derived count (agents with >=1 active
 * call / total roster size), not a fabricated Engaged/Idle status.
 *
 * Session 11.1: Needs Attention + Recent Calls are both hard-capped
 * client-side (5 each). This is deliberate defense against a confirmed
 * upstream defect — the Partner API does not reliably honor
 * `page_size`, so the `useCallData({ page_size: 5 })` call below cannot
 * be trusted alone to bound how many rows this page ever has to render
 * (see docs/SCREEN_REVIEW_01_DASHBOARD.md §5 and
 * docs/SESSION_11_1_DASHBOARD_IMPLEMENTATION.md). Do not remove the
 * `.slice(0, 5)` calls below on the assumption the backend now behaves.
 */

type AttentionCategory = 'escalated-stale' | 'escalated' | 'stale';

interface AttentionEntry {
  interaction: Interaction;
  category: AttentionCategory;
}

const ATTENTION_CATEGORY_RANK: Record<AttentionCategory, number> = {
  'escalated-stale': 0,
  escalated: 1,
  stale: 2,
};

function classifyAttention(interactions: Interaction[]): AttentionEntry[] {
  return interactions
    .filter((i) => i.outcome === 'escalated' || (i.status === 'active' && isStaleDuration(i.durationSeconds)))
    .map((i) => {
      const escalated = i.outcome === 'escalated';
      const stale = i.status === 'active' && isStaleDuration(i.durationSeconds);
      const category: AttentionCategory = escalated && stale ? 'escalated-stale' : escalated ? 'escalated' : 'stale';
      return { interaction: i, category };
    })
    .sort((a, b) => {
      const rankDiff = ATTENTION_CATEGORY_RANK[a.category] - ATTENTION_CATEGORY_RANK[b.category];
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.interaction.startTime).getTime() - new Date(a.interaction.startTime).getTime();
    });
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const metrics = useAnalyticsMetrics();
  const recent = useCallData({ page_size: 5 });
  const agents = useAgents();
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);

  const interactions = useMemo(() => recent.data?.interactions ?? [], [recent.data]);
  const activeInteractions = interactions.filter((i) => i.status === 'active');
  const activeCalls = recent.data?.summary.active_calls ?? 0;
  const agentRoster = agents.data?.agents ?? [];
  const activeAgentCount = countActiveCallsByAgent(activeInteractions).size;

  // Needs Attention: deterministic, real-data-only — escalated and/or
  // stale-active rows already present in `interactions`. No LLM, no
  // inference, no severity score. Hard-capped to 5 regardless of how
  // many qualify (§ bounded-workspace requirement).
  const allAttention = useMemo(() => classifyAttention(interactions), [interactions]);
  const attentionItems = useMemo(() => allAttention.slice(0, 5), [allAttention]);
  const attentionIds = useMemo(
    () => new Set(attentionItems.map((a) => a.interaction.interactionId)),
    [attentionItems]
  );

  // Recent Calls: genuinely recent activity only — excludes anything
  // already surfaced in Needs Attention, and excludes stale-active rows
  // outright so they can never dominate this list even beyond the
  // Attention cap. Hard-capped to 5 client-side, independent of
  // whatever the backend actually returned.
  const recentCalls = useMemo(() => {
    return interactions
      .filter((i) => !attentionIds.has(i.interactionId))
      .filter((i) => !(i.status === 'active' && isStaleDuration(i.durationSeconds)))
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 5);
  }, [interactions, attentionIds]);

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-3 space-y-2">
        {(recent.isError || agents.isError || metrics.isError) && (
          <QueryErrorBanner
            error={recent.error ?? agents.error ?? metrics.error}
            onRetry={() => {
              void recent.refetch();
              void agents.refetch();
              void metrics.refetch();
            }}
            hasStaleData={interactions.length > 0 || agentRoster.length > 0 || Boolean(metrics.data)}
            isFetching={recent.isFetching || agents.isFetching || metrics.isFetching}
          />
        )}

        <MetricStrip
          items={[
            { label: 'Active calls', value: recent.isLoading ? '…' : activeCalls, hint: 'Currently in progress' },
            { label: 'Active agents', value: agents.isLoading || recent.isLoading ? '…' : `${activeAgentCount}/${agentRoster.length}`, hint: 'On a call / total roster' },
            { label: 'FCR rate (all time)', value: metrics.isLoading ? '…' : formatPercent(metrics.data?.fcrRate) },
            {
              label: 'Escalation rate (all time)',
              value: metrics.isLoading ? '…' : formatPercent(metrics.data?.escalationRate),
              hint: metrics.data ? `${metrics.data.escalatedCount} calls escalated` : undefined,
              tone: metrics.data?.escalationRate && metrics.data.escalationRate > 20 ? 'warning' : 'default',
            },
            {
              label: 'Avg handle time (all time)',
              value: metrics.isLoading ? '…' : formatDurationLong(metrics.data?.avgAhtSeconds),
              hint: formatDurationExact(metrics.data?.avgAhtSeconds),
            },
          ]}
        />

        <Card className="bg-card border-border">
          <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold text-foreground">
              Needs Attention{allAttention.length > 0 ? ` (${allAttention.length})` : ''}
            </CardTitle>
            {allAttention.length > 5 && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-cyan-400"
                onClick={() => navigate('/call-logs')}
              >
                View all &rarr; Call Logs
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-3 pb-2">
            {recent.isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : attentionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">No escalated or stale active records.</p>
            ) : (
              <>
                {/* Session 11.1 XYZ: subtle desktop-only column cues — Dashboard is a
                    cross-agent overview, so Agent is a first-class scanning dimension
                    (see docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md "Cross-Agent
                    Context"). Kept intentionally light: no header band/border, just a
                    muted uppercase label row. */}
                {/* Session 11.1 XYZ-A: adaptive column sizing (see
                    docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md "Adaptive
                    Column Sizing"). Customer/Context is the sole 1fr track and
                    absorbs residual width; Agent/Status/Duration use
                    minmax(min,max) tracks with a fixed (non-content-derived)
                    max so every row's grid — each <button> is its own
                    independent grid formatting context — resolves the same
                    column widths and stays aligned with the header, rather
                    than each row's Agent column sizing itself to that row's
                    own agent-name length. The max values were chosen by
                    measuring real agent names (longest current: "Inbound
                    Banking Assistant"), not copied from the prompt's example
                    template. */}
                <div className="hidden sm:grid sm:[grid-template-columns:minmax(0,1fr)_minmax(7rem,14rem)_minmax(6rem,10rem)_minmax(3.5rem,4.5rem)] sm:gap-2 items-center px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                  <span>Customer / Context</span>
                  <span>Agent</span>
                  <span>Status</span>
                  <span className="text-right">Duration</span>
                </div>
                <div className="divide-y divide-border/60">
                  {attentionItems.map(({ interaction: call, category }) => {
                    const agentLabel = call.agentDisplayName ?? call.agentId ?? 'Unknown agent';
                    return (
                      <button
                        key={call.interactionId}
                        type="button"
                        onClick={() => setSelectedInteraction(call)}
                        className="w-full flex flex-col gap-1 sm:grid sm:[grid-template-columns:minmax(0,1fr)_minmax(7rem,14rem)_minmax(6rem,10rem)_minmax(3.5rem,4.5rem)] sm:items-center sm:gap-2 py-1.5 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-sm px-1 -mx-1"
                      >
                        <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                          <span className="font-medium text-foreground truncate text-sm">{call.callerName || formatPhoneNumber(call.phoneNumber)}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {call.intent || '—'} ·{' '}
                            <span className="sm:hidden">{agentLabel}</span>
                            <span className="hidden sm:inline">{formatPhoneNumber(call.phoneNumber)}</span>
                          </span>
                        </div>
                        <div className="hidden sm:block min-w-0 text-xs text-muted-foreground truncate" title={agentLabel}>
                          {agentLabel}
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:contents">
                          <div className="flex flex-wrap gap-1 min-w-0">
                            {(category === 'escalated' || category === 'escalated-stale') && (
                              <Badge variant="escalated" className="whitespace-nowrap text-xs">Escalated</Badge>
                            )}
                            {(category === 'stale' || category === 'escalated-stale') && (
                              <Badge variant="warning" className="whitespace-nowrap text-xs">Stale active</Badge>
                            )}
                          </div>
                          <div
                            className="text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:text-right"
                            title={formatDurationExact(call.durationSeconds)}
                          >
                            {category === 'escalated'
                              ? formatDurationLong(call.durationSeconds)
                              : formatStaleDurationHuman(call.durationSeconds)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3">
          <Card className="bg-card border-border">
            <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-foreground">Recent Calls</CardTitle>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-cyan-400"
                onClick={() => navigate('/call-logs')}
              >
                View all &rarr; Call Logs
              </Button>
            </CardHeader>
            <CardContent className="px-3 pb-2">
              {recent.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : recentCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">No recent calls.</p>
              ) : (
                <>
                  {/* Session 11.1 XYZ-A: same adaptive-grid approach as Needs
                      Attention above, with a narrower Status/Duration cap
                      since Recent Calls only ever renders one outcome badge. */}
                  <div className="hidden sm:grid sm:[grid-template-columns:minmax(0,1fr)_minmax(7rem,14rem)_minmax(5rem,7rem)_minmax(3rem,4rem)] sm:gap-2 items-center px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                    <span>Customer / Context</span>
                    <span>Agent</span>
                    <span>Outcome</span>
                    <span className="text-right">Duration</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {recentCalls.map((call) => {
                      const agentLabel = call.agentDisplayName ?? call.agentId ?? 'Unknown agent';
                      return (
                        <button
                          key={call.interactionId}
                          type="button"
                          onClick={() => setSelectedInteraction(call)}
                          className="w-full flex flex-col gap-1 sm:grid sm:[grid-template-columns:minmax(0,1fr)_minmax(7rem,14rem)_minmax(5rem,7rem)_minmax(3rem,4rem)] sm:items-center sm:gap-2 py-1.5 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-sm px-1 -mx-1"
                        >
                          <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                            <span className="font-medium text-foreground truncate text-sm">{call.callerName || formatPhoneNumber(call.phoneNumber)}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {call.intent || '—'} ·{' '}
                              <span className="sm:hidden">{agentLabel}</span>
                              <span className="hidden sm:inline">{formatPhoneNumber(call.phoneNumber)}</span>
                            </span>
                          </div>
                          <div className="hidden sm:block min-w-0 text-xs text-muted-foreground truncate" title={agentLabel}>
                            {agentLabel}
                          </div>
                          <div className="flex items-center justify-between gap-2 sm:contents">
                            <Badge
                              variant={call.status === 'active' ? 'secondary' : call.outcome === 'escalated' ? 'escalated' : call.outcome === 'resolved' ? 'positive' : 'default'}
                              className="whitespace-nowrap text-xs"
                            >
                              {formatStatusLabel(call.outcome ?? call.status)}
                            </Badge>
                            <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:text-right" title={formatDurationExact(call.durationSeconds)}>
                              {formatDurationLong(call.durationSeconds)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* max-h + overflow-y-auto bounds the roster's Dashboard footprint even if
              the real roster grows well past today's 3 agents — see data-growth
              reasoning in docs/SESSION_11_1_DASHBOARD_IMPLEMENTATION.md. Lowered from
              420px (11.1) to 220px in 11.1A since the compact 'Agent Load' row
              treatment is far shorter per-agent than the original catalogue cards. */}
          <div className="max-h-[220px] overflow-y-auto">
            <AgentActivityPanel
              agents={agentRoster}
              activeInteractions={activeInteractions}
              isLoading={agents.isLoading || recent.isLoading}
              onAgentClick={(agentId) => navigate(`/ai-agents/${agentId}`, { state: { origin: 'dashboard' } })}
              title="Agent Load"
              variant="compact"
            />
          </div>
        </div>

        <InteractionDetailDialog
          isOpen={Boolean(selectedInteraction)}
          onClose={() => setSelectedInteraction(null)}
          interaction={selectedInteraction}
        />
      </div>
    </Layout>
  );
};

export default Dashboard;
