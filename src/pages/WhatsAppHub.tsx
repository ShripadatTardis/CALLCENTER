
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { WhatsAppDashboard } from '@/components/whatsapp/WhatsAppDashboard';

const WhatsAppHub: React.FC = () => {
  return (
    <Layout>
      <div className="bg-slate-950 min-h-full p-3">
        <WhatsAppDashboard />
      </div>
    </Layout>
  );
};

export default WhatsAppHub;
