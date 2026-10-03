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
  | 'closed'
  /** Session 12.7 — target-level Hold, distinct from campaign-level Pause. Excluded from runner selection the same way 'skipped' already is. */
  | 'held';

export type CampaignExecutionStatus = 'queued' | 'triggering' | 'triggered' | 'failed';
export type ReconciliationStatus = 'pending' | 'reconciled' | 'unresolved' | 'error';
export type NextActionType = 'retry' | 'follow_up' | 'close' | 'escalate' | 'move_campaign';

/**
 * Session 9.1 — VoiceForce Outbound Campaign Domain Build. Session 11.7:
 * this is now the single authoritative definition of the Agent Contract
 * shape (src/server/campaigns/types.ts re-exports it) — previously two
 * independently hand-maintained copies existed.
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
  /** Session 12.4 — e.g. "YYYY-MM-DD" for a date field. */
  format?: string;
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
  /** Session 12.4 */
  nullable?: boolean;
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
  /** Session 13.4 — the configuration version this mapping row belongs to (already returned by the API since Session 12.7; exposed on this type now for Configuration History). Null for a never-versioned draft/legacy campaign. */
  configurationVersionId: string | null;
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
  /** Session 12.6 — see CampaignStats doc in src/server/campaigns/types.ts. Zero for legacy/non-policy campaigns. */
  policyClassifiedCount: number;
  policySuccessfulCount: number;
  classificationCounts: Record<string, number>;
}

/**
 * Session 12.6 — one campaign-specific mapping from an agent outcome
 * code to the system-owned Universal Campaign Classification
 * vocabulary (see CampaignClassification below), plus the configured
 * Next Action label. Reuses NextActionType unchanged.
 */
export interface OutcomePolicyMapping {
  agentOutcomeCode: string;
  campaignClassificationCode: string;
  nextActionType: NextActionType | null;
}

/** Immutable, captured once at campaign-creation time — same pattern as CallAgentContract. Null for pre-12.6 campaigns. */
export interface OutcomePolicySnapshot {
  mappings: OutcomePolicyMapping[];
  capturedAt: string;
}

/**
 * Session 12.6 — the small, SYSTEM-OWNED Universal Campaign
 * Classification vocabulary. Always fetched live via
 * useCampaignClassifications() — NEVER hardcoded as a literal array in
 * a component. `isSuccess`/`isFallbackUnresolved` are data, not
 * something UI logic re-derives from the code string.
 */
export interface CampaignClassification {
  code: string;
  label: string;
  description: string | null;
  isSuccess: boolean;
  isFallbackUnresolved: boolean;
  sortOrder: number;
  active: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  agentId: string;
  agentName: string | null;
  agentContractSnapshot: CallAgentContract | null;
  /** Session 12.6 — immutable, captured at create time. Null for pre-12.6 campaigns (legacy — no outcome policy). */
  outcomePolicySnapshot: OutcomePolicySnapshot | null;
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
  /**
   * Session 12.5 — the agent-specific business outcome from the
   * authoritatively matched call, kept separate from
   * campaignResultCode/campaignResultLabel above (still the existing,
   * generic rule-derived result). Null for every historical target and
   * for any target whose matched call simply had these fields null —
   * both honest states, never backfilled or inferred.
   */
  resultActualOutcomeCode: string | null;
  resultActualOutcomeName: string | null;
  resultStructuredOutputs: Record<string, unknown> | null;
  /** Session 12.6 — see CampaignTargetRow doc in src/server/campaigns/types.ts for the full explanation. */
  resultClassificationCode: string | null;
  resultClassificationContractDrift: boolean;
  resultClassificationNextActionType: NextActionType | null;
  latestExecutionStatus: CampaignExecutionStatus | null;
  latestReconciliationStatus: ReconciliationStatus | null;
  latestReconciledInteractionId: string | null;
  /** Session 12.7 — which configuration version governed the most recent execution attempt. Null for a legacy/never-versioned execution. */
  latestConfigurationVersionId: string | null;
  /** Session 12.7 — present only when this target is currently status='skipped'. */
  skipReasonCode: string | null;
  skipComment: string | null;
  /** Session 12.7 — present only when this target is currently status='held'. Cleared on release. */
  holdReason: string | null;
  holdNote: string | null;
  /** Session 12.7 — the originally imported attributes, captured once and never modified again. Null for a target never amended. */
  originalSourceAttributes: Record<string, unknown> | null;
  /** Session 12.7 — groups targets added together via the same CSV/import call. */
  importBatchId: string | null;
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
  /** Session 12.6 — omitted/undefined for a campaign with no configured outcome policy (legacy behavior preserved). */
  outcomePolicySnapshot?: OutcomePolicySnapshot;
}

export interface ImportTargetRow {
  name: string | null;
  phone: string;
  /** CIF/external identity, when the CSV's customer_reference column supplies one (Session 11.5A). */
  customerReference: string | null;
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

// ---------------------------------------------------------------------
// Session 12.7 — Campaign Administration, Configuration Versioning &
// Target Controls.
// ---------------------------------------------------------------------

export interface CampaignConfigurationVersion {
  id: string;
  campaignId: string;
  versionNumber: number;
  status: 'active' | 'superseded';
  agentId: string;
  agentName: string | null;
  agentContractSnapshot: CallAgentContract | null;
  outcomePolicySnapshot: OutcomePolicySnapshot | null;
  createdAt: string;
  createdBy: string | null;
  changeReason: string | null;
  previousVersionId: string | null;
}

export interface CampaignAuditEvent {
  id: string;
  campaignId: string;
  eventType: string;
  actor: string | null;
  occurredAt: string;
  campaignTargetId: string | null;
  campaignExecutionId: string | null;
  configurationVersionId: string | null;
  reason: string | null;
  comment: string | null;
  detail: Record<string, unknown> | null;
}

/** System-configured Skip Reason master — always fetched live via fetchCampaignSkipReasons(), never hardcoded. */
export interface CampaignSkipReason {
  code: string;
  label: string;
  description: string | null;
  requiresComment: boolean;
  sortOrder: number;
  active: boolean;
}

export interface CampaignTargetMutationResult {
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
  skipReasonCode: string | null;
  skipComment: string | null;
  holdReason: string | null;
  holdNote: string | null;
  originalSourceAttributes: Record<string, unknown> | null;
  importBatchId: string | null;
}
