import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBackendConfig, withErrorBoundary, noStore } from '../_voicebot.js';
import { readIntQuery } from '../_customer360.js';
import { supabaseChatRepository } from '../../src/server/chat/supabaseChatRepository.js';
import type { ChatMessageRecord, ChatSessionRecord } from '../../src/server/chat/types.js';
import type {
  ChatDataSource,
  ChatSessionDetailResponseDto,
  ChatSessionListRowDto,
  ChatSessionsListResponseDto,
} from '../../src/types/api/chat.js';
import type { ChatMessage, ChatSessionSummary } from '../../src/types/chat.js';

/**
 * GET /api/chat/logs                 — paginated session list
 * GET /api/chat/logs?id={session_id} — one session + its ordered messages
 *
 * Session 5.1 amendment: GET /api/v1/chat/sessions[/{id}] is now the
 * documented authoritative history source ("the chat equivalent of Call
 * Logs + Call Transcript"), including transcripts long after a session
 * ends (served from the durable transcript store via history_doc_id).
 * This proxy therefore reads the LIVE backend as primary and falls back
 * to this app's own local call_center.chat_sessions/chat_messages copy
 * ONLY when the live call fails (network error, 5xx, or the backend is
 * down) — never silently, always tagged via ChatSessionSummary.source so
 * the UI can show it's a fallback, not authoritative live data. This
 * mirrors the "operational audit/fallback copy" decision made for local
 * persistence in api/chat/index.ts's write path (see that file + the
 * plan doc's amended §2/§4 for the full reasoning).
 *
 * `id` here is the BACKEND's own session_id (authoritative identifier),
 * not this app's internal chat_sessions.id — Chat Logs/Session Detail no
 * longer key off the internal id at all.
 */

function toSummaryFromLive(row: ChatSessionListRowDto): ChatSessionSummary {
  return {
    sessionId: row.session_id,
    agentId: row.agent_id ?? null,
    agentName: row.agent_name ?? null,
    customerId: row.customer_id,
    contactId: row.contact_id,
    callerName: row.caller_name,
    phoneNumber: row.phone_number,
    isBankCustomer: row.is_bank_customer,
    status: row.status,
    authenticated: row.authenticated,
    messageCount: row.message_count,
    historyDocId: row.history_doc_id,
    latestIntent: row.intent,
    latestConfidence: row.confidence,
    latestDataSource: (row.data_source as ChatSessionSummary['latestDataSource']) ?? null,
    latestDetectionMethod: row.detection_method,
    latestLatencyMs: row.latency_ms,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    source: 'live',
  };
}

function toSummaryFromLocal(s: ChatSessionRecord): ChatSessionSummary {
  return {
    sessionId: s.upstreamSessionId,
    agentId: s.agentId,
    agentName: s.agentName,
    customerId: s.backendCustomerId,
    contactId: s.backendContactId,
    callerName: s.callerName,
    phoneNumber: s.phoneNumber,
    isBankCustomer: s.isBankCustomer,
    status: s.status === 'closed' ? 'completed' : 'active',
    authenticated: Boolean(s.latestAuthenticated),
    messageCount: s.messageCount,
    historyDocId: s.historyDocId,
    latestIntent: s.latestIntent,
    latestConfidence: s.latestConfidence,
    latestDataSource: (s.latestDataSource as ChatSessionSummary['latestDataSource']) ?? null,
    latestDetectionMethod: s.latestDetectionMethod,
    latestLatencyMs: s.latestLatencyMs,
    startedAt: s.startedAt,
    updatedAt: s.lastActivityAt,
    source: 'local-fallback',
  };
}

function toMessageFromLocal(m: ChatMessageRecord): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    text: m.rawText,
    timestamp: m.createdAt,
    metadata:
      m.role === 'ai'
        ? {
            dataSource: m.dataSource as ChatDataSource,
            authenticated: Boolean(m.authenticated),
            intent: m.intent,
            confidence: m.confidence,
            detectionMethod: m.detectionMethod,
            latencyMs: m.latencyMs,
          }
        : undefined,
  };
}

async function fetchLiveList(query: Record<string, string>): Promise<ChatSessionsListResponseDto> {
  const { baseUrl, apiKey } = getBackendConfig();
  const search = new URLSearchParams(query).toString();
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions${search ? `?${search}` : ''}`, {
    headers: { 'X-API-Key': apiKey },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`chat/sessions request failed: ${res.status} ${text}`);
  return body as ChatSessionsListResponseDto;
}

async function fetchLiveDetail(sessionId: string): Promise<ChatSessionDetailResponseDto> {
  const { baseUrl, apiKey } = getBackendConfig();
  const res = await fetch(`${baseUrl}/api/v1/chat/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { 'X-API-Key': apiKey },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`chat/sessions/{id} request failed: ${res.status} ${text}`);
  return body as ChatSessionDetailResponseDto;
}

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }

  noStore(res);

  const idRaw = req.query.id;
  const sessionId = Array.isArray(idRaw) ? idRaw[0] : idRaw;

  if (sessionId) {
    try {
      const dto = await fetchLiveDetail(sessionId);
      const { messages, ...sessionRow } = dto.data;
      res.status(200).json({
        session: toSummaryFromLive(sessionRow),
        messages: messages.map((m) => ({
          id: `${sessionId}-${m.number}`,
          role: m.role === 'customer' ? 'user' : 'ai',
          text: m.message,
          timestamp: m.timestamp,
        })),
      });
      return;
    } catch (err) {
      console.warn('Live chat session-detail fetch failed, falling back to local copy:', err);
      const local = await supabaseChatRepository.getSessionByUpstreamId(sessionId);
      if (!local) {
        res.status(404).json({ detail: 'Chat session not found (live fetch failed and no local copy exists)' });
        return;
      }
      const messages = await supabaseChatRepository.listMessages(local.id);
      res.status(200).json({ session: toSummaryFromLocal(local), messages: messages.map(toMessageFromLocal) });
      return;
    }
  }

  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 15);
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
  const contactId = typeof req.query.contactId === 'string' ? req.query.contactId : undefined;

  try {
    const query: Record<string, string> = { page: String(page), page_size: String(pageSize) };
    if (agentId) query.agent_id = agentId;
    if (status) query.status = status;
    if (customerId) query.customer_id = customerId;
    if (contactId) query.contact_id = contactId;

    const dto = await fetchLiveList(query);
    res.status(200).json({
      data: dto.data.sessions.map(toSummaryFromLive),
      pagination: {
        page: dto.data.pagination.page,
        pageSize: dto.data.pagination.page_size,
        totalCount: dto.data.pagination.total_records,
        totalPages: dto.data.pagination.total_pages,
      },
      source: 'live',
    });
  } catch (err) {
    console.warn('Live chat session-list fetch failed, falling back to local copy:', err);
    const { rows, totalCount } = await supabaseChatRepository.listSessions({ page, pageSize });
    res.status(200).json({
      data: rows.map(toSummaryFromLocal),
      pagination: { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) },
      source: 'local-fallback',
    });
  }
});
