import type { SupabaseClient } from '@supabase/supabase-js';
import type { InteractionSourceAdapter } from '../customer360/interactionSourceAdapter.js';
import { syncSourcePage, type CmaSyncRowFailure } from './cmaSync.js';

/**
 * Session CMA-1B — controlled, resumable historical backfill for CMA
 * Base Facts (brief §3). Deliberately mirrors
 * `src/server/customer360/backfillJob.ts`'s own cursor/batchSize/
 * nextCursor shape byte-for-byte in structure (bounded per invocation,
 * a plain numeric page cursor as the resume token, idempotent because
 * `call_center_sync_interaction`'s upsert key — `(source,
 * interaction_id)` — makes re-processing any already-synced page a
 * no-op), so recovery after interruption works identically: a caller
 * (the manual admin trigger, or a future scheduler) simply re-invokes
 * with `cursor: nextCursor` from the last result; a killed/failed
 * invocation loses nothing beyond the in-flight batch, because nothing
 * is checkpointed until a page's rows have actually been synced.
 *
 * Differs from `backfillJob.ts` in exactly the one way CMA-1B exists to
 * fix: there is no `resolveCustomerIdentity`/`if (!resolved) continue`
 * gate anywhere in this module — every row `listPage` returns is synced
 * via `syncSourcePage`, identified or not (brief §3: "No requirement
 * for identified customers").
 *
 * No customer aggregate recompute happens here (that is a Customer 360
 * concept — `recomputeCustomerAggregate` — with no CMA equivalent; CMA's
 * own Base Facts table has no derived aggregate to maintain).
 */

export interface CmaBackfillBatchResult {
  nextCursor: number | null;
  pagesProcessed: number;
  interactionsFetched: number;
  interactionsSynced: number;
  interactionsInserted: number;
  interactionsUpdated: number;
  failures: Array<CmaSyncRowFailure & { page: number }>;
}

export async function runCmaBackfillBatch(
  supabase: SupabaseClient,
  adapter: InteractionSourceAdapter,
  cursor: number,
  batchSize: number,
): Promise<CmaBackfillBatchResult> {
  let pagesProcessed = 0;
  let interactionsFetched = 0;
  let interactionsSynced = 0;
  let interactionsInserted = 0;
  let interactionsUpdated = 0;
  const failures: Array<CmaSyncRowFailure & { page: number }> = [];
  let nextCursor: number | null = cursor;
  let totalPages: number | null = null;

  for (let i = 0; i < batchSize; i++) {
    const page = cursor + i;
    if (totalPages !== null && page > totalPages) {
      nextCursor = null;
      break;
    }

    const result = await syncSourcePage(supabase, adapter, page, 100);
    totalPages = result.totalPages;
    pagesProcessed++;
    interactionsFetched += result.rowsFetched;
    interactionsSynced += result.synced;
    interactionsInserted += result.inserted;
    interactionsUpdated += result.updated;
    for (const f of result.failed) failures.push({ ...f, page });

    nextCursor = page + 1 > (totalPages ?? page + 1) ? null : page + 1;
    if (nextCursor === null) break;
  }

  return {
    nextCursor,
    pagesProcessed,
    interactionsFetched,
    interactionsSynced,
    interactionsInserted,
    interactionsUpdated,
    failures,
  };
}
