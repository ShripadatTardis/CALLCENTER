#!/usr/bin/env node
/**
 * Drives POST /api/customers/admin?action=seedCategories — plan §17/§22.
 * Safe to re-run: never overwrites an existing agent→category mapping.
 * Route consolidated under /admin during Session 4.5 (Vercel Hobby
 * plan's 12-function-per-deployment limit — see api/customers/admin.ts).
 *
 * Usage:
 *   CUSTOMER360_ADMIN_TOKEN=... node scripts/seedCustomer360Categories.mjs [baseUrl]
 */
const baseUrl = process.argv[2] || 'https://callcenter-three-livid.vercel.app';
const token = process.env.CUSTOMER360_ADMIN_TOKEN;

if (!token) {
  console.error('CUSTOMER360_ADMIN_TOKEN is required in the environment.');
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/customers/admin?action=seedCategories`, {
  method: 'POST',
  headers: { 'x-admin-token': token },
});
const body = await res.json();
if (!res.ok) {
  console.error(`Seed failed (HTTP ${res.status}):`, body);
  process.exit(1);
}

console.log(`Created ${body.created.length} new categories:`, body.created);
console.log(`Skipped ${body.skipped.length} already-mapped agents:`, body.skipped);
console.log(`Total agents seen: ${body.totalAgents}`);
