import type { CustomerRepository } from './customerRepository.js';
import type { Customer } from './types.js';
import { normalizePhoneNumber } from '../../lib/phoneIdentity.js';

/**
 * Session 5.2 — Customer Identity Unification. The ONE shared resolver
 * used by every ingestion path (reconciliation today; backfill and
 * progressive refresh can adopt it too without change, since it's a
 * pure function of a repository + a signal). Deliberately the only
 * place identity precedence is decided — no separate Chat-specific
 * identity path, per the Session 5.2 prompt's explicit instruction.
 *
 * Precedence, deterministic, exactly per the plan:
 *   1. authoritative external customer_id/CIF
 *   2. normalized contact point (phone)
 *   3. create new customer
 *
 * Never uses name similarity, fuzzy matching, transcript content,
 * agent/category, campaign attributes, or inferred household/person
 * relationships — only an exact external-identity match or an exact
 * normalized-phone match.
 */

/**
 * The backend system issuing the CIF is the same for both channels
 * (the enhanced Chat API docs: "the same customer identity used to
 * group Chat with Voice") — so both sources record identities under
 * this one `source` value, never a per-channel source string. Voice
 * never actually supplies a customer_id today (GET /call-data has no
 * such field — confirmed Session 4), so this only ever gets populated
 * from Chat in practice right now; the shared constant is what lets a
 * later Voice enhancement unify with existing Chat-derived identities
 * with zero resolver changes.
 */
export const EXTERNAL_IDENTITY_SOURCE = 'voice_agent_backend';
const EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID = 'customer_id';

export interface IdentitySignal {
  /** Authoritative backend CIF, if the source interaction carries one. Never fabricated. */
  externalCustomerId: string | null;
  /** Raw phone number, if the source interaction carries one. */
  phoneNumber: string | null;
  /**
   * A locally-recorded Customer 360 selection (Session 7.1 follow-up) —
   * consulted only when no authoritative CIF resolves the interaction.
   * An exact phone match still takes precedence over this when the two
   * disagree, since a proven identity signal must never be overridden
   * by a possibly-stale locally-remembered pointer.
   */
  preferredCustomerId?: string | null;
}

export interface ResolvedIdentity {
  customerId: string;
  contactPointId: string | null;
  /** True when this resolution triggered a customer merge (Session 5.2 behavior 3) — useful for reporting/verification, not required by callers. */
  merged: boolean;
}

/**
 * Deterministic survivor tie-break for a proven-duplicate merge: prefer
 * the customer with more interaction history (the "more established"
 * record); on an exact tie, prefer whichever was first seen earlier.
 * Documented here since it's the one place this decision is made.
 */
function pickSurvivor(a: Customer, b: Customer): { survivor: Customer; loser: Customer } {
  if (a.totalInteractions !== b.totalInteractions) {
    return a.totalInteractions > b.totalInteractions ? { survivor: a, loser: b } : { survivor: b, loser: a };
  }
  return new Date(a.firstSeen).getTime() <= new Date(b.firstSeen).getTime()
    ? { survivor: a, loser: b }
    : { survivor: b, loser: a };
}

