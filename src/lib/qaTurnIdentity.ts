/**
 * Session 16.1 — deterministic Call Centre turn identity, per
 * docs/MANUAL_QA_MEASUREMENT_CONTRACT.md §1.
 *
 * Voice transcript entries (TranscriptEntry, from the Voice Partner
 * API's Session Transcript endpoint) have no id of their own — only
 * {timestamp, speaker, text, sentiment?, confidence?}, fetched live,
 * never persisted by Call Centre. computeVoiceTurnId synthesizes a
 * stable id from (interactionId, timestamp, speaker) — microsecond-
 * precision in every real sample observed, so unique on its own in
 * practice — with a same-(timestamp,speaker)-group index as a pure
 * collision-breaker, never the primary identity and never raw array
 * position.
 *
 * Chat already has a stable, frontend-facing turn id: `ChatMessage.id`
 * (`src/types/chat.ts`), already synthesized deterministically by
 * api/chat/logs.ts as `${sessionId}-${number}` on the live path (the
 * Chat Transcript API's own 1-indexed `number`) or the real persisted
 * row id on the local-fallback path. Reused as-is by the UI — no
 * separate computation needed, unlike voice.
 */

export interface VoiceTurnLike {
  timestamp: string;
  speaker: string;
}

export function computeVoiceTurnId(interactionId: string, entries: VoiceTurnLike[]): string[] {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const key = `${entry.timestamp}:${entry.speaker}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return occurrence === 0
      ? `${interactionId}:${entry.timestamp}:${entry.speaker}`
      : `${interactionId}:${entry.timestamp}:${entry.speaker}:${occurrence}`;
  });
}
