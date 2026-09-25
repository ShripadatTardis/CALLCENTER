import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { closeChatSession, sendChatMessage } from '@/services/chat/chatService';
import { isApiError } from '@/services/transport/errors';
import type { ChatMessage } from '@/types/chat';

/**
 * Live Chat Console session state — plan §9. No sessionStorage mirror:
 * conversations are durably persisted server-side (plan §5), so a
 * refreshed console simply starts a fresh view; the prior conversation
 * remains reachable via Chat Logs.
 */
export function useChatSession() {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [upstreamSessionId, setUpstreamSessionId] = useState<string | undefined>(undefined);
  const [chatSessionId, setChatSessionId] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notPersisted, setNotPersisted] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      const userMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsSending(true);
      setSendError(null);
      setPendingText(trimmed);

      try {
        const result = await sendChatMessage(role, trimmed, upstreamSessionId);
        setMessages((prev) => [...prev, result.message]);
        setUpstreamSessionId(result.raw.session_id);
        if (result.chatSessionId) setChatSessionId(result.chatSessionId);
        setNotPersisted(result.chatSessionId === '');
        setPendingText(null);
      } catch (err) {
        const message = isApiError(err) ? err.message : err instanceof Error ? err.message : 'Failed to send message';
        setSendError(message);
      } finally {
        setIsSending(false);
      }
    },
    [isSending, role, upstreamSessionId],
  );

  const retry = useCallback(() => {
    if (pendingText) void send(pendingText);
  }, [pendingText, send]);

  const startNewChat = useCallback(() => {
    const sessionToClose = chatSessionId;
    setMessages([]);
    setUpstreamSessionId(undefined);
    setChatSessionId(undefined);
    setSendError(null);
    setNotPersisted(false);
    setPendingText(null);
    if (sessionToClose) {
      void closeChatSession(role, sessionToClose).catch((err) => {
        console.error('Failed to close previous chat session:', err);
      });
    }
  }, [chatSessionId, role]);

  return {
    messages,
    isSending,
    sendError,
    notPersisted,
    hasActiveSession: Boolean(upstreamSessionId),
    /** The real /chat session_id, once the first turn has succeeded — null until then. Never fabricated. */
    sessionId: upstreamSessionId ?? null,
    send,
    retry,
    startNewChat,
  };
}
