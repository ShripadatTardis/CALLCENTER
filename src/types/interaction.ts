/**
 * Normalized, UI-facing interaction model. Every screen that consumes
 * call/interaction data should render from this shape, never from a raw
 * DTO (see src/types/api/calls.ts and src/services/calls/callsMapper.ts
 * for the boundary rule).
 *
 * Field confidence — read before assuming a value should be present:
 *
 * CONFIRMED-SAFE (backed by a documented/live-verified API field on at
 * least one of Trigger Call / Session Transcript / Call Data):
 *   interactionId, channel, phoneNumber, callerName, fromPhoneNumber,
 *   agentId, agentDisplayName, startTime, status, outcome, fcr, intent,
 *   intentAccuracy, sentiment, sentimentScore, durationSeconds,
 *   transcript, summary, recording, tags, campaignName, escalation,
 *   direction (confirmed present on every call-data row via live
 *   verification on 2026-09-23 — previously listed as unconfirmed).
 *
 * STRUCTURALLY PRESENT BUT EXPECT `undefined` UNTIL A BACKEND
 * ENHANCEMENT LANDS (per docs/GLT_CALL_CENTRE_PHASE1_AI_NATIVE_SCOPE.md
 * §4.1's list of fields to request/confirm — an `undefined` value here
 * is a known upstream gap, not a mapper bug):
 *   customerId, endTime, campaignId.
 */
export interface TranscriptEntry {
  timestamp: string;
  speaker: string;
  text: string;
  sentiment?: string;
  confidence?: number;
}

export interface InteractionEscalation {
  trigger?: string;
}

export interface InteractionRecording {
  url?: string;
}

export interface InteractionAnalysis {
  sentimentTrend?: string;
  keyTopics?: string[];
  resolutionStatus?: string;
  confidenceScore?: number;
}

export interface Interaction {
  interactionId: string;
  channel: string;

  // Caller / phone identity
  phoneNumber: string;
  callerName?: string;
  /** Cosmetic only on Trigger Call — does not reflect the real Twilio caller ID. */
  fromPhoneNumber?: string;

  // AI agent
  agentId?: string;
  agentDisplayName?: string;

  // Timing
  startTime: string;
  /** NOT provided by call-data today — only duration_seconds is documented. */
  endTime?: string;
  durationSeconds?: number;

  // Outcome / quality signals
  status: string;
  outcome?: string;
  fcr?: boolean;
  intent?: string;
  intentAccuracy?: number;
  sentiment?: string;
  sentimentScore?: number;
  analysis?: InteractionAnalysis;

  // Content
  transcript?: TranscriptEntry[];
  summary?: string;
  recording?: InteractionRecording;
  tags?: string[];

  // Campaign
  /** No stable campaign ID is documented upstream — name only. */
  campaignId?: string;
  campaignName?: string;

  escalation?: InteractionEscalation;

  // Not reliably provided by the current API — see file header.
  customerId?: string;
  direction?: 'inbound' | 'outbound';

  quality?: unknown;
}
