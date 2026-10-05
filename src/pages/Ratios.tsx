import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { RatioCatalogue } from '@/components/ratios/RatioCatalogue';
import type { DetailNavigationState } from '@/lib/detailOrigin';
import { typography } from '@/lib/typography';

/**
 * /ratios — Ratio catalogue (Session R1). Additive page under the
 * existing Measure pillar; does not touch Analytics/Reports.
 *
 * Dashboard IA session — "Explore all ratios →" deliberately lands here
 * with no ratio preselected (spec §8), but it IS still a Dashboard-
 * initiated journey, so it still needs a way back (spec §10).
 */
const Ratios: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromDashboard = (location.state as DetailNavigationState | null)?.origin === 'dashboard';
  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) —
          Pattern B: root is the single scroll region. */}
      <div className="h-full min-h-0 overflow-y-auto bg-background p-4 space-y-3 text-foreground">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className={typography.pageTitle}>Ratios</h1>
            <p className={`${typography.pageDescription} mt-0.5`}>
              Investigate a KPI from its current value down to the interactions behind it.
            </p>
          </div>
          {fromDashboard && (
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              ← Back to Dashboard
            </Button>
          )}
        </div>
        <RatioCatalogue />
      </div>
    </Layout>
  );
};

export default Ratios;
