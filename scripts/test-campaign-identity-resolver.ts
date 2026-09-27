/**
 * Session 11.5A workstream C — regression tests for the corrected
 * campaign CSV identity-resolution path
 * (docs/SESSION_11_5A_CUSTOMER_360_FOUNDATION.md).
 *
 * Exercises `resolveCustomerIdentity` (src/server/customer360/
 * identityResolver.ts) — the SAME resolver Voice/Chat ingestion already
 * uses — against a purely in-memory fake CustomerRepository. No
 * Supabase call, no network call, no live side effect of any kind; this
 * is the "no live calls/messages/campaign launches for testing"
 * boundary honored at the unit level, since this repo has no test
 * runner configured (no vitest/jest, confirmed via package.json).
 *
 * Run: npx tsx scripts/test-campaign-identity-resolver.ts
 */

import { resolveCustomerIdentity, EXTERNAL_IDENTITY_SOURCE } from '../src/server/customer360/identityResolver.js';
import type { CustomerRepository } from '../src/server/customer360/customerRepository.js';
import type { Customer, ContactPoint } from '../src/server/customer360/types.js';
import { normalizePhoneNumber } from '../src/lib/phoneIdentity.js';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makeFakeRepo() {
  const customers = new Map<string, Customer>();
  const contactPoints = new Map<string, ContactPoint>();
  const externalIdentities = new Map<string, string>(); // `${source}:${type}:${value}` -> customerId
  const mergeLog: Array<{ survivorId: string; loserId: string; reason: string }> = [];

  function newCustomer(now: string, totalInteractions = 0): Customer {
    const c: Customer = {
      id: nextId('cust'),
      displayName: null,
      sourceCustomerRef: null,
      primaryPhoneMasked: null,
      firstSeen: now,
      lastSeen: now,
      totalInteractions,
      inboundCount: 0,
      outboundCount: 0,
      latestIntent: null,
      latestOutcome: null,
      latestSentimentLabel: null,
      latestSentimentScore: null,
      escalationCount: 0,
      channels: [],
      latestAgentId: null,
      latestAgentDisplayName: null,
      authSummary: null,
      aggregationVersion: 1,
      aggregatedAt: now,
    };
    customers.set(c.id, c);
    return c;
  }

  const repo: Partial<CustomerRepository> = {
    async getCustomer(customerId) {
      return customers.get(customerId) ?? null;
    },
    async findContactPoint(_type, normalizedValue) {
      for (const cp of contactPoints.values()) {
        if (cp.normalizedValue === normalizedValue) return cp;
      }
      return null;
    },
    async createCustomerWithContactPoint({ type, rawValue, normalizedValue, now }) {
      const customer = newCustomer(now);
      const cp: ContactPoint = {
        id: nextId('cp'),
        customerId: customer.id,
        type,
        rawValue,
        normalizedValue,
        isPrimary: true,
        firstSeen: now,
        lastSeen: now,
      };
      contactPoints.set(cp.id, cp);
      return { customer, contactPoint: cp };
    },
    async addContactPointToCustomer(customerId, type, rawValue, normalizedValue, now) {
      const cp: ContactPoint = { id: nextId('cp'), customerId, type, rawValue, normalizedValue, isPrimary: false, firstSeen: now, lastSeen: now };
      contactPoints.set(cp.id, cp);
      return cp;
    },
    async createCustomer(now) {
      return newCustomer(now);
    },
    async findCustomerByExternalIdentity(source, identityType, identityValue) {
      const customerId = externalIdentities.get(`${source}:${identityType}:${identityValue}`);
      return customerId ? (customers.get(customerId) ?? null) : null;
    },
    async attachExternalIdentity(customerId, source, identityType, identityValue) {
      externalIdentities.set(`${source}:${identityType}:${identityValue}`, customerId);
    },
    async mergeCustomers(survivorId, loserId, _now, reason) {
      mergeLog.push({ survivorId, loserId, reason });
      // Reassign contact points and external identities to the survivor, delete the loser — mirrors the real RPC's contract.
      for (const cp of contactPoints.values()) {
        if (cp.customerId === loserId) cp.customerId = survivorId;
      }
      for (const [key, custId] of externalIdentities.entries()) {
        if (custId === loserId) externalIdentities.set(key, survivorId);
      }
      const survivor = customers.get(survivorId)!;
      customers.delete(loserId);
      return { survivor, interactionsMoved: 0, contactPointsMoved: 0, campaignTargetsMoved: 0, externalIdentitiesMoved: 0 };
    },
    async recomputeCustomerAggregate(customerId) {
      return customers.get(customerId)!;
    },
  };

  return { repo: repo as CustomerRepository, customers, contactPoints, externalIdentities, mergeLog, newCustomer };
}

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

