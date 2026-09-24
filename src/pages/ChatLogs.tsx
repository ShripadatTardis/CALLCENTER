import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, MessageCircle } from 'lucide-react';
import { useChatLogs } from '@/hooks/chat/useChatLogs';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import { formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';

/**
 * Conceptually equivalent to Call Logs, per plan §11. Not category/role
 * filtered — Chat has no Customer 360 linkage yet (plan §13).
 */
const ChatLogs: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isFetching } = useChatLogs();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sessions = data?.data ?? [];

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
              Chat History ({sessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isError && (
              <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={sessions.length > 0} isFetching={isFetching} />
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
                      <TableHead>Started At</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>Latest Intent</TableHead>
                      <TableHead>Authenticated</TableHead>
                      <TableHead>Data Source</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Agent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedId(s.id)}
                      >
                        <TableCell className="font-mono text-xs">{s.upstreamSessionId.slice(0, 12)}…</TableCell>
                        <TableCell className="whitespace-nowrap">{formatTimestamp(s.startedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatTimestamp(s.lastActivityAt)}</TableCell>
                        <TableCell>{s.messageCount}</TableCell>
                        <TableCell>{s.latestIntent ?? '—'}</TableCell>
                        <TableCell>{s.latestAuthenticated ? 'Yes' : 'No'}</TableCell>
                        <TableCell>
                          {s.latestDataSource ? <Badge variant="outline" className="text-xs whitespace-nowrap">{s.latestDataSource}</Badge> : '—'}
                        </TableCell>
                        <TableCell>{s.latestConfidence !== null ? formatFractionAsPercent(s.latestConfidence) : '—'}</TableCell>
                        <TableCell>{s.latestLatencyMs !== null ? `${s.latestLatencyMs}ms` : '—'}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'active' ? 'secondary' : 'outline'} className="whitespace-nowrap">
                            {formatStatusLabel(s.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <ChatSessionDetailDialog
          isOpen={Boolean(selectedId)}
          onClose={() => setSelectedId(null)}
          chatSessionId={selectedId}
        />
      </div>
    </Layout>
  );
};

export default ChatLogs;
