import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { fetchCustomerActivities } from '@/services/customers/customersService';

/** Session 13.1 (DEC-CUST-02) — consumes `GET ?action=activities`. */
export function useCustomerActivities(customerId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';

  return useQuery({
    queryKey: customersKeys.activities(customerId ?? '', role),
    queryFn: () => fetchCustomerActivities(role, customerId as string),
    enabled: Boolean(user) && Boolean(customerId),
  });
}
