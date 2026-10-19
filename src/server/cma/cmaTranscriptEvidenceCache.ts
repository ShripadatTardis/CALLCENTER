// Session 7 Part C — a minimal, versioned transcript-evidence access
// mechanism for CMA.
//
// Transcripts are fetched live from the Voice API and never persisted
// anywhere in this codebase today (confirmed in Session 6 and
// re-confirmed this session). Repeated CMA evidence evaluations of the
// same interaction (e.g. a fast-path check followed by a later
// re-evaluation, or several facts on the same call needing the same
// transcript) would otherwise refetch an unchanged transcript every
// time. This module is a thin, deliberately small cache in front of
// that fetch — NOT a second general-purpose conversation store: it
// holds exactly the turns needed for evidence citation, keyed by
// (interactionId, interactionType), with an explicit content hash,
// version, and retention expiry (brief: "do not retain transcripts
// indefinitely without an explicit retention rule").
//
// Orchestration is written against injected `readCache`/`writeCache`/
// `fetchLive` functions (same pattern cmaEscalationEvidence.ts already
// uses for its injected `verify`), so the decision logic (fresh? stale?
// fetch? cache hit?) is fully unit-testable with in-memory mocks —
// never a real Supabase client or real network call in a deterministic
// test. Production wiring (real RPC calls + fetchRawVoiceTranscript)
// lives in the thin `*Live`/`*ViaSupabase` wrappers at the bottom, which
// are not exercised by the deterministic test suite.

export type CmaTranscriptFetchStatus = 'available' | 'unavailable' | 'incomplete';

export interface CmaTranscriptEvidenceTurn {
  timestamp: string;
  speaker: string;
  text: string;
}

export interface CmaTranscriptCacheRow {
  interactionId: string;
  interactionType: 'call' | 'chat';
  source: 'voiceforce_api';
  contentHash: string;
  turns: CmaTranscriptEvidenceTurn[];
  turnCount: number;
  fetchStatus: CmaTranscriptFetchStatus;
  version: number;
  fetchedAt: string;
}

export type CmaTranscriptCacheReader = (
  interactionId: string,
  interactionType: 'call' | 'chat',
) => Promise<CmaTranscriptCacheRow | null>;

export type CmaTranscriptCacheWriter = (entry: {
  interactionId: string;
  interactionType: 'call' | 'chat';
  source: 'voiceforce_api';
  contentHash: string;
  turns: CmaTranscriptEvidenceTurn[];
  turnCount: number;
  fetchStatus: CmaTranscriptFetchStatus;
}) => Promise<void>;

export type CmaTranscriptLiveFetcher = (
  interactionId: string,
  interactionType: 'call' | 'chat',
) => Promise<CmaTranscriptEvidenceTurn[]>;

export interface CmaTranscriptEvidenceDeps {
  readCache: CmaTranscriptCacheReader;
  writeCache: CmaTranscriptCacheWriter;
  fetchLive: CmaTranscriptLiveFetcher;
}

export interface CmaTranscriptEvidenceResult {
  turns: CmaTranscriptEvidenceTurn[];
  fetchStatus: CmaTranscriptFetchStatus;
  fromCache: boolean;
  contentHash: string;
}

/** 24 hours — long enough to avoid refetching within one evaluation batch, short enough that a genuinely re-fetched (e.g. corrected) upstream transcript is picked up within a day, not cached forever. */
export const CMA_TRANSCRIPT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** 30 days — the explicit retention rule the brief requires; enforced server-side by the migration's default + a manual purge RPC, never a new cron (brief: "do not retain transcripts indefinitely"). */
export const CMA_TRANSCRIPT_CACHE_RETENTION_DAYS = 30;

