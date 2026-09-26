import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ChevronLeft, ChevronRight, LayoutList, Network, Search } from 'lucide-react';
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
      return [s.sessionId, s.customerId, s.resolvedCustomerLabel, s.contactId, s.callerName, s.phoneNumber, s.agentName, s.latestIntent]
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
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs border-border bg-card text-foreground placeholder:text-muted-foreground"
              placeholder="Customer, CIF, session, agent, intent… (page)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFacet} onValueChange={(v) => { setStatusFacet(v as StatusFacet); setPage(1); }}>
            <SelectTrigger className="h-8 w-32 text-xs border-border bg-card text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Status: any</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={authFacet} onValueChange={(v) => setAuthFacet(v as YesNoFacet)}>
            <SelectTrigger className="h-8 w-40 text-xs border-border bg-card text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Auth (page): any</SelectItem>
              <SelectItem value="yes">Auth: yes</SelectItem>
              <SelectItem value="no">Auth: no</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button
            variant={view === 'grouped' ? 'default' : 'outline'}
            size="sm"
            className={view === 'grouped' ? 'h-8' : 'h-8 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground'}
            onClick={() => setView('grouped')}
          >
            <Network className="h-3.5 w-3.5 mr-1.5" />
            Grouped
          </Button>
          <Button
            variant={view === 'table' ? 'default' : 'outline'}
            size="sm"
            className={view === 'table' ? 'h-8' : 'h-8 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground'}
            onClick={() => setView('table')}
          >
            <LayoutList className="h-3.5 w-3.5 mr-1.5" />
            Table
          </Button>
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
          <div className="rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            Showing this app's local operational copy — the live chat history service didn't respond. Data may be incomplete or slightly out of date.
          </div>
        )}

        <div className="text-xs text-muted-foreground px-1">
          Chat history — {pagination ? `${sessions.length} of ${pagination.totalCount}` : sessions.length} shown
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError && sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">Chat logs are unavailable right now — see the error above.</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No chat sessions yet.</p>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {['Session', 'Agent', 'Customer', 'Contact / Phone', 'Status', 'Msgs', 'Intent', 'Auth', 'Source', 'Confidence', 'Latency', 'Started', 'Updated'].map((h) => (
                    <TableHead key={h} className="text-muted-foreground text-xs">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow
                    key={s.sessionId}
                    className="cursor-pointer border-border/60 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSessionId(s.sessionId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSessionId(s.sessionId);
                      }
                    }}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.sessionId.slice(0, 12)}…</TableCell>
                    <TableCell className="whitespace-nowrap text-foreground">{s.agentName ?? s.agentId ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-foreground">{s.resolvedCustomerLabel ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-foreground">{s.contactId ?? s.phoneNumber ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'active' ? 'secondary' : 'outline'} className="whitespace-nowrap text-xs">
                        {formatStatusLabel(s.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground">{s.messageCount}</TableCell>
                    <TableCell className="text-foreground">{s.latestIntent ?? '—'}</TableCell>
                    <TableCell className="text-foreground">{s.authenticated ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      {s.latestDataSource ? <Badge variant="outline" className="text-xs whitespace-nowrap border-slate-600 text-foreground">{s.latestDataSource}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-foreground">{s.latestConfidence !== null ? formatFractionAsPercent(s.latestConfidence) : '—'}</TableCell>
                    <TableCell className="text-foreground">{s.latestLatencyMs !== null ? `${s.latestLatencyMs}ms` : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{formatTimestamp(s.startedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{formatTimestamp(s.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} total)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 border-border bg-transparent text-foreground hover:bg-muted" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border bg-transparent text-foreground hover:bg-muted"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

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
