
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { WhatsAppDashboard } from '@/components/whatsapp/WhatsAppDashboard';

const WhatsAppHub: React.FC = () => {
  return (
    <Layout>
      <div className="p-3 h-full">
        <WhatsAppDashboard />
      </div>
    </Layout>
  );
};

export default WhatsAppHub;
