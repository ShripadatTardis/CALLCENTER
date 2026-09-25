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
}

export async function sendChatMessage(
  role: string,
  message: string,
  sessionId: string | undefined,
  opts: SendChatMessageOptions = {},
): Promise<ChatSendResult & { raw: ChatResponseDto }> {
  const body: ChatRequestDto = { message, session_id: sessionId };
  // agent_id/customer_id/contact_id/caller_name/phone_number are only
  // meaningful on the first message of a session — agent_id binds then
  // and every identity field is resolved once and kept on the session
  // (Chat_Mode_API.docx). Never sent on a continuing turn.
  if (!sessionId) {
    if (opts.agentId) body.agent_id = opts.agentId;
    if (opts.customerId) body.customer_id = opts.customerId;
    if (opts.contactId) body.contact_id = opts.contactId;
    if (opts.callerName) body.caller_name = opts.callerName;
    if (opts.phoneNumber) body.phone_number = opts.phoneNumber;
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
