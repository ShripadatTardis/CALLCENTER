#!/usr/bin/env node
// Dev tooling only. Session 11.3 Call Logs verification: L1 boundedness,
// G1 row/header heights, and real server-side pagination, across all 4
// required viewports and both themes.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.CALLC_BASE || 'https://callcenter-three-livid.vercel.app';
const outDir = path.join(process.cwd(), '.tooling', 'screenshots', 'session-11-3-call-logs');
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: '1536x1024', width: 1536, height: 1024 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
];
const THEMES = ['dark', 'light'];

async function login(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const demo = page.locator('text=Sarah Connor').first();
  if (await demo.count()) {
    await demo.click();
    const signIn = page.locator('button:has-text("Sign in to Dashboard")');
    if (await signIn.count()) {
      await signIn.click();
      await page.waitForTimeout(2500);
    }
  }
}

async function measureL1(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return null;
    return {
      clientHeight: main.clientHeight,
      scrollHeight: main.scrollHeight,
      delta: main.scrollHeight - main.clientHeight,
    };
  });
}

async function measureGrid(page) {
  return page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return null;
    const headRow = table.querySelector('thead tr');
    const bodyRow = table.querySelector('tbody tr');
    return {
      headerHeight: headRow ? headRow.getBoundingClientRect().height : null,
      rowHeight: bodyRow ? bodyRow.getBoundingClientRect().height : null,
    };
  });
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const results = [];

  for (const theme of THEMES) {
    const context = await browser.newContext({ viewport: VIEWPORTS[1] });
    const page = await context.newPage();
    await login(page);
    await page.evaluate((t) => localStorage.setItem('voiceforce.appearance', t), theme);
    await page.goto(BASE + '/call-logs', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(400);
      const l1 = await measureL1(page);
      const grid = await measureGrid(page);
      const slug = `${vp.name}-${theme}`;
      await page.screenshot({ path: path.join(outDir, `${slug}.png`) });
      results.push({ theme, viewport: vp.name, l1, grid });
      console.log(slug, JSON.stringify({ l1, grid }));
    }
    await context.close();
  }

  // Pagination check — dark, 1366x768.
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await login(page);
  await page.evaluate(() => localStorage.setItem('voiceforce.appearance', 'dark'));
  await page.goto(BASE + '/call-logs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const paginationText1 = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
  const firstRowId1 = await page.locator('tbody tr').first().locator('td').nth(1).textContent().catch(() => null);
  console.log('Pagination before Next:', paginationText1, '| first row:', firstRowId1);

  const nextBtn = page.locator('button:has-text("Next")');
  const nextEnabled = await nextBtn.isEnabled().catch(() => false);
  console.log('Next button enabled:', nextEnabled);
  if (nextEnabled) {
    await nextBtn.click();
    await page.waitForTimeout(1500);
    const paginationText2 = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
    const firstRowId2 = await page.locator('tbody tr').first().locator('td').nth(1).textContent().catch(() => null);
    console.log('Pagination after Next:', paginationText2, '| first row:', firstRowId2);
    console.log('Rows differ across pages:', firstRowId1 !== firstRowId2);
    await page.screenshot({ path: path.join(outDir, 'pagination-page2-dark-1366x768.png') });
  }
  await context.close();

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
