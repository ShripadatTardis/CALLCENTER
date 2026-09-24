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
  chatSessionId: string | null;
}

/**
 * A dialog, matching Call Logs' own InteractionDetailDialog pattern —
 * not a separate route (plan §11). Reuses the SAME ChatBubble /
 * ChatMessageContent renderer as the live Chat Console.
 */
export const ChatSessionDetailDialog: React.FC<ChatSessionDetailDialogProps> = ({
  isOpen,
  onClose,
  chatSessionId,
}) => {
  const { data, isLoading, isError } = useChatSessionDetail(chatSessionId ?? undefined);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Chat Session {chatSessionId ? `— ${chatSessionId.slice(0, 8)}` : ''}</DialogTitle>
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
              <div><span className="text-slate-500">Started:</span> {formatTimestamp(data.session.startedAt)}</div>
              <div><span className="text-slate-500">Last activity:</span> {formatTimestamp(data.session.lastActivityAt)}</div>
              <div><span className="text-slate-500">Messages:</span> {data.session.messageCount}</div>
              <div><span className="text-slate-500">Status:</span> {formatStatusLabel(data.session.status)}</div>
              <div><span className="text-slate-500">Latest intent:</span> {data.session.latestIntent ?? '—'}</div>
              <div>
                <span className="text-slate-500">Latest confidence:</span>{' '}
                {data.session.latestConfidence !== null ? formatFractionAsPercent(data.session.latestConfidence) : '—'}
              </div>
              <div><span className="text-slate-500">Authenticated:</span> {data.session.latestAuthenticated ? 'Yes' : 'No'}</div>
              <div>
                <span className="text-slate-500">Data source:</span>{' '}
                {data.session.latestDataSource ? <Badge variant="outline" className="text-xs">{data.session.latestDataSource}</Badge> : '—'}
              </div>
              <div><span className="text-slate-500">Customer:</span> —</div>
              <div><span className="text-slate-500">Agent:</span> —</div>
            </div>

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
