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

/**
 * Session 9.1 — VoiceForce Outbound Campaign Domain Build
 * (docs/SESSION_9_1_OUTBOUND_CAMPAIGN_DOMAIN_BUILD.md,
 * VOICEFORCE_OUTBOUND_CAMPAIGN_DESIGN_v2.docx).
 *
 * A Call Agent is defined and owned by Call Centre, identified by an
 * immutable `agentId` — a material definition change means a NEW
 * agentId, never an `agentVersion` field. `agentName` is human-readable
 * only. VoiceForce (this app) selects a Call Agent and snapshots its
 * contract; it never defines the agent, its prompt, or its expected
 * outcomes.
 *
 * Session 11.7: these six types used to be independently redefined here
 * AND in src/types/campaign.ts (two hand-maintained copies of the same
 * shape). src/types/campaign.ts is now the single authoritative
 * definition (docs/SESSION_11_7_AI_AGENTS_IMPLEMENTATION.md) — this file
 * just re-exports it, so every existing import of these names from
 * './types.js' keeps working unchanged.
 */
export type {
  AgentContractSource,
  AgentContractCompleteness,
  AgentInputField,
  AgentOutcomeDefinition,
  AgentOutputField,
  CallAgentContract,
} from '../../types/campaign.js';

/** The three source classes this build supports (plan Phase 4) — no generic CRM connector. */
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

export type NewCampaignAgentInputMappingInput = Omit<CampaignAgentInputMapping, 'id' | 'campaignId'>;

/** Deterministic (non-LLM) validation of one campaign's mapping against its agent contract. */
export interface InputMappingValidationResult {
  valid: boolean;
  missingRequiredFieldCodes: string[];
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  agentId: string;
  /** Human-readable snapshot only — never used for identity or correlation. */
  agentName: string | null;
  /** Immutable, captured at create time (Phase 2) — never re-derived from a live /agents call. */
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
  mappings: CampaignAgentInputMapping[];
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
  /**
   * The deterministic Trigger Call payload actually sent for this
   * execution (Session 9.1 Phase 3/5/7) — an audit/stability snapshot,
   * not re-derived from current Customer 360 state. Null for executions
   * created before this field existed.
   */
  requestPayloadSnapshot: Record<string, unknown> | null;
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
  /** Historical traceability (Session 9.1 Phase 7) — populated only when supplied, never fabricated. */
  agentId: string | null;
  agentName: string | null;
  structuredOutputs: Record<string, unknown> | null;
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
  /**
   * Session 9.1 Phase 7 additions — a plain copy of the campaign's own
   * agent snapshot at reconciliation time (never an LLM-derived value,
   * never fabricated when the agent contract has no structured outputs
   * to offer, which is every campaign today since /agents is roster-only).
   */
  agentId: string | null;
  agentName: string | null;
  structuredOutputs: Record<string, unknown> | null;
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
  /**
   * Authoritative external identity (CIF), when the CSV supplies one
   * (Session 11.5A §11/§C) — resolved through the SAME
   * identityResolver.ts precedence Voice/Chat already use (CIF -> phone
   * -> create), never a separate phone-only SQL-side match.
   */
  customerReference: string | null;
  sourceAttributes: Record<string, unknown>;
}

export interface ImportTargetsResult {
  customersCreated: number;
  customersMatched: number;
  rowsSkipped: number;
}

/**
 * One customer's campaign-participation row (Session 11.5A workstream
 * B) — CampaignTargetRow plus the campaign identity fields a
 * customer-scoped view needs that a campaign-scoped view (where the
 * campaign is already known from context) doesn't carry.
 */
export interface CustomerCampaignTargetRow extends CampaignTargetRow {
  campaignName: string;
  /** Immutable Call Agent id the campaign is configured against — never agent_version. */
  campaignAgentId: string;
  campaignAgentName: string | null;
}