/** Pure — deterministic FNV-1a-style hash, same style as cmaEvidenceTypes.ts's computeEvidenceEvaluationId, over the normalized turn list. Content-addressed: identical turns always hash identically, any real change (new/edited/reordered turn) changes the hash. */
export function computeTranscriptContentHash(turns: CmaTranscriptEvidenceTurn[]): string {
  const normalized = JSON.stringify(turns.map((t) => [t.timestamp, t.speaker, t.text]));
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Pure — whether a cached row is still fresh enough to skip a live refetch. */
export function isCacheFresh(fetchedAt: string, now: Date, ttlMs: number = CMA_TRANSCRIPT_CACHE_TTL_MS): boolean {
  return now.getTime() - new Date(fetchedAt).getTime() < ttlMs;
}

/**
 * Orchestrates "use the cache if fresh, otherwise fetch live and refresh
 * the cache." A cached `unavailable` result also counts as a cache hit —
 * a transcript genuinely unavailable upstream (e.g. a 404) should not be
 * re-fetched on every call within the TTL window either; that would
 * defeat the brief's "avoid repeated fetching" requirement just as much
 * as re-fetching an available one would.
 */
export async function getOrFetchTranscriptEvidence(
  interactionId: string,
  interactionType: 'call' | 'chat',
  deps: CmaTranscriptEvidenceDeps,
  now: Date = new Date(),
  ttlMs: number = CMA_TRANSCRIPT_CACHE_TTL_MS,
): Promise<CmaTranscriptEvidenceResult> {
  const cached = await deps.readCache(interactionId, interactionType);
  if (cached && isCacheFresh(cached.fetchedAt, now, ttlMs)) {
    return { turns: cached.turns, fetchStatus: cached.fetchStatus, fromCache: true, contentHash: cached.contentHash };
  }

  let turns: CmaTranscriptEvidenceTurn[] = [];
  let fetchStatus: CmaTranscriptFetchStatus;
  try {
    turns = await deps.fetchLive(interactionId, interactionType);
    fetchStatus = turns.length === 0 ? 'incomplete' : 'available';
  } catch {
    // Live fetch failed (404/network/upstream error) — recorded honestly
    // as unavailable, never silently treated as "no turns" = resolved.
    turns = [];
    fetchStatus = 'unavailable';
  }

  const contentHash = computeTranscriptContentHash(turns);
  await deps.writeCache({ interactionId, interactionType, source: 'voiceforce_api', contentHash, turns, turnCount: turns.length, fetchStatus });
  return { turns, fetchStatus, fromCache: false, contentHash };
}

// =====================================================================
// Production wiring (not exercised by the deterministic test suite —
// requires a real SupabaseClient and the real Voice API).
// =====================================================================

export interface CmaTranscriptSupabaseLike {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export function makeSupabaseCacheReader(supabase: CmaTranscriptSupabaseLike): CmaTranscriptCacheReader {
  return async (interactionId, interactionType) => {
    const { data, error } = await supabase.rpc('call_center_cma_transcript_cache_get', {
      p_interaction_id: interactionId,
      p_interaction_type: interactionType,
    });
    if (error) throw new Error(`call_center_cma_transcript_cache_get failed: ${error.message}`);
    const rows = (data as Array<Record<string, unknown>>) ?? [];
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      interactionId: row.interaction_id as string,
      interactionType: row.interaction_type as 'call' | 'chat',
      source: row.source as 'voiceforce_api',
      contentHash: row.content_hash as string,
      turns: row.turns as CmaTranscriptEvidenceTurn[],
      turnCount: row.turn_count as number,
      fetchStatus: row.fetch_status as CmaTranscriptFetchStatus,
      version: row.version as number,
      fetchedAt: row.fetched_at as string,
    };
  };
}

export function makeSupabaseCacheWriter(supabase: CmaTranscriptSupabaseLike): CmaTranscriptCacheWriter {
  return async (entry) => {
    const { error } = await supabase.rpc('call_center_cma_transcript_cache_upsert', {
      p_interaction_id: entry.interactionId,
      p_interaction_type: entry.interactionType,
      p_source: entry.source,
      p_content_hash: entry.contentHash,
      p_turns: entry.turns,
      p_turn_count: entry.turnCount,
      p_fetch_status: entry.fetchStatus,
    });
    if (error) throw new Error(`call_center_cma_transcript_cache_upsert failed: ${error.message}`);
  };
}

/**
 * Live fetcher for the 'call' channel, reusing `fetchRawVoiceTranscript`
 * (src/server/qa/transcriptFetcher.ts) — the exact same endpoint and
 * mapping Automated/Human QA already use, never a second fetch path.
 * Chat is not wired here yet (Session 7's reference case is voice-only
 * escalation_reason; chat has no equivalent evidence need in this
 * session) — calling with 'chat' throws rather than silently returning
 * an empty/misleading result.
 */
export function makeVoiceLiveFetcher(fetchRawVoiceTranscript: (interactionId: string) => Promise<CmaTranscriptEvidenceTurn[]>): CmaTranscriptLiveFetcher {
  return async (interactionId, interactionType) => {
    if (interactionType !== 'call') {
      throw new Error(`CMA transcript evidence cache: chat live-fetch is not wired yet (requested for ${interactionId})`);
    }
    return fetchRawVoiceTranscript(interactionId);
  };
}
