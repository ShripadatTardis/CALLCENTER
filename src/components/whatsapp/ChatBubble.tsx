
import React from 'react';
import { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';

type WhatsAppMessage = Database['public']['Tables']['whatsapp_messages']['Row'];

interface ChatBubbleProps {
  message: WhatsAppMessage;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isOutbound = message.direction === 'outbound';
  
  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg shadow-sm ${
          isOutbound
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        <div className="break-words">
          <p className="text-sm">{message.message_body}</p>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={`text-xs ${isOutbound ? 'text-blue-100' : 'text-gray-500'}`}>
            {isOutbound ? message.to_number : message.from_number}
          </span>
          <span className={`text-xs ${isOutbound ? 'text-blue-100' : 'text-gray-500'}`}>
            {format(new Date(message.timestamp), 'HH:mm')}
          </span>
        </div>
        {message.status && (
          <div className="mt-1">
            <span className={`text-xs ${isOutbound ? 'text-blue-200' : 'text-gray-400'}`}>
              {message.status}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
