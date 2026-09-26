
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { WhatsAppDashboard } from '@/components/whatsapp/WhatsAppDashboard';

const WhatsAppHub: React.FC = () => {
  return (
    <Layout>
      <div className="bg-background min-h-full p-3">
        <WhatsAppDashboard />
      </div>
    </Layout>
  );
};

export default WhatsAppHub;
