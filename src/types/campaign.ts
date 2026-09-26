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

/**
 * Session 9.1 — VoiceForce Outbound Campaign Domain Build. Mirrors
 * src/server/campaigns/types.ts's Agent Contract model (no shared
 * import across the client/server boundary, same convention as every
 * other domain in this project — see src/types/customer.ts).
 */
export type AgentContractSource = 'partner_api' | 'legacy';
export type AgentContractCompleteness = 'complete' | 'partial';

export interface AgentInputField {
  fieldCode: string;
  displayName: string;
  dataType?: string;
  required: boolean;
  description?: string;
  allowedValues?: string[];
}

export interface AgentOutcomeDefinition {
  outcomeCode: string;
  displayName: string;
  description?: string;
  active?: boolean;
}

export interface AgentOutputField {
  fieldCode: string;
  displayName: string;
  dataType?: string;
  description?: string;
}

export interface CallAgentContract {
  agentId: string;
  agentName: string;
  status?: string;
  direction?: string;
  description?: string;
  expectedInputFields: AgentInputField[];
  expectedOutcomes: AgentOutcomeDefinition[];
  outputFields: AgentOutputField[];
  contractSource: AgentContractSource;
  contractCompleteness: AgentContractCompleteness;
}

export type InputMappingSourceType = 'customer360' | 'csv' | 'campaign_field';

export interface CampaignAgentInputMapping {
  id: string;
  campaignId: string;
  agentInputFieldCode: string;
  sourceType: InputMappingSourceType;
  sourceField: string;
  required: boolean;
  dataType: string | null;
}

export interface NewCampaignAgentInputMappingInput {
  agentInputFieldCode: string;
  sourceType: InputMappingSourceType;
  sourceField: string;
  required?: boolean;
  dataType?: string | null;
}

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
  agentName: string | null;
  agentContractSnapshot: CallAgentContract | null;
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
  mappings: CampaignAgentInputMapping[];
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
  /** Session 9.2 — true when the server filtered rows to the caller's authorized categories (same convention as Call Logs, see src/services/calls/callsService.ts). */
  scoped?: boolean;
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
  agentName?: string;
  agentContractSnapshot?: CallAgentContract;
  mappings?: NewCampaignAgentInputMappingInput[];
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
