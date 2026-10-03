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
 *   agentId, agentDisplayName, startTime, status, stage, outcome, fcr,
 *   intent, intentAccuracy, sentiment, sentimentScore, durationSeconds,
 *   transcript, summary, recording, tags, campaignName, escalation,
 *   wasAuthenticated, direction (confirmed present on every call-data
 *   row via live verification on 2026-09-23 — previously unconfirmed).
 *
 * STRUCTURALLY PRESENT BUT EXPECT `undefined` UNTIL A BACKEND
 * ENHANCEMENT LANDS (per docs/GLT_CALL_CENTRE_PHASE1_AI_NATIVE_SCOPE.md
 * §4.1's list of fields to request/confirm — an `undefined` value here
 * is a known upstream gap, not a mapper bug):
 *   customerId, endTime, campaignId.
 *
 * Session 13.2 (DEC-CALL-01) — Voice-only, genuinely confirmed-present
 * on CallDataEntryDto but previously dropped by callsMapper.ts before
 * reaching this type. `undefined` for a historical call predating these
 * fields (or for any Chat-sourced Interaction, which never sets them —
 * see §24 of the session) is a correct, expected absence, not a bug:
 *   actualOutcomeCode, actualOutcomeName, structuredOutputs,
 *   isBankCustomer, transcriptDocId, context.
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
  /** "connecting" | "in-progress" for active calls, "completed" for history — distinct from status, per Call Data docs. */
  stage?: string;
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
  wasAuthenticated?: boolean | null;

  // Not reliably provided by the current API — see file header.
  customerId?: string;
  direction?: 'inbound' | 'outbound';

  quality?: unknown;

  // Session 13.2 (DEC-CALL-01) — Voice-only structured agent result.
  // Deliberately mirrors Campaign's own actualOutcomeCode/actualOutcomeName/
  // structuredOutputs concepts (Sessions 12.5/12.6) rather than a second
  // interpretation — src/lib/campaignActualOutcome.ts's classifyActualOutcome/
  // classifyStructuredOutputs already accept a null contract for exactly
  // this generic (non-campaign) context. This is the raw backend fact,
  // distinct from Campaign Classification (an outcome-policy interpretation
  // of it) and distinct from the generic `outcome`/`status` fields above.
  /** The agent's own declared business outcome code, when the backend has classified one. Agent-specific — never assume cross-agent meaning. */
  actualOutcomeCode?: string;
  actualOutcomeName?: string;
  /** Agent-declared output_fields[] values, generic key/value — never hardcode an agent-specific key (e.g. EMI's "promised_payment_date") into code that reads this. */
  structuredOutputs?: Record<string, unknown>;

  // Session 13.2 — Voice-only, model-only (not rendered on the primary
  // Interaction Detail UI; no existing user workflow consumes them —
  // see the session doc's CALL-01 table for the exposure decision).
  /** Genuine backend fact about the caller, when present — never reinterpreted as a broader Customer360 identity claim. */
  isBankCustomer?: boolean;
  /** Opaque backend transcript-store reference. No document-retrieval capability exists in this application; preserved for future use only. */
  transcriptDocId?: string;
  /** Short backend-provided call-context label (a plain string on the current contract, not structured JSON). Not displayed — see session doc. */
  context?: string;
}
