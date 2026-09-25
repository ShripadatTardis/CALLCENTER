/**
 * Domain types for Campaigns (docs/CALL_CENTRE_SESSION5_CAMPAIGNS_PLAN.md
 * §6/§8/§9/§10). Nothing in this file depends on Supabase, Vercel, or any
 * other deployment adapter — only the repository/adapter implementation
 * does (see supabaseCampaignRepository.ts).
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

/** Trigger Call action's own lifecycle only — never conflated with reconciliation status (plan §8). */
export type CampaignExecutionStatus = 'queued' | 'triggering' | 'triggered' | 'failed';

/** A distinct state machine from execution status (plan §8/§14). */
export type ReconciliationStatus = 'pending' | 'reconciled' | 'unresolved' | 'error';

export type NextActionType = 'retry' | 'follow_up' | 'close' | 'escalate' | 'move_campaign';

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

/** Target-level classified-success stats (plan §25's final amendment) — never row-level. */
export interface CampaignStats {
  targetCount: number;
  triggeredCount: number;
  classifiedCount: number;
  successCount: number;
}

export interface CampaignWithStats extends Campaign {
  stats: CampaignStats;
}

export interface CampaignDetail extends Campaign {
  rules: CampaignResultRule[];
  stats: CampaignStats;
}

export interface CampaignTarget {
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
}

/** A target row joined with display fields the target list needs (plan §20). */
export interface CampaignTargetRow extends CampaignTarget {
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

/** A runnable target, joined with what the runner (§16) needs to trigger a call. */
export interface RunnableTarget extends CampaignTarget {
  contactRawValue: string;
  sourceCustomerRef: string | null;
  campaignAgentId: string;
}

export interface CampaignExecution {
  id: string;
  campaignTargetId: string;
  sequence: number;
  status: CampaignExecutionStatus;
  callSid: string | null;
  reconciliationStatus: ReconciliationStatus;
  reconciledInteractionId: string | null;
  reconciliationCandidate: Record<string, unknown> | null;
  reconciledAt: string | null;
  triggeredAt: string | null;
  errorDetail: string | null;
  createdAt: string;
}

export interface PendingReconciliation extends CampaignExecution {
  customerId: string;
  campaignId: string;
  contactRawValue: string;
}

export interface CampaignResultRule {
  id: string;
  campaignId: string;
  priority: number;
  matchField: string;
  matchValue: string;
  resultCode: string;
  resultLabel: string;
  /** Explicit, separately-configured classification (plan §10) — never inferred from resultCode/resultLabel text. */
  isSuccess: boolean | null;
  nextActionType: NextActionType | null;
  nextActionDelayDays: number | null;
  active: boolean;
}

export type NewCampaignResultRuleInput = Omit<CampaignResultRule, 'id' | 'campaignId'>;

export interface CampaignResult {
  id: string;
  campaignExecutionId: string;
  campaignTargetId: string;
  callStatus: string | null;
  callOutcome: string | null;
  intent: string | null;
  campaignResultCode: string;
  campaignResultLabel: string;
  isSuccess: boolean | null;
  resultDetail: Record<string, unknown> | null;
  resultSource: 'rule_match' | 'manual';
  resultRecordedAt: string;
  nextAction: string | null;
}

/** The derived-result payload passed into update_reconciliation_status on a 'reconciled' transition (plan §10/§22). */
export interface DerivedCampaignResult {
  callStatus: string | null;
  callOutcome: string | null;
  intent: string | null;
  resultCode: string;
  resultLabel: string;
  isSuccess: boolean | null;
  resultDetail: Record<string, unknown> | null;
  resultSource: 'rule_match' | 'manual';
  nextAction: string | null;
  nextActionType: NextActionType | null;
}

export interface CampaignFollowup {
  id: string;
  campaignTargetId: string;
  campaignResultId: string | null;
  followUpType: 'retry' | 'scheduled_contact' | 'move_to_campaign' | 'manual_review';
  dueAt: string;
  status: 'pending' | 'done' | 'cancelled';
  nextCampaignId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface NewTargetRow {
  name: string | null;
  phone: string;
  sourceAttributes: Record<string, unknown>;
}

export interface ImportTargetsResult {
  customersCreated: number;
  customersMatched: number;
  rowsSkipped: number;
}
