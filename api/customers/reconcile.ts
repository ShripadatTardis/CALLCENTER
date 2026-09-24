import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, withErrorBoundary, noStore, requireAdminToken } from '../_customer360.js';
import { runReconciliation } from '../../src/server/customer360/reconcileJob.js';

/**
 * POST /api/customers/reconcile — optional/internal periodic
 * reconciliation (plan §5/§16). Infrequent by design; not required for
 * the progressive model to function correctly. Admin-token gated.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }
  if (!requireAdminToken(req, res)) return;

  noStore(res);

  const result = await runReconciliation(repo, source);
  res.status(200).json(result);
});
