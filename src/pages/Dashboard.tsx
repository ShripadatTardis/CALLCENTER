import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useCallData } from '@/hooks/calls/useCallData';
import { useAgents } from '@/hooks/agents/useAgents';
import { useChatLogs } from '@/hooks/chat/useChatLogs';
import { useRatioSummary } from '@/hooks/analytics/useRatio';
import { getFrontendRatioDefinition } from '@/lib/ratios/ratioFrontendRegistry';
import { formatRatioValue } from '@/components/ratios/RatioHero';
import {
  DASHBOARD_AHT_RATIO_ID,
  DASHBOARD_ORIGIN_STATE,
  DASHBOARD_PERFORMANCE_RATIO_IDS,
  buildDashboardAgentDetailLink,
  buildDashboardLiveViewLink,
  buildDashboardRatioLink,
} from '@/lib/dashboardNavigation';
import { AgentActivityPanel } from '@/components/agents/AgentActivityPanel';
import { countActiveCallsByAgent } from '@/components/agents/agentActivity';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import type { Interaction } from '@/types/interaction';
import {
  formatDurationExact,
  formatDurationLong,
  formatPhoneNumber,
  formatStaleDurationHuman,
  formatStatusLabel,
  isStaleDuration,
} from '@/lib/format';

/**
 * Dashboard Information Architecture session — restructured into the
 * operational home per docs/DASHBOARD_INFORMATION_ARCHITECTURE_AND_NAVIGATION.md:
 * Live Operations -> Needs Attention -> Performance Ratios -> Recent
 * Interactions / Agent Load. No new metrics, no new backend capability
 * — every value here already existed somewhere in this app; this
 * session's job was composition, honest labeling, and navigation.
 *
 * Session 11.1: Needs Attention + Recent Interactions are both
 * hard-capped client-side (5 each). This is deliberate defense against
 * a confirmed upstream defect — the Partner API does not reliably honor
 * `page_size` (see docs/SCREEN_REVIEW_01_DASHBOARD.md §5). Do not remove
 * the `.slice(0, 5)` calls below on the assumption the backend now
 * behaves.
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

/**
 * A clickable Live Operations tile — the same visual language
 * MetricStrip already establishes elsewhere (border/bg/divider tokens),
 * not a new button-heavy pattern, but MetricStrip itself has no
 * per-item onClick (it's a shared, purely-presentational primitive used
 * by many other screens) — this is a small Dashboard-local sibling,
 * not a MetricStrip modification that would ripple into every other
 * consumer.
 */
const LiveOperationsTile: React.FC<{ label: string; value: React.ReactNode; hint?: string; onClick?: () => void; first?: boolean }> = ({
  label,
  value,
  hint,
  onClick,
  first,
}) => {
  const inner = (
    <>
      <span className="text-base font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground whitespace-nowrap" title={hint}>{label}</span>
    </>
  );
  return (
    <div className={`flex items-baseline gap-2 ${first ? '' : 'pl-6 border-l border-border'}`}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex items-baseline gap-2 min-h-6 hover:text-cyan-600 dark:hover:text-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm -mx-1 px-1"
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </div>
  );
};

/**
 * One compact Performance Ratio card — a thin presentational consumer
 * of `useRatioSummary`, the EXACT hook/service Ratio Explorer itself
 * uses (src/hooks/analytics/useRatio.ts -> src/server/analytics/
 * ratioService.ts). No Dashboard-local formula exists for any of these
 * 5 ratios — one semantic source, per the session's explicit §5
 * requirement. Runtime states are shown honestly: a null value never
 * becomes a fabricated 0%, it shows the real `unavailableReason` the
 * service itself returned (the same text Ratio Explorer would show).
 */
