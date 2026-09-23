
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { AdvancedFilters, CallLogFilters } from '@/components/call-logs/AdvancedFilters';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, FileText, TrendingUp, Clock, Target, Users, Loader2 } from 'lucide-react';
import { useCallData } from '@/hooks/calls/useCallData';
import { Interaction } from '@/types/interaction';

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

const CallLogs: React.FC = () => {
  const [filters, setFilters] = useState<CallLogFilters>({});
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const { data, isLoading, isError } = useCallData({ status: 'inactive', page_size: 50, ...filters });

  const interactions = data?.interactions ?? [];
  const summary = data?.summary;

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
        <div>
          <h1 className="text-3xl font-bold">Call Logs & Recordings</h1>
          <p className="text-muted-foreground">
            Complete audit trail of all AI interactions
          </p>
        </div>

        {/* Summary Statistics — from the live call-data summary, not recomputed client-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">First Call Resolution</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary ? `${summary.fcr_rate.toFixed(1)}%` : '—'}</div>
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
              <div className="text-2xl font-bold">
                {summary ? `${Math.floor(summary.avg_aht_seconds / 60)}m ${summary.avg_aht_seconds % 60}s` : '—'}
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
              <div className="text-2xl font-bold">{summary ? `${summary.avg_intent_accuracy.toFixed(1)}%` : '—'}</div>
              <p className="text-xs text-muted-foreground">AI understanding rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Escalation Rate</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary ? `${summary.escalation_rate.toFixed(1)}%` : '—'}</div>
              <p className="text-xs text-muted-foreground">
                {summary ? `${summary.escalated_count} calls escalated` : ''}
              </p>
            </CardContent>
          </Card>
        </div>

        <AdvancedFilters filters={filters} onFiltersChange={setFilters} onExport={handleExport} />

        {/* Call Logs Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Call History ({interactions.length})</h2>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load call logs.</p>
          ) : interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls match the current filters.</p>
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

                      <div className="text-sm text-muted-foreground mb-2">
                        {call.interactionId} • {call.phoneNumber} •{' '}
                        {call.durationSeconds !== undefined
                          ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s`
                          : '—'}
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
                          title={call.recording?.url ? 'Play recording' : 'No recording available'}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleViewDetail(call)}>
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
                          <span className="font-medium">
                            {call.intentAccuracy !== undefined ? `${call.intentAccuracy.toFixed(0)}%` : '—'}
                          </span>
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
