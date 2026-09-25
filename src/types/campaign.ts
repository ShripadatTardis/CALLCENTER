/**
 * Normalized Campaign types for the frontend — these already come from
 * this app's own server (api/campaigns.ts, src/server/campaigns/types.ts),
 * so there is no separate DTO-boundary mapper here, matching the
 * Customer 360 convention (src/types/customer.ts).
 */

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed';

export type CampaignTargetStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'follow_up_due'
  | 'closed';

export type CampaignExecutionStatus = 'queued' | 'triggering' | 'triggered' | 'failed';
export type ReconciliationStatus = 'pending' | 'reconciled' | 'unresolved' | 'error';
export type NextActionType = 'retry' | 'follow_up' | 'close' | 'escalate' | 'move_campaign';

export interface CampaignStats {
  targetCount: number;
  triggeredCount: number;
  classifiedCount: number;
  successCount: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  agentId: string;
  status: CampaignStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  scheduledStartAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sourceMeta: Record<string, unknown> | null;
}

export interface CampaignWithStats extends Campaign {
  stats: CampaignStats;
}

export interface CampaignResultRule {
  id: string;
  campaignId: string;
  priority: number;
  matchField: string;
  matchValue: string;
  resultCode: string;
  resultLabel: string;
  isSuccess: boolean | null;
  nextActionType: NextActionType | null;
  nextActionDelayDays: number | null;
  active: boolean;
}

export interface CampaignDetail extends Campaign {
  rules: CampaignResultRule[];
  stats: CampaignStats;
}

export interface CampaignTargetRow {
  id: string;
  campaignId: string;
  customerId: string;
  contactPointId: string;
  status: CampaignTargetStatus;
  sourceAttributes: Record<string, unknown>;
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
  latestExecutionStatus: CampaignExecutionStatus | null;
  latestReconciliationStatus: ReconciliationStatus | null;
  latestReconciledInteractionId: string | null;
}

export interface CampaignListResponse {
  data: CampaignWithStats[];
  pagination: { page: number; pageSize: number; totalCount: number };
}

export interface CampaignTargetsResponse {
  data: CampaignTargetRow[];
  pagination: { page: number; pageSize: number; totalCount: number };
}

export interface NewResultRuleInput {
  priority?: number;
  matchField: string;
  matchValue: string;
  resultCode: string;
  resultLabel: string;
  isSuccess: boolean | null;
  nextActionType?: NextActionType | null;
  nextActionDelayDays?: number | null;
  active?: boolean;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  agentId: string;
  createdBy?: string;
  sourceMeta?: Record<string, unknown>;
  rules?: NewResultRuleInput[];
}

export interface ImportTargetRow {
  name: string | null;
  phone: string;
  sourceAttributes: Record<string, unknown>;
}

export interface ImportTargetsResult {
  customersCreated: number;
  customersMatched: number;
  rowsSkipped: number;
}

export interface RunBatchResult {
  processed: number;
  triggered: number;
  failed: number;
}