export async function resolveCustomerIdentity(
  repo: CustomerRepository,
  signal: IdentitySignal,
  now: string,
): Promise<ResolvedIdentity | null> {
  const normalized = signal.phoneNumber ? normalizePhoneNumber(signal.phoneNumber) : null;
  if (!signal.externalCustomerId && !normalized && !signal.preferredCustomerId) return null; // no identity signal at all — cannot materialize (unchanged from pre-5.2 behavior)

  const byIdentity = signal.externalCustomerId
    ? await repo.findCustomerByExternalIdentity(EXTERNAL_IDENTITY_SOURCE, EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID, signal.externalCustomerId)
    : null;
  const byPhoneContactPoint = normalized ? await repo.findContactPoint('phone', normalized) : null;

  // Case: CIF and phone both resolve, but to two different existing
  // customers — authoritatively proven to be the same person. Merge.
  if (byIdentity && byPhoneContactPoint && byIdentity.id !== byPhoneContactPoint.customerId) {
    const phoneCustomer = await repo.getCustomer(byPhoneContactPoint.customerId);
    if (!phoneCustomer) {
      // Shouldn't happen (contact point without its customer), but fail safe: fall through to identity-only resolution rather than merging against a ghost.
      return { customerId: byIdentity.id, contactPointId: byPhoneContactPoint.id, merged: false };
    }
    const { survivor, loser } = pickSurvivor(byIdentity, phoneCustomer);
    await repo.mergeCustomers(
      survivor.id,
      loser.id,
      now,
      `external-identity-merge:${EXTERNAL_IDENTITY_SOURCE}:${EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID}:${signal.externalCustomerId}`,
    );
    await repo.recomputeCustomerAggregate(survivor.id, now);
    return { customerId: survivor.id, contactPointId: byPhoneContactPoint.id, merged: true };
  }

  // Case: CIF known, either phone not linked to anyone or no phone signal at all.
  if (byIdentity) {
    let contactPointId: string | null = byPhoneContactPoint?.id ?? null;
    if (normalized && !byPhoneContactPoint) {
      const cp = await repo.addContactPointToCustomer(byIdentity.id, 'phone', signal.phoneNumber as string, normalized, now);
      contactPointId = cp.id;
    }
    return { customerId: byIdentity.id, contactPointId, merged: false };
  }

  // Case: no CIF match (or none supplied), but a locally-recorded
  // Customer 360 selection exists (Session 7.1 follow-up) — trust it
  // only when the phone signal, if any, doesn't already point to a
  // DIFFERENT customer (an exact phone match wins over a stale
  // preference; see identityResolver.ts's own precedence comment).
  if (signal.preferredCustomerId && (!byPhoneContactPoint || byPhoneContactPoint.customerId === signal.preferredCustomerId)) {
    const preferred = await repo.getCustomer(signal.preferredCustomerId);
    if (preferred) {
      let contactPointId = byPhoneContactPoint?.id ?? null;
      if (normalized && !byPhoneContactPoint) {
        const cp = await repo.addContactPointToCustomer(preferred.id, 'phone', signal.phoneNumber as string, normalized, now);
        contactPointId = cp.id;
      }
      if (signal.externalCustomerId) {
        await repo.attachExternalIdentity(preferred.id, EXTERNAL_IDENTITY_SOURCE, EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID, signal.externalCustomerId, now);
      }
      return { customerId: preferred.id, contactPointId, merged: false };
    }
  }

  // Case: phone known, no external-identity match yet.
  if (byPhoneContactPoint) {
    if (signal.externalCustomerId) {
      await repo.attachExternalIdentity(
        byPhoneContactPoint.customerId,
        EXTERNAL_IDENTITY_SOURCE,
        EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID,
        signal.externalCustomerId,
        now,
      );
    }
    return { customerId: byPhoneContactPoint.customerId, contactPointId: byPhoneContactPoint.id, merged: false };
  }

  // Case: neither resolves — brand new customer.
  if (normalized) {
    const created = await repo.createCustomerWithContactPoint({
      type: 'phone',
      rawValue: signal.phoneNumber as string,
      normalizedValue: normalized,
      displayName: null,
      now,
    });
    if (signal.externalCustomerId) {
      await repo.attachExternalIdentity(created.customer.id, EXTERNAL_IDENTITY_SOURCE, EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID, signal.externalCustomerId, now);
    }
    return { customerId: created.customer.id, contactPointId: created.contactPoint.id, merged: false };
  }

  // CIF-only, no phone at all (e.g. a chat session keyed by contact_id, not phone_number).
  if (signal.externalCustomerId) {
    const created = await repo.createCustomer(now);
    await repo.attachExternalIdentity(created.id, EXTERNAL_IDENTITY_SOURCE, EXTERNAL_IDENTITY_TYPE_CUSTOMER_ID, signal.externalCustomerId, now);
    return { customerId: created.id, contactPointId: null, merged: false };
  }

  // Pathological edge case only: a preferredCustomerId was supplied but
  // its customer no longer exists, and there's no CIF or phone signal
  // either — nothing left to resolve against.
  return null;
}