async function testNewCustomer() {
  const { repo, customers } = makeFakeRepo();
  const now = new Date().toISOString();
  const result = await resolveCustomerIdentity(repo, { externalCustomerId: null, phoneNumber: '+91 90000 11111' }, now);
  assert(result !== null, 'genuinely new customer: resolver returns a result');
  assert(result!.created === true, 'genuinely new customer: created=true');
  assert(customers.size === 1, 'genuinely new customer: exactly one customer created');
}

async function testExistingPhoneNoCif() {
  const { repo, customers, contactPoints } = makeFakeRepo();
  const now = new Date().toISOString();
  const normalized = normalizePhoneNumber('+91 90000 22222');
  const first = await resolveCustomerIdentity(repo, { externalCustomerId: null, phoneNumber: '+91 90000 22222' }, now);
  assert(first !== null && first.created === true, 'existing phone (seed): first resolution creates the customer');

  const second = await resolveCustomerIdentity(repo, { externalCustomerId: null, phoneNumber: '+91 90000 22222' }, now);
  assert(second !== null, 'existing phone: second import row resolves');
  assert(second!.created === false, 'existing phone: second row is NOT reported as created (matched instead)');
  assert(second!.customerId === first!.customerId, 'existing phone: second row resolves to the SAME customer as the first');
  assert(customers.size === 1, 'existing phone: still exactly one customer (no duplicate)');
  const cpForNormalized = [...contactPoints.values()].filter((cp) => cp.normalizedValue === normalized);
  assert(cpForNormalized.length === 1, 'existing phone: still exactly one contact point for the normalized number');
}

async function testExistingCifChangedPhone() {
  const { repo, customers } = makeFakeRepo();
  const now = new Date().toISOString();

  // Seed: a customer already exists with a CIF and an original phone.
  const seeded = await resolveCustomerIdentity(repo, { externalCustomerId: 'CIF-9001', phoneNumber: '+91 90000 33333' }, now);
  assert(seeded !== null && seeded.created === true, 'existing CIF (seed): initial row creates the customer with CIF attached');
  const seededCustomerId = seeded!.customerId;

  // A later CSV row: SAME CIF, but a DIFFERENT phone number (e.g. the
  // customer changed their number). Must resolve to the SAME existing
  // CIF-backed customer — never create a duplicate.
  const later = await resolveCustomerIdentity(repo, { externalCustomerId: 'CIF-9001', phoneNumber: '+91 90000 44444' }, now);
  assert(later !== null, 'existing CIF with changed phone: resolves');
  assert(later!.customerId === seededCustomerId, 'existing CIF with changed phone: resolves to the EXISTING CIF customer, not a new one');
  assert(later!.created === false, 'existing CIF with changed phone: not reported as created');
  assert(customers.size === 1, 'existing CIF with changed phone: still exactly one customer (no duplicate)');
}

async function testIdentityConflictTriggersMerge() {
  const { repo, customers, mergeLog } = makeFakeRepo();
  const now = new Date().toISOString();

  // Two genuinely separate customers exist first: one known only by
  // phone, one known only by CIF (no phone yet).
  const phoneOnly = await resolveCustomerIdentity(repo, { externalCustomerId: null, phoneNumber: '+91 90000 55555' }, now);
  const cifOnly = await resolveCustomerIdentity(repo, { externalCustomerId: 'CIF-9002' }, now);
  assert(phoneOnly !== null && cifOnly !== null && phoneOnly!.customerId !== cifOnly!.customerId, 'conflict setup: two distinct customers exist');
  assert(customers.size === 2, 'conflict setup: exactly two customers before the conflicting row');

  // A CSV row now supplies BOTH signals together, proving they're the
  // same person — this is exactly what identityResolver.ts's own
  // documented merge rule fires on (proof, not inference).
  const merged = await resolveCustomerIdentity(repo, { externalCustomerId: 'CIF-9002', phoneNumber: '+91 90000 55555' }, now);
  assert(merged !== null && merged!.merged === true, 'identity conflict: resolver reports a merge occurred');
  assert(customers.size === 1, 'identity conflict: exactly one customer survives (loser deleted)');
  assert(mergeLog.length === 1, 'identity conflict: exactly one merge was recorded');
}

async function main() {
  await testNewCustomer();
  await testExistingPhoneNoCif();
  await testExistingCifChangedPhone();
  await testIdentityConflictTriggersMerge();

  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
