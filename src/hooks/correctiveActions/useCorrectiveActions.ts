import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCorrectiveAction,
  fetchCorrectiveActions,
  fetchCorrectiveAction,
  fetchCandidateCorrectiveActions,
  fetchEligiblePeople,
  fetchCorrectiveActionActivity,
  updateCorrectiveAction,
  takeCorrectiveActionOwnership,
  assignCorrectiveAction,
  assignCorrectiveActionVerifier,
  setCorrectiveActionStatus,
  recordCorrectiveActionCorrection,
  recordCorrectiveActionVerification,
  bulkVerifyCorrectiveActions,
  createCorrectiveActionGroup,
  fetchCorrectiveActionGroup,
  fetchCorrectiveActionGroups,
  fetchCorrectiveActionGroupMembers,
  fetchCorrectiveActionGroupActivity,
  updateCorrectiveActionGroup,
  linkCorrectiveActionsToGroup,
  unlinkCorrectiveActionFromGroup,
  type CorrectiveAction,
  type CorrectiveActionGroup,
  type CorrectiveActionListFilters,
  type CorrectiveActionStatus,
  type CreateCorrectiveActionInput,
  type UpdateCorrectiveActionGroupInput,
} from '@/services/correctiveActions/correctiveActionsService';

export const correctiveActionsKeys = {
  list: (filters: CorrectiveActionListFilters) => ['correctiveActions', 'list', filters] as const,
  item: (id: string) => ['correctiveActions', 'item', id] as const,
  candidates: (id: string) => ['correctiveActions', 'candidates', id] as const,
  eligiblePeople: (id: string) => ['correctiveActions', 'eligiblePeople', id] as const,
  activity: (id: string) => ['correctiveActions', 'activity', id] as const,
  group: (id: string) => ['correctiveActions', 'group', id] as const,
  groupList: (status?: CorrectiveActionStatus) => ['correctiveActions', 'groupList', status ?? 'all'] as const,
  groupMembers: (groupId: string) => ['correctiveActions', 'groupMembers', groupId] as const,
  groupActivity: (groupId: string) => ['correctiveActions', 'groupActivity', groupId] as const,
};

function invalidateCa(queryClient: ReturnType<typeof useQueryClient>, ca: CorrectiveAction) {
  void queryClient.invalidateQueries({ queryKey: ['correctiveActions', 'list'] });
  void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.item(ca.id) });
  void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.activity(ca.id) });
  void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.eligiblePeople(ca.id) });
  if (ca.groupId) {
    void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.groupMembers(ca.groupId) });
    void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.groupActivity(ca.groupId) });
  }
}

export function useCorrectiveActions(filters: CorrectiveActionListFilters = {}, enabled = true) {
  return useQuery({ queryKey: correctiveActionsKeys.list(filters), queryFn: () => fetchCorrectiveActions(filters), enabled });
}

export function useCorrectiveAction(id: string | null) {
  return useQuery({ queryKey: correctiveActionsKeys.item(id ?? ''), queryFn: () => fetchCorrectiveAction(id as string), enabled: Boolean(id) });
}

export function useCandidateCorrectiveActions(id: string | null, params: { agentId?: string | null; category?: string | null; parameterCode?: string | null }, enabled: boolean) {
  return useQuery({
    queryKey: correctiveActionsKeys.candidates(id ?? ''),
    queryFn: () => fetchCandidateCorrectiveActions({ excludeId: id as string, ...params }),
    enabled: Boolean(id) && enabled,
  });
}

export function useEligiblePeople(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: correctiveActionsKeys.eligiblePeople(id ?? ''),
    queryFn: () => fetchEligiblePeople(id as string),
    enabled: Boolean(id) && enabled,
  });
}

export function useCorrectiveActionActivity(id: string | null) {
  return useQuery({
    queryKey: correctiveActionsKeys.activity(id ?? ''),
    queryFn: () => fetchCorrectiveActionActivity(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateCorrectiveAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCorrectiveActionInput) => createCorrectiveAction(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['correctiveActions', 'list'] }),
  });
}

export function useUpdateCorrectiveAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateCorrectiveAction>[1] }) => updateCorrectiveAction(id, patch),
    onSuccess: (ca) => invalidateCa(queryClient, ca),
  });
}

export function useTakeCorrectiveActionOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => takeCorrectiveActionOwnership(id),
    onSuccess: (ca) => invalidateCa(queryClient, ca),
  });
}

export function useAssignCorrectiveAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assigneeUserId }: { id: string; assigneeUserId: string }) => assignCorrectiveAction(id, assigneeUserId),
    onSuccess: (ca) => invalidateCa(queryClient, ca),
  });
}

export function useAssignCorrectiveActionVerifier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verifierUserId }: { id: string; verifierUserId: string }) => assignCorrectiveActionVerifier(id, verifierUserId),
    onSuccess: (ca) => invalidateCa(queryClient, ca),
  });
}

export function useSetCorrectiveActionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: CorrectiveActionStatus; reason?: string }) => setCorrectiveActionStatus(id, status, reason),
    onSuccess: (ca) => invalidateCa(queryClient, ca),
  });
}

export function useRecordCorrectiveActionCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolutionSummary }: { id: string; resolutionSummary: string }) => recordCorrectiveActionCorrection(id, resolutionSummary),
    onSuccess: (ca) => invalidateCa(queryClient, ca),
  });
}

export function useRecordCorrectiveActionVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, result, details }: { id: string; result: 'passed' | 'failed'; details?: Parameters<typeof recordCorrectiveActionVerification>[2] }) =>
      recordCorrectiveActionVerification(id, result, details),
    onSuccess: (ca) => invalidateCa(queryClient, ca),
  });
}

export function useBulkVerifyCorrectiveActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, result, details }: { ids: string[]; result: 'passed' | 'failed'; details?: Parameters<typeof bulkVerifyCorrectiveActions>[2] }) =>
      bulkVerifyCorrectiveActions(ids, result, details),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['correctiveActions'] });
    },
  });
}

// ===== Groups =====

export function useCorrectiveActionGroup(id: string | null) {
  return useQuery({ queryKey: correctiveActionsKeys.group(id ?? ''), queryFn: () => fetchCorrectiveActionGroup(id as string), enabled: Boolean(id) });
}

export function useCorrectiveActionGroups(status?: CorrectiveActionStatus) {
  return useQuery({ queryKey: correctiveActionsKeys.groupList(status), queryFn: () => fetchCorrectiveActionGroups(status) });
}

export function useCorrectiveActionGroupMembers(groupId: string | null) {
  return useQuery({ queryKey: correctiveActionsKeys.groupMembers(groupId ?? ''), queryFn: () => fetchCorrectiveActionGroupMembers(groupId as string), enabled: Boolean(groupId) });
}

export function useCorrectiveActionGroupActivity(groupId: string | null) {
  return useQuery({ queryKey: correctiveActionsKeys.groupActivity(groupId ?? ''), queryFn: () => fetchCorrectiveActionGroupActivity(groupId as string), enabled: Boolean(groupId) });
}

export function useCreateCorrectiveActionGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, description }: { title: string; description?: string }) => createCorrectiveActionGroup(title, description),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['correctiveActions', 'groupList'] }),
  });
}

export function useUpdateCorrectiveActionGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCorrectiveActionGroupInput }) => updateCorrectiveActionGroup(id, patch),
    onSuccess: (group: CorrectiveActionGroup) => {
      void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.group(group.id) });
      void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.groupActivity(group.id) });
      void queryClient.invalidateQueries({ queryKey: ['correctiveActions', 'groupList'] });
    },
  });
}

export function useLinkCorrectiveActionsToGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, caIds }: { groupId: string; caIds: string[] }) => linkCorrectiveActionsToGroup(groupId, caIds),
    onSuccess: (_members, variables) => {
      void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.groupMembers(variables.groupId) });
      void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.groupActivity(variables.groupId) });
      void queryClient.invalidateQueries({ queryKey: ['correctiveActions', 'list'] });
    },
  });
}

export function useUnlinkCorrectiveActionFromGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, caId }: { groupId: string; caId: string }) => unlinkCorrectiveActionFromGroup(groupId, caId),
    onSuccess: (_ca, variables) => {
      void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.groupMembers(variables.groupId) });
      void queryClient.invalidateQueries({ queryKey: correctiveActionsKeys.groupActivity(variables.groupId) });
      void queryClient.invalidateQueries({ queryKey: ['correctiveActions', 'list'] });
    },
  });
}
