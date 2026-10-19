// src/server/cma/cmaTranscriptEvidenceCache.ts
var CMA_TRANSCRIPT_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var CMA_TRANSCRIPT_CACHE_RETENTION_DAYS = 30;
function computeTranscriptContentHash(turns) {
  const normalized = JSON.stringify(turns.map((t) => [t.timestamp, t.speaker, t.text]));
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function isCacheFresh(fetchedAt, now, ttlMs = CMA_TRANSCRIPT_CACHE_TTL_MS) {
  return now.getTime() - new Date(fetchedAt).getTime() < ttlMs;
}
async function getOrFetchTranscriptEvidence(interactionId, interactionType, deps, now = /* @__PURE__ */ new Date(), ttlMs = CMA_TRANSCRIPT_CACHE_TTL_MS) {
  const cached = await deps.readCache(interactionId, interactionType);
  if (cached && isCacheFresh(cached.fetchedAt, now, ttlMs)) {
    return { turns: cached.turns, fetchStatus: cached.fetchStatus, fromCache: true, contentHash: cached.contentHash };
  }
  let turns = [];
  let fetchStatus;
  try {
    turns = await deps.fetchLive(interactionId, interactionType);
    fetchStatus = turns.length === 0 ? "incomplete" : "available";
  } catch {
    turns = [];
    fetchStatus = "unavailable";
  }
  const contentHash = computeTranscriptContentHash(turns);
  await deps.writeCache({ interactionId, interactionType, source: "voiceforce_api", contentHash, turns, turnCount: turns.length, fetchStatus });
  return { turns, fetchStatus, fromCache: false, contentHash };
}
function makeSupabaseCacheReader(supabase) {
  return async (interactionId, interactionType) => {
    const { data, error } = await supabase.rpc("call_center_cma_transcript_cache_get", {
      p_interaction_id: interactionId,
      p_interaction_type: interactionType
    });
    if (error) throw new Error(`call_center_cma_transcript_cache_get failed: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      interactionId: row.interaction_id,
      interactionType: row.interaction_type,
      source: row.source,
      contentHash: row.content_hash,
      turns: row.turns,
      turnCount: row.turn_count,
      fetchStatus: row.fetch_status,
      version: row.version,
      fetchedAt: row.fetched_at
    };
  };
}
function makeSupabaseCacheWriter(supabase) {
  return async (entry) => {
    const { error } = await supabase.rpc("call_center_cma_transcript_cache_upsert", {
      p_interaction_id: entry.interactionId,
      p_interaction_type: entry.interactionType,
      p_source: entry.source,
      p_content_hash: entry.contentHash,
      p_turns: entry.turns,
      p_turn_count: entry.turnCount,
      p_fetch_status: entry.fetchStatus
    });
    if (error) throw new Error(`call_center_cma_transcript_cache_upsert failed: ${error.message}`);
  };
}
function makeVoiceLiveFetcher(fetchRawVoiceTranscript) {
  return async (interactionId, interactionType) => {
    if (interactionType !== "call") {
      throw new Error(`CMA transcript evidence cache: chat live-fetch is not wired yet (requested for ${interactionId})`);
    }
    return fetchRawVoiceTranscript(interactionId);
  };
}
export {
  CMA_TRANSCRIPT_CACHE_RETENTION_DAYS,
  CMA_TRANSCRIPT_CACHE_TTL_MS,
  computeTranscriptContentHash,
  getOrFetchTranscriptEvidence,
  isCacheFresh,
  makeSupabaseCacheReader,
  makeSupabaseCacheWriter,
  makeVoiceLiveFetcher
};
