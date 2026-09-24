import type { CustomerRepository } from './customerRepository.js';
import type { Customer, CustomerInteractionRecord, RoleAccess } from './types.js';
import { computeAggregate, type ComputedAggregate } from './aggregateMath.js';

/**
 * Authorization/category service — plan §0.3, §8–§13, §16. Depends only
 * on CustomerRepository, never on how `role` was obtained (that is a
 * transport-layer concern — see api/_customer360.ts and the §0.1
 * callout below).
 *
 * KNOWN LIMITATION (plan §0.1 / §11 / §24 item 0): this service
 * produces a REAL server-side filter — unauthorized rows genuinely
 * never reach the response. What it is NOT, until this app has a real
 * server-verifiable session, is a defense against a client that lies
 * about its own role. `role` here is whatever the caller says it is.
 * This is documented, not hidden, everywhere this service is used —
 * never describe its output as "secure access control."
 */

export interface AuthorizedAccess {
  role: string;
  allCategories: boolean;
  /** Agent IDs visible to this role, resolved LIVE from the current category_agents mapping — never cached. 'all' means no filtering. */
  authorizedAgentIds: string[] | 'all';
}

/**
 * Resolves what a role can see, live, at call time — plan §11's
 * "resolve agent_ids mapped to those categories" step. Never reads
 * customer_interactions.category_id; always re-derives from the current
 * customer360_category_agents table, so a mapping change taking effect
 * requires no reconciliation pass for access-control purposes (plan §16).
 */
export async function resolveAuthorizedAccess(
  repo: CustomerRepository,
  role: string,
): Promise<AuthorizedAccess> {
  const access: RoleAccess = await repo.getRoleAccess(role);
  if (access.allCategories) {
    return { role, allCategories: true, authorizedAgentIds: 'all' };
  }

  if (access.categoryIds.length === 0) {
    // Fail closed: a role with no granted categories and no all-access
    // flag sees nothing (plan §10 — no category rows by default).
    return { role, allCategories: false, authorizedAgentIds: [] };
  }

  const categoryAgentMap = await repo.getCategoryAgentMap(); // agent_id -> category_id
  const authorizedCategorySet = new Set(access.categoryIds);
  const authorizedAgentIds = Array.from(categoryAgentMap.entries())
    .filter(([, categoryId]) => authorizedCategorySet.has(categoryId))
    .map(([agentId]) => agentId);

  return { role, allCategories: false, authorizedAgentIds };
}

export interface AuthorizedCustomerView {
  customer: Pick<Customer, 'id' | 'displayName' | 'sourceCustomerRef' | 'firstSeen' | 'lastSeen'>;
  /** Authorized-subset aggregate (plan §12) — NEVER the full customers.* row. */
  aggregate: ComputedAggregate;
}

/**
 * Builds the response-shaped, authorized-subset aggregate for one
 * customer — plan §12: "if the full customer history has 100
 * interactions but the user can see only Loans and Service... return
 * authorized-view aggregates instead." The full persisted
 * customers.* aggregate (repo.recomputeCustomerAggregate) is internal
 * bookkeeping only and must never be serialized into this shape.
 */
export async function buildAuthorizedCustomerView(
  repo: CustomerRepository,
  customer: Customer,
  access: AuthorizedAccess,
): Promise<AuthorizedCustomerView> {
  const rows = await repo.listAllInteractions(customer.id, access.authorizedAgentIds);
  const aggregate = computeAggregate(rows);
  return {
    customer: {
      id: customer.id,
      displayName: customer.displayName,
      sourceCustomerRef: customer.sourceCustomerRef,
      firstSeen: customer.firstSeen,
      lastSeen: customer.lastSeen,
    },
    aggregate,
  };
}

export async function listAuthorizedInteractions(
  repo: CustomerRepository,
  customerId: string,
  access: AuthorizedAccess,
  page: number,
  pageSize: number,
): Promise<{ rows: CustomerInteractionRecord[]; totalCount: number }> {
  return repo.listInteractions(customerId, { page, pageSize, authorizedAgentIds: access.authorizedAgentIds });
}
