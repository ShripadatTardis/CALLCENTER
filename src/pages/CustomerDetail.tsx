import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Phone, RefreshCw } from 'lucide-react';
import { useCustomerDetail } from '@/hooks/customers/useCustomerDetail';
import { useCustomerInteractions } from '@/hooks/customers/useCustomerInteractions';
import { useRefreshCustomer } from '@/hooks/customers/useRefreshCustomer';
import { useQuery } from '@tanstack/react-query';
import { fetchCallData } from '@/services/calls/callsService';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { InteractionDetailDialog } from '@/components/call-logs/InteractionDetailDialog';
import { ChatSessionDetailDialog } from '@/components/chat/ChatSessionDetailDialog';
import {
  formatDurationExact,
  formatDurationLong,
  formatFractionAsPercent,
  formatStatusLabel,
  formatTimestamp,
} from '@/lib/format';
import type { Interaction } from '@/types/interaction';

const MAX_LOOKUP_PAGES = 3;
const LOOKUP_PAGE_SIZE = 100;

/**
 * /call-data has no call_id-keyed lookup param — only `search`, which
 * matches caller_number/caller_name, not call_id (confirmed live; see
 * docs/CALL_CENTRE_LIVE_VERIFICATION_POST_OUTAGE.md). So a Voice lookup
 * searches by the customer's own phone number(s) — the one field
 * `search` actually matches — and filters the (bounded, paged) results
 * down to the exact call_id. Reuses the same fetchCallData the rest of
 * the app already uses; no new endpoint.
 */
async function findCallByPhoneAndId(phoneNumbers: string[], callId: string) {
  for (const phone of phoneNumbers) {
    for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
      const result = await fetchCallData({ search: phone, page: page, page_size: LOOKUP_PAGE_SIZE });
      const match = result.interactions.find((i) => i.interactionId === callId);
      if (match) return match;
      if (page >= result.pagination.total_pages) break;
    }
  }
  return null;
}

/**
 * Reuses the existing InteractionDetailDialog (Session 2/3) and
 * ChatSessionDetailDialog (Session 5.1) rather than building a second
 * transcript/recording viewer, per plan §9's UX requirement. A Customer
 * 360 timeline row only has the fields this app's own
 * customer_interactions table stores (no recording URL, no transcript,
 * no full status/stage) — so opening a row does a small, targeted
 * lookup to get the shape each dialog expects, then hands that to the
 * dialog unmodified. Chat rows carry their own authoritative session_id
 * already (Session 5.1's chatInteractionSource writes it straight from
 * the backend), so they go directly to ChatSessionDetailDialog with no
 * extra lookup at all.
 */
const InteractionLookupDialog: React.FC<{
  interactionId: string;
  channel: string;
  phoneNumbers: string[];
  onClose: () => void;
}> = ({ interactionId, channel, phoneNumbers, onClose }) => {
  const isChat = channel === 'chat';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer360', 'voice-interaction-lookup', interactionId, phoneNumbers],
    queryFn: () => findCallByPhoneAndId(phoneNumbers, interactionId),
    enabled: !isChat,
  });
  const interaction = data;

  if (isChat) {
    return <ChatSessionDetailDialog isOpen onClose={onClose} sessionId={interactionId} />;
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-lg p-6 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading interaction…
        </div>
      </div>
    );
  }

  if (isError || !interaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-white rounded-lg p-6 max-w-sm text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          Could not load full interaction detail for {interactionId} right now.
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <InteractionDetailDialog isOpen onClose={onClose} interaction={interaction as Interaction} />
  );
};

const CustomerDetail: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [selectedInteraction, setSelectedInteraction] = useState<{ id: string; channel: string } | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useCustomerDetail(customerId);
  const interactionsQuery = useCustomerInteractions(customerId);
  const refreshMutation = useRefreshCustomer(customerId);

  const aggregate = data?.aggregate;
  const interactions = interactionsQuery.data?.data ?? [];

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/customers')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>

        {isError && (
          <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={Boolean(data)} isFetching={isFetching} />
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Customer not found, or not visible under your current access.
          </p>
        ) : (
          <>
            {data.refresh.failed && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Could not check for new interactions right now ({data.refresh.error}). Showing the last data we had.
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">{data.customer.displayName || 'Unknown customer'}</h1>
                {data.customer.sourceCustomerRef && (
                  <p className="text-muted-foreground">Ref: {data.customer.sourceCustomerRef}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">First / Last Seen</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  <div>{formatTimestamp(data.customer.firstSeen)}</div>
                  <div className="text-muted-foreground">to {formatTimestamp(data.customer.lastSeen)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Visible Interactions</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{aggregate?.totalInteractions ?? 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {aggregate?.inboundCount ?? 0} inbound · {aggregate?.outboundCount ?? 0} outbound
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Latest Intent / Outcome</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  <div>{aggregate?.latestIntent ?? '—'}</div>
                  <div className="text-muted-foreground">{aggregate?.latestOutcome ? formatStatusLabel(aggregate.latestOutcome) : '—'}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Escalations</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{aggregate?.escalationCount ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Among visible interactions</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Interaction Timeline</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {interactionsQuery.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : interactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No visible interactions for this customer.
                  </p>
                ) : (
                  interactions.map((row) => (
                    <button
                      key={row.id}
                      onClick={() => setSelectedInteraction({ id: row.interactionId, channel: row.channel })}
                      className="w-full text-left flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-gray-900">{formatTimestamp(row.startedAt)}</span>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">{row.channel}</Badge>
                          {row.direction && <Badge variant="secondary" className="text-xs whitespace-nowrap">{row.direction}</Badge>}
                        </div>
                        <div className="text-sm text-gray-600 truncate">
                          {row.agentDisplayName ?? row.agentId ?? 'Unknown agent'} · {row.intent ?? '—'} ·{' '}
                          <span title={formatDurationExact(row.durationSeconds ?? undefined)}>
                            {formatDurationLong(row.durationSeconds ?? undefined)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4 shrink-0">
                        {row.outcome && (
                          <Badge variant={row.outcome === 'escalated' ? 'destructive' : 'default'} className="whitespace-nowrap">
                            {formatStatusLabel(row.outcome)}
                          </Badge>
                        )}
                        {row.sentimentScore !== null && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatFractionAsPercent(row.sentimentScore)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}

        {selectedInteraction && (
          <InteractionLookupDialog
            interactionId={selectedInteraction.id}
            channel={selectedInteraction.channel}
            phoneNumbers={data?.phoneNumbers ?? []}
            onClose={() => setSelectedInteraction(null)}
          />
        )}
      </div>
    </Layout>
  );
};

export default CustomerDetail;
