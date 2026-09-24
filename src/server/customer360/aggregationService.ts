import type { CustomerRepository } from './customerRepository.js';
import type { InteractionSourceAdapter } from './interactionSourceAdapter.js';
import type { Customer, NewInteractionInput, SourceInteraction } from './types.js';
import { normalizePhoneNumber } from '../../lib/phoneIdentity.js';

/**
 * Progressive aggregation service — plan §0.3, §4, §6. Depends only on
 * CustomerRepository and InteractionSourceAdapter, never on Supabase or
 * the Voice Agent backend directly.
 */

/** Below this, a contact point is treated as "recently refreshed" and the source lookup is skipped (plan §15). */
const REFRESH_SKIP_WINDOW_MS = 2 * 60 * 1000;
/** Overlap subtracted from a contact point's last_seen when used as a high-water-mark, to tolerate clock skew / late-arriving rows (plan §7's same rationale, applied per-contact-point here). */
const REFRESH_OVERLAP_MS = 60 * 60 * 1000;

function toNewInteractionInput(
  s: SourceInteraction,
  customerId: string,
  contactPointId: string | null,
): NewInteractionInput {
  return {
    customerId,
    contactPointId,
    interactionId: s.interactionId,
    channel: s.channel,
    direction: s.direction,
    agentId: s.agentId,
    agentDisplayName: s.agentDisplayName,
    startedAt: s.startedAt,
    durationSeconds: s.durationSeconds,
    intent: s.intent,
    outcome: s.outcome,
    sentimentScore: s.sentimentScore,
    wasAuthenticated: s.wasAuthenticated,
    escalationTrigger: s.escalationTrigger,
    campaignName: s.campaignName,
    recordingAvailable: s.recordingAvailable,
    source: s.source,
  };
}

async function ingestAll(
  repo: CustomerRepository,
  rows: SourceInteraction[],
  customerId: string,
  contactPointId: string | null,
): Promise<number> {
  let insertedCount = 0;
  for (const row of rows) {
    const result = await repo.upsertInteraction(toNewInteractionInput(row, customerId, contactPointId));
    if (result.inserted) insertedCount++;
  }
  return insertedCount;
}

export type RefreshResult =
  | { status: 'not_found' }
  | { status: 'refreshed'; customer: Customer; insertedCount: number };

/**
 * The core progressive-refresh / materialization flow — plan §4's
 * diagram and §4's "First-lookup / materialization rule". Handles both
 * "refresh a known customer" and "first sight of a phone number" with
 * one shared code path, per the plan's explicit instruction that there
 * is one materialization function, not two.
 */
export async function refreshCustomerByContactPoint(
  repo: CustomerRepository,
  source: InteractionSourceAdapter,
  rawPhone: string,
): Promise<RefreshResult> {
  const normalized = normalizePhoneNumber(rawPhone);
  if (!normalized) return { status: 'not_found' };

  const existing = await repo.findContactPoint('phone', normalized);

  if (existing) {
    return refreshExistingCustomer(repo, source, existing.customerId);
  }

  // Never-seen phone number: query source history directly (plan §4's
  // materialization rule, step 2). Full history (`since` omitted) since
  // there is no persisted state yet to bound the query with.
  const sourceRows = await source.searchByContactPoint('phone', normalized);
  if (sourceRows.length === 0) {
    return { status: 'not_found' };
  }

  const now = new Date().toISOString();
  const displayName = null; // Voice call-data's caller_name is per-interaction, not carried into materialization directly here — left for a future enrichment pass, not guessed.
  const { customer, contactPoint } = await repo.createCustomerWithContactPoint({
    type: 'phone',
    rawValue: rawPhone,
    normalizedValue: normalized,
    displayName,
    now,
  });

  const insertedCount = await ingestAll(repo, sourceRows, customer.id, contactPoint.id);
  const recomputed = await repo.recomputeCustomerAggregate(customer.id, new Date().toISOString());
  return { status: 'refreshed', customer: recomputed, insertedCount };
}

export async function refreshExistingCustomer(
  repo: CustomerRepository,
  source: InteractionSourceAdapter,
  customerId: string,
  opts: { force?: boolean } = {},
): Promise<RefreshResult> {
  const customer = await repo.getCustomer(customerId);
  if (!customer) return { status: 'not_found' };

  const contactPoints = await repo.listContactPoints(customerId);
  const now = new Date();
  let insertedCount = 0;

  for (const cp of contactPoints) {
    const lastSeenMs = new Date(cp.lastSeen).getTime();
    const staleEnough = opts.force || now.getTime() - lastSeenMs > REFRESH_SKIP_WINDOW_MS;
    if (!staleEnough) continue;
    if (cp.type !== 'phone') continue; // only 'phone' contact points exist today (plan §2)

    const since = new Date(lastSeenMs - REFRESH_OVERLAP_MS).toISOString();
    const sourceRows = await source.searchByContactPoint('phone', cp.normalizedValue, since);
    insertedCount += await ingestAll(repo, sourceRows, customerId, cp.id);
    await repo.touchContactPoint(cp.id, now.toISOString());
  }

  const recomputed =
    insertedCount > 0 ? await repo.recomputeCustomerAggregate(customerId, now.toISOString()) : customer;
  return { status: 'refreshed', customer: recomputed, insertedCount };
}