const PerformanceRatioCard: React.FC<{ ratioId: string }> = ({ ratioId }) => {
  const navigate = useNavigate();
  const definition = getFrontendRatioDefinition(ratioId);
  const { data, isLoading, isError, refetch } = useRatioSummary(ratioId, {});
  const link = buildDashboardRatioLink(ratioId);
  const value = data && data.value !== null ? formatRatioValue(data.value, data.unit) : null;

  if (isError) {
    return (
      <div className="flex-1 min-w-[8.5rem] rounded-md border border-border bg-card/40 px-3 py-2">
        <div className="text-[11px] text-muted-foreground truncate" title={definition?.name}>
          {definition?.shortLabel ?? ratioId}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">Could not load</div>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline mt-0.5 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(link.path, { state: link.state })}
      className="flex-1 min-w-[8.5rem] text-left rounded-md border border-border bg-card/40 px-3 py-2 hover:bg-card hover:border-cyan-600/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
    >
      <div className="text-[11px] text-muted-foreground truncate" title={definition?.name}>
        {definition?.shortLabel ?? ratioId}
      </div>
      {isLoading ? (
        <div className="text-lg font-semibold text-muted-foreground">…</div>
      ) : value !== null ? (
        <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
      ) : (
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight" title={data?.unavailableReason ?? undefined}>
          {data?.unavailableReason ?? 'No eligible population'}
        </div>
      )}
    </button>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const recent = useCallData({ page_size: 5 });
  const agents = useAgents();
  const chat = useChatLogs(1);
  const ahtSummary = useRatioSummary(DASHBOARD_AHT_RATIO_ID, {});
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);

  const interactions = useMemo(() => recent.data?.interactions ?? [], [recent.data]);
  const activeInteractions = interactions.filter((i) => i.status === 'active');
  const activeCalls = recent.data?.summary.active_calls ?? 0;
  const agentRoster = agents.data?.agents ?? [];
  const activeAgentCount = countActiveCallsByAgent(activeInteractions).size;
  const chatSessions = useMemo(() => chat.data?.data ?? [], [chat.data]);

  // Needs Attention: deterministic, real-data-only — escalated and/or
  // stale-active rows already present in `interactions`. No LLM, no
  // inference, no severity score. Hard-capped to 5 regardless of how
  // many qualify.
  const allAttention = useMemo(() => classifyAttention(interactions), [interactions]);
  const attentionItems = useMemo(() => allAttention.slice(0, 5), [allAttention]);
  const attentionIds = useMemo(
    () => new Set(attentionItems.map((a) => a.interaction.interactionId)),
    [attentionItems]
  );

  // Recent Interactions — genuinely merged Voice + Chat (Session finding:
  // Chat's global listing is the SAME useChatLogs hook Chat Logs' own
  // page uses, Voice is the SAME useCallData hook already on this page
  // — not a new aggregation added merely for Dashboard). Excludes
  // anything already surfaced in Needs Attention and excludes
  // stale-active Voice rows outright. Chat has no "stale" concept today
  // (no analogous long-running-active state exists for chat sessions),
  // so no equivalent exclusion is applied there.
  const recentInteractions = useMemo(() => {
    const voiceRows = interactions
      .filter((i) => !attentionIds.has(i.interactionId))
      .filter((i) => !(i.status === 'active' && isStaleDuration(i.durationSeconds)))
      .map((i) => ({ kind: 'call' as const, at: i.startTime, call: i }));
    const chatRows = chatSessions.map((s) => ({ kind: 'chat' as const, at: s.updatedAt, chat: s }));
    return [...voiceRows, ...chatRows]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 5);
  }, [interactions, attentionIds, chatSessions]);

  const liveViewLink = buildDashboardLiveViewLink();

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-3 space-y-2">
        {(recent.isError || agents.isError) && (
          <QueryErrorBanner
            error={recent.error ?? agents.error}
            onRetry={() => {
              void recent.refetch();
              void agents.refetch();
            }}
            hasStaleData={interactions.length > 0 || agentRoster.length > 0}
            isFetching={recent.isFetching || agents.isFetching}
          />
        )}

        {/* A. Live Operations — genuinely current/operational counts only.
            FCR/Escalation moved to Performance Ratios below (never shown
            twice, §22); AHT here is the SAME `aht` ratio Ratio Explorer
            computes, not a second Dashboard-local calculation. */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">Live Operations</div>
          <div className="flex flex-wrap items-stretch gap-x-2 gap-y-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm">
            <LiveOperationsTile
              first
              label="Active calls"
              value={recent.isLoading ? '…' : activeCalls}
              hint="Currently in progress — opens Live View"
              onClick={() => navigate(liveViewLink.path, { state: liveViewLink.state })}
            />
            <LiveOperationsTile
              label="Active agents"
              value={agents.isLoading || recent.isLoading ? '…' : `${activeAgentCount}/${agentRoster.length}`}
              hint="On a call / total roster — opens AI Agents"
              onClick={() => navigate('/ai-agents')}
            />
            <LiveOperationsTile
              label="Avg handle time"
              value={
                ahtSummary.isLoading
                  ? '…'
                  : ahtSummary.data?.value != null
                    ? formatRatioValue(ahtSummary.data.value, ahtSummary.data.unit)
                    : '—'
              }
              hint={ahtSummary.data?.value != null ? formatDurationExact(ahtSummary.data.value) : (ahtSummary.data?.unavailableReason ?? undefined)}
              onClick={() => {
                const link = buildDashboardRatioLink(DASHBOARD_AHT_RATIO_ID);
                navigate(link.path, { state: link.state });
              }}
            />
          </div>
        </div>

        {/* B. Needs Attention — unchanged source/classification; only the
            stale-active label was corrected (§17): a 10-22 day "Duration"
            was previously indistinguishable from a real in-progress
            call's duration. Stale rows now carry an explicit "Age"
            qualifier; the value itself (formatStaleDurationHuman) was
            already computing elapsed age correctly, this is a labeling
            fix only. */}
        <Card className="bg-card border-border">
          <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold text-foreground">
              Needs Attention{allAttention.length > 0 ? ` (${allAttention.length})` : ''}
            </CardTitle>
            {allAttention.length > 5 && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline min-h-6 p-1 -m-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
                onClick={() => navigate('/call-logs', { state: DASHBOARD_ORIGIN_STATE })}
              >
                View all &rarr; Call Logs
              </button>
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
                <div className="hidden sm:grid sm:[grid-template-columns:minmax(0,28rem)_minmax(7rem,14rem)_minmax(6rem,10rem)_minmax(3.5rem,4.5rem)] sm:gap-2 items-center px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                  <span>Customer / Context</span>
                  <span>Agent</span>
                  <span>Status</span>
                  <span className="text-right">Duration</span>
                </div>
                <div className="divide-y divide-border/60">
                  {attentionItems.map(({ interaction: call, category }) => {
                    const agentLabel = call.agentDisplayName ?? call.agentId ?? 'Unknown agent';
                    const isStaleRow = category === 'stale' || category === 'escalated-stale';
                    return (
                      <button
                        key={call.interactionId}
                        type="button"
                        onClick={() => setSelectedInteraction(call)}
                        className="w-full flex flex-col gap-1 sm:grid sm:[grid-template-columns:minmax(0,28rem)_minmax(7rem,14rem)_minmax(6rem,10rem)_minmax(3.5rem,4.5rem)] sm:items-center sm:gap-2 py-1.5 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-sm px-1 -mx-1"
                      >
                        <div className="min-w-0 flex flex-col gap-0.5">
                          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                            <span className="font-medium text-foreground truncate text-sm">{call.callerName || formatPhoneNumber(call.phoneNumber)}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {call.intent || '—'} ·{' '}
                              <span className="sm:hidden">{agentLabel}</span>
                              <span className="hidden sm:inline">{formatPhoneNumber(call.phoneNumber)}</span>
                            </span>
                          </div>
                          {/* Reason — real backend fields only. Escalation
                              trigger comes straight from Call Data's
                              escalation_trigger (src/services/calls/
                              callsMapper.ts); a missing trigger on an
                              escalated call is shown honestly rather than
                              invented. Stale rows explain exactly what
                              "stale" means (still marked active upstream
                              after the shown age) rather than leaving the
                              badge unexplained. Nested inside the
                              Customer/Context cell (not a separate grid
                              item) so it can't shift the sparse grid
                              auto-placement cursor and misalign the
                              Agent/Status/Duration columns next to it. */}
                          <div className="text-[11px] text-muted-foreground truncate">
                            {category === 'escalated' || category === 'escalated-stale'
                              ? `Reason: ${call.escalation?.trigger || 'Escalated — no trigger reason recorded by source system'}`
                              : `Reason: still marked active upstream after ${formatStaleDurationHuman(call.durationSeconds)} with no update`}
                          </div>
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
                            {isStaleRow && <span className="text-[10px] uppercase tracking-wide mr-1 align-middle">Age</span>}
                            {isStaleRow ? formatStaleDurationHuman(call.durationSeconds) : formatDurationLong(call.durationSeconds)}
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

        {/* C. Performance Ratios — one semantic source (useRatioSummary),
            same as Ratio Explorer. Each card is a stable-ratio-ID deep
            link, never a generic /ratios navigation. */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Performance Ratios</div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline min-h-6 p-1 -m-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
              onClick={() => navigate('/ratios', { state: DASHBOARD_ORIGIN_STATE })}
            >
              Explore all ratios &rarr;
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {DASHBOARD_PERFORMANCE_RATIO_IDS.map((ratioId) => (
              <PerformanceRatioCard key={ratioId} ratioId={ratioId} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3">
          {/* D. Recent Interactions — Voice + Chat merged (see hook-level
              comment above for why this is a genuine merge, not a new
              aggregation). */}
          <Card className="bg-card border-border">
            <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-foreground">Recent Interactions</CardTitle>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline min-h-6 p-1 -m-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
                onClick={() => navigate('/call-logs', { state: DASHBOARD_ORIGIN_STATE })}
              >
                View all &rarr; Call Logs
              </button>
            </CardHeader>
            <CardContent className="px-3 pb-2">
              {recent.isLoading || chat.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : recentInteractions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">No recent interactions.</p>
              ) : (
                <>
                  <div className="hidden sm:grid sm:[grid-template-columns:minmax(3rem,3.5rem)_minmax(0,26rem)_minmax(7rem,12rem)_minmax(5rem,7rem)_minmax(3rem,4rem)] sm:gap-2 items-center px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                    <span>Channel</span>
                    <span>Customer / Context</span>
                    <span>Agent</span>
                    <span>Outcome</span>
                    <span className="text-right">Duration</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {recentInteractions.map((row) =>
                      row.kind === 'call' ? (
                        <button
                          key={`call-${row.call.interactionId}`}
                          type="button"
                          onClick={() => setSelectedInteraction(row.call)}
                          className="w-full flex flex-col gap-1 sm:grid sm:[grid-template-columns:minmax(3rem,3.5rem)_minmax(0,26rem)_minmax(7rem,12rem)_minmax(5rem,7rem)_minmax(3rem,4rem)] sm:items-center sm:gap-2 py-1.5 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-sm px-1 -mx-1"
                        >
                          <div className="hidden sm:block">
                            <Badge variant="outline" className="text-xs py-0 px-1.5 border-slate-600 text-foreground">Voice</Badge>
                          </div>
                          <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                            <span className="sm:hidden"><Badge variant="outline" className="text-xs py-0 px-1.5 border-slate-600 text-foreground mr-1">Voice</Badge></span>
                            <span className="font-medium text-foreground truncate text-sm">{row.call.callerName || formatPhoneNumber(row.call.phoneNumber)}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {row.call.intent || '—'} ·{' '}
                              <span className="sm:hidden">{row.call.agentDisplayName ?? row.call.agentId ?? 'Unknown agent'}</span>
                              <span className="hidden sm:inline">{formatPhoneNumber(row.call.phoneNumber)}</span>
                            </span>
                          </div>
                          <div className="hidden sm:block min-w-0 text-xs text-muted-foreground truncate" title={row.call.agentDisplayName ?? row.call.agentId ?? undefined}>
                            {row.call.agentDisplayName ?? row.call.agentId ?? 'Unknown agent'}
                          </div>
                          <div className="flex items-center justify-between gap-2 sm:contents">
                            <Badge
                              variant={row.call.status === 'active' ? 'secondary' : row.call.outcome === 'escalated' ? 'escalated' : row.call.outcome === 'resolved' ? 'positive' : 'default'}
                              className="whitespace-nowrap text-xs"
                            >
                              {formatStatusLabel(row.call.outcome ?? row.call.status)}
                            </Badge>
                            <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:text-right" title={formatDurationExact(row.call.durationSeconds)}>
                              {formatDurationLong(row.call.durationSeconds)}
                            </div>
                          </div>
                        </button>
                      ) : (
                        <button
                          key={`chat-${row.chat.sessionId}`}
                          type="button"
                          onClick={() => setSelectedChatSessionId(row.chat.sessionId)}
                          className="w-full flex flex-col gap-1 sm:grid sm:[grid-template-columns:minmax(3rem,3.5rem)_minmax(0,26rem)_minmax(7rem,12rem)_minmax(5rem,7rem)_minmax(3rem,4rem)] sm:items-center sm:gap-2 py-1.5 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-sm px-1 -mx-1"
                        >
                          <div className="hidden sm:block">
                            <Badge variant="outline" className="text-xs py-0 px-1.5 border-slate-600 text-foreground">Chat</Badge>
                          </div>
                          <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                            <span className="sm:hidden"><Badge variant="outline" className="text-xs py-0 px-1.5 border-slate-600 text-foreground mr-1">Chat</Badge></span>
                            <span className="font-medium text-foreground truncate text-sm">{row.chat.callerName || formatPhoneNumber(row.chat.phoneNumber ?? '')}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {row.chat.latestIntent || '—'} ·{' '}
                              <span className="sm:hidden">{row.chat.agentName ?? 'Unknown agent'}</span>
                              <span className="hidden sm:inline">{formatPhoneNumber(row.chat.phoneNumber ?? '')}</span>
                            </span>
                          </div>
                          <div className="hidden sm:block min-w-0 text-xs text-muted-foreground truncate" title={row.chat.agentName ?? undefined}>
                            {row.chat.agentName ?? 'Unknown agent'}
                          </div>
                          <div className="flex items-center justify-between gap-2 sm:contents">
                            <Badge variant="default" className="whitespace-nowrap text-xs">
                              {formatStatusLabel(row.chat.status)}
                            </Badge>
                            <div
                              className="text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:text-right"
                              title={formatDurationExact(Math.max(0, Math.round((new Date(row.chat.updatedAt).getTime() - new Date(row.chat.startedAt).getTime()) / 1000)))}
                            >
                              {formatDurationLong(Math.max(0, Math.round((new Date(row.chat.updatedAt).getTime() - new Date(row.chat.startedAt).getTime()) / 1000)))}
                            </div>
                          </div>
                        </button>
                      ),
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* E. Agent Load — unchanged data; already navigates to Agent
              Detail with Dashboard origin via the existing mechanism. */}
          <div className="max-h-[220px] overflow-y-auto">
            <AgentActivityPanel
              agents={agentRoster}
              activeInteractions={activeInteractions}
              isLoading={agents.isLoading || recent.isLoading}
              onAgentClick={(agentId) => {
                const link = buildDashboardAgentDetailLink(agentId);
                navigate(link.path, { state: link.state });
              }}
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
        <ChatSessionDetailDialog
          isOpen={Boolean(selectedChatSessionId)}
          onClose={() => setSelectedChatSessionId(null)}
          sessionId={selectedChatSessionId}
        />
      </div>
    </Layout>
  );
};

export default Dashboard;
