import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus, MessageCircle } from 'lucide-react';
import { useChatSession } from '@/hooks/chat/useChatSession';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatIdentitySelector } from '@/components/chat/ChatIdentitySelector';
import type { SendChatMessageOptions } from '@/services/chat/chatService';

const ChatConsole: React.FC = () => {
  const {
    messages,
    isSending,
    sendError,
    notPersisted,
    hasActiveSession,
    sessionId,
    boundAgentId,
    boundAgentName,
    customerId,
    contactId,
    send,
    retry,
    startNewChat,
  } = useChatSession();
  const endRef = useRef<HTMLDivElement>(null);
  const [identity, setIdentity] = useState<SendChatMessageOptions>({});
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const lastMessage = messages[messages.length - 1];
  const lastFailed = Boolean(sendError) && lastMessage?.role === 'user';

  const handleSend = (text: string) => {
    // Identity is only ever meaningful on the first message — once a
    // session is bound, useChatSession's send() only forwards session_id
    // regardless of what's passed here, but we still stop passing stale
    // operator input once bound so it's clear from this call site alone.
    void send(text, hasActiveSession ? undefined : identity);
  };

  const handleNewChat = () => {
    startNewChat();
    setIdentity({});
    setResetKey((k) => k + 1);
  };

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-4 space-y-2 flex flex-col" style={{ height: 'calc(100vh - 44px)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <ChatIdentitySelector
              isBound={hasActiveSession}
              boundAgentName={boundAgentName ?? boundAgentId}
              sessionId={sessionId}
              resolvedCustomerId={customerId}
              resolvedContactId={contactId}
              onIdentityChange={({ displayLabel: _displayLabel, ...next }) => setIdentity(next)}
              resetKey={resetKey}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
            onClick={handleNewChat}
            disabled={messages.length === 0}
          >
            <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
            New Chat
          </Button>
        </div>

        <Card className="flex-1 min-h-0 flex flex-col bg-card border-border">
          <CardHeader className="py-2 border-b border-border">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageCircle className="h-3.5 w-3.5" />
              Conversation {hasActiveSession && <span className="text-xs text-muted-foreground font-normal">(active session)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 pt-3">
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
                  <MessageCircle className="w-10 h-10 mb-3 text-gray-300" />
                  <p className="text-sm">No messages yet. Send your first message to start a conversation.</p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <ChatBubble
                    key={m.id}
                    message={m}
                    failed={lastFailed && i === messages.length - 1}
                    notPersisted={notPersisted && i === messages.length - 1}
                    onRetry={lastFailed && i === messages.length - 1 ? retry : undefined}
                  />
                ))
              )}
              {isSending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-4 py-2.5 text-sm text-gray-500">
                    AI is typing…
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {sendError && (
              <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {sendError}
              </div>
            )}

            <div className="mt-3 pt-3 border-t">
              <ChatComposer onSend={handleSend} disabled={isSending} />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ChatConsole;
