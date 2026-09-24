#!/usr/bin/env node
/**
 * `vercel dev`'s Node.js Function runtime (the /api/* routes) inherits
 * environment variables from the PARENT shell process — it does not
 * independently parse .env.local the way its Vite child dev command
 * does for the frontend (import.meta.env). This means having real
 * values in .env.local is not enough on its own: if the shell that
 * launched `vercel dev` doesn't already have VOICEBOT_BASE_URL /
 * VOICEBOT_API_KEY set, every /api/* request fails with
 * "VOICEBOT_BASE_URL / VOICEBOT_API_KEY are not configured on the
 * server" even though .env.local has them.
 *
 * Confirmed by direct reproduction (2026-09-24): re-linking the Vercel
 * project made no difference; exporting the two vars in the parent
 * shell before running `vercel dev` fixed it immediately. This script
 * is the permanent fix for that — it reads .env.local, injects every
 * key into this process's env, then execs `vercel dev` as a child, so
 * the Function runtime inherits them correctly regardless of shell
 * (PowerShell, cmd, bash) or OS.
 *
 * Usage: npm run dev:vercel   (see package.json)
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envLocalPath = path.join(repoRoot, '.env.local');

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

if (!existsSync(envLocalPath)) {
  console.error(
    '\n.env.local not found. Copy .env.example to .env.local and fill in VOICEBOT_BASE_URL / VOICEBOT_API_KEY first.\n',
  );
  process.exit(1);
}

const parsed = parseEnvFile(envLocalPath);
const missing = ['VOICEBOT_BASE_URL', 'VOICEBOT_API_KEY'].filter((k) => !parsed[k]);
if (missing.length > 0) {
  console.error(`\n.env.local is missing: ${missing.join(', ')} — /api/* routes will fail without them.\n`);
}

const childEnv = { ...process.env, ...parsed };

const child = spawn('npx', ['vercel', 'dev', ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: childEnv,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
