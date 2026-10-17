/**
 * Session CMA-1A — minimal, read-only interaction population
 * reconciliation (brief §5). Pure comparison logic only: given the
 * LOCAL population count (from the new
 * public.call_center_cma_interaction_population_count RPC) and the
 * UPSTREAM population count (from the real Call Data API, for the same
 * source + time window), compute a drift report. No network or
 * database call happens in this module — callers (e.g.
 * api/_cma.ts, not part of this session's scope) are responsible for
 * fetching both inputs.
 *
 * Deliberately excludes: a polling scheduler, a historical backfill,
 * and any write path — this module can only ever report a discrepancy,
 * never correct one (brief §5, "Do not implement the polling scheduler
 * or historical backfill in this session").
 *
 * CMA-1A.1 correction — two real bugs fixed here (see
 * docs/SESSION_CMA_1A_INTERACTION_BASE_FACTS.md, "CMA-1A.1 correction
 * appendix" for the full investigation):
 *
 * 1. `customer_interactions.source` is a real, distinct identifier
 *    space from this codebase's existing reconciliation-job
 *    "checkpoint source" labels ('voice'/'chat', used only by
 *    reconcileJob.ts's high-water-mark bookkeeping). The real column
 *    values, confirmed live, are 'call-data' (614 rows) and
 *    'chat-sessions' (17 rows) — never 'voice'. CMA-1A's own
 *    api/_cma.ts hardcoded 'voice', which matches zero real rows.
 *    `CALL_DATA_SOURCE` below is the single place this literal is now
 *    defined, so no future caller can reintroduce the same confusion
 *    silently — the migration's new CHECK constraint on `source` is
 *    the actual enforcement point at the database layer; this constant
 *    just keeps this module's own TS call sites from drifting from it.
 * 2. The upstream Call Data API's `date_from`/`date_to` are calendar
 *    dates (YYYY-MM-DD) with INCLUSIVE-both-ends semantics (confirmed
 *    via src/server/analytics/callPopulationFetcher.ts's own
 *    documented contract and rangeToDateWindow's date-only output) —
 *    not a half-open interval. Translating "inclusive of the entire
 *    `to` calendar day" into a timestamptz comparison requires an
 *    EXCLUSIVE upper bound at the start of the day AFTER `to` (a bare
 *    `started_at <= 2026-01-31` would wrongly exclude all of
 *    2026-01-31 except exactly midnight). `computeInclusiveDateWindowBounds`
 *    below performs exactly this translation, so the local RPC call
 *    and the upstream fetch describe the same population for the same
 *    requested calendar window.
 */

/** The real `customer_interactions.source` value for voice/call interactions (confirmed live: 614 rows). Never 'voice' — that string is a DIFFERENT, pre-existing identifier (reconcileJob.ts's checkpoint-source label), not a value ever written to this column. */
export const CALL_DATA_SOURCE = 'call-data';

/**
 * Translates an inclusive calendar-date window (as sent verbatim to the
 * upstream Call Data API's `date_from`/`date_to`, which treats both
 * bounds as inclusive whole days) into the equivalent half-open
 * timestamptz bounds this module's local population-count RPC expects
 * (`started_at >= startedFrom AND started_at < startedTo`, exclusive
 * upper bound — see public.call_center_cma_interaction_population_count
 * in the CMA-1A migration). `dateFrom`/`dateTo` must be `YYYY-MM-DD`.
 */
export function computeInclusiveDateWindowBounds(
  dateFrom: string,
  dateTo: string,
): { startedFrom: string; startedTo: string } {
  const startedFrom = `${dateFrom}T00:00:00.000Z`;
  const toExclusive = new Date(`${dateTo}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { startedFrom, startedTo: toExclusive.toISOString() };
}

export interface InteractionPopulationCount {
  source: string | null;
  startedFrom: string | null;
  startedTo: string | null;
  totalRows: number;
  nullCustomerId: number;
  cmaSyncRows: number;
  customer360Rows: number;
  oldestStartedAt: string | null;
  newestStartedAt: string | null;
}

export interface ReconciliationDrift {
  source: string;
  startedFrom: string;
  startedTo: string;
  localTotal: number;
  upstreamTotal: number;
  /** upstreamTotal - localTotal. Positive means the local table is missing rows relative to upstream. */
  delta: number;
  /** delta as a fraction of upstreamTotal, or null when upstreamTotal is 0 (avoids a divide-by-zero misrepresenting "no drift"). */
  deltaRatio: number | null;
  /** true when localTotal === upstreamTotal for this exact window — the only condition this module calls a clean match. */
  matches: boolean;
}

/**
 * Compares a local population count (this project's own table) against
 * an upstream population count (the real Call Data API) for the SAME
 * source and time window. Both inputs must already describe the same
 * window — this function does not itself validate that `local` and
 * `upstream` were fetched for comparable parameters; callers must pass
 * a window/source pair consistently to both counts (see
 * docs/SESSION_CMA_1A_INTERACTION_BASE_FACTS.md's reconciliation
 * section for why this comparability requirement is the real lesson
 * from Phase 3's own 626-vs-756 investigation — two counts over
 * different populations are not a valid drift signal).
 */
export function computeReconciliationDrift(
  source: string,
  startedFrom: string,
  startedTo: string,
  localTotal: number,
  upstreamTotal: number,
): ReconciliationDrift {
  const delta = upstreamTotal - localTotal;
  const deltaRatio = upstreamTotal === 0 ? null : delta / upstreamTotal;
  return {
    source,
    startedFrom,
    startedTo,
    localTotal,
    upstreamTotal,
    delta,
    deltaRatio,
    matches: delta === 0,
  };
}
