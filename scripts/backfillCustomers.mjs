#!/usr/bin/env node
/**
 * Drives POST /api/customers/admin?action=backfill in bounded batches
 * until nextCursor is null — plan §5/§22. Optional; the progressive
 * model (aggregationService.ts) does not depend on this having run.
 * Route consolidated under /admin during Session 4.5 (Vercel Hobby
 * plan's 12-function-per-deployment limit — see api/customers/admin.ts).
 *
 * Usage:
 *   CUSTOMER360_ADMIN_TOKEN=... node scripts/backfillCustomers.mjs [baseUrl] [batchSize]
 * Defaults: baseUrl=https://callcenter-three-livid.vercel.app, batchSize=5
 */
const baseUrl = process.argv[2] || 'https://callcenter-three-livid.vercel.app';
const batchSize = process.argv[3] || '5';
const token = process.env.CUSTOMER360_ADMIN_TOKEN;

if (!token) {
  console.error('CUSTOMER360_ADMIN_TOKEN is required in the environment.');
  process.exit(1);
}

async function runBatch(cursor) {
  const url = `${baseUrl}/api/customers/admin?action=backfill&cursor=${cursor}&batchSize=${batchSize}`;
  const res = await fetch(url, { method: 'POST', headers: { 'x-admin-token': token } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Backfill batch failed (HTTP ${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

let cursor = 1;
let totalInserted = 0;
let totalCustomers = new Set();

while (cursor !== null) {
  console.log(`Running batch at cursor=${cursor}...`);
  const result = await runBatch(cursor);
  console.log(
    `  pagesProcessed=${result.pagesProcessed} interactionsInserted=${result.interactionsInserted} customersTouched=${result.customersTouched} nextCursor=${result.nextCursor}`,
  );
  totalInserted += result.interactionsInserted;
  cursor = result.nextCursor;
}

console.log(`Backfill complete. Total interactions inserted: ${totalInserted}.`);
