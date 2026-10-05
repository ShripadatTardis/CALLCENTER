import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Loader2, ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import { useChatLogs } from '@/hooks/chat/useChatLogs';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import { formatStatusLabel, formatTimestamp } from '@/lib/format';
import { useAgents } from '@/hooks/agents/useAgents';
import { ActiveFilterChips } from '@/components/common/ActiveFilterChips';
import { FilterPopover } from '@/components/common/FilterPopover';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { typography } from '@/lib/typography';

/**
 * Session 11.4 — rebuilt on the Session 11.3/11.3A Call Logs pattern
 * (G1/F1/S1/L1/C1/N1). GET /api/v1/chat/sessions supports server-side
 * `agent_id` and `status` filters (this app's own /api/chat/logs proxy
 * already forwards both, see api/chat/logs.ts) — unlike Call Logs'
 * /call-data, so Call Agent here is a real global filter, not page-local.
 * There is no server-side free-text search or authenticated-status
 * filter param, so Search and Authenticated remain honest page-local
 * facets over the currently-loaded page only.
 */
type StatusFacet = 'any' | 'active' | 'completed';
type YesNoFacet = 'any' | 'yes' | 'no';

const ChatLogs: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFacet, setStatusFacet] = useState<StatusFacet>('any');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Page-local only — GET /api/v1/chat/sessions has no free-text search
  // or authenticated-status query parameter (src/types/api/chat.ts /
  // api/chat/logs.ts), so these narrow only the already-fetched page.
  const [search, setSearch] = useState('');
  const [authFacet, setAuthFacet] = useState<YesNoFacet>('any');

  const { data, isLoading, isError, error, refetch, isFetching } = useChatLogs(
    page,
    statusFacet === 'any' ? undefined : statusFacet,
    agentFilter === 'all' ? undefined : agentFilter,
  );
  const { data: agentsData } = useAgents();
  const agentRoster = agentsData?.agents ?? [];

  // Any change to a server-side query param (agent, status) must return
  // to page 1 — the previous page number may not exist under the new
  // filter. Page-local facets (search, auth) never touch `page`.
  const updateAgentFilter = (v: string) => {
    setAgentFilter(v);
    setPage(1);
  };
  const updateStatusFilter = (v: StatusFacet) => {
    setStatusFacet(v);
    setPage(1);
  };

  const allSessionsRaw = data?.data ?? [];
  const pagination = data?.pagination;
  const isFallback = data?.source === 'local-fallback';

  const sessions = allSessionsRaw.filter((s) => {
    if (authFacet === 'yes' && !s.authenticated) return false;
    if (authFacet === 'no' && s.authenticated) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [s.sessionId, s.customerId, s.resolvedCustomerLabel, s.contactId, s.callerName, s.phoneNumber, s.agentName, s.latestIntent]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const advancedActiveCount =
    (agentFilter !== 'all' ? 1 : 0) + (statusFacet !== 'any' ? 1 : 0) + (authFacet !== 'any' ? 1 : 0);
  const hasActiveFilters = advancedActiveCount > 0 || Boolean(search);

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...(search ? [{ key: 'search', label: `Search: ${search} (page)`, onRemove: () => setSearch('') }] : []),
    ...(agentFilter !== 'all'
      ? [{ key: 'agent', label: `Agent: ${agentRoster.find((a) => a.agentId === agentFilter)?.displayName ?? agentFilter}`, onRemove: () => updateAgentFilter('all') }]
      : []),
    ...(statusFacet !== 'any' ? [{ key: 'status', label: `Status: ${statusFacet}`, onRemove: () => updateStatusFilter('any') }] : []),
    ...(authFacet !== 'any' ? [{ key: 'auth', label: `Authenticated: ${authFacet} (page)`, onRemove: () => setAuthFacet('any') }] : []),
  ];
  const clearAll = () => {
    setSearch('');
    updateAgentFilter('all');
    updateStatusFilter('any');
    setAuthFacet('any');
  };

  const totalPages = pagination?.totalPages ?? 1;
  const currentPage = pagination?.page ?? page;

  return (
    <Layout>
      {/* L1 — same bounded-workspace shape as Call Logs (11.3): the page
          root is a flex column filling Layout's <main>; everything above
          the table is flex-shrink-0, and the table alone is
          flex-1 min-h-0 overflow-auto, so backend session volume never
          determines page height — pagination handles growth instead. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        {/* F1 — shallow persistent toolbar: search always visible, every
            secondary filter lives inside one temporary floating panel. */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <div className="w-64">
            <Input
              className="h-8 text-xs border-border bg-card text-foreground placeholder:text-muted-foreground"
              placeholder="Search sessions… (page)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search chat sessions (current page only)"
            />
          </div>
          <FilterPopover title="Filters" activeCount={advancedActiveCount} onClear={clearAll}>
            {/* Call Agent — genuinely server-side here: GET
                /api/v1/chat/sessions accepts agent_id (api/chat/logs.ts
                forwards it), so unlike Call Logs' page-local Call Agent
                filter, this one narrows the complete chat history, not
                just the loaded page. */}
            <div className="pb-3 border-b border-border">
              <label id="chat-agent-label" className="text-xs font-medium mb-1.5 block text-muted-foreground">Call Agent</label>
              <Select value={agentFilter} onValueChange={updateAgentFilter}>
                <SelectTrigger aria-labelledby="chat-agent-label" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {agentRoster.map((a) => (
                    <SelectItem key={a.agentId} value={a.agentId}>{a.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground mt-1">Filters the complete chat history</div>
            </div>
            <div className="pb-3 border-b border-border">
              <label id="chat-status-label" className="text-xs font-medium mb-1.5 block text-muted-foreground">Status</label>
              <Select value={statusFacet} onValueChange={(v) => updateStatusFilter(v as StatusFacet)}>
                <SelectTrigger aria-labelledby="chat-status-label" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">Page-local facets (this page only)</div>
              <label id="chat-auth-label" className="text-xs font-medium mb-1.5 block text-muted-foreground">Authenticated</label>
              <Select value={authFacet} onValueChange={(v) => setAuthFacet(v as YesNoFacet)}>
                <SelectTrigger aria-labelledby="chat-auth-label" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground mt-1">Filters the currently loaded page only — GET /chat/sessions has no authenticated query parameter</div>
            </div>
          </FilterPopover>
        </div>

        <div className="flex-shrink-0">
          <ActiveFilterChips chips={activeChips} onClearAll={clearAll} />
        </div>

        {isError && (
          <div className="flex-shrink-0">
            <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={sessions.length > 0} isFetching={isFetching} />
          </div>
        )}
        {isFallback && (
          <div className="flex-shrink-0 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            Showing this app's local operational copy — the live chat history service didn't respond. Data may be incomplete or slightly out of date.
          </div>
        )}

        {/* Session 11.4 — the legacy Grouped/Table toggle and the large
            Domain->Category->Agent grouping tree are removed, mirroring
            11.3A's Call Logs precedent: Call Agent is now a filter, not
            a navigation hierarchy. GroupedInteractionTree/groupInteractions
            and the underlying Session 6.2 classification model are
            untouched — QAReview and CustomerDetail still use them. */}
        <div className="text-xs text-muted-foreground px-1 flex-shrink-0">
          Chat history — {sessions.length}
          {hasActiveFilters && pagination ? ` of ${pagination.totalCount} loaded page` : pagination ? ` of ${pagination.totalCount}` : ''} shown
        </div>

        {/* G1 dense operational grid, C1 adaptive columns — same table
            shell/density as Call Logs (11.3). The record table is the
            sole flex-grow, internally-scrolling region on this page. */}
        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError && sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-4">Chat logs are unavailable right now — see the error above.</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-4">
              {hasActiveFilters ? 'No chat sessions match the current filters. Try widening or clearing them.' : 'No chat sessions yet.'}
            </p>
          ) : (
            <table className={`w-full ${typography.tableBody}`} aria-label="Chat sessions">
              <thead>
                <tr className={`border-b border-border text-left ${typography.tableHeader}`}>
                  <th scope="col" className="h-9 px-3 whitespace-nowrap">Timestamp</th>
                  <th scope="col" className="h-9 px-3">Customer / Context</th>
                  <th scope="col" className="h-9 px-3">Agent</th>
                  <th scope="col" className="h-9 px-3 text-right">Msgs</th>
                  <th scope="col" className="h-9 px-3">Status</th>
                  <th scope="col" className="h-9 px-3">Intent</th>
                  <th scope="col" className="h-9 px-3">Auth</th>
                  <th scope="col" className="h-9 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const agentLabel = s.agentName ?? s.agentId ?? 'Unknown agent';
                  const contextLabel = s.resolvedCustomerLabel ?? s.contactId ?? s.phoneNumber ?? 'Unknown';
                  // Status here is a technical session lifecycle state
                  // (active/completed), not a business outcome — kept
                  // restrained/neutral rather than reusing positive/
                  // escalated, which would overclaim resolved-vs-failed
                  // semantics this field does not carry (Session 11.4
                  // field-provenance finding, see docs/SESSION_11_4_...).
                  return (
                    <tr key={s.sessionId} className="border-b border-border/60 last:border-0 hover:bg-card">
                      <td className="py-1.5 px-3 whitespace-nowrap text-xs text-muted-foreground">
                        {formatTimestamp(s.startedAt)}
                      </td>
                      <td className="py-1.5 px-3 max-w-[260px]">
                        {/* VoiceForce design system — identifying fields stay prominent at the
                            dense table-body size via font-weight, not a larger font-size. */}
                        <span
                          className="font-medium text-foreground truncate block"
                          title={`${contextLabel} · ${s.latestIntent || 'General'}`}
                        >
                          {contextLabel}
                          <span className="text-muted-foreground font-normal"> · {s.latestIntent || 'General'}</span>
                        </span>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {/* Session 13.1 (DEC-CUST-03) — only rendered when
                              a real Customer 360 id was resolved server-side;
                              never inferred from the display label. */}
                          {s.customer360Id && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline min-h-6 p-1 -m-1"
                              onClick={() => navigate(`/customers/${s.customer360Id}`, { state: { origin: 'chat-logs' } })}
                            >
                              <UserRound className="h-3 w-3" />
                              View Customer 360
                            </button>
                          )}
                          {/* Session 13.2 (DEC-CHAT-01) — campaignId is a
                              real, stable id; campaignName is resolved
                              server-side via the authoritative campaigns
                              table, never fabricated. A session with a
                              campaignId but no resolvable name still
                              navigates, labeled "Campaign" rather than
                              inventing a name. */}
                          {s.campaignId && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline min-h-6 p-1 -m-1"
                              onClick={() => navigate(`/outbound-campaigns/${s.campaignId}`)}
                            >
                              {s.campaignName ?? 'Campaign'}
                            </button>
                          )}
                          {s.isTrial === true && (
                            <Badge variant="secondary" className="text-xs">
                              Trial
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 min-w-[7rem] max-w-[14rem]">
                        <span className="font-medium text-foreground truncate block" title={agentLabel}>{agentLabel}</span>
                      </td>
                      <td className="py-1.5 px-3 text-right whitespace-nowrap">
                        <span className="font-mono tabular-nums text-foreground text-xs">{s.messageCount}</span>
                      </td>
                      <td className="py-1.5 px-3">
                        <Badge variant={s.status === 'active' ? 'secondary' : 'outline'} className="whitespace-nowrap text-xs">
                          {formatStatusLabel(s.status)}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-3">
                        <span className="text-foreground">{s.latestIntent ?? '—'}</span>
                      </td>
                      <td className="py-1.5 px-3">
                        {/* VoiceForce design system — neutral data-value rule: Yes/No is an ordinary
                            field value, not a status/warning state, so it stays plain foreground text. */}
                        <span className="text-foreground">{s.authenticated ? 'Yes' : 'No'}</span>
                      </td>
                      <td className="py-1.5 px-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedSessionId(s.sessionId)}
                          title="View chat session and transcript"
                          aria-label="View chat session and transcript"
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

        {/* Real server-side pagination — GET /api/v1/chat/sessions'
            own page/page_size/total_records/total_pages metadata
            (already fully wired through api/chat/logs.ts and
            chatService.ts, just needed UI plumbing — same situation
            Session 11.3 found for Call Logs). Note: for a category-scoped
            role, api/chat/logs.ts caps totalPages at 1 and totalCount at
            the authorized rows on the current page only (it cannot ask
            the upstream API to paginate an already-filtered subset) —
            see docs/SESSION_11_4_CHAT_LOGS_IMPLEMENTATION.md §22. */}
        {pagination && pagination.totalCount > 0 && (
          <div className="flex items-center justify-between flex-shrink-0 text-xs text-muted-foreground px-1">
            <span>
              {pagination.totalCount} total session{pagination.totalCount === 1 ? '' : 's'} · Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isFetching}
                aria-label="Previous page"
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
                aria-label="Next page"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
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
