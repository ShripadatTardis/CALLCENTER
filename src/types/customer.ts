/**
 * API response shapes for /api/customers/* — these already come from
 * this app's own server (src/server/customer360, api/customers/*), not
 * a third-party DTO, so there is no separate mapper boundary the way
 * calls/agents have one (Session 1's rule). Field names here match the
 * domain types in src/server/customer360/types.ts directly.
 */

export interface CustomerSummary {
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
}

export interface CustomerInteractionRow {
  id: string;
  customerId: string;
  contactPointId: string | null;
  interactionId: string;
  channel: string;
  direction: string | null;
  agentId: string | null;
  agentDisplayName: string | null;
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

export interface AuthorizedAggregate {
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

export interface RefreshStatus {
  attempted: boolean;
  failed: boolean;
  insertedCount: number;
  error?: string;
}

export interface CustomerListResponse {
  data: CustomerSummary[];
  pagination: { page: number; pageSize: number; totalCount: number };
  materializationWarning: string | null;
}

export interface CustomerDetailResponse {
  customer: Pick<CustomerSummary, 'id' | 'displayName' | 'sourceCustomerRef' | 'firstSeen' | 'lastSeen'>;
  aggregate: AuthorizedAggregate;
  refresh: RefreshStatus;
}

export interface CustomerInteractionsResponse {
  data: CustomerInteractionRow[];
  pagination: { page: number; pageSize: number; totalCount: number };
}
