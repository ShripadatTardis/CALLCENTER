/**
 * Session CMA-4A. The Dashboard's Performance Ratio cards call
 * `useRatioSummary(ratioId, {})` — no `range` filter — which the legacy
 * ratio engine resolves via `rangeToDateWindow(undefined)`
 * (`src/server/analytics/callPopulationFetcher.ts`): `range ?? '24h'`,
 * i.e. "yesterday through today", both calendar dates INCLUSIVE, per that
 * function's own documented "call-data API's inclusive date-range
 * contract".
 *
 * `cmaEvaluate` has no implicit default window — every caller must supply
 * explicit `window.from`/`window.to` ISO timestamps, and its window is
 * half-open `[from, to)`. This reproduces the exact same calendar-day
 * population as the legacy default so a CMA-backed Dashboard card shows
 * the same window the equivalent legacy card showed, not a silently
 * different one.
 */
export function defaultDashboardCmaWindow(): { from: string; to: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fromDateOnly = yesterday.toISOString().slice(0, 10);
  const toDateOnly = now.toISOString().slice(0, 10);
  const toExclusive = new Date(`${toDateOnly}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from: `${fromDateOnly}T00:00:00.000Z`, to: toExclusive.toISOString() };
}
