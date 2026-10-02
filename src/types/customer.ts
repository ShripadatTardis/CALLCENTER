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
  /** Last-4-digits-masked primary phone — never the full number. See src/lib/customerDisplayLabel.ts. */
  primaryPhoneMasked: string | null;
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
  /** Raw phone contact-point values — used to look up a Voice interaction's full call-data row (see CustomerDetail.tsx). */
  phoneNumbers: string[];
}

export interface CustomerInteractionsResponse {
  data: CustomerInteractionRow[];
  pagination: { page: number; pageSize: number; totalCount: number };
}

/**
 * Session 11.5B — Customer Campaign Participation/History (§C.3 of the
 * implementation prompt). Mirrors src/server/campaigns/types.ts's
 * `CustomerCampaignTargetRow` field-for-field; the API
 * (`GET /api/customers/{id}?action=campaigns`, built in Session 11.5A)
 * serializes that server type directly with no separate DTO mapper,
 * same as the rest of this domain (see the header comment above).
 * `effectiveResultId`/`campaignResultLabel`/`resultIsSuccess` reflect
 * the target's CURRENT effective result only — the latest successfully
 * reconciled attempt, per Session 11.5A's confirmed policy. No
 * best-result-wins/ranking concept exists anywhere in this shape.
 */
export interface CustomerCampaignRow {
  id: string;
  campaignId: string;
  customerId: string;
  contactPointId: string;
  status: string;
  attemptCount: number;
  lastActionAt: string | null;
  nextActionAt: string | null;
  effectiveResultId: string | null;
  createdAt: string;
  updatedAt: string;
  contactRawValue: string;
  customerDisplayName: string | null;
  campaignResultCode: string | null;
  campaignResultLabel: string | null;
  resultIsSuccess: boolean | null;
  resultNextAction: string | null;
  latestExecutionStatus: string | null;
  latestReconciliationStatus: string | null;
  latestReconciledInteractionId: string | null;
  campaignName: string;
  /** Immutable Call Agent id the campaign is configured against — never agent_version. */
  campaignAgentId: string;
  campaignAgentName: string | null;
}

export interface CustomerCampaignsResponse {
  data: CustomerCampaignRow[];
}

/**
 * Session 13.1 — Customer Activity/Diary (DEC-CUST-02). Mirrors
 * src/server/customer360/activityRepository.ts's `CustomerActivity`
 * field-for-field; the API (`GET/POST/PATCH /api/customers/{id}?action=activities`)
 * serializes that server type directly, same convention as every other
 * shape in this file (see the header comment above).
 */
export type ActivityType = 'note' | 'instruction' | 'task' | 'reminder' | 'appointment';
export type ActivityStatus = 'active' | 'open' | 'completed' | 'cancelled' | 'inactive';

export interface CustomerActivityRow {
  id: string;
  customerId: string;
  activityType: ActivityType;
  title: string | null;
  body: string;
  status: ActivityStatus;
  priority: string | null;
  scheduledAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  campaignId: string | null;
  campaignTargetId: string | null;
  interactionId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
}

export interface CustomerActivitiesResponse {
  data: CustomerActivityRow[];
}

export interface NewCustomerActivityPayload {
  activityType: ActivityType;
  title?: string | null;
  body: string;
  priority?: string | null;
  scheduledAt?: string | null;
  dueAt?: string | null;
  createdBy?: string | null;
}
