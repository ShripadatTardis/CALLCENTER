import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ChatRepository } from './chatRepository.js';
import type { ChatMessageRecord, ChatSessionRecord, ChatSessionStatus, NewChatMessageInput } from './types.js';

/**
 * The current deployment's adapter for ChatRepository, per
 * docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md §5/§6/§17. Same AuditAI
 * project + call_center schema Customer 360 uses — reuses the same
 * CUSTOMER360_SUPABASE_URL / CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY env
 * vars (same project, no new secret needed) — but is its OWN
 * @supabase/supabase-js import within THIS domain (src/server/chat/),
 * a separate concern from src/server/customer360's own adapter, per
 * plan §6's "each domain gets its own small adapter" convention.
 *
 * `call_center` is not exposed via PostgREST — every operation goes
 * through a `public.call_center_chat_*` SECURITY DEFINER function,
 * each individually granted to service_role only.
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

interface SessionRow {
  id: string;
  upstream_session_id: string;
  started_at: string;
  last_activity_at: string;
  status: ChatSessionStatus;
  customer_id: string | null;
  agent_id: string | null;
  created_by: string | null;
  message_count: number;
  latest_intent: string | null;
  latest_confidence: number | null;
  latest_authenticated: boolean | null;
  latest_data_source: string | null;
  latest_detection_method: string | null;
  latest_latency_ms: number | null;
}

function mapSession(row: SessionRow): ChatSessionRecord {
  return {
    id: row.id,
    upstreamSessionId: row.upstream_session_id,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    status: row.status,
    customerId: row.customer_id,
    agentId: row.agent_id,
    createdBy: row.created_by,
    messageCount: row.message_count,
    latestIntent: row.latest_intent,
    latestConfidence: row.latest_confidence,
    latestAuthenticated: row.latest_authenticated,
    latestDataSource: row.latest_data_source,
    latestDetectionMethod: row.latest_detection_method,
    latestLatencyMs: row.latest_latency_ms,
  };
}

interface MessageRow {
  id: string;
  chat_session_id: string;
  sequence: number;
  role: 'user' | 'ai';
  raw_text: string;
  intent: string | null;
  confidence: number | null;
  authenticated: boolean | null;
  data_source: string | null;
  detection_method: string | null;
  latency_ms: number | null;
  created_at: string;
}

function mapMessage(row: MessageRow): ChatMessageRecord {
  return {
    id: row.id,
    chatSessionId: row.chat_session_id,
    sequence: row.sequence,
    role: row.role,
    rawText: row.raw_text,
    intent: row.intent,
    confidence: row.confidence,
    authenticated: row.authenticated,
    dataSource: row.data_source,
    detectionMethod: row.detection_method,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  };
}

export const supabaseChatRepository: ChatRepository = {
  async createOrTouchSession(upstreamSessionId, now, createdBy) {
    const row = await rpc<SessionRow>('call_center_chat_create_session', {
      p_upstream_session_id: upstreamSessionId,
      p_now: now,
      p_created_by: createdBy,
    });
    return mapSession(row);
  },

  async getSessionByUpstreamId(upstreamSessionId) {
    const row = await rpc<SessionRow | null>('call_center_chat_get_session_by_upstream_id', {
      p_upstream_session_id: upstreamSessionId,
    });
    return row ? mapSession(row) : null;
  },

  async getSession(id) {
    const row = await rpc<SessionRow | null>('call_center_chat_get_session', { p_id: id });
    return row ? mapSession(row) : null;
  },

  async appendMessage(chatSessionId, input: NewChatMessageInput) {
    const row = await rpc<MessageRow>('call_center_chat_append_message', {
      p_session_id: chatSessionId,
      p_role: input.role,
      p_raw_text: input.rawText,
      p_now: input.now,
      p_intent: input.intent ?? null,
      p_confidence: input.confidence ?? null,
      p_authenticated: input.authenticated ?? null,
      p_data_source: input.dataSource ?? null,
      p_detection_method: input.detectionMethod ?? null,
      p_latency_ms: input.latencyMs ?? null,
    });
    return mapMessage(row);
  },

  async closeSession(id) {
    await rpc<null>('call_center_chat_close_session', { p_session_id: id });
  },

  async listSessions({ page = 1, pageSize = 25 }) {
    const result = await rpc<{ rows: SessionRow[]; totalCount: number }>('call_center_chat_list_sessions', {
      p_page: page,
      p_page_size: pageSize,
    });
    return { rows: (result.rows ?? []).map(mapSession), totalCount: result.totalCount ?? 0 };
  },

  async listMessages(chatSessionId) {
    const rows = await rpc<MessageRow[]>('call_center_chat_list_messages', { p_session_id: chatSessionId });
    return (rows ?? []).map(mapMessage);
  },
};
