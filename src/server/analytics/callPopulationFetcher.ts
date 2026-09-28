import type { CallDataEntryDto, CallDataResponseDto } from '../../types/api/calls.js';
import type { RatioFilterState } from '../../types/ratio.js';

/**
 * Session R2 — fetches the COMPLETE qualifying call population for a
 * ratio calculation, server-side, looping GET /api/v1/call-data across
 * every page (never a single page, never the browser). Mirrors the
 * exact bounded-pagination-loop convention already established by
 * src/server/customer360/reconcileJob.ts (a `maxPages` cap, not open-
 * ended — this repo has no larger warehouse/materialized layer to fall
 * back on, and a Vercel serverless function has a real execution-time
 * budget).
 *
 * Deliberately reads process.env directly rather than importing
 * api/_voicebot.ts — same transport-layer-independence rule as
 * ratioService.ts/campaignRunner.ts.
 *
 * status=inactive is the SAME convention CallLogs.tsx already uses for
 * "completed/historical calls" — reused here, not reinvented.
 */

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 15; // up to 3000 records per fetch — a documented, disclosed cap, not silent

export interface CallPopulationResult {
  calls: CallDataEntryDto[];
  /** The backend's own total_records for this exact filtered query, from the last page fetched. */
  trueTotalRecords: number;
  /** True when fetchedCount < trueTotalRecords because maxPages was hit before reaching the last page. */
  capped: boolean;
}

export interface CallPopulationFilters {
  dateFrom?: string;
  dateTo?: string;
  direction?: RatioFilterState['direction'];
  outcome?: string;
}

async function fetchCallDataPage(
  filters: CallPopulationFilters,
  page: number,
  pageSize: number,
): Promise<CallDataResponseDto> {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
  }
  const query: Record<string, string> = {
    status: 'inactive',
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters.dateFrom) query.date_from = filters.dateFrom;
  if (filters.dateTo) query.date_to = filters.dateTo;
  if (filters.direction) query.direction = filters.direction;
  if (filters.outcome) query.outcome = filters.outcome;

  const search = new URLSearchParams(query).toString();
  const res = await fetch(`${baseUrl}/api/v1/call-data?${search}`, { headers: { 'X-API-Key': apiKey } });
  if (!res.ok) {
    throw new Error(`call-data request failed: ${res.status}`);
  }
  return (await res.json()) as CallDataResponseDto;
}

/** Converts a RatioFilterState `range` (e.g. '7d') into date_from/date_to (YYYY-MM-DD), matching the call-data API's documented inclusive date-range contract. */
export function rangeToDateWindow(range: RatioFilterState['range'] | undefined): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const days: Record<NonNullable<RatioFilterState['range']>, number> = {
    '1h': 1, '6h': 1, '12h': 1, '24h': 1, '7d': 7, '30d': 30,
  };
  const windowDays = days[range ?? '24h'] ?? 1;
  const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(now) };
}

/** The equal-length window immediately preceding the given one — for a real previous-period comparison (spec §16/R2's "Comparison" section), never a fabricated delta. */
export function previousDateWindow(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(prevFrom), dateTo: iso(prevTo) };
}

export async function fetchCompleteCallPopulation(
  filters: CallPopulationFilters,
  maxPages: number = DEFAULT_MAX_PAGES,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<CallPopulationResult> {
  const calls: CallDataEntryDto[] = [];
  let trueTotalRecords = 0;
  let capped = false;

  for (let page = 1; page <= maxPages; page++) {
    const dto = await fetchCallDataPage(filters, page, pageSize);
    calls.push(...(dto.data.calls ?? []));
    trueTotalRecords = dto.data.pagination?.total_records ?? calls.length;
    const totalPages = dto.data.pagination?.total_pages ?? page;
    if (page >= totalPages) {
      capped = false;
      break;
    }
    if (page === maxPages) {
      capped = true;
    }
  }

  return { calls, trueTotalRecords, capped };
}
