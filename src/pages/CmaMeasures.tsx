import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { typography } from '@/lib/typography';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { useQuery } from '@tanstack/react-query';
import { fetchCmaOwnershipMap, fetchCmaOwnedMeasure } from '@/services/cma/cmaEvaluationService';
import { isCmaMeasureValue, cmaMeasureUnavailableReason, type CmaOwnedMeasure, type CmaOwnershipMode } from '@/types/cma';

const MODE_BADGE: Record<CmaOwnershipMode, { variant: 'positive' | 'warning' | 'escalated' | 'default' | 'secondary'; label: string }> = {
  CMA_NATIVE: { variant: 'positive', label: 'Native' },
  CMA_PROVISIONAL: { variant: 'warning', label: 'Provisional' },
  CMA_LEGACY_ADAPTER: { variant: 'warning', label: 'Legacy adapter' },
  CMA_UNAVAILABLE: { variant: 'default', label: 'Unavailable' },
  CMA_NON_AGGREGATE: { variant: 'secondary', label: 'Non-aggregate' },
};

/**
 * Session 10 — Govern → CMA Measures. The read-only register of all 60
 * canonical measures' CMA ownership. Static-only list (one request, no
 * live evaluation per row — see cmaOwnershipResolver.ts's own comment on
 * why); the detail dialog's "Evaluate now" button is the only place a
 * live calculation is ever triggered from this screen, and only on demand.
 */
