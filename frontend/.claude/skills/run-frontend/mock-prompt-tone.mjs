import { chromium } from 'playwright';
const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';

const profile = { onboarded: true, personaName: 'Katinka', avatarUrl: null, rankNew: 18420 };
// Deliberately strong stats — K/D 1.8 (>=1.3 strong), ADR 100 (>=90 strong), HS% 55 (>=50 strong),
// KAST 80 (>=75 strong) — to confirm the "strong" tier prompts fire, not the deficiency ones.
const telemetry = {
  status: 'fully_parsed', kd_ratio: 1.8, adr: 100, kills: 28, deaths: 15, assists: 5, headshot_pct: 55,
  map: 'de_mirage', match_time: Math.floor(Date.now() / 1000) - 86400, total_damage: 2200,
  headshots: 15, rounds_played: 22, rank_at_match_start: 17850,
  entry_success_pct: 60, utility_dmg_per_round: 6, clutches_won: 2, trade_kill_pct: 41,
  kast_pct: 80, headshot_accuracy_pct: 48, multi_kill_rounds: { '2k': 3, '3k': 1, '4k': 0, ace: 0 },
};
const matches = { matches: [{ match_id: 'demo-1', parsed_at: new Date().toISOString(), match_data: { telemetry } }] };
const syncStatus = { counts: { pending_url: 0, pending_download: 0, downloading: 0, fully_parsed: 1, parse_failed: 0 }, current: null, avgSeconds: null };

const browser = await chromium.launch({ headless: process.env.HEADLESS === 'true' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.route('**/api/user/profile', (route) => route.fulfill({ json: profile }));
await page.route('**/api/matches/sync-status', (route) => route.fulfill({ json: syncStatus }));
await page.route('**/api/matches', (route) => route.fulfill({ json: matches }));
await page.route('**/api/coaching/history', (route) => route.fulfill({ json: { history: [] } }));
await page.addInitScript(() => {
  localStorage.setItem('steamId', '76561198000000000');
  localStorage.setItem('jwtToken', 'mock-token');
});
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.waitForSelector('text=Performance', { timeout: 15000 });

// Click the K/D Ratio tile on Home (should be avgKd=1.8, strong tier).
await page.click('text=K/D Ratio');
await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
const kdPrompt = await page.locator('textarea').first().inputValue().catch(() => null)
  ?? await page.locator('input[type="text"]').first().inputValue().catch(() => null);
console.log('K/D prompt (strong tier expected):', kdPrompt);

// Go back to Matches tab and click a match card (performance index should be high -> strong tier).
await page.click('text=Matches');
await page.waitForSelector('text=Match History', { timeout: 10000 });
await page.click('.hud-corners.border');
await page.waitForTimeout(300);
const matchPrompt = await page.locator('textarea').first().inputValue().catch(() => null)
  ?? await page.locator('input[type="text"]').first().inputValue().catch(() => null);
console.log('Match card prompt (strong tier expected):', matchPrompt);

console.log('CONSOLE_ERRORS_COUNT:', errors.length);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
