import type {
  CallDataEntryDto,
  CallDataSummaryDto,
  DetailedTranscriptEntryDto,
  SessionInteractionEntryDto,
  SessionTranscriptResponseDto,
  TriggerCallResponseDto,
} from '@/types/api/calls';
import type { Interaction, TranscriptEntry } from '@/types/interaction';

/**
 * DTO -> UI model boundary. A DTO field name (call_id, session_id,
 * aht_seconds, etc.) may only appear here and in src/types/api/calls.ts.
 * No hook or component should read a raw DTO field directly.
 */

function mapDetailedTranscriptEntry(entry: DetailedTranscriptEntryDto): TranscriptEntry {
  return {
    timestamp: entry.timestamp,
    speaker: entry.speaker,
    text: entry.text,
    sentiment: entry.sentiment,
    confidence: entry.confidence,
  };
}

function mapSessionInteractionEntry(entry: SessionInteractionEntryDto): TranscriptEntry {
  // Session Transcript's shape has no explicit "speaker" field — it's
  // already split into user_message/bot_response pairs. Represented here
  // as two transcript entries so the UI model has one consistent shape
  // regardless of which source endpoint produced it.
  return {
    timestamp: entry.timestamp,
    speaker: 'customer',
    text: entry.user_message,
  };
}

/**
 * Call Data's rich per-call entry -> normalized Interaction.
 *
 * interactionId is sourced from call_id here. Trigger Call's response
 * uses call_sid and Session Transcript's uses session_id for the same
 * *role* (an identifier for one interaction) — each mapping function
 * normalizes its own DTO's identifier field independently; they are not
 * assumed to always be the same literal value across endpoints.
 */
export function mapCallDataEntryToInteraction(dto: CallDataEntryDto): Interaction {
  return {
    interactionId: dto.call_id,
    channel: dto.channel,

    phoneNumber: dto.caller_number,
    callerName: dto.caller_name || undefined,
    fromPhoneNumber: dto.from_phone_number || undefined,

    // ai_agent_id is preferred over agent_id for display purposes since
    // it's paired with ai_agent_name in the same response; agent_id is
    // kept as a fallback when ai_agent_id is absent.
    agentId: dto.ai_agent_id || dto.agent_id || undefined,
    agentDisplayName: dto.ai_agent_name || undefined,

    startTime: dto.start_time || dto.timestamp,
    // endTime is deliberately NOT synthesized from start_time +
    // duration_seconds — that's a derived-data decision requiring
    // confirmed timezone/semantics, left for a later, deliberate pass.
    endTime: undefined,
    durationSeconds: dto.duration_seconds ?? dto.aht_seconds,

    status: dto.status,
    outcome: dto.outcome || undefined,
    fcr: dto.fcr,
    intent: dto.intent || undefined,
    intentAccuracy: dto.intent_accuracy,
    sentiment: dto.sentiment || undefined,
    sentimentScore: dto.sentiment_score,
    analysis: dto.analysis
      ? {
          sentimentTrend: dto.analysis.sentiment_trend,
          keyTopics: dto.analysis.key_topics,
          resolutionStatus: dto.analysis.resolution_status,
          confidenceScore: dto.analysis.confidence_score,
        }
      : undefined,

    transcript: dto.detailed_transcript?.map(mapDetailedTranscriptEntry),
    summary: dto.transcript_summary || undefined,
    recording: dto.voice_record_url ? { url: dto.voice_record_url } : undefined,
    tags: dto.tags,

    // No stable campaign ID is documented upstream — name only.
    campaignId: undefined,
    campaignName: dto.campaign_name || undefined,

    escalation: dto.escalation_trigger ? { trigger: dto.escalation_trigger } : undefined,

    // Not reliably provided by the current API — see interaction.ts header.
    customerId: undefined,
    direction: undefined,

    quality: undefined,
  };
}

export function mapCallDataSummary(dto: CallDataSummaryDto): CallDataSummaryDto {
  // Summary is already a flat, documented aggregate shape with no
  // ambiguous field names to normalize — passed through as-is, still
  // routed through the mapper module to keep the "DTOs stay in
  // types/api + mappers only" rule uniform.
  return dto;
}

export function mapTriggerCallResponse(dto: TriggerCallResponseDto): {
  interactionId: string;
  status: string;
  success: boolean;
} {
  return {
    interactionId: dto.call_sid,
    status: dto.status,
    success: dto.success,
  };
}

export function mapSessionTranscriptToInteraction(
  dto: SessionTranscriptResponseDto,
): Pick<Interaction, 'interactionId' | 'channel' | 'status' | 'transcript'> {
  const transcript: TranscriptEntry[] = [];
  for (const entry of dto.interactions) {
    transcript.push(mapSessionInteractionEntry(entry));
    if (entry.bot_response) {
      transcript.push({
        timestamp: entry.timestamp,
        speaker: 'ai',
        text: entry.bot_response,
      });
    }
  }

  return {
    interactionId: dto.session_id,
    channel: dto.type,
    status: dto.status,
    transcript,
  };
}
