#!/usr/bin/env node
// Dev tooling only. Representative Light-mode regression check at 390px.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://callcenter-three-livid.vercel.app';
const outDir = path.join(process.cwd(), '.tooling', 'screenshots', 'light');
fs.mkdirSync(outDir, { recursive: true });

const ROUTES = ['/dashboard', '/settings', '/call-logs', '/initiate-call', '/analytics'];

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

  // Force Light via localStorage the same way the app itself persists it.
  await page.evaluate(() => localStorage.setItem('voiceforce.appearance', 'light'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 }).catch((e) => console.log(route, 'nav error', e.message));
    await page.waitForTimeout(600);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const slug = route.replace(/\//g, '_') || 'root';
    await page.screenshot({ path: path.join(outDir, `${slug}--390-light.png`) });
    console.log(route, 'darkClassPresent=' + isDark, JSON.stringify(metrics));
  }
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
