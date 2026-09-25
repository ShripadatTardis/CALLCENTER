import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { fetchCustomerInteractions } from '@/services/customers/customersService';

export function useCustomerInteractions(customerId: string | undefined, page = 1, pageSize = 25) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: customersKeys.interactions(customerId ?? '', page, role, pageSize),
    queryFn: () => fetchCustomerInteractions(role, customerId as string, { page, pageSize }),
    enabled: Boolean(user) && Boolean(customerId),
  });
}
