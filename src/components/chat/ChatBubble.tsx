import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { ChatMessageContent } from './ChatMessageContent';
import { formatFractionAsPercent, formatTimestamp } from '@/lib/format';
import type { ChatMessage } from '@/types/chat';

/**
 * A new, generic Chat bubble — deliberately NOT a reuse of
 * src/components/whatsapp/ChatBubble.tsx, which is WhatsApp-message
 * shaped and has no formatting logic (plan §3/§10).
 */
interface ChatBubbleProps {
  message: ChatMessage;
  failed?: boolean;
  notPersisted?: boolean;
  onRetry?: () => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, failed, notPersisted, onRetry }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] md:max-w-[70%] px-4 py-2.5 rounded-lg shadow-sm ${
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
        } ${failed ? 'border-2 border-destructive' : ''}`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
        ) : (
          <ChatMessageContent text={message.text} />
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={`text-xs ${isUser ? 'text-blue-100' : 'text-gray-500'}`}>
            {formatTimestamp(message.timestamp)}
          </span>
          {notPersisted && (
            <span className="text-xs text-amber-600 font-medium">Not saved</span>
          )}
        </div>

        {failed && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2 h-7">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Retry
          </Button>
        )}

        {!isUser && message.metadata && (
          <Collapsible className="mt-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown className="h-3 w-3 mr-1" />
                Details
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 text-xs text-gray-600 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">{message.metadata.dataSource}</Badge>
                {message.metadata.intent && <span>Intent: {message.metadata.intent}</span>}
                {message.metadata.confidence !== null && (
                  <span>Confidence: {formatFractionAsPercent(message.metadata.confidence)}</span>
                )}
                <span>Authenticated: {message.metadata.authenticated ? 'Yes' : 'No'}</span>
                {message.metadata.detectionMethod && <span>Detection: {message.metadata.detectionMethod}</span>}
                {message.metadata.latencyMs !== null && <span>Latency: {message.metadata.latencyMs}ms</span>}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
};
