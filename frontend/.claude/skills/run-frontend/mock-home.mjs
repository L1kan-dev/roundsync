import { chromium } from 'playwright';

const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';

const profile = {
  onboarded: true,
  personaName: 'Katinka',
  avatarUrl: null,
  rankNew: 18420,
};

const matches = {
  matches: [
    {
      match_id: 'demo-1',
      parsed_at: new Date().toISOString(),
      match_data: {
        telemetry: {
          status: 'fully_parsed', kd_ratio: 1.62, adr: 87, kills: 24, deaths: 15, assists: 6, headshot_pct: 52,
          map: 'de_mirage', match_time: Math.floor(Date.now() / 1000) - 86400, total_damage: 1800,
          headshots: 12, rounds_played: 22, rank_at_match_start: 17850,
          entry_success_pct: 61.5, utility_dmg_per_round: 7.2, clutches_won: 2, trade_kill_pct: 41.0,
          kast_pct: 72.7, headshot_accuracy_pct: 38.4, multi_kill_rounds: { '2k': 3, '3k': 1, '4k': 0, ace: 0 },
        },
      },
    },
    {
      match_id: 'demo-2',
      parsed_at: new Date().toISOString(),
      match_data: {
        telemetry: {
          status: 'fully_parsed', kd_ratio: 0.81, adr: 61, kills: 13, deaths: 19, headshot_pct: 38,
          map: 'de_inferno', match_time: Math.floor(Date.now() / 1000) - 172800, total_damage: 1350,
          headshots: 5, rounds_played: 22, rank_at_match_start: 17920,
          entry_success_pct: 45.0, utility_dmg_per_round: 5.1, clutches_won: 0, trade_kill_pct: 28.0,
          kast_pct: 54.5, headshot_accuracy_pct: 29.1, multi_kill_rounds: { '2k': 1, '3k': 0, '4k': 0, ace: 0 },
        },
      },
    },
    {
      match_id: 'demo-3',
      parsed_at: new Date().toISOString(),
      match_data: {
        telemetry: {
          status: 'fully_parsed', kd_ratio: 1.28, adr: 79, kills: 19, deaths: 15, headshot_pct: 44,
          map: 'de_ancient', match_time: Math.floor(Date.now() / 1000) - 259200, total_damage: 1650,
          headshots: 8, rounds_played: 21, rank_at_match_start: 18050,
        },
      },
    },
  ],
};

const syncStatus = {
  counts: { pending_url: 0, pending_download: 0, downloading: 0, fully_parsed: 3, parse_failed: 0 },
  current: null,
  avgSeconds: null,
};

// Headed by default so the user can watch this run live — see driver.mjs's comment.
const browser = await chromium.launch({ headless: process.env.HEADLESS === 'true' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

await page.route('**/api/user/profile', (route) => route.fulfill({ json: profile }));
await page.route('**/api/matches/sync-status', (route) => route.fulfill({ json: syncStatus }));
await page.route('**/api/matches', (route) => route.fulfill({ json: matches }));
await page.route('**/api/coaching/history', (route) => route.fulfill({ json: { history: [] } }));

await page.addInitScript(() => {
  localStorage.setItem('steamId', '76561198000000000');
  localStorage.setItem('jwtToken', 'mock-token');
});

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Performance', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/home-dashboard.png', fullPage: true });

const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

console.log('SCREENSHOT: .claude/skills/run-frontend/screenshots/home-dashboard.png');

if (process.env.HEADLESS !== 'true') {
  const watchSeconds = process.env.WATCH_SECONDS !== undefined ? Number(process.env.WATCH_SECONDS) : 15;
  console.log(`Leaving the window open for ${watchSeconds}s so you can actually look at it...`);
  await page.waitForTimeout(watchSeconds * 1000);
}

await browser.close();
