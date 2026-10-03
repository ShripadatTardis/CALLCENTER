import { fetchCallData } from '@/services/calls/callsService';

const MAX_LOOKUP_PAGES = 3;
const LOOKUP_PAGE_SIZE = 100;

/**
 * Session 13.5 — shared version of the phone+call_sid lookup pattern
 * already proven independently in InitiateCall.tsx and CampaignDetail.tsx
 * (call-data has no call_id-keyed lookup, only `search`, so a single call
 * is found by searching its phone number and filtering the bounded,
 * paged results down to the exact interactionId). Extracted here only for
 * Live View's own new call site (§10/§12) — the existing inline copies in
 * InitiateCall.tsx/CampaignDetail.tsx are left untouched, zero regression
 * risk to either.
 */
export async function findCallBySidAndPhone(phone: string, callSid: string, role: string) {
  for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
    const result = await fetchCallData({ search: phone, page, page_size: LOOKUP_PAGE_SIZE }, role);
    const match = result.interactions.find((i) => i.interactionId === callSid);
    if (match) return match;
    if (page >= result.pagination.total_pages) break;
  }
  return null;
}
