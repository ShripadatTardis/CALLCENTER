import type { Interaction } from '@/types/interaction';
import type { ChatSessionSummary } from '@/types/chat';
import { computeAgentCallMetrics, groupInteractionsByAgent } from '@/services/agents/agentPerformanceAggregator';

/**
 * Session 7 §5 — the scoped-role alternative to /analytics/metrics'
 * GLOBAL aggregate. That endpoint has no agent_id/category_id/domain
 * filter, so for a scoped role its numbers would leak hidden-category
 * volume if shown directly. Instead, this derives what CAN be honestly
 * computed from the same server-authorized call-data rows Call Logs
 * already fetches (api/calls/data.ts's Session 6.2 category filtering) —
 * and explicitly returns `null`/`unavailable` for anything that can't be
 * (concurrency, turn latency, time-series charts — none of these exist
 * on the per-row Interaction shape, only on the global aggregate this
 * role must not see).
 *
 * Reuses computeAgentCallMetrics unchanged (the exact same formula Agent
 * Detail already uses) rather than a second, divergent implementation —
 * this file only adds outcome/AHT-distribution shaping on top.
 */

export interface ScopedVoiceMetrics {
  /** Count of rows actually fetched/authorized in this sample — never presented as a true window total. */
  sampleSize: number;
  resolvedCount: number;
  escalatedCount: number;
  fcrRate: number | null;
  avgAhtSeconds: number | null;
  avgIntentAccuracy: number | null;
  outcomes: Array<{ name: string; value: number }>;
  ahtDistribution: Array<{ bucket: string; count: number }>;
  callsByAgent: Array<{ agent: string; count: number }>;
  /** Always true here — these are derived from a fetched sample, never a true global window total. */
  pageScoped: true;
}

const AHT_BUCKETS: Array<{ label: string; max: number }> = [
  { label: '0–30s', max: 30 },
  { label: '30–60s', max: 60 },
  { label: '1–2m', max: 120 },
  { label: '2–3m', max: 180 },
  { label: '3–5m', max: 300 },
  { label: '5m+', max: Infinity },
];

function bucketAht(durations: number[]): Array<{ bucket: string; count: number }> {
  return AHT_BUCKETS.map((b, i) => {
    const min = i === 0 ? 0 : AHT_BUCKETS[i - 1].max;
    return { bucket: b.label, count: durations.filter((d) => d > min && d <= b.max).length };
  });
}

export function computeScopedVoiceMetrics(
  interactions: Interaction[],
  agentsById: Map<string, { agentId: string; displayName: string }>,
): ScopedVoiceMetrics {
  const base = computeAgentCallMetrics(interactions);
  const otherCount = interactions.length - base.resolvedCount - base.escalatedCount;
  const durations = interactions.map((i) => i.durationSeconds).filter((v): v is number => v != null);

  const byAgent = groupInteractionsByAgent(interactions);
  const callsByAgent = Array.from(byAgent.entries())
    .map(([agentId, rows]) => ({ agent: agentsById.get(agentId)?.displayName ?? agentId, count: rows.length }))
    .sort((a, b) => b.count - a.count);

  return {
    sampleSize: interactions.length,
    resolvedCount: base.resolvedCount,
    escalatedCount: base.escalatedCount,
    fcrRate: base.fcrRate,
    avgAhtSeconds: base.avgAhtSeconds,
    avgIntentAccuracy: base.avgIntentAccuracy,
    outcomes: [
      { name: 'Resolved', value: base.resolvedCount },
      { name: 'Escalated', value: base.escalatedCount },
      { name: 'Other', value: Math.max(0, otherCount) },
    ],
    ahtDistribution: bucketAht(durations),
    callsByAgent,
    pageScoped: true,
  };
}

export interface ScopedChatMetrics {
  sampleSize: number;
  totalMatchingFilter: number;
  activeCount: number;
  completedCount: number;
  avgConfidence: number | null;
  avgLatencyMs: number | null;
  authenticatedShare: number | null;
  avgMessageCount: number | null;
  intentDistribution: Array<{ name: string; value: number }>;
  sessionsByAgent: Array<{ agent: string; count: number }>;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, v) => a + v, 0) / values.length;
}

/**
 * Session 7 §6/§9 — Chat has no aggregate-metrics or date-window API at
 * all (confirmed absent, plan §3), so this is always page/filter-scoped,
 * for EVERY role, not just scoped ones — `totalMatchingFilter` (the
 * server's real pagination total for the applied filter) must be shown
 * alongside `sampleSize` (rows actually fetched) so the UI can honestly
 * say "Analyzed N of M sessions" rather than implying full coverage.
 */
export function computeScopedChatMetrics(
  sessions: ChatSessionSummary[],
  totalMatchingFilter: number,
  agentsById: Map<string, { agentId: string; displayName: string }>,
): ScopedChatMetrics {
  const confidences = sessions.map((s) => s.latestConfidence).filter((v): v is number => v != null);
  const latencies = sessions.map((s) => s.latestLatencyMs).filter((v): v is number => v != null);
  const messageCounts = sessions.map((s) => s.messageCount).filter((v): v is number => v != null);
  const authenticated = sessions.filter((s) => s.authenticated).length;

  const intentCounts = new Map<string, number>();
  for (const s of sessions) {
    const key = s.latestIntent ?? 'unknown';
    intentCounts.set(key, (intentCounts.get(key) ?? 0) + 1);
  }

  const byAgent = new Map<string, number>();
  for (const s of sessions) {
    if (!s.agentId) continue;
    byAgent.set(s.agentId, (byAgent.get(s.agentId) ?? 0) + 1);
  }

  return {
    sampleSize: sessions.length,
    totalMatchingFilter,
    activeCount: sessions.filter((s) => s.status === 'active').length,
    completedCount: sessions.filter((s) => s.status === 'completed').length,
    avgConfidence: average(confidences),
    avgLatencyMs: average(latencies),
    authenticatedShare: sessions.length ? authenticated / sessions.length : null,
    avgMessageCount: average(messageCounts),
    intentDistribution: Array.from(intentCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    sessionsByAgent: Array.from(byAgent.entries())
      .map(([agentId, count]) => ({ agent: agentsById.get(agentId)?.displayName ?? agentId, count }))
      .sort((a, b) => b.count - a.count),
  };
}
