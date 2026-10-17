import type { SupabaseClient } from '@supabase/supabase-js';
import { runCmaPollingTick, type CmaPollingTickResult } from './cmaPolling.js';

/**
 * CMA Synchronization — Manual UI Control.
 *
 * The originally-planned Vercel Cron polling (5-minute cadence) turned
 * out to be unsupported on this team's confirmed Hobby plan (cron is
 * daily-only there). This module is the server-side orchestration behind
 * the admin-UI "Sync Now" control that replaces it: it wraps the SAME
 * window-based synchronization primitive CMA-1B.1's own polling already
 * uses (`runCmaPollingTick` in cmaPolling.ts) — never a separate sync
 * path — and adds the run-log bookkeeping (`call_center_cma_sync_runs_*`
 * RPCs) the UI needs for persisted status/history across reloads.
 *
 * Default window: `[lastSuccessfulSync - overlap, now)`. The overlap
 * exists for the same reason `runCmaPollingTick`'s own rolling window is
 * wider than its polling interval — a record whose relevant timestamp
 * landed just before the previous run's window closed must still be
 * re-covered, not missed at the boundary. When there is no prior
 * successful run (`Never Run`), or the caller explicitly supplies a
 * lookback (the brief's "configurable lookback period for initial
 * synchronization or recovery"), that explicit/initial value is used
 * instead.
 */

/** 20 minutes — comfortably wider than the manual "click Sync Now whenever you remember" cadence this replaces polling with. */
export const CMA_SYNC_DEFAULT_OVERLAP_MS = 20 * 60 * 1000;

/** Used only when there is no prior successful run AND no explicit lookback was supplied — matches CMA_POLLING_ROLLING_WINDOW_MS's own documented default. */
export const CMA_SYNC_INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type CmaSyncLookbackMode = 'since_last_success' | 'explicit';

export interface CmaSyncWindow {
  startedFrom: string;
  startedTo: string;
  lookbackMode: CmaSyncLookbackMode;
}

/**
 * Pure — computes the `[startedFrom, startedTo)` window a manual sync run
 * should use. `lastSuccessfulSyncFinishedAt` is the previous successful
 * run's `finished_at` (or null if there has never been one);
 * `explicitLookbackHours` is the admin-supplied override, taking
 * precedence over the last-success-derived default whenever supplied.
 */
export function computeManualSyncWindow(
  lastSuccessfulSyncFinishedAt: string | null,
  explicitLookbackHours: number | null,
  now: Date = new Date(),
  overlapMs: number = CMA_SYNC_DEFAULT_OVERLAP_MS,
): CmaSyncWindow {
  const startedTo = now.toISOString();

  if (explicitLookbackHours != null) {
    return {
      startedFrom: new Date(now.getTime() - explicitLookbackHours * 60 * 60 * 1000).toISOString(),
      startedTo,
      lookbackMode: 'explicit',
    };
  }

  if (lastSuccessfulSyncFinishedAt) {
    return {
      startedFrom: new Date(new Date(lastSuccessfulSyncFinishedAt).getTime() - overlapMs).toISOString(),
      startedTo,
      lookbackMode: 'since_last_success',
    };
  }

  // Never run successfully before, and no explicit lookback given.
  return {
    startedFrom: new Date(now.getTime() - CMA_SYNC_INITIAL_LOOKBACK_MS).toISOString(),
    startedTo,
    lookbackMode: 'explicit',
  };
}

/** Pure — success/partial/failed from a completed tick's own counts. A tick that never ran at all (an exception before any sync attempt) is always 'failed', handled by the caller, not this function. */
export function classifySyncOutcome(tick: CmaPollingTickResult): 'success' | 'partial' | 'failed' {
  const totalFailed = tick.call.failed.length + tick.chat.failed.length;
  if (totalFailed === 0) return 'success';
  return tick.totalSynced > 0 ? 'partial' : 'failed';
}

export interface ManualSyncOutcome {
  alreadyRunning: boolean;
  runId: string;
  status?: 'success' | 'partial' | 'failed';
  tick?: CmaPollingTickResult;
  errorDetail?: string;
}

/**
 * Starts (or reports an already-running) manual sync, runs it via the
 * existing `runCmaPollingTick`, and records the outcome. The concurrency
 * lock is the migration's partial unique index — enforced by
 * `call_center_cma_sync_runs_start` itself, never re-checked here.
 */
export async function runManualCmaSync(
  supabase: SupabaseClient,
  triggeredByUserId: string,
  explicitLookbackHours: number | null,
  now: Date = new Date(),
): Promise<ManualSyncOutcome> {
  const { data: historyData, error: historyError } = await supabase.rpc('call_center_cma_sync_runs_list', { p_limit: 20 });
  if (historyError) throw new Error(`call_center_cma_sync_runs_list failed: ${historyError.message}`);
  const history = (historyData as Array<{ status: string; finishedAt: string | null }>) ?? [];
  const lastSuccess = history.find((r) => r.status === 'success');

  const window = computeManualSyncWindow(lastSuccess?.finishedAt ?? null, explicitLookbackHours, now);

  const { data: startData, error: startError } = await supabase.rpc('call_center_cma_sync_runs_start', {
    p_triggered_by: triggeredByUserId,
    p_window_started_from: window.startedFrom,
    p_window_started_to: window.startedTo,
    p_lookback_mode: window.lookbackMode,
  });
  if (startError) throw new Error(`call_center_cma_sync_runs_start failed: ${startError.message}`);
  const start = startData as { alreadyRunning: boolean; runId: string };
  if (start.alreadyRunning) {
    return { alreadyRunning: true, runId: start.runId };
  }

  const rollingWindowMs = new Date(window.startedTo).getTime() - new Date(window.startedFrom).getTime();

  let tick: CmaPollingTickResult | undefined;
  let status: 'success' | 'partial' | 'failed';
  let errorDetail: string | undefined;

  try {
    tick = await runCmaPollingTick(supabase, rollingWindowMs, now);
    status = classifySyncOutcome(tick);
  } catch (err) {
    errorDetail = err instanceof Error ? err.message : String(err);
    status = 'failed';
  }

  await supabase.rpc('call_center_cma_sync_runs_complete', {
    p_run_id: start.runId,
    p_status: status,
    p_calls_processed: tick?.call.rowsFetched ?? 0,
    p_calls_inserted: tick?.call.inserted ?? 0,
    p_calls_updated: tick?.call.updated ?? 0,
    p_calls_failed: tick?.call.failed.length ?? 0,
    p_chats_processed: tick?.chat.rowsFetched ?? 0,
    p_chats_inserted: tick?.chat.inserted ?? 0,
    p_chats_updated: tick?.chat.updated ?? 0,
    p_chats_failed: tick?.chat.failed.length ?? 0,
    p_error_detail: errorDetail ?? null,
  });

  return { alreadyRunning: false, runId: start.runId, status, tick, errorDetail };
}
