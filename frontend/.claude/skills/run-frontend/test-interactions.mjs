import { chromium } from 'playwright';

const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';

const profile = { onboarded: true, personaName: 'Katinka', avatarUrl: null, rankNew: 18420 };
const matches = {
  matches: [
    { match_id: 'demo-1', parsed_at: new Date().toISOString(), match_data: { telemetry: {
      status: 'fully_parsed', kd_ratio: 1.62, adr: 87, kills: 24, deaths: 15, headshot_pct: 52,
      map: 'de_mirage', match_time: Math.floor(Date.now() / 1000) - 86400, total_damage: 1800,
      headshots: 12, rounds_played: 22, rank_at_match_start: 17850,
      entry_success_pct: 61.5, utility_dmg_per_round: 7.2, clutches_won: 2, trade_kill_pct: 41.0,
      kast_pct: 72.7, headshot_accuracy_pct: 38.4, multi_kill_rounds: { '2k': 3, '3k': 1, '4k': 0, ace: 0 },
    } } },
    { match_id: 'demo-2', parsed_at: new Date().toISOString(), match_data: { telemetry: {
      status: 'fully_parsed', kd_ratio: 0.81, adr: 61, kills: 13, deaths: 19, headshot_pct: 38,
      map: 'de_mirage', match_time: Math.floor(Date.now() / 1000) - 172800, total_damage: 1350,
      headshots: 5, rounds_played: 22, rank_at_match_start: 17920,
      entry_success_pct: 45.0, utility_dmg_per_round: 5.1, clutches_won: 0, trade_kill_pct: 28.0,
      kast_pct: 54.5, headshot_accuracy_pct: 29.1, multi_kill_rounds: { '2k': 1, '3k': 0, '4k': 0, ace: 0 },
    } } },
    { match_id: 'demo-3', parsed_at: new Date().toISOString(), match_data: { telemetry: {
      status: 'fully_parsed', kd_ratio: 1.28, adr: 79, kills: 19, deaths: 15, headshot_pct: 44,
      map: 'de_ancient', match_time: Math.floor(Date.now() / 1000) - 259200, total_damage: 1650,
      headshots: 8, rounds_played: 21, rank_at_match_start: 18050,
    } } },
  ],
};
const syncStatus = { counts: { pending_url: 0, pending_download: 0, downloading: 0, fully_parsed: 3, parse_failed: 0 }, current: null, avgSeconds: null };
const dashboard = {
  matchesTracked: 3, rankNew: 18420, rankTypeId: 11,
  factSummary: {
    economy: { rounds_tracked: 44, buy_decisions_against_team_economy_pct: 12 },
    utility: { total_throws: 80, flashbangs_thrown: 30, team_flash_count: 4, team_flash_pct: 13, flash_assist_count: 6, avg_enemies_blinded_per_flash: 0.7, avg_damage_per_he_or_molotov: 22 },
    adaptation: { teammate_death: { occurrences: 20, no_visible_reaction_within_3s_pct: 30, avg_reaction_time_ms: 1834 }, bomb_plant: { occurrences: 10, no_visible_reaction_within_3s_pct: 20, avg_reaction_time_ms: 1188 } },
    positioning: { isolated_commitments: 15, died_pct: 60, survived_pct: 40, of_deaths_teammate_was_in_trade_range_pct: 35, of_deaths_actually_traded_pct: 20, survived_or_tradeable_pct: 55 },
    duels: { engagements_tracked: 120, won: 66, lost: 54, avg_angle_deviation_deg_when_won: 4.2, avg_angle_deviation_deg_when_lost: 9.1, avg_angle_deviation_deg_overall: 6.5, avg_time_to_damage_ms_when_won: 187 },
    engage: { outnumbered_moments: 25, chose_to_engage_pct: 40, round_win_pct_when_engaged: 45, survived_pct_when_disengaged: 70 },
  },
  categoryScores: { economic_discipline: 78, utility_iq: 65, awareness: 70, trade_discipline: 55, aim_placement: 72, engage_iq: 60 },
  mapBreakdown: [
    { map: 'de_mirage', games: 2, avg_kd: 1.2, avg_adr: 74, avg_hs_pct: 45, avg_performance: 60 },
    { map: 'de_ancient', games: 1, avg_kd: 1.28, avg_adr: 79, avg_hs_pct: 44, avg_performance: 58 },
  ],
  trends: {
    reaction: [{ match_id: 'demo-1', map: 'de_mirage', reaction_pct: 70 }, { match_id: 'demo-2', map: 'de_mirage', reaction_pct: 55 }, { match_id: 'demo-3', map: 'de_ancient', reaction_pct: 80 }],
    positioning: [{ match_id: 'demo-1', map: 'de_mirage', good_decision_pct: 50 }, { match_id: 'demo-2', map: 'de_mirage', good_decision_pct: 40 }, { match_id: 'demo-3', map: 'de_ancient', good_decision_pct: 65 }],
  },
  loadoutMix: { full_buy: 20, half_buy: 10, force_buy: 5, eco: 6, carried_over: 3 },
  avgKastPct: 63.6, avgHeadshotAccuracyPct: 33.8, totalMultiKillRounds: 5,
};

