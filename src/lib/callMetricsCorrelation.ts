import type { CallTechnicalPerformance } from './callMetricsFormat';
import type { CallMetricsRowDto } from '@/types/api/callMetrics';

/**
 * The one correlation function every Call Metrics consumer uses to join
 * a Call Metrics row to the Interaction it describes — keyed on the
 * proven call_sid === call_id / call_id === interactionId identity (see
 * src/types/api/callMetrics.ts header for the evidence). Never phone
 * number, never timestamp proximity — exact id equality only, per the
 * session brief's explicit "do not invent fuzzy correlation" instruction.
 */
export function buildCallMetricsByInteractionId(
  rows: CallTechnicalPerformance[],
): Map<string, CallTechnicalPerformance> {
  return new Map(rows.map((r) => [r.callSid, r]));
}

/**
 * Session 15.4 — server-side (api/calls/data.ts's ?resource=metrics
 * branch) authorization filter for a scoped (non-all-access) caller.
 * A Call Metrics row carries no stable agent id of its own (only a
 * display string), so authorization is resolved by looking up each
 * row's call_sid in a pre-built call_id -> agent_id map (from an
 * already-authorized call-data fetch) and checking that agent id
 * against the caller's authorized set — fail-closed: a row whose
 * call_sid has no entry in agentIdByCallId at all (unresolvable) is
 * dropped, never passed through on the assumption it's probably fine.
 * Pure and framework-free so it's directly unit-testable without
 * mocking fetch/Vercel request objects.
 */
export function filterCallMetricsRowsByAuthorizedAgents(
  rows: CallMetricsRowDto[],
  agentIdByCallId: Map<string, string | null>,
  authorizedAgentIds: string[],
): CallMetricsRowDto[] {
  const authorized = new Set(authorizedAgentIds);
  return rows.filter((row) => {
    const agentId = agentIdByCallId.get(row.call_sid);
    return agentId !== null && agentId !== undefined && authorized.has(agentId);
  });
}
