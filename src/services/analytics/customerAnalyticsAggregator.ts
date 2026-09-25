import type { CustomerSummary } from '@/types/customer';

/**
 * Session 7 §12/§13 — small, category-authorized Customer 360 summary.
 * Every input row already came through the authorized
 * call_center_list_customers RPC (Session 4/5.2's proven authorized-
 * aggregate path) — this file only reshapes already-authorized rows,
 * never a second authorization decision. No demographic/marketing
 * fields exist anywhere in this model and none are computed here.
 */
export interface CustomerAnalyticsSummary {
  /** Rows actually fetched — see totalCount for the server's real authorized total. */
  sampleSize: number;
  totalCount: number;
  customersWithMultipleInteractions: number;
  inboundCount: number;
  outboundCount: number;
  voiceCount: number;
  chatCount: number;
  escalatedCustomers: number;
}

export function computeCustomerAnalyticsSummary(customers: CustomerSummary[], totalCount: number): CustomerAnalyticsSummary {
  return {
    sampleSize: customers.length,
    totalCount,
    customersWithMultipleInteractions: customers.filter((c) => c.totalInteractions > 1).length,
    inboundCount: customers.reduce((sum, c) => sum + c.inboundCount, 0),
    outboundCount: customers.reduce((sum, c) => sum + c.outboundCount, 0),
    voiceCount: customers.filter((c) => c.channels.includes('voice')).length,
    chatCount: customers.filter((c) => c.channels.includes('chat')).length,
    escalatedCustomers: customers.filter((c) => c.escalationCount > 0).length,
  };
}
