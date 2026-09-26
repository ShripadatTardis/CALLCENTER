
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { FormattingHub as FormattingHubComponent } from '@/components/formatting/FormattingHub';

const FormattingHub: React.FC = () => {
  return (
    <Layout>
      <div className="bg-slate-950 min-h-full text-slate-200">
        <FormattingHubComponent />
      </div>
    </Layout>
  );
};

export default FormattingHub;
