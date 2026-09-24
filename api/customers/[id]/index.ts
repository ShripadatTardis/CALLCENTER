import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, resolveAccessForRequest, withErrorBoundary, noStore } from '../../_customer360.js';
import { refreshExistingCustomer } from '../../../src/server/customer360/aggregationService.js';
import { buildAuthorizedCustomerView } from '../../../src/server/customer360/authorizationService.js';

/**
 * GET /api/customers/{id} — authorized Customer 360 view (plan §4, §11,
 * §12, §15). This call itself triggers progressive refresh of stale
 * contact points before responding. If the refresh fails (e.g. the
 * interaction source is unreachable), the request still succeeds with
 * the last-known persisted view plus a `refresh.failed` signal — plan
 * §24 item 5's fail-gracefully rule.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }

  noStore(res);

  const id = req.query.id as string;
  const access = await resolveAccessForRequest(req);

  let refresh: { attempted: boolean; failed: boolean; insertedCount: number; error?: string } = {
    attempted: true,
    failed: false,
    insertedCount: 0,
  };
  try {
    const result = await refreshExistingCustomer(repo, source, id);
    if (result.status === 'not_found') {
      res.status(404).json({ detail: 'Customer not found' });
      return;
    }
    refresh.insertedCount = result.insertedCount;
  } catch (err) {
    refresh = { attempted: true, failed: true, insertedCount: 0, error: err instanceof Error ? err.message : 'Refresh failed' };
  }

  const customer = await repo.getCustomer(id);
  if (!customer) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const view = await buildAuthorizedCustomerView(repo, customer, access);
  res.status(200).json({ ...view, refresh });
});
