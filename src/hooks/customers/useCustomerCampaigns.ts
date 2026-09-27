import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { fetchCustomerCampaigns } from '@/services/customers/customersService';

/** Session 11.5B — consumes Session 11.5A's `?action=campaigns` endpoint. */
export function useCustomerCampaigns(customerId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: customersKeys.campaigns(customerId ?? '', role),
    queryFn: () => fetchCustomerCampaigns(role, customerId as string),
    enabled: Boolean(user) && Boolean(customerId),
  });
}
