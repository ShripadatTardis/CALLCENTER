import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseCustomerRepository } from '../src/server/customer360/supabaseCustomerRepository.js';
import { voiceAgentInteractionSource } from '../src/server/customer360/voiceAgentInteractionSource.js';
import { resolveAuthorizedAccess, type AuthorizedAccess } from '../src/server/customer360/authorizationService.js';
import { withErrorBoundary, noStore } from './_voicebot.js';

/**
 * Shared transport-layer wiring for /api/customers/* routes — this file
 * is the "current deployment adapter" boundary (plan §0.3): it is the
 * ONLY place that picks concrete implementations
 * (supabaseCustomerRepository, voiceAgentInteractionSource) for the
 * domain-layer interfaces. A future deployment swaps only this file's
 * two imports, not any file under src/server/customer360.
 */
export const repo = supabaseCustomerRepository;
export const source = voiceAgentInteractionSource;
export { withErrorBoundary, noStore };

/**
 * KNOWN LIMITATION (plan §0.1) — read before touching this function.
 * This app has no server-verifiable session today (see
 * src/contexts/AuthContext.tsx: client-side only, backed by
 * localStorage, no cookie/JWT/server session of any kind). The role
 * read here is exactly what the request claims — an advisory signal
 * for a well-behaved client, not a security boundary. Category
 * filtering built on top of this (authorizationService.ts) is real
 * server-side FILTERING, but is not, and must never be described as,
 * real ACCESS CONTROL until this app has a real server session to
 * replace this header read with.
 */
export function getClientSuppliedRole(req: VercelRequest): string {
  const header = req.headers['x-user-role'];
  const role = Array.isArray(header) ? header[0] : header;
  return role || 'unauthenticated';
}

export async function resolveAccessForRequest(req: VercelRequest): Promise<AuthorizedAccess> {
  const role = getClientSuppliedRole(req);
  return resolveAuthorizedAccess(repo, role);
}

/**
 * Minimal operational safeguard (NOT a fix for §0.1) for the two
 * expensive, mutating, internal/admin jobs (backfill, reconcile) — a
 * shared secret so a random internet caller can't repeatedly trigger
 * hundreds of upstream call-data pages or hammer Supabase. This is
 * orthogonal to role/category authorization and does not claim to be
 * real user authentication either.
 */
export function requireAdminToken(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.CUSTOMER360_ADMIN_TOKEN;
  if (!expected) {
    res.status(500).json({ detail: 'CUSTOMER360_ADMIN_TOKEN is not configured on the server' });
    return false;
  }
  const header = req.headers['x-admin-token'];
  const provided = Array.isArray(header) ? header[0] : header;
  if (provided !== expected) {
    res.status(401).json({ detail: 'Invalid or missing admin token' });
    return false;
  }
  return true;
}

export function readIntQuery(req: VercelRequest, key: string, fallback: number): number {
  const raw = req.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
