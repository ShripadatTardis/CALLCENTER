/**
 * Deterministic, privacy-conscious Customer 360 display label. Never
 * infers identity from transcript text, intent, sentiment, campaign
 * data, or fuzzy matching — only from already-persisted, reliable
 * fields. Precedence: display_name -> authoritative CIF
 * (source_customer_ref) -> masked primary phone -> "Customer".
 *
 * Reliable per-interaction caller_name is NOT currently wired into
 * Customer 360's aggregation pipeline (chatInteractionSource.ts drops
 * chat_sessions.caller_name when mapping to SourceInteraction, and
 * Voice call-data's caller_name was never carried into materialization
 * either — see aggregationService.ts's own comment on this), so that
 * precedence tier is intentionally not implemented here rather than
 * guessed at from an unreliable source.
 */

export function maskPhoneLast4(rawOrNormalized: string): string | null {
  const digits = rawOrNormalized.replace(/[^0-9]/g, '');
  if (digits.length < 4) return null;
  return `••••${digits.slice(-4)}`;
}

export interface CustomerDisplayLabelInput {
  displayName?: string | null;
  sourceCustomerRef?: string | null;
  /** Pre-masked value, e.g. from the Customers-list RPC. Takes precedence over rawPrimaryPhone if both are given. */
  primaryPhoneMasked?: string | null;
  /** A raw/normalized phone to mask now (e.g. Customer Detail's already-fetched phoneNumbers) — never rendered unmasked. */
  rawPrimaryPhone?: string | null;
}

export function getCustomerDisplayLabel(input: CustomerDisplayLabelInput): string {
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;

  const cif = input.sourceCustomerRef?.trim();
  if (cif) return cif;

  const masked = input.primaryPhoneMasked ?? (input.rawPrimaryPhone ? maskPhoneLast4(input.rawPrimaryPhone) : null);
  if (masked) return `Customer ${masked}`;

  return 'Customer';
}
