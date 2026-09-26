
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { FormattingHub as FormattingHubComponent } from '@/components/formatting/FormattingHub';

const FormattingHub: React.FC = () => {
  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground">
        <FormattingHubComponent />
      </div>
    </Layout>
  );
};

export default FormattingHub;
