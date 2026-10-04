import { request } from '@/services/transport/httpClient';

/**
 * Session 14.1 — User Management / Role Management / Audit Trail.
 * Thin service layer over the single consolidated /api/admin route
 * (dispatched by `?resource=`) — four separate route files pushed this
 * repo's serverless function count past Vercel's 12-function Hobby-plan
 * ceiling and broke the deploy, so they were merged into one file
 * matching the api/campaigns.ts dispatch convention. Authorization is
 * server-side (requirePermission) via the Authorization: Bearer header
 * httpClient already attaches — no role header needed here.
 */

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string | null;
  status: 'active' | 'inactive';
  roles: string[];
  createdAt: string;
  /** Session 14.2 — genuinely derived from the Supabase Auth identity's confirmation state, never fabricated. 'unknown' when it couldn't be resolved. */
  identityStatus: 'pending' | 'confirmed' | 'unknown';
}

/** Session 14.3 — effective Business Data Scope, shown so an Administrator understands WHICH data a user can see, not just WHAT they can do. */
export interface UserDataScope {
  allAgents: boolean;
  agentIds: string[];
  allCategories: boolean;
  categoryIds: string[];
}

export interface AdminUserDetail extends AdminUserSummary {
  permissions: string[];
  recentAuditEvents: AuditEvent[];
  dataScope: UserDataScope;
}

export interface AdminRole {
  code: string;
  label: string;
  description: string | null;
  permissionKeys: string[];
  userCount: number;
  /** Session 14.3 — Agent Scope (Calls/Chat/Campaigns/Agent classification). */
  allAgents: boolean;
  agentIds: string[];
  /** Session 14.3 — Customer Category Scope (Customers). Independent of Agent Scope. */
  allCategories: boolean;
  categoryIds: string[];
}

export interface AdminCustomerCategory {
  id: string;
  name: string;
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
  const res = await request<{ data: AdminUserSummary[] }>('/admin', { query: { resource: 'users' } });
  return res.data;
}

export async function fetchUserDetail(userId: string): Promise<AdminUserDetail> {
  const res = await request<{ data: AdminUserDetail }>('/admin', { query: { resource: 'users', id: userId } });
  return res.data;
}

/**
 * Session 14.2 — real Administrator-facing provisioning. No password is
 * ever collected here; the invited person establishes their own via a
 * genuine Supabase Auth invite email. Throws an ApiError with
 * `status === 409` (and `.raw.data` = the existing AdminUserDetail) when
 * a Call Centre user already exists for this email — callers should
 * handle that distinctly rather than showing a generic failure.
 */
export async function provisionUser(email: string, displayName: string, roleCode: string): Promise<AdminUserDetail> {
  const res = await request<{ data: AdminUserDetail }>('/admin', {
    method: 'POST',
    query: { resource: 'users', action: 'provision' },
    body: { email, displayName, roleCode },
  });
  return res.data;
}

export async function setUserStatus(userId: string, status: 'active' | 'inactive'): Promise<void> {
  await request('/admin', { method: 'POST', query: { resource: 'users', action: 'setStatus' }, body: { userId, status } });
}

export async function assignUserRole(userId: string, roleCode: string): Promise<void> {
  await request('/admin', { method: 'POST', query: { resource: 'users', action: 'assignRole' }, body: { userId, roleCode } });
}

export async function removeUserRole(userId: string, roleCode: string): Promise<void> {
  await request('/admin', { method: 'POST', query: { resource: 'users', action: 'removeRole' }, body: { userId, roleCode } });
}

export async function fetchRoles(): Promise<AdminRole[]> {
  const res = await request<{ data: AdminRole[] }>('/admin', { query: { resource: 'roles' } });
  return res.data;
}

export async function fetchPermissions(): Promise<AdminPermission[]> {
  const res = await request<{ data: AdminPermission[] }>('/admin', { query: { resource: 'permissions' } });
  return res.data;
}

export async function setRolePermissions(roleCode: string, permissionKeys: string[]): Promise<void> {
  await request('/admin', { method: 'POST', query: { resource: 'roles', action: 'setPermissions' }, body: { roleCode, permissionKeys } });
}

export async function fetchCustomerCategories(): Promise<AdminCustomerCategory[]> {
  const res = await request<{ data: AdminCustomerCategory[] }>('/admin', { query: { resource: 'customerCategories' } });
  return res.data;
}

/** Session 14.3 — Agent Scope is configured independently of Customer Category Scope, even though today's data happens to be 1:1. */
export async function setRoleAgentScope(roleCode: string, allAgents: boolean, agentIds: string[]): Promise<void> {
  await request('/admin', { method: 'POST', query: { resource: 'roles', action: 'setAgentScope' }, body: { roleCode, allAgents, agentIds } });
}

export async function setRoleCustomerCategoryScope(roleCode: string, allCategories: boolean, categoryIds: string[]): Promise<void> {
  await request('/admin', { method: 'POST', query: { resource: 'roles', action: 'setCustomerCategoryScope' }, body: { roleCode, allCategories, categoryIds } });
}

export async function fetchAuditEvents(filters: { limit?: number; actorUserId?: string; action?: string; resourceType?: string; result?: string } = {}): Promise<AuditEvent[]> {
  const res = await request<{ data: AuditEvent[] }>('/admin', { query: { resource: 'audit', ...filters } });
  return res.data;
}
