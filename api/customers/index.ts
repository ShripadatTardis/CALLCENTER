import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, withErrorBoundary, noStore, readIntQuery } from '../_customer360.js';
import { resolveAccessForAuthenticatedUser } from '../_auth.js';
import { refreshCustomerByContactPoint } from '../../src/server/customer360/aggregationService.js';
import { normalizePhoneNumber } from '../../src/lib/phoneIdentity.js';

/**
 * GET /api/customers — authorized, category-filtered list (plan §13).
 *
 * If `search` looks like a phone number, this is also the progressive
 * materialization entry point (plan §4's "First-lookup / materialization
 * rule"): persisted lookup first, then a source lookup that creates a
 * customer only if real interaction history exists. A materialization
 * failure (e.g. the interaction source being unreachable) degrades to
 * "list whatever is already persisted" rather than failing the whole
 * request — plan §24 item 5's fail-gracefully rule, applied here too.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }

  noStore(res);

  const searchRaw = req.query.search;
  const search = Array.isArray(searchRaw) ? searchRaw[0] : searchRaw;
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);

  // Session 14.3 — Customer visibility is scoped by Customer Category
  // Scope (resolved server-side to an agent_id set), from the verified
  // authenticated user. Replaces the advisory x-user-role header.
  const access = await resolveAccessForAuthenticatedUser(req, 'customer');

  let materializationWarning: string | null = null;
  // Phone-search dispatch requires the raw query to be phone-shaped (only
  // digits and phone punctuation) — a CIF/name search like "CIF003" also
  // contains digits, and normalizePhoneNumber would otherwise silently
  // reduce it to "003" and misroute it into the phone-materialization
  // branch, never reaching listCustomers' name/CIF search at all.
  const looksLikePhone = Boolean(search && /^[0-9+\-\s()]+$/.test(search.trim()));
  const normalizedPhone = looksLikePhone ? normalizePhoneNumber(search) : null;

  if (normalizedPhone) {
    // Phone search is the progressive materialization entry point — it
    // resolves to AT MOST one customer, never the general list, so it
    // is handled as its own branch rather than falling through to
    // repo.listCustomers' name-search path.
    try {
      await refreshCustomerByContactPoint(repo, source, search as string);
    } catch (err) {
      // Degrade gracefully (plan §24 item 5) — fall through to whatever
      // is already persisted for this phone, if anything.
      materializationWarning = err instanceof Error ? err.message : 'Materialization lookup failed';
    }

    const contactPoint = await repo.findContactPoint('phone', normalizedPhone);
    if (!contactPoint) {
      res.status(200).json({ data: [], pagination: { page: 1, pageSize, totalCount: 0 }, materializationWarning });
      return;
    }

    // §13's visibility rule still applies to a phone-search result: only
    // return the customer if they have at least one interaction visible
    // under this role's authorization (mirrors listCustomers' own
    // EXISTS-filter, checked directly for this one customer).
    const visible = await repo.listInteractions(contactPoint.customerId, {
      page: 1,
      pageSize: 1,
      authorizedAgentIds: access.authorizedAgentIds,
    });
    if (visible.totalCount === 0) {
      res.status(200).json({ data: [], pagination: { page: 1, pageSize, totalCount: 0 }, materializationWarning });
      return;
    }

    // Authorized aggregate only — never the unfiltered customers.* row
    // (plan §12; this exact call site was a confirmed category-authorization
    // leak, fixed by reusing the same per-row authorized-aggregate logic
    // call_center_list_customers already uses).
    const customer = await repo.getCustomerAuthorized(contactPoint.customerId, access.authorizedAgentIds);
    res.status(200).json({
      data: customer ? [customer] : [],
      pagination: { page: 1, pageSize, totalCount: customer ? 1 : 0 },
      materializationWarning,
    });
    return;
  }

  const { rows, totalCount } = await repo.listCustomers({
    search: search || undefined,
    authorizedAgentIds: access.authorizedAgentIds,
    page,
    pageSize,
  });

  res.status(200).json({
    data: rows,
    pagination: { page, pageSize, totalCount },
    materializationWarning: null,
  });
});
