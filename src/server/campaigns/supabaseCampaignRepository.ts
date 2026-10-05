import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CampaignRepository } from './campaignRepository.js';
import type {
  Campaign,
  CampaignAgentInputMapping,
  CampaignAuditEvent,
  CampaignConfigurationVersion,
  CampaignDetail,
  CampaignExecution,
  CampaignExecutionStatus,
  CampaignFollowup,
  CampaignResultRule,
  CampaignSkipReason,
  CampaignStats,
  CampaignStatus,
  CampaignTargetMutationResult,
  CampaignTargetRow,
  CampaignTargetStatus,
  CampaignWithStats,
  CustomerCampaignTargetRow,
  InputMappingSourceType,
  NextActionType,
  OutcomePolicySnapshot,
  ReconciliationStatus,
  RunnableTarget,
} from './types.js';
import { supabaseCustomerRepository } from '../customer360/supabaseCustomerRepository.js';
import { resolveCustomerIdentity } from '../customer360/identityResolver.js';

/**
 * The current deployment's adapter for CampaignRepository (plan §21/§22).
 * `call_center` is NOT exposed via PostgREST, so this file never calls
 * `.from('call_center....')` directly — every operation goes through a
 * `public.call_center_campaign_*` SECURITY DEFINER function (see
 * supabase/migrations/20260926090000_campaigns_foundation.sql), each
 * individually granted to `service_role` only. This is the ONLY file in
 * src/server/campaigns allowed to import `@supabase/supabase-js`.
 *
 * Reuses the same CUSTOMER360_SUPABASE_URL/CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY
 * env vars Customer 360/Chat already use — no new secret, same project,
 * same call_center schema.
 */

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.CUSTOMER360_SUPABASE_URL;
  const serviceRoleKey = process.env.CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('CUSTOMER360_SUPABASE_URL / CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY are not configured on the server');
  }
  client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return client;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getClient().rpc(fn, args);
  if (error) throw new Error(`Supabase RPC ${fn} error: ${error.message}`);
  return data as T;
}

// --- Row <-> domain mapping (RPC functions return snake_case jsonb rows) ---

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  agent_id: string;
  agent_name: string | null;
  agent_contract_snapshot: Campaign['agentContractSnapshot'];
  outcome_policy_snapshot: Campaign['outcomePolicySnapshot'];
  status: CampaignStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  scheduled_start_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  source_meta: Record<string, unknown> | null;
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    agentId: row.agent_id,
    agentName: row.agent_name ?? null,
    agentContractSnapshot: row.agent_contract_snapshot ?? null,
    outcomePolicySnapshot: row.outcome_policy_snapshot ?? null,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scheduledStartAt: row.scheduled_start_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    sourceMeta: row.source_meta,
  };
}

interface StatsRow {
  target_count: number;
  triggered_count: number;
  classified_count: number;
  success_count: number;
  policy_classified_count: number;
  policy_successful_count: number;
  classification_counts: Record<string, number>;
}

function mapStats(row: StatsRow | undefined): CampaignStats {
  return {
    targetCount: row?.target_count ?? 0,
    triggeredCount: row?.triggered_count ?? 0,
    classifiedCount: row?.classified_count ?? 0,
    successCount: row?.success_count ?? 0,
    policyClassifiedCount: row?.policy_classified_count ?? 0,
    policySuccessfulCount: row?.policy_successful_count ?? 0,
    classificationCounts: row?.classification_counts ?? {},
  };
}

interface CampaignListRow extends CampaignRow, StatsRow {}

interface RuleRow {
  id: string;
  campaign_id: string;
  priority: number;
  match_field: string;
  match_value: string;
  result_code: string;
  result_label: string;
  is_success: boolean | null;
  next_action_type: CampaignResultRule['nextActionType'];
  next_action_delay_days: number | null;
  active: boolean;
}

function mapRule(row: RuleRow): CampaignResultRule {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    priority: row.priority,
    matchField: row.match_field,
    matchValue: row.match_value,
    resultCode: row.result_code,
    resultLabel: row.result_label,
    isSuccess: row.is_success,
    nextActionType: row.next_action_type,
    nextActionDelayDays: row.next_action_delay_days,
    active: row.active,
  };
}

