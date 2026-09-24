import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CustomerRepository } from './customerRepository.js';
import type {
  Category,
  Customer,
  CustomerInteractionRecord,
  ContactPoint,
  ContactPointType,
  NewInteractionInput,
  RoleAccess,
} from './types.js';

/**
 * The current deployment's adapter for CustomerRepository, per
 * docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §0.3/§14 — amended per
 * explicit instruction to isolate Call Centre persistence in the
 * existing AuditAI Supabase project (dtbaczafdzgctkbqviod), under a
 * dedicated `call_center` Postgres schema.
 *
 * `call_center` is NOT exposed via PostgREST's schema allow-list, so
 * this file never calls `.from('call_center....')` directly — every
 * operation goes through a `public.call_center_*` SECURITY DEFINER
 * function (see supabase/migrations/20260924150000_customer360_foundation.sql),
 * each individually granted to `service_role` only. This is the ONLY
 * file in src/server/customer360 allowed to import
 * `@supabase/supabase-js` — swapping persistence technology later means
 * writing a new file implementing CustomerRepository, with no change to
 * aggregationService.ts or authorizationService.ts.
 *
 * Uses the service-role key exclusively — never the anon key, never
 * imported from browser code. CUSTOMER360_SUPABASE_URL /
 * CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY are server-only env vars (see
 * .env.example), deliberately distinct from this app's other
 * VITE_SUPABASE_* vars, which point at a different Supabase project
 * used for WhatsApp/chat.
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

interface CustomerRow {
  id: string;
  display_name: string | null;
  source_customer_ref: string | null;
  first_seen: string;
  last_seen: string;
  total_interactions: number;
  inbound_count: number;
  outbound_count: number;
  latest_intent: string | null;
  latest_outcome: string | null;
  latest_sentiment_label: string | null;
  latest_sentiment_score: number | null;
  escalation_count: number;
  channels: string[];
  latest_agent_id: string | null;
  latest_agent_display_name: string | null;
  auth_summary: { everAuthenticated: boolean; lastAuthenticatedAt: string | null } | null;
  aggregation_version: number;
  aggregated_at: string;
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    displayName: row.display_name,
    sourceCustomerRef: row.source_customer_ref,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    totalInteractions: row.total_interactions,
    inboundCount: row.inbound_count,
    outboundCount: row.outbound_count,
    latestIntent: row.latest_intent,
    latestOutcome: row.latest_outcome,
    latestSentimentLabel: row.latest_sentiment_label,
    latestSentimentScore: row.latest_sentiment_score,
    escalationCount: row.escalation_count,
    channels: row.channels ?? [],
    latestAgentId: row.latest_agent_id,
    latestAgentDisplayName: row.latest_agent_display_name,
    authSummary: row.auth_summary,
    aggregationVersion: row.aggregation_version,
    aggregatedAt: row.aggregated_at,
  };
}

interface ContactPointRow {
  id: string;
  customer_id: string;
  type: ContactPointType;
  raw_value: string;
  normalized_value: string;
  is_primary: boolean;
  first_seen: string;
  last_seen: string;
}

function mapContactPoint(row: ContactPointRow): ContactPoint {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    rawValue: row.raw_value,
    normalizedValue: row.normalized_value,
    isPrimary: row.is_primary,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
}

interface InteractionRow {
  id: string;
  customer_id: string;
  contact_point_id: string | null;
  interaction_id: string;
  channel: string;
  direction: string | null;
  agent_id: string | null;
  agent_display_name: string | null;
  category_id: string | null;
  started_at: string;
  duration_seconds: number | null;
  intent: string | null;
  outcome: string | null;
  sentiment_score: number | null;
  was_authenticated: boolean | null;
  escalation_trigger: string | null;
  campaign_name: string | null;
  recording_available: boolean;
  source: string;
}

function mapInteraction(row: InteractionRow): CustomerInteractionRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    contactPointId: row.contact_point_id,
    interactionId: row.interaction_id,
    channel: row.channel,
    direction: row.direction,
    agentId: row.agent_id,
    agentDisplayName: row.agent_display_name,
    categoryId: row.category_id,
    startedAt: row.started_at,
    durationSeconds: row.duration_seconds,
    intent: row.intent,
    outcome: row.outcome,
    sentimentScore: row.sentiment_score,
    wasAuthenticated: row.was_authenticated,
    escalationTrigger: row.escalation_trigger,
    campaignName: row.campaign_name,
    recordingAvailable: row.recording_available,
    source: row.source,
  };
}

function agentIdsArg(authorizedAgentIds: string[] | 'all'): { p_agent_ids: string[] | null; p_all: boolean } {
  return authorizedAgentIds === 'all'
    ? { p_agent_ids: null, p_all: true }
    : { p_agent_ids: authorizedAgentIds, p_all: false };
}

export const supabaseCustomerRepository: CustomerRepository = {
  async getCustomer(customerId) {
    const row = await rpc<CustomerRow | null>('call_center_get_customer', { p_id: customerId });
    return row ? mapCustomer(row) : null;
  },

  async findContactPoint(type, normalizedValue) {
    const row = await rpc<ContactPointRow | null>('call_center_find_contact_point', {
      p_type: type,
      p_normalized: normalizedValue,
    });
    return row ? mapContactPoint(row) : null;
  },

  async listContactPoints(customerId) {
    const rows = await rpc<ContactPointRow[]>('call_center_list_contact_points', { p_customer_id: customerId });
    return (rows ?? []).map(mapContactPoint);
  },

  async createCustomerWithContactPoint({ type, rawValue, normalizedValue, displayName, now }) {
    const result = await rpc<{ customer: CustomerRow; contactPoint: ContactPointRow }>(
      'call_center_create_customer_with_contact_point',
      { p_type: type, p_raw: rawValue, p_normalized: normalizedValue, p_display_name: displayName, p_now: now },
    );
    return { customer: mapCustomer(result.customer), contactPoint: mapContactPoint(result.contactPoint) };
  },

  async touchContactPoint(contactPointId, seenAt) {
    await rpc<null>('call_center_touch_contact_point', { p_id: contactPointId, p_seen_at: seenAt });
  },

  async upsertInteraction(input: NewInteractionInput) {
    const result = await rpc<{ inserted: boolean; id: string }>('call_center_upsert_interaction', {
      p_payload: {
        customerId: input.customerId,
        contactPointId: input.contactPointId,
        interactionId: input.interactionId,
        channel: input.channel,
        direction: input.direction,
        agentId: input.agentId,
        agentDisplayName: input.agentDisplayName,
        startedAt: input.startedAt,
        durationSeconds: input.durationSeconds,
        intent: input.intent,
        outcome: input.outcome,
        sentimentScore: input.sentimentScore,
        wasAuthenticated: input.wasAuthenticated,
        escalationTrigger: input.escalationTrigger,
        campaignName: input.campaignName,
        recordingAvailable: input.recordingAvailable,
        source: input.source,
      },
    });
    return result;
  },

  async listInteractions(customerId, { page = 1, pageSize = 25, authorizedAgentIds }) {
    const { p_agent_ids, p_all } = agentIdsArg(authorizedAgentIds);
    const result = await rpc<{ rows: InteractionRow[]; totalCount: number }>('call_center_list_interactions', {
      p_customer_id: customerId,
      p_page: page,
      p_page_size: pageSize,
      p_agent_ids,
      p_all,
    });
    return { rows: (result.rows ?? []).map(mapInteraction), totalCount: result.totalCount ?? 0 };
  },

  async listAllInteractions(customerId, authorizedAgentIds) {
    const { p_agent_ids, p_all } = agentIdsArg(authorizedAgentIds);
    const rows = await rpc<InteractionRow[]>('call_center_list_all_interactions', {
      p_customer_id: customerId,
      p_agent_ids,
      p_all,
    });
    return (rows ?? []).map(mapInteraction);
  },

  async recomputeCustomerAggregate(customerId, now) {
    const row = await rpc<CustomerRow>('call_center_recompute_customer_aggregate', {
      p_customer_id: customerId,
      p_now: now,
    });
    return mapCustomer(row);
  },

  async listCustomers({ search, authorizedAgentIds, page = 1, pageSize = 25 }) {
    const { p_agent_ids, p_all } = agentIdsArg(authorizedAgentIds);
    const result = await rpc<{ rows: CustomerRow[]; totalCount: number }>('call_center_list_customers', {
      p_search: search ?? null,
      p_agent_ids,
      p_all,
      p_page: page,
      p_page_size: pageSize,
    });
    return { rows: (result.rows ?? []).map(mapCustomer), totalCount: result.totalCount ?? 0 };
  },

  async listCategories() {
    const rows = await rpc<{ id: string; name: string; description: string | null; active: boolean }[]>(
      'call_center_list_categories',
      {},
    );
    return (rows ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description, active: r.active }));
  },

  async getCategoryAgentMap() {
    const obj = await rpc<Record<string, string>>('call_center_get_category_agent_map', {});
    return new Map(Object.entries(obj ?? {}));
  },

  async upsertCategoryForAgent(agentId, categoryName) {
    await rpc<null>('call_center_upsert_category_for_agent', { p_agent_id: agentId, p_category_name: categoryName });
  },

  async getRoleAccess(role) {
    const result = await rpc<RoleAccess & { categoryIds: string[] }>('call_center_get_role_access', { p_role: role });
    return { role: result.role, allCategories: result.allCategories, categoryIds: result.categoryIds ?? [] };
  },

  async getHighWaterMark() {
    return rpc<string | null>('call_center_get_high_water_mark', {});
  },

  async setHighWaterMark(iso) {
    await rpc<null>('call_center_set_high_water_mark', { p_iso: iso });
  },

  async refreshInteractionCategoryCache(agentId, categoryId) {
    const count = await rpc<number>('call_center_refresh_interaction_category_cache', {
      p_agent_id: agentId,
      p_category_id: categoryId,
    });
    return count ?? 0;
  },
};
