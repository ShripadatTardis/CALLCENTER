import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { getFrontendRatioDefinition } from '@/lib/ratios/ratioFrontendRegistry';
import { useRatioFilterState } from '@/lib/ratios/ratioFilterState';
import { useRatioBreakdown, useRatioDrivers, useRatioInteractions, useRatioSummary, useRatioTrend } from '@/hooks/analytics/useRatio';
import { RatioHero } from '@/components/ratios/RatioHero';
import { RatioTrend } from '@/components/ratios/RatioTrend';
import { FilterContextBar } from '@/components/ratios/FilterContextBar';
import { CompareControl } from '@/components/ratios/CompareControl';
import { BreakdownSelector } from '@/components/ratios/BreakdownSelector';
import { BreakdownTable } from '@/components/ratios/BreakdownTable';
import { DriverPanel } from '@/components/ratios/DriverPanel';
import { InteractionTable } from '@/components/ratios/InteractionTable';

const INTERACTIONS_PAGE_SIZE = 25;

/**
 * ONE generic Ratio Explorer shell (spec §12) — the ratio ID from the
 * route determines its definition; this is never duplicated into 21
 * separate page components. Journey per spec §3:
 * Ratio -> Trend -> Breakdown -> Driver -> Interactions -> Evidence -> Action.
 *
 * Session R2: drill dimensions/driver availability now come from the
 * frontend registry's declared* fields (set from the real backend
 * registry, kept in sync by inspection) instead of an R1 family-based
 * guess — the API independently re-validates every request regardless.
 */
const RatioExplorer: React.FC = () => {
  const { ratioId } = useParams<{ ratioId: string }>();
  const navigate = useNavigate();
  const { filters, setFilter, clearFilter, popDrillLayer } = useRatioFilterState();
  const [interactionsPage, setInteractionsPage] = useState(1);

  const definition = ratioId ? getFrontendRatioDefinition(ratioId) : null;

  const summaryQuery = useRatioSummary(ratioId, filters);
  const trendQuery = useRatioTrend(ratioId, filters);
  const breakdownQuery = useRatioBreakdown(ratioId, filters.breakdown, filters);
  const driversQuery = useRatioDrivers(ratioId, filters, Boolean(filters.breakdownValue));
  const hasDrillLayer = Boolean(filters.breakdown || filters.breakdownValue || filters.driver);
  const interactionsQuery = useRatioInteractions(ratioId, filters, interactionsPage, INTERACTIONS_PAGE_SIZE, hasDrillLayer);

  // Invalid ratio ID — handled cleanly (spec §24 item 7), never a blank/broken page.
  if (!ratioId || !definition) {
    return (
      <Layout>
        <div className="min-h-full bg-background p-4 space-y-3 text-foreground">
          <Button variant="outline" size="sm" onClick={() => navigate('/ratios')}>
            ← All Ratios
          </Button>
          <div className="border border-border rounded-md p-8 text-center text-sm text-muted-foreground bg-card/40">
            "{ratioId}" is not a known ratio.
          </div>
        </div>
      </Layout>
    );
  }

  const hasBreakdownValue = Boolean(filters.breakdown && filters.breakdownValue);

  return (
    <Layout>
      <div className="min-h-full bg-background p-4 space-y-3 text-foreground">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="outline" size="sm" onClick={() => navigate('/ratios')}>
              ← All Ratios
            </Button>
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground truncate min-w-0">
              <button type="button" onClick={() => navigate('/ratios')} className="hover:text-foreground hover:underline">
                Ratios
              </button>
              <span className="mx-1.5">›</span>
              <span className="text-foreground">{definition.name}</span>
            </nav>
            {hasDrillLayer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  popDrillLayer();
                  setInteractionsPage(1);
                }}
              >
                ← Back
              </Button>
            )}
          </div>
          <CompareControl />
        </div>

        <FilterContextBar
          filters={filters}
          onRangeChange={(range) => setFilter('range', range)}
          onRemove={(key) => clearFilter(key)}
        />

        <RatioHero
          definition={definition}
          summary={summaryQuery.data}
          isLoading={summaryQuery.isLoading}
          isError={summaryQuery.isError}
        />

        <RatioTrend trend={trendQuery.data} isLoading={trendQuery.isLoading} />

        <section className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-[13px] font-semibold text-foreground px-0.5">Breakdown</h2>
            <BreakdownSelector
              dimensions={definition.declaredDrillDimensions}
              selected={filters.breakdown}
              onChange={(d) => {
                setFilter('breakdown', d);
                clearFilter('breakdownValue');
                setInteractionsPage(1);
              }}
            />
          </div>
          {filters.breakdown && (
            <BreakdownTable
              breakdown={breakdownQuery.data}
              isLoading={breakdownQuery.isLoading}
              onSelectRow={(value) => {
                setFilter('breakdownValue', value);
                setInteractionsPage(1);
              }}
            />
          )}
        </section>

        {hasBreakdownValue && definition.declaredDriverDimension && (
          <DriverPanel drivers={driversQuery.data} isLoading={driversQuery.isLoading} hasDriverDimension />
        )}

        {hasDrillLayer && (
          <InteractionTable
            interactions={interactionsQuery.data}
            isLoading={interactionsQuery.isLoading}
            page={interactionsPage}
            onPageChange={setInteractionsPage}
          />
        )}
      </div>
    </Layout>
  );
};

export default RatioExplorer;