interface MappingRow {
  id: string;
  campaign_id: string;
  agent_input_field_code: string;
  source_type: InputMappingSourceType;
  source_field: string;
  required: boolean;
  data_type: string | null;
  configuration_version_id?: string | null;
}

function mapMapping(row: MappingRow): CampaignAgentInputMapping {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    agentInputFieldCode: row.agent_input_field_code,
    sourceType: row.source_type,
    sourceField: row.source_field,
    required: row.required,
    dataType: row.data_type,
    configurationVersionId: row.configuration_version_id ?? null,
  };
}

interface TargetRow {
  id: string;
  campaign_id: string;
  customer_id: string;
  contact_point_id: string;
  status: CampaignTargetStatus;
  source_attributes: Record<string, unknown>;
  attempt_count: number;
  last_action_at: string | null;
  next_action_at: string | null;
  effective_result_id: string | null;
  created_at: string;
  updated_at: string;
  contact_raw_value: string;
  customer_display_name: string | null;
  campaign_result_code: string | null;
  campaign_result_label: string | null;
  result_is_success: boolean | null;
  result_next_action: string | null;
  result_actual_outcome_code: string | null;
  result_actual_outcome_name: string | null;
  result_structured_outputs: Record<string, unknown> | null;
  result_classification_code: string | null;
  result_classification_contract_drift: boolean | null;
  result_classification_next_action_type: NextActionType | null;
  latest_execution_status: CampaignExecutionStatus | null;
  latest_reconciliation_status: ReconciliationStatus | null;
  latest_reconciled_interaction_id: string | null;
  latest_configuration_version_id?: string | null;
  skip_reason_code?: string | null;
  skip_comment?: string | null;
  hold_reason?: string | null;
  hold_note?: string | null;
  original_source_attributes?: Record<string, unknown> | null;
  import_batch_id?: string | null;
}

function mapTargetRow(row: TargetRow): CampaignTargetRow {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    customerId: row.customer_id,
    contactPointId: row.contact_point_id,
    status: row.status,
    sourceAttributes: row.source_attributes ?? {},
    attemptCount: row.attempt_count,
    lastActionAt: row.last_action_at,
    nextActionAt: row.next_action_at,
    effectiveResultId: row.effective_result_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactRawValue: row.contact_raw_value,
    customerDisplayName: row.customer_display_name,
    campaignResultCode: row.campaign_result_code,
    campaignResultLabel: row.campaign_result_label,
    resultIsSuccess: row.result_is_success,
    resultNextAction: row.result_next_action,
    // Session 12.5 — undefined (not an explicit null) on the
    // Customer360-scoped listCustomerTargets row shape, since that SQL
    // function deliberately does not select these columns (item 10:
    // no duplication of the Campaign-specific result model into
    // Customer360); `?? null` normalizes both cases to the same
    // honest "not available here" value.
    resultActualOutcomeCode: row.result_actual_outcome_code ?? null,
    resultActualOutcomeName: row.result_actual_outcome_name ?? null,
    resultStructuredOutputs: row.result_structured_outputs ?? null,
    resultClassificationCode: row.result_classification_code ?? null,
    resultClassificationContractDrift: row.result_classification_contract_drift ?? false,
    resultClassificationNextActionType: row.result_classification_next_action_type ?? null,
    latestExecutionStatus: row.latest_execution_status,
    latestReconciliationStatus: row.latest_reconciliation_status,
    latestReconciledInteractionId: row.latest_reconciled_interaction_id,
    latestConfigurationVersionId: row.latest_configuration_version_id ?? null,
    skipReasonCode: row.skip_reason_code ?? null,
    skipComment: row.skip_comment ?? null,
    holdReason: row.hold_reason ?? null,
    holdNote: row.hold_note ?? null,
    originalSourceAttributes: row.original_source_attributes ?? null,
    importBatchId: row.import_batch_id ?? null,
  };
}

interface CustomerTargetRow extends TargetRow {
  campaign_name: string;
  campaign_agent_id: string;
  campaign_agent_name: string | null;
}

