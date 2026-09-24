import type { VercelRequest, VercelResponse } from '@vercel/node';
import { repo, resolveAccessForRequest, withErrorBoundary, noStore, readIntQuery } from '../../_customer360.js';
import { listAuthorizedInteractions } from '../../../src/server/customer360/authorizationService.js';

/** GET /api/customers/{id}/interactions — authorized, paginated interaction timeline (plan §10 of the API list / §15). */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ detail: 'Method not allowed. Use GET.' });
    return;
  }

  noStore(res);

  const id = req.query.id as string;
  const page = readIntQuery(req, 'page', 1);
  const pageSize = readIntQuery(req, 'pageSize', 25);

  const access = await resolveAccessForRequest(req);
  const { rows, totalCount } = await listAuthorizedInteractions(repo, id, access, page, pageSize);

  res.status(200).json({ data: rows, pagination: { page, pageSize, totalCount } });
});
