
import React from 'react';
import { WhatsAppSidebar } from './WhatsAppSidebar';
import { WhatsAppChat } from './WhatsAppChat';

export const WhatsAppDashboard: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
      <div className="lg:col-span-1">
        <WhatsAppSidebar />
      </div>
      <div className="lg:col-span-2">
        <WhatsAppChat />
      </div>
    </div>
  );
};
