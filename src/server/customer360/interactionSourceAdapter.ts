import type { SourceInteraction } from './types.js';

/**
 * The interaction-source adapter — a logical interface, per
 * docs/CALL_CENTRE_SESSION4_CUSTOMER360_PLAN.md §0.3. The aggregation
 * service only ever talks to this interface, never to the Voice Agent
 * backend (or any future chat/WhatsApp source) directly, so a different
 * deployment could plug in a different interaction source without
 * touching aggregationService.ts. voiceAgentInteractionSource.ts is
 * this deployment's current adapter wrapping GET /call-data.
 */
export interface InteractionSourceAdapter {
  /**
   * Bounded, targeted lookup for one contact point — the backbone of
   * progressive refresh (plan §4/§15). `since` is an ISO timestamp used
   * as a high-water-mark; omit for "all known history for this phone."
   */
  searchByContactPoint(
    type: 'phone',
    normalizedValue: string,
    since?: string,
  ): Promise<SourceInteraction[]>;

  /**
   * One bounded page of ALL historical interactions, for the optional
   * backfill job (plan §5/§6) — never called from the progressive path.
   */
  listPage(page: number, pageSize: number): Promise<{
    rows: SourceInteraction[];
    totalPages: number;
  }>;
}
