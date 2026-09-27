#!/usr/bin/env node
// Dev tooling only. Opens a real Call Logs interaction detail dialog and a
// Create Campaign flow at 390px to check dialog/overlay narrow-width fit.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://callcenter-three-livid.vercel.app';
const outDir = path.join(process.cwd(), '.tooling', 'screenshots', 'dialogs');
fs.mkdirSync(outDir, { recursive: true });

const run = async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const demo = page.locator('text=Sarah Connor').first();
  if (await demo.count()) {
    await demo.click();
    const signIn = page.locator('button:has-text("Sign in to Dashboard")');
    if (await signIn.count()) { await signIn.click(); await page.waitForTimeout(2500); }
  }

  await page.goto(BASE + '/call-logs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // Switch to Table view then click first row to open detail dialog.
  const tableBtn = page.locator('button:has-text("Table")').first();
  if (await tableBtn.count()) { await tableBtn.click(); await page.waitForTimeout(500); }
  const rows = page.locator('table tbody tr, [role="row"]');
  const rowCount = await rows.count().catch(() => 0);
  console.log('Row count:', rowCount);
  if (rowCount > 0) {
    await rows.first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outDir, 'call-detail-dialog--390.png') });
    const dlg = page.locator('[role="dialog"]').first();
    if (await dlg.count()) {
      const box = await dlg.boundingBox();
      console.log('Dialog box:', box);
    } else {
      console.log('No dialog element found after row click.');
    }
  }

  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
