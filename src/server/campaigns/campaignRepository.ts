import type {
  Campaign,
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
  }): Promise<Campaign>;

  setInputMappings(campaignId: string, mappings: NewCampaignAgentInputMappingInput[]): Promise<CampaignAgentInputMapping[]>;

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
