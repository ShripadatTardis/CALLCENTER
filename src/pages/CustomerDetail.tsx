import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterPopover } from '@/components/common/FilterPopover';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Mic, Plus, RefreshCw } from 'lucide-react';
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
import { typography } from '@/lib/typography';

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
 * Session 13.6-adjacent fix (user-reported) — Interaction History has no
 * cap on how many rows it renders at once (it shows the full, already-
 * fetched `interactions` array), unlike Call Logs/Chat Logs which both
 * paginate. A customer with dozens of interactions turned this into a
 * long unbroken scroll. This is a client-side page of the already-loaded
 * data (not a new server request — GROUPING_PAGE_SIZE above already
 * fetches the full bounded set in one request), deliberately different
 * from Call Logs' server-side pagination for that reason.
 */
const INTERACTION_HISTORY_PAGE_SIZE = 25;


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
 * Session 11.5B — L1 note: this page deliberately avoided a multi-pane
 * split-scroll (Pattern A) redesign since its interaction/campaign
 * volume per customer is bounded in practice. Superseded in part by the
 * app-wide viewport-framing correction (follow-up to Session 15): the
 * page root is now still the single scroll region (Pattern B — not a
 * Pattern A multi-section split, so the original reasoning above still
 * holds for *that* choice), but it now scrolls WITHIN Layout's `<main>`
 * (`h-full min-h-0 overflow-y-auto`) instead of growing the browser
 * document — the actual bug the app-wide correction fixes.
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
  const [interactionHistoryPage, setInteractionHistoryPage] = useState(1);
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
  const interactionHistoryTotalPages = Math.max(1, Math.ceil(interactions.length / INTERACTION_HISTORY_PAGE_SIZE));
  const interactionHistoryCurrentPage = Math.min(interactionHistoryPage, interactionHistoryTotalPages);
  const pagedInteractions = interactions.slice(
    (interactionHistoryCurrentPage - 1) * INTERACTION_HISTORY_PAGE_SIZE,
    interactionHistoryCurrentPage * INTERACTION_HISTORY_PAGE_SIZE,
  );

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
      <div className="bg-background h-full min-h-0 overflow-y-auto text-foreground p-4 space-y-2">
        <Button variant="ghost" size="xs" className="-ml-2 text-muted-foreground hover:text-foreground hover:bg-card" onClick={() => navigate(returnTo.path)}>
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

            {/* Session 13.2 — consolidated Customer header. Replaces the
                prior three-layer presentation (heading row + a bordered
                "Identity & Contact" SectionCard + a separate MetricStrip)
                with one compact bordered block. No field removed and no
                data semantics changed — every value below is the exact
                same aggregate/customer data the prior three blocks read,
                just laid out densely. The standalone "IDENTITY & CONTACT"
                section title is dropped since the heading row already
                establishes that context. */}
            <div className="rounded-md border border-border bg-card px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h1 className={`${typography.pageTitle} leading-tight min-w-0 truncate`} title={displayLabel}>{displayLabel}</h1>
                <Button
                  variant="outline"
                  size="xs"
                  className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground flex-shrink-0"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {/* Row 2 — identity/contact context (was the separate
                  "Identity & Contact" card). Phone stays masked via the
                  same helper used everywhere else — never shown unmasked.
                  Session 13.1 (DEC-CUST-01)'s channels/authSummary/
                  latestAgent fields are unchanged, only relocated. */}
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs border-t border-border/60 pt-1.5">
                {data.customer.sourceCustomerRef && (
                  <span><span className="text-muted-foreground">Ref</span> <span className="text-foreground">{data.customer.sourceCustomerRef}</span></span>
                )}
                <span>
                  <span className="text-muted-foreground">Phone</span>{' '}
                  <span className="text-foreground">
                    {data.phoneNumbers && data.phoneNumbers.length > 0
                      ? data.phoneNumbers.map((p) => maskPhoneLast4(p) ?? '—').join(', ')
                      : '—'}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Channels</span>{' '}
                  <span className="text-foreground">
                    {aggregate?.channels && aggregate.channels.length > 0
                      ? aggregate.channels.map((c) => formatStatusLabel(c)).join(', ')
                      : '—'}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Authentication</span>{' '}
                  <span className="text-foreground">
                    {aggregate?.authSummary.everAuthenticated
                      ? `Yes${aggregate.authSummary.lastAuthenticatedAt ? ` · last ${formatTimestamp(aggregate.authSummary.lastAuthenticatedAt)}` : ''}`
                      : 'No evidence on record'}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Latest agent</span>{' '}
                  <span className="text-foreground">{aggregate?.latestAgentDisplayName ?? aggregate?.latestAgentId ?? '—'}</span>
                </span>
              </div>

              {/* Row 3 — summary metrics (was the separate MetricStrip).
                  Same six values, same source (`aggregate`/`data.customer`),
                  dense inline presentation instead of MetricStrip's larger
                  card-style treatment. */}
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs border-t border-border/60 pt-1.5">
                <span><span className="text-muted-foreground">First seen</span> <span className="text-foreground">{formatTimestamp(data.customer.firstSeen)}</span></span>
                <span><span className="text-muted-foreground">Last seen</span> <span className="text-foreground">{formatTimestamp(data.customer.lastSeen)}</span></span>
                <span>
                  <span className="text-muted-foreground">Visible interactions</span>{' '}
                  <span className="text-foreground font-medium tabular-nums">{aggregate?.totalInteractions ?? 0}</span>{' '}
                  <span className="text-muted-foreground">({aggregate?.inboundCount ?? 0} in · {aggregate?.outboundCount ?? 0} out)</span>
                </span>
                <span><span className="text-muted-foreground">Latest intent</span> <span className="text-foreground">{aggregate?.latestIntent ?? '—'}</span></span>
                <span><span className="text-muted-foreground">Latest outcome</span> <span className="text-foreground">{aggregate?.latestOutcome ? formatStatusLabel(aggregate.latestOutcome) : '—'}</span></span>
                <span>
                  <span className="text-muted-foreground">Escalations</span>{' '}
                  {/* VoiceForce design system — neutral data-value rule: an
                      ordinary count is not a status badge/warning, so it
                      stays plain foreground regardless of value. */}
                  <span className="font-medium tabular-nums text-foreground">
                    {aggregate?.escalationCount ?? 0}
                  </span>
                </span>
              </div>
            </div>

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
                <div className={`${typography.sectionTitle} px-1`}>Interaction History</div>
                {allInteractions.length > 0 && (
                  <FilterPopover
                    title="Group by Category / Agent / Channel"
                    activeCount={selectedGroup ? 1 : 0}
                    onClear={() => {
                      setSelectedGroup(null);
                      setInteractionHistoryPage(1);
                    }}
                  >
                    <GroupedInteractionTree
                      group={grouped}
                      selected={selectedGroup}
                      onSelect={(group) => {
                        setSelectedGroup(group);
                        setInteractionHistoryPage(1);
                      }}
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
                <div className="rounded-md border border-border overflow-x-auto overflow-y-auto max-h-[18rem]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className={`border-b border-border text-left ${typography.tableHeader}`}>
                        <th className="h-9 px-3 whitespace-nowrap">Time</th>
                        <th className="h-9 px-3">Channel</th>
                        <th className="h-9 px-3 min-w-[7rem] max-w-[14rem]">Agent</th>
                        <th className="h-9 px-3">Intent</th>
                        <th className="h-9 px-3 text-right">Duration</th>
                        <th className="h-9 px-3 min-w-[6rem] max-w-[10rem]">Outcome</th>
                        <th className="h-9 px-3 text-right">Sentiment</th>
                        <th className="h-9 px-3 text-center" title="Recording available">Rec</th>
                        <th className="h-9 px-3">Escalation</th>
                        <th className="h-9 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className={typography.tableBody}>
                      {pagedInteractions.map((row) => {
                        const outcomeVariant =
                          row.outcome === 'escalated' ? 'escalated' : row.outcome === 'resolved' ? 'positive' : 'secondary';
                        return (
                        <tr
                          key={row.id}
                          className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-card focus-visible:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
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
                          <td className="py-1.5 px-3 whitespace-nowrap">
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
              {interactions.length > INTERACTION_HISTORY_PAGE_SIZE && (
                <div className="flex items-center justify-between flex-shrink-0 text-xs text-muted-foreground px-1">
                  <span role="status" aria-live="polite">
                    {interactions.length} interaction{interactions.length === 1 ? '' : 's'} · Page{' '}
                    {interactionHistoryCurrentPage} of {interactionHistoryTotalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      onClick={() => setInteractionHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={interactionHistoryCurrentPage <= 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      className="border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      onClick={() => setInteractionHistoryPage((p) => Math.min(interactionHistoryTotalPages, p + 1))}
                      disabled={interactionHistoryCurrentPage >= interactionHistoryTotalPages}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
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
              <div className={`${typography.sectionTitle} px-1`}>Campaign Participation</div>
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
                      <tr className={`border-b border-border text-left ${typography.tableHeader}`}>
                        <th className="h-9 px-3">Campaign</th>
                        <th className="h-9 px-3 min-w-[7rem] max-w-[14rem]">Call Agent</th>
                        <th className="h-9 px-3 min-w-[6rem] max-w-[9rem]">Target Status</th>
                        <th className="h-9 px-3 text-right">Attempts</th>
                        <th className="h-9 px-3 min-w-[6rem] max-w-[10rem]">Latest Execution</th>
                        <th className="h-9 px-3 min-w-[7rem] max-w-[14rem]">Current Result</th>
                        <th className="h-9 px-3 whitespace-nowrap">Follow-up</th>
                        <th className="h-9 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className={typography.tableBody}>
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
                                size="xs"
                                className="text-cyan-600 dark:text-cyan-400 hover:bg-muted"
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
