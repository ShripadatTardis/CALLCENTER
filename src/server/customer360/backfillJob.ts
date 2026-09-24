import type { CustomerRepository } from './customerRepository.js';
import type { InteractionSourceAdapter } from './interactionSourceAdapter.js';
import { normalizePhoneNumber } from '../../lib/phoneIdentity.js';

/**
 * Optional historical backfill — plan §5. A scheduler-independent
 * function (plan §0.3): "a function that can be invoked," not a Vercel
 * Cron entry. Bounded, resumable, idempotent, server-side only.
 * Pre-populates the Customers menu; NOT required for the progressive
 * model (aggregationService.ts) to work correctly.
 */

export interface BackfillBatchResult {
  nextCursor: number | null;
  pagesProcessed: number;
  interactionsInserted: number;
  customersTouched: number;
}

export async function runBackfillBatch(
  repo: CustomerRepository,
  source: InteractionSourceAdapter,
  cursor: number,
  batchSize: number,
): Promise<BackfillBatchResult> {
  let pagesProcessed = 0;
  let interactionsInserted = 0;
  const touchedCustomerIds = new Set<string>();
  let nextCursor: number | null = cursor;
  let totalPages: number | null = null;

  for (let i = 0; i < batchSize; i++) {
    const page = cursor + i;
    if (totalPages !== null && page > totalPages) {
      nextCursor = null;
      break;
    }

    const { rows, totalPages: tp } = await source.listPage(page, 100);
    totalPages = tp;
    pagesProcessed++;

    for (const row of rows) {
      const normalized = normalizePhoneNumber(row.phoneNumber);
      if (!normalized) continue;

      let contactPoint = await repo.findContactPoint('phone', normalized);
      let customerId: string;
      if (contactPoint) {
        customerId = contactPoint.customerId;
      } else {
        const now = new Date().toISOString();
        const created = await repo.createCustomerWithContactPoint({
          type: 'phone',
          rawValue: row.phoneNumber,
          normalizedValue: normalized,
          displayName: null,
          now,
        });
        contactPoint = created.contactPoint;
        customerId = created.customer.id;
      }

      const result = await repo.upsertInteraction({
        customerId,
        contactPointId: contactPoint.id,
        interactionId: row.interactionId,
        channel: row.channel,
        direction: row.direction,
        agentId: row.agentId,
        agentDisplayName: row.agentDisplayName,
        startedAt: row.startedAt,
        durationSeconds: row.durationSeconds,
        intent: row.intent,
        outcome: row.outcome,
        sentimentScore: row.sentimentScore,
        wasAuthenticated: row.wasAuthenticated,
        escalationTrigger: row.escalationTrigger,
        campaignName: row.campaignName,
        recordingAvailable: row.recordingAvailable,
        source: row.source,
      });
      if (result.inserted) {
        interactionsInserted++;
        touchedCustomerIds.add(customerId);
      }
    }

    nextCursor = page + 1 > (totalPages ?? page + 1) ? null : page + 1;
    if (nextCursor === null) break;
  }

  const now = new Date().toISOString();
  for (const customerId of touchedCustomerIds) {
    await repo.recomputeCustomerAggregate(customerId, now);
  }

  return {
    nextCursor,
    pagesProcessed,
    interactionsInserted,
    customersTouched: touchedCustomerIds.size,
  };
}
