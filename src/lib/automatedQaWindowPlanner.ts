import type { QaTurn } from './qaConversation.js';

/**
 * Session 16.3 — bounded context-window planner (brief §12). The
 * Generic Local LLM's context window is 8,192 tokens INCLUDING output —
 * a long interaction cannot be sent in one call. This module decides how
 * to split an ordered turn list into sequential, NON-overlapping windows
 * that together cover every turn exactly once (never silently truncated,
 * never double-counted — brief §12's explicit requirements), using only
 * a cheap length-based token estimate (no tokenizer dependency).
 *
 * Trade-off, documented rather than hidden: windows are sequential, not
 * overlapping. This guarantees every turn is evaluated by exactly one
 * window (so merging observations never double-counts), but a
 * repetition/loop spanning a window boundary may not be detected — the
 * orchestrator records this explicitly against repetition_loop_rate in
 * unassessable_parameters whenever windowCount > 1, rather than silently
 * under-reporting it as NO_ISSUE.
 */

export interface QaTurnWindow {
  index: number;
  turns: QaTurn[];
}

/** ~4 characters per token is the standard rough estimate for English text; good enough for a planning budget, not an exact tokenizer. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function turnTokenCost(turn: QaTurn): number {
  // `[turnId] SpeakerLabel: text` formatting overhead, matching automatedQaPrompt's formatTurn.
  return estimateTokens(`[${turn.turnId}] ${turn.speakerLabel}: ${turn.text}`) + 2;
}

/**
 * Splits `turns` into windows whose own estimated token cost never
 * exceeds `transcriptTokenBudget`. A single turn that alone exceeds the
 * budget still gets its own window (best effort — the live API call may
 * still reject it with context_length_exceeded, surfaced as a FAILED
 * evaluation rather than silently dropped).
 */
export function planQaTurnWindows(turns: QaTurn[], transcriptTokenBudget: number): QaTurnWindow[] {
  if (turns.length === 0) return [];
  const windows: QaTurnWindow[] = [];
  let current: QaTurn[] = [];
  let currentCost = 0;

  for (const turn of turns) {
    const cost = turnTokenCost(turn);
    if (current.length > 0 && currentCost + cost > transcriptTokenBudget) {
      windows.push({ index: windows.length, turns: current });
      current = [];
      currentCost = 0;
    }
    current.push(turn);
    currentCost += cost;
  }
  if (current.length > 0) {
    windows.push({ index: windows.length, turns: current });
  }
  return windows;
}
