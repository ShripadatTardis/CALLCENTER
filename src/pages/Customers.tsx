import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search, AlertTriangle } from 'lucide-react';
import { useCustomers } from '@/hooks/customers/useCustomers';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';
import { getCustomerDisplayLabel } from '@/lib/customerDisplayLabel';

/**
 * Customer 360 list (plan §13/§14 of the revised Customer 360 plan).
 * Every result here is already authorized-filtered server-side — this
 * page never receives, and therefore never has to hide, a restricted
 * customer or interaction. Session 10.2: dense operational table
 * replacing the stacked full-width button rows.
 */
const Customers: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error, refetch, isFetching } = useCustomers(
    debouncedSearch || undefined,
  );

  const customers = data?.data ?? [];

  return (
    <Layout>
      <div className="bg-slate-950 min-h-full text-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <Input
              className="h-8 pl-7 text-xs border-slate-700 bg-slate-900 text-slate-200 placeholder:text-slate-500"
              placeholder="Search by phone, name, or CIF…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-slate-500">{customers.length} shown</span>
        </div>

        {isError && (
          <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={customers.length > 0} isFetching={isFetching} />
        )}

        {data?.materializationWarning && (
          <div className="flex items-center gap-2 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Could not check for new interactions for this phone number right now: {data.materializationWarning}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : isError && customers.length === 0 ? (
          <p className="text-sm text-slate-500 px-1">Customers are unavailable right now — see the error above.</p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-slate-500 px-1">
            {debouncedSearch
              ? 'No customer found for that search — either nobody with that phone number/name has called yet, or you are not authorized to see their interaction categories.'
              : 'No customers yet.'}
          </p>
        ) : (
          <div className="rounded-md border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Interactions</th>
                  <th className="px-3 py-2 font-medium">Last seen</th>
                  <th className="px-3 py-2 font-medium">Latest outcome</th>
                  <th className="px-3 py-2 font-medium">Sentiment</th>
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
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b border-slate-800/60 last:border-0 hover:bg-slate-900/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/customers/${c.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/customers/${c.id}`);
                        }
                      }}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-100">
                          {label}
                          {showRef && <span className="text-xs text-slate-500 ml-2">Ref: {c.sourceCustomerRef}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{c.totalInteractions}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatTimestamp(c.lastSeen)}</td>
                      <td className="px-3 py-2">
                        {c.latestOutcome ? (
                          <Badge variant={c.latestOutcome === 'escalated' ? 'destructive' : 'secondary'} className="whitespace-nowrap text-xs">
                            {formatStatusLabel(c.latestOutcome)}
                          </Badge>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                        {c.latestSentimentScore !== null ? formatFractionAsPercent(c.latestSentimentScore) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Customers;
