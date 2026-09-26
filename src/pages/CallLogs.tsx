
import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/layout/PageHeader';
import { AdvancedFilters, CallLogFilters } from '@/components/call-logs/AdvancedFilters';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, FileText, TrendingUp, Clock, Target, Users, Loader2, LayoutList, Network } from 'lucide-react';
import { useCallData } from '@/hooks/calls/useCallData';
import { Interaction } from '@/types/interaction';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { formatDurationExact, formatDurationLong, formatPercent, formatPhoneNumber } from '@/lib/format';
import { useClassification } from '@/hooks/classification/useClassification';
import { groupInteractions } from '@/lib/interactionGrouping';
import { GroupedInteractionTree, type SelectedGroup } from '@/components/classification/GroupedInteractionTree';
import { ActiveFilterChips } from '@/components/common/ActiveFilterChips';
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

  const handleExport = () => {
    // Exports only the currently fetched/filtered result set — see the
    // limitation note rendered in AdvancedFilters above the controls.
    downloadCsv(toCsv(interactions), `call-logs-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <PageHeader
          pillar="Observe"
          title="Call Logs & Recordings"
          description="Complete audit trail of AI voice interactions."
        />

        {/* Summary Statistics — from the live call-data summary, not recomputed client-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">First Call Resolution</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(summary?.fcr_rate)}</div>
              <p className="text-xs text-muted-foreground">
                {summary ? `${summary.resolved_count} of ${summary.total_calls} calls resolved` : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Handle Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold"
                title={formatDurationExact(summary?.avg_aht_seconds)}
              >
                {formatDurationLong(summary?.avg_aht_seconds)}
              </div>
              <p className="text-xs text-muted-foreground">Across all calls</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Intent Accuracy</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(summary?.avg_intent_accuracy)}</div>
              <p className="text-xs text-muted-foreground">AI understanding rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Escalation Rate</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(summary?.escalation_rate)}</div>
              <p className="text-xs text-muted-foreground">
                {summary ? `${summary.escalated_count} calls escalated` : ''}
              </p>
            </CardContent>
          </Card>
        </div>

        <AdvancedFilters filters={filters} onFiltersChange={setFilters} onExport={handleExport} />

        {/* Client-side voice facets — no server query param exists for these (§13), so they narrow only the current page. */}
        <div className="flex flex-wrap items-end gap-3 -mt-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">FCR (current page)</label>
            <Select value={fcrFacet} onValueChange={(v) => setFcrFacet(v as ClientFacet)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Authenticated (current page)</label>
            <Select value={authFacet} onValueChange={(v) => setAuthFacet(v as ClientFacet)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Campaign contains (current page)</label>
            <Input
              className="h-8 w-48 text-xs"
              value={campaignFacet}
              onChange={(e) => setCampaignFacet(e.target.value)}
              placeholder="Campaign name…"
            />
          </div>
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

        {/* Call Logs Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Call History ({interactions.length}
              {view === 'grouped' && selectedGroup ? ` of ${allInteractions.length}` : ''})
            </h2>
            <div className="flex gap-1">
              <Button
                variant={view === 'grouped' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('grouped')}
              >
                <Network className="h-4 w-4 mr-1" />
                Grouped View
              </Button>
              <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setView('table')}>
                <LayoutList className="h-4 w-4 mr-1" />
                Table View
              </Button>
            </div>
          </div>

          {view === 'grouped' && !isLoading && allInteractions.length > 0 && (
            <GroupedInteractionTree
              group={grouped}
              selected={selectedGroup}
              onSelect={setSelectedGroup}
              countsAreExhaustive={false}
            />
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError && interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Call logs are unavailable right now — see the error above.
            </p>
          ) : interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters
                ? 'No calls match the current filters. Try widening or clearing them.'
                : 'No completed calls yet.'}
            </p>
          ) : (
            <div className="space-y-3">
              {interactions.map((call) => (
                <Card key={call.interactionId} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="font-semibold text-lg">
                          {call.callerName || call.phoneNumber} - {call.intent || 'General'}
                        </h3>
                        <Badge
                          variant={
                            call.outcome === 'resolved'
                              ? 'default'
                              : call.outcome === 'escalated'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {call.outcome ?? call.status}
                        </Badge>
                      </div>

                      <div className="text-sm text-muted-foreground mb-2 break-all">
                        <span className="font-mono text-xs">{call.interactionId}</span>
                        {' • '}
                        {formatPhoneNumber(call.phoneNumber)}
                        {' • '}
                        <span title={formatDurationExact(call.durationSeconds)}>
                          {formatDurationLong(call.durationSeconds)}
                        </span>
                      </div>

                      <p className="text-sm mb-3 text-gray-700">
                        {call.summary || 'No summary available'}
                      </p>

                      {call.tags && call.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {call.tags.map((tag, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end space-y-2 ml-4">
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!call.recording?.url}
                          onClick={() => handleViewDetail(call)}
                          title={call.recording?.url ? 'Play call recording' : 'No recording available for this call'}
                          aria-label={call.recording?.url ? 'Play call recording' : 'No recording available'}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetail(call)}
                          title="View call details and transcript"
                          aria-label="View call details and transcript"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        <div className="flex items-center space-x-1 mb-1">
                          <span>FCR:</span>
                          <span className={call.fcr ? 'text-green-600' : 'text-red-600'}>
                            {call.fcr ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>Intent:</span>
                          <span className="font-medium">{formatPercent(call.intentAccuracy, 0)}</span>
                          {call.intentAccuracy !== undefined && (
                            <div
                              className={`w-2 h-2 rounded-full ${
                                call.intentAccuracy >= 90
                                  ? 'bg-green-500'
                                  : call.intentAccuracy >= 80
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                              }`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

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
