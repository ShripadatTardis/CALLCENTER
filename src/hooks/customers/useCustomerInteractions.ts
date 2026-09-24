import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { fetchCustomerInteractions } from '@/services/customers/customersService';

export function useCustomerInteractions(customerId: string | undefined, page = 1) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: customersKeys.interactions(customerId ?? '', page, role),
    queryFn: () => fetchCustomerInteractions(role, customerId as string, { page, pageSize: 25 }),
    enabled: Boolean(user) && Boolean(customerId),
  });
}
