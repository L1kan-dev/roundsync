import { chromium } from 'playwright';
const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';

const profile = { onboarded: true, personaName: 'Katinka', avatarUrl: null, rankNew: 18420 };
const telemetry = {
  status: 'fully_parsed', kd_ratio: 1.62, adr: 87, kills: 24, deaths: 15, assists: 6, headshot_pct: 52,
  map: 'de_mirage', match_time: Math.floor(Date.now() / 1000) - 86400, total_damage: 1800,
  headshots: 12, rounds_played: 22, rank_at_match_start: 17850,
  entry_success_pct: 61.5, utility_dmg_per_round: 7.2, clutches_won: 2, trade_kill_pct: 41.0,
  kast_pct: 72.7, headshot_accuracy_pct: 38.4, multi_kill_rounds: { '2k': 3, '3k': 1, '4k': 0, ace: 0 },
  weapon_segmented_stats: { rifle: { kills: 15, damage: 1100 }, awp: { kills: 5, damage: 500 }, pistol: { kills: 4, damage: 200 } },
  kills_damage_by_round_outcome: { wins: { kills: 15, damage: 1100 }, losses: { kills: 9, damage: 700 } },
  kill_distance_buckets: { close: { kills: 8, headshots: 5 }, medium: { kills: 10, headshots: 5 }, long: { kills: 6, headshots: 2 } },
};
const matches = { matches: [{ match_id: 'demo-1', parsed_at: new Date().toISOString(), match_data: { telemetry } }] };
const syncStatus = { counts: { pending_url: 0, pending_download: 0, downloading: 0, fully_parsed: 1, parse_failed: 0 }, current: null, avgSeconds: null };
const rounds = {
  rounds: [
    { round_number: 1, duels: [{ round_number: 1, engagement_tick: 100, engagement_result: 'won', angle_deviation_deg: 2.1, time_to_damage_seconds: 0.3 }], positioning: [{ round_number: 1, outcome: 'survived', was_traded: null, teammate_within_trade_range_at_death: null }], engage_decisions: [{ round_number: 1, teammates_alive: 3, enemies_alive: 2, player_engaged: true, target_died: false, round_won: true, is_isolated: false, current_health: 100, current_weapon: 'ak47' }] },
    { round_number: 2, duels: [{ round_number: 2, engagement_tick: 200, engagement_result: 'lost', angle_deviation_deg: 5.4, time_to_damage_seconds: 0.6 }], positioning: [{ round_number: 2, outcome: 'died', was_traded: true, teammate_within_trade_range_at_death: true }], engage_decisions: [{ round_number: 2, teammates_alive: 1, enemies_alive: 3, player_engaged: true, target_died: true, round_won: false, is_isolated: true, current_health: 30, current_weapon: 'ak47' }] },
  ],
};

const browser = await chromium.launch({ headless: process.env.HEADLESS === 'true' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
await page.route('**/api/user/profile', (route) => route.fulfill({ json: profile }));
await page.route('**/api/matches/sync-status', (route) => route.fulfill({ json: syncStatus }));
await page.route('**/api/matches/demo-1/rounds', (route) => route.fulfill({ json: rounds }));
await page.route('**/api/matches/demo-1', (route) => route.fulfill({ json: { match: matches.matches[0] } }));
await page.route('**/api/matches', (route) => route.fulfill({ json: matches }));
await page.route('**/api/coaching/history', (route) => route.fulfill({ json: { history: [] } }));
await page.addInitScript(() => {
  localStorage.setItem('steamId', '76561198000000000');
  localStorage.setItem('jwtToken', 'mock-token');
});

// Navigate through the real UI: Home -> Matches tab -> click "View Details" -> detail page.
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.waitForSelector('text=Performance', { timeout: 15000 });
await page.click('text=Matches');
await page.waitForSelector('text=Match History', { timeout: 10000 });
await page.click('text=View Details');
await page.waitForSelector('text=Overview', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/match-detail.png', fullPage: true });
console.log('SCREENSHOT: .claude/skills/run-frontend/screenshots/match-detail.png');

const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
console.log('CONSOLE_ERRORS_COUNT:', errors.length);
if (errors.length) console.log(errors.join('\n'));

if (process.env.HEADLESS !== 'true') {
  const watchSeconds = process.env.WATCH_SECONDS !== undefined ? Number(process.env.WATCH_SECONDS) : 5;
  await page.waitForTimeout(watchSeconds * 1000);
}
await browser.close();
