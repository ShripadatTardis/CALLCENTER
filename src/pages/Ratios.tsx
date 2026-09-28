import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { RatioCatalogue } from '@/components/ratios/RatioCatalogue';

/**
 * /ratios — Ratio catalogue (Session R1). Additive page under the
 * existing Measure pillar; does not touch Analytics/Reports.
 */
const Ratios: React.FC = () => {
  return (
    <Layout>
      <div className="min-h-full bg-background p-4 space-y-3 text-foreground">
        <div>
          <h1 className="text-base font-semibold text-foreground">Ratios</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Investigate a KPI from its current value down to the interactions behind it.
          </p>
        </div>
        <RatioCatalogue />
      </div>
    </Layout>
  );
};

export default Ratios;
