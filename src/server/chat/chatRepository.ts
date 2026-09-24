import type { ChatMessageRecord, ChatSessionRecord, NewChatMessageInput } from './types.js';

/**
 * The persistent Chat repository — a logical interface, per
 * docs/CALL_CENTRE_SESSION4_5_CHAT_PLAN.md §6. api/chat/*.ts routes only
 * depend on this interface, never on Supabase directly.
 * supabaseChatRepository.ts is this deployment's current adapter and
 * the only file in this domain layer allowed to import
 * `@supabase/supabase-js`.
 */
export interface ChatRepository {
  /** Idempotent on upstreamSessionId — creating an already-known session just touches last_activity_at. */
  createOrTouchSession(upstreamSessionId: string, now: string, createdBy: string | null): Promise<ChatSessionRecord>;

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
}
