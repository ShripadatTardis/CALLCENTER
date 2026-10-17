import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCompleteCallPopulation } from '../analytics/callPopulationFetcher.js';
import { chatInteractionSource } from '../customer360/chatInteractionSource.js';
import { CALL_DATA_SOURCE } from './interactionReconciliation.js';

/**
 * Session CMA-1B — extends CMA-1A's count-only reconciliation (brief
 * §5) with the two capabilities CMA-1A's own report explicitly flagged
 * as NOT built: interaction-ID reconciliation (which specific IDs are
 * missing locally / present locally but not upstream) and changed-fact
 * reconciliation (an existing local row whose TRACKED mutable facts —
 * outcome, duration_seconds, escalation_trigger; deliberately a small,
 * named set, not a brittle full-row diff) now differ from upstream's
 * current value for the same ID).
 *
 * Pure diff functions below take no network/DB input — fully
 * deterministic, unit-tested without any live call. The orchestration
 * functions (`runCmaCallIdReconciliation`/`runCmaChatIdReconciliation`)
 * do the real fetching and are NOT exercised by the deterministic test
 * suite; see docs/SESSION_CMA_1B_INTERACTION_SYNCHRONIZATION.md for
 * what was and was not executed against a real environment.
 *
 * Call vs. Chat asymmetry, investigated and disclosed rather than
 * glossed over: the real Call Data API DOES support a server-side
 * `date_from`/`date_to` window filter (reused here via
 * `fetchCompleteCallPopulation`, the SAME fetcher CMA-1A's own
 * population-count reconciliation already uses), so Call ID
 * reconciliation genuinely compares the same bounded population on both
 * sides. The real Chat sessions API has NO server-side date filter on
 * its list endpoint (confirmed by reading `chatInteractionSource.ts`'s
 * `fetchSessions()` — neither of its two call sites ever passes a date
 * parameter) — Chat ID reconciliation can only bound itself by page
 * count (`maxPages`) and filter the window CLIENT-side after fetching,
 * which is a weaker guarantee for a large/old population: if the
 * window's true upstream rows are not within the first `maxPages`
 * pages, this reconciliation pass will not see them. Documented here
 * and in the session doc, not silently assumed equivalent to the Call
 * side.
 */

export interface TrackedFactRow {
  interactionId: string;
  outcome: string | null;
  durationSeconds: number | null;
  escalationTrigger: string | null;
}

export interface IdReconciliationResult {
  missingLocally: string[];
  unexpectedLocally: string[];
  staleFacts: Array<{
    interactionId: string;
    field: 'outcome' | 'durationSeconds' | 'escalationTrigger';
    localValue: string | number | null;
    upstreamValue: string | number | null;
  }>;
  /**
   * CMA-1B.1 — true when the upstream fetch for this window hit a
   * safety page cap before retrieving every eligible record (Call:
   * `fetchCompleteCallPopulation`'s own `capped`; Chat: this window's
   * page walk hit `maxPages` before reaching the real `total_pages`).
   * An honest signal that `missingLocally`/`unexpectedLocally`/
   * `staleFacts` may be incomplete for this run — never silently
   * absorbed into a false "complete" result.
   */
  capped: boolean;
}

/** Pure — which upstream IDs have no local row, and which local IDs have no upstream row, for the SAME window on both sides. */
export function diffInteractionIds(localIds: string[], upstreamIds: string[]): { missingLocally: string[]; unexpectedLocally: string[] } {
  const localSet = new Set(localIds);
  const upstreamSet = new Set(upstreamIds);
  return {
    missingLocally: upstreamIds.filter((id) => !localSet.has(id)),
    unexpectedLocally: localIds.filter((id) => !upstreamSet.has(id)),
  };
}

