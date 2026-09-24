/**
 * Domain types for the Customer 360 logical architecture
 * (docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §0.3). Nothing in this
 * file depends on Supabase, Vercel, or any other deployment adapter —
 * only the repository/adapter implementations do.
 */

export type ContactPointType = 'phone' | 'email';

export interface Customer {
  id: string;
  displayName: string | null;
  sourceCustomerRef: string | null;
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
  authSummary: { everAuthenticated: boolean; lastAuthenticatedAt: string | null } | null;
  aggregationVersion: number;
  aggregatedAt: string;
}

export interface ContactPoint {
  id: string;
  customerId: string;
  type: ContactPointType;
  rawValue: string;
  normalizedValue: string;
  isPrimary: boolean;
  firstSeen: string;
  lastSeen: string;
}

export interface CustomerInteractionRecord {
  id: string;
  customerId: string;
  contactPointId: string | null;
  interactionId: string;
  channel: string;
  direction: string | null;
  agentId: string | null;
  agentDisplayName: string | null;
  /** Denormalized display cache only — NEVER used for authorization decisions. See §11/§16. */
  categoryId: string | null;
  startedAt: string;
  durationSeconds: number | null;
  intent: string | null;
  outcome: string | null;
  sentimentScore: number | null;
  wasAuthenticated: boolean | null;
  escalationTrigger: string | null;
  campaignName: string | null;
  recordingAvailable: boolean;
  source: string;
}

/** Input shape for upserting one interaction — mirrors CustomerInteractionRecord minus generated/derived fields. */
export type NewInteractionInput = Omit<CustomerInteractionRecord, 'id' | 'categoryId'>;

export interface Category {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

/** Role → category access, per plan §10. */
export interface RoleAccess {
  role: string;
  allCategories: boolean;
  categoryIds: string[];
}

/**
 * A source interaction, as returned by an interaction-source adapter
 * (today: the Voice Agent backend's call-data). Deliberately narrow —
 * only what the aggregation service needs to upsert a
 * CustomerInteractionRecord, not a full DTO passthrough.
 */
export interface SourceInteraction {
  interactionId: string;
  channel: string;
  phoneNumber: string;
  direction: string | null;
  agentId: string | null;
  agentDisplayName: string | null;
  startedAt: string;
  durationSeconds: number | null;
  intent: string | null;
  outcome: string | null;
  sentimentScore: number | null;
  wasAuthenticated: boolean | null;
  escalationTrigger: string | null;
  campaignName: string | null;
  recordingAvailable: boolean;
  source: string;
}
