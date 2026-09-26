import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CampaignRepository } from './campaignRepository.js';
import type {
  Campaign,
  CampaignAgentInputMapping,
  CampaignDetail,
  CampaignExecution,
  CampaignExecutionStatus,
  CampaignFollowup,
  CampaignResultRule,
  CampaignStats,
  CampaignStatus,
  CampaignTargetRow,
  CampaignTargetStatus,
  CampaignWithStats,
  InputMappingSourceType,
  ReconciliationStatus,
  RunnableTarget,
} from './types.js';

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
}

function mapStats(row: StatsRow | undefined): CampaignStats {
  return {
    targetCount: row?.target_count ?? 0,
    triggeredCount: row?.triggered_count ?? 0,
    classifiedCount: row?.classified_count ?? 0,
    successCount: row?.success_count ?? 0,
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
  latest_execution_status: CampaignExecutionStatus | null;
  latest_reconciliation_status: ReconciliationStatus | null;
  latest_reconciled_interaction_id: string | null;
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
    latestExecutionStatus: row.latest_execution_status,
    latestReconciliationStatus: row.latest_reconciliation_status,
    latestReconciledInteractionId: row.latest_reconciled_interaction_id,
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

export const supabaseCampaignRepository: CampaignRepository = {
  async createCampaign({ name, description, agentId, createdBy, sourceMeta, now, rules, agentName, agentContractSnapshot, mappings }) {
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
    });
    return mapCampaign(row);
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

  async importTargets(campaignId, rows, now) {
    return rpc('call_center_campaign_import_targets', {
      p_campaign_id: campaignId,
      p_rows: rows.map((r) => ({ name: r.name, phone: r.phone, sourceAttributes: r.sourceAttributes })),
      p_now: now,
    });
  },

  async listTargets(campaignId, page, pageSize) {
    const result = await rpc<{ rows: TargetRow[]; totalCount: number }>('call_center_campaign_list_targets', {
      p_campaign_id: campaignId,
      p_page: page,
      p_page_size: pageSize,
    });
    return { rows: (result.rows ?? []).map(mapTargetRow), totalCount: result.totalCount ?? 0 };
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

  async retryTarget(targetId, now) {
    return rpc('call_center_campaign_retry_target', { p_target_id: targetId, p_now: now });
  },
};
