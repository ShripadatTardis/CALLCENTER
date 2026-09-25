import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useChatLogs } from '@/hooks/chat/useChatLogs';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import { formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';

/**
 * Session 5.1 amendment: sourced from GET /api/v1/chat/sessions (the
 * documented authoritative history source), with real pagination and
 * real identity fields — no mock values. Falls back to this app's local
 * copy only when the live call fails (surfaced via the banner below).
 */
const ChatLogs: React.FC = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch, isFetching } = useChatLogs(page);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const sessions = data?.data ?? [];
  const pagination = data?.pagination;
  const isFallback = data?.source === 'local-fallback';

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Chat Logs</h1>
          <p className="text-muted-foreground">Historical text-interaction sessions.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Chat History {pagination ? `(${pagination.totalCount})` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
