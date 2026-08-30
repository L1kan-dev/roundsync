import { chromium } from 'playwright';
const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';
const MODE = process.env.RANK_MODE || 'takeover'; // 'takeover' or 'badge'

const prevRank = MODE === 'takeover' ? 9500 : 9000;
const newRank = MODE === 'takeover' ? 12000 : 9500;

const profile = { onboarded: true, personaName: 'Katinka', avatarUrl: null, rankNew: newRank };
const matches = { matches: [] };
const syncStatus = { counts: { pending_url: 0, pending_download: 0, downloading: 0, fully_parsed: 0, parse_failed: 0 }, current: null, avgSeconds: null };

const browser = await chromium.launch({ headless: process.env.HEADLESS === 'true' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.route('**/api/user/profile', (route) => route.fulfill({ json: profile }));
await page.route('**/api/matches/sync-status', (route) => route.fulfill({ json: syncStatus }));
await page.route('**/api/matches', (route) => route.fulfill({ json: matches }));
await page.route('**/api/coaching/history', (route) => route.fulfill({ json: { history: [] } }));
await page.addInitScript((prev) => {
  localStorage.setItem('steamId', '76561198000000000');
  localStorage.setItem('jwtToken', 'mock-token');
  localStorage.setItem('roundsync_last_known_rank', String(prev));
}, prevRank);
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(MODE === 'takeover' ? 1200 : 2000);
await page.screenshot({ path: `.claude/skills/run-frontend/screenshots/rank-${MODE}.png`, fullPage: true });
console.log(`SCREENSHOT: .claude/skills/run-frontend/screenshots/rank-${MODE}.png`);
if (process.env.HEADLESS !== 'true') {
  const watchSeconds = process.env.WATCH_SECONDS !== undefined ? Number(process.env.WATCH_SECONDS) : 5;
  await page.waitForTimeout(watchSeconds * 1000);
}
await browser.close();
