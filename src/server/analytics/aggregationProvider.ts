import type { CallDataEntryDto } from '../../types/api/calls.js';
import type { RatioDimension, RatioFilterState } from '../../types/ratio.js';

/**
 * Session R3 — the Aggregation Provider contract (spec §10/§11).
 *
 * Layering:
 *
 *   Ratio Explorer (React)
 *        ↓
 *   Generic Ratio API (api/analytics/metrics.ts, resource=ratios)
 *        ↓
 *   Ratio Service (ratioService.ts) — resolves the ratio definition,
 *        wraps a provider's raw result into the public DTOs
 *        (RatioSummaryDto etc.), decides availability/unavailableReason
 *        ↓
 *   Aggregation Provider  <-- THIS FILE defines the interface
 *        ↓
 *        ├── TODAY:  callPopulationProvider.ts
 *        │           (fetches the bounded call-data population
 *        │            server-side, computes via ratioMath.ts/
 *        │            ratioDimensions.ts — everything R2 already built,
 *        │            now behind this interface instead of inlined in
 *        │            ratioService.ts)
 *        │
 *        └── FUTURE: a backend-native provider (see
 *                     docs/SESSION_R3_RATIO_FACT_DERIVED_AND_AGGREGATION_CONTRACT.md
 *                     §Future backend-native contract) — implements the
 *                     SAME interface by asking the Call Centre backend
 *                     (or whatever database/service eventually exposes
 *                     one) to do COUNT/SUM/AVG/GROUP BY/time-bucketing
 *                     close to the data, returning only aggregates
 *                     rather than raw rows. Swapping providers requires
 *                     ZERO changes to ratioService.ts's callers, the
 *                     public Ratio API, or the Ratio Explorer UI.
 *
 * This file is intentionally small — a typed contract, not a second
 * registry or a second DTO family. `RatioAggregateResult` deliberately
 * mirrors the shape `ratioMath.ts`'s `RatioAggregate` already uses (spec
 * §11 "do not duplicate DTOs unnecessarily"), extended only with the
 * population-transparency fields every provider must be honest about.
 */

export interface RatioAggregateResult {
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  population: number | null;
  /** True when this result is based on fewer records than truly match the query — see trueTotalRecords. Every provider must set this honestly; a provider that can genuinely aggregate the complete population server-side (the future backend-native provider) sets this false whenever it isn't bounded by anything comparable to today's page cap. */
  capped: boolean;
  trueTotalRecords: number | null;
}

export interface RatioTrendPointResult {
  bucket: string;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  population: number | null;
}

export interface RatioTrendResult {
  points: RatioTrendPointResult[];
  capped: boolean;
  trueTotalRecords: number | null;
}

export interface RatioBreakdownRowResult {
  dimensionValue: string;
  label: string;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  population: number | null;
}

export interface RatioBreakdownResult {
  rows: RatioBreakdownRowResult[];
  capped: boolean;
  trueTotalRecords: number | null;
}

export interface RatioInteractionRefResult {
  interactionId: string;
  channel: 'voice' | 'chat';
  /**
   * Session 13.6 (DEC-RATIO-01) — call-data has no call_id-keyed lookup
   * param (confirmed repeatedly elsewhere in this codebase: search only
   * matches caller_number/caller_name). Drill-through needs this to find
   * the exact interaction via the same proven phone+call_sid lookup
   * every other screen already uses (src/lib/callLookup.ts) — never a
   * fallback to "the first row returned."
   */
  phoneNumber: string;
  timestamp: string;
  agentLabel: string | null;
  intent: string | null;
  outcome: string | null;
}

export interface RatioInteractionsResult {
  rows: RatioInteractionRefResult[];
  totalCount: number;
  capped: boolean;
  trueTotalRecords: number | null;
}

/**
 * Server-side-only extension of the public RatioFilterState — adds an
 * explicit date-window override so the Ratio Service can ask a provider
 * for an arbitrary period (the previous-period comparison window, which
 * has no `range` enum value of its own) through the SAME interface a
 * future backend-native provider would also need to support, rather
 * than bypassing the abstraction for comparison specifically. Never
 * serialized to the frontend — `RatioFilterState` itself (the public
 * contract) is completely unchanged.
 */
export interface ProviderFilters extends RatioFilterState {
  dateOverride?: { dateFrom: string; dateTo: string };
}

/**
 * The four operations the Ratio Service needs from ANY aggregation
 * source — spec §10.A–D exactly. `bucketGranularity` on getTrend and
 * `page`/`pageSize` on getInteractions are the only operation-specific
 * parameters beyond `ratioId`/`filters`, matching the prompt's contract
 * shape precisely.
 */
export interface AggregationProvider {
  getSummary(ratioId: string, filters: ProviderFilters): Promise<RatioAggregateResult>;
  getTrend(ratioId: string, filters: ProviderFilters, bucketGranularity: 'hour' | 'day'): Promise<RatioTrendResult>;
  getBreakdown(ratioId: string, filters: ProviderFilters, dimension: RatioDimension): Promise<RatioBreakdownResult>;
  getInteractions(
    ratioId: string,
    filters: ProviderFilters,
    page: number,
    pageSize: number,
  ): Promise<RatioInteractionsResult>;
}

/** Re-exported so a future provider implementation can type its own internals against the same call-data shape without a new import path. */
export type { CallDataEntryDto };
