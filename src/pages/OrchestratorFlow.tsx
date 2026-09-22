import React from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { FlowEditor } from '@/components/orchestrator/FlowEditor';

const OrchestratorFlow: React.FC = () => {
  const { flowId } = useParams<{ flowId: string }>();

  return (
    <Layout>
      <FlowEditor flowId={flowId} />
    </Layout>
  );
};

export default OrchestratorFlow;
