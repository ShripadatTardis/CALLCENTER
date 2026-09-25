import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, MessageCircle, ChevronLeft, ChevronRight, LayoutList, Network } from 'lucide-react';
import { useChatLogs } from '@/hooks/chat/useChatLogs';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import { formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';
import { useClassification } from '@/hooks/classification/useClassification';
import { groupInteractions } from '@/lib/interactionGrouping';
import { GroupedInteractionTree, type SelectedGroup } from '@/components/classification/GroupedInteractionTree';
import { ActiveFilterChips } from '@/components/common/ActiveFilterChips';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

/**
 * Session 5.1 amendment: sourced from GET /api/v1/chat/sessions (the
 * documented authoritative history source), with real pagination and
 * real identity fields — no mock values. Falls back to this app's local
 * copy only when the live call fails (surfaced via the banner below).
 */
type StatusFacet = 'any' | 'active' | 'completed';
type YesNoFacet = 'any' | 'yes' | 'no';

const ChatLogs: React.FC = () => {
  const [page, setPage] = useState(1);
  const [statusFacet, setStatusFacet] = useState<StatusFacet>('any');
  const { data, isLoading, isError, error, refetch, isFetching } = useChatLogs(page, statusFacet === 'any' ? undefined : statusFacet);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [view, setView] = useState<'grouped' | 'table'>('grouped');
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);
  const classification = useClassification();

  // Client-side — the backend chat/sessions list has no free-text search
  // param (Chat_Sessions_API.docx: customer_id/contact_id/agent_id/status/
  // page/page_size only), so this narrows the current fetched page only.
  const [search, setSearch] = useState('');
  const [authFacet, setAuthFacet] = useState<YesNoFacet>('any');

  const allSessionsRaw = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.pagination;
  const isFallback = data?.source === 'local-fallback';

  const allSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSessionsRaw.filter((s) => {
      if (authFacet === 'yes' && !s.authenticated) return false;
      if (authFacet === 'no' && s.authenticated) return false;
      if (!q) return true;
      return [s.sessionId, s.customerId, s.contactId, s.callerName, s.phoneNumber, s.agentName, s.latestIntent]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [allSessionsRaw, search, authFacet]);

  const grouped = useMemo(
    () =>
      groupInteractions(
        allSessions.map((s) => ({ agentId: s.agentId ?? null, channel: 'chat' as const })),
        classification.data,
        classification.agentsById,
      ),
    [allSessions, classification.data, classification.agentsById],
  );

  const sessions =
    view === 'grouped' && selectedGroup ? allSessions.filter((s) => (s.agentId ?? null) === selectedGroup.agentId) : allSessions;

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Chat Logs</h1>
          <p className="text-muted-foreground">Historical text-interaction sessions.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Search (current page)</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-sm"
                placeholder="Customer, CIF, session, agent, intent…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFacet} onValueChange={(v) => { setStatusFacet(v as StatusFacet); setPage(1); }}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Authenticated (page)</label>
            <Select value={authFacet} onValueChange={(v) => setAuthFacet(v as YesNoFacet)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <ActiveFilterChips
          chips={[
            ...(search ? [{ key: 'search', label: `Search: ${search} (page)`, onRemove: () => setSearch('') }] : []),
            ...(statusFacet !== 'any' ? [{ key: 'status', label: `Status: ${statusFacet}`, onRemove: () => setStatusFacet('any') }] : []),
            ...(authFacet !== 'any' ? [{ key: 'auth', label: `Authenticated: ${authFacet} (page)`, onRemove: () => setAuthFacet('any') }] : []),
            ...(selectedGroup ? [{ key: 'group', label: 'Category/Agent group', onRemove: () => setSelectedGroup(null) }] : []),
          ]}
          onClearAll={() => { setSearch(''); setStatusFacet('any'); setAuthFacet('any'); setSelectedGroup(null); }}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Chat History {pagination ? `(${sessions.length} of ${pagination.totalCount})` : ''}
            </CardTitle>
            <div className="flex gap-1">
              <Button variant={view === 'grouped' ? 'default' : 'outline'} size="sm" onClick={() => setView('grouped')}>
                <Network className="h-4 w-4 mr-1" />
                Grouped View
              </Button>
              <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setView('table')}>
                <LayoutList className="h-4 w-4 mr-1" />
                Table View
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {view === 'grouped' && !isLoading && allSessions.length > 0 && (
              <GroupedInteractionTree
                group={grouped}
                selected={selectedGroup}
                onSelect={setSelectedGroup}
                countsAreExhaustive={false}
              />
            )}
            {isError && (
              <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={sessions.length > 0} isFetching={isFetching} />
            )}
            {isFallback && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Showing this app's local operational copy — the live chat history service didn't respond.
                Data may be incomplete or slightly out of date.
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isError && sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Chat logs are unavailable right now — see the error above.
              </p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No chat sessions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session ID</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Contact / Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead>Authenticated</TableHead>
                      <TableHead>Data Source</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Started At</TableHead>
                      <TableHead>Updated At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow
                        key={s.sessionId}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedSessionId(s.sessionId)}
                      >
                        <TableCell className="font-mono text-xs">{s.sessionId.slice(0, 12)}…</TableCell>
                        <TableCell className="whitespace-nowrap">{s.agentName ?? s.agentId ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{s.customerId ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{s.contactId ?? s.phoneNumber ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'active' ? 'secondary' : 'outline'} className="whitespace-nowrap">
                            {formatStatusLabel(s.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{s.messageCount}</TableCell>
                        <TableCell>{s.latestIntent ?? '—'}</TableCell>
                        <TableCell>{s.authenticated ? 'Yes' : 'No'}</TableCell>
                        <TableCell>
                          {s.latestDataSource ? <Badge variant="outline" className="text-xs whitespace-nowrap">{s.latestDataSource}</Badge> : '—'}
                        </TableCell>
                        <TableCell>{s.latestConfidence !== null ? formatFractionAsPercent(s.latestConfidence) : '—'}</TableCell>
                        <TableCell>{s.latestLatencyMs !== null ? `${s.latestLatencyMs}ms` : '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatTimestamp(s.startedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatTimestamp(s.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} total)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <ChatSessionDetailDialog
          isOpen={Boolean(selectedSessionId)}
          onClose={() => setSelectedSessionId(null)}
          sessionId={selectedSessionId}
        />
      </div>
    </Layout>
  );
};

export default ChatLogs;
