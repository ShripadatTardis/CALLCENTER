import type {
  Campaign,
  CampaignClassification,
  CampaignDetail,
  CampaignExecution,
  CampaignFollowup,
  CampaignStatus,
  CampaignTargetRow,
  CampaignWithStats,
  CallAgentContract,
  CampaignAgentInputMapping,
  CustomerCampaignTargetRow,
  DerivedCampaignResult,
  ImportTargetsResult,
  NewCampaignAgentInputMappingInput,
  NewCampaignResultRuleInput,
  NewTargetRow,
  NextActionType,
  OutcomePolicySnapshot,
  PendingReconciliation,
  ReconciliationStatus,
  RunnableTarget,
} from './types.js';

/**
 * Logical interface for Campaign persistence (docs/CALL_CENTRE_SESSION5_CAMPAIGNS_PLAN.md
 * §21's domain-layer convention, matching Customer 360/Chat's split — see
 * src/server/customer360/customerRepository.ts). The current deployment
 * adapter is supabaseCampaignRepository.ts; a future deployment swaps
 * only that one file.
 */
export interface CampaignRepository {
  createCampaign(input: {
    name: string;
    description: string | null;
    agentId: string;
    createdBy: string | null;
    sourceMeta: Record<string, unknown> | null;
    now: string;
    rules: NewCampaignResultRuleInput[];
    agentName?: string | null;
    agentContractSnapshot?: CallAgentContract | null;
    mappings?: NewCampaignAgentInputMappingInput[];
    /** Session 12.6 — captured once at creation, immutable thereafter. Omitted/null for a campaign with no configured outcome policy (legacy behavior preserved). */
    outcomePolicySnapshot?: OutcomePolicySnapshot | null;
  }): Promise<Campaign>;

  setInputMappings(campaignId: string, mappings: NewCampaignAgentInputMappingInput[]): Promise<CampaignAgentInputMapping[]>;

  /**
   * Session 12.6 — the system-owned Universal Campaign Classification
   * master list, read live from call_center.campaign_classifications.
   * The ONLY place this vocabulary should be obtained from — never a
   * hardcoded array in a UI component or service file.
   */
  listClassifications(): Promise<CampaignClassification[]>;

  listCampaigns(page: number, pageSize: number): Promise<{ rows: CampaignWithStats[]; totalCount: number }>;

  getCampaign(id: string): Promise<CampaignDetail | null>;

  updateCampaignStatus(id: string, status: CampaignStatus, now: string): Promise<Campaign>;

  importTargets(campaignId: string, rows: NewTargetRow[], now: string): Promise<ImportTargetsResult>;

  listTargets(campaignId: string, page: number, pageSize: number): Promise<{ rows: CampaignTargetRow[]; totalCount: number }>;

  /**
   * All campaign-participation rows for ONE customer, across every
   * campaign (Session 11.5A workstream B) — for Customer Detail's
   * future Campaign Participation section. Unpaginated: a customer's
   * own campaign history is expected to stay small (the compact,
   * customer-scoped slice docs/SCREEN_REVIEW_05_CUSTOMER_360.md §12
   * describes, not a second campaign log). Callers MUST apply the same
   * authorizedAgentIds discipline used for interactions before
   * returning these rows to a client — this method itself applies no
   * authorization filtering, exactly like listAllInteractions on
   * CustomerRepository.
   */
  listCustomerTargets(customerId: string): Promise<CustomerCampaignTargetRow[]>;

  selectRunnableTargets(batchSize: number): Promise<RunnableTarget[]>;

  createExecution(targetId: string, now: string, requestPayloadSnapshot?: Record<string, unknown> | null): Promise<CampaignExecution>;

  markExecutionTriggered(executionId: string, callSid: string, now: string): Promise<void>;

  markExecutionFailed(executionId: string, errorDetail: string): Promise<void>;

  listPendingReconciliations(limit: number): Promise<PendingReconciliation[]>;

  /**
   * Session 12.5 §7 — the candidate set for the idempotent enrichment
   * path: executions already authoritatively reconciled whose stored
   * campaign_results row has no actual_outcome_code yet. Deliberately
   * disjoint from listPendingReconciliations (which only ever selects
   * reconciliation_status = 'pending') — an execution never appears in
   * both lists, and once enriched it drops out of this one too.
   */
  listReconciledMissingActualOutcome(limit: number): Promise<PendingReconciliation[]>;

  /**
   * Atomically transitions reconciliation_status and, only on a
   * 'reconciled' transition with `result` supplied, inserts the one
   * corresponding campaign_results row and updates the target's
   * effective_result_id (plan §9/§22) — enforced at the data-access
   * layer, never left to caller convention.
   */
  updateReconciliationStatus(
    executionId: string,
    status: ReconciliationStatus,
    reconciledInteractionId: string | null,
    candidate: Record<string, unknown> | null,
    now: string,
    result: DerivedCampaignResult | null,
  ): Promise<{ targetId: string; resultId: string | null }>;

  /**
   * Session 12.5 §7 — narrow, idempotent UPDATE-only enrichment of an
   * already-reconciled execution's stored result: fills in
   * actual_outcome_code/actual_outcome_name/structured_outputs ONLY
   * when that result currently has no actual_outcome_code, so calling
   * this twice (or on a result that already has real data) is always a
   * safe no-op — never a second campaign_results row, never an
   * overwrite of previously recorded data. Never creates an execution,
   * never dials, never touches the generic call_status/call_outcome/
   * campaignResultCode/isSuccess fields on the same row.
   */
  enrichActualOutcome(
    executionId: string,
    actualOutcomeCode: string | null,
    actualOutcomeName: string | null,
    structuredOutputs: Record<string, unknown> | null,
    now: string,
    /** Session 12.6 — computed the same way reconciliation computes it (deriveCampaignClassification); omitted/null when the campaign has no captured outcome policy. */
    classification?: { campaignClassificationCode: string | null; classificationContractDrift: boolean; classificationNextActionType: NextActionType | null } | null,
  ): Promise<{ resultId: string | null; enriched: boolean; reason: string | null }>;

  createFollowup(input: {
    targetId: string;
    resultId: string | null;
    type: CampaignFollowup['followUpType'];
    dueAt: string;
    nextCampaignId: string | null;
    notes: string | null;
    now: string;
  }): Promise<CampaignFollowup>;

  retryTarget(targetId: string, now: string): Promise<{ targetId: string; status: string }>;

  /**
   * Session 9.2 — the minimal lookup needed to authorize retryTarget/
   * scheduleFollowup (which take only a campaign_target id) against the
   * campaign's own agentId, without trusting a client-supplied
   * campaignId. Returns null if the target doesn't exist.
   */
  getTargetContext(targetId: string): Promise<{ targetId: string; campaignId: string; agentId: string } | null>;
}
