#!/usr/bin/env node
// Dev tooling only. Second-pass retest of the 4 fixed routes at 390px.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://callcenter-three-livid.vercel.app';
const outDir = path.join(process.cwd(), '.tooling', 'screenshots', 'retest');
fs.mkdirSync(outDir, { recursive: true });

const ROUTES = ['/outbound-campaigns/create', '/analytics', '/settings', '/chat', '/orchestrator/flow/1'];

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

  for (const route of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
    } catch (e) {
      console.log(route, 'NAV ERROR', String(e).slice(0, 150));
      continue;
    }
    await page.waitForTimeout(600);
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const overflow = metrics.scrollWidth > metrics.clientWidth + 2;
    const slug = route.replace(/\//g, '_');
    await page.screenshot({ path: path.join(outDir, `${slug}--390.png`) });
    console.log(route, JSON.stringify(metrics), 'overflow=' + overflow);
  }
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
