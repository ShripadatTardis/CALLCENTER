import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Session 14.1 — real, server-verifiable identity + authorization. This
 * is the shared module every new/retrofitted mutating route uses,
 * mirroring the existing api/_customer360.ts convention.
 *
 * Architecture: Supabase Auth is only the (replaceable) authentication
 * provider. This module verifies a Supabase Auth JWT, then resolves the
 * Call Centre's OWN, fully app-owned user/roles/permissions (the
 * call_center.user_profiles / user_roles / role_permissions tables) via
 * the (identity_provider, identity_subject) bridge -- never a straight
 * FK to auth.users. This is what makes `requirePermission` a real
 * security boundary, unlike the pre-existing advisory x-user-role
 * header (see api/_customer360.ts's own documented caveat) -- that
 * legacy seam is untouched and still used only for its original
 * Customer360/Campaign read-filtering purpose, never trusted here.
 */

let client: SupabaseClient | null = null;

function getServiceRoleClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.CUSTOMER360_SUPABASE_URL;
  const serviceRoleKey = process.env.CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('CUSTOMER360_SUPABASE_URL / CUSTOMER360_SUPABASE_SERVICE_ROLE_KEY are not configured on the server');
  }
  client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return client;
}

/**
 * Session 14.3 — Business Data Scope. Two independent, role-level
 * dimensions, resolved server-side (see
 * call_center_users_resolve_identity's SQL): Agent Scope (used by
 * Calls/Chat/Campaigns/Agent-classification) and Customer Category
 * Scope (used by Customers — resolved down to an effective agent_id set
 * via the existing customer360_category_agents join, since that's the
 * only real linkage a customer has to a category today). Agent Scope is
 * never derived FROM Customer Category Scope; they're configured and
 * stored independently even though `customerAgentIds` is computed from
 * category selections.
 */
export interface DataScope {
  allAgents: boolean;
  agentIds: string[];
  allCustomerCategories: boolean;
  customerCategoryIds: string[];
  customerAllAgents: boolean;
  customerAgentIds: string[];
}

export interface AuthenticatedCallCenterUser {
  id: string;
  email: string;
  displayName: string | null;
  status: 'active' | 'inactive';
  roles: string[];
  permissions: string[];
  dataScope: DataScope;
}

function readBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Verifies the bearer JWT against Supabase Auth, then resolves the Call
 * Centre's own user_profiles row (by identity_subject) plus effective
 * roles/permissions. Returns null if the token is missing/invalid, the
 * profile doesn't exist, or the profile is inactive -- callers should
 * treat null as "not authenticated for this app" and respond 401/403
 * accordingly via requirePermission below.
 */
interface ResolvedIdentity {
  id: string;
  email: string;
  displayName: string | null;
  status: 'active' | 'inactive';
  roles: string[];
  permissions: string[];
  dataScope: DataScope;
}

export async function getAuthenticatedUser(req: VercelRequest): Promise<AuthenticatedCallCenterUser | null> {
  const token = readBearerToken(req);
  if (!token) return null;

  const supabase = getServiceRoleClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return null;

  const { data, error } = await supabase.rpc('call_center_users_resolve_identity', {
    p_provider: 'supabase_auth',
    p_subject: authData.user.id,
  });
  if (error || !data) return null;

  const identity = data as ResolvedIdentity;
  if (identity.status !== 'active') return null;

  return {
    id: identity.id,
    email: identity.email,
    displayName: identity.displayName,
    status: identity.status,
    roles: identity.roles,
    permissions: identity.permissions,
    dataScope: identity.dataScope,
  };
}

/**
 * Session 14.3 — the shape every existing Customer360/Campaign/Calls/
 * Chat filtering call site already consumes (`AuthorizedAccess` from
 * src/server/customer360/authorizationService.ts). Two views of the
 * same authenticated user: `forAgents` (Calls/Chat/Campaigns/Agent
 * classification) and `forCustomers` (Customer360 — category scope
 * resolved to an agent_id set). This REPLACES the advisory
 * `x-user-role` header as the source of truth for every route it's
 * wired into — the header is retired from authorization decisions on
 * those routes, not run in parallel with this.
 */
export interface ScopedAccess {
  role: string;
  allCategories: boolean;
  authorizedAgentIds: string[] | 'all';
}

export function toAgentAccess(user: AuthenticatedCallCenterUser): ScopedAccess {
  return {
    role: user.id,
    allCategories: user.dataScope.allAgents,
    authorizedAgentIds: user.dataScope.allAgents ? 'all' : user.dataScope.agentIds,
  };
}

export function toCustomerAccess(user: AuthenticatedCallCenterUser): ScopedAccess {
  return {
    role: user.id,
    allCategories: user.dataScope.customerAllAgents,
    authorizedAgentIds: user.dataScope.customerAllAgents ? 'all' : user.dataScope.customerAgentIds,
  };
}

