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
import { computeAggregate } from './aggregateMath.js';

/**
 * The current deployment's adapter for CustomerRepository, per
 * docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §0.3/§14. This is the
 * ONLY file in src/server/customer360 allowed to import
 * `@supabase/supabase-js` — swapping persistence technology later means
 * writing a new file implementing CustomerRepository, with no change to
 * aggregationService.ts or authorizationService.ts.
 *
 * Uses the service-role key — never the anon key, never imported from
 * browser code. SUPABASE_SERVICE_ROLE_KEY is a server-only env var (see
 * .env.example), read here exactly once per process.
 */

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL (or VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY are not configured on the server');
  }
  client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return client;
}

// --- Row <-> domain mapping -------------------------------------------------

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

function throwIfError<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Supabase error: ${result.error.message}`);
  return result.data;
}

export const supabaseCustomerRepository: CustomerRepository = {
  async getCustomer(customerId) {
    const { data, error } = await getClient().from('customers').select('*').eq('id', customerId).maybeSingle();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data ? mapCustomer(data as CustomerRow) : null;
  },

  async findContactPoint(type, normalizedValue) {
    const { data, error } = await getClient()
      .from('customer_contact_points')
      .select('*')
      .eq('type', type)
      .eq('normalized_value', normalizedValue)
      .maybeSingle();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data ? mapContactPoint(data as ContactPointRow) : null;
  },

  async listContactPoints(customerId) {
    const { data, error } = await getClient()
      .from('customer_contact_points')
      .select('*')
      .eq('customer_id', customerId);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return ((data ?? []) as ContactPointRow[]).map(mapContactPoint);
  },

  async createCustomerWithContactPoint({ type, rawValue, normalizedValue, displayName, now }) {
    const customerInsert = throwIfError(
      await getClient()
        .from('customers')
        .insert({
          display_name: displayName,
          source_customer_ref: null,
          first_seen: now,
          last_seen: now,
          total_interactions: 0,
          inbound_count: 0,
          outbound_count: 0,
          channels: [],
          escalation_count: 0,
          aggregation_version: 1,
          aggregated_at: now,
        })
        .select('*')
        .single(),
    );
    const customer = mapCustomer(customerInsert as CustomerRow);

    const contactPointInsert = throwIfError(
      await getClient()
        .from('customer_contact_points')
        .insert({
          customer_id: customer.id,
          type,
          raw_value: rawValue,
          normalized_value: normalizedValue,
          is_primary: true,
          first_seen: now,
          last_seen: now,
        })
        .select('*')
        .single(),
    );
    return { customer, contactPoint: mapContactPoint(contactPointInsert as ContactPointRow) };
  },

  async touchContactPoint(contactPointId, seenAt) {
    const { error } = await getClient()
      .from('customer_contact_points')
      .update({ last_seen: seenAt, updated_at: new Date().toISOString() })
      .eq('id', contactPointId);
    if (error) throw new Error(`Supabase error: ${error.message}`);
  },

  async upsertInteraction(input: NewInteractionInput) {
    // Idempotency key: (source, interaction_id) — plan §6 step 1 / §20.
    const existing = await getClient()
      .from('customer_interactions')
      .select('id')
      .eq('source', input.source)
      .eq('interaction_id', input.interactionId)
      .maybeSingle();
    if (existing.error) throw new Error(`Supabase error: ${existing.error.message}`);
    if (existing.data) {
      return { inserted: false, id: (existing.data as { id: string }).id };
    }

    const categoryMap = await supabaseCustomerRepository.getCategoryAgentMap();
    const categoryId = input.agentId ? categoryMap.get(input.agentId) ?? null : null;

    const inserted = throwIfError(
      await getClient()
        .from('customer_interactions')
        .insert({
          customer_id: input.customerId,
          contact_point_id: input.contactPointId,
          interaction_id: input.interactionId,
          channel: input.channel,
          direction: input.direction,
          agent_id: input.agentId,
          agent_display_name: input.agentDisplayName,
          category_id: categoryId,
          started_at: input.startedAt,
          duration_seconds: input.durationSeconds,
          intent: input.intent,
          outcome: input.outcome,
          sentiment_score: input.sentimentScore,
          was_authenticated: input.wasAuthenticated,
          escalation_trigger: input.escalationTrigger,
          campaign_name: input.campaignName,
          recording_available: input.recordingAvailable,
          source: input.source,
        })
        .select('id')
        .single(),
    );
    return { inserted: true, id: (inserted as { id: string }).id };
  },

  async listInteractions(customerId, { page = 1, pageSize = 25, authorizedAgentIds }) {
    let query = getClient()
      .from('customer_interactions')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .order('started_at', { ascending: false });

    if (authorizedAgentIds !== 'all') {
      if (authorizedAgentIds.length === 0) {
        return { rows: [], totalCount: 0 };
      }
      query = query.in('agent_id', authorizedAgentIds);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return { rows: ((data ?? []) as InteractionRow[]).map(mapInteraction), totalCount: count ?? 0 };
  },

  async listAllInteractions(customerId, authorizedAgentIds) {
    let query = getClient().from('customer_interactions').select('*').eq('customer_id', customerId);
    if (authorizedAgentIds !== 'all') {
      if (authorizedAgentIds.length === 0) return [];
      query = query.in('agent_id', authorizedAgentIds);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return ((data ?? []) as InteractionRow[]).map(mapInteraction);
  },

  async recomputeCustomerAggregate(customerId, now) {
    const allRows = await supabaseCustomerRepository.listAllInteractions(customerId, 'all');
    const agg = computeAggregate(allRows);

    const current = await supabaseCustomerRepository.getCustomer(customerId);
    const nextVersion = (current?.aggregationVersion ?? 0) + 1;

    const updated = throwIfError(
      await getClient()
        .from('customers')
        .update({
          first_seen: agg.firstSeen,
          last_seen: agg.lastSeen,
          total_interactions: agg.totalInteractions,
          inbound_count: agg.inboundCount,
          outbound_count: agg.outboundCount,
          latest_intent: agg.latestIntent,
          latest_outcome: agg.latestOutcome,
          latest_sentiment_label: agg.latestSentimentLabel,
          latest_sentiment_score: agg.latestSentimentScore,
          escalation_count: agg.escalationCount,
          channels: agg.channels,
          latest_agent_id: agg.latestAgentId,
          latest_agent_display_name: agg.latestAgentDisplayName,
          auth_summary: agg.authSummary,
          aggregation_version: nextVersion,
          aggregated_at: now,
          updated_at: now,
        })
        .eq('id', customerId)
        .select('*')
        .single(),
    );
    return mapCustomer(updated as CustomerRow);
  },

  async listCustomers({ search, authorizedAgentIds, page = 1, pageSize = 25 }) {
    // §13: a customer appears only if they have >=1 interaction visible
    // under authorizedAgentIds. Resolve the visible customer_id set
    // first (from customer_interactions), then page the customers table
    // restricted to that set — this is the EXISTS-filter, expressed as
    // two queries since PostgREST has no correlated-subquery builder.
    let visibleCustomerIds: string[] | null = null;
    if (authorizedAgentIds !== 'all') {
      if (authorizedAgentIds.length === 0) return { rows: [], totalCount: 0 };
      const { data, error } = await getClient()
        .from('customer_interactions')
        .select('customer_id')
        .in('agent_id', authorizedAgentIds);
      if (error) throw new Error(`Supabase error: ${error.message}`);
      visibleCustomerIds = Array.from(new Set((data ?? []).map((r: { customer_id: string }) => r.customer_id)));
      if (visibleCustomerIds.length === 0) return { rows: [], totalCount: 0 };
    }

    let query = getClient().from('customers').select('*', { count: 'exact' }).order('last_seen', { ascending: false });
    if (visibleCustomerIds) query = query.in('id', visibleCustomerIds);
    if (search) {
      // Name search only here — phone/email search is resolved via
      // contact points in the transport layer (plan §4's materialization
      // rule), since a phone search may need to MATERIALIZE a customer,
      // which this read-only list query must not do.
      query = query.ilike('display_name', `%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return { rows: ((data ?? []) as CustomerRow[]).map(mapCustomer), totalCount: count ?? 0 };
  },

  async listCategories() {
    const { data, error } = await getClient().from('customer360_categories').select('*').order('name');
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return ((data ?? []) as { id: string; name: string; description: string | null; active: boolean }[]).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      active: r.active,
    }));
  },

  async getCategoryAgentMap() {
    const { data, error } = await getClient().from('customer360_category_agents').select('agent_id, category_id');
    if (error) throw new Error(`Supabase error: ${error.message}`);
    const map = new Map<string, string>();
    for (const row of (data ?? []) as { agent_id: string; category_id: string }[]) {
      map.set(row.agent_id, row.category_id);
    }
    return map;
  },

  async upsertCategoryForAgent(agentId, categoryName) {
    const existingMap = await supabaseCustomerRepository.getCategoryAgentMap();
    if (existingMap.has(agentId)) return; // already mapped — never overwrite an admin's existing mapping (plan §17)

    const category = throwIfError(
      await getClient()
        .from('customer360_categories')
        .insert({ name: categoryName, description: null, active: true })
        .select('id')
        .single(),
    );
    const { error } = await getClient()
      .from('customer360_category_agents')
      .insert({ category_id: (category as { id: string }).id, agent_id: agentId });
    if (error) throw new Error(`Supabase error: ${error.message}`);
  },

  async getRoleAccess(role) {
    const allAccess = await getClient()
      .from('role_customer360_access')
      .select('all_categories')
      .eq('role', role)
      .maybeSingle();
    if (allAccess.error) throw new Error(`Supabase error: ${allAccess.error.message}`);
    const allCategories = Boolean((allAccess.data as { all_categories: boolean } | null)?.all_categories);

    if (allCategories) {
      return { role, allCategories: true, categoryIds: [] };
    }

    const { data, error } = await getClient()
      .from('role_customer360_categories')
      .select('category_id')
      .eq('role', role);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return {
      role,
      allCategories: false,
      categoryIds: ((data ?? []) as { category_id: string }[]).map((r) => r.category_id),
    };
  },

  async getHighWaterMark() {
    const { data, error } = await getClient()
      .from('customer_aggregation_state')
      .select('last_refreshed_through')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return (data as { last_refreshed_through: string } | null)?.last_refreshed_through ?? null;
  },

  async setHighWaterMark(iso) {
    const { error } = await getClient()
      .from('customer_aggregation_state')
      .upsert({ id: 1, last_refreshed_through: iso, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Supabase error: ${error.message}`);
  },

  async refreshInteractionCategoryCache(agentId, categoryId) {
    const { data, error } = await getClient()
      .from('customer_interactions')
      .update({ category_id: categoryId })
      .eq('agent_id', agentId)
      .select('id');
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return (data ?? []).length;
  },
};
