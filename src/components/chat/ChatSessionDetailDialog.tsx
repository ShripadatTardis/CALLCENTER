import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useChatSessionDetail } from '@/hooks/chat/useChatSessionDetail';
import { ChatBubble } from './ChatBubble';
import { formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';

interface ChatSessionDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

/**
 * A dialog, matching Call Logs' own InteractionDetailDialog pattern —
 * not a separate route. Session 5.1 amendment: sourced from
 * GET /api/v1/chat/sessions/{session_id}, the documented authoritative
 * source for full conversation + identity + status + auth + latest
 * intent/confidence/source/latency + timestamps. Reuses the SAME
 * ChatBubble/ChatMessageContent renderer as the live Chat Console —
 * raw message text is preserved exactly, never rewritten.
 */
export const ChatSessionDetailDialog: React.FC<ChatSessionDetailDialogProps> = ({
  isOpen,
  onClose,
  sessionId,
}) => {
  const { data, isLoading, isError } = useChatSessionDetail(sessionId ?? undefined);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Chat Session {sessionId ? `— ${sessionId.slice(0, 12)}…` : ''}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-destructive">Could not load this chat session.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 bg-slate-50 p-4 rounded-lg text-sm">
              <div><span className="text-slate-500">Agent:</span> {data.session.agentName ?? data.session.agentId ?? '—'}</div>
              <div><span className="text-slate-500">Customer:</span> {data.session.resolvedCustomerLabel ?? '—'}</div>
              {data.session.resolvedCustomerLabel && !data.session.customerId && (
                <div><span className="text-slate-500">Backend Customer ID:</span> —</div>
              )}
              <div><span className="text-slate-500">Contact / Phone:</span> {data.session.contactId ?? data.session.phoneNumber ?? '—'}</div>
              <div><span className="text-slate-500">Status:</span> {formatStatusLabel(data.session.status)}</div>
              <div><span className="text-slate-500">Started:</span> {formatTimestamp(data.session.startedAt)}</div>
              <div><span className="text-slate-500">Last activity:</span> {formatTimestamp(data.session.updatedAt)}</div>
              <div><span className="text-slate-500">Messages:</span> {data.session.messageCount}</div>
              <div><span className="text-slate-500">Authenticated:</span> {data.session.authenticated ? 'Yes' : 'No'}</div>
              <div><span className="text-slate-500">Latest intent:</span> {data.session.latestIntent ?? '—'}</div>
              <div>
                <span className="text-slate-500">Latest confidence:</span>{' '}
                {data.session.latestConfidence !== null ? formatFractionAsPercent(data.session.latestConfidence) : '—'}
              </div>
              <div>
                <span className="text-slate-500">Data source:</span>{' '}
                {data.session.latestDataSource ? <Badge variant="outline" className="text-xs">{data.session.latestDataSource}</Badge> : '—'}
              </div>
              <div><span className="text-slate-500">Latency:</span> {data.session.latestLatencyMs !== null ? `${data.session.latestLatencyMs}ms` : '—'}</div>
            </div>
            {data.session.source === 'local-fallback' && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Showing this app's local operational copy — the live chat history service didn't respond.
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3 pt-2">
              {data.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No messages in this session.</p>
              ) : (
                data.messages.map((m) => <ChatBubble key={m.id} message={m} />)
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
