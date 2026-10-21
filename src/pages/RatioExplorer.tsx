import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
import type { DetailNavigationState } from '@/lib/detailOrigin';
import { typography } from '@/lib/typography';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { useCmaOwnedMeasure } from '@/hooks/cma/useCmaOwnedMeasure';
import { isCmaMeasureValue, cmaMeasureUnavailableReason } from '@/types/cma';
import type { RatioSummaryDto } from '@/types/ratio';

/**
 * Session 10 — the subset of ratio ids CMA currently owns a calculation
 * path for (3 CMA_NATIVE + 3 CMA_PROVISIONAL). Mirrors Dashboard's own
 * CMA_BACKED_RATIO_MEASURES/CMA_PROVISIONAL_RATIO_MEASURES maps exactly
 * — the same canonical ids, never a different mapping per screen.
 */
const CMA_OWNED_RATIO_MEASURES: Record<string, string> = {
  resolution_rate: 'CANON-RES-RATE',
  successful_resolution_time: 'CANON-SUCCESSFUL-RES-TIME',
  authentication_success_rate: 'CANON-AUTH-SUCCESS-RATE',
  fcr: 'CANON-FIRST-CONTACT-RES',
  escalation_rate: 'CANON-ESC-RATE',
  aht: 'CANON-AVG-HANDLE-TIME',
};

