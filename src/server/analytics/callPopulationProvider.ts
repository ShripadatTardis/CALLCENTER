import { fetchCompleteCallPopulation, rangeToDateWindow } from './callPopulationFetcher.js';
import { RATIO_CALCULATORS, RATIO_ELIGIBLE_POPULATION } from './ratioMath.js';
import { computeBreakdownRows, computeTrendPoints } from './ratioDimensions.js';
import type {
  AggregationProvider,
  ProviderFilters,
  RatioAggregateResult,
  RatioBreakdownResult,
  RatioInteractionRefResult,
  RatioInteractionsResult,
  RatioTrendResult,
} from './aggregationProvider.js';
import type { CallDataEntryDto } from '../../types/api/calls.js';
import type { RatioDimension } from '../../types/ratio.js';

/**
 * Session R3 — TODAY's AggregationProvider implementation. This is the
 * exact R2 mechanism (fetch the bounded complete population server-side
 * via GET /api/v1/call-data, compute with ratioMath.ts/
 * ratioDimensions.ts), now behind the AggregationProvider interface
 * instead of inlined in ratioService.ts. Behavior is unchanged from R2
 * — this is a pure extraction, not a rewrite — including the
 * page_size=200/maxPages=15 cap and its honest capped/trueTotalRecords
 * disclosure, per R3's explicit "do not weaken the population-cap
 * disclosure" instruction.
 */

/**
 * Applies the breakdown/breakdownValue filter for a dimension not
 * natively supported by the call-data query API (intent/agent/campaign)
 * on an already-fetched population, server-side. direction/outcome ARE
 * native query params and are applied by callPopulationFetcher itself
 * before this ever runs.
 */
function applyDrillFilter(calls: CallDataEntryDto[], filters: ProviderFilters): CallDataEntryDto[] {
  if (!filters.breakdown || !filters.breakdownValue) return calls;
  if (filters.breakdown === 'direction' || filters.breakdown === 'outcome') return calls;
  const value = filters.breakdownValue;
  return calls.filter((c) => {
    switch (filters.breakdown) {
      case 'intent':
        return c.intent === value;
      case 'agent':
        return (c.ai_agent_name || c.ai_agent_id) === value;
      case 'campaign':
        return c.campaign_name === value;
      case 'escalation_reason':
        return c.escalation_trigger === value;
      default:
        return true;
    }
  });
}

/**
 * Session 13.6 (DEC-RATIO-01) — extracted as a standalone, pure function
 * (previously inlined in the `.map()` below) purely so it is directly
 * unit-testable (see .tooling/scripts/ratio-channel-verify.mjs) without
 * needing to fake the network layer `fetchCompleteCallPopulation` sits
 * behind. See the doc comment on its call site for why `channel: 'voice'`
 * is accurate, not a misclassification.
 */
export function mapCallToInteractionRef(call: CallDataEntryDto): RatioInteractionRefResult {
  return {
    interactionId: call.call_id,
    channel: 'voice' as const,
    phoneNumber: call.caller_number,
    timestamp: call.start_time,
    agentLabel: call.ai_agent_name || call.ai_agent_id || null,
    intent: call.intent || null,
    outcome: call.outcome || null,
  };
}

async function fetchPopulationForFilters(filters: ProviderFilters) {
  const { dateFrom, dateTo } = filters.dateOverride ?? rangeToDateWindow(filters.range);
  const result = await fetchCompleteCallPopulation({
    dateFrom,
    dateTo,
    direction: filters.direction,
    outcome: filters.breakdown === 'outcome' && filters.breakdownValue ? (filters.breakdownValue as never) : undefined,
  });
  return { ...result, calls: applyDrillFilter(result.calls, filters), dateFrom, dateTo };
}

export const callPopulationProvider: AggregationProvider = {
  async getSummary(ratioId, filters): Promise<RatioAggregateResult> {
    const calculate = RATIO_CALCULATORS[ratioId];
    if (!calculate) return { value: null, numerator: null, denominator: null, population: null, capped: false, trueTotalRecords: null };

    const population = await fetchPopulationForFilters(filters);
    const agg = calculate(population.calls);
    return {
      value: agg.value,
      numerator: agg.numerator,
      denominator: agg.denominator,
      population: population.calls.length,
      capped: population.capped,
      trueTotalRecords: population.trueTotalRecords,
    };
  },

  async getTrend(ratioId, filters, bucketGranularity): Promise<RatioTrendResult> {
    if (!RATIO_CALCULATORS[ratioId]) return { points: [], capped: false, trueTotalRecords: null };
    const population = await fetchPopulationForFilters(filters);
    const points = computeTrendPoints(ratioId, population.calls, bucketGranularity);
    return { points, capped: population.capped, trueTotalRecords: population.trueTotalRecords };
  },

  async getBreakdown(ratioId, filters, dimension): Promise<RatioBreakdownResult> {
    if (!RATIO_CALCULATORS[ratioId]) return { rows: [], capped: false, trueTotalRecords: null };
    const population = await fetchPopulationForFilters(filters);
    const rows = computeBreakdownRows(ratioId, population.calls, dimension as RatioDimension);
    return {
      rows: rows.map((r) => ({ dimensionValue: r.dimensionValue, label: r.label, value: r.value, numerator: r.numerator, denominator: r.denominator, population: r.population })),
      capped: population.capped,
      trueTotalRecords: population.trueTotalRecords,
    };
  },

  async getInteractions(ratioId, filters, page, pageSize): Promise<RatioInteractionsResult> {
    const eligibleFilter = RATIO_ELIGIBLE_POPULATION[ratioId];
    if (!eligibleFilter) return { rows: [], totalCount: 0, capped: false, trueTotalRecords: null };

    const population = await fetchPopulationForFilters(filters);
    const eligible = eligibleFilter(population.calls);
    const start = (page - 1) * pageSize;
    const rows: RatioInteractionRefResult[] = eligible.slice(start, start + pageSize).map(mapCallToInteractionRef);

    return { rows, totalCount: eligible.length, capped: population.capped, trueTotalRecords: population.trueTotalRecords };
  },
};
