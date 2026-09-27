#!/usr/bin/env node
// Dev tooling only. Session 11.4 Chat Logs verification: grouping UI removal,
// Call Agent + Status filters (server-side), L1 boundedness, G1 density,
// pagination, across all 4 required viewports and both themes.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.CALLC_BASE || 'https://callcenter-three-livid.vercel.app';
const outDir = path.join(process.cwd(), '.tooling', 'screenshots', 'session-11-4-chat-logs');
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
      docScrollHeight: document.documentElement.scrollHeight,
      windowInnerHeight: window.innerHeight,
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

async function measureOverflow(page) {
  return page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const results = [];

  for (const theme of THEMES) {
    const context = await browser.newContext({ viewport: VIEWPORTS[1] });
    const page = await context.newPage();
    await login(page);
    await page.evaluate((t) => localStorage.setItem('voiceforce.appearance', t), theme);
    await page.goto(BASE + '/chat-logs', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(400);
      const l1 = await measureL1(page);
      const grid = await measureGrid(page);
      const overflow = await measureOverflow(page);
      const groupedToggleCount = await page.locator('button:has-text("Grouped")').count();
      const tableToggleCount = await page.locator('button:has-text("Table")').count();
      const groupingTreeCount = await page.locator('[data-testid="grouped-interaction-tree"]').count();
      const slug = `${vp.name}-${theme}`;
      await page.screenshot({ path: path.join(outDir, `${slug}.png`) });
      results.push({ theme, viewport: vp.name, l1, grid, overflow, groupedToggleCount, tableToggleCount, groupingTreeCount });
      console.log(slug, JSON.stringify({ l1, grid, overflow, groupedToggleCount, tableToggleCount, groupingTreeCount }));
    }
    await context.close();
  }

  // Functional check: Call Agent + Status filters (server-side), chips,
  // Clear All, pagination, View detail — dark, 1366x768.
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await login(page);
  await page.evaluate(() => localStorage.setItem('voiceforce.appearance', 'dark'));
  await page.goto(BASE + '/chat-logs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const totalRowsBefore = await page.locator('tbody tr').count();
  const paginationBefore = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
  console.log('Rows before filter:', totalRowsBefore, 'pagination:', paginationBefore);

  await page.locator('button:has-text("Filters")').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'filters-panel-open.png') });

  const callAgentLabel = await page.locator('text=Call Agent').count();
  console.log('Call Agent label present:', callAgentLabel > 0);

  const agentSelect = page.locator('label:has-text("Call Agent") + button, label:has-text("Call Agent") ~ button').first();
  const selectExists = await agentSelect.count();
  console.log('Agent select control present:', selectExists > 0);

  let firstRowSessionBefore = null;
  if (selectExists) {
    await agentSelect.click();
    await page.waitForTimeout(400);
    const options = await page.locator('[role="option"]').allTextContents();
    console.log('Agent options:', JSON.stringify(options));
    const firstRealAgent = options.find((o) => o.toLowerCase() !== 'all agents');
    if (firstRealAgent) {
      firstRowSessionBefore = await page.locator('tbody tr').first().locator('td').nth(2).textContent().catch(() => null);
      await page.locator('[role="option"]', { hasText: firstRealAgent }).first().click();
      await page.waitForTimeout(900);
      const filtersCountText = await page.locator('button:has-text("Filters")').first().textContent();
      console.log('Filters button text after agent select:', filtersCountText);
      const rowsAfter = await page.locator('tbody tr').count();
      const paginationAfterAgent = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
      console.log('Rows after agent filter (' + firstRealAgent + '):', rowsAfter, 'pagination:', paginationAfterAgent, '(server-side — should differ from unfiltered total if agent has fewer sessions)');
      await page.screenshot({ path: path.join(outDir, 'agent-filtered.png') });

      const chip = await page.locator('text=/^Agent:/').count();
      console.log('Agent filter chip present (no "(page)" — this is server-side):', chip > 0);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const clearAllBtn = page.locator('button:has-text("Clear all"), button:has-text("Clear All")').first();
      if (await clearAllBtn.count()) {
        await clearAllBtn.click();
        await page.waitForTimeout(900);
        const rowsAfterClear = await page.locator('tbody tr').count();
        console.log('Rows after Clear All:', rowsAfterClear, '(should be back near original:', totalRowsBefore, ')');
      }
    }
  }

  // Pagination — verify Page 1 -> Page 2 loads genuinely different records.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const paginationText1 = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
  console.log('Pagination text:', paginationText1);
  const nextBtn = page.locator('button:has-text("Next")');
  const nextEnabled = await nextBtn.isEnabled().catch(() => false);
  if (nextEnabled) {
    const firstRowBefore = await page.locator('tbody tr').first().locator('td').nth(0).textContent().catch(() => null);
    await nextBtn.click();
    await page.waitForTimeout(1200);
    const paginationText2 = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
    const firstRowAfter = await page.locator('tbody tr').first().locator('td').nth(0).textContent().catch(() => null);
    console.log('Pagination after Next:', paginationText2, 'first-row timestamp differs:', firstRowBefore !== firstRowAfter, `(before="${firstRowBefore}" after="${firstRowAfter}")`);
  } else {
    console.log('Next button not enabled — not enough sessions for a second page.');
  }

  // View detail dialog
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const viewBtnCount = await page.locator('button:has-text("View")').count();
  console.log('View buttons present:', viewBtnCount);
  if (viewBtnCount > 0) {
    await page.locator('button:has-text("View")').first().click();
    await page.waitForTimeout(1000);
    const dialogVisible = await page.locator('[role="dialog"]').count();
    console.log('Session detail dialog opened:', dialogVisible > 0);
    await page.screenshot({ path: path.join(outDir, 'detail-dialog.png') });
    const latencyText = await page.locator('text=/Latest latency:/').first().textContent().catch(() => null);
    console.log('Latest latency field text (checking for "undefinedms"):', latencyText);
    await page.keyboard.press('Escape');
  }

  await context.close();

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
