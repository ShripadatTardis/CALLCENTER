import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricStrip } from '@/components/common/MetricStrip';
import { FilterPopover } from '@/components/common/FilterPopover';
import { ArrowLeft, Loader2, Mic, Plus, RefreshCw } from 'lucide-react';
import { CustomerActivityPanel } from '@/components/customers/CustomerActivityPanel';
import { ActivityComposerDialog } from '@/components/customers/ActivityComposerDialog';
import { useCustomerDetail } from '@/hooks/customers/useCustomerDetail';
import { useCustomerInteractions } from '@/hooks/customers/useCustomerInteractions';
import { useCustomerCampaigns } from '@/hooks/customers/useCustomerCampaigns';
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
import type { CustomerCampaignRow, CustomerInteractionRow } from '@/types/customer';
import { getCustomerDisplayLabel, maskPhoneLast4 } from '@/lib/customerDisplayLabel';
import { useAuth } from '@/contexts/AuthContext';
import { useClassification } from '@/hooks/classification/useClassification';
import { groupInteractions } from '@/lib/interactionGrouping';
import { GroupedInteractionTree, type SelectedGroup } from '@/components/classification/GroupedInteractionTree';
import { resolveDetailOrigin, type DetailNavigationState } from '@/lib/detailOrigin';

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

/** Session 13.1.1 §8 — tightened from p-3/space-y-2 to p-2/space-y-1 so
 * Identity & Contact reads as a compact information strip rather than a
 * large card, without dropping any exposed field. */
const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="rounded-md border border-border bg-card p-2 space-y-1">
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
    </div>
    {children}
  </div>
);

/**
 * /call-data has no call_id-keyed lookup param — only `search`, which
 * matches caller_number/caller_name, not call_id (confirmed live; see
 * docs/CALL_CENTRE_LIVE_VERIFICATION_POST_OUTAGE.md). So a Voice lookup
 * searches by the customer's own phone number(s) — the one field
 * `search` actually matches — and filters the (bounded, paged) results
 * down to the exact call_id. Reuses the same fetchCallData the rest of
 * the app already uses; no new endpoint.
 *
 * Session 13.1 fix — this function was calling fetchCallData() with no
 * `role`, which defaults to 'unauthenticated'. api/calls/data.ts applies
 * server-side category authorization keyed on that role and strips every
 * row whose agent isn't in the caller's authorized set — for
 * 'unauthenticated' that's every row (confirmed live: an unauthenticated
 * /api/calls/data request for a real phone with real calls returns
 * `total_records: 75, calls: []`), so this lookup always failed with
 * "Could not load full interaction detail" regardless of which
 * interaction was clicked. CampaignDetail.tsx's own InteractionLookupDialog
 * hit and fixed this exact bug previously (its own doc comment describes
 * it) — this is the same fix applied here, reusing the session's real
 * role via useAuth(), not a new lookup variant.
 */
