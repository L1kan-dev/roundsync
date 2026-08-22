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

import { chromium } from 'playwright';

const [, , rawPath = '/', outFile = 'screenshot.png', waitFor = 'body'] = process.argv;
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
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

await browser.close();
