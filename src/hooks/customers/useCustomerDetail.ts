import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { fetchCustomerDetail } from '@/services/customers/customersService';

export function useCustomerDetail(customerId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: customersKeys.detail(customerId ?? '', role),
    queryFn: () => fetchCustomerDetail(role, customerId as string),
    enabled: Boolean(user) && Boolean(customerId),
  });
}