function mapCustomerTargetRow(row: CustomerTargetRow): CustomerCampaignTargetRow {
  return {
    ...mapTargetRow(row),
    campaignName: row.campaign_name,
    campaignAgentId: row.campaign_agent_id,
    campaignAgentName: row.campaign_agent_name,
  };
}

interface RunnableTargetRow {
  id: string;
  campaign_id: string;
  customer_id: string;
  contact_point_id: string;
  status: CampaignTargetStatus;
  source_attributes: Record<string, unknown>;
  attempt_count: number;
  last_action_at: string | null;
  next_action_at: string | null;
  effective_result_id: string | null;
  created_at: string;
  updated_at: string;
  contact_raw_value: string;
  source_customer_ref: string | null;
  campaign_agent_id: string;
}

function mapRunnableTarget(row: RunnableTargetRow): RunnableTarget {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    customerId: row.customer_id,
    contactPointId: row.contact_point_id,
    status: row.status,
    sourceAttributes: row.source_attributes ?? {},
    attemptCount: row.attempt_count,
    lastActionAt: row.last_action_at,
    nextActionAt: row.next_action_at,
    effectiveResultId: row.effective_result_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactRawValue: row.contact_raw_value,
    sourceCustomerRef: row.source_customer_ref,
    campaignAgentId: row.campaign_agent_id,
  };
}

interface ExecutionRow {
  id: string;
  campaign_target_id: string;
  sequence: number;
  status: CampaignExecutionStatus;
  call_sid: string | null;
  reconciliation_status: ReconciliationStatus;
  reconciled_interaction_id: string | null;
  reconciliation_candidate: Record<string, unknown> | null;
  reconciled_at: string | null;
  triggered_at: string | null;
  error_detail: string | null;
  created_at: string;
  request_payload_snapshot: Record<string, unknown> | null;
  configuration_version_id?: string | null;
}

function mapExecution(row: ExecutionRow): CampaignExecution {
  return {
    id: row.id,
    campaignTargetId: row.campaign_target_id,
    sequence: row.sequence,
    status: row.status,
    callSid: row.call_sid,
    reconciliationStatus: row.reconciliation_status,
    reconciledInteractionId: row.reconciled_interaction_id,
    reconciliationCandidate: row.reconciliation_candidate,
    reconciledAt: row.reconciled_at,
    triggeredAt: row.triggered_at,
    errorDetail: row.error_detail,
    createdAt: row.created_at,
    requestPayloadSnapshot: row.request_payload_snapshot ?? null,
    configurationVersionId: row.configuration_version_id ?? null,
  };
}

interface PendingReconciliationRow extends ExecutionRow {
  customer_id: string;
  campaign_id: string;
  contact_raw_value: string;
}

function mapFollowup(row: {
  id: string;
  campaign_target_id: string;
  campaign_result_id: string | null;
  follow_up_type: CampaignFollowup['followUpType'];
  due_at: string;
  status: CampaignFollowup['status'];
  next_campaign_id: string | null;
  notes: string | null;
  created_at: string;
}): CampaignFollowup {
  return {
    id: row.id,
    campaignTargetId: row.campaign_target_id,
    campaignResultId: row.campaign_result_id,
    followUpType: row.follow_up_type,
    dueAt: row.due_at,
    status: row.status,
    nextCampaignId: row.next_campaign_id,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

interface ConfigurationVersionRow {
  id: string;
  campaign_id: string;
  version_number: number;
  status: 'active' | 'superseded';
  agent_id: string;
  agent_name: string | null;
  agent_contract_snapshot: CampaignConfigurationVersion['agentContractSnapshot'];
  outcome_policy_snapshot: OutcomePolicySnapshot | null;
  created_at: string;
  created_by: string | null;
  change_reason: string | null;
  previous_version_id: string | null;
}

function mapConfigurationVersion(row: ConfigurationVersionRow): CampaignConfigurationVersion {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    versionNumber: row.version_number,
    status: row.status,
    agentId: row.agent_id,
    agentName: row.agent_name,
    agentContractSnapshot: row.agent_contract_snapshot ?? null,
    outcomePolicySnapshot: row.outcome_policy_snapshot ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by,
    changeReason: row.change_reason,
    previousVersionId: row.previous_version_id,
  };
}

interface AuditEventRow {
  id: string;
  campaign_id: string;
  event_type: string;
  actor: string | null;
  occurred_at: string;
  campaign_target_id: string | null;
  campaign_execution_id: string | null;
  configuration_version_id: string | null;
  reason: string | null;
  comment: string | null;
  detail: Record<string, unknown> | null;
}

function mapAuditEvent(row: AuditEventRow): CampaignAuditEvent {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    eventType: row.event_type,
    actor: row.actor,
    occurredAt: row.occurred_at,
    campaignTargetId: row.campaign_target_id,
    campaignExecutionId: row.campaign_execution_id,
    configurationVersionId: row.configuration_version_id,
    reason: row.reason,
    comment: row.comment,
    detail: row.detail,
  };
}

