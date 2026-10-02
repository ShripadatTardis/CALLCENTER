import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { createCustomerActivity } from '@/services/customers/customersService';
import type { NewCustomerActivityPayload } from '@/types/customer';

/** Session 13.1 (DEC-CUST-02) — consumes `POST ?action=activities`. */
export function useCreateCustomerActivity(customerId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: NewCustomerActivityPayload) =>
      createCustomerActivity(role, customerId as string, payload),
    onSuccess: () => {
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: customersKeys.activities(customerId, role) });
      }
    },
  });
}
