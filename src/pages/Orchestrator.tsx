import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { FlowLibrary } from '@/components/orchestrator/FlowLibrary';

const Orchestrator: React.FC = () => {
  return (
    <Layout>
      <FlowLibrary />
    </Layout>
  );
};

export default Orchestrator;
