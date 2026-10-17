import type { SupabaseClient } from '@supabase/supabase-js';
import type { InteractionSourceAdapter } from '../customer360/interactionSourceAdapter.js';
import type { SourceInteraction } from '../customer360/types.js';
import { mapEntry } from '../customer360/voiceAgentInteractionSource.js';
import { chatInteractionSource } from '../customer360/chatInteractionSource.js';
import { fetchCompleteCallPopulation } from '../analytics/callPopulationFetcher.js';
import { buildCmaSyncPayload } from './cmaSyncMapping.js';

/**
 * Session CMA-1B — the one real orchestration function both Call sync
 * and Chat sync share: fetch one bounded page via the SAME
 * `InteractionSourceAdapter.listPage()` Customer 360 already uses
 * (`voiceAgentInteractionSource`/`chatInteractionSource` —
 * `src/server/customer360/interactionSourceAdapter.ts`), then call the
 * CMA-1A `call_center_sync_interaction` RPC for every row, with NO
 * identity-resolution gate at all — unlike `reconcileJob.ts`/
 * `backfillJob.ts`'s `if (!resolved) continue;`, every row `listPage`
 * returns is synced, identified or not. This is the one behavioral
 * difference from Customer 360's own ingestion; everything else
 * (pagination, the `status=inactive`-only completed-call population for
 * Voice, trial/test exclusion + campaign-context enrichment for Chat) is
 * inherited unmodified from the existing adapters.
 *
 * A single row's sync failure does not abort the page — collected into
 * `failed`, so one malformed upstream record cannot block every other
 * record on the same page (brief §6: "clear failure reporting").
 *
 * `syncSourcePage`/`syncAllPages` below are used ONLY by the historical
 * backfill (`cmaBackfill.ts`), which is legitimately page-cursor-driven:
 * a backfill's job is "walk every page of all history exactly once,"
 * which makes no assumption about what order those pages arrive in — it
 * terminates when it has seen every page, not when it has seen "the
 * newest" ones.
 *
 * CMA-1B.1 correction — ordering-independent window synchronization.
 * The previous revision of this module's `syncSourcePage` was also used
 * directly by `cmaPolling.ts` to re-sync "page 1" on a short interval,
 * on the UNVERIFIED assumption that page 1 contains the most-recently-
 * started/most-recently-updated records. That assumption is now removed
 * everywhere outside the (order-independent) backfill path. The two new
 * functions below — `syncCallWindow`/`syncChatWindow` — synchronize an
 * explicit `[startedFrom, startedTo)` period by retrieving EVERY
 * eligible interaction in that period (never just "page 1"), identifying
 * each one by `(source, interactionId)` through the same idempotent RPC,
 * never by its position in any page of API results. `cmaPolling.ts` and
 * `cmaIdReconciliation.ts` are the only callers of these two functions
 * now; `cmaPolling.ts` no longer has its own page-order-dependent logic.
 *
 * Call vs. Chat — investigated, not assumed identical (brief: "do not
 * assume both offer identical date-filter or pagination capabilities"):
 *
 * - Call Data API (`GET /api/v1/call-data`) genuinely supports
 *   server-side `date_from`/`date_to` (confirmed in
 *   `src/types/api/calls.ts`'s documented `CallDataQueryDto` and already
 *   exercised by `callPopulationFetcher.ts`/`ratioService.ts`/CMA-1A's
 *   own reconciliation). `syncCallWindow` reuses
 *   `fetchCompleteCallPopulation`, which already (a) sends the window as
 *   `date_from`/`date_to`, (b) exhaustively pages until the backend's own
 *   `total_pages` is reached or a safety cap (`maxPages`) is hit, and (c)
 *   honestly reports `capped: true` rather than silently truncating when
 *   that cap is hit. So for Calls, "retrieve every eligible interaction
 *   for the period, traversing all available pages" is satisfied by the
 *   upstream's own real date filter plus full pagination — no row from
 *   outside the window is ever fetched in the first place.
 * - Chat sessions API (`GET /api/v1/chat/sessions`) has NO date-filter
 *   parameter anywhere in its documented contract
 *   (`src/types/api/chat.ts`'s `ChatSessionListRowDto`/the two real call
 *   sites in `chatInteractionSource.ts` — neither ever sends a date
 *   query param). There is no server-side adapter-level translation
 *   available for Chat's date semantics because the upstream contract
 *   has none to translate. The only honest option that does not
 *   silently truncate the population is to retrieve EVERY page of the
 *   entire chat-sessions list (bounded by a safety cap, same `capped`
 *   discipline as Calls) and filter by `startedAt` client-side against
 *   the requested window. This is real, not a shortcut: at today's real
 *   population (17 chat-sessions rows total, confirmed CMA-1A.4) it is
 *   cheap; it is documented here and in the session doc as a residual,
 *   upstream-imposed limitation that gets more expensive as the chat
 *   population grows, not a defect introduced by this codebase.
 */

export interface CmaSyncRowFailure {
  interactionId: string;
  error: string;
}

export interface CmaSyncPageResult {
  page: number;
  totalPages: number;
  rowsFetched: number;
  synced: number;
  inserted: number;
  updated: number;
  failed: CmaSyncRowFailure[];
}

async function syncRows(supabase: SupabaseClient, rows: SourceInteraction[]): Promise<{
  inserted: number;
  updated: number;
  failed: CmaSyncRowFailure[];
}> {
  let inserted = 0;
  let updated = 0;
  const failed: CmaSyncRowFailure[] = [];

  for (const row of rows) {
    const payload = buildCmaSyncPayload(row);
    const { data, error } = await supabase.rpc('call_center_sync_interaction', { p_payload: payload });
    if (error) {
      failed.push({ interactionId: row.interactionId, error: error.message });
      continue;
    }
    if ((data as { wasInsert?: boolean } | null)?.wasInsert) inserted++;
    else updated++;
  }

  return { inserted, updated, failed };
}

