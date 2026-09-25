import { request } from '@/services/transport/httpClient';
import type {
  CallDataQueryDto,
  CallDataResponseDto,
  SessionTranscriptResponseDto,
  TriggerCallRequestDto,
  TriggerCallResponseDto,
} from '@/types/api/calls';
import type { Interaction } from '@/types/interaction';
import {
  mapCallDataEntryToInteraction,
  mapCallDataSummary,
  mapSessionTranscriptToInteraction,
  mapTriggerCallResponse,
} from './callsMapper';

/**
 * Calls domain service — the only place that talks to the /api/calls/*
 * proxy routes. Hooks/components consume this, never httpClient or the
 * raw DTOs directly.
 */

export interface CallDataResult {
  summary: CallDataResponseDto['data']['summary'];
  interactions: Interaction[];
  pagination: CallDataResponseDto['data']['pagination'];
  /** True when the server filtered rows/summary to the caller's authorized categories (Session 6.2). */
  scoped: boolean;
}

/**
 * `role` drives Session 6.2's server-side category authorization in
 * api/calls/data.ts (x-user-role header — see api/_customer360.ts for
 * the documented advisory-signal caveat). Optional and defaults to
 * 'unauthenticated' (fail-closed server-side) so existing call sites
 * that don't yet pass a role keep working, but every UI call site
 * should pass the current session's role — see useCallData.
 */
export async function fetchCallData(query: CallDataQueryDto = {}, role = 'unauthenticated'): Promise<CallDataResult> {
  const dto = await request<CallDataResponseDto & { data: { summary: CallDataResponseDto['data']['summary'] & { scoped?: boolean } } }>(
    '/calls/data',
    {
      method: 'GET',
      query: query as Record<string, string | number | boolean | undefined>,
      headers: { 'x-user-role': role },
    },
  );

  return {
    summary: mapCallDataSummary(dto.data.summary),
    interactions: dto.data.calls.map(mapCallDataEntryToInteraction),
    pagination: dto.data.pagination,
    scoped: Boolean(dto.data.summary.scoped),
  };
}

export async function fetchSessionTranscript(
  sessionId: string,
): Promise<ReturnType<typeof mapSessionTranscriptToInteraction>> {
  const dto = await request<SessionTranscriptResponseDto>(`/calls/session/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
  });
  return mapSessionTranscriptToInteraction(dto);
}

export async function triggerCall(
  payload: TriggerCallRequestDto,
): Promise<ReturnType<typeof mapTriggerCallResponse>> {
  const dto = await request<TriggerCallResponseDto>('/calls/trigger', {
    method: 'POST',
    body: payload,
  });
  return mapTriggerCallResponse(dto);
}
