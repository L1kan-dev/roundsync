#!/usr/bin/env node
// Drives the RoundSync frontend with headless Chromium (via Playwright) and
// takes a screenshot, since chromium-cli is not available in this environment.
//
// Usage:
//   node .claude/skills/run-frontend/driver.mjs <path> <output.png> [wait-for-selector]
//
// Examples:
//   node .claude/skills/run-frontend/driver.mjs / landing.png "text=RoundSync"
//
// Env:
//   FRONTEND_URL — base URL of the running frontend (default http://localhost:3000)
//   WATCH_SECONDS — how long to leave the headed window open before closing it
//     (default 15s). Opening headed and then closing it 1-2 seconds later — as the
//     first version of this fix did — defeats the whole point: a human can't actually
//     look at anything that fast. Found 2026-08-27 when the user pointed out the window
//     closed before they could see it.

import { chromium } from 'playwright';

const [, , rawPath = '/', outFile = 'screenshot.png', waitFor = 'body'] = process.argv;
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

// Headed by default — the user wants to watch verification happen live, not just receive a
// screenshot after the fact (standing preference). Set HEADLESS=true to opt back into
// headless for a constrained environment (CI, a container with no real display).
const browser = await chromium.launch({ headless: process.env.HEADLESS === 'true', args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

const url = new URL(rawPath, baseUrl).toString();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector(waitFor, { timeout: 15000 });
await page.screenshot({ path: outFile, fullPage: true });

console.log('SCREENSHOT:', outFile);
console.log('CONSOLE_ERRORS_COUNT:', consoleErrors.length);
consoleErrors.forEach((e) => console.log('ERR:', e));

if (process.env.HEADLESS !== 'true') {
  const watchSeconds = process.env.WATCH_SECONDS !== undefined ? Number(process.env.WATCH_SECONDS) : 15;
  console.log(`Leaving the window open for ${watchSeconds}s so you can actually look at it...`);
  await page.waitForTimeout(watchSeconds * 1000);
}

await browser.close();
