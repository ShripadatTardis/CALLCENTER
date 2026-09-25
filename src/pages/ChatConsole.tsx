import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus, MessageCircle } from 'lucide-react';
import { useChatSession } from '@/hooks/chat/useChatSession';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatInteractionHeader } from '@/components/chat/ChatInteractionHeader';

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
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [callerName, setCallerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerIdInput, setCustomerIdInput] = useState('');
  const [contactIdInput, setContactIdInput] = useState('');

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
    void send(
      text,
      hasActiveSession
        ? undefined
        : {
            agentId: selectedAgentId || undefined,
            customerId: customerIdInput.trim() || undefined,
            contactId: contactIdInput.trim() || undefined,
            callerName: callerName.trim() || undefined,
            phoneNumber: phoneNumber.trim() || undefined,
          },
    );
  };

  const handleNewChat = () => {
    startNewChat();
    setSelectedAgentId('');
    setCallerName('');
    setPhoneNumber('');
    setCustomerIdInput('');
    setContactIdInput('');
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Chat</h1>
            <p className="text-muted-foreground">
              Start and continue a live AI text conversation — a separate channel from WhatsApp.
            </p>
          </div>
          <Button variant="outline" onClick={handleNewChat} disabled={messages.length === 0}>
            <MessageSquarePlus className="h-4 w-4 mr-1" />
            New Chat
          </Button>
        </div>

        <ChatInteractionHeader
          selectedAgentId={selectedAgentId}
          onAgentChange={setSelectedAgentId}
          sessionId={sessionId}
          isBound={hasActiveSession}
          boundAgentName={boundAgentName ?? boundAgentId}
          callerName={callerName}
          onCallerNameChange={setCallerName}
          phoneNumber={phoneNumber}
          onPhoneNumberChange={setPhoneNumber}
          customerIdInput={customerIdInput}
          onCustomerIdInputChange={setCustomerIdInput}
          contactIdInput={contactIdInput}
          onContactIdInputChange={setContactIdInput}
          resolvedCustomerId={customerId}
          resolvedContactId={contactId}
        />

        <Card className="flex flex-col h-[65vh]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4" />
              Conversation {hasActiveSession && <span className="text-xs text-muted-foreground font-normal">(active session)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0">
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
