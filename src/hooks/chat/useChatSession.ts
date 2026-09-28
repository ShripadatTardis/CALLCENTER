import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { closeChatSession, sendChatMessage, type SendChatMessageOptions } from '@/services/chat/chatService';
import { createCampaignChatExecution, markCampaignChatExecutionSent } from '@/services/campaigns/campaignsService';
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
  /** Session 11.9A — set once a Campaign Customer chat's execution row exists, so the outcome can be reported back after the real chat send resolves. */
  const [campaignExecutionId, setCampaignExecutionId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState<string | null>(null);

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
      setIsSending(true);
      setSendError(null);
      setPendingText(trimmed);
      setPendingIdentity(identity);

      // Session 11.9A — Campaign Customer mode. Only meaningful on the
      // first turn (no upstreamSessionId yet); mirrors the Voice batch
      // path's create-execution-before-triggering order
      // (campaignRunner.ts) so campaign_targets.attempt_count/status
      // genuinely reflects this attempt even if the send itself then
      // fails. If the execution can't be created, the chat is NOT sent
      // — a Campaign Customer chat must be a real, structural link to
      // the target, never a label attached after the fact.
      let executionId: string | null = null;
      if (!upstreamSessionId && identity?.campaignTargetId) {
        try {
          const execution = await createCampaignChatExecution(identity.campaignTargetId, role);
          executionId = execution.id;
          setCampaignExecutionId(execution.id);
          setCampaignName(identity.campaignName ?? null);
        } catch (err) {
          const message = isApiError(err) ? err.message : err instanceof Error ? err.message : 'Failed to record campaign attempt';
          setSendError(`Could not start campaign chat: ${message}`);
          setIsSending(false);
          setPendingText(null);
          setPendingIdentity(undefined);
          return;
        }
      }

      setMessages((prev) => [...prev, userMessage]);

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

        // Report the outcome back for the campaign_executions row. Only
        // when a local chat_sessions row actually exists (chatSessionId
        // truthy) — that row is the FK target for the execution's
        // chat_session_id. A rare "chat succeeded but local persistence
        // failed" case is left as an honest gap (execution stays
        // 'triggering') rather than misreported as either outcome —
        // see docs/SESSION_11_9A_INTEGRATED_INITIATE_CHAT.md.
        if (executionId && result.chatSessionId) {
          void markCampaignChatExecutionSent(
            { targetId: identity!.campaignTargetId!, executionId, chatSessionId: result.chatSessionId },
            role,
          ).catch((err) => console.error('Failed to mark campaign chat execution sent:', err));
        }
      } catch (err) {
        const message = isApiError(err) ? err.message : err instanceof Error ? err.message : 'Failed to send message';
        setSendError(message);
        if (executionId) {
          void markCampaignChatExecutionSent(
            { targetId: identity!.campaignTargetId!, executionId, errorDetail: message },
            role,
          ).catch((markErr) => console.error('Failed to mark campaign chat execution failed:', markErr));
        }
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
    setCampaignExecutionId(null);
    setCampaignName(null);
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
    /** Session 11.9A — set once a Campaign Customer chat's execution row exists; null for Standalone/Trial. */
    campaignExecutionId,
    campaignName,
    send,
    retry,
    startNewChat,
  };
}
