
import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AdvancedFilters, CallLogFilters, CallLogsSearch } from '@/components/call-logs/AdvancedFilters';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DetailNavigationState } from '@/lib/detailOrigin';
import { Eye, Loader2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallData } from '@/hooks/calls/useCallData';
import { Interaction } from '@/types/interaction';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { formatDurationExact, formatDurationLong, formatPercent, formatPhoneNumber, formatTimestamp } from '@/lib/format';
import { useAgents } from '@/hooks/agents/useAgents';
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

const PAGE_SIZE = 50;

const CallLogs: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Dashboard IA session — Dashboard's "View all → Call Logs" links pass
  // navigation state `{ origin: 'dashboard' }` (src/lib/detailOrigin.ts's
  // existing mechanism). Entering Call Logs from the sidebar leaves this
  // undefined, so the page's normal (no back-link) behavior is unchanged.
  const fromDashboard = (location.state as DetailNavigationState | null)?.origin === 'dashboard';
  const [filters, setFilters] = useState<CallLogFilters>({});
  const [page, setPage] = useState(1);
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  // Session 11.3A — Call Agent is a normal page-local F1 filter, not a
  // GR1 grouping-tree navigation step. The underlying Session 6.2
  // Domain->Category->Agent classification model is untouched; this is
  // just a direct agentId equality filter over the already-fetched page,
  // since /call-data has no agent_id query param (CallDataQueryDto below
  // has no such field) — page-local, honestly labeled "(page)" below.
  const [agentFilter, setAgentFilter] = useState<string>('all');
  // Client-side facets — the backend call-data query has no fcr/escalation/
  // authenticated/campaign filter params (Trigger_Call_API/Call_data_API
  // docs), so these narrow only the currently-fetched page and are labeled
  // as such, per plan §13's server-side-vs-client-side honesty rule.
  const [fcrFacet, setFcrFacet] = useState<ClientFacet>('any');
  const [authFacet, setAuthFacet] = useState<ClientFacet>('any');
  const [campaignFacet, setCampaignFacet] = useState('');

  // Session 11.3 — real server-side pagination. Any change to a
  // server-side filter resets to page 1 (the previous page number may no
  // longer exist under the new filter); client-side facets and the
  // grouping selection never touch `page` since they don't change the
  // server query at all, only what's shown from the already-fetched page.
  const updateServerFilters = (next: CallLogFilters) => {
    setFilters(next);
    setPage(1);
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useCallData({
    status: 'inactive',
    page_size: PAGE_SIZE,
    page,
    ...filters,
  });
  const { data: agentsData } = useAgents();
  const agentRoster = agentsData?.agents ?? [];

  const allInteractions = useMemo(() => data?.interactions ?? [], [data]);
  const summary = data?.summary;
  const pagination = data?.pagination;
  const clientFacetsActive = fcrFacet !== 'any' || authFacet !== 'any' || Boolean(campaignFacet) || agentFilter !== 'all';
  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '') || clientFacetsActive;
  const advancedActiveCount =
    (filters.date_from ? 1 : 0) + (filters.date_to ? 1 : 0) + (filters.outcome ? 1 : 0) +
    (filters.direction ? 1 : 0) + (filters.min_duration !== undefined || filters.max_duration !== undefined ? 1 : 0) +
    (agentFilter !== 'all' ? 1 : 0) +
    (fcrFacet !== 'any' ? 1 : 0) + (authFacet !== 'any' ? 1 : 0) + (campaignFacet ? 1 : 0);

  const agentFiltered =
    agentFilter !== 'all' ? allInteractions.filter((i) => (i.agentId ?? null) === agentFilter) : allInteractions;

  const interactions = agentFiltered.filter((i) => {
    if (fcrFacet === 'yes' && i.fcr !== true) return false;
    if (fcrFacet === 'no' && i.fcr !== false) return false;
    if (authFacet === 'yes' && i.wasAuthenticated !== true) return false;
    if (authFacet === 'no' && i.wasAuthenticated === true) return false;
    if (campaignFacet && !(i.campaignName ?? '').toLowerCase().includes(campaignFacet.toLowerCase())) return false;
    return true;
  });

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...(filters.search ? [{ key: 'search', label: `Search: ${filters.search}`, onRemove: () => updateServerFilters({ ...filters, search: undefined }) }] : []),
    ...(filters.date_from ? [{ key: 'date_from', label: `From ${filters.date_from}`, onRemove: () => updateServerFilters({ ...filters, date_from: undefined }) }] : []),
    ...(filters.date_to ? [{ key: 'date_to', label: `To ${filters.date_to}`, onRemove: () => updateServerFilters({ ...filters, date_to: undefined }) }] : []),
    ...(filters.outcome ? [{ key: 'outcome', label: `Outcome: ${filters.outcome}`, onRemove: () => updateServerFilters({ ...filters, outcome: undefined }) }] : []),
    ...(filters.direction ? [{ key: 'direction', label: `Direction: ${filters.direction}`, onRemove: () => updateServerFilters({ ...filters, direction: undefined }) }] : []),
    ...(agentFilter !== 'all' ? [{ key: 'agent', label: `Agent: ${agentRoster.find((a) => a.agentId === agentFilter)?.displayName ?? agentFilter} (page)`, onRemove: () => setAgentFilter('all') }] : []),
    ...(fcrFacet !== 'any' ? [{ key: 'fcr', label: `FCR: ${fcrFacet} (page)`, onRemove: () => setFcrFacet('any') }] : []),
    ...(authFacet !== 'any' ? [{ key: 'auth', label: `Authenticated: ${authFacet} (page)`, onRemove: () => setAuthFacet('any') }] : []),
    ...(campaignFacet ? [{ key: 'campaign', label: `Campaign: ${campaignFacet} (page)`, onRemove: () => setCampaignFacet('') }] : []),
  ];
  const clearAll = () => {
    setFilters({});
    setPage(1);
    setAgentFilter('all');
    setFcrFacet('any');
    setAuthFacet('any');
    setCampaignFacet('');
  };

  const handleViewDetail = (interaction: Interaction) => {
    setSelectedInteraction(interaction);
    setShowDetail(true);
  };

  // Exports only the currently fetched/filtered page, not the complete
  // call history — the honest scope label sits next to the button below.
  const handleExport = () => {
    downloadCsv(toCsv(interactions), `call-logs-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const totalPages = pagination?.total_pages ?? 1;
  const currentPage = pagination?.page ?? page;

  return (
    <Layout>
      {/* Session 11.3 (L1): the page root fills the height Layout's <main>
          gives it and is itself a flex column with min-h-0 — everything
          above the record table is fixed height (flex-shrink-0), and the
          table region alone is flex-1 + overflow-auto, so it is the one
          part of the screen that scrolls as call volume grows. Real
          server-side pagination (below) means the table never needs to
          hold more than one page's worth of rows at a time either. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        {fromDashboard && (
          <div className="flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              ← Back to Dashboard
            </Button>
          </div>
        )}
        {summary && (
          <div className="flex-shrink-0">
            <MetricStrip
              items={[
                { label: 'FCR', value: formatPercent(summary.fcr_rate), hint: `${summary.resolved_count} of ${summary.total_calls} resolved` },
                { label: 'Avg handle time', value: formatDurationLong(summary.avg_aht_seconds), hint: formatDurationExact(summary.avg_aht_seconds) },
                { label: 'Intent accuracy', value: formatPercent(summary.avg_intent_accuracy) },
                { label: 'Escalation rate', value: formatPercent(summary.escalation_rate), hint: `${summary.escalated_count} escalated`, tone: summary.escalation_rate && summary.escalation_rate > 20 ? 'warning' : 'default' },
              ]}
            />
          </div>
        )}

        {/* F1 — shallow persistent toolbar: search always visible, every
            secondary filter (server-side date/outcome/direction/duration
            AND the page-local FCR/Auth/Campaign facets) lives inside one
            temporary floating panel that overlays the workspace instead of
            permanently occupying toolbar width. */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <div className="w-64">
            <CallLogsSearch value={filters.search ?? ''} onChange={(v) => updateServerFilters({ ...filters, search: v || undefined })} />
          </div>
          <FilterPopover
            title="Filters"
            activeCount={advancedActiveCount}
            onClear={() => {
              updateServerFilters({ search: filters.search });
              setAgentFilter('all');
              setFcrFacet('any');
              setAuthFacet('any');
              setCampaignFacet('');
            }}
          >
            {/* Session 11.3A — Call Agent replaces the GR1 grouping tree as
                the way to narrow calls by agent. Uses the real /agents
                roster and the interaction's immutable agentId; agent_id is
                the identity, displayName is presentation only. No
                agent_id query param exists on /call-data
                (CallDataQueryDto), so this is honestly page-local — same
                "(page)" chip convention as the other client-side facets. */}
            <div className="pb-3 border-b border-border">
              <label id="call-agent-label" className="text-xs font-medium mb-1.5 block text-muted-foreground">Call Agent</label>
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger aria-labelledby="call-agent-label" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {agentRoster.map((a) => (
                    <SelectItem key={a.agentId} value={a.agentId}>{a.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground mt-1">Filters the currently loaded page only</div>
            </div>
            <AdvancedFilters filters={filters} onFiltersChange={updateServerFilters} />
            <div className="border-t border-border pt-3 space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Page-local facets (this page only)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1.5 block text-muted-foreground">FCR</label>
                  <Select value={fcrFacet} onValueChange={(v) => setFcrFacet(v as ClientFacet)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Authenticated</label>
                  <Select value={authFacet} onValueChange={(v) => setAuthFacet(v as ClientFacet)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Campaign (text match)</label>
                <Input
                  className="h-8 text-xs"
                  value={campaignFacet}
                  onChange={(e) => setCampaignFacet(e.target.value)}
                  placeholder="Campaign name contains…"
                />
              </div>
            </div>
          </FilterPopover>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
            <span className="text-xs text-muted-foreground whitespace-nowrap">current page only</span>
          </div>
        </div>

        <div className="flex-shrink-0">
          <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />
        </div>

        {isError && (
          <div className="flex-shrink-0">
            <QueryErrorBanner
              error={error}
              onRetry={() => void refetch()}
              hasStaleData={interactions.length > 0}
              isFetching={isFetching}
            />
          </div>
        )}

        {/* Session 11.3A — the GR1 grouping-tree preamble was removed for
            Call Logs specifically (GroupedInteractionTree/groupInteractions
            and the underlying Session 6.2 classification model are
            untouched and unaffected for any other screen that still uses
            them). Records now begin immediately below the toolbar. */}
        <div className="text-xs text-muted-foreground px-1 flex-shrink-0">
          Call history — {interactions.length}
          {agentFilter !== 'all' ? ` of ${allInteractions.length}` : ''} shown
        </div>

        {/* The record table is the sole flex-grow, internally-scrolling
            region on this page (L1) — see the header comment. */}
        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError && interactions.length === 0 ? (
          <p className="text-sm text-muted-foreground px-3 py-4">Call logs are unavailable right now — see the error above.</p>
        ) : interactions.length === 0 ? (
          <p className="text-sm text-muted-foreground px-3 py-4">
            {hasActiveFilters ? 'No calls match the current filters. Try widening or clearing them.' : 'No completed calls yet.'}
          </p>
        ) : (
            <table className="w-full text-sm">
              {/* G1 dense operational grid (docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md
                  §G1): ~32-36px header, ~38-42px rows — not the old py-2/
                  px-4 card-like spacing. */}
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="h-9 px-3 font-medium whitespace-nowrap">Timestamp</th>
                  <th className="h-9 px-3 font-medium">Caller / Context</th>
                  <th className="h-9 px-3 font-medium">Agent</th>
                  <th className="h-9 px-3 font-medium text-right">Duration</th>
                  <th className="h-9 px-3 font-medium">Outcome</th>
                  <th className="h-9 px-3 font-medium">FCR</th>
                  <th className="h-9 px-3 font-medium">Intent accuracy</th>
                  <th className="h-9 px-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((call) => {
                  const agentLabel = call.agentDisplayName ?? call.agentId ?? 'Unknown agent';
                  // Session 11.3 fix: the grid previously fell back to
                  // call.status (a distinct execution-state field) whenever
                  // outcome was absent, silently conflating two different
                  // fields (docs/SCREEN_REVIEW_03_CALL_LOGS.md §G). Now shows
                  // an honest empty state instead.
                  const outcomeVariant = call.outcome === 'resolved' ? 'positive' : call.outcome === 'escalated' ? 'escalated' : 'secondary';
                  return (
                  <tr key={call.interactionId} className="border-b border-border/60 last:border-0 hover:bg-card">
                    <td className="py-1.5 px-3 whitespace-nowrap text-xs text-muted-foreground">
                      {formatTimestamp(call.startTime)}
                    </td>
                    {/* Caller/Context: phone folded into the identity cell
                        (matches Dashboard's pattern), single line, name and
                        intent truncate together rather than each getting
                        their own row. */}
                    <td className="py-1.5 px-3 max-w-[260px]">
                      <span
                        className="text-sm text-foreground truncate block"
                        title={`${call.callerName || formatPhoneNumber(call.phoneNumber)} · ${call.intent || 'General'}`}
                      >
                        {call.callerName || formatPhoneNumber(call.phoneNumber)}
                        {call.callerName && (
                          <span className="text-muted-foreground"> · {formatPhoneNumber(call.phoneNumber)}</span>
                        )}
                        <span className="text-muted-foreground"> · {call.intent || 'General'}</span>
                      </span>
                    </td>
                    {/* C1 adaptive sizing — bounded-but-generous min/max so
                        real agent names ("Inbound Banking Assistant") never
                        truncate at normal widths (see LiveView's identical
                        pattern, the reference G1/C1 implementation). */}
                    <td className="py-1.5 px-3 min-w-[7rem] max-w-[14rem]">
                      <span className="text-sm text-foreground truncate block" title={agentLabel}>{agentLabel}</span>
                    </td>
                    <td className="py-1.5 px-3 text-right whitespace-nowrap" title={formatDurationExact(call.durationSeconds)}>
                      <span className="font-mono tabular-nums text-foreground text-xs">{formatDurationLong(call.durationSeconds)}</span>
                    </td>
                    <td className="py-1.5 px-3">
                      <Badge variant={outcomeVariant} className="whitespace-nowrap text-xs">
                        {call.outcome ?? 'Unknown'}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-3">
                      <span className={call.fcr ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {call.fcr === undefined ? '—' : call.fcr ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3">
                      <span className="flex items-center gap-1.5 text-foreground">
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
                    {/* Session 11.3 — consolidated the former Play+FileText
                        pair (both called handleViewDetail; Play never played
                        audio inline, only the dialog's own <audio> element
                        does) into one truthful action. */}
                    <td className="py-1.5 px-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => handleViewDetail(call)}
                        title="View call details and transcript"
                        aria-label="View call details and transcript"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
        )}
        </div>

        {/* Session 11.3 — real server-side pagination, using the Partner
            API's own total_records/total_pages metadata (previously fetched
            but never read anywhere). Never a client-side slice of the
            already-loaded 50 rows. */}
        {pagination && pagination.total_records > 0 && (
          <div className="flex items-center justify-between flex-shrink-0 text-xs text-muted-foreground px-1">
            <span>
              {pagination.total_records} total call{pagination.total_records === 1 ? '' : 's'} · Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isFetching}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isFetching}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
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
