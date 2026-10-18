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

/**
 * Session CMA-4B. `call_center_campaign_list` (the legacy source of
 * Outbound Campaigns' stat strip) has no time-window filter at all — its
 * `target_count`/`classified_count`/`success_count` are genuinely
 * all-time across every campaign. `cmaEvaluate` has no "all time" mode,
 * so this constructs the narrowest window guaranteed to cover every
 * currently-listed campaign's targets: from the earliest campaign's
 * `createdAt` (campaign creation necessarily precedes any of its
 * targets' own `created_at`) through now. Returns null when there are no
 * campaigns to evaluate (nothing to construct a window from, and the
 * legacy path already renders the correct all-zero/empty state).
 *
 * Verified against production before this was written (not assumed):
 * CAMP-01/CAMP-02 evaluated with this exact window construction returned
 * byte-identical totals to `call_center_campaign_list`'s own summed
 * target_count/classified_count/success_count — see
 * docs/SESSION_CMA_4B_OPERATIONAL_INTEGRATION.md.
 */
export function campaignAllTimeCmaWindow(campaigns: { createdAt: string }[]): { from: string; to: string } | null {
  if (campaigns.length === 0) return null;
  const earliest = campaigns.reduce((min, c) => Math.min(min, new Date(c.createdAt).getTime()), Infinity);
  return { from: new Date(earliest).toISOString(), to: new Date().toISOString() };
}
