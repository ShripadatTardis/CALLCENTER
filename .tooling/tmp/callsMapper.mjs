// src/services/calls/callsMapper.ts
function mapDetailedTranscriptEntry(entry) {
  return {
    timestamp: entry.timestamp,
    speaker: entry.speaker,
    text: entry.text,
    sentiment: entry.sentiment,
    confidence: entry.confidence
  };
}
function mapSessionInteractionEntry(entry) {
  return {
    timestamp: entry.timestamp,
    speaker: "customer",
    text: entry.user_message
  };
}
function mapCallDataEntryToInteraction(dto) {
  return {
    interactionId: dto.call_id,
    channel: dto.channel,
    phoneNumber: dto.caller_number,
    callerName: dto.caller_name || void 0,
    fromPhoneNumber: dto.from_phone_number || void 0,
    // ai_agent_id is preferred over agent_id for display purposes since
    // it's paired with ai_agent_name in the same response; agent_id is
    // kept as a fallback when ai_agent_id is absent.
    agentId: dto.ai_agent_id || dto.agent_id || void 0,
    agentDisplayName: dto.ai_agent_name || void 0,
    startTime: dto.start_time || dto.timestamp,
    // endTime is deliberately NOT synthesized from start_time +
    // duration_seconds — that's a derived-data decision requiring
    // confirmed timezone/semantics, left for a later, deliberate pass.
    endTime: void 0,
    durationSeconds: dto.duration_seconds ?? dto.aht_seconds,
    status: dto.status,
    stage: dto.stage || void 0,
    outcome: dto.outcome || void 0,
    fcr: dto.fcr,
    intent: dto.intent || void 0,
    intentAccuracy: dto.intent_accuracy,
    sentiment: dto.sentiment || void 0,
    sentimentScore: dto.sentiment_score,
    analysis: dto.analysis ? {
      sentimentTrend: dto.analysis.sentiment_trend,
      keyTopics: dto.analysis.key_topics,
      resolutionStatus: dto.analysis.resolution_status,
      confidenceScore: dto.analysis.confidence_score
    } : void 0,
    transcript: dto.detailed_transcript?.map(mapDetailedTranscriptEntry),
    summary: dto.transcript_summary || void 0,
    recording: dto.voice_record_url ? { url: dto.voice_record_url } : void 0,
    tags: dto.tags,
    // No stable campaign ID is documented upstream — name only.
    campaignId: void 0,
    campaignName: dto.campaign_name || void 0,
    escalation: dto.escalation_trigger ? { trigger: dto.escalation_trigger } : void 0,
    wasAuthenticated: dto.was_authenticated,
    // customerId: not reliably provided by the current API — see interaction.ts header.
    customerId: void 0,
    // direction: confirmed present on every call-data row (2026-09-23 live verification).
    direction: dto.direction,
    quality: void 0,
    // Session 13.2 (DEC-CALL-01) — previously dropped entirely; now
    // preserved. `|| undefined`/`?? undefined` on each so an empty
    // string or null from the backend never becomes a misleading
    // present-but-empty value on the normalized model.
    actualOutcomeCode: dto.actual_outcome_code || void 0,
    actualOutcomeName: dto.actual_outcome_name || void 0,
    structuredOutputs: dto.structured_outputs ?? void 0,
    // ?? (not ||) — is_bank_customer is a genuine boolean fact; `false`
    // must never be coerced away, only a true null/undefined should be.
    isBankCustomer: dto.is_bank_customer ?? void 0,
    transcriptDocId: dto.transcript_doc_id || void 0,
    context: dto.context || void 0
  };
}
function mapCallDataSummary(dto) {
  return dto;
}
function mapTriggerCallResponse(dto) {
  return {
    interactionId: dto.call_sid,
    status: dto.status,
    success: dto.success
  };
}
function mapSessionTranscriptToInteraction(dto) {
  const transcript = [];
  for (const entry of dto.interactions) {
    transcript.push(mapSessionInteractionEntry(entry));
    if (entry.bot_response) {
      transcript.push({
        timestamp: entry.timestamp,
        speaker: "ai",
        text: entry.bot_response
      });
    }
  }
  return {
    interactionId: dto.session_id,
    channel: dto.type,
    status: dto.status,
    transcript
  };
}
export {
  mapCallDataEntryToInteraction,
  mapCallDataSummary,
  mapSessionTranscriptToInteraction,
  mapTriggerCallResponse
};
