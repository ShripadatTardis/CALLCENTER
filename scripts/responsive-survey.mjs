#!/usr/bin/env node
/**
 * scripts/responsive-survey.mjs
 *
 * Development/test tooling only — NOT part of the production build.
 * Multi-route responsive acceptance survey for Session 10.5B. Logs into the
 * deployed app once via its own built-in demo-access UI (no credentials in
 * source), then for each route in ROUTES, resizes the SAME authenticated
 * page to each viewport in WIDTHS and records window.innerWidth,
 * scrollWidth/clientWidth overflow, and a screenshot. Read-only: never
 * clicks any submit/launch/send/destructive control.
 *
 * Usage: node scripts/responsive-survey.mjs [outDir]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://callcenter-three-livid.vercel.app';
const outDir = process.argv[2] || path.join(process.cwd(), '.tooling', 'screenshots', 'survey');
fs.mkdirSync(outDir, { recursive: true });

const WIDTHS = [
  ['1536', 1536, 1024],
  ['1366', 1366, 768],
  ['768', 768, 1024],
  ['390', 390, 844],
];

const ROUTES = [
  ['/dashboard', 'Observe'],
  ['/live-view', 'Observe'],
  ['/call-logs', 'Observe'],
  ['/chat-logs', 'Observe'],
  ['/customers', 'Observe'],
  ['/initiate-call', 'Control'],
  ['/chat', 'Control'],
  ['/outbound-campaigns', 'Operationalize'],
  ['/outbound-campaigns/create', 'Operationalize'],
  ['/nps-campaigns', 'Operationalize'],
  ['/whatsapp-hub', 'Integrate'],
  ['/formatting-hub', 'Integrate'],
  ['/orchestrator', 'Integrate'],
  ['/orchestrator/new', 'Integrate'],
  ['/orchestrator/integrations', 'Integrate'],
  ['/ai-agents', 'Improve'],
  ['/qa-review', 'Improve'],
  ['/analytics', 'Measure'],
  ['/user-management', 'Govern'],
  ['/settings', 'Govern'],
];

function slug(route) {
  return route.replace(/^\//, '').replace(/\//g, '_') || 'root';
}

async function run() {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

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
  console.log('Post-login URL:', page.url());

  const results = [];
  for (const [route, pillar] of ROUTES) {
    for (const [label, w, h] of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
      } catch (e) {
        results.push({ route, pillar, width: label, error: String(e).slice(0, 200) });
        console.log(`[${route}] ${label} -> NAV ERROR: ${e}`);
        continue;
      }
      await page.waitForTimeout(400);
      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        title: document.title,
      })).catch(() => null);
      const overflow = metrics ? metrics.scrollWidth > metrics.clientWidth + 2 : null;
      const shotPath = path.join(outDir, `${slug(route)}--${label}.png`);
      await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
      results.push({ route, pillar, width: label, requested: w, innerWidth: metrics?.innerWidth, scrollWidth: metrics?.scrollWidth, clientWidth: metrics?.clientWidth, overflow, screenshot: shotPath });
      console.log(`[${route}] ${label} innerWidth=${metrics?.innerWidth} overflow=${overflow}`);
    }
  }

  fs.writeFileSync(path.join(outDir, 'survey-results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('\nDone. Results:', path.join(outDir, 'survey-results.json'));
}

run().catch((e) => { console.error(e); process.exit(1); });
