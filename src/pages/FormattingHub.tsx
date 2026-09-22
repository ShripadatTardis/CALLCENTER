
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { FormattingHub as FormattingHubComponent } from '@/components/formatting/FormattingHub';

const FormattingHub: React.FC = () => {
  return (
    <Layout>
      <FormattingHubComponent />
    </Layout> 
  );
};

export default FormattingHub;