const CmaMeasures: React.FC = () => {
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CmaOwnedMeasure | null>(null);

  const { data: measures, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['cma', 'ownershipMap'],
    queryFn: fetchCmaOwnershipMap,
  });

  const filtered = useMemo(() => {
    return (measures ?? []).filter((m) => {
      if (modeFilter !== 'all' && m.ownershipMode !== modeFilter) return false;
      if (search && !m.measureName.toLowerCase().includes(search.toLowerCase()) && !m.canonicalMeasureId.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [measures, modeFilter, search]);

  // Summary — independent dimensions, never collapsed into one "completion" score
  // (brief §8, and the user's explicit correction that 60-owned and 22-operational
  // must stay visibly distinct).
  const summary = useMemo(() => {
    const all = measures ?? [];
    const byMode = (m: CmaOwnershipMode) => all.filter((x) => x.ownershipMode === m).length;
    return {
      total: all.length,
      native: byMode('CMA_NATIVE'),
      provisional: byMode('CMA_PROVISIONAL'),
      legacyAdapter: byMode('CMA_LEGACY_ADAPTER'),
      unavailable: byMode('CMA_UNAVAILABLE'),
      nonAggregate: byMode('CMA_NON_AGGREGATE'),
      accuracyVerified: all.filter((x) => x.accuracyStatus === 'verified').length,
      accuracyUnverified: all.filter((x) => x.accuracyStatus === 'unverified').length,
      pendingDefinition: all.filter((x) => x.governanceStatus === 'pending_decision').length,
      screenIntegrated: all.filter((x) => x.consumingScreens.length > 0).length,
    };
  }, [measures]);

  return (
    <Layout>
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex-shrink-0">
          <h1 className={typography.pageTitle}>CMA Measures</h1>
          <p className={`${typography.pageDescription} mt-0.5`}>
            All 60 canonical measures and how the Central Measures Authority currently delivers each one — ownership, governance, and accuracy are separate, independent facts, never combined into one score.
          </p>
        </div>

        <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <SummaryTile label="Total registered" value={summary.total} />
          <SummaryTile label="CMA-native" value={summary.native} />
          <SummaryTile label="Provisional" value={summary.provisional} />
          <SummaryTile label="Legacy/API-backed" value={summary.legacyAdapter} />
          <SummaryTile label="Unavailable" value={summary.unavailable} />
          <SummaryTile label="Non-aggregate" value={summary.nonAggregate} />
          <SummaryTile label="Accuracy verified" value={summary.accuracyVerified} />
          <SummaryTile label="Accuracy unverified" value={summary.accuracyUnverified} />
          <SummaryTile label="Pending definition" value={summary.pendingDefinition} />
          <SummaryTile label="Screen integrated" value={summary.screenIntegrated} />
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <Input
            placeholder="Search by name or canonical ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            uiSize="sm"
            className="w-64 border-border bg-card text-foreground placeholder:text-muted-foreground"
          />
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger uiSize="sm" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ownership modes</SelectItem>
              <SelectItem value="CMA_NATIVE">Native</SelectItem>
              <SelectItem value="CMA_PROVISIONAL">Provisional</SelectItem>
              <SelectItem value="CMA_LEGACY_ADAPTER">Legacy adapter</SelectItem>
              <SelectItem value="CMA_UNAVAILABLE">Unavailable</SelectItem>
              <SelectItem value="CMA_NON_AGGREGATE">Non-aggregate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isError && (
          <QueryErrorBanner
            error={error}
            onRetry={() => void refetch()}
            hasStaleData={(measures?.length ?? 0) > 0}
            isFetching={isFetching}
          />
        )}

        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-border text-left ${typography.tableHeader}`}>
                <th className="px-3 py-2">Measure</th>
                <th className="px-3 py-2">Ownership</th>
                <th className="px-3 py-2">Governance</th>
                <th className="px-3 py-2">Accuracy</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Screens</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">No measures match these filters.</td></tr>
              ) : (
                filtered.map((m) => {
                  const badge = MODE_BADGE[m.ownershipMode];
                  return (
                    <tr
                      key={m.canonicalMeasureId}
                      role="button"
                      tabIndex={0}
                      aria-label={`View details for ${m.measureName}`}
                      className="border-b border-border/60 last:border-0 hover:bg-card cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 focus-visible:-outline-offset-2"
                      onClick={() => setSelected(m)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(m);
                        }
                      }}
                    >
                      <td className={`px-3 py-2 ${typography.tableBody}`}>
                        <div>{m.measureName}</div>
                        <div className={typography.metadata}>{m.canonicalMeasureId}</div>
                      </td>
                      <td className="px-3 py-2"><Badge variant={badge.variant} className="text-xs whitespace-nowrap">{badge.label}</Badge></td>
                      <td className={`px-3 py-2 ${typography.metadata}`}>{m.governanceStatus}</td>
                      <td className={`px-3 py-2 ${typography.metadata}`}>{m.accuracyStatus}</td>
                      <td className={`px-3 py-2 ${typography.metadata}`}>{m.sourceType}</td>
                      <td className={`px-3 py-2 ${typography.metadata}`}>{m.consumingScreens.length > 0 ? m.consumingScreens.join(', ') : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <MeasureDetailDialog measure={selected} onClose={() => setSelected(null)} />}
    </Layout>
  );
};

const SummaryTile: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-md border border-border bg-card px-3 py-2">
    <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
    <div className="text-muted-foreground">{label}</div>
  </div>
);

const MeasureDetailDialog: React.FC<{ measure: CmaOwnedMeasure; onClose: () => void }> = ({ measure, onClose }) => {
  const [evaluated, setEvaluated] = useState(false);
  const liveQuery = useQuery({
    queryKey: ['cma', 'ownership-live', measure.canonicalMeasureId],
    queryFn: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      return fetchCmaOwnedMeasure(measure.canonicalMeasureId, { from: from.toISOString(), to: to.toISOString() });
    },
    enabled: evaluated,
  });
  const badge = MODE_BADGE[measure.ownershipMode];
  const liveResult = isCmaMeasureValue(liveQuery.data?.value) ? liveQuery.data?.value : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{measure.measureName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={typography.metadata}>{measure.canonicalMeasureId}</span>
            <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
          </div>
          <DetailRow label="Governance status" value={measure.governanceStatus} />
          <DetailRow label="Accuracy status" value={measure.accuracyStatus} />
          <DetailRow label="Source type" value={measure.sourceType} />
          <DetailRow label="Source reference" value={measure.sourceReference ?? '—'} />
          <DetailRow label="Calculation version" value={measure.calculationVersion ?? '—'} />
          <DetailRow label="Consuming screens" value={measure.consumingScreens.length > 0 ? measure.consumingScreens.join(', ') : 'None — not a defect, see brief §7'} />
          {measure.unavailableReason && <DetailRow label="Unavailable reason" value={measure.unavailableReason} />}

          {measure.ownershipMode !== 'CMA_UNAVAILABLE' && (
            <div className="pt-2 border-t border-border">
              {!evaluated ? (
                <button
                  type="button"
                  onClick={() => setEvaluated(true)}
                  className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 rounded-sm"
                >
                  Evaluate now (last 30 days, unrestricted window)
                </button>
              ) : liveQuery.isLoading ? (
                <span className="text-xs text-muted-foreground">Evaluating…</span>
              ) : liveResult?.kind === 'value' ? (
                <DetailRow label="Live value (last 30d)" value={`${liveResult.value} ${liveResult.unit}`} />
              ) : liveResult ? (
                <DetailRow label="Live result" value={cmaMeasureUnavailableReason(liveResult)} />
              ) : (
                <DetailRow label="Live result" value="Non-aggregate/record result — see sourceReference for how this is computed" />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right text-foreground">{value}</span>
  </div>
);

export default CmaMeasures;
