import { request } from '@/services/transport/httpClient';
import type {
  CustomerDetailResponse,
  CustomerInteractionsResponse,
  CustomerListResponse,
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
  return request<CustomerInteractionsResponse>(`/customers/${encodeURIComponent(customerId)}/interactions`, {
    method: 'GET',
    query: { page: opts.page, pageSize: opts.pageSize },
    headers: roleHeaders(role),
  });
}

export async function refreshCustomer(role: string, customerId: string): Promise<CustomerDetailResponse> {
  return request<CustomerDetailResponse>(`/customers/${encodeURIComponent(customerId)}/refresh`, {
    method: 'POST',
    headers: roleHeaders(role),
  });
}
