#!/usr/bin/env node
// Dev tooling only. Session 11.3A Call Logs verification: grouping UI removal,
// Call Agent filter (page-local), L1 boundedness, G1 density, across all 4
// required viewports and both themes.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.CALLC_BASE || 'https://callcenter-three-livid.vercel.app';
const outDir = path.join(process.cwd(), '.tooling', 'screenshots', 'session-11-3a-call-logs');
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

async function measureOverflow(page) {
  return page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
}

async function measurePersistentHeightBeforeFirstRow(page) {
  return page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return null;
    const firstRow = table.querySelector('tbody tr');
    if (!firstRow) return null;
    return firstRow.getBoundingClientRect().top;
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
      const overflow = await measureOverflow(page);
      const firstRowTop = await measurePersistentHeightBeforeFirstRow(page);
      const groupedToggleCount = await page.locator('button:has-text("Grouped")').count();
      const tableToggleCount = await page.locator('button:has-text("Table")').count();
      const groupingTreeCount = await page.locator('[data-testid="grouped-interaction-tree"]').count();
      const slug = `${vp.name}-${theme}`;
      await page.screenshot({ path: path.join(outDir, `${slug}.png`) });
      results.push({
        theme, viewport: vp.name, l1, grid, overflow, firstRowTop,
        groupedToggleCount, tableToggleCount, groupingTreeCount,
      });
      console.log(slug, JSON.stringify({ l1, grid, overflow, firstRowTop, groupedToggleCount, tableToggleCount, groupingTreeCount }));
    }
    await context.close();
  }

  // Functional check: Call Agent filter, Filters count, Clear All, pagination — dark, 1366x768.
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await login(page);
  await page.evaluate(() => localStorage.setItem('voiceforce.appearance', 'dark'));
  await page.goto(BASE + '/call-logs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const totalRowsBefore = await page.locator('tbody tr').count();
  console.log('Rows before agent filter:', totalRowsBefore);

  await page.locator('button:has-text("Filters")').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'filters-panel-open.png') });

  const headerText = await page.locator('[role="dialog"] span.font-semibold, [data-radix-popper-content-wrapper] span.font-semibold').first().textContent().catch(() => null);
  console.log('Filter panel header text:', headerText);

  const callAgentLabel = await page.locator('text=Call Agent').count();
  console.log('Call Agent label present:', callAgentLabel > 0);

  const agentSelect = page.locator('label:has-text("Call Agent") + button, label:has-text("Call Agent") ~ button').first();
  const selectExists = await agentSelect.count();
  console.log('Agent select control present:', selectExists > 0);

  if (selectExists) {
    await agentSelect.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, 'agent-select-open.png') });
    const options = await page.locator('[role="option"]').allTextContents();
    console.log('Agent options:', JSON.stringify(options));
    const firstRealAgent = options.find((o) => o.toLowerCase() !== 'all agents');
    if (firstRealAgent) {
      await page.locator('[role="option"]', { hasText: firstRealAgent }).first().click();
      await page.waitForTimeout(600);
      const filtersCountText = await page.locator('button:has-text("Filters")').first().textContent();
      console.log('Filters button text after agent select:', filtersCountText);
      const rowsAfter = await page.locator('tbody tr').count();
      console.log('Rows after agent filter (' + firstRealAgent + '):', rowsAfter);
      await page.screenshot({ path: path.join(outDir, 'agent-filtered.png') });

      const chip = await page.locator('text=/Agent:.*\\(page\\)/').count();
      console.log('Agent filter chip with (page) label present:', chip > 0);

      // Close the Filters popover first, then use the chip-row "Clear all".
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const clearAllBtn = page.locator('button:has-text("Clear all"), button:has-text("Clear All")').first();
      if (await clearAllBtn.count()) {
        await clearAllBtn.click();
        await page.waitForTimeout(500);
        const rowsAfterClear = await page.locator('tbody tr').count();
        const chipsAfterClear = await page.locator('text=/Agent:.*\\(page\\)/').count();
        console.log('Rows after Clear All:', rowsAfterClear, '(should equal before:', totalRowsBefore, ')');
        console.log('Agent chip still present after Clear All:', chipsAfterClear > 0, '(should be false)');
      } else {
        console.log('Clear all button NOT found after closing popover');
      }
    }
  }

  // Pagination still works
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const paginationText1 = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
  console.log('Pagination text:', paginationText1);
  const nextBtn = page.locator('button:has-text("Next")');
  const nextEnabled = await nextBtn.isEnabled().catch(() => false);
  if (nextEnabled) {
    const firstRowBefore = await page.locator('tbody tr').first().locator('td').nth(1).textContent().catch(() => null);
    await nextBtn.click();
    await page.waitForTimeout(1200);
    const paginationText2 = await page.locator('text=/Page \\d+ of \\d+/').first().textContent().catch(() => null);
    const firstRowAfter = await page.locator('tbody tr').first().locator('td').nth(1).textContent().catch(() => null);
    console.log('Pagination after Next:', paginationText2, 'rows differ:', firstRowBefore !== firstRowAfter);
  }

  // View detail + Export still present
  const viewBtnCount = await page.locator('button:has-text("View")').count();
  console.log('View buttons present:', viewBtnCount);
  const exportBtnCount = await page.locator('button:has-text("Export")').count();
  console.log('Export button present:', exportBtnCount);

  await context.close();

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
