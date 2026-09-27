import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCustomers } from '@/hooks/customers/useCustomers';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';
import { getCustomerDisplayLabel } from '@/lib/customerDisplayLabel';

const PAGE_SIZE = 25;

/**
 * Customer 360 list (plan §13/§14 of the revised Customer 360 plan).
 * Every result here is already authorized-filtered server-side — this
 * page never receives, and therefore never has to hide, a restricted
 * customer or interaction.
 *
 * Session 11.5B (docs/SCREEN_REVIEW_05_CUSTOMER_360.md §8): brought up
 * to the current VoiceForce operational-screen standard —
 * G1 (dense grid), C1 (adaptive columns), S1 (semantic status badges),
 * L1 (bounded desktop workspace). F1's floating filter panel is
 * deliberately NOT added — the review found no second real filter
 * dimension to justify one yet (search remains the one persistent
 * control; "filters are controls, not content", not added for their own
 * sake). Fixes the known pagination gap: the API already supported
 * page/pageSize, but this page never rendered pager controls or
 * incremented page — real production pagination is wired below, the
 * same pattern already established by Call Logs (Session 11.3).
 */
const Customers: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // A new search term invalidates the previous page number (it may not
  // exist under the new result set) — same discipline Call Logs applies
  // to its own server-side filters.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const { data, isLoading, isError, error, refetch, isFetching } = useCustomers(
    debouncedSearch || undefined,
    page,
  );

  const customers = data?.data ?? [];
  const totalCount = data?.pagination.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = data?.pagination.page ?? page;

  return (
    <Layout>
      {/* L1 — bounded workspace: page root fills Layout's <main>, is a
          flex column with min-h-0; everything above the record table is
          fixed height, the table alone is flex-1 + overflow-auto. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs border-border bg-card text-foreground placeholder:text-muted-foreground"
              placeholder="Search by phone, name, or CIF…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {totalCount > 0 ? `${totalCount} customer${totalCount === 1 ? '' : 's'}` : `${customers.length} shown`}
          </span>
        </div>

        {isError && (
          <div className="flex-shrink-0">
            <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={customers.length > 0} isFetching={isFetching} />
          </div>
        )}

        {data?.materializationWarning && (
          <div className="flex items-center gap-2 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-300 flex-shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Could not check for new interactions for this phone number right now: {data.materializationWarning}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError && customers.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-4">Customers are unavailable right now — see the error above.</p>
          ) : customers.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-4">
              {debouncedSearch
                ? 'No customer found for that search — either nobody with that phone number/name has called yet, or you are not authorized to see their interaction categories.'
                : 'No customers yet.'}
            </p>
          ) : (
            /* G1 dense operational grid + C1 adaptive columns: identity
               column gets the residual width (min-w-0/flex growth via
               table layout), descriptive/status columns get a bounded
               min/max rather than an arbitrary fixed width. */
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="h-9 px-3 font-medium">Customer</th>
                  <th className="h-9 px-3 font-medium text-right">Interactions</th>
                  <th className="h-9 px-3 font-medium whitespace-nowrap">Last seen</th>
                  <th className="h-9 px-3 font-medium min-w-[6rem] max-w-[10rem]">Latest outcome</th>
                  <th className="h-9 px-3 font-medium text-right">Sentiment</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const label = getCustomerDisplayLabel({
                    displayName: c.displayName,
                    sourceCustomerRef: c.sourceCustomerRef,
                    primaryPhoneMasked: c.primaryPhoneMasked,
                  });
                  const showRef = c.sourceCustomerRef && c.sourceCustomerRef !== label;
                  const outcomeVariant =
                    c.latestOutcome === 'escalated' ? 'escalated' : c.latestOutcome === 'resolved' ? 'positive' : 'secondary';
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/customers/${c.id}`, { state: { origin: 'customers' } })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/customers/${c.id}`, { state: { origin: 'customers' } });
                        }
                      }}
                    >
                      <td className="py-1.5 px-3">
                        <div className="font-medium text-foreground">
                          {label}
                          {showRef && <span className="text-xs text-muted-foreground ml-2">Ref: {c.sourceCustomerRef}</span>}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right text-foreground tabular-nums">{c.totalInteractions}</td>
                      <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">{formatTimestamp(c.lastSeen)}</td>
                      <td className="py-1.5 px-3">
                        {c.latestOutcome ? (
                          <Badge variant={outcomeVariant} className="whitespace-nowrap text-xs">
                            {formatStatusLabel(c.latestOutcome)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                        {c.latestSentimentScore !== null ? formatFractionAsPercent(c.latestSentimentScore) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalCount > 0 && (
          <div className="flex items-center justify-between flex-shrink-0 text-xs text-muted-foreground px-1">
            <span>
              {totalCount} total customer{totalCount === 1 ? '' : 's'} · Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isFetching}
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
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Customers;