interface SkipReasonRow {
  code: string;
  label: string;
  description: string | null;
  requires_comment: boolean;
  sort_order: number;
  active: boolean;
}

function mapSkipReason(row: SkipReasonRow): CampaignSkipReason {
  return {
    code: row.code,
    label: row.label,
    description: row.description,
    requiresComment: row.requires_comment,
    sortOrder: row.sort_order,
    active: row.active,
  };
}

interface TargetMutationRow {
  id: string;
  campaign_id: string;
  customer_id: string;
  contact_point_id: string;
  status: CampaignTargetStatus;
  source_attributes: Record<string, unknown>;
  attempt_count: number;
  last_action_at: string | null;
  next_action_at: string | null;
  effective_result_id: string | null;
  created_at: string;
  updated_at: string;
  skip_reason_code: string | null;
  skip_comment: string | null;
  hold_reason: string | null;
  hold_note: string | null;
  original_source_attributes: Record<string, unknown> | null;
  import_batch_id: string | null;
}

function mapTargetMutationResult(row: TargetMutationRow): CampaignTargetMutationResult {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    customerId: row.customer_id,
    contactPointId: row.contact_point_id,
    status: row.status,
    sourceAttributes: row.source_attributes ?? {},
    attemptCount: row.attempt_count,
    lastActionAt: row.last_action_at,
    nextActionAt: row.next_action_at,
    effectiveResultId: row.effective_result_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    skipReasonCode: row.skip_reason_code,
    skipComment: row.skip_comment,
    holdReason: row.hold_reason,
    holdNote: row.hold_note,
    originalSourceAttributes: row.original_source_attributes,
    importBatchId: row.import_batch_id,
  };
}

