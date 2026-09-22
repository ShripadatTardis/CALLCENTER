
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { WhatsAppDashboard } from '@/components/whatsapp/WhatsAppDashboard';

const WhatsAppHub: React.FC = () => {
  return (
    <Layout>
      <WhatsAppDashboard />
    </Layout>
  );
};

export default WhatsAppHub;