async function findCallByPhoneAndId(phoneNumbers: string[], callId: string, role: string) {
  for (const phone of phoneNumbers) {
    for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
      const result = await fetchCallData({ search: phone, page: page, page_size: LOOKUP_PAGE_SIZE }, role);
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
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer360', 'voice-interaction-lookup', interactionId, phoneNumbers, role],
    queryFn: () => findCallByPhoneAndId(phoneNumbers, interactionId, role),
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

/**
 * Session 11.5A/11.5B — "Current Result" means the result referenced by
 * the target's CURRENT `effectiveResultId`: the latest successfully
 * reconciled attempt (confirmed policy,
 * docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md §A — "latest attempt
 * wins", never best-result/first-success/any ranking). This mirrors
 * CampaignDetail.tsx's `reconciliationLabel` exactly (same underlying
 * semantics, same fallback ladder) — not a new/alternative policy
 * invented for Customer Detail.
 */
function currentResultLabel(target: CustomerCampaignRow): string {
  if (target.effectiveResultId) return target.campaignResultLabel ?? 'Classified';
  switch (target.latestReconciliationStatus) {
    case 'reconciled':
      return 'Reconciled';
    case 'unresolved':
      return 'Could not be matched to a call';
    case 'error':
      return 'Reconciliation error';
    case 'pending':
      return target.latestExecutionStatus ? 'Awaiting reconciliation' : 'Not yet contacted';
    default:
      return 'Not yet contacted';
  }
}

function currentResultBadgeVariant(target: CustomerCampaignRow): 'positive' | 'escalated' | 'warning' | 'secondary' | 'outline' {
  if (target.effectiveResultId) {
    if (target.resultIsSuccess === true) return 'positive';
    if (target.resultIsSuccess === false) return 'escalated';
    return 'secondary';
  }
  if (target.latestReconciliationStatus === 'unresolved') return 'warning';
  return 'outline';
}

/**
 * Session 11.5B — L1 note: this page keeps ordinary page-level scroll
 * (min-h-full) rather than a single strict zero-delta L1 region. Unlike
 * Customer Index (a genuinely unbounded, backend-record-count-driven
 * list — L1 required and implemented there), Customer Detail's own
 * interaction/campaign volume per customer is bounded in practice
 * (max ~566 interactions across ALL 26 customers combined, and campaign
 * participation is a handful of rows per customer per §12 of the
 * Session 11.5 review). Forcing a single shared scroll region across
 * four independent sections would need a tabbed/panel redesign larger
 * than this session's scope (§17's "document the deviation" escape
 * hatch) — the compact sections below already avoid the "long CRM
 * profile page" failure mode the standard is actually guarding against.
 */
const CustomerDetail: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // N1 — origin-aware navigation. Today Customers.tsx is the only
  // screen that links here, so this always resolves to 'customers' in
  // practice; the mechanism itself (src/lib/detailOrigin.ts) is the
  // same one AI Agents/Dashboard/Live View already use, extended with
  // one additive 'customers' entry rather than a parallel mechanism.
  const returnTo = resolveDetailOrigin((location.state as DetailNavigationState | null)?.origin, 'customers');
  const [selectedInteraction, setSelectedInteraction] = useState<{ id: string; channel: string } | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);
  // Session 13.1.1 — Interaction History's "+ Activity" row action opens
  // the SAME ActivityComposerDialog the Customer-level "Add activity"
  // button uses (addendum §6: one shared form, not two implementations),
  // just with this row's data bound as interactionContext.
  const [activityComposerInteraction, setActivityComposerInteraction] = useState<CustomerInteractionRow | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useCustomerDetail(customerId);
  const interactionsQuery = useCustomerInteractions(customerId, 1, GROUPING_PAGE_SIZE);
  const campaignsQuery = useCustomerCampaigns(customerId);
  const refreshMutation = useRefreshCustomer(customerId);
  const classification = useClassification();

  const aggregate = data?.aggregate;
  const allInteractions = React.useMemo(() => interactionsQuery.data?.data ?? [], [interactionsQuery.data]);
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

  const campaigns = campaignsQuery.data?.data ?? [];
  // Session 13.1.1 — reused by CustomerActivityPanel to resolve a
  // compact provenance label for interaction-linked activities, from
  // data already loaded on this page (no new fetch). Keyed by the
  // internal `row.id` (customer_interactions.id) — the same value
  // customer_activities.interaction_id's foreign key references and the
  // same value ActivityComposerDialog now binds — NOT `row.interactionId`
  // (the external call_sid/session_id used only for Call/Chat Detail
  // lookups).
  const interactionsById = React.useMemo(
    () => new Map(allInteractions.map((row) => [row.id, row] as const)),
    [allInteractions],
  );

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-4 space-y-2">
        <Button variant="ghost" size="sm" className="h-7 -ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate(returnTo.path)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back to {returnTo.label}
        </Button>

        {isError && (
          <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={Boolean(data)} isFetching={isFetching} />
        )}

        {isLoading ? (
          <div className="flex justify-center py-12" role="status" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="sr-only">Loading customer…</span>
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
              <div className="rounded-md border border-amber-600/50 bg-amber-500/10 dark:border-amber-500/40 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Could not check for new interactions right now ({data.refresh.error}). Showing the last data we had.
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-foreground">{displayLabel}</h1>
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

            {/* 1. Identity & Contact — only existing canonical Customer 360
                identity/contact fields already returned by the current
                APIs; phone numbers are the same raw values already fetched
                for interaction lookup, masked for display via the same
                helper the list page/identity label already use — never
                shown unmasked. */}
            <SectionCard title="Identity & Contact">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">Customer ref</span>
                  <span className="text-foreground">{data.customer.sourceCustomerRef ?? '—'}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">Phone</span>
                  <span className="text-foreground">
                    {data.phoneNumbers && data.phoneNumbers.length > 0
                      ? data.phoneNumbers.map((p) => maskPhoneLast4(p) ?? '—').join(', ')
                      : '—'}
                  </span>
                </div>
                {/* Session 13.1 (DEC-CUST-01) — channels/authSummary/
                    latestAgent were already fetched into `aggregate` by
                    this same request; only the rendering was missing. */}
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">Channels used</span>
                  <span className="text-foreground">
                    {aggregate?.channels && aggregate.channels.length > 0
                      ? aggregate.channels.map((c) => formatStatusLabel(c)).join(', ')
                      : '—'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">Authentication</span>
                  <span className="text-foreground">
                    {aggregate?.authSummary.everAuthenticated
                      ? `Yes${aggregate.authSummary.lastAuthenticatedAt ? ` · last ${formatTimestamp(aggregate.authSummary.lastAuthenticatedAt)}` : ''}`
                      : 'No authentication evidence on record'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">Latest agent</span>
                  <span className="text-foreground">
                    {aggregate?.latestAgentDisplayName ?? aggregate?.latestAgentId ?? '—'}
                  </span>
                </div>
              </div>
            </SectionCard>

            {/* 4. Existing Customer 360 summary/aggregate information —
                unchanged from the prior implementation; only the
                authorized aggregates already confirmed safe by the
                Session 11.5 review. */}
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

            {/* 3. Activity / Diary — NEW (Session 13.1, DEC-CUST-02).
                Closes the fully-built-but-unconsumed Activity backend
                found in Phase 2/3 of the audit. Placed directly after
                Identity & Contact/Summary and before Interaction History
                per explicit correction — a customer with dozens of
                interactions must not bury this behind that list. See
                src/components/customers/CustomerActivityPanel.tsx. */}
            <CustomerActivityPanel
              customerId={data.customer.id}
              interactionsById={interactionsById}
              onOpenInteraction={(id, channel) => setSelectedInteraction({ id, channel })}
            />

            {/* 4. Interaction History — G1 dense grid, S1 status badges.
                The Domain->Category->Agent grouping tree is no longer
                always-on preamble; it moves into an F1-style optional
                filter, the same treatment Call Logs 11.3A already
                established for exactly this situation ("grouping is
                optional; when narrowing by a dimension is the real task,
                use it as a filter"). The underlying classification model
                and GroupedInteractionTree component are unchanged. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Interaction History</div>
                {allInteractions.length > 0 && (
                  <FilterPopover
                    title="Group by Category / Agent / Channel"
                    activeCount={selectedGroup ? 1 : 0}
                    onClear={() => setSelectedGroup(null)}
                  >
                    <GroupedInteractionTree
                      group={grouped}
                      selected={selectedGroup}
                      onSelect={setSelectedGroup}
                      countsAreExhaustive={groupingIsExhaustive}
                      collapsedByDefault
                    />
                  </FilterPopover>
                )}
              </div>
              {!groupingIsExhaustive && (
                <p className="text-xs text-muted-foreground px-1">
                  Grouping counts cover the first {allInteractions.length} of {interactionsTotalCount} interactions.
                </p>
              )}
              {interactionsQuery.isLoading ? (
                <div className="flex justify-center py-8" role="status" aria-live="polite">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="sr-only">Loading interaction history…</span>
                </div>
              ) : allInteractions.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1 py-4">No visible interactions for this customer.</p>
              ) : interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1 py-4">No interactions in the selected group.</p>
              ) : (
                <div className="rounded-md border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="h-9 px-3 font-medium whitespace-nowrap">Time</th>
                        <th className="h-9 px-3 font-medium">Channel</th>
                        <th className="h-9 px-3 font-medium min-w-[7rem] max-w-[14rem]">Agent</th>
                        <th className="h-9 px-3 font-medium">Intent</th>
                        <th className="h-9 px-3 font-medium text-right">Duration</th>
                        <th className="h-9 px-3 font-medium min-w-[6rem] max-w-[10rem]">Outcome</th>
                        <th className="h-9 px-3 font-medium text-right">Sentiment</th>
                        <th className="h-9 px-3 font-medium text-center" title="Recording available">Rec</th>
                        <th className="h-9 px-3 font-medium">Escalation</th>
                        <th className="h-9 px-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interactions.map((row) => {
                        const outcomeVariant =
                          row.outcome === 'escalated' ? 'escalated' : row.outcome === 'resolved' ? 'positive' : 'secondary';
                        return (
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
                          <td className="py-1.5 px-3 whitespace-nowrap text-foreground">{formatTimestamp(row.startedAt)}</td>
                          <td className="py-1.5 px-3">
                            <Badge variant="outline" className="text-xs whitespace-nowrap border-border text-foreground">{row.channel}</Badge>
                            {row.direction && <Badge variant="secondary" className="text-xs whitespace-nowrap ml-1">{row.direction}</Badge>}
                          </td>
                          <td className="py-1.5 px-3 text-foreground whitespace-nowrap">{row.agentDisplayName ?? row.agentId ?? 'Unknown agent'}</td>
                          <td className="py-1.5 px-3 text-foreground">{row.intent ?? '—'}</td>
                          <td className="py-1.5 px-3 text-right text-foreground whitespace-nowrap tabular-nums" title={formatDurationExact(row.durationSeconds ?? undefined)}>
                            {formatDurationLong(row.durationSeconds ?? undefined)}
                          </td>
                          <td className="py-1.5 px-3">
                            {row.outcome ? (
                              <Badge variant={outcomeVariant} className="whitespace-nowrap text-xs">
                                {formatStatusLabel(row.outcome)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">
                            {row.sentimentScore !== null ? formatFractionAsPercent(row.sentimentScore) : '—'}
                          </td>
                          {/* Session 13.1 (DEC-CUST-01) — recordingAvailable
                              is a real boolean (never ambiguous); a dash
                              means the backend reported no recording, not
                              "unknown". escalationTrigger is nullable and
                              its null case is NOT asserted as "Not
                              escalated" — only the actual trigger value,
                              when present, is shown (plan §15). */}
                          <td className="py-1.5 px-3 text-center">
                            {row.recordingAvailable ? (
                              <Mic className="h-3.5 w-3.5 text-foreground inline-block" role="img" aria-label="Recording available" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap max-w-[10rem] truncate" title={row.escalationTrigger ?? undefined}>
                            {row.escalationTrigger ?? '—'}
                          </td>
                          {/* Session 13.1.1 §3/§7 — extensible Action
                              column; only "+ Activity" for this session.
                              Both onClick AND onKeyDown stop propagation:
                              the row's own role="button" handler listens
                              for Enter/Space on keydown, and that bubbles
                              up from this real nested <button> BEFORE the
                              browser's synthesized click — stopping only
                              the click left keyboard activation of this
                              button opening the row's Call/Chat Detail
                              dialog instead (HIG review finding). */}
                          <td className="py-1.5 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivityComposerInteraction(row);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation();
                                }
                              }}
                            >
                              <Plus className="h-3 w-3 mr-0.5" />
                              Activity
                            </Button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 5. Campaign Participation / History — NEW (Session 11.5B
                §C.3). Consumes Session 11.5A's customer-scoped campaign
                endpoint; every field here traces to real
                campaign_targets/executions/results data, no invented
                aggregate. "Current Result" is used deliberately, never an
                unqualified "Result" — see currentResultLabel above. Not a
                second campaign log: a compact, customer-scoped slice of
                the same target/execution/result data Campaign Detail
                already shows campaign-wide. Enhanced Call Centre Actual
                Outcome / structured outputs are NOT rendered — those
                fields don't exist on today's live contract, and no
                placeholder/speculative column is shown for them. */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Campaign Participation</div>
              {campaignsQuery.isLoading ? (
                <div className="flex justify-center py-8" role="status" aria-live="polite">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="sr-only">Loading campaign participation…</span>
                </div>
              ) : campaignsQuery.isError ? (
                <p className="text-sm text-muted-foreground px-1 py-2">Campaign history is unavailable right now.</p>
              ) : campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1 py-2">This customer has not been part of any campaign.</p>
              ) : (
                <div className="rounded-md border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="h-9 px-3 font-medium">Campaign</th>
                        <th className="h-9 px-3 font-medium min-w-[7rem] max-w-[14rem]">Call Agent</th>
                        <th className="h-9 px-3 font-medium min-w-[6rem] max-w-[9rem]">Target Status</th>
                        <th className="h-9 px-3 font-medium text-right">Attempts</th>
                        <th className="h-9 px-3 font-medium min-w-[6rem] max-w-[10rem]">Latest Execution</th>
                        <th className="h-9 px-3 font-medium min-w-[7rem] max-w-[14rem]">Current Result</th>
                        <th className="h-9 px-3 font-medium whitespace-nowrap">Follow-up</th>
                        <th className="h-9 px-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((target) => (
                        <tr key={target.id} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5 px-3 text-foreground">{target.campaignName}</td>
                          <td className="py-1.5 px-3 text-foreground whitespace-nowrap">{target.campaignAgentName ?? target.campaignAgentId}</td>
                          <td className="py-1.5 px-3">
                            <Badge variant="outline" className="text-xs whitespace-nowrap border-border text-foreground">
                              {formatStatusLabel(target.status)}
                            </Badge>
                          </td>
                          <td className="py-1.5 px-3 text-right text-muted-foreground tabular-nums">{target.attemptCount}</td>
                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                            {target.latestExecutionStatus ? formatStatusLabel(target.latestExecutionStatus) : '—'}
                          </td>
                          <td className="py-1.5 px-3">
                            <Badge variant={currentResultBadgeVariant(target)} className="whitespace-nowrap text-xs">
                              {currentResultLabel(target)}
                            </Badge>
                          </td>
                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                            {target.status === 'follow_up_due' && target.nextActionAt ? formatTimestamp(target.nextActionAt) : '—'}
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            {target.latestReconciledInteractionId ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-cyan-600 dark:text-cyan-400 hover:bg-muted"
                                onClick={() => setSelectedInteraction({ id: target.latestReconciledInteractionId as string, channel: 'voice' })}
                              >
                                View call
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
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

        {activityComposerInteraction && data && (
          <ActivityComposerDialog
            open
            onClose={() => setActivityComposerInteraction(null)}
            customerId={data.customer.id}
            interactionContext={activityComposerInteraction}
          />
        )}
      </div>
    </Layout>
  );
};

export default CustomerDetail;
