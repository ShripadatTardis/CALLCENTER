import type { CustomerRepository } from './customerRepository.js';
import type { InteractionSourceAdapter } from './interactionSourceAdapter.js';
import { resolveCustomerIdentity } from './identityResolver.js';

/**
 * Optional periodic reconciliation — plan §5. A scheduler-independent
 * function (plan §0.3), infrequent by design. Two responsibilities:
 * (1) catch interactions a customer's own progressive refresh missed
 * (nobody opened them recently), via the high-water-mark; (2) refresh
 * the category_id DISPLAY CACHE on customer_interactions to match the
 * current agent→category mapping (never authoritative for access
 * control — see authorizationService.ts's live-resolution comment).
 */

const OVERLAP_MS = 60 * 60 * 1000;

/**
 * Amended 2026-09-25 (Customer 360 closure pass): the original MAX_PAGES=20
 * bound, combined with a single setHighWaterMark call at the very end of the
 * function, meant a Vercel-killed invocation (function duration limit) made
 * ZERO durable progress — every retry re-scanned from the same stale
 * high-water-mark. Fixed by (a) shrinking the per-invocation page bound so
 * one invocation reliably completes well within the deployment's duration
 * limit, and (b) persisting the high-water-mark after each fully-processed
 * page, not just at the end — reusing the exact same
 * getHighWaterMark/setHighWaterMark primitives already proven in this file,
 * just checkpointed more granularly. This mirrors backfillJob.ts's own
 * bounded/resumable pattern rather than inventing a new one. A caller
 * (the admin route, or a scheduler) simply re-invokes this on a cadence;
 * each invocation always resumes from the last durably-persisted mark.
 */
const DEFAULT_MAX_PAGES = 2;

export interface ReconciliationResult {
  interactionsScanned: number;
  interactionsInserted: number;
  categoryCacheRowsUpdated: number;
  newHighWaterMark: string;
  pagesProcessed: number;
}

/**
 * `checkpointSource` (Session 5.1 amendment) lets a second interaction
 * source (Chat) reuse this exact function against its own independent
 * checkpoint row, instead of sharing — and corrupting — Voice's
 * high-water-mark. Defaults to 'voice' so every pre-existing call site
 * is unaffected.
 */
export async function runReconciliation(
  repo: CustomerRepository,
  source: InteractionSourceAdapter,
  maxPages: number = DEFAULT_MAX_PAGES,
  checkpointSource: string = 'voice',
): Promise<ReconciliationResult> {
  const lastHighWaterMark = await repo.getHighWaterMark(checkpointSource);
  const since = lastHighWaterMark
    ? new Date(new Date(lastHighWaterMark).getTime() - OVERLAP_MS).toISOString()
    : undefined;

  let interactionsScanned = 0;
  let interactionsInserted = 0;
  let maxStartedAt = lastHighWaterMark ?? new Date(0).toISOString();
  let pagesProcessed = 0;

  // Reconciliation scans by page (not per-contact-point — it exists
  // precisely to catch interactions no known contact point triggered a
  // refresh for), bounded to a small number of pages per run so one
  // invocation reliably completes and checkpoints (see amendment above).
  for (let page = 1; page <= maxPages; page++) {
    const { rows, totalPages } = await source.listPage(page, 100);
    const relevant = since ? rows.filter((r) => r.startedAt >= since) : rows;
    interactionsScanned += relevant.length;

    for (const row of relevant) {
      // Session 5.2: identity resolution (external CIF, if the source
      // supplies one, precedence over normalized phone) now goes through
      // the one shared resolver — see identityResolver.ts. Voice rows
      // never carry a CIF today, so this is behaviorally unchanged for
      // Voice; Chat rows can now unify onto an existing phone-derived
      // customer, or trigger a deterministic merge, per the resolver's
      // documented precedence.
      const resolved = await resolveCustomerIdentity(
        repo,
        { externalCustomerId: row.externalCustomerId, phoneNumber: row.phoneNumber, preferredCustomerId: row.preferredCustomerId ?? null },
        new Date().toISOString(),
      );
      if (!resolved) continue; // no identity signal at all — cannot materialize (unchanged skip behavior)
      if (row.startedAt > maxStartedAt) maxStartedAt = row.startedAt;

      const result = await repo.upsertInteraction({
        customerId: resolved.customerId,
        contactPointId: resolved.contactPointId,
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
        await repo.recomputeCustomerAggregate(resolved.customerId, new Date().toISOString());
      }
    }

    pagesProcessed++;
    // Checkpoint after each fully-processed page, not just at the end,
    // so a duration-limited kill on a later page still keeps this page's
    // progress durably (see amendment note above).
    await repo.setHighWaterMark(maxStartedAt, checkpointSource);

    if (page >= totalPages) break;
  }

  // Category display-cache refresh (plan §16/§20) — never authoritative.
  let categoryCacheRowsUpdated = 0;
  const categoryMap = await repo.getCategoryAgentMap();
  for (const [agentId, categoryId] of categoryMap.entries()) {
    categoryCacheRowsUpdated += await repo.refreshInteractionCategoryCache(agentId, categoryId);
  }

  return { interactionsScanned, interactionsInserted, categoryCacheRowsUpdated, newHighWaterMark: maxStartedAt, pagesProcessed };
}
