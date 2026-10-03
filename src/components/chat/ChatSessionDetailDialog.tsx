import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check, UserRound } from 'lucide-react';
import { MetricStrip, type MetricStripItem } from '@/components/common/MetricStrip';
import { SectionCard } from '@/components/interaction-detail/SectionCard';
import { ConversationTranscript, type ConversationEntry } from '@/components/interaction-detail/ConversationTranscript';
import { useChatSessionDetail } from '@/hooks/chat/useChatSessionDetail';
import { formatDurationLong, formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';

interface ChatSessionDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

/**
 * Chat Detail — rebuilt (2026-10-02) to the same "Interaction Detail"
 * architecture as Call Logs' InteractionDetailDialog: shared
 * SectionCard/ConversationTranscript primitives, MetricStrip summary
 * row, resolvedCustomerLabel-first header. Data source and semantics
 * (GET /api/v1/chat/sessions/{id}, local-fallback flag) are unchanged
 * from the prior implementation — this is a presentation-only rebuild.
 */

function speakerTreatment(role: 'user' | 'ai'): { label: string; className: string } {
  return role === 'ai'
    ? { label: 'AI', className: 'text-cyan-700 dark:text-cyan-400' }
    : { label: 'Customer', className: 'text-foreground' };
}

const CopySessionIdButton: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy session ID"
      className="inline-flex items-center justify-center p-1 -m-1 min-h-6 min-w-6 text-muted-foreground hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(sessionId);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard access denied — no crash, just no visual confirmation
        }
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </button>
  );
};

export const ChatSessionDetailDialog: React.FC<ChatSessionDetailDialogProps> = ({
  isOpen,
  onClose,
  sessionId,
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const { data, isLoading, isError } = useChatSessionDetail(sessionId ?? undefined);

  const conversationEntries: ConversationEntry[] = useMemo(() => {
    if (!data) return [];
    return data.messages.map((m) => {
      const speaker = speakerTreatment(m.role);
      const meta = m.metadata;
      return {
        key: m.id,
        speakerLabel: speaker.label,
        speakerClassName: speaker.className,
        timestamp: formatTimestamp(m.timestamp),
        text: m.text,
        metaParts: meta
          ? [
              meta.intent || null,
              meta.confidence != null ? `${formatFractionAsPercent(meta.confidence)} confidence` : null,
              meta.dataSource || null,
              meta.latencyMs != null ? `${meta.latencyMs}ms` : null,
            ].filter((p): p is string => Boolean(p))
          : [],
      };
    });
  }, [data]);

  if (!sessionId) return null;

  const session = data?.session;

  const durationSeconds =
    session && session.startedAt && session.updatedAt
      ? Math.max(0, (new Date(session.updatedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
      : undefined;

  const keyMetrics: MetricStripItem[] = session
    ? [
        { label: 'Session span', value: formatDurationLong(durationSeconds) },
        { label: 'Messages', value: session.messageCount },
        { label: 'Authenticated', value: session.authenticated ? 'Yes' : 'No' },
        {
          label: 'Intent confidence',
          value: session.latestConfidence != null ? formatFractionAsPercent(session.latestConfidence) : '—',
        },
        {
          label: 'Latest latency',
          value: session.latestLatencyMs != null ? `${session.latestLatencyMs}ms` : '—',
        },
      ]
    : [];

  const sessionContext: Array<[string, React.ReactNode]> = session
    ? [
        ['Backend Customer ID', session.customerId ?? '—'],
        ['Contact / Phone', session.contactId ?? session.phoneNumber ?? '—'],
        ['Agent', session.agentName ?? session.agentId ?? '—'],
        ['Latest intent', session.latestIntent ?? '—'],
        [
          'Latest data source',
          session.latestDataSource ? (
            <Badge variant="outline" className="text-xs">
              {session.latestDataSource}
            </Badge>
          ) : (
            '—'
          ),
        ],
        // Session 13.2 (DEC-CHAT-01) — campaignId is a real, stable id;
        // campaignName is resolved server-side via the authoritative
        // campaigns table, never fabricated. A session with a campaignId
        // but no resolvable name still navigates, labeled "Campaign".
        [
          'Campaign',
          session.campaignId ? (
            <button
              type="button"
              className="text-cyan-600 dark:text-cyan-400 hover:underline inline-block min-h-6 p-1 -m-1"
              onClick={() => navigate(`/outbound-campaigns/${session.campaignId}`)}
            >
              {session.campaignName ?? 'Campaign'}
            </button>
          ) : (
            '—'
          ),
        ],
        // Session 13.2 — isTrial is `null` (shown as —) when no local
        // record exists at all for this upstream session; `No` only when
        // a local record confirms it affirmatively, never defaulted.
        [
          'Trial',
          session.isTrial === null ? '—' : session.isTrial ? (
            <Badge variant="secondary" className="text-xs">Trial</Badge>
          ) : (
            'No'
          ),
        ],
      ]
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[85vh] max-h-[85vh] overflow-hidden flex flex-col gap-3 p-5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !session ? (
          <>
            <DialogHeader>
              <DialogTitle>Chat Session</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-destructive">Could not load this chat session.</p>
          </>
        ) : (
          <>
            <DialogHeader className="space-y-1 flex-shrink-0">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold text-foreground truncate">
                    {session.resolvedCustomerLabel ?? session.contactId ?? session.phoneNumber ?? 'Unknown chat session'}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {['Chat session', session.agentName ?? session.agentId, formatTimestamp(session.startedAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  {/* Session 13.1 (DEC-CUST-03) — only rendered when a real
                      Customer 360 id was resolved server-side. */}
                  {session.customer360Id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-border bg-transparent text-foreground hover:bg-muted"
                      onClick={() => {
                        const id = session.customer360Id as string;
                        onClose();
                        navigate(`/customers/${id}`, { state: { origin: 'chat-logs' } });
                      }}
                    >
                      <UserRound className="h-3.5 w-3.5 mr-1" />
                      Customer 360
                    </Button>
                  )}
                  <Badge variant={session.status === 'active' ? 'secondary' : 'outline'}>
                    {formatStatusLabel(session.status)}
                  </Badge>
                </div>
              </div>
              <p className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                <span className="truncate min-w-0">Session ID {session.sessionId}</span>
                <CopySessionIdButton sessionId={session.sessionId} />
              </p>
            </DialogHeader>

            <div className="flex-shrink-0">
              <MetricStrip items={keyMetrics} />
            </div>

            {session.source === 'local-fallback' && (
              <div className="rounded-md border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex-shrink-0">
                Showing this app's local operational copy — the live chat history service didn't respond.
              </div>
            )}

            <SectionCard title="Session Context">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
                {sessionContext.map(([label, value]) => (
                  <span key={label}>
                    <span className="text-muted-foreground">{label}:</span> <span className="text-foreground">{value}</span>
                  </span>
                ))}
              </div>
            </SectionCard>

            <ConversationTranscript
              entries={conversationEntries}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              emptyLabel="No messages in this session."
              enableCopyRaw
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
