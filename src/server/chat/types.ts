/**
 * Domain types for Chat persistence (Session 4.5 —
 * docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md §5/§8). Nothing here depends
 * on Supabase or Vercel — only supabaseChatRepository.ts does.
 */

export type ChatMessageRole = 'user' | 'ai';
export type ChatSessionStatus = 'active' | 'closed';

export interface ChatSessionRecord {
  id: string;
  upstreamSessionId: string;
  startedAt: string;
  lastActivityAt: string;
  status: ChatSessionStatus;
  /** This app's own internal Customer 360 linkage — set only by chat ingestion (§6), never by a chat turn directly. Distinct from backendCustomerId below. */
  customerId: string | null;
  agentId: string | null;
  agentName: string | null;
  /** Raw backend CIF from the Chat API's own customer_id field — NOT the same as customerId above. */
  backendCustomerId: string | null;
  backendContactId: string | null;
  callerName: string | null;
  phoneNumber: string | null;
  isBankCustomer: boolean | null;
  upstreamStatus: string | null;
  historyDocId: string | null;
  createdBy: string | null;
  messageCount: number;
  latestIntent: string | null;
  latestConfidence: number | null;
  latestAuthenticated: boolean | null;
  latestDataSource: string | null;
  latestDetectionMethod: string | null;
  latestLatencyMs: number | null;
}

export interface NewChatSessionIdentity {
  agentId?: string | null;
  agentName?: string | null;
  backendCustomerId?: string | null;
  backendContactId?: string | null;
  callerName?: string | null;
  phoneNumber?: string | null;
  isBankCustomer?: boolean | null;
  upstreamStatus?: string | null;
  historyDocId?: string | null;
  /**
   * This app's own internal Customer 360 linkage, set only when the
   * operator explicitly selected a Customer 360 customer in the Chat
   * Console selector before starting the session. Never derived from
   * the backend response, never sent to the backend API — distinct
   * from backendCustomerId (the raw backend CIF) exactly as
   * ChatSessionRecord.customerId already documents. Preserved
   * (never nulled) by the create/touch RPC once set.
   */
  customer360CustomerId?: string | null;
}

export interface ChatMessageRecord {
  id: string;
  chatSessionId: string;
  sequence: number;
  role: ChatMessageRole;
  rawText: string;
  intent: string | null;
  confidence: number | null;
  authenticated: boolean | null;
  dataSource: string | null;
  detectionMethod: string | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface NewChatMessageInput {
  role: ChatMessageRole;
  rawText: string;
  now: string;
  intent?: string | null;
  confidence?: number | null;
  authenticated?: boolean | null;
  dataSource?: string | null;
  detectionMethod?: string | null;
  latencyMs?: number | null;
}
