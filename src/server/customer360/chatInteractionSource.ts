import type { InteractionSourceAdapter } from './interactionSourceAdapter.js';
import type { SourceInteraction } from './types.js';
import { supabaseChatRepository } from '../chat/supabaseChatRepository.js';

/**
 * Session 5.1 addition — a second InteractionSourceAdapter implementation
 * wrapping the Chat API's GET /api/v1/chat/sessions, so Customer 360's
 * existing runReconciliation (reconcileJob.ts) can ingest Chat sessions
 * with zero changes to the aggregation/authorization logic itself — only
 * a different adapter plugged in, exactly per plan §0.3's "a different
 * deployment/source could plug in a different adapter" design goal.
 *
 * One chat SESSION = one SourceInteraction, never one per message (§5 of
 * the Session 5.1 prompt) — listPage() below maps the session list
 * directly, one row in, one row out.
 *
 * Session 5.2 update: a session with a phone_number OR a backend
 * customer_id (CIF) is now materializable — CIF-only sessions (no phone
 * at all) resolve via the shared identityResolver's external-identity
 * path (see identityResolver.ts, reconcileJob.ts). A session with
 * NEITHER is still skipped — there is no identity signal at all to
 * attach it to.
 */

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;

function getBackendConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
  }
  return { baseUrl, apiKey };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface ChatSessionRowDto {
  session_id: string;
  agent_id: string | null;
  agent_name: string | null;
  customer_id: string | null;
  contact_id: string | null;
  caller_name: string | null;
  phone_number: string | null;
  is_bank_customer: boolean;
  channel: string;
  status: 'active' | 'completed';
  authenticated: boolean;
  message_count: number;
  history_doc_id: string | null;
  intent: string | null;
  confidence: number | null;
  data_source: string | null;
  detection_method: string | null;
  latency_ms: number | null;
  started_at: string;
  updated_at: string;
}

interface ChatSessionsListDto {
  success: boolean;
  data: {
    sessions: ChatSessionRowDto[];
    pagination: { page: number; page_size: number; total_records: number; total_pages: number };
  };
}

async function fetchSessions(query: Record<string, string>): Promise<ChatSessionsListDto> {
  const { baseUrl, apiKey } = getBackendConfig();
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl}/api/v1/chat/sessions${search ? `?${search}` : ''}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
      const text = await res.text();
      const body = text ? JSON.parse(text) : undefined;
      if (!res.ok) {
        throw new Error(`chat/sessions request failed: ${res.status} ${typeof body === 'object' ? JSON.stringify(body) : text}`);
      }
      return body as ChatSessionsListDto;
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('chat/sessions request failed after retries');
}

function mapRow(dto: ChatSessionRowDto, preferredCustomerId: string | null = null): SourceInteraction | null {
  if (!dto.phone_number && !dto.customer_id && !preferredCustomerId) return null; // no identity signal at all — cannot materialize a customer/contact
  return {
    interactionId: dto.session_id,
    channel: 'chat',
    phoneNumber: dto.phone_number,
    externalCustomerId: dto.customer_id,
    preferredCustomerId,
    direction: null, // chat has no inbound/outbound concept
    agentId: dto.agent_id,
    agentDisplayName: dto.agent_name,
    startedAt: dto.started_at,
    durationSeconds: null,
    intent: dto.intent,
    outcome: null, // chat has no call-outcome concept
    sentimentScore: null,
    wasAuthenticated: dto.authenticated,
    escalationTrigger: null,
    campaignName: null,
    recordingAvailable: false,
    source: 'chat-sessions',
  };
}

export const chatInteractionSource: InteractionSourceAdapter = {
  async searchByContactPoint(type, normalizedValue) {
    if (type !== 'phone') return [];
    const dto = await fetchSessions({ page_size: '100' });
    const matched = dto.data.sessions.filter(
      (s) => s.phone_number && s.phone_number.replace(/[^0-9]/g, '') === normalizedValue,
    );
    const links = await supabaseChatRepository.getCustomerLinks(matched.map((s) => s.session_id));
    return matched
      .map((s) => mapRow(s, links[s.session_id]?.customerId ?? null))
      .filter((s): s is SourceInteraction => s !== null);
  },

  async listPage(page, pageSize) {
    const dto = await fetchSessions({ page: String(page), page_size: String(pageSize) });
    const links = await supabaseChatRepository.getCustomerLinks(dto.data.sessions.map((s) => s.session_id));
    return {
      rows: dto.data.sessions
        .map((s) => mapRow(s, links[s.session_id]?.customerId ?? null))
        .filter((s): s is SourceInteraction => s !== null),
      totalPages: dto.data.pagination.total_pages,
    };
  },
};
