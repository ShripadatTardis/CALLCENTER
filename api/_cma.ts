/**
 * Session CMA-1A — server-side orchestration for the minimal,
 * read-only interaction population reconciliation capability (brief
 * §5). Underscore-prefixed, same convention as api/_auth.ts and
 * api/_voicebot.ts — a shared helper module, NOT a Vercel route, so it
 * does not count against this project's 12-serverless-function Hobby
 * ceiling (confirmed by that same existing convention already holding
 * the function count at 12 with api/_auth.ts and api/_voicebot.ts both
 * present).
 *
 * This module is NOT imported or called from any route in this
 * session — no API endpoint, no polling job, no scheduled trigger was
 * added (brief §5 explicitly excludes a polling scheduler; §7 excludes
 * any new ingestion wiring). It exists so a future session can wire it
 * up, and so this session's own local verification can import and
 * exercise the pure half of its logic (see
 * .tooling/scripts/cma-interaction-reconciliation-verify.mjs). It has
 * NOT been invoked against the live Supabase project or the live Call
 * Data API in this session — see
 * docs/SESSION_CMA_1A_INTERACTION_BASE_FACTS.md, "Tests executed and
 * results", for exactly what was and was not exercised.
 *
 * CMA-1A.1 correction: this function originally passed the literal
 * string 'voice' as `p_source`, which matches ZERO real rows (the real
 * column value is CALL_DATA_SOURCE = 'call-data' — see
 * interactionReconciliation.ts's own correction comment) — this would
 * have reported localTotal: 0 / 100% drift on every real invocation.
 * Also corrected: `dateFrom`/`dateTo` are now explicitly calendar dates
 * (YYYY-MM-DD), translated to the local RPC's half-open timestamptz
 * bounds via computeInclusiveDateWindowBounds so both halves of the
 * comparison describe the same population for the same window.
 */

import { getServiceRoleClient } from './_auth.js';
import { fetchCompleteCallPopulation } from '../src/server/analytics/callPopulationFetcher.js';
import {
  computeReconciliationDrift,
  computeInclusiveDateWindowBounds,
  CALL_DATA_SOURCE,
  type ReconciliationDrift,
  type InteractionPopulationCount,
} from '../src/server/cma/interactionReconciliation.js';

/**
 * Compares the local call_center.customer_interactions population
 * (via the new call_center_cma_interaction_population_count RPC) for
 * source='call-data' against the real upstream Call Data API's total
 * for the SAME inclusive calendar-date window. Chat reconciliation is
 * out of scope for this session (the chat backend has no equivalent
 * complete-population fetcher in this codebase yet) — this function
 * only covers source='call-data', which is the one source this
 * session's migration and sync RPC were verified against.
 *
 * `dateFrom`/`dateTo` MUST be `YYYY-MM-DD` (the upstream Call Data
 * API's own contract — see callPopulationFetcher.ts) — both days are
 * included in the comparison.
 */
export async function reconcileVoiceInteractionPopulation(
  dateFrom: string,
  dateTo: string,
): Promise<ReconciliationDrift> {
  const supabase = getServiceRoleClient();
  const { startedFrom, startedTo } = computeInclusiveDateWindowBounds(dateFrom, dateTo);

  const [localResult, upstream] = await Promise.all([
    supabase.rpc('call_center_cma_interaction_population_count', {
      p_source: CALL_DATA_SOURCE,
      p_started_from: startedFrom,
      p_started_to: startedTo,
    }),
    fetchCompleteCallPopulation({ dateFrom, dateTo }),
  ]);

  if (localResult.error) {
    throw new Error(`call_center_cma_interaction_population_count failed: ${localResult.error.message}`);
  }

  const local = localResult.data as InteractionPopulationCount;
  return computeReconciliationDrift(CALL_DATA_SOURCE, dateFrom, dateTo, local.totalRows, upstream.trueTotalRecords);
}
