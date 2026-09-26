import type { ChatDataSource, ChatSessionStatus } from './api/chat';

/**
 * Normalized, UI-facing Chat types — Session 5.1 amendment. Chat Logs and
 * Chat Session Detail are now sourced from the authoritative backend
 * endpoints (GET /api/v1/chat/sessions[/{id}]) as primary, with this
 * app's own local persistence as a fallback only when the live call
 * fails (see api/chat/logs.ts's doc comment for the exact policy).
 * `sessionId` here is always the backend's own session_id — the single
 * authoritative identifier — never this app's internal chat_sessions.id.
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
  sessionId: string;
  agentId: string | null;
  agentName: string | null;
  customerId: string | null;
  contactId: string | null;
  callerName: string | null;
  phoneNumber: string | null;
  isBankCustomer: boolean | null;
  status: ChatSessionStatus;
  authenticated: boolean;
  messageCount: number;
  historyDocId: string | null;
  latestIntent: string | null;
  latestConfidence: number | null;
  latestDataSource: ChatDataSource | null;
  latestDetectionMethod: string | null;
  latestLatencyMs: number | null;
  startedAt: string;
  updatedAt: string;
  /** 'live' when sourced from the real backend just now; 'local-fallback' when the live call failed and this row came from this app's own persisted copy instead (never fabricated — see plan §2). */
  source: 'live' | 'local-fallback';
  /**
   * The resolved Customer 360 display label (display_name -> CIF ->
   * masked phone), when this session has either an authoritative
   * backend CIF or a locally-recorded Customer 360 selection — null
   * when neither is known. Distinct from `customerId` above (the raw
   * backend CIF, which may legitimately be null even when this is set).
   */
  resolvedCustomerLabel: string | null;
}

export interface ChatSessionDetail {
  session: ChatSessionSummary;
  messages: ChatMessage[];
}

export interface ChatSendResult {
  chatSessionId: string;
  message: ChatMessage;
}
