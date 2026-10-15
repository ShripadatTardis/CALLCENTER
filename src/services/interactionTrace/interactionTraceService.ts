import { request } from '@/services/transport/httpClient';
import type { InteractionTraceChannel, InteractionTraceResponseDto } from '@/types/api/interactionTrace';

/**
 * Interaction Trace domain service (Session 16.4.3) — the only place
 * that talks to the ?resource=trace branches of the existing
 * /api/calls/data and /api/chat/logs proxy routes. Same
 * one-service-per-domain convention as callsService.ts/qaService.ts.
 *
 * Deliberately reuses the EXISTING api/calls/data.ts and api/chat/logs.ts
 * routes (see their own header comments) rather than adding a new
 * top-level /api/*.ts file — this project is at the Vercel Hobby-plan
 * 12-serverless-function ceiling (confirmed Session 15.4/16.4.3).
 */
export async function fetchInteractionTrace(
  interactionId: string,
  channel: InteractionTraceChannel,
): Promise<InteractionTraceResponseDto> {
  const path = channel === 'call' ? '/calls/data' : '/chat/logs';
  return request<InteractionTraceResponseDto>(path, {
    method: 'GET',
    query: { resource: 'trace', id: interactionId },
  });
}
