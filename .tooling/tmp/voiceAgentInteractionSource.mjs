// src/server/customer360/voiceAgentInteractionSource.ts
var RETRY_ATTEMPTS = 3;
var RETRY_DELAY_MS = 800;
function getBackendConfig() {
  const baseUrl = process.env.VOICEBOT_BASE_URL;
  const apiKey = process.env.VOICEBOT_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the server");
  }
  return { baseUrl, apiKey };
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchCallData(query) {
  const { baseUrl, apiKey } = getBackendConfig();
  const search = new URLSearchParams(query).toString();
  const url = `${baseUrl}/api/v1/call-data${search ? `?${search}` : ""}`;
  let lastError;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
      const text = await res.text();
      const body = text ? JSON.parse(text) : void 0;
      if (!res.ok) {
        throw new Error(`call-data request failed: ${res.status} ${typeof body === "object" ? JSON.stringify(body) : text}`);
      }
      return body;
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("call-data request failed after retries");
}
function mapEntry(dto) {
  return {
    interactionId: dto.call_id,
    channel: dto.channel,
    phoneNumber: dto.caller_number,
    // Voice never supplies a customer_id/CIF on its read path today
    // (CallDataEntryDto has no such field — confirmed Session 4/5.2).
    // Never fabricated; stays null until the backend actually returns one.
    externalCustomerId: null,
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
    source: "call-data",
    fcr: typeof dto.fcr === "boolean" ? dto.fcr : null,
    // intent_accuracy is documented 0-100; rescaled to 0-1 to match
    // this schema's existing 0-1 "score" convention (sentimentScore).
    intentConfidence: typeof dto.intent_accuracy === "number" ? dto.intent_accuracy / 100 : null
  };
}
var voiceAgentInteractionSource = {
  async searchByContactPoint(type, normalizedValue, since) {
    if (type !== "phone") return [];
    const query = {
      status: "inactive",
      search: normalizedValue,
      page_size: "100"
    };
    if (since) query.date_from = since.slice(0, 10);
    const dto = await fetchCallData(query);
    return dto.data.calls.map(mapEntry);
  },
  async listPage(page, pageSize) {
    const dto = await fetchCallData({
      status: "inactive",
      page: String(page),
      page_size: String(pageSize)
    });
    return {
      rows: dto.data.calls.map(mapEntry),
      totalPages: dto.data.pagination.total_pages
    };
  }
};
export {
  mapEntry,
  voiceAgentInteractionSource
};
