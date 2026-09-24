import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { refreshCustomer } from '@/services/customers/customersService';

export function useRefreshCustomer(customerId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => refreshCustomer(role, customerId as string),
    onSuccess: () => {
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: customersKeys.detail(customerId, role) });
        queryClient.invalidateQueries({ queryKey: ['customers', 'interactions', customerId] });
      }
    },
  });
}
