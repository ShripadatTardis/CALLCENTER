import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorBoundary, noStore } from './_voicebot.js';
import { getAuthenticatedUser } from './_auth.js';

/**
 * GET /api/me — resolves the real, server-verified Call Centre identity
 * for the current Supabase Auth session. Called by AuthContext right
 * after sign-in (and on load, if a session already exists). Returns 401
 * if there's no valid session or no matching call_center.user_profiles
 * row -- a Supabase Auth account existing is not, by itself, sufficient;
 * only a deliberately-provisioned profile grants access to this app.
 */
export default withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
  noStore(res);
  if (req.method !== 'GET') {
    res.status(405).json({ detail: 'Method not allowed' });
    return;
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ detail: 'No Call Centre profile for this identity' });
    return;
  }

  res.status(200).json({ data: user });
});
