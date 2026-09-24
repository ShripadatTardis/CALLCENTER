import type { CustomerInteractionRecord } from './types.js';

export interface ComputedAggregate {
  firstSeen: string;
  lastSeen: string;
  totalInteractions: number;
  inboundCount: number;
  outboundCount: number;
  latestIntent: string | null;
  latestOutcome: string | null;
  latestSentimentLabel: string | null;
  latestSentimentScore: number | null;
  escalationCount: number;
  channels: string[];
  latestAgentId: string | null;
  latestAgentDisplayName: string | null;
  authSummary: { everAuthenticated: boolean; lastAuthenticatedAt: string | null };
}

/**
 * The single deterministic reducer behind plan §6 ("customer aggregates
 * are recomputed deterministically from persisted interactions") and
 * §12 (authorized-view aggregates). Used by BOTH
 * supabaseCustomerRepository.recomputeCustomerAggregate (the full,
 * persisted aggregate) and authorizationService (the response-shaped,
 * authorized-subset aggregate) so the two can never drift out of sync —
 * one aggregate algorithm, two different input row sets.
 *
 * Never increments anything — always a full fold over the given rows.
 */
export function computeAggregate(rows: CustomerInteractionRecord[]): ComputedAggregate {
  if (rows.length === 0) {
    const now = new Date().toISOString();
    return {
      firstSeen: now,
      lastSeen: now,
      totalInteractions: 0,
      inboundCount: 0,
      outboundCount: 0,
      latestIntent: null,
      latestOutcome: null,
      latestSentimentLabel: null,
      latestSentimentScore: null,
      escalationCount: 0,
      channels: [],
      latestAgentId: null,
      latestAgentDisplayName: null,
      authSummary: { everAuthenticated: false, lastAuthenticatedAt: null },
    };
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const latest = sorted[sorted.length - 1];

  const channels = Array.from(new Set(sorted.map((r) => r.channel)));
  const inboundCount = sorted.filter((r) => r.direction === 'inbound').length;
  const outboundCount = sorted.filter((r) => r.direction === 'outbound').length;
  const escalationCount = sorted.filter((r) => Boolean(r.escalationTrigger)).length;

  const authenticatedRows = sorted.filter((r) => r.wasAuthenticated === true);
  const everAuthenticated = authenticatedRows.length > 0;
  const lastAuthenticatedAt = everAuthenticated
    ? authenticatedRows[authenticatedRows.length - 1].startedAt
    : null;

  return {
    firstSeen: sorted[0].startedAt,
    lastSeen: latest.startedAt,
    totalInteractions: sorted.length,
    inboundCount,
    outboundCount,
    latestIntent: latest.intent,
    latestOutcome: latest.outcome,
    latestSentimentLabel: null,
    latestSentimentScore: latest.sentimentScore,
    escalationCount,
    channels,
    latestAgentId: latest.agentId,
    latestAgentDisplayName: latest.agentDisplayName,
    authSummary: { everAuthenticated, lastAuthenticatedAt },
  };
}