export const supabaseCampaignRepository: CampaignRepository = {
  async createCampaign({ name, description, agentId, createdBy, sourceMeta, now, rules, agentName, agentContractSnapshot, mappings, outcomePolicySnapshot }) {
    const row = await rpc<CampaignRow>('call_center_campaign_create', {
      p_name: name,
      p_description: description,
      p_agent_id: agentId,
      p_created_by: createdBy,
      p_source_meta: sourceMeta,
      p_now: now,
      p_rules: rules.map((r) => ({
        priority: r.priority,
        matchField: r.matchField,
        matchValue: r.matchValue,
        resultCode: r.resultCode,
        resultLabel: r.resultLabel,
        isSuccess: r.isSuccess,
        nextActionType: r.nextActionType,
        nextActionDelayDays: r.nextActionDelayDays,
        active: r.active,
      })),
      p_agent_name: agentName ?? null,
      p_agent_contract_snapshot: agentContractSnapshot ?? null,
      p_mappings: (mappings ?? []).map((m) => ({
        agentInputFieldCode: m.agentInputFieldCode,
        sourceType: m.sourceType,
        sourceField: m.sourceField,
        required: m.required,
        dataType: m.dataType,
      })),
      p_outcome_policy_snapshot: outcomePolicySnapshot ?? null,
    });
    return mapCampaign(row);
  },

  async listClassifications() {
    const rows = await rpc<Array<{
      code: string;
      label: string;
      description: string | null;
      is_success: boolean;
      is_fallback_unresolved: boolean;
      sort_order: number;
      active: boolean;
    }>>('call_center_campaign_classifications_list', {});
    return (rows ?? []).map((r) => ({
      code: r.code,
      label: r.label,
      description: r.description,
      isSuccess: r.is_success,
      isFallbackUnresolved: r.is_fallback_unresolved,
      sortOrder: r.sort_order,
      active: r.active,
    }));
  },

  async setInputMappings(campaignId, mappings) {
    const rows = await rpc<MappingRow[]>('call_center_campaign_set_input_mappings', {
      p_campaign_id: campaignId,
      p_mappings: mappings.map((m) => ({
        agentInputFieldCode: m.agentInputFieldCode,
        sourceType: m.sourceType,
        sourceField: m.sourceField,
        required: m.required,
        dataType: m.dataType,
      })),
    });
    return (rows ?? []).map(mapMapping);
  },

  async listCampaigns(page, pageSize) {
    const result = await rpc<{ rows: CampaignListRow[]; totalCount: number }>('call_center_campaign_list', {
      p_page: page,
      p_page_size: pageSize,
    });
    const rows: CampaignWithStats[] = (result.rows ?? []).map((row) => ({
      ...mapCampaign(row),
      stats: mapStats(row),
    }));
    return { rows, totalCount: result.totalCount ?? 0 };
  },

  async getCampaign(id) {
    const result = await rpc<(CampaignRow & { rules: RuleRow[]; mappings: MappingRow[]; stats: StatsRow }) | null>(
      'call_center_campaign_get',
      { p_id: id },
    );
    if (!result) return null;
    const detail: CampaignDetail = {
      ...mapCampaign(result),
      rules: (result.rules ?? []).map(mapRule),
      mappings: (result.mappings ?? []).map(mapMapping),
      stats: mapStats(result.stats),
    };
    return detail;
  },

  async updateCampaignStatus(id, status, now) {
    const row = await rpc<CampaignRow>('call_center_campaign_update_status', { p_id: id, p_status: status, p_now: now });
    return mapCampaign(row);
  },

  /**
   * Session 11.5A correction (docs/SCREEN_REVIEW_05_CUSTOMER_360.md §11,
   * docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md §C): every row now
   * resolves through the SAME identityResolver.ts precedence Voice/Chat
   * already use (CIF -> phone -> create) instead of the old
   * call_center_campaign_import_targets bulk RPC's phone-only SQL-side
   * match. That RPC is left in the schema, unused by this path.
   */
  async importTargets(campaignId, rows, now) {
    let customersCreated = 0;
    let customersMatched = 0;
    let rowsSkipped = 0;

    for (const row of rows) {
      if (!row.phone || !row.phone.trim()) {
        rowsSkipped++;
        continue;
      }

      const resolved = await resolveCustomerIdentity(
        supabaseCustomerRepository,
        { externalCustomerId: row.customerReference || null, phoneNumber: row.phone, preferredCustomerId: null },
        now,
      );

      // campaign_targets.contact_point_id is a not-null FK — a row that
      // resolves to a customer with no phone contact point (only
      // reachable if phone normalization fails on garbage input, since
      // every CSV row here always carries a phone) cannot become a
      // target. Honest skip, never a fabricated/blank contact point.
      if (!resolved || !resolved.contactPointId) {
        rowsSkipped++;
        continue;
      }

      await rpc('call_center_campaign_insert_resolved_target', {
        p_campaign_id: campaignId,
        p_customer_id: resolved.customerId,
        p_contact_point_id: resolved.contactPointId,
        p_source_attributes: row.sourceAttributes,
        p_now: now,
      });

      if (resolved.created) customersCreated++;
      else customersMatched++;
    }

    return { customersCreated, customersMatched, rowsSkipped };
  },

  async listTargets(campaignId, page, pageSize) {
    const result = await rpc<{ rows: TargetRow[]; totalCount: number }>('call_center_campaign_list_targets', {
      p_campaign_id: campaignId,
      p_page: page,
      p_page_size: pageSize,
    });
    return { rows: (result.rows ?? []).map(mapTargetRow), totalCount: result.totalCount ?? 0 };
  },

  async listCustomerTargets(customerId) {
    const rows = await rpc<CustomerTargetRow[]>('call_center_campaign_list_customer_targets', {
      p_customer_id: customerId,
    });
    return (rows ?? []).map(mapCustomerTargetRow);
  },

  async selectRunnableTargets(batchSize) {
    const rows = await rpc<RunnableTargetRow[]>('call_center_campaign_select_runnable_targets', { p_batch_size: batchSize });
    return (rows ?? []).map(mapRunnableTarget);
  },

  async createExecution(targetId, now, requestPayloadSnapshot) {
    const row = await rpc<ExecutionRow>('call_center_campaign_create_execution', {
      p_target_id: targetId,
      p_now: now,
      p_request_payload_snapshot: requestPayloadSnapshot ?? null,
    });
    return mapExecution(row);
  },

  async markExecutionTriggered(executionId, callSid, now) {
    await rpc<null>('call_center_campaign_mark_execution_triggered', { p_execution_id: executionId, p_call_sid: callSid, p_now: now });
  },

  async markExecutionFailed(executionId, errorDetail) {
    await rpc<null>('call_center_campaign_mark_execution_failed', { p_execution_id: executionId, p_error_detail: errorDetail });
  },

  async listPendingReconciliations(limit) {
    const rows = await rpc<PendingReconciliationRow[]>('call_center_campaign_list_pending_reconciliations', { p_limit: limit });
    return (rows ?? []).map((row) => ({
      ...mapExecution(row),
      customerId: row.customer_id,
      campaignId: row.campaign_id,
      contactRawValue: row.contact_raw_value,
    }));
  },

  // Session 12.5 §7 — same row shape as listPendingReconciliations
  // (both join executions -> targets -> contact points identically),
  // just a disjoint WHERE clause server-side; reuses the same
  // PendingReconciliationRow/mapExecution mapping rather than a
  // parallel shape.
  async listReconciledMissingActualOutcome(limit) {
    const rows = await rpc<PendingReconciliationRow[]>('call_center_campaign_list_reconciled_missing_actual_outcome', { p_limit: limit });
    return (rows ?? []).map((row) => ({
      ...mapExecution(row),
      customerId: row.customer_id,
      campaignId: row.campaign_id,
      contactRawValue: row.contact_raw_value,
    }));
  },

  async enrichActualOutcome(executionId, actualOutcomeCode, actualOutcomeName, structuredOutputs, now, classification) {
    const outcome = await rpc<{ resultId: string | null; enriched: boolean; reason: string | null }>(
      'call_center_campaign_enrich_actual_outcome',
      {
        p_execution_id: executionId,
        p_actual_outcome_code: actualOutcomeCode,
        p_actual_outcome_name: actualOutcomeName,
        p_structured_outputs: structuredOutputs,
        p_now: now,
        p_campaign_classification_code: classification?.campaignClassificationCode ?? null,
        p_classification_contract_drift: classification?.classificationContractDrift ?? false,
        p_classification_next_action_type: classification?.classificationNextActionType ?? null,
      },
    );
    return outcome;
  },

  async updateReconciliationStatus(executionId, status, reconciledInteractionId, candidate, now, result) {
    const payload = result
      ? {
          callStatus: result.callStatus,
          callOutcome: result.callOutcome,
          intent: result.intent,
          resultCode: result.resultCode,
          resultLabel: result.resultLabel,
          isSuccess: result.isSuccess,
          resultDetail: result.resultDetail,
          resultSource: result.resultSource,
          nextAction: result.nextAction,
          nextActionType: result.nextActionType,
          agentId: result.agentId,
          agentName: result.agentName,
          structuredOutputs: result.structuredOutputs,
          actualOutcomeCode: result.actualOutcomeCode,
          actualOutcomeName: result.actualOutcomeName,
          campaignClassificationCode: result.campaignClassificationCode,
          classificationContractDrift: result.classificationContractDrift,
          classificationNextActionType: result.classificationNextActionType,
        }
      : null;
    const outcome = await rpc<{ targetId: string; resultId: string | null }>('call_center_campaign_update_reconciliation_status', {
      p_execution_id: executionId,
      p_status: status,
      p_reconciled_interaction_id: reconciledInteractionId,
      p_candidate: candidate,
      p_now: now,
      p_result: payload,
    });
    return outcome;
  },

  async createFollowup({ targetId, resultId, type, dueAt, nextCampaignId, notes, now }) {
    const row = await rpc<Parameters<typeof mapFollowup>[0]>('call_center_campaign_create_followup', {
      p_target_id: targetId,
      p_result_id: resultId,
      p_type: type,
      p_due_at: dueAt,
      p_next_campaign_id: nextCampaignId,
      p_notes: notes,
      p_now: now,
    });
    return mapFollowup(row);
  },

  async retryTarget(targetId, now, actor, reason) {
    return rpc('call_center_campaign_retry_target', {
      p_target_id: targetId,
      p_now: now,
      p_actor: actor ?? null,
      p_reason: reason ?? null,
    });
  },

  async getTargetContext(targetId) {
    return rpc<{ targetId: string; campaignId: string; agentId: string } | null>(
      'call_center_campaign_get_target_context',
      { p_target_id: targetId },
    );
  },

  async listSkipReasons() {
    const rows = await rpc<SkipReasonRow[]>('call_center_campaign_skip_reasons_list', {});
    return (rows ?? []).map(mapSkipReason);
  },

  async listConfigurationVersions(campaignId) {
    const rows = await rpc<ConfigurationVersionRow[]>('call_center_campaign_list_configuration_versions', {
      p_campaign_id: campaignId,
    });
    return (rows ?? []).map(mapConfigurationVersion);
  },

  async getConfigurationVersion(versionId) {
    const row = await rpc<ConfigurationVersionRow | null>('call_center_campaign_get_configuration_version', {
      p_version_id: versionId,
    });
    return row ? mapConfigurationVersion(row) : null;
  },

  async listAuditEvents(campaignId, limit = 200) {
    const rows = await rpc<AuditEventRow[]>('call_center_campaign_list_audit_events', {
      p_campaign_id: campaignId,
      p_limit: limit,
    });
    return (rows ?? []).map(mapAuditEvent);
  },

  async getExecutionByInteractionId(interactionId) {
    const result = await rpc<{ execution: ExecutionRow; agentId: string } | null>(
      'call_center_campaign_get_execution_by_interaction',
      { p_interaction_id: interactionId },
    );
    return result ? { execution: mapExecution(result.execution), agentId: result.agentId } : null;
  },

  async createConfigurationVersion({
    campaignId,
    expectedCurrentVersionId,
    now,
    actor,
    reason,
    agentId,
    agentName,
    agentContractSnapshot,
    outcomePolicySnapshot,
    mappings,
    eventType,
  }) {
    const result = await rpc<{ versionId: string; versionNumber: number }>(
      'call_center_campaign_create_configuration_version',
      {
        p_campaign_id: campaignId,
        p_expected_current_version_id: expectedCurrentVersionId,
        p_now: now,
        p_actor: actor,
        p_reason: reason,
        p_agent_id: agentId ?? null,
        p_agent_name: agentName ?? null,
        p_agent_contract_snapshot: agentContractSnapshot ?? null,
        p_outcome_policy_snapshot: outcomePolicySnapshot ?? null,
        p_mappings: mappings
          ? mappings.map((m) => ({
              agentInputFieldCode: m.agentInputFieldCode,
              sourceType: m.sourceType,
              sourceField: m.sourceField,
              required: m.required,
              dataType: m.dataType,
            }))
          : null,
        p_event_type: eventType ?? 'outcome_mapping_changed',
      },
    );
    return result;
  },

  async updateDraftConfiguration({ campaignId, now, actor, agentId, agentName, agentContractSnapshot, outcomePolicySnapshot, mappings }) {
    const row = await rpc<CampaignRow>('call_center_campaign_update_draft_configuration', {
      p_campaign_id: campaignId,
      p_now: now,
      p_actor: actor,
      p_agent_id: agentId ?? null,
      p_agent_name: agentName ?? null,
      p_agent_contract_snapshot: agentContractSnapshot ?? null,
      p_outcome_policy_snapshot: outcomePolicySnapshot ?? null,
      p_mappings: mappings
        ? mappings.map((m) => ({
            agentInputFieldCode: m.agentInputFieldCode,
            sourceType: m.sourceType,
            sourceField: m.sourceField,
            required: m.required,
            dataType: m.dataType,
          }))
        : null,
    });
    return mapCampaign(row);
  },

  async setStatusAudited(id, status, now, actor, reason) {
    const row = await rpc<CampaignRow>('call_center_campaign_set_status_audited', {
      p_id: id,
      p_status: status,
      p_now: now,
      p_actor: actor,
      p_reason: reason,
    });
    return mapCampaign(row);
  },

  async skipTarget(targetId, reasonCode, comment, now, actor) {
    const row = await rpc<TargetMutationRow>('call_center_campaign_skip_target', {
      p_target_id: targetId,
      p_reason_code: reasonCode,
      p_comment: comment,
      p_now: now,
      p_actor: actor,
    });
    return mapTargetMutationResult(row);
  },

  async holdTarget(targetId, reason, note, now, actor) {
    const row = await rpc<TargetMutationRow>('call_center_campaign_hold_target', {
      p_target_id: targetId,
      p_reason: reason,
      p_note: note,
      p_now: now,
      p_actor: actor,
    });
    return mapTargetMutationResult(row);
  },

  async releaseHold(targetId, now, actor) {
    const row = await rpc<TargetMutationRow>('call_center_campaign_release_hold', {
      p_target_id: targetId,
      p_now: now,
      p_actor: actor,
    });
    return mapTargetMutationResult(row);
  },

  async amendTarget(targetId, sourceAttributes, now, actor, reason) {
    const row = await rpc<TargetMutationRow>('call_center_campaign_amend_target', {
      p_target_id: targetId,
      p_source_attributes: sourceAttributes,
      p_now: now,
      p_actor: actor,
      p_reason: reason,
    });
    return mapTargetMutationResult(row);
  },

  /**
   * §12 — reuses the exact same identityResolver.ts-based per-row path
   * as importTargets above (never the old phone-only SQL bulk path),
   * then stamps the resulting target ids with one batch id via
   * call_center_campaign_stamp_import_batch (see migration
   * 20261013000000_campaign_configuration_version_lookup_and_batch_stamp.sql)
   * — precise id-based stamping, not a timestamp heuristic.
   */
  async addTargets(campaignId, rows, now, actor) {
    let customersCreated = 0;
    let customersMatched = 0;
    let rowsSkipped = 0;
    const createdTargetIds: string[] = [];

    for (const row of rows) {
      if (!row.phone || !row.phone.trim()) {
        rowsSkipped++;
        continue;
      }

      const resolved = await resolveCustomerIdentity(
        supabaseCustomerRepository,
        { externalCustomerId: row.customerReference || null, phoneNumber: row.phone, preferredCustomerId: null },
        now,
      );

      if (!resolved || !resolved.contactPointId) {
        rowsSkipped++;
        continue;
      }

      const target = await rpc<{ id: string }>('call_center_campaign_insert_resolved_target', {
        p_campaign_id: campaignId,
        p_customer_id: resolved.customerId,
        p_contact_point_id: resolved.contactPointId,
        p_source_attributes: row.sourceAttributes,
        p_now: now,
      });
      createdTargetIds.push(target.id);

      if (resolved.created) customersCreated++;
      else customersMatched++;
    }

    const batchId = crypto.randomUUID();
    if (createdTargetIds.length > 0) {
      await rpc('call_center_campaign_stamp_import_batch', {
        p_campaign_id: campaignId,
        p_target_ids: createdTargetIds,
        p_batch_id: batchId,
        p_now: now,
        p_actor: actor,
      });
    }

    return { customersCreated, customersMatched, rowsSkipped, batchId };
  },
};