/**
 * Pure scope check, exported so individual-resource route handlers can
 * apply it themselves and choose their own response (404, matching the
 * existing api/campaigns.ts `isAgentAuthorized` convention of not
 * revealing a resource's existence to a caller outside its data scope —
 * 403 is reserved for functional-permission denials via
 * requirePermission, where confirming the permission's existence isn't
 * sensitive).
 */
export function isAgentIdInScope(access: ScopedAccess, agentId: string | null | undefined): boolean {
  if (access.allCategories || access.authorizedAgentIds === 'all') return true;
  return !!agentId && access.authorizedAgentIds.includes(agentId);
}

export type PermissionEvaluation =
  | { outcome: 'unauthenticated' }
  | { outcome: 'forbidden' }
  | { outcome: 'allowed' };

/**
 * Pure decision logic, deliberately separated from the I/O
 * (getAuthenticatedUser) so it's unit-testable without a live Supabase
 * session: unauthenticated when there's no resolved user or the account
 * is inactive (an inactive profile must never pass, regardless of its
 * stored permissions array); forbidden when authenticated but the
 * permission isn't in the effective set; allowed otherwise. An unknown/
 * empty permissionKey can never be satisfied by an empty array.includes
 * check, so this already fails closed by construction — no special case
 * needed.
 */
export function evaluatePermission(
  user: AuthenticatedCallCenterUser | null,
  permissionKey: string,
): PermissionEvaluation {
  if (!user || user.status !== 'active') return { outcome: 'unauthenticated' };
  if (!user.permissions.includes(permissionKey)) return { outcome: 'forbidden' };
  return { outcome: 'allowed' };
}

/**
 * The authoritative server-side gate. 401 when there's no valid
 * authenticated Call Centre user at all; 403 when the user is
 * authenticated but lacks the required permission. On success, returns
 * the user so the route can use `user.id` as the real, verified
 * `actor_user_id` for audit logging -- finally a verified UUID instead
 * of a client-claimed string.
 */
export async function requirePermission(
  req: VercelRequest,
  res: VercelResponse,
  permissionKey: string,
): Promise<AuthenticatedCallCenterUser | null> {
  const user = await getAuthenticatedUser(req);
  const evaluation = evaluatePermission(user, permissionKey);
  if (evaluation.outcome === 'unauthenticated') {
    res.status(401).json({ detail: 'Authentication required' });
    return null;
  }
  if (evaluation.outcome === 'forbidden') {
    res.status(403).json({ detail: `Missing required permission: ${permissionKey}` });
    return null;
  }
  return user;
}

/**
 * Writes one call_center.audit_events row via the audited RPC. Never
 * throws -- a failed audit write must not block the mutation it's
 * describing; errors are swallowed after a best-effort attempt (same
 * philosophy as this app's other non-critical side-effect writes).
 */
export async function recordAuditEvent(params: {
  actorType: 'user' | 'system' | 'cron';
  actorUserId: string | null;
  actorLabel?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  result: 'success' | 'denied' | 'error';
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
  source?: string | null;
}): Promise<void> {
  try {
    const supabase = getServiceRoleClient();
    await supabase.rpc('call_center_audit_record', {
      p_actor_type: params.actorType,
      p_actor_user_id: params.actorUserId,
      p_actor_label: params.actorLabel ?? null,
      p_action: params.action,
      p_resource_type: params.resourceType ?? null,
      p_resource_id: params.resourceId ?? null,
      p_result: params.result,
      p_metadata: params.metadata ?? null,
      p_request_id: params.requestId ?? null,
      p_source: params.source ?? null,
    });
  } catch {
    // Best-effort — never let an audit-write failure break the real mutation.
  }
}

/**
 * Session 14.3 — drop-in replacement for api/_customer360.ts's
 * `resolveAccessForRequest`. Produces the identical `AuthorizedAccess`
 * shape every existing filtering call site already consumes, but
 * derived from the verified, JWT-authenticated Call Centre user instead
 * of the unverified `x-user-role` header. An unauthenticated caller
 * resolves to zero scope (fails closed) rather than throwing, so a read
 * route can decide for itself whether to require auth or just return an
 * empty/filtered result — same posture the old advisory resolver had
 * for a missing/unknown role.
 */
export async function resolveAccessForAuthenticatedUser(
  req: VercelRequest,
  scope: 'agent' | 'customer' = 'agent',
): Promise<ScopedAccess> {
  const user = await getAuthenticatedUser(req);
  if (!user) return { role: 'unauthenticated', allCategories: false, authorizedAgentIds: [] };
  return scope === 'agent' ? toAgentAccess(user) : toCustomerAccess(user);
}

export { getServiceRoleClient };
