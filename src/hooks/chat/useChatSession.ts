import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { closeChatSession, sendChatMessage, type SendChatMessageOptions } from '@/services/chat/chatService';
import { isApiError } from '@/services/transport/errors';
import type { ChatMessage } from '@/types/chat';

/**
 * Live Chat Console session state — Session 5.1 amendment. agent_id (and
 * customer/contact/phone context, when known) is now REALLY sent on the
 * first turn and bound server-side; every turn after that reuses only
 * the session_id — the agent selection is locked once a session exists
 * (Chat_Mode_API.docx: "agent_id is bound on the first message and
 * ignored afterwards"). No sessionStorage mirror: conversations are
 * durably persisted server-side, so a refreshed console simply starts a
 * fresh view; the prior conversation remains reachable via Chat Logs.
 */
export function useChatSession() {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [upstreamSessionId, setUpstreamSessionId] = useState<string | undefined>(undefined);
  const [chatSessionId, setChatSessionId] = useState<string | undefined>(undefined);
  const [boundAgentId, setBoundAgentId] = useState<string | null>(null);
  const [boundAgentName, setBoundAgentName] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notPersisted, setNotPersisted] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [pendingIdentity, setPendingIdentity] = useState<SendChatMessageOptions | undefined>(undefined);

  const send = useCallback(
    async (text: string, identity?: SendChatMessageOptions) => {
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
      setPendingIdentity(identity);

      try {
        // identity (agent/customer/contact/phone) is only ever supplied
        // by the caller on the FIRST message (no upstreamSessionId yet)
        // — sendChatMessage itself also enforces this, this is belt and
        // suspenders since ChatConsole disables the selector once bound.
        const result = await sendChatMessage(role, trimmed, upstreamSessionId, identity);
        setMessages((prev) => [...prev, result.message]);
        setUpstreamSessionId(result.raw.session_id);
        setBoundAgentId(result.raw.agent_id ?? null);
        setBoundAgentName(result.raw.agent_name ?? null);
        setCustomerId(result.raw.customer_id ?? null);
        setContactId(result.raw.contact_id ?? null);
        if (result.chatSessionId) setChatSessionId(result.chatSessionId);
        setNotPersisted(result.chatSessionId === '');
        setPendingText(null);
        setPendingIdentity(undefined);
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
    if (pendingText) void send(pendingText, pendingIdentity);
  }, [pendingText, pendingIdentity, send]);

  const startNewChat = useCallback(() => {
    const sessionToClose = chatSessionId;
    setMessages([]);
    setUpstreamSessionId(undefined);
    setChatSessionId(undefined);
    setBoundAgentId(null);
    setBoundAgentName(null);
    setCustomerId(null);
    setContactId(null);
    setSendError(null);
    setNotPersisted(false);
    setPendingText(null);
    setPendingIdentity(undefined);
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
    /** The agent actually bound to this session by the backend, once known — distinct from the operator's pre-send selection. */
    boundAgentId,
    boundAgentName,
    customerId,
    contactId,
    send,
    retry,
    startNewChat,
  };
}
