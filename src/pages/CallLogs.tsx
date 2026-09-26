
import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { AdvancedFilters, CallLogFilters, CallLogsSearch } from '@/components/call-logs/AdvancedFilters';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, FileText, Loader2, LayoutList, Network, Download } from 'lucide-react';
import { useCallData } from '@/hooks/calls/useCallData';
import { Interaction } from '@/types/interaction';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { formatDurationExact, formatDurationLong, formatPercent, formatPhoneNumber } from '@/lib/format';
import { useClassification } from '@/hooks/classification/useClassification';
import { groupInteractions } from '@/lib/interactionGrouping';
import { GroupedInteractionTree, type SelectedGroup } from '@/components/classification/GroupedInteractionTree';
import { ActiveFilterChips } from '@/components/common/ActiveFilterChips';
import { FilterPopover } from '@/components/common/FilterPopover';
import { MetricStrip } from '@/components/common/MetricStrip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

function toCsv(interactions: Interaction[]): string {
  const headers = [
    'interactionId', 'phoneNumber', 'callerName', 'agentDisplayName', 'direction',
    'status', 'outcome', 'fcr', 'durationSeconds', 'intent', 'intentAccuracy',
    'sentiment', 'sentimentScore', 'campaignName', 'startTime',
  ];
  const rows = interactions.map((i) =>
    headers.map((h) => JSON.stringify((i as unknown as Record<string, unknown>)[h] ?? '')).join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ClientFacet = 'any' | 'yes' | 'no';

const CallLogs: React.FC = () => {
  const [filters, setFilters] = useState<CallLogFilters>({});
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [view, setView] = useState<'grouped' | 'table'>('grouped');
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);
  // Client-side facets — the backend call-data query has no fcr/escalation/
  // authenticated/campaign filter params (Trigger_Call_API/Call_data_API
  // docs), so these narrow only the currently-fetched page and are labeled
  // as such, per plan §13's server-side-vs-client-side honesty rule.
  const [fcrFacet, setFcrFacet] = useState<ClientFacet>('any');
  const [authFacet, setAuthFacet] = useState<ClientFacet>('any');
  const [campaignFacet, setCampaignFacet] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useCallData({
    status: 'inactive',
    page_size: 50,
    ...filters,
  });
  const classification = useClassification();

  const allInteractions = useMemo(() => data?.interactions ?? [], [data]);
  const summary = data?.summary;
  const clientFacetsActive = fcrFacet !== 'any' || authFacet !== 'any' || Boolean(campaignFacet);
  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '') || clientFacetsActive;
  const advancedActiveCount =
    (filters.date_from ? 1 : 0) + (filters.date_to ? 1 : 0) + (filters.outcome ? 1 : 0) +
    (filters.direction ? 1 : 0) + (filters.min_duration !== undefined || filters.max_duration !== undefined ? 1 : 0);

  const grouped = useMemo(
    () =>
      groupInteractions(
        allInteractions.map((i) => ({ agentId: i.agentId ?? null, channel: 'voice' as const })),
        classification.data,
        classification.agentsById,
      ),
    [allInteractions, classification.data, classification.agentsById],
  );

  const groupFiltered =
    view === 'grouped' && selectedGroup
      ? allInteractions.filter((i) => (i.agentId ?? null) === selectedGroup.agentId)
      : allInteractions;

  const interactions = groupFiltered.filter((i) => {
    if (fcrFacet === 'yes' && i.fcr !== true) return false;
    if (fcrFacet === 'no' && i.fcr !== false) return false;
    if (authFacet === 'yes' && i.wasAuthenticated !== true) return false;
    if (authFacet === 'no' && i.wasAuthenticated === true) return false;
    if (campaignFacet && !(i.campaignName ?? '').toLowerCase().includes(campaignFacet.toLowerCase())) return false;
    return true;
  });

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...(filters.search ? [{ key: 'search', label: `Search: ${filters.search}`, onRemove: () => setFilters((f) => ({ ...f, search: undefined })) }] : []),
    ...(filters.date_from ? [{ key: 'date_from', label: `From ${filters.date_from}`, onRemove: () => setFilters((f) => ({ ...f, date_from: undefined })) }] : []),
    ...(filters.date_to ? [{ key: 'date_to', label: `To ${filters.date_to}`, onRemove: () => setFilters((f) => ({ ...f, date_to: undefined })) }] : []),
    ...(filters.outcome ? [{ key: 'outcome', label: `Outcome: ${filters.outcome}`, onRemove: () => setFilters((f) => ({ ...f, outcome: undefined })) }] : []),
    ...(filters.direction ? [{ key: 'direction', label: `Direction: ${filters.direction}`, onRemove: () => setFilters((f) => ({ ...f, direction: undefined })) }] : []),
    ...(selectedGroup ? [{ key: 'group', label: 'Category/Agent group', onRemove: () => setSelectedGroup(null) }] : []),
    ...(fcrFacet !== 'any' ? [{ key: 'fcr', label: `FCR: ${fcrFacet} (page)`, onRemove: () => setFcrFacet('any') }] : []),
    ...(authFacet !== 'any' ? [{ key: 'auth', label: `Authenticated: ${authFacet} (page)`, onRemove: () => setAuthFacet('any') }] : []),
    ...(campaignFacet ? [{ key: 'campaign', label: `Campaign: ${campaignFacet} (page)`, onRemove: () => setCampaignFacet('') }] : []),
  ];
  const clearAll = () => {
    setFilters({});
    setSelectedGroup(null);
    setFcrFacet('any');
    setAuthFacet('any');
    setCampaignFacet('');
  };

  const handleViewDetail = (interaction: Interaction) => {
    setSelectedInteraction(interaction);
    setShowDetail(true);
  };

  // Exports only the currently fetched/filtered page, not the complete
  // call history — the honest label lives on the Export button below.
  const handleExport = () => {
    downloadCsv(toCsv(interactions), `call-logs-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <Layout>
      <div className="bg-slate-950 min-h-full text-slate-200 p-4 space-y-3">
        {summary && (
          <MetricStrip
            items={[
              { label: 'FCR', value: formatPercent(summary.fcr_rate), hint: `${summary.resolved_count} of ${summary.total_calls} resolved` },
              { label: 'Avg handle time', value: formatDurationLong(summary.avg_aht_seconds), hint: formatDurationExact(summary.avg_aht_seconds) },
              { label: 'Intent accuracy', value: formatPercent(summary.avg_intent_accuracy) },
              { label: 'Escalation rate', value: formatPercent(summary.escalation_rate), hint: `${summary.escalated_count} escalated`, tone: summary.escalation_rate && summary.escalation_rate > 20 ? 'warning' : 'default' },
            ]}
          />
        )}

        {/* Compact toolbar — search, page-local facets, temporary filter panel, view toggle, export. Filters are controls, not content. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <CallLogsSearch value={filters.search ?? ''} onChange={(v) => setFilters((f) => ({ ...f, search: v || undefined }))} />
          </div>
          <Select value={fcrFacet} onValueChange={(v) => setFcrFacet(v as ClientFacet)}>
            <SelectTrigger className="h-8 w-[124px] text-xs border-slate-700 bg-slate-900 text-slate-300"><SelectValue placeholder="FCR (page)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">FCR: any</SelectItem>
              <SelectItem value="yes">FCR: yes</SelectItem>
              <SelectItem value="no">FCR: no</SelectItem>
            </SelectContent>
          </Select>
          <Select value={authFacet} onValueChange={(v) => setAuthFacet(v as ClientFacet)}>
            <SelectTrigger className="h-8 w-[150px] text-xs border-slate-700 bg-slate-900 text-slate-300"><SelectValue placeholder="Authenticated (page)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Auth: any</SelectItem>
              <SelectItem value="yes">Auth: yes</SelectItem>
              <SelectItem value="no">Auth: no</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 w-40 text-xs border-slate-700 bg-slate-900 text-slate-200 placeholder:text-slate-500"
            value={campaignFacet}
            onChange={(e) => setCampaignFacet(e.target.value)}
            placeholder="Campaign (page)…"
          />
          <FilterPopover activeCount={advancedActiveCount} onClear={() => setFilters((f) => ({ search: f.search }))}>
            <AdvancedFilters filters={filters} onFiltersChange={setFilters} />
          </FilterPopover>
          <div className="flex-1" />
          <Button
            variant={view === 'grouped' ? 'default' : 'outline'}
            size="sm"
            className={view === 'grouped' ? 'h-8' : 'h-8 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white'}
            onClick={() => setView('grouped')}
          >
            <Network className="h-3.5 w-3.5 mr-1.5" />
            Grouped
          </Button>
          <Button
            variant={view === 'table' ? 'default' : 'outline'}
            size="sm"
            className={view === 'table' ? 'h-8' : 'h-8 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white'}
            onClick={() => setView('table')}
          >
            <LayoutList className="h-3.5 w-3.5 mr-1.5" />
            Table
          </Button>
          <Button variant="outline" size="sm" className="h-8 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white" onClick={handleExport} title="Exports the currently loaded/filtered page only">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        </div>

        <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />

        {isError && (
          <QueryErrorBanner
            error={error}
            onRetry={() => void refetch()}
            hasStaleData={interactions.length > 0}
            isFetching={isFetching}
          />
        )}

        {view === 'grouped' && !isLoading && allInteractions.length > 0 && (
          <GroupedInteractionTree
            group={grouped}
            selected={selectedGroup}
            onSelect={setSelectedGroup}
            countsAreExhaustive={false}
          />
        )}

        <div className="text-xs text-slate-500 px-1">
          Call history — {interactions.length}
          {view === 'grouped' && selectedGroup ? ` of ${allInteractions.length}` : ''} shown
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : isError && interactions.length === 0 ? (
          <p className="text-sm text-slate-500 px-1">Call logs are unavailable right now — see the error above.</p>
        ) : interactions.length === 0 ? (
          <p className="text-sm text-slate-500 px-1">
            {hasActiveFilters ? 'No calls match the current filters. Try widening or clearing them.' : 'No completed calls yet.'}
          </p>
        ) : (
          <div className="rounded-md border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Caller / Intent</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Outcome</th>
                  <th className="px-3 py-2 font-medium">FCR</th>
                  <th className="px-3 py-2 font-medium">Intent accuracy</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((call) => (
                  <tr key={call.interactionId} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/60">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-100">{call.callerName || call.phoneNumber}</div>
                      <div className="text-xs text-slate-500">{call.intent || 'General'} · <span className="font-mono">{call.interactionId.slice(0, 8)}</span></div>
                    </td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{formatPhoneNumber(call.phoneNumber)}</td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap" title={formatDurationExact(call.durationSeconds)}>
                      {formatDurationLong(call.durationSeconds)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={call.outcome === 'resolved' ? 'default' : call.outcome === 'escalated' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {call.outcome ?? call.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <span className={call.fcr ? 'text-emerald-400' : 'text-red-400'}>{call.fcr ? 'Yes' : 'No'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        {formatPercent(call.intentAccuracy, 0)}
                        {call.intentAccuracy !== undefined && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              call.intentAccuracy >= 90 ? 'bg-emerald-500' : call.intentAccuracy >= 80 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                          />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                        disabled={!call.recording?.url}
                        onClick={() => handleViewDetail(call)}
                        title={call.recording?.url ? 'Play call recording' : 'No recording available for this call'}
                        aria-label={call.recording?.url ? 'Play call recording' : 'No recording available'}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                        onClick={() => handleViewDetail(call)}
                        title="View call details and transcript"
                        aria-label="View call details and transcript"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <InteractionDetailDialog
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
          interaction={selectedInteraction}
        />
      </div>
    </Layout>
  );
};

export default CallLogs;
