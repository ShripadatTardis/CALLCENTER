import { request } from '@/services/transport/httpClient';

/**
 * Session 14.1 — User Management / Role Management / Audit Trail.
 * Thin service layer over /api/users, /api/roles, /api/audit, matching
 * the established service-function convention. Authorization is server-
 * side (requirePermission) via the Authorization: Bearer header
 * httpClient already attaches — no role header needed here.
 */

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string | null;
  status: 'active' | 'inactive';
  roles: string[];
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  permissions: string[];
  recentAuditEvents: AuditEvent[];
}

export interface AdminRole {
  code: string;
  label: string;
  description: string | null;
  permissionKeys: string[];
  userCount: number;
}

export interface AdminPermission {
  key: string;
  label: string;
  description: string | null;
  pillar: string;
}

export interface AuditEvent {
  id: string;
  occurred_at: string;
  actor_type: 'user' | 'system' | 'cron';
  actor_user_id: string | null;
  actor_label: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  result: 'success' | 'denied' | 'error';
  metadata?: Record<string, unknown> | null;
}

export async function fetchUsers(): Promise<AdminUserSummary[]> {
  const res = await request<{ data: AdminUserSummary[] }>('/users');
  return res.data;
}

export async function fetchUserDetail(userId: string): Promise<AdminUserDetail> {
  const res = await request<{ data: AdminUserDetail }>('/users', { query: { id: userId } });
  return res.data;
}

export async function setUserStatus(userId: string, status: 'active' | 'inactive'): Promise<void> {
  await request('/users', { method: 'POST', query: { action: 'setStatus' }, body: { userId, status } });
}

export async function assignUserRole(userId: string, roleCode: string): Promise<void> {
  await request('/users', { method: 'POST', query: { action: 'assignRole' }, body: { userId, roleCode } });
}

export async function removeUserRole(userId: string, roleCode: string): Promise<void> {
  await request('/users', { method: 'POST', query: { action: 'removeRole' }, body: { userId, roleCode } });
}

export async function fetchRoles(): Promise<AdminRole[]> {
  const res = await request<{ data: AdminRole[] }>('/roles');
  return res.data;
}

export async function fetchPermissions(): Promise<AdminPermission[]> {
  const res = await request<{ data: AdminPermission[] }>('/roles', { query: { resource: 'permissions' } });
  return res.data;
}

export async function setRolePermissions(roleCode: string, permissionKeys: string[]): Promise<void> {
  await request('/roles', { method: 'POST', query: { action: 'setPermissions' }, body: { roleCode, permissionKeys } });
}

export async function fetchAuditEvents(filters: { limit?: number; actorUserId?: string; action?: string; resourceType?: string; result?: string } = {}): Promise<AuditEvent[]> {
  const res = await request<{ data: AuditEvent[] }>('/audit', { query: filters });
  return res.data;
}
