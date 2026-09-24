import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, withErrorBoundary, noStore, requireAdminToken, readIntQuery } from '../_customer360.js';
import { runBackfillBatch } from '../../src/server/customer360/backfillJob.js';

/**
 * POST /api/customers/backfill — optional/internal historical backfill
 * (plan §5/§6). Bounded, resumable, idempotent. Admin-token gated (see
 * api/_customer360.ts's requireAdminToken — an operational safeguard,
 * not a fix for the §0.1 auth gap).
 *
 * Body/query: { cursor?: number (default 1), batchSize?: number (default 5) }
 * Response: { nextCursor, pagesProcessed, interactionsInserted, customersTouched }
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ detail: 'Method not allowed. Use POST.' });
    return;
  }
  if (!requireAdminToken(req, res)) return;

  noStore(res);

  const cursor = readIntQuery(req, 'cursor', 1);
  const batchSize = readIntQuery(req, 'batchSize', 5);

  const result = await runBackfillBatch(repo, source, cursor, batchSize);
  res.status(200).json(result);
});
