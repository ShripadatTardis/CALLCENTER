import type {
  Category,
  Customer,
  CustomerInteractionRecord,
  ContactPoint,
  ContactPointType,
  NewInteractionInput,
  RoleAccess,
} from './types.js';

/**
 * The persistent customer repository — a logical interface, per
 * docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §0.3/§14. This is the
 * ONLY thing the aggregation and authorization services depend on for
 * persistence; they never talk to Supabase (or any other store)
 * directly. supabaseCustomerRepository.ts is this deployment's current
 * adapter implementation and the only file in this domain layer allowed
 * to import `@supabase/supabase-js`.
 */
export interface CustomerRepository {
  getCustomer(customerId: string): Promise<Customer | null>;

  findContactPoint(type: ContactPointType, normalizedValue: string): Promise<ContactPoint | null>;

  listContactPoints(customerId: string): Promise<ContactPoint[]>;

  /** Creates a new customer + its first contact point, atomically. Used only on first sight of a never-seen contact point (plan §4/§24 item 2). */
  createCustomerWithContactPoint(input: {
    type: ContactPointType;
    rawValue: string;
    normalizedValue: string;
    displayName: string | null;
    now: string;
  }): Promise<{ customer: Customer; contactPoint: ContactPoint }>;

  touchContactPoint(contactPointId: string, seenAt: string): Promise<void>;

  /**
   * Idempotently upserts one interaction, keyed on (source, interactionId)
   * — plan §6 step 1 / §20. Returns whether a new row was actually
   * inserted (false when it already existed), so callers can decide
   * whether a recompute is even necessary.
   */
  upsertInteraction(input: NewInteractionInput): Promise<{ inserted: boolean; id: string }>;

  /**
   * `authorizedAgentIds: 'all'` means no filtering (an all-access role);
   * a string[] restricts to interactions whose agent_id is in that list
   * — resolved LIVE by the authorization service from the current
   * agent→category→role mapping on every call, never from a cached
   * value (plan §11/§16). An uncategorized interaction's agent_id is
   * never in a non-'all' list, so it is excluded by construction
   * (fail-closed, plan §16).
   */
  listInteractions(customerId: string, opts: {
    page?: number;
    pageSize?: number;
    authorizedAgentIds: string[] | 'all';
  }): Promise<{
    rows: CustomerInteractionRecord[];
    totalCount: number;
  }>;

  /** ALL (unpaginated) interaction rows for one customer, for aggregate recompute — same authorizedAgentIds semantics as listInteractions. */
  listAllInteractions(customerId: string, authorizedAgentIds: string[] | 'all'): Promise<CustomerInteractionRecord[]>;

  /** Recomputes and persists customers.* fully (unfiltered) from customer_interactions — plan §6, never incremented, never returned directly by an API response (plan §12). */
  recomputeCustomerAggregate(customerId: string, now: string): Promise<Customer>;

  /** List customers with at least one interaction visible under authorizedAgentIds, paginated, with search. Plan §13. */
  listCustomers(opts: {
    search?: string;
    authorizedAgentIds: string[] | 'all';
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: Customer[]; totalCount: number }>;

  // --- Category / role access (plan §8–§10) ---

  listCategories(): Promise<Category[]>;
  getCategoryAgentMap(): Promise<Map<string, string>>; // agent_id -> category_id
  upsertCategoryForAgent(agentId: string, categoryName: string): Promise<void>;
  getRoleAccess(role: string): Promise<RoleAccess>;

  // --- Aggregation state (plan §5, optional reconciliation) ---

  getHighWaterMark(): Promise<string | null>;
  setHighWaterMark(iso: string): Promise<void>;

  /** Distinct customer_ids whose category_id cache may be stale relative to the current agent→category mapping — used by reconciliation, never by authorization (plan §16). */
  refreshInteractionCategoryCache(agentId: string, categoryId: string | null): Promise<number>;
}
