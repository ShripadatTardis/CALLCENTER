import { request } from '@/services/transport/httpClient';
import type {
  ActivityStatus,
  ActivityType,
  CustomerActivitiesResponse,
  CustomerActivityRow,
  CustomerCampaignsResponse,
  CustomerDetailResponse,
  CustomerInteractionsResponse,
  CustomerListResponse,
  NewCustomerActivityPayload,
} from '@/types/customer';

/**
 * Customer 360 domain service. Calls this app's own /api/customers/*
 * routes (docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §15) — those
 * routes already return our own normalized shape (src/types/customer.ts),
 * so unlike calls/agents there is no separate DTO-boundary mapper here.
 *
 * Every call attaches `x-user-role` from the current session — see
 * api/_customer360.ts's getClientSuppliedRole for why this is an
 * advisory signal only, not a security boundary, until this app has a
 * real server-verifiable session (plan §0.1).
 */

function roleHeaders(role: string): Record<string, string> {
  return { 'x-user-role': role };
}

export async function fetchCustomerList(
  role: string,
  opts: { search?: string; page?: number; pageSize?: number } = {},
): Promise<CustomerListResponse> {
  return request<CustomerListResponse>('/customers', {
    method: 'GET',
    query: { search: opts.search, page: opts.page, pageSize: opts.pageSize },
    headers: roleHeaders(role),
  });
}

export async function fetchCustomerDetail(role: string, customerId: string): Promise<CustomerDetailResponse> {
  return request<CustomerDetailResponse>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'GET',
    headers: roleHeaders(role),
  });
}

export async function fetchCustomerInteractions(
  role: string,
  customerId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<CustomerInteractionsResponse> {
  return request<CustomerInteractionsResponse>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'GET',
    query: { action: 'interactions', page: opts.page, pageSize: opts.pageSize },
    headers: roleHeaders(role),
  });
}

/** Session 11.5A's customer-scoped Campaign Participation/History endpoint. */
export async function fetchCustomerCampaigns(role: string, customerId: string): Promise<CustomerCampaignsResponse> {
  return request<CustomerCampaignsResponse>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'GET',
    query: { action: 'campaigns' },
    headers: roleHeaders(role),
  });
}

export async function refreshCustomer(role: string, customerId: string): Promise<CustomerDetailResponse> {
  return request<CustomerDetailResponse>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'POST',
    query: { action: 'refresh' },
    headers: roleHeaders(role),
  });
}

/** Session 13.1 (DEC-CUST-02) — Customer Activity/Diary. */
export async function fetchCustomerActivities(role: string, customerId: string): Promise<CustomerActivitiesResponse> {
  return request<CustomerActivitiesResponse>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'GET',
    query: { action: 'activities' },
    headers: roleHeaders(role),
  });
}

export async function createCustomerActivity(
  role: string,
  customerId: string,
  payload: NewCustomerActivityPayload,
): Promise<CustomerActivityRow> {
  return request<CustomerActivityRow>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'POST',
    query: { action: 'activities' },
    headers: roleHeaders(role),
    body: payload,
  });
}

/**
 * Closes the Phase 2/3 audit's "status-update capability exists in the
 * RPC/repository layer but is not reachable from the existing activities
 * API route" finding (DEC-CUST-02) — this is the minimal PATCH action
 * that exposes `supabaseActivityRepository.updateActivityStatus`.
 */
export async function updateCustomerActivityStatus(
  role: string,
  customerId: string,
  activityId: string,
  activityType: ActivityType,
  status: ActivityStatus,
  updatedBy: string | null,
): Promise<CustomerActivityRow> {
  return request<CustomerActivityRow>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    query: { action: 'activities' },
    headers: roleHeaders(role),
    body: { activityId, activityType, status, updatedBy },
  });
}
