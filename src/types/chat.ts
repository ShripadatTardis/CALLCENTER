import type { ChatDataSource } from './api/chat';

/**
 * Normalized, UI-facing Chat types — plan §8. These are already this
 * app's own API response shapes (from /api/chat/*), not a third-party
 * DTO, so unlike calls/agents there is no separate mapper boundary at
 * the frontend layer for the *response* shapes below; the DTO→domain
 * mapping happens once, server-side, in src/services/chat/chatMapper.ts.
 */

export interface ChatTurnMetadata {
  dataSource: ChatDataSource;
  authenticated: boolean;
  intent: string | null;
  confidence: number | null;
  detectionMethod: string | null;
  latencyMs: number | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
  metadata?: ChatTurnMetadata;
}

export interface ChatSessionSummary {
  id: string;
  upstreamSessionId: string;
  startedAt: string;
  lastActivityAt: string;
  status: 'active' | 'closed';
  messageCount: number;
  latestIntent: string | null;
  latestConfidence: number | null;
  latestAuthenticated: boolean | null;
  latestDataSource: ChatDataSource | null;
  latestDetectionMethod: string | null;
  latestLatencyMs: number | null;
  customerId: string | null;
  agentId: string | null;
}

export interface ChatSessionDetail {
  session: ChatSessionSummary;
  messages: ChatMessage[];
}

export interface ChatSendResult {
  chatSessionId: string;
  message: ChatMessage;
}
