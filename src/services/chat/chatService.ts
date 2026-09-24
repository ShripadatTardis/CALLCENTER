import { request } from '@/services/transport/httpClient';
import type { ChatResponseDto } from '@/types/api/chat';
import type { ChatSendResult, ChatSessionDetail } from '@/types/chat';

/**
 * Chat domain service — plan §6. Calls this app's own /api/chat/* routes
 * via the same shared httpClient every other domain service uses.
 */

function roleHeaders(role: string): Record<string, string> {
  return { 'x-user-role': role };
}

export async function sendChatMessage(
  role: string,
  message: string,
  sessionId: string | undefined,
): Promise<ChatSendResult & { raw: ChatResponseDto }> {
  const dto = await request<ChatResponseDto & { chatSessionId: string | null; persisted: boolean }>('/chat', {
    method: 'POST',
    body: { message, session_id: sessionId },
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
  await request<{ ok: boolean }>('/chat/close', {
    method: 'POST',
    body: { chatSessionId },
    headers: roleHeaders(role),
  });
}

export async function fetchChatLogs(
  role: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ data: ChatSessionDetail['session'][]; pagination: { page: number; pageSize: number; totalCount: number } }> {
  return request('/chat/logs', {
    method: 'GET',
    query: { page: opts.page, pageSize: opts.pageSize },
    headers: roleHeaders(role),
  });
}

export async function fetchChatSessionDetail(role: string, chatSessionId: string): Promise<ChatSessionDetail> {
  return request<ChatSessionDetail>(`/chat/logs/${encodeURIComponent(chatSessionId)}`, {
    method: 'GET',
    headers: roleHeaders(role),
  });
}
