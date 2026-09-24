import type { InteractionSourceAdapter } from './interactionSourceAdapter.js';
import type { SourceInteraction } from './types.js';
import type { CallDataEntryDto, CallDataResponseDto } from '../../types/api/calls.js';

/**
 * Current deployment's adapter for InteractionSourceAdapter, wrapping
 * the Voice Agent backend's GET /call-data (plan §0.3/§14). This is the
 * only file in the domain layer that knows VOICEBOT_BASE_URL/
 * VOICEBOT_API_KEY exist — a future interaction source (chat, a
 * different backend) would be a new file implementing the same
 * interface, with no change to aggregationService.ts.
 *
 * Deliberately does NOT import api/_voicebot.ts — that file's helpers
 * are coupled to VercelRequest/VercelResponse, which is a transport-layer
 * concern this domain-layer file must not depend on (plan §0.3). The
 * small amount of duplication (reading the two env vars, attaching
 * X-API-Key) is the cost of keeping this file importable from a plain
 * Node script too, not just from a Vercel function.
 */

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;

function getBackendConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server');
  }
  return { baseUrl, apiKey };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCallData(query: Record<string, string>): Promise<CallDataResponseDto> {
  const { baseUrl, apiKey } = getBackendConfig();
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl}/api/v1/call-data${search ? `?${search}` : ''}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
      const text = await res.text();
      const body = text ? JSON.parse(text) : undefined;
      if (!res.ok) {
        throw new Error(`call-data request failed: ${res.status} ${typeof body === 'object' ? JSON.stringify(body) : text}`);
      }
      return body as CallDataResponseDto;
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('call-data request failed after retries');
}

function mapEntry(dto: CallDataEntryDto): SourceInteraction {
  return {
    interactionId: dto.call_id,
    channel: dto.channel,
    phoneNumber: dto.caller_number,
    direction: dto.direction ?? null,
    agentId: dto.ai_agent_id || dto.agent_id || null,
    agentDisplayName: dto.ai_agent_name || null,
    startedAt: dto.start_time || dto.timestamp,
    durationSeconds: dto.duration_seconds ?? dto.aht_seconds ?? null,
    intent: dto.intent || null,
    outcome: dto.outcome || null,
    sentimentScore: dto.sentiment_score ?? null,
    wasAuthenticated: dto.was_authenticated,
    escalationTrigger: dto.escalation_trigger || null,
    campaignName: dto.campaign_name || null,
    recordingAvailable: Boolean(dto.voice_record_url),
    source: 'call-data',
  };
}

export const voiceAgentInteractionSource: InteractionSourceAdapter = {
  async searchByContactPoint(type, normalizedValue, since) {
    if (type !== 'phone') return [];
    // Bounded per-customer lookup (plan §4/§15) — pending live
    // confirmation that `search` matches on phone number (plan §0.2/
    // §24 item 1). Only 'inactive' (completed) calls are aggregated;
    // an active call's fields are still changing (plan §6's rationale).
    const query: Record<string, string> = {
      status: 'inactive',
      search: normalizedValue,
      page_size: '100',
    };
    if (since) query.date_from = since;

    const dto = await fetchCallData(query);
    return dto.data.calls.map(mapEntry);
  },

  async listPage(page, pageSize) {
    const dto = await fetchCallData({
      status: 'inactive',
      page: String(page),
      page_size: String(pageSize),
    });
    return {
      rows: dto.data.calls.map(mapEntry),
      totalPages: dto.data.pagination.total_pages,
    };
  },
};
