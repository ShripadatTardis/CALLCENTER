import type { ChatMessageRecord, ChatSessionRecord, NewChatMessageInput, NewChatSessionIdentity } from './types.js';

/**
 * The persistent Chat repository — a logical interface, per
 * docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md §6. api/chat/*.ts routes only
 * depend on this interface, never on Supabase directly.
 * supabaseChatRepository.ts is this deployment's current adapter and
 * the only file in this domain layer allowed to import
 * `@supabase/supabase-js`.
 */
export interface ChatRepository {
  /**
   * Idempotent on upstreamSessionId — creating an already-known session
   * just touches last_activity_at and non-destructively refreshes any
   * newly-known identity fields (§2/§5 amendment — a later turn's null
   * never erases an earlier turn's known value).
   */
  createOrTouchSession(
    upstreamSessionId: string,
    now: string,
    createdBy: string | null,
    identity?: NewChatSessionIdentity,
  ): Promise<ChatSessionRecord>;

  getSessionByUpstreamId(upstreamSessionId: string): Promise<ChatSessionRecord | null>;

  getSession(id: string): Promise<ChatSessionRecord | null>;

  /** Appends one message, assigns its sequence server-side, and recomputes the session's denormalized fields (plan §7 — recompute, not increment). */
  appendMessage(chatSessionId: string, input: NewChatMessageInput): Promise<ChatMessageRecord>;

  closeSession(id: string): Promise<void>;

  listSessions(opts: { page?: number; pageSize?: number }): Promise<{
    rows: ChatSessionRecord[];
    totalCount: number;
  }>;

  listMessages(chatSessionId: string): Promise<ChatMessageRecord[]>;

  /**
   * Batch, read-only lookup of each upstream session's linked Customer
   * 360 customer (via chat_sessions.customer_id), for Chat Logs/Session
   * Detail display resolution only — never used for authorization,
   * which stays keyed on agent_id -> category -> role.
   */
  getCustomerLinks(upstreamSessionIds: string[]): Promise<
    Record<string, { customerId: string; displayName: string | null; sourceCustomerRef: string | null; primaryPhoneMasked: string | null }>
  >;

  /**
   * Session 11.9B — Trial/Test isolation. Batch, read-only lookup of
   * each upstream session's local is_trial marker, for every session
   * that exists locally regardless of whether it has a Customer 360
   * link — used by chatInteractionSource.ts to exclude Trial sessions
   * from Customer 360 materialization before Voice/Chat reconciliation
   * ever sees them. Never used for authorization.
   */
  getTrialFlags(upstreamSessionIds: string[]): Promise<Record<string, boolean>>;
}
