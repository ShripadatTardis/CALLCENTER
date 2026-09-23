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
}

export async function fetchCallData(query: CallDataQueryDto = {}): Promise<CallDataResult> {
  const dto = await request<CallDataResponseDto>('/calls/data', {
    method: 'GET',
    query: query as Record<string, string | number | boolean | undefined>,
  });

  return {
    summary: mapCallDataSummary(dto.data.summary),
    interactions: dto.data.calls.map(mapCallDataEntryToInteraction),
    pagination: dto.data.pagination,
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
