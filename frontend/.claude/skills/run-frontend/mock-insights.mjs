import { chromium } from 'playwright';
const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';

const profile = { onboarded: true, personaName: 'Katinka', avatarUrl: null, rankNew: 18420 };
const matches = { matches: [] };
const syncStatus = { counts: { pending_url: 0, pending_download: 0, downloading: 0, fully_parsed: 0, parse_failed: 0 }, current: null, avgSeconds: null };

const dashboard = {
  matchesTracked: 5, rankNew: 18420, rankTypeId: 11,
  factSummary: {
    economy: { rounds_tracked: 80, buy_decisions_against_team_economy_pct: 12.5 },
    utility: { total_throws: 40, flashbangs_thrown: 20, team_flash_count: 3, team_flash_pct: 15, flash_assist_count: 4, avg_enemies_blinded_per_flash: 0.6, avg_damage_per_he_or_molotov: 22.4 },
    adaptation: { teammate_death: { occurrences: 30, no_visible_reaction_within_3s_pct: 20, avg_reaction_time_ms: 850 } },
    positioning: { isolated_commitments: 14, died_pct: 45, survived_pct: 55, of_deaths_teammate_was_in_trade_range_pct: 30, of_deaths_actually_traded_pct: 18, survived_or_tradeable_pct: 70 },
    duels: { engagements_tracked: 60, won: 34, lost: 26, avg_angle_deviation_deg_when_won: 3.1, avg_angle_deviation_deg_when_lost: 8.4, avg_angle_deviation_deg_overall: 5.2, avg_time_to_damage_ms_when_won: 320 },
    engage: { outnumbered_moments: 9, chose_to_engage_pct: 44, round_win_pct_when_engaged: 38, survived_pct_when_disengaged: 62 },
  },
  categoryScores: { economic_discipline: 71, utility_iq: 58, awareness: 63, trade_discipline: 49, aim_placement: 66, engage_iq: 52 },
  mapBreakdown: [{ map: 'de_mirage', games: 3, avg_kd: 1.2, avg_adr: 78, avg_hs_pct: 45, avg_performance: 55 }],
  trends: {
    reaction: [{ match_id: 'm1', map: 'de_mirage', reaction_pct: 70 }, { match_id: 'm2', map: 'de_dust2', reaction_pct: 65 }],
    positioning: [{ match_id: 'm1', map: 'de_mirage', good_decision_pct: 60 }, { match_id: 'm2', map: 'de_dust2', good_decision_pct: 55 }],
    economy: [{ match_id: 'm1', map: 'de_mirage', against_team_economy_pct: 10 }, { match_id: 'm2', map: 'de_dust2', against_team_economy_pct: 18 }],
    utility: [{ match_id: 'm1', map: 'de_mirage', team_flash_pct: 12 }, { match_id: 'm2', map: 'de_dust2', team_flash_pct: 20 }],
  },
  loadoutMix: { full_buy: 20, half_buy: 10, force_buy: 5, eco: 8, carried_over: 2 },
  avgKastPct: 68.4, avgHeadshotAccuracyPct: 35.2, totalMultiKillRounds: 6,
};

const browser = await chromium.launch({ headless: process.env.HEADLESS === 'true' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.route('**/api/user/profile', (route) => route.fulfill({ json: profile }));
await page.route('**/api/matches/sync-status', (route) => route.fulfill({ json: syncStatus }));
await page.route('**/api/matches', (route) => route.fulfill({ json: matches }));
await page.route('**/api/coaching/history', (route) => route.fulfill({ json: { history: [] } }));
await page.route('**/api/stats/dashboard', (route) => route.fulfill({ json: dashboard }));
await page.route('**/api/user/lifetime-stats', (route) => route.fulfill({ json: {} }));
await page.addInitScript(() => {
  localStorage.setItem('steamId', '76561198000000000');
  localStorage.setItem('jwtToken', 'mock-token');
});
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.waitForSelector('text=Performance', { timeout: 15000 });
await page.click('text=Insights');
await page.waitForSelector('text=Crosshair Placement', { timeout: 10000 });
await page.waitForSelector('text=Consistency & Impact', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/insights-aim.png', fullPage: true });
console.log('SCREENSHOT: .claude/skills/run-frontend/screenshots/insights-aim.png');

await page.click('text=Economy & Utility');
await page.waitForSelector('text=Buy Decisions Over Time', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/insights-resources.png', fullPage: true });
console.log('SCREENSHOT: .claude/skills/run-frontend/screenshots/insights-resources.png');

console.log('CONSOLE_ERRORS_COUNT:', errors.length);
if (errors.length) console.log(errors.join('\n'));

if (process.env.HEADLESS !== 'true') {
  const watchSeconds = process.env.WATCH_SECONDS !== undefined ? Number(process.env.WATCH_SECONDS) : 5;
  await page.waitForTimeout(watchSeconds * 1000);
}
await browser.close();