function rangeToCmaWindow(range: string | undefined): { from: string; to: string } {
  const days: Record<string, number> = { '1h': 1, '6h': 1, '12h': 1, '24h': 1, '7d': 7, '30d': 30 };
  const windowDays = days[range ?? '24h'] ?? 1;
  const now = new Date();
  const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

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
  const location = useLocation();
  // Session (Dashboard IA) — Dashboard deep-links here with navigation
  // state `{ origin: 'dashboard' }` (src/lib/detailOrigin.ts's existing
  // mechanism, already used by Agent/Customer/Campaign Detail). Entering
  // via the Measure sidebar leaves this undefined — the existing
  // "← All Ratios"/breadcrumb behavior is completely unchanged in that
  // case, this only ADDS a Dashboard escape route when it's genuinely
  // the origin.
  const fromDashboard = (location.state as DetailNavigationState | null)?.origin === 'dashboard';
  const { filters, setFilter, clearFilter, popDrillLayer } = useRatioFilterState();
  const [interactionsPage, setInteractionsPage] = useState(1);

  const definition = ratioId ? getFrontendRatioDefinition(ratioId) : null;

  // Session 10 — CMA now owns this ratio's headline number for the 6 CMA-eligible
  // ids, REPLACING the legacy summary fetch entirely (never run alongside it), but
  // only when every active filter is one CMA's engine actually supports (agent/
  // channel/campaign) — trend/breakdown/driver/comparison have no CMA equivalent
  // today (a real, structural gap: CMA returns a single population snapshot, never
  // a time series or arbitrary-dimension drill-down) and stay legacy-sourced,
  // disclosed honestly rather than silently forced into a shape that doesn't fit.
  const { user: ratioExplorerUser } = useAuth();
  const cmaEligibleMeasureId = ratioId ? CMA_OWNED_RATIO_MEASURES[ratioId] : undefined;
  const hasCmaIncompatibleFilter = Boolean(filters.breakdown || filters.breakdownValue || filters.driver || filters.domain || filters.intent || filters.direction);
  const useCmaHero = Boolean(cmaEligibleMeasureId) && !hasCmaIncompatibleFilter && hasPermission(ratioExplorerUser, 'cma.evaluate');
  const cmaHeroWindow = rangeToCmaWindow(filters.range);
  const cmaHero = useCmaOwnedMeasure(
    useCmaHero, cmaEligibleMeasureId ?? '',
    useCmaHero ? { ...cmaHeroWindow, agent: filters.agent, ...(filters.channel ? {} : {}) } : undefined,
  );
  const cmaHeroResult = isCmaMeasureValue(cmaHero.data?.value) ? cmaHero.data?.value : undefined;
  const cmaHeroSummary: RatioSummaryDto | undefined = ratioId && cmaEligibleMeasureId ? {
    ratioId,
    availability: 'direct',
    runtimeState: cmaHeroResult?.kind === 'value' ? 'live' : cmaHeroResult ? 'no_data' : 'live',
    httpStatus: null,
    value: cmaHeroResult?.kind === 'value' ? cmaHeroResult.value : null,
    unit: cmaHeroResult?.kind === 'value' ? cmaHeroResult.unit : (definition?.unit ?? 'percent'),
    numerator: null,
    denominator: null,
    population: null,
    comparison: null,
    dataFreshness: new Date().toISOString(),
    unavailableReason: cmaHeroResult && cmaHeroResult.kind !== 'value'
      ? (cmaHero.data?.ownershipMode === 'CMA_PROVISIONAL' ? `(CMA provisional) ${cmaMeasureUnavailableReason(cmaHeroResult)}` : cmaMeasureUnavailableReason(cmaHeroResult))
      : (cmaHero.data?.ownershipMode === 'CMA_PROVISIONAL' ? 'Source: CMA (provisional — business definition not yet approved)' : null),
    filtersEcho: filters,
    populationCapped: false,
    trueTotalRecords: null,
  } : undefined;

  const legacySummaryQuery = useRatioSummary(useCmaHero ? undefined : ratioId, filters);
  const summaryQuery = useCmaHero
    ? { data: cmaHeroSummary, isLoading: cmaHero.isLoading, isError: cmaHero.isError, refetch: cmaHero.refetch }
    : legacySummaryQuery;
  const trendQuery = useRatioTrend(ratioId, filters);
  const breakdownQuery = useRatioBreakdown(ratioId, filters.breakdown, filters);
  const driversQuery = useRatioDrivers(ratioId, filters, Boolean(filters.breakdownValue));
  const hasDrillLayer = Boolean(filters.breakdown || filters.breakdownValue || filters.driver);
  const interactionsQuery = useRatioInteractions(ratioId, filters, interactionsPage, INTERACTIONS_PAGE_SIZE, hasDrillLayer);

  // Invalid ratio ID — handled cleanly (spec §24 item 7), never a blank/broken page.
  if (!ratioId || !definition) {
    return (
      <Layout>
        <div className="h-full min-h-0 overflow-y-auto bg-background p-4 space-y-3 text-foreground">
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
      {/* App-wide viewport-framing correction (follow-up to Session 15) —
          Pattern B: root is the single scroll region. */}
      <div className="h-full min-h-0 overflow-y-auto bg-background p-4 space-y-3 text-foreground">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {fromDashboard && (
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                ← Back to Dashboard
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/ratios')}>
              ← All Ratios
            </Button>
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground truncate min-w-0">
              {fromDashboard && (
                <>
                  <span>Dashboard</span>
                  <span className="mx-1.5">/</span>
                </>
              )}
              <span>Ratios</span>
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
          onRetry={() => summaryQuery.refetch()}
        />

        <RatioTrend trend={trendQuery.data} isLoading={trendQuery.isLoading} onRetry={() => trendQuery.refetch()} />

        <section className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className={`${typography.cardTitle} px-0.5`}>Breakdown</h2>
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
              onRetry={() => breakdownQuery.refetch()}
            />
          )}
        </section>

        {hasBreakdownValue && definition.declaredDriverDimension && (
          <DriverPanel drivers={driversQuery.data} isLoading={driversQuery.isLoading} hasDriverDimension onRetry={() => driversQuery.refetch()} />
        )}

        {hasDrillLayer && (
          <InteractionTable
            interactions={interactionsQuery.data}
            isLoading={interactionsQuery.isLoading}
            page={interactionsPage}
            onPageChange={setInteractionsPage}
            onRetry={() => interactionsQuery.refetch()}
          />
        )}
      </div>
    </Layout>
  );
};

export default RatioExplorer;
