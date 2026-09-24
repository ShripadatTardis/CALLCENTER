/**
 * Shared operational formatting — Session 3.5. Every screen that
 * renders a duration/timestamp/percentage/status should use these
 * instead of a local, screen-specific formatter, so the same
 * interaction looks identical across Dashboard / Initiate Call /
 * Call Logs / Live View.
 */

const FALLBACK = '—';

/** Threshold above which an active call's duration is treated as stale
 * demo/test data rather than a real, currently-running call — some demo
 * active rows have a start_time months in the past, producing durations
 * in the tens of thousands of minutes. 4 hours is far beyond any
 * plausible real call length, so anything past it is presentational
 * noise, not a real "long call" a supervisor needs to see prominently. */
export const STALE_DURATION_SECONDS = 4 * 60 * 60; // 4 hours

export function isStaleDuration(seconds?: number): boolean {
  return seconds !== undefined && seconds >= STALE_DURATION_SECONDS;
}

/**
 * mm:ss for short/plausible durations. For durations past the stale
 * threshold, returns a compact "Xh+" form instead of a multi-thousand
 * minute count that would dominate the row — the raw seconds value is
 * never discarded, callers should still expose it (e.g. via a title
 * attribute) for inspection.
 */
export function formatDuration(seconds?: number): string {
  if (seconds === undefined || Number.isNaN(seconds)) return FALLBACK;
  if (isStaleDuration(seconds)) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h+`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** "Xm Ys" long-form variant, used where a colon-form clock reads oddly (e.g. summary tiles). */
export function formatDurationLong(seconds?: number): string {
  if (seconds === undefined || Number.isNaN(seconds)) return FALLBACK;
  if (isStaleDuration(seconds)) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h+ (stale)`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

/** Full precision, for tooltips/title attributes — never hides the real value. */
export function formatDurationExact(seconds?: number): string {
  if (seconds === undefined || Number.isNaN(seconds)) return FALLBACK;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s (${seconds}s raw)`;
}

export function formatTimestamp(iso?: string): string {
  if (!iso) return FALLBACK;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPhoneNumber(phone?: string): string {
  if (!phone) return FALLBACK;
  return phone;
}

/** For values already on a 0–100 scale (fcr_rate, escalation_rate, intent_accuracy). */
export function formatPercent(value?: number, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) return FALLBACK;
  return `${value.toFixed(digits)}%`;
}

/** For values on a 0–1 scale (sentiment_score, transcript entry confidence). */
export function formatFractionAsPercent(value?: number, digits = 0): string {
  if (value === undefined || Number.isNaN(value)) return FALLBACK;
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatStatusLabel(status?: string): string {
  if (!status) return FALLBACK;
  return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
