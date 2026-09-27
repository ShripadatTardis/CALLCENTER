import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ActivityRepository, ActivityStatus, ActivityType, CustomerActivity, NewCustomerActivityInput } from './activityRepository.js';

/**
 * The current deployment's adapter for ActivityRepository (Session
 * 11.5A). Same access model as every other customer360/campaigns
 * adapter: `call_center` is not PostgREST-exposed, every operation goes
 * through a `public.call_center_activity_*` SECURITY DEFINER function,
 * granted to service_role only. Reuses the same
 * CUSTOMER360_SUPABASE_URL/CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY env
 * vars — same project, same call_center schema, no new secret.
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

interface ActivityRow {
  id: string;
  customer_id: string;
  activity_type: ActivityType;
  title: string | null;
  body: string;
  status: ActivityStatus;
  priority: string | null;
  scheduled_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  assigned_user_id: string | null;
  assigned_team_id: string | null;
  campaign_id: string | null;
  campaign_target_id: string | null;
  interaction_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  effective_from: string | null;
  effective_until: string | null;
}

function mapActivity(row: ActivityRow): CustomerActivity {
  return {
    id: row.id,
    customerId: row.customer_id,
    activityType: row.activity_type,
    title: row.title,
    body: row.body,
    status: row.status,
    priority: row.priority,
    scheduledAt: row.scheduled_at,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    assignedUserId: row.assigned_user_id,
    assignedTeamId: row.assigned_team_id,
    campaignId: row.campaign_id,
    campaignTargetId: row.campaign_target_id,
    interactionId: row.interaction_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
  };
}

export const supabaseActivityRepository: ActivityRepository = {
  async createActivity(input: NewCustomerActivityInput, now: string): Promise<CustomerActivity> {
    const row = await rpc<ActivityRow>('call_center_activity_create', {
      p_customer_id: input.customerId,
      p_activity_type: input.activityType,
      p_title: input.title,
      p_body: input.body,
      p_priority: input.priority ?? null,
      p_scheduled_at: input.scheduledAt ?? null,
      p_due_at: input.dueAt ?? null,
      p_assigned_user_id: input.assignedUserId ?? null,
      p_assigned_team_id: input.assignedTeamId ?? null,
      p_campaign_id: input.campaignId ?? null,
      p_campaign_target_id: input.campaignTargetId ?? null,
      p_interaction_id: input.interactionId ?? null,
      p_created_by: input.createdBy,
      p_effective_from: input.effectiveFrom ?? null,
      p_effective_until: input.effectiveUntil ?? null,
      p_now: now,
    });
    return mapActivity(row);
  },

  async listActivitiesForCustomer(customerId, opts) {
    const rows = await rpc<ActivityRow[]>('call_center_activity_list_for_customer', {
      p_customer_id: customerId,
      p_active_instructions_only: opts?.activeInstructionsOnly ?? false,
    });
    return (rows ?? []).map(mapActivity);
  },

  async updateActivityStatus(activityId, status, updatedBy, now) {
    const row = await rpc<ActivityRow>('call_center_activity_update_status', {
      p_activity_id: activityId,
      p_status: status,
      p_updated_by: updatedBy,
      p_now: now,
    });
    return mapActivity(row);
  },
};
