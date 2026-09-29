import type { InteractionEvent, InteractionEventQueryFilter, NewInteractionEvent } from '../../types/interactionEvent.js';

/**
 * Session R5 — logical interface for interaction-event telemetry
 * persistence, matching the exact domain-layer/deployment-adapter split
 * already established for Customer 360/Campaigns/Chat (see
 * src/server/campaigns/campaignRepository.ts's own header comment for
 * the precedent this mirrors). The current deployment adapter is
 * supabaseInteractionEventRepository.ts; a future deployment swaps only
 * that one file.
 */
export interface AppendEventResult {
  /** True when this exact eventId was already present and this call was a no-op (idempotent replay) — see "Idempotency" in the session report. False when a new row was actually inserted. */
  duplicate: boolean;
  event: InteractionEvent;
}

export interface InteractionEventRepository {
  /** Append one event. Idempotent on eventId — a repeat delivery of the same eventId never creates a second row or double-counts toward any future aggregation. */
  appendEvent(event: NewInteractionEvent, now: string): Promise<AppendEventResult>;

  /** Append a batch in one call where the underlying storage can do so efficiently — semantically identical to calling appendEvent once per item, never a different acceptance rule for batched vs. single submission. */
  appendEvents(events: NewInteractionEvent[], now: string): Promise<AppendEventResult[]>;

  /** All events for one interaction, ordered by eventTime (occurrence time), never insertion order — see "Event ordering." */
  getEventsForInteraction(interactionId: string): Promise<InteractionEvent[]>;

  /** Events matching a filter, for future Ratio aggregation use (R6). Unbounded here by design — the AggregationProvider layer that eventually calls this owns pagination/population-cap concerns, exactly like callPopulationFetcher.ts does for call-data today; this repository itself makes no capping decision. */
  queryEvents(filter: InteractionEventQueryFilter): Promise<InteractionEvent[]>;
}
