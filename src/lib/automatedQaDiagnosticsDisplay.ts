import type { AutomatedQaAttemptDiagnostic, AutomatedQaAttemptOutcome } from '@/services/qa/automatedQaService';

/**
 * Session 16.4.4.1 — pure display/comparison helpers for
 * EvaluationDiagnosticsPanel.tsx, extracted so they're deterministically
 * testable the same way every other lib module in this codebase is
 * (esbuild-bundled, no live component render needed). No network/DOM
 * access, no logging — these never touch `rawResponse` content itself,
 * only structure/length, consistent with "do not expose raw responses
 * in application logs" (brief §3) extending to never passing raw text
 * through a logging-adjacent code path at all.
 */

export const OUTCOME_BADGE_VARIANT: Record<AutomatedQaAttemptOutcome, 'positive' | 'destructive' | 'warning'> = {
  success: 'positive',
  transport_failure: 'destructive',
  parse_failure: 'destructive',
  llm_error: 'destructive',
  contradictory_applicability: 'warning',
  uninformative_unassessability: 'warning',
};

export function outcomeLabel(outcome: AutomatedQaAttemptOutcome): string {
  return outcome.replace(/_/g, ' ');
}

/** The application-layer raw-response bound (automatedQaAttemptDiagnostics.ts's
 * RAW_RESPONSE_MAX_CHARS, Session 16.4.4) that applies BEFORE the
 * database's own 100,000-char check constraint — a response at or past
 * this length is the honest signal available to the UI that it may have
 * been truncated, without claiming a precision this layer doesn't have. */
export const RAW_RESPONSE_TRUNCATION_THRESHOLD = 60000;

export function isLikelyTruncated(text: string): boolean {
  return text.length >= RAW_RESPONSE_TRUNCATION_THRESHOLD;
}

export interface ContradictionDetail {
  detectedAt?: string;
  parameterCodes?: string[];
  observationOccurrences?: Record<string, number>;
  unassessableOccurrences?: Record<string, number>;
}

/** Reads only the `validation_detail.contradiction` shape Session 16.4.4
 * already stores — never recomputes or infers a contradiction that
 * wasn't actually detected and persisted at evaluation time. */
export function extractContradiction(validationDetail: Record<string, unknown> | null): ContradictionDetail | null {
  if (!validationDetail) return null;
  const c = (validationDetail as { contradiction?: ContradictionDetail }).contradiction;
  return c ?? null;
}

export function attemptsWithContradiction(attempts: AutomatedQaAttemptDiagnostic[]): AutomatedQaAttemptDiagnostic[] {
  return attempts.filter((a) => extractContradiction(a.validationDetail) !== null);
}

/** A "retry" is any attempt beyond the first within its own window —
 * matches the DB's own (evaluationId, windowIndex, attemptNumber)
 * uniqueness and 1-based-per-window numbering exactly, no separate
 * counting logic invented. */
export function countRetries(attempts: AutomatedQaAttemptDiagnostic[]): number {
  return attempts.filter((a) => a.attemptNumber > 1).length;
}

/** Attempts ordering as displayed — the list RPC already orders by
 * (window_index, attempt_number); this is a pure, explicit re-assertion
 * of that same order (never a different order), kept here so it's one
 * deterministically testable place rather than an implicit assumption
 * baked silently into the table render. */
export function sortAttemptsForDisplay(attempts: AutomatedQaAttemptDiagnostic[]): AutomatedQaAttemptDiagnostic[] {
  return [...attempts].sort((a, b) => a.windowIndex - b.windowIndex || a.attemptNumber - b.attemptNumber);
}
