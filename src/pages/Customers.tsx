import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Users, AlertTriangle } from 'lucide-react';
import { useCustomers } from '@/hooks/customers/useCustomers';
import { QueryErrorBanner } from '@/components/common/QueryErrorBanner';
import { formatFractionAsPercent, formatStatusLabel, formatTimestamp } from '@/lib/format';

/**
 * Customer 360 list (plan §13/§14 of the revised Customer 360 plan).
 * Every result here is already authorized-filtered server-side — this
 * page never receives, and therefore never has to hide, a restricted
 * customer or interaction.
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
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Customers</h1>
          <p className="text-muted-foreground">
            Operational view of customer interaction history — not a CRM.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Customers ({customers.length})
              </CardTitle>
              <div className="flex items-center gap-2 w-72">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Search by phone or name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isError && (
              <QueryErrorBanner error={error} onRetry={() => void refetch()} hasStaleData={customers.length > 0} isFetching={isFetching} />
            )}

            {data?.materializationWarning && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Could not check for new interactions for this phone number right now: {data.materializationWarning}
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isError && customers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Customers are unavailable right now — see the error above.
              </p>
            ) : customers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {debouncedSearch
                  ? 'No customer found for that search — either nobody with that phone number/name has called yet, or you are not authorized to see their interaction categories.'
                  : 'No customers yet.'}
              </p>
            ) : (
              <div className="space-y-2">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className="w-full text-left flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">
                        {c.displayName || 'Unknown customer'}
                        {c.sourceCustomerRef && (
                          <span className="text-xs text-muted-foreground ml-2">Ref: {c.sourceCustomerRef}</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {c.totalInteractions} visible interaction{c.totalInteractions === 1 ? '' : 's'} ·{' '}
                        Last seen {formatTimestamp(c.lastSeen)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      {c.latestOutcome && (
                        <Badge variant={c.latestOutcome === 'escalated' ? 'destructive' : 'secondary'} className="whitespace-nowrap">
                          {formatStatusLabel(c.latestOutcome)}
                        </Badge>
                      )}
                      {c.latestSentimentScore !== null && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatFractionAsPercent(c.latestSentimentScore)} sentiment
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Customers;
