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

// Session R4.1 — the real backend rejects page_size > 100 (422
// validation error), confirmed live. R2/R3 never observed this because
// the backend was unreachable for every session between R2 and R4.
// page_size corrected 200 -> 100; maxPages raised 15 -> 30 to preserve
// the EXACT SAME disclosed 3000-record population cap (100 x 30 =
// 3000, unchanged from R2/R3's documented and UI-disclosed limit) —
// not a silent capacity change, only a request-parameter fix.
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 30; // up to 3000 records per fetch — a documented, disclosed cap, not silent

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

/**
 * Session R4.3 — classifies exactly why a call-data fetch failed, so
 * ratioService.ts can tell "Call Centre is reachable but rejected our
 * request" (a 4xx contract/validation problem — the exact class of bug
 * R4.1 found and fixed) apart from "Call Centre is genuinely
 * unreachable" (network failure / 5xx). Previously both collapsed into
 * one generic Error, and ratioService.ts's catch blocks turned BOTH
 * into the same "Live call data temporarily unavailable" message —
 * which is exactly how the R4.1 page_size defect went unnoticed for 3
 * sessions (it looked identical to a real outage). `status` is the raw
 * HTTP status code only — never response body/headers/secrets.
 */
export class CallDataFetchError extends Error {
  readonly kind: 'rejected' | 'unavailable';
  readonly status: number | null;
  constructor(kind: 'rejected' | 'unavailable', message: string, status: number | null = null) {
    super(message);
    this.name = 'CallDataFetchError';
    this.kind = kind;
    this.status = status;
  }
}

async function fetchCallDataPage(
  filters: CallPopulationFilters,
  page: number,
  pageSize: number,
): Promise<CallDataResponseDto> {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new CallDataFetchError('unavailable', 'VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
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
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/call-data?${search}`, { headers: { 'X-API-Key': apiKey } });
  } catch {
    // Network-level failure (DNS, connection refused, timeout) — the
    // exact R2-R4 outage shape: Call Centre was never actually reached.
    throw new CallDataFetchError('unavailable', 'Call Centre could not be reached.');
  }
  if (!res.ok) {
    // 4xx = Call Centre is up and answered, but rejected the request
    // (auth, validation, contract mismatch — e.g. the R4.1 page_size
    // defect). 5xx = Call Centre is up but failing server-side; treated
    // the same as unreachable for the caller's purposes, since neither
    // is something the client request itself can be blamed for.
    const kind = res.status >= 400 && res.status < 500 ? 'rejected' : 'unavailable';
    throw new CallDataFetchError(kind, `call-data request failed: ${res.status}`, res.status);
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
