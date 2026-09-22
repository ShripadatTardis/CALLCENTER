import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { IntegrationsManager } from '@/components/orchestrator/IntegrationsManager';

const OrchestratorIntegrations: React.FC = () => {
  return (
    <Layout>
      <IntegrationsManager />
    </Layout>
  );
};

export default OrchestratorIntegrations;
