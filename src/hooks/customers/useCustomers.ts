import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { fetchCustomerList } from '@/services/customers/customersService';

export function useCustomers(search: string | undefined, page = 1) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: customersKeys.list(search, page, role),
    queryFn: () => fetchCustomerList(role, { search, page, pageSize: 25 }),
    enabled: Boolean(user),
  });
}
