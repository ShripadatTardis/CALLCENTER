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
  customerId: string | null;
  agentId: string | null;
  createdBy: string | null;
  messageCount: number;
  latestIntent: string | null;
  latestConfidence: number | null;
  latestAuthenticated: boolean | null;
  latestDataSource: string | null;
  latestDetectionMethod: string | null;
  latestLatencyMs: number | null;
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
