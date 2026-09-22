import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { FlowEditor } from '@/components/orchestrator/FlowEditor';

const OrchestratorNew: React.FC = () => {
  return (
    <Layout>
      <FlowEditor />
    </Layout>
  );
};

export default OrchestratorNew;
