import { request } from '@/services/transport/httpClient';
import type { ChatRequestDto, ChatResponseDto } from '@/types/api/chat';
import type { ChatSendResult, ChatSessionDetail, ChatSessionSummary } from '@/types/chat';

/**
 * Chat domain service — Session 5.1 amendment. Calls this app's own
 * /api/chat/* routes via the same shared httpClient every other domain
 * service uses.
 */

function roleHeaders(role: string): Record<string, string> {
  return { 'x-user-role': role };
}

export interface SendChatMessageOptions {
  agentId?: string;
  customerId?: string;
  contactId?: string;
  callerName?: string;
  phoneNumber?: string;
  /**
   * The Customer 360 internal customer id the operator explicitly
   * selected, if any — kept separate from `customerId` above (which is
   * only ever a real backend CIF). Read by this app's own /api/chat
   * route to persist the local Customer 360 linkage; NEVER forwarded to
   * the backend Chat API itself.
   */
  customer360CustomerId?: string;
  /**
   * Session 11.9B — the real campaign this chat was initiated from
   * (Campaign Customer mode only), and the real campaign_target id
   * within it — both sourced from an operator-selected, real
   * campaign_targets row, never inferred. Local-only: persisted onto
   * this app's own chat_sessions row for correlation, NEVER forwarded
   * to the backend Chat API and NEVER entered into the Voice
   * campaign_executions/reconciliation lifecycle (see
   * docs/SESSION_11_9B_INTEGRATED_CHAT_PERSISTENCE.md for why).
   */
  campaignId?: string;
  campaignTargetId?: string;
  /** Display-only, for the collapsed "started from" context after binding — never sent upstream, never persisted. */
  campaignName?: string;
  /**
   * Session 11.9B — Trial/Test isolation marker. True whenever the
   * operator is in Trial/Test mode, regardless of whether manual
   * identity fields are populated — this is what actually prevents a
   * manually-typed real CIF/phone from silently becoming Customer 360
   * production history (see chatInteractionSource.ts). Local-only,
   * never forwarded to the backend Chat API.
   */
  isTrial?: boolean;
}

export async function sendChatMessage(
  role: string,
  message: string,
  sessionId: string | undefined,
  opts: SendChatMessageOptions = {},
): Promise<ChatSendResult & { raw: ChatResponseDto }> {
  // customer360_customer_id is a local-persistence-only field read by
  // this app's own /api/chat route — it is never part of ChatRequestDto
  // (the exact upstream backend contract) and is never forwarded to the
  // backend Chat API.
  const body: ChatRequestDto & {
    customer360_customer_id?: string;
    campaign_id?: string;
    campaign_target_id?: string;
    is_trial?: boolean;
  } = { message, session_id: sessionId };
  // agent_id/customer_id/contact_id/caller_name/phone_number are only
  // meaningful on the first message of a session — agent_id binds then
  // and every identity field is resolved once and kept on the session
  // (Chat_Mode_API.docx). Never sent on a continuing turn. Same rule
  // for the local-only customer360_customer_id/campaign_id/
  // campaign_target_id/is_trial fields (Session 11.9B) — none of these
  // four are ever part of ChatRequestDto (the exact upstream contract);
  // this app's own /api/chat route strips them before forwarding.
  if (!sessionId) {
    if (opts.agentId) body.agent_id = opts.agentId;
    if (opts.customerId) body.customer_id = opts.customerId;
    if (opts.contactId) body.contact_id = opts.contactId;
    if (opts.callerName) body.caller_name = opts.callerName;
    if (opts.phoneNumber) body.phone_number = opts.phoneNumber;
    if (opts.customer360CustomerId) body.customer360_customer_id = opts.customer360CustomerId;
    if (opts.campaignId) body.campaign_id = opts.campaignId;
    if (opts.campaignTargetId) body.campaign_target_id = opts.campaignTargetId;
    if (opts.isTrial) body.is_trial = opts.isTrial;
  }

  const dto = await request<ChatResponseDto & { chatSessionId: string | null; persisted: boolean }>('/chat', {
    method: 'POST',
    body,
    headers: roleHeaders(role),
  });

  return {
    chatSessionId: dto.chatSessionId ?? '',
    message: {
      id: `${dto.session_id}-${Date.now()}`,
      role: 'ai',
      text: dto.response,
      timestamp: new Date().toISOString(),
      metadata: {
        dataSource: dto.data_source,
        authenticated: dto.authenticated,
        intent: dto.intent,
        confidence: dto.confidence,
        detectionMethod: dto.detection_method,
        latencyMs: dto.latency_ms,
      },
    },
    raw: dto,
  };
}

export async function closeChatSession(role: string, chatSessionId: string): Promise<void> {
  await request<{ ok: boolean }>('/chat', {
    method: 'POST',
    query: { action: 'close' },
    body: { chatSessionId },
    headers: roleHeaders(role),
  });
}

export async function fetchChatLogs(
  role: string,
  opts: { page?: number; pageSize?: number; agentId?: string; status?: string } = {},
): Promise<{
  data: ChatSessionSummary[];
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
  source: 'live' | 'local-fallback';
}> {
  return request('/chat/logs', {
    method: 'GET',
    query: { page: opts.page, pageSize: opts.pageSize, agentId: opts.agentId, status: opts.status },
    headers: roleHeaders(role),
  });
}

export async function fetchChatSessionDetail(role: string, sessionId: string): Promise<ChatSessionDetail> {
  return request<ChatSessionDetail>('/chat/logs', {
    method: 'GET',
    query: { id: sessionId },
    headers: roleHeaders(role),
  });
}
