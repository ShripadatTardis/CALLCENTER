
import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { FormattingHub as FormattingHubComponent } from '@/components/formatting/FormattingHub';

const FormattingHub: React.FC = () => {
  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) — Pattern B. */}
      <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground">
        <FormattingHubComponent />
      </div>
    </Layout>
  );
};

export default FormattingHub;
