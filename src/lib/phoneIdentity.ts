/**
 * Identity normalization for Customer 360 (Session 4). Distinct from
 * src/lib/format.ts's formatPhoneNumber, which is presentation-only and
 * must never be used for identity matching — it doesn't normalize.
 *
 * This is a plain, dependency-free module deliberately kept import-safe
 * from both the Vite-bundled frontend and the Vercel serverless
 * functions under /api/customers/* (via src/server/customer360/*), per
 * docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §0.3 — it belongs to the
 * logical/domain layer, not to either deployment adapter.
 */

/**
 * Normalizes a raw phone number to a canonical digits-only form with an
 * optional leading '+' preserved when present in the input. Returns
 * null for empty/unparseable input rather than guessing a country code
 * — a guessed country code would silently merge two different real
 * numbers under one normalized value, which is exactly the kind of
 * speculative identity behavior the Customer 360 plan forbids (see plan
 * §3, "Current identity limitations").
 */
export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) return null;

  return hasLeadingPlus ? `+${digits}` : digits;
}