/** Used only by the historical backfill (`cmaBackfill.ts`) — see module header for why page-cursor walking is legitimately order-independent there. */
export async function syncSourcePage(
  supabase: SupabaseClient,
  adapter: InteractionSourceAdapter,
  page: number,
  pageSize: number,
): Promise<CmaSyncPageResult> {
  const { rows, totalPages } = await adapter.listPage(page, pageSize);
  const { inserted, updated, failed } = await syncRows(supabase, rows);

  return {
    page,
    totalPages,
    rowsFetched: rows.length,
    synced: inserted + updated,
    inserted,
    updated,
    failed,
  };
}

export interface CmaWindowSyncResult {
  source: string;
  startedFrom: string;
  startedTo: string;
  pagesFetched: number;
  rowsFetched: number;
  synced: number;
  inserted: number;
  updated: number;
  failed: CmaSyncRowFailure[];
  /**
   * true when a safety page cap was hit before every page of the
   * upstream's OWN filtered (Call) or full (Chat) result set was
   * retrieved — an honest signal that this window's sync may be
   * incomplete, exactly like `callPopulationFetcher.ts`'s own `capped`
   * field. Never silently absorbed into a false "complete" result.
   */
  capped: boolean;
}

const DEFAULT_CALL_MAX_PAGES = 30; // mirrors callPopulationFetcher.ts's own documented cap (100 x 30 = 3000 records)
const DEFAULT_CALL_PAGE_SIZE = 100;
const DEFAULT_CHAT_MAX_PAGES = 50; // chat has no server-side date filter — this bounds the full-population page walk per window sync
const DEFAULT_CHAT_PAGE_SIZE = 100;

/**
 * Window-based Call synchronization. `startedFrom`/`startedTo` are the
 * half-open timestamptz bounds this module and the sync RPC agree on;
 * `dateFrom`/`dateTo` (YYYY-MM-DD) are the SAME period translated to the
 * upstream Call Data API's real inclusive-calendar-date contract — see
 * `interactionReconciliation.ts`'s `computeInclusiveDateWindowBounds`,
 * which every caller of this function uses to derive both pairs from one
 * requested period, so the upstream fetch and the half-open local
 * comparison always describe the identical window.
 *
 * Safe to re-run for the same period any number of times: every row is
 * identified and upserted by `(source, interactionId)` through the
 * existing idempotent RPC, never by page position.
 */
export async function syncCallWindow(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string,
  startedFrom: string,
  startedTo: string,
  maxPages: number = DEFAULT_CALL_MAX_PAGES,
  pageSize: number = DEFAULT_CALL_PAGE_SIZE,
): Promise<CmaWindowSyncResult> {
  const population = await fetchCompleteCallPopulation({ dateFrom, dateTo }, maxPages, pageSize);
  const rows = population.calls.map(mapEntry);
  const { inserted, updated, failed } = await syncRows(supabase, rows);
  const pagesFetched = rows.length === 0 ? 0 : Math.ceil(rows.length / pageSize);

  return {
    source: 'call-data',
    startedFrom,
    startedTo,
    pagesFetched,
    rowsFetched: rows.length,
    synced: inserted + updated,
    inserted,
    updated,
    failed,
    capped: population.capped,
  };
}

/**
 * Window-based Chat synchronization. No server-side date filter exists
 * upstream (see module header) — this exhaustively pages the full
 * chat-sessions list (bounded by `maxPages`, honestly flagged via
 * `capped` if that bound is hit before upstream's own `total_pages` is
 * reached) and filters by `startedAt` against `[startedFrom, startedTo)`
 * client-side before syncing. `chatInteractionSource.listPage` already
 * applies the existing trial/test exclusion and campaign-name enrichment
 * — unchanged, reused as-is.
 */
/**
 * Pure — which rows' `startedAt` fall inside the half-open
 * `[startedFrom, startedTo)` period. Extracted so the client-side
 * window filter Chat sync must apply (no server-side date filter
 * exists upstream) is independently, deterministically testable —
 * exercised directly by `.tooling/scripts/cma-interaction-synchronization-verify.mjs`,
 * not only by hand-tracing `syncChatWindow`'s orchestration.
 */
export function filterRowsInWindow(rows: SourceInteraction[], startedFrom: string, startedTo: string): SourceInteraction[] {
  return rows.filter((row) => row.startedAt >= startedFrom && row.startedAt < startedTo);
}

export async function syncChatWindow(
  supabase: SupabaseClient,
  startedFrom: string,
  startedTo: string,
  maxPages: number = DEFAULT_CHAT_MAX_PAGES,
  pageSize: number = DEFAULT_CHAT_PAGE_SIZE,
): Promise<CmaWindowSyncResult> {
  const matched: SourceInteraction[] = [];
  let pagesFetched = 0;
  let capped = false;

  for (let page = 1; page <= maxPages; page++) {
    const { rows, totalPages } = await chatInteractionSource.listPage(page, pageSize);
    pagesFetched++;
    matched.push(...filterRowsInWindow(rows, startedFrom, startedTo));
    if (page >= totalPages) break;
    if (page === maxPages) capped = true;
  }

  const { inserted, updated, failed } = await syncRows(supabase, matched);

  return {
    source: 'chat-sessions',
    startedFrom,
    startedTo,
    pagesFetched,
    rowsFetched: matched.length,
    synced: inserted + updated,
    inserted,
    updated,
    failed,
    capped,
  };
}
