import type { SupabaseClient } from '@supabase/supabase-js';
import { syncCallWindow, syncChatWindow, type CmaWindowSyncResult } from './cmaSync.js';
import { computeInclusiveDateWindowBounds } from './interactionReconciliation.js';

/**
 * Session CMA-1B.1 — incremental polling, corrected.
 *
 * CMA-1B's original revision re-synced "page 1" of `listPage` on a
 * short interval, on the UNVERIFIED assumption that page 1 contains the
 * most-recently-started/most-recently-updated records. That assumption
 * is removed. Polling now invokes the SAME window-based synchronization
 * mechanism `cmaIdReconciliation.ts` and a manual windowed sync would
 * use (`syncCallWindow`/`syncChatWindow` in `cmaSync.ts`) against an
 * explicit, bounded, recent `[startedFrom, startedTo)` period — never a
 * page-order-dependent strategy of its own.
 *
 * Investigated (see `cmaSync.ts`'s own header for the full finding):
 * neither the real Call Data API nor the real Chat sessions API exposes
 * an `updated_since`/`modified_since` filter. Call DOES support a real
 * server-side `date_from`/`date_to` window (exhaustively paged by
 * `syncCallWindow`/`fetchCompleteCallPopulation`); Chat has no date
 * filter at all, so its window sync must page through the full
 * chat-sessions list and filter client-side (bounded, honestly flagged
 * via `capped` — see `cmaSync.ts`).
 *
 * Resynchronization strategy (brief: "a bounded rolling-window
 * resynchronization strategy, supplemented by periodic historical-window
 * reconciliation"), both built on the SAME window-based primitives:
 *
 * 1. Rolling window resync (this module, `runCmaPollingTick`): every
 *    tick re-syncs a short, recent, overlapping window —
 *    `[now - CMA_POLLING_ROLLING_WINDOW_MS, now)` — at
 *    `CMA_POLLING_INTERVAL_MS` cadence. The window intentionally
 *    OVERLAPS the previous tick's window (the rolling window is wider
 *    than the polling interval — default 24h window on a 5-minute
 *    cadence) so a record whose `started_at`/mutable facts changed
 *    slightly before or after a tick boundary is still re-covered by a
 *    later tick, not missed at the edge. Idempotent by construction
 *    (`(source, interactionId)` upsert) — re-syncing the same record
 *    inside the overlap is a safe no-op, never a duplicate.
 * 2. Periodic historical-window reconciliation (NOT re-implemented
 *    here — reuses `cmaIdReconciliation.ts`'s existing
 *    `runCmaCallIdReconciliation`/`runCmaChatIdReconciliation` on a much
 *    wider period, e.g. a full day or a full historical range, run on a
 *    slower cadence (daily, matching this Hobby-plan deployment's other
 *    cron entries — see `docs/SESSION_CMA_1B_INTERACTION_SYNCHRONIZATION.md`
 *    for the real platform-cadence constraint). This catches anything
 *    the rolling window's shorter lookback could still miss (a record
 *    that changed, or newly appeared, with a `started_at` far outside
 *    the rolling window's recent lookback — e.g. a backdated/corrected
 *    record). Reconciliation only ever REPORTS drift (missing/
 *    unexpected/stale IDs) — a separate, already-idempotent call to
 *    `syncCallWindow`/`syncChatWindow` for the same wider window is what
 *    would actually correct it, same primitive either way.
 *
 * Scheduling itself is NOT enabled by this session — brief §4/§9
 * explicitly require production scheduling to stay disabled until
 * separately approved, and forbid adding a Vercel Cron entry. This
 * module only exposes the entry point + its configuration; nothing in
 * `vercel.json` references it.
 */

/** Five minutes, per the brief's own stated starting point — a named, not inline, constant so a future approval decision has one place to change it. */
export const CMA_POLLING_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How far back each tick's rolling window reaches, from "now." Wider
 * than the polling interval on purpose — see module header, point 1
 * (overlap, not a razor-thin window that could miss a late edge update).
 */
export const CMA_POLLING_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CmaPollingTickResult {
  call: CmaWindowSyncResult;
  chat: CmaWindowSyncResult;
  totalSynced: number;
  totalFailed: number;
}

/**
 * One rolling-window resync tick for both Call and Chat, covering
 * `[now - rollingWindowMs, now)`. Call's window is additionally
 * translated to the upstream API's real inclusive-calendar-date
 * `date_from`/`date_to` via `computeInclusiveDateWindowBounds` (the same
 * translation CMA-1A's own reconciliation already uses) so the upstream
 * fetch and the local half-open comparison describe the identical
 * period; Chat has no equivalent upstream date parameter to translate
 * (see `cmaSync.ts`), so its window is applied client-side only.
 */
export async function runCmaPollingTick(
  supabase: SupabaseClient,
  rollingWindowMs: number = CMA_POLLING_ROLLING_WINDOW_MS,
  now: Date = new Date(),
): Promise<CmaPollingTickResult> {
  const startedToDate = now;
  const startedFromDate = new Date(now.getTime() - rollingWindowMs);
  const startedFrom = startedFromDate.toISOString();
  const startedTo = startedToDate.toISOString();

  // Call Data API only accepts whole calendar dates — widen to the
  // calendar day containing startedFrom..startedTo, inclusive both ends,
  // then translate back to the exact half-open bounds for the local
  // comparison (computeInclusiveDateWindowBounds's documented contract).
  const dateFrom = startedFrom.slice(0, 10);
  const dateTo = startedTo.slice(0, 10);
  const { startedFrom: callStartedFrom, startedTo: callStartedTo } = computeInclusiveDateWindowBounds(dateFrom, dateTo);

  const call = await syncCallWindow(supabase, dateFrom, dateTo, callStartedFrom, callStartedTo);
  const chat = await syncChatWindow(supabase, startedFrom, startedTo);

  return {
    call,
    chat,
    totalSynced: call.synced + chat.synced,
    totalFailed: call.failed.length + chat.failed.length,
  };
}
