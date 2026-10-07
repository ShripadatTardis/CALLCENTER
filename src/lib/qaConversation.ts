import { computeVoiceTurnId } from './qaTurnIdentity';
import type { TranscriptEntry } from '@/types/interaction';

/**
 * Session 16.1 — normalizes each channel's own transcript shape into the
 * one ordered turn list the QA review workspace renders and reviews.
 * `role` is already collapsed to the two-value vocabulary
 * src/lib/qaApplicability.ts and the turn_reviews schema use — voice's
 * 'ai'/'agent' speaker values and chat's 'ai' role both become 'agent'
 * (there is no reviewer-meaningful distinction between them for QA
 * purposes; both are the automated/human agent side of the
 * conversation, never the customer).
 */
export interface QaTurn {
  turnId: string;
  role: 'agent' | 'customer';
  speakerLabel: string;
  timestamp: string;
  text: string;
}

export function voiceTurnsFromTranscript(interactionId: string, entries: TranscriptEntry[]): QaTurn[] {
  const ids = computeVoiceTurnId(interactionId, entries);
  return entries.map((entry, i) => ({
    turnId: ids[i],
    role: entry.speaker === 'customer' ? 'customer' : 'agent',
    speakerLabel: entry.speaker === 'customer' ? 'Customer' : entry.speaker === 'ai' ? 'AI' : 'Agent',
    timestamp: entry.timestamp,
    text: entry.text,
  }));
}

export function chatTurnsFromMessages(messages: Array<{ id: string; role: 'user' | 'ai'; text: string; timestamp: string }>): QaTurn[] {
  return messages.map((m) => ({
    turnId: m.id,
    role: m.role === 'user' ? 'customer' : 'agent',
    speakerLabel: m.role === 'user' ? 'Customer' : 'AI',
    timestamp: m.timestamp,
    text: m.text,
  }));
}

export const qaReviewableTurns = (turns: QaTurn[]): QaTurn[] => turns.filter((t) => t.role === 'agent');
