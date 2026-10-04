import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsers,
  fetchUserDetail,
  setUserStatus,
  assignUserRole,
  removeUserRole,
  provisionUser,
  fetchRoles,
  fetchPermissions,
  setRolePermissions,
  fetchAuditEvents,
} from '@/services/admin/adminService';

export const adminKeys = {
  users: ['admin', 'users'] as const,
  user: (id: string) => ['admin', 'users', id] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
  audit: (filters: Record<string, unknown>) => ['admin', 'audit', filters] as const,
};

export function useAdminUsers() {
  return useQuery({ queryKey: adminKeys.users, queryFn: fetchUsers });
}

export function useAdminUserDetail(userId: string | null) {
  return useQuery({ queryKey: adminKeys.user(userId ?? ''), queryFn: () => fetchUserDetail(userId as string), enabled: Boolean(userId) });
}

export function useAdminRoles() {
  return useQuery({ queryKey: adminKeys.roles, queryFn: fetchRoles });
}

export function useAdminPermissions() {
  return useQuery({ queryKey: adminKeys.permissions, queryFn: fetchPermissions });
}

export function useAdminAuditEvents(filters: { limit?: number; actorUserId?: string; action?: string; resourceType?: string; result?: string } = {}) {
  return useQuery({ queryKey: adminKeys.audit(filters), queryFn: () => fetchAuditEvents(filters) });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'inactive' }) => setUserStatus(userId, status),
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users });
      void queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) });
    },
  });
}

export function useProvisionUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, displayName, roleCode }: { email: string; displayName: string; roleCode: string }) =>
      provisionUser(email, displayName, roleCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users });
      void queryClient.invalidateQueries({ queryKey: adminKeys.roles });
    },
  });
}

export function useAssignUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleCode }: { userId: string; roleCode: string }) => assignUserRole(userId, roleCode),
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users });
      void queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) });
      void queryClient.invalidateQueries({ queryKey: adminKeys.roles });
    },
  });
}

export function useRemoveUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleCode }: { userId: string; roleCode: string }) => removeUserRole(userId, roleCode),
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users });
      void queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) });
      void queryClient.invalidateQueries({ queryKey: adminKeys.roles });
    },
  });
}

export function useSetRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleCode, permissionKeys }: { roleCode: string; permissionKeys: string[] }) => setRolePermissions(roleCode, permissionKeys),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.roles });
    },
  });
}
