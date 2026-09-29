import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { InteractionEventRepository, AppendEventResult } from './interactionEventRepository.js';
import type { InteractionEvent, InteractionEventQueryFilter, InteractionEventType, NewInteractionEvent } from '../../types/interactionEvent.js';

/**
 * Session R5 — the current deployment's adapter for
 * InteractionEventRepository, mirroring supabaseCampaignRepository.ts's
 * own header comment/pattern exactly: `call_center` is NOT exposed via
 * PostgREST, so this file never calls `.from('call_center....')`
 * directly — every operation goes through a
 * `public.call_center_events_*` SECURITY DEFINER function, individually
 * granted to `service_role` only. This is the ONLY file in
 * src/server/telemetry allowed to import `@supabase/supabase-js`.
 *
 * Reuses the same CUSTOMER360_SUPABASE_URL/
 * CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY env vars every other domain
 * already uses — no new secret, same project, same call_center schema.
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

interface EventRow {
  event_id: string;
  interaction_id: string;
  event_time: string;
  event_type: InteractionEventType;
  event_name: string | null;
  success: boolean | null;
  error_code: string | null;
  error_message: string | null;
  latency_ms: number | null;
  tool_name: string | null;
  provider: string | null;
  model: string | null;
  metadata: Record<string, unknown> | null;
  ingested_at: string;
}

function mapRow(row: EventRow): InteractionEvent {
  return {
    eventId: row.event_id,
    interactionId: row.interaction_id,
    eventTime: row.event_time,
    eventType: row.event_type,
    eventName: row.event_name ?? undefined,
    success: row.success,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    latencyMs: row.latency_ms ?? undefined,
    toolName: row.tool_name ?? undefined,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    metadata: row.metadata ?? undefined,
    ingestedAt: row.ingested_at,
  };
}

function toAppendArgs(event: NewInteractionEvent, now: string): Record<string, unknown> {
  return {
    p_event_id: event.eventId,
    p_interaction_id: event.interactionId,
    p_event_time: event.eventTime,
    p_event_type: event.eventType,
    p_event_name: event.eventName ?? null,
    p_success: event.success,
    p_error_code: event.errorCode ?? null,
    p_error_message: event.errorMessage ?? null,
    p_latency_ms: event.latencyMs ?? null,
    p_tool_name: event.toolName ?? null,
    p_provider: event.provider ?? null,
    p_model: event.model ?? null,
    p_metadata: event.metadata ?? null,
    p_ingested_at: now,
  };
}

export const supabaseInteractionEventRepository: InteractionEventRepository = {
  async appendEvent(event, now) {
    const result = await rpc<{ event: EventRow; wasInsert: boolean }>('call_center_events_append', toAppendArgs(event, now));
    return { duplicate: !result.wasInsert, event: mapRow(result.event) };
  },

  async appendEvents(events, now) {
    const results: AppendEventResult[] = [];
    // Sequential, not Promise.all — an append-batch failing partway
    // through must not leave the caller unable to tell which events
    // succeeded; each result is reported individually and in order.
    for (const event of events) {
      results.push(await supabaseInteractionEventRepository.appendEvent(event, now));
    }
    return results;
  },

  async getEventsForInteraction(interactionId) {
    const rows = await rpc<EventRow[]>('call_center_events_get_for_interaction', { p_interaction_id: interactionId });
    return (rows ?? []).map(mapRow);
  },

  async queryEvents(filter: InteractionEventQueryFilter) {
    const rows = await rpc<EventRow[]>('call_center_events_query', {
      p_interaction_id: filter.interactionId ?? null,
      p_event_type: filter.eventType ?? null,
      p_tool_name: filter.toolName ?? null,
      p_success: filter.success ?? null,
      p_event_time_from: filter.eventTimeFrom ?? null,
      p_event_time_to: filter.eventTimeTo ?? null,
    });
    return (rows ?? []).map(mapRow);
  },
};
