
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { WhatsAppDashboard } from '@/components/whatsapp/WhatsAppDashboard';

const WhatsAppHub: React.FC = () => {
  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) — Pattern B. */}
      <div className="bg-background h-full min-h-0 overflow-y-auto p-3">
        <WhatsAppDashboard />
      </div>
    </Layout>
  );
};

export default WhatsAppHub;
