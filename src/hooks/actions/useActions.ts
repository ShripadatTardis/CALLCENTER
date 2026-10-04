import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchActionItems,
  fetchActionItem,
  fetchEligibleAssignees,
  takeOwnership,
  assignActionItem,
  setActionItemStatus,
  resolveActionItem,
  type ActionItem,
  type ActionItemStatus,
} from '@/services/actions/actionsService';

export const actionsKeys = {
  list: (status?: ActionItemStatus) => ['actions', 'list', status ?? 'all'] as const,
  item: (id: string) => ['actions', 'item', id] as const,
  eligibleAssignees: (id: string) => ['actions', 'eligibleAssignees', id] as const,
};

export function useActionItems(status?: ActionItemStatus) {
  return useQuery({ queryKey: actionsKeys.list(status), queryFn: () => fetchActionItems(status) });
}

export function useActionItem(id: string | null) {
  return useQuery({ queryKey: actionsKeys.item(id ?? ''), queryFn: () => fetchActionItem(id as string), enabled: Boolean(id) });
}

export function useEligibleAssignees(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: actionsKeys.eligibleAssignees(id ?? ''),
    queryFn: () => fetchEligibleAssignees(id as string),
    enabled: Boolean(id) && enabled,
  });
}

function invalidateActionItem(queryClient: ReturnType<typeof useQueryClient>, item: ActionItem) {
  void queryClient.invalidateQueries({ queryKey: ['actions', 'list'] });
  void queryClient.invalidateQueries({ queryKey: actionsKeys.item(item.id) });
  void queryClient.invalidateQueries({ queryKey: actionsKeys.eligibleAssignees(item.id) });
}

export function useTakeOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => takeOwnership(id),
    onSuccess: (item) => invalidateActionItem(queryClient, item),
  });
}

export function useAssignActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assigneeUserId }: { id: string; assigneeUserId: string }) => assignActionItem(id, assigneeUserId),
    onSuccess: (item) => invalidateActionItem(queryClient, item),
  });
}

export function useSetActionItemStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'open' | 'in_progress' }) => setActionItemStatus(id, status),
    onSuccess: (item) => invalidateActionItem(queryClient, item),
  });
}

export function useResolveActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolutionCode, resolutionNote }: { id: string; resolutionCode: NonNullable<ActionItem['resolutionCode']>; resolutionNote: string }) =>
      resolveActionItem(id, resolutionCode, resolutionNote),
    onSuccess: (item) => invalidateActionItem(queryClient, item),
  });
}
