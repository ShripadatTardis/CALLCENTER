import type { SourceInteraction } from '../customer360/types.js';

/**
 * Session CMA-1B — maps a `SourceInteraction` (the same shared shape
 * `voiceAgentInteractionSource.ts` / `chatInteractionSource.ts` already
 * produce for Customer 360's own `listPage()`) into the exact payload
 * shape `public.call_center_sync_interaction` accepts (CMA-1A/1A.1/1A.3).
 * Deliberately reuses `SourceInteraction` rather than re-fetching/
 * re-mapping the raw upstream DTOs a second time — "do not introduce
 * parallel storage" extends naturally to "do not duplicate working
 * fetch/mapping logic either."
 *
 * `SourceInteraction.source` is ALREADY the real `customer_interactions
 * .source` value for both adapters ('call-data' for voice,
 * 'chat-sessions' for chat — confirmed by reading both adapters'
 * `mapEntry`/`mapRow` functions), so no separate source-identifier
 * constant is needed here the way CMA-1A's own reconciliation module
 * needed `CALL_DATA_SOURCE` for its own, previously-hardcoded-wrong,
 * literal.
 *
 * Deliberately OMITTED from this payload, always: `customerId`,
 * `contactPointId`, `campaignId`, `fcr`, `intentConfidence`. CMA sync
 * does no identity resolution at all (the entire point of this path
 * vs. Customer 360's own identity-gated `call_center_upsert_interaction`
 * — see cmaBackfill.ts/cmaSync.ts); `SourceInteraction` itself has no
 * `fcr`/`intentConfidence`/`campaignId` field today (neither adapter's
 * DTO mapping sets one — confirmed by reading both `mapEntry` and
 * `mapRow`), so these are never fabricated, only genuinely absent.
 * Because the payload never carries these keys, `call_center_sync_
 * interaction`'s own presence-checked merge (`p_payload ? 'key'`)
 * leaves any value Customer 360 or a future source already wrote for
 * them completely untouched — CMA sync can never regress a real
 * `fcr`/`intentConfidence`/`campaignId` value another ingestion path
 * set.
 *
 * Every OTHER field below is always included, as a real value or an
 * explicit `null` — never conditionally omitted — because each call to
 * `source.listPage()` returns a COMPLETE current snapshot of that
 * interaction from upstream, not a partial delta. A field that is
 * `null` in `SourceInteraction` means "upstream genuinely has no value
 * for this field right now," which must overwrite (not preserve) a
 * stale local value — this is the correct, intentional use of the
 * "explicit null" half of CMA-1A.3's documented omission-vs-null
 * contract, not an oversight. (Contrast: CMA-1A.3's own `started_at`
 * partial-update test deliberately OMITS fields to prove omission is
 * preserved — this module's job is the opposite case: a full, current
 * snapshot that should always win.)
 */
export interface CmaSyncPayload {
  source: string;
  interactionId: string;
  startedAt: string;
  channel: string;
  direction: string | null;
  agentId: string | null;
  agentDisplayName: string | null;
  durationSeconds: number | null;
  intent: string | null;
  outcome: string | null;
  sentimentScore: number | null;
  wasAuthenticated: boolean | null;
  escalationTrigger: string | null;
  campaignName: string | null;
  recordingAvailable: boolean;
}

export function buildCmaSyncPayload(row: SourceInteraction): CmaSyncPayload {
  return {
    source: row.source,
    interactionId: row.interactionId,
    startedAt: row.startedAt,
    channel: row.channel,
    direction: row.direction,
    agentId: row.agentId,
    agentDisplayName: row.agentDisplayName,
    durationSeconds: row.durationSeconds,
    intent: row.intent,
    outcome: row.outcome,
    sentimentScore: row.sentimentScore,
    wasAuthenticated: row.wasAuthenticated,
    escalationTrigger: row.escalationTrigger,
    campaignName: row.campaignName,
    recordingAvailable: row.recordingAvailable,
  };
}
