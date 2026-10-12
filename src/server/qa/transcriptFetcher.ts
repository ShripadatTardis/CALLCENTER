import { getBackendConfig } from '../../../api/_voicebot.js';
import { mapSessionTranscriptToInteraction } from '../../services/calls/callsMapper.js';
import { voiceTurnsFromTranscript, chatTurnsFromMessages, type QaTurn } from '../../lib/qaConversation.js';
import type { SessionTranscriptResponseDto } from '../../types/api/calls.js';
import type { ChatSessionDetailResponseDto } from '../../types/api/chat.js';

/**
 * Session 16.3 — server-side transcript fetch for Automated QA, reusing
 * the EXACT same upstream endpoints and the EXACT same pure turn-mapping
 * functions (voiceTurnsFromTranscript / chatTurnsFromMessages,
 * src/lib/qaConversation.ts) that Human QA's QaReviewDialog already
 * uses client-side — guarantees identical turn ids between an automated
 * evaluation and a human review of the same interaction, with no second
 * mapping implementation to drift out of sync.
 */
export async function fetchQaTurnsForInteraction(
  interactionId: string,
  channel: 'voice' | 'chat',
): Promise<QaTurn[]> {
  const { baseUrl, apiKey } = getBackendConfig();

  if (channel === 'voice') {
    const res = await fetch(`${baseUrl}/api/v1/sessions/${encodeURIComponent(interactionId)}`, {
      headers: { 'X-API-Key': apiKey },
    });
    if (!res.ok) {
      throw new Error(`Voice session transcript fetch failed: HTTP ${res.status}`);
    }
    const dto = (await res.json()) as SessionTranscriptResponseDto;
    const { transcript } = mapSessionTranscriptToInteraction(dto);
    return voiceTurnsFromTranscript(interactionId, transcript ?? []);
  }

  const res = await fetch(`${baseUrl}/api/v1/chat/sessions/${encodeURIComponent(interactionId)}`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`Chat session transcript fetch failed: HTTP ${res.status}`);
  }
  const dto = (await res.json()) as ChatSessionDetailResponseDto;
  const messages = (dto.data.messages ?? []).map((m) => ({
    id: `${interactionId}-${m.number}`,
    role: (m.role === 'customer' ? 'user' : 'ai') as 'user' | 'ai',
    text: m.message,
    timestamp: m.timestamp,
  }));
  return chatTurnsFromMessages(messages);
}
