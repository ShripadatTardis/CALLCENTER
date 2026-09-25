import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchCustomerList } from '@/services/customers/customersService';
import { computeCustomerAnalyticsSummary } from '@/services/analytics/customerAnalyticsAggregator';

/**
 * Session 7 §12 — small, authorized Customer 360 summary panel. Reuses
 * the existing authorized call_center_list_customers path unchanged
 * (fetchCustomerList already applies category authorization server-side,
 * Session 4/5.2) — no new authorization logic here, only reshaping.
 */
export function useCustomerAnalytics() {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  const query = useQuery({
    queryKey: ['analytics', 'customers', role],
    queryFn: () => fetchCustomerList(role, { page: 1, pageSize: 200 }),
    enabled: Boolean(user),
  });

  const summary = query.data ? computeCustomerAnalyticsSummary(query.data.data, query.data.pagination.totalCount) : null;

  return { isLoading: query.isLoading, isError: query.isError, error: query.error, summary };
}
