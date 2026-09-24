import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, resolveAccessForRequest, withErrorBoundary, noStore } from '../../_customer360.js';
import { refreshExistingCustomer } from '../../../src/server/customer360/aggregationService.js';
import { buildAuthorizedCustomerView } from '../../../src/server/customer360/authorizationService.js';

/**
 * POST /api/customers/{id}/refresh — explicit refresh (plan §15). Same
 * logic GET /{id} runs implicitly, exposed separately for an explicit
 * "Refresh" UI action, and forces the source lookup regardless of the
 * per-contact-point staleness window.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }

  noStore(res);

  const id = req.query.id as string;
  const access = await resolveAccessForRequest(req);

  const result = await refreshExistingCustomer(repo, source, id, { force: true });
  if (result.status === 'not_found') {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const customer = await repo.getCustomer(id);
  if (!customer) {
    res.status(404).json({ detail: 'Customer not found' });
    return;
  }

  const view = await buildAuthorizedCustomerView(repo, customer, access);
  res.status(200).json({ ...view, refresh: { attempted: true, failed: false, insertedCount: result.insertedCount } });
});
