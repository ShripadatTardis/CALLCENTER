import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { customersKeys } from '@/services/customers/customersKeys';
import { updateCustomerActivityStatus } from '@/services/customers/customersService';
import type { ActivityStatus, ActivityType } from '@/types/customer';

/** Session 13.1 (DEC-CUST-02) — consumes `PATCH ?action=activities`. */
export function useUpdateCustomerActivityStatus(customerId: string | undefined) {
  const { user } = useAuth();
  const role = user?.role ?? 'unauthenticated';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      activityId,
      activityType,
      status,
    }: {
      activityId: string;
      activityType: ActivityType;
      status: ActivityStatus;
    }) => updateCustomerActivityStatus(role, customerId as string, activityId, activityType, status, user?.name ?? null),
    onSuccess: () => {
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: customersKeys.activities(customerId, role) });
      }
    },
  });
}
