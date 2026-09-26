import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricStrip } from '@/components/common/MetricStrip';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
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
import { getCustomerDisplayLabel } from '@/lib/customerDisplayLabel';
import { useClassification } from '@/hooks/classification/useClassification';
import { groupInteractions } from '@/lib/interactionGrouping';
import { GroupedInteractionTree, type SelectedGroup } from '@/components/classification/GroupedInteractionTree';

const MAX_LOOKUP_PAGES = 3;
const LOOKUP_PAGE_SIZE = 100;
/**
 * Session 7.1 §17: the timeline grouping needs branch counts to sum to
 * this customer's authorized visible total, so the grouping fetch uses
 * a bounded page large enough to cover realistic per-customer interaction
 * counts in one request (not an unbounded fetch-all loop) rather than
 * the timeline's own default small page.
 */
const GROUPING_PAGE_SIZE = 500;

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
        <div className="bg-card rounded-lg p-6 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading interaction…
        </div>
      </div>
    );
  }

  if (isError || !interaction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-card rounded-lg p-6 max-w-sm text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
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
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useCustomerDetail(customerId);
  const interactionsQuery = useCustomerInteractions(customerId, 1, GROUPING_PAGE_SIZE);
  const refreshMutation = useRefreshCustomer(customerId);
  const classification = useClassification();

  const aggregate = data?.aggregate;
  const allInteractions = interactionsQuery.data?.data ?? [];
  const interactionsTotalCount = interactionsQuery.data?.pagination.totalCount ?? allInteractions.length;
  // The grouping fetch itself may still be a partial page if a customer
  // has more interactions than GROUPING_PAGE_SIZE — never silently
  // present that as the true total (plan §17).
  const groupingIsExhaustive = allInteractions.length >= interactionsTotalCount;

  const grouped = React.useMemo(
    () =>
      groupInteractions(
        allInteractions.map((i) => ({ agentId: i.agentId ?? null, channel: i.channel === 'chat' ? ('chat' as const) : ('voice' as const) })),
        classification.data,
        classification.agentsById,
      ),
    [allInteractions, classification.data, classification.agentsById],
  );

  const interactions = selectedGroup
    ? allInteractions.filter((i) => (i.agentId ?? null) === selectedGroup.agentId && (i.channel === 'chat' ? 'chat' : 'voice') === selectedGroup.channel)
    : allInteractions;

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <Button variant="ghost" size="sm" className="h-7 -ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate('/customers')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back to Customers
        </Button>

        {isError && (
          <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={Boolean(data)} isFetching={isFetching} />
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground px-1">Customer not found, or not visible under your current access.</p>
        ) : (() => {
          const displayLabel = getCustomerDisplayLabel({
            displayName: data.customer.displayName,
            sourceCustomerRef: data.customer.sourceCustomerRef,
            rawPrimaryPhone: data.phoneNumbers?.[0] ?? null,
          });
          return (
          <>
            {data.refresh.failed && (
              <div className="rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
                Could not check for new interactions right now ({data.refresh.error}). Showing the last data we had.
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-slate-50">{displayLabel}</h1>
                {data.customer.sourceCustomerRef && data.customer.sourceCustomerRef !== displayLabel && (
                  <p className="text-xs text-muted-foreground">Ref: {data.customer.sourceCustomerRef}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <MetricStrip
              items={[
                { label: 'First seen', value: formatTimestamp(data.customer.firstSeen) },
                { label: 'Last seen', value: formatTimestamp(data.customer.lastSeen) },
                { label: 'Visible interactions', value: aggregate?.totalInteractions ?? 0, hint: `${aggregate?.inboundCount ?? 0} inbound · ${aggregate?.outboundCount ?? 0} outbound` },
                { label: 'Latest intent', value: aggregate?.latestIntent ?? '—' },
                { label: 'Latest outcome', value: aggregate?.latestOutcome ? formatStatusLabel(aggregate.latestOutcome) : '—' },
                { label: 'Escalations', value: aggregate?.escalationCount ?? 0, tone: (aggregate?.escalationCount ?? 0) > 0 ? 'warning' : 'default' },
              ]}
            />

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-1">
                Interaction timeline — grouped by authorized Category/Agent/Channel.
                {!groupingIsExhaustive && ` Counts cover the first ${allInteractions.length} of ${interactionsTotalCount} interactions.`}
              </p>
              {interactionsQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : allInteractions.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1 py-4">No visible interactions for this customer.</p>
              ) : (
                <>
                  <GroupedInteractionTree
                    group={grouped}
                    selected={selectedGroup}
                    onSelect={setSelectedGroup}
                    countsAreExhaustive={groupingIsExhaustive}
                  />
                  {interactions.length === 0 && (
                    <p className="text-sm text-muted-foreground px-1 py-4">No interactions in the selected group.</p>
                  )}
                </>
              )}
              {allInteractions.length > 0 && interactions.length > 0 && (
                <div className="rounded-md border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Time</th>
                        <th className="px-3 py-2 font-medium">Channel</th>
                        <th className="px-3 py-2 font-medium">Agent</th>
                        <th className="px-3 py-2 font-medium">Intent</th>
                        <th className="px-3 py-2 font-medium">Duration</th>
                        <th className="px-3 py-2 font-medium">Outcome</th>
                        <th className="px-3 py-2 font-medium">Sentiment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interactions.map((row) => (
                        <tr
                          key={row.id}
                          className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedInteraction({ id: row.interactionId, channel: row.channel })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedInteraction({ id: row.interactionId, channel: row.channel });
                            }
                          }}
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-foreground">{formatTimestamp(row.startedAt)}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs whitespace-nowrap border-slate-600 text-foreground">{row.channel}</Badge>
                            {row.direction && <Badge variant="secondary" className="text-xs whitespace-nowrap ml-1">{row.direction}</Badge>}
                          </td>
                          <td className="px-3 py-2 text-foreground whitespace-nowrap">{row.agentDisplayName ?? row.agentId ?? 'Unknown agent'}</td>
                          <td className="px-3 py-2 text-foreground">{row.intent ?? '—'}</td>
                          <td className="px-3 py-2 text-foreground whitespace-nowrap" title={formatDurationExact(row.durationSeconds ?? undefined)}>
                            {formatDurationLong(row.durationSeconds ?? undefined)}
                          </td>
                          <td className="px-3 py-2">
                            {row.outcome ? (
                              <Badge variant={row.outcome === 'escalated' ? 'destructive' : 'default'} className="whitespace-nowrap text-xs">
                                {formatStatusLabel(row.outcome)}
                              </Badge>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {row.sentimentScore !== null ? formatFractionAsPercent(row.sentimentScore) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
          );
        })()}

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
