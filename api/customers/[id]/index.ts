import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, source, resolveAccessForRequest, withErrorBoundary, noStore, readIntQuery } from '../../_customer360.js';
import { refreshExistingCustomer } from '../../../src/server/customer360/aggregationService.js';
import {
  buildAuthorizedCustomerView,
  listAuthorizedInteractions,
} from '../../../src/server/customer360/authorizationService.js';

/**
 * GET /api/customers/{id}                       — authorized Customer 360 view (plan §4, §11, §12, §15)
 * GET /api/customers/{id}?action=interactions    — authorized, paginated interaction timeline (plan §10/§15)
 * POST /api/customers/{id}?action=refresh        — explicit forced refresh (plan §15)
 *
 * Session 5 consolidation (docs/CALL_CENTRE_SESSION5_CAMPAIGNS_PLAN.md §21/§23):
 * originally three separate route files (index.ts, interactions.ts,
 * refresh.ts). Merged into this one file, dispatched by `?action=`, to
 * free two Vercel function slots for api/campaigns.ts — the identical,
 * already-proven pattern used for api/customers/admin.ts (Session 4) and
 * api/chat/logs.ts (Session 4.5). No behavior changed: same three
 * operations, same authorization/refresh logic, same response shapes.
 */

async function handleGetView(req: VercelRequest, res: VercelResponse): Promise<void> {
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
}

async function handleInteractions(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id as string;
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);

  const access = await resolveAccessForRequest(req);
  const { rows, totalCount } = await listAuthorizedInteractions(repo, id, access, page, pageSize);

  res.status(200).json({ data: rows, pagination: { page, pageSize, totalCount } });
}

async function handleRefresh(req: VercelRequest, res: VercelResponse): Promise<void> {
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
}

export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);

  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  if (action === 'interactions') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ detail: 'Method not allowed. Use GET.' });
      return;
    }
    await handleInteractions(req, res);
    return;
  }

  if (action === 'refresh') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ detail: 'Method not allowed. Use POST.' });
      return;
    }
    await handleRefresh(req, res);
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }
  await handleGetView(req, res);
});
