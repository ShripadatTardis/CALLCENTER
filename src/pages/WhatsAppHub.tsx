
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { WhatsAppDashboard } from '@/components/whatsapp/WhatsAppDashboard';

const WhatsAppHub: React.FC = () => {
  return (
    <Layout>
      <div className="p-6 pb-0">
        <PageHeader
          pillar="Integrate"
          title="WhatsApp Hub"
          description="Connect VoiceForce to the WhatsApp channel."
        />
      </div>
      <WhatsAppDashboard />
    </Layout>
  );
};

export default WhatsAppHub;