// Headed by default so the user can watch this run live — see driver.mjs's comment.
const browser = await chromium.launch({ headless: process.env.HEADLESS === 'true' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

await page.route('**/api/user/profile', (route) => route.fulfill({ json: profile }));
await page.route('**/api/matches/sync-status', (route) => route.fulfill({ json: syncStatus }));
await page.route('**/api/matches', (route) => route.fulfill({ json: matches }));
await page.route('**/api/coaching/history', (route) => route.fulfill({ json: { history: [] } }));
await page.route('**/api/stats/dashboard', (route) => route.fulfill({ json: dashboard }));

await page.addInitScript(() => {
  localStorage.setItem('steamId', '76561198000000000');
  localStorage.setItem('jwtToken', 'mock-token');
});

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Performance', { timeout: 15000 });

// 1. Click the K/D tile on Home -> should jump to Coach tab with a filled prompt
await page.getByRole('button', { name: 'K/D Ratio' }).click();
await page.waitForTimeout(400);
const coachInputVal1 = await page.locator('input[placeholder*="utility"]').inputValue();
console.log('AFTER HOME K/D CLICK -> activeTab visible:', await page.locator('text=Conversational AI Coach').isVisible());
console.log('CHAT INPUT VALUE:', coachInputVal1);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/coach-after-kd-click.png', fullPage: false });

// 2. Go back Home, click a chart bar
await page.getByText('Home', { exact: true }).first().click();
await page.waitForTimeout(300);
await page.waitForSelector('text=Average Damage per Round');
const adrHeading = page.getByText('Average Damage per Round', { exact: true });
const adrCard = adrHeading.locator('xpath=ancestor::div[contains(@style,"height")][1]');
const rect = adrCard.locator('.recharts-bar-rectangle').first();
await rect.click({ force: true });
await page.waitForTimeout(400);
console.log('AFTER CHART BAR CLICK -> on coach tab:', await page.locator('text=Conversational AI Coach').isVisible());
console.log('CHAT INPUT VALUE:', await page.locator('input[placeholder*="utility"]').inputValue());

// 3. Matches tab -> click a match card
await page.getByText('Matches', { exact: true }).click();
await page.waitForTimeout(300);
await page.waitForSelector('text=Match History');
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/matches-tab.png', fullPage: true });
await page.locator('text=Mirage').first().click();
await page.waitForTimeout(400);
console.log('AFTER MATCH CARD CLICK -> on coach tab:', await page.locator('text=Conversational AI Coach').isVisible());
console.log('CHAT INPUT VALUE:', await page.locator('input[placeholder*="utility"]').inputValue());

// 4. Insights tab -> click a stat tile, and a map heatmap cell
await page.getByText('Insights', { exact: true }).click();
await page.waitForTimeout(400);
await page.waitForSelector('text=Crosshair Placement');
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/insights-aim-tab.png', fullPage: true });
await page.getByText('Time to damage (won)').click();
await page.waitForTimeout(400);
console.log('AFTER INSIGHTS STAT TILE CLICK -> on coach tab:', await page.locator('text=Conversational AI Coach').isVisible());
console.log('CHAT INPUT VALUE:', await page.locator('input[placeholder*="utility"]').inputValue());

await page.getByText('Insights', { exact: true }).click();
await page.waitForTimeout(300);
await page.getByText('Performance by Map', { exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/insights-maps-tab.png', fullPage: true });

// 5. Coach empty state -> Choose a Topic wheel
await page.getByText('AI Coach', { exact: true }).click();
await page.waitForTimeout(400);
await page.getByText('CHOOSE A TOPIC').click();
await page.waitForTimeout(500);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/coach-wheel-open.png', fullPage: false });
await page.getByText('Aim & Reaction').click();
await page.waitForTimeout(300);
console.log('AFTER WHEEL PICK -> input value:', await page.locator('input[placeholder*="utility"]').inputValue());
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/coach-after-wheel-pick.png', fullPage: false });

// 6. Insights -> Economy & Utility -> hover a chart bar for tooltip readability, click Buy Decisions bar
await page.getByText('Insights', { exact: true }).click();
await page.waitForTimeout(300);
await page.getByText('Economy & Utility', { exact: true }).click();
await page.waitForTimeout(400);
await page.waitForSelector('text=Buy Decisions');
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/insights-economy-tab.png', fullPage: true });
const loadoutBarSegment = page.locator('button.bar3d-h').first();
await loadoutBarSegment.click();
await page.waitForTimeout(300);
console.log('AFTER LOADOUT BAR CLICK -> on coach tab:', await page.locator('text=Conversational AI Coach').isVisible());
console.log('CHAT INPUT VALUE:', await page.locator('input[placeholder*="utility"]').inputValue());

// 7. Reaction chart tooltip readability
await page.getByText('Insights', { exact: true }).click();
await page.waitForTimeout(300);
await page.waitForSelector('text=Crosshair Placement');
const reactionBar = page.locator('.recharts-bar-rectangle').first();
await reactionBar.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/insights-tooltip-hover.png', fullPage: false });

// 8. Wheel at full size
await page.getByText('AI Coach', { exact: true }).click();
await page.waitForTimeout(400);
await page.getByText('CHOOSE A TOPIC').click();
await page.waitForTimeout(500);
await page.screenshot({ path: '.claude/skills/run-frontend/screenshots/coach-wheel-open-v2.png', fullPage: false });

// 9. Home Performance tile
await page.getByText('Home', { exact: true }).first().click();
await page.waitForTimeout(300);
await page.getByText('Performance', { exact: false }).first().click();
await page.waitForTimeout(400);
console.log('AFTER PERFORMANCE CLICK -> on coach tab:', await page.locator('text=Conversational AI Coach').isVisible());
console.log('CHAT INPUT VALUE:', await page.locator('input[placeholder*="utility"]').inputValue());

console.log('CONSOLE_ERRORS_COUNT:', errors.length);
if (errors.length) console.log('ERRORS:', JSON.stringify(errors, null, 2));

if (process.env.HEADLESS !== 'true') {
  const watchSeconds = process.env.WATCH_SECONDS !== undefined ? Number(process.env.WATCH_SECONDS) : 15;
  console.log(`Leaving the window open for ${watchSeconds}s so you can actually look at it...`);
  await page.waitForTimeout(watchSeconds * 1000);
}

await browser.close();
