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
  /**
   * Session 13.1 (DEC-CUST-03) — the real Customer 360 internal id
   * (`customers.id`), distinct from `customerId` above (the backend's
   * own CIF/customer identifier, a different value). Already resolved
   * server-side via call_center_chat_customer_links; previously
   * discarded before reaching the frontend. Null whenever this session
   * has no resolved Customer 360 link — never inferred from display text.
   */
  customer360Id: string | null;
  /**
   * Session 13.2 (DEC-CHAT-01) — real, locally-recorded campaign linkage
   * (set only for sessions initiated from Chat Console's Campaign
   * Customer mode — Session 11.9B). `campaignId`/`campaignTargetId` are
   * stable ids; `campaignName` is resolved through the one existing
   * authoritative Campaign source server-side (never fabricated). All
   * three are null when this session has no campaign link — including
   * every session discovered purely via the external Chat API's live
   * list, which has no campaign concept of its own.
   */
  campaignId: string | null;
  campaignTargetId: string | null;
  campaignName: string | null;
  /**
   * Session 13.2 (DEC-CHAT-01) — VoiceForce-local Trial/Test isolation
   * marker (Session 11.9B), set once at session creation. Already
   * consumed internally by chatInteractionSource.ts to exclude Trial
   * sessions from Customer 360 materialization; previously invisible in
   * the UI. `null` (not `false`) when no local session record exists at
   * all for this upstream id — distinct from a confirmed-non-trial
   * session, never collapsed to a default.
   */
  isTrial: boolean | null;
}

export interface ChatSessionDetail {
  session: ChatSessionSummary;
  messages: ChatMessage[];
}

export interface ChatSendResult {
  chatSessionId: string;
  message: ChatMessage;
}
