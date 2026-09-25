import type { Interaction } from '@/types/interaction';
import type { ChatSessionSummary } from '@/types/chat';
import type { CampaignWithStats } from '@/types/campaign';

/**
 * Pure, client-side aggregation of already-fetched data, grouped by
 * agentId — Session 6. Mirrors src/server/customer360/aggregationService.ts's
 * aggregation-math pattern (derive from raw rows, never persist a
 * separate score). No field here is invented: every input is a
 * real, already-mapped Interaction/ChatSessionSummary/CampaignWithStats
 * field (see docs/CALL_CENTRE_SESSION6_AGENTS_QUALITY_PLAN.md §7/§15).
 *
 * `GET /api/v1/analytics/metrics` has no per-agent breakdown beyond a
 * raw `calls_by_agent` count, so per-agent FCR/AHT/confidence must be
 * derived here from the same call-data/chat-sessions rows the rest of
 * the app already fetches — this file is that derivation, not a new
 * data source.
 */

export interface AgentCallMetrics {
  callsHandled: number;
  resolvedCount: number;
  escalatedCount: number;
  /** null when no call in the sample has an fcr value at all. */
  fcrRate: number | null;
  avgAhtSeconds: number | null;
  avgIntentAccuracy: number | null;
  avgSentimentScore: number | null;
  authenticatedCount: number;
}

export interface AgentChatMetrics {
  chatsHandled: number;
  avgConfidence: number | null;
  avgLatencyMs: number | null;
  authenticatedCount: number;
}

export interface AgentCampaignOutcomeSummary {
  campaignCount: number;
  targetCount: number;
  triggeredCount: number;
  classifiedCount: number;
  successCount: number;
  /** null when classifiedCount is 0 — never divide-by-zero into a fake 0%. */
  successRate: number | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function groupInteractionsByAgent(interactions: Interaction[]): Map<string, Interaction[]> {
  const map = new Map<string, Interaction[]>();
  for (const interaction of interactions) {
    if (!interaction.agentId) continue;
    const list = map.get(interaction.agentId);
    if (list) list.push(interaction);
    else map.set(interaction.agentId, [interaction]);
  }
  return map;
}

export function groupChatSessionsByAgent(sessions: ChatSessionSummary[]): Map<string, ChatSessionSummary[]> {
  const map = new Map<string, ChatSessionSummary[]>();
  for (const session of sessions) {
    if (!session.agentId) continue;
    const list = map.get(session.agentId);
    if (list) list.push(session);
    else map.set(session.agentId, [session]);
  }
  return map;
}

export function computeAgentCallMetrics(interactions: Interaction[]): AgentCallMetrics {
  const fcrKnown = interactions.filter((i) => i.fcr !== undefined && i.fcr !== null);
  return {
    callsHandled: interactions.length,
    resolvedCount: interactions.filter((i) => i.outcome === 'resolved').length,
    escalatedCount: interactions.filter((i) => i.outcome === 'escalated' || Boolean(i.escalation?.trigger)).length,
    fcrRate: fcrKnown.length === 0 ? null : fcrKnown.filter((i) => i.fcr).length / fcrKnown.length,
    avgAhtSeconds: average(interactions.map((i) => i.durationSeconds).filter((v): v is number => v != null)),
    avgIntentAccuracy: average(interactions.map((i) => i.intentAccuracy).filter((v): v is number => v != null)),
    avgSentimentScore: average(interactions.map((i) => i.sentimentScore).filter((v): v is number => v != null)),
    authenticatedCount: interactions.filter((i) => i.wasAuthenticated === true).length,
  };
}

export function computeAgentChatMetrics(sessions: ChatSessionSummary[]): AgentChatMetrics {
  return {
    chatsHandled: sessions.length,
    avgConfidence: average(sessions.map((s) => s.latestConfidence).filter((v): v is number => v != null)),
    avgLatencyMs: average(sessions.map((s) => s.latestLatencyMs).filter((v): v is number => v != null)),
    authenticatedCount: sessions.filter((s) => s.authenticated).length,
  };
}

export function computeAgentCampaignOutcomeSummary(campaigns: CampaignWithStats[]): AgentCampaignOutcomeSummary {
  const totals = campaigns.reduce(
    (acc, c) => ({
      targetCount: acc.targetCount + c.stats.targetCount,
      triggeredCount: acc.triggeredCount + c.stats.triggeredCount,
      classifiedCount: acc.classifiedCount + c.stats.classifiedCount,
      successCount: acc.successCount + c.stats.successCount,
    }),
    { targetCount: 0, triggeredCount: 0, classifiedCount: 0, successCount: 0 },
  );

  return {
    campaignCount: campaigns.length,
    ...totals,
    // Target-level success rate, same effective_result_id-based
    // definition Campaigns itself uses (Session 5 final amendment) —
    // never re-derived from raw campaign_results rows here.
    successRate: totals.classifiedCount === 0 ? null : totals.successCount / totals.classifiedCount,
  };
}