/** Pure — for IDs present on BOTH sides, do the three tracked mutable facts still match? Only compares rows present in both inputs; a row missing on one side is already reported by diffInteractionIds, not re-reported here. */
export function detectStaleFacts(localRows: TrackedFactRow[], upstreamRows: TrackedFactRow[]): IdReconciliationResult['staleFacts'] {
  const upstreamById = new Map(upstreamRows.map((r) => [r.interactionId, r]));
  const staleFacts: IdReconciliationResult['staleFacts'] = [];
  for (const local of localRows) {
    const upstream = upstreamById.get(local.interactionId);
    if (!upstream) continue;
    if (local.outcome !== upstream.outcome) {
      staleFacts.push({ interactionId: local.interactionId, field: 'outcome', localValue: local.outcome, upstreamValue: upstream.outcome });
    }
    if (local.durationSeconds !== upstream.durationSeconds) {
      staleFacts.push({ interactionId: local.interactionId, field: 'durationSeconds', localValue: local.durationSeconds, upstreamValue: upstream.durationSeconds });
    }
    if (local.escalationTrigger !== upstream.escalationTrigger) {
      staleFacts.push({ interactionId: local.interactionId, field: 'escalationTrigger', localValue: local.escalationTrigger, upstreamValue: upstream.escalationTrigger });
    }
  }
  return staleFacts;
}

async function fetchLocalFacts(
  supabase: SupabaseClient,
  source: string,
  startedFrom: string,
  startedTo: string,
): Promise<TrackedFactRow[]> {
  const { data, error } = await supabase.rpc('call_center_cma_interaction_facts_for_window', {
    p_source: source,
    p_started_from: startedFrom,
    p_started_to: startedTo,
  });
  if (error) throw new Error(`call_center_cma_interaction_facts_for_window failed: ${error.message}`);
  return data as TrackedFactRow[];
}

/**
 * Calls — bounded by the real upstream date window (server-side
 * filtered, via fetchCompleteCallPopulation's own maxPages cap, default
 * unchanged from that fetcher's own 30-page/3000-record documented
 * cap).
 */
export async function runCmaCallIdReconciliation(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string,
  startedFrom: string,
  startedTo: string,
): Promise<IdReconciliationResult> {
  const [localFacts, upstream] = await Promise.all([
    fetchLocalFacts(supabase, CALL_DATA_SOURCE, startedFrom, startedTo),
    fetchCompleteCallPopulation({ dateFrom, dateTo }),
  ]);

  const upstreamFacts: TrackedFactRow[] = upstream.calls.map((c) => ({
    interactionId: c.call_id,
    outcome: c.outcome ?? null,
    durationSeconds: c.duration_seconds ?? c.aht_seconds ?? null,
    escalationTrigger: c.escalation_trigger ?? null,
  }));

  const { missingLocally, unexpectedLocally } = diffInteractionIds(
    localFacts.map((r) => r.interactionId),
    upstreamFacts.map((r) => r.interactionId),
  );
  return {
    missingLocally,
    unexpectedLocally,
    staleFacts: detectStaleFacts(localFacts, upstreamFacts),
    capped: upstream.capped,
  };
}

/**
 * Chats — bounded ONLY by maxPages (no server-side date filter exists
 * upstream; see module header). `startedFrom`/`startedTo` filter the
 * fetched rows client-side before diffing. CMA-1B.1: `capped` is now
 * returned honestly (true when `maxPages` was hit before the real
 * upstream `total_pages` was reached) rather than silently treating a
 * partial page walk as a complete one.
 */
export async function runCmaChatIdReconciliation(
  supabase: SupabaseClient,
  startedFrom: string,
  startedTo: string,
  maxPages: number = 50,
): Promise<IdReconciliationResult> {
  const upstreamFacts: TrackedFactRow[] = [];
  let capped = false;
  for (let page = 1; page <= maxPages; page++) {
    const { rows, totalPages } = await chatInteractionSource.listPage(page, 100);
    for (const row of rows) {
      if (row.startedAt >= startedFrom && row.startedAt < startedTo) {
        upstreamFacts.push({
          interactionId: row.interactionId,
          outcome: row.outcome,
          durationSeconds: row.durationSeconds,
          escalationTrigger: row.escalationTrigger,
        });
      }
    }
    if (page >= totalPages) break;
    if (page === maxPages) capped = true;
  }

  const localFacts = await fetchLocalFacts(supabase, 'chat-sessions', startedFrom, startedTo);

  const { missingLocally, unexpectedLocally } = diffInteractionIds(
    localFacts.map((r) => r.interactionId),
    upstreamFacts.map((r) => r.interactionId),
  );
  return { missingLocally, unexpectedLocally, staleFacts: detectStaleFacts(localFacts, upstreamFacts), capped };
}
