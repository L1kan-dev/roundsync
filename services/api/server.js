import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { encryptValue } from './cryptoUtils.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const SUPABASE_URL = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/\/+$/, '') : '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const VALVE_API_KEY = process.env.VALVE_API_KEY || process.env.STEAM_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
  console.error('❌ Missing required environment variables (Supabase URL/key or JWT_SECRET) in API Gateway.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Middleware Setup
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate Limiting Middleware (Max 60 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please try again later.' }
});
app.use('/api/', apiLimiter);

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user; // Contains { steamId: '...' }
    next();
  });
}

// -------------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------------

// 1. Health Check Endpoint
app.get('/health', async (req, res) => {
  try {
    const { data: healthData } = await supabase.from('service_health').select('*');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: healthData || []
    });
  } catch (err) {
    res.status(500).json({ status: 'degraded', error: err.message });
  }
});

// 2. Steam Auth Session Token Generator Endpoint
app.post('/api/auth/token', async (req, res) => {
  const { proof } = req.body;

  if (!proof || typeof proof !== 'string') {
    return res.status(400).json({ error: 'Login proof required.' });
  }

  const parts = proof.split(':');
  if (parts.length !== 3) {
    return res.status(400).json({ error: 'Malformed login proof.' });
  }
  const [steamId, expiresStr, signature] = parts;
  const expires = Number(expiresStr);

  if (!steamId.match(/^\d{17}$/) || !expires || Date.now() > expires) {
    return res.status(401).json({ error: 'Login proof expired or invalid.' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${steamId}:${expires}`)
    .digest('hex');

  const validSignature =
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!validSignature) {
    return res.status(401).json({ error: 'Login proof could not be verified.' });
  }

  try {
    await supabase.from('users').upsert({
      steam_id64: steamId
    }, { onConflict: 'steam_id64' });

    const token = jwt.sign({ steamId }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      steamId
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to authenticate user.' });
  }
});

// 3. User Matches Endpoint
app.get('/api/matches', authenticateToken, async (req, res) => {
  const steamId = req.user.steamId;

  try {
    const { data: matches, error } = await supabase
      .from('matches')
      .select('match_id, match_data, parsed_at')
      .eq('steam_id64', steamId)
      .order('parsed_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ Failed to fetch matches:', error.message);
      return res.status(500).json({ error: error.message });
    }

    res.json({ matches: matches || [] });
  } catch (err) {
    console.error('❌ Unexpected error fetching matches:', err.message);
    res.status(500).json({ error: 'Failed to fetch match history.' });
  }
});

// 2b. Sync Progress Endpoint
app.get('/api/matches/sync-status', authenticateToken, async (req, res) => {
  const steamId = req.user.steamId;

  try {
    const { data: matches, error } = await supabase
      .from('matches')
      .select('match_id, match_data')
      .eq('steam_id64', steamId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const counts = { pending_url: 0, pending_download: 0, downloading: 0, fully_parsed: 0, parse_failed: 0 };
    const completedDurations = [];
    let current = null;

    for (const m of matches || []) {
      const t = m.match_data?.telemetry || {};
      const status = t.status || 'pending_url';
      if (counts[status] !== undefined) counts[status] += 1;

      if (status === 'downloading' && t.started_at) {
        current = { matchId: m.match_id, startedAt: t.started_at };
      }
      if (status === 'fully_parsed' && typeof t.processing_seconds === 'number') {
        completedDurations.push(t.processing_seconds);
      }
    }

    const recentDurations = completedDurations.slice(-10);
    const avgSeconds = recentDurations.length > 0
      ? Math.round(recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length)
      : null;

    res.json({ counts, current, avgSeconds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync status.' });
  }
});

// 3b. User Profile / Onboarding Status Endpoint
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  const steamId = req.user.steamId;

  try {
    const { data: userRow, error } = await supabase
      .from('users')
      .select('game_auth_code')
      .eq('steam_id64', steamId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    let personaName = null;
    let avatarUrl = null;

    if (VALVE_API_KEY) {
      try {
        const steamRes = await fetch(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${VALVE_API_KEY}&steamids=${steamId}`
        );
        const steamData = await steamRes.json();
        const player = steamData?.response?.players?.[0];
        if (player) {
          personaName = player.personaname || null;
          avatarUrl = player.avatarfull || null;
        }
      } catch (steamErr) {
        console.warn('⚠️ Could not fetch Steam profile summary:', steamErr.message);
      }
    }

    // Real Premier CS Rating for the Home dashboard's rank badge — cheap: reuses the
    // same fact_adaptation_event lookup the AI Coach and Insights dashboard already use.
    let rankNew = null;
    let rankTypeId = null;
    try {
      const { data: recentMatches } = await supabase
        .from('matches')
        .select('match_id')
        .eq('steam_id64', steamId)
        .order('parsed_at', { ascending: false })
        .limit(30);
      const rankInfo = await getPlayerRankInfo(steamId, (recentMatches || []).map((m) => m.match_id));
      rankNew = rankInfo.rankNew;
      rankTypeId = rankInfo.rankTypeId;
    } catch (rankErr) {
      console.warn('⚠️ Could not fetch rank info:', rankErr.message);
    }

    res.json({
      onboarded: Boolean(userRow?.game_auth_code),
      personaName,
      avatarUrl,
      rankNew,
      rankTypeId
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// 4. AI Coaching Chat Endpoint (Gemini Integration)
const round1 = (n) => Math.round(n * 10) / 10;

// Bands are the real, current (2026) CS2 Premier CS Rating bands — same ones used in the
// coaching-fact design research, not invented for this feature.
// Real CS2 Premier CS Rating bands, corrected against an actual in-game reference
// screenshot the user provided (an earlier web-research-sourced 7-band guess was wrong
// on both the thresholds AND the count — it's 6 real bands, not 7). Keep in sync with
// frontend/lib/rank.ts's RANK_BANDS if these ever change again.
// Real CS2 Premier CS Rating bands — corrected against a clear, exact in-game reference
// screenshot of the full rank-up ladder. An earlier "fix" based on a blurrier screenshot
// got this wrong a second time — this is the ground-truth version. Keep in sync with
// frontend/lib/rank.ts's RANK_BANDS if these ever change again.
function rankTierInstruction(rankNew) {
  if (rankNew === null || rankNew === undefined) {
    return "The player's current rank is unknown. Use clear, plain language and briefly explain any CS2-specific term the first time you use it.";
  }
  if (rankNew < 5000) {
    return `The player's CS Rating is ${rankNew} (Grey band, a newer/lower-experience player). Use simple, plain language, avoid unexplained jargon, and briefly explain any tactical term (e.g. "trade", "pre-aim", "eco round") the first time you use it.`;
  }
  if (rankNew < 10000) {
    return `The player's CS Rating is ${rankNew} (Light Blue band). Common CS terms (peek, trade, eco) are fine without heavy explanation, but still briefly explain more advanced tactical concepts.`;
  }
  if (rankNew < 15000) {
    return `The player's CS Rating is ${rankNew} (Blue band, an average-experience player). Standard CS coaching vocabulary is fine without extra explanation.`;
  }
  if (rankNew < 20000) {
    return `The player's CS Rating is ${rankNew} (Purple band, an experienced player). Use full tactical CS vocabulary and go deeper into the "why" behind advice without over-explaining basics.`;
  }
  if (rankNew < 25000) {
    return `The player's CS Rating is ${rankNew} (Pink band, a highly skilled player). Talk like a coach addressing a strong competitive player — assume solid game sense, use precise tactical terminology, focus on nuance over fundamentals.`;
  }
  if (rankNew < 30000) {
    return `The player's CS Rating is ${rankNew} (Red band, a highly skilled player). Talk like a coach addressing a strong competitive player — assume solid game sense, use precise tactical terminology, focus on nuance over fundamentals.`;
  }
  return `The player's CS Rating is ${rankNew} (Gold band, an elite-level player). Talk like a coach addressing a near-professional — assume deep game knowledge, focus on high-level nuance and marginal gains rather than fundamentals.`;
}

async function getPlayerRankInfo(steamId, matchIds) {
  if (matchIds.length === 0) return { rankNew: null, rankTypeId: null };
  const { data } = await supabase
    .from('fact_adaptation_event')
    .select('match_id, player_rank_new, player_rank_type_id')
    .eq('steam_id64', steamId)
    .in('match_id', matchIds)
    .not('player_rank_new', 'is', null);

  const byMatch = new Map();
  for (const row of data || []) {
    if (!byMatch.has(row.match_id)) byMatch.set(row.match_id, row);
  }
  for (const matchId of matchIds) {
    if (byMatch.has(matchId)) {
      const r = byMatch.get(matchId);
      return { rankNew: r.player_rank_new, rankTypeId: r.player_rank_type_id };
    }
  }
  return { rankNew: null, rankTypeId: null };
}

function summarizeEconomy(rows) {
  if (rows.length === 0) return null;
  const mismatches = rows.filter((r) =>
    (r.loadout_tier === 'force_buy' || r.loadout_tier === 'full_buy') &&
    (r.team_buy_capacity === 'full_eco' || r.team_buy_capacity === 'semi_eco')
  );
  return {
    rounds_tracked: rows.length,
    buy_decisions_against_team_economy: mismatches.length,
    buy_decisions_against_team_economy_pct: round1(100 * mismatches.length / rows.length),
  };
}

function summarizeUtility(rows) {
  if (rows.length === 0) return null;
  const flashes = rows.filter((r) => r.grenade_type === 'flashbang');
  const teamFlashes = flashes.filter((r) => (r.teammates_blinded || 0) > 0);
  const flashAssists = flashes.filter((r) => r.flash_assist === true);
  const damageNades = rows.filter((r) => ['hegrenade', 'molotov', 'incendiary'].includes(r.grenade_type));
  return {
    total_throws: rows.length,
    flashbangs_thrown: flashes.length,
    team_flash_count: teamFlashes.length,
    team_flash_pct: flashes.length ? round1(100 * teamFlashes.length / flashes.length) : null,
    flash_assist_count: flashAssists.length,
    avg_enemies_blinded_per_flash: flashes.length
      ? round1(flashes.reduce((s, r) => s + (r.enemies_blinded || 0), 0) / flashes.length) : null,
    avg_damage_per_he_or_molotov: damageNades.length
      ? round1(damageNades.reduce((s, r) => s + (r.damage_dealt || 0), 0) / damageNades.length) : null,
  };
}

function summarizeAdaptation(rows) {
  if (rows.length === 0) return null;
  const byType = {};
  for (const r of rows) {
    const key = r.trigger_type;
    if (!byType[key]) byType[key] = { count: 0, reacted: 0, totalReaction: 0 };
    byType[key].count += 1;
    if (r.reaction_time_seconds !== null && r.reaction_time_seconds !== undefined) {
      byType[key].reacted += 1;
      byType[key].totalReaction += r.reaction_time_seconds;
    }
  }
  const summary = {};
  for (const [key, v] of Object.entries(byType)) {
    summary[key] = {
      occurrences: v.count,
      no_visible_reaction_within_3s_pct: round1(100 * (v.count - v.reacted) / v.count),
      avg_reaction_time_seconds: v.reacted ? round1(v.totalReaction / v.reacted) : null,
    };
  }
  return summary;
}

function summarizePositioning(rows) {
  if (rows.length === 0) return null;
  const died = rows.filter((r) => r.outcome === 'died');
  const tradeable = died.filter((r) => r.teammate_within_trade_range_at_death === true);
  const traded = died.filter((r) => r.was_traded === true);
  const survivedOrTradeable = (rows.length - died.length) + tradeable.length;
  return {
    isolated_commitments: rows.length,
    died_pct: round1(100 * died.length / rows.length),
    survived_pct: round1(100 * (rows.length - died.length) / rows.length),
    of_deaths_teammate_was_in_trade_range_pct: died.length ? round1(100 * tradeable.length / died.length) : null,
    of_deaths_actually_traded_pct: died.length ? round1(100 * traded.length / died.length) : null,
    // Judges the DECISION, not just the death: a push that dies but had a teammate in
    // trade range wasn't necessarily a bad call — same principle the fact table itself
    // was designed around. Used by the dashboard's Trade Discipline score.
    survived_or_tradeable_pct: round1(100 * survivedOrTradeable / rows.length),
  };
}

function summarizeDuels(rows) {
  if (rows.length === 0) return null;
  const real = rows.filter((r) => !r.opponent_inferred);
  const won = real.filter((r) => r.engagement_result === 'won');
  const lost = real.filter((r) => r.engagement_result === 'lost');
  const avgDeviation = (arr) => arr.length
    ? round1(arr.reduce((s, r) => s + (r.angle_deviation_deg || 0), 0) / arr.length) : null;
  const avgTTD = (arr) => {
    const withTTD = arr.filter((r) => r.time_to_damage_seconds !== null && r.time_to_damage_seconds !== undefined);
    return withTTD.length ? round1(withTTD.reduce((s, r) => s + r.time_to_damage_seconds, 0) / withTTD.length) : null;
  };
  return {
    engagements_tracked: rows.length,
    won: won.length,
    lost: lost.length,
    avg_angle_deviation_deg_when_won: avgDeviation(won),
    avg_angle_deviation_deg_when_lost: avgDeviation(lost),
    avg_angle_deviation_deg_overall: avgDeviation(real),
    avg_time_to_damage_seconds_when_won: avgTTD(won),
  };
}

function summarizeEngage(rows) {
  if (rows.length === 0) return null;
  const engaged = rows.filter((r) => r.player_engaged);
  const disengaged = rows.filter((r) => !r.player_engaged);
  const engagedWon = engaged.filter((r) => r.round_won);
  const disengagedSurvived = disengaged.filter((r) => !r.target_died);
  return {
    outnumbered_moments: rows.length,
    chose_to_engage_pct: round1(100 * engaged.length / rows.length),
    round_win_pct_when_engaged: engaged.length ? round1(100 * engagedWon.length / engaged.length) : null,
    survived_pct_when_disengaged: disengaged.length ? round1(100 * disengagedSurvived.length / disengaged.length) : null,
  };
}

async function buildFactSummary(steamId, matchIds) {
  const [economy, utility, adaptation, positioning, duels, engage] = await Promise.all([
    supabase.from('fact_economy').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_utility_throw').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_adaptation_event').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_positioning_risk').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_duel_placement').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_engage_decision').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
  ]);
  return {
    economy: summarizeEconomy(economy.data || []),
    utility: summarizeUtility(utility.data || []),
    adaptation: summarizeAdaptation(adaptation.data || []),
    positioning: summarizePositioning(positioning.data || []),
    duels: summarizeDuels(duels.data || []),
    engage: summarizeEngage(engage.data || []),
  };
}

// --- Dashboard-only helpers: 0-100 scores, per-map breakdown, per-match trends ---
// Every score below is a direct percentage or simple blend of numbers already computed
// above — no new invented coefficients. See project docs for the reasoning per score.
function computeCategoryScores(factSummary) {
  const clamp = (n) => Math.max(0, Math.min(100, round1(n)));
  const scores = {};

  if (factSummary.economy) {
    scores.economic_discipline = clamp(100 - factSummary.economy.buy_decisions_against_team_economy_pct);
  }
  if (factSummary.utility && factSummary.utility.flashbangs_thrown > 0) {
    scores.utility_iq = clamp(100 - (factSummary.utility.team_flash_pct || 0));
  }
  if (factSummary.adaptation) {
    const types = Object.values(factSummary.adaptation);
    if (types.length > 0) {
      const avgReacted = types.reduce((s, t) => s + (100 - t.no_visible_reaction_within_3s_pct), 0) / types.length;
      scores.awareness = clamp(avgReacted);
    }
  }
  if (factSummary.positioning) {
    scores.trade_discipline = clamp(factSummary.positioning.survived_or_tradeable_pct);
  }
  if (factSummary.duels && factSummary.duels.avg_angle_deviation_deg_overall !== null
    && factSummary.duels.avg_angle_deviation_deg_overall !== undefined) {
    scores.aim_placement = clamp(100 * Math.max(0, 1 - factSummary.duels.avg_angle_deviation_deg_overall / 60));
  }
  if (factSummary.engage) {
    const parts = [factSummary.engage.round_win_pct_when_engaged, factSummary.engage.survived_pct_when_disengaged]
      .filter((v) => v !== null && v !== undefined);
    if (parts.length > 0) {
      scores.engage_iq = clamp(parts.reduce((a, b) => a + b, 0) / parts.length);
    }
  }
  return scores;
}

function countBy(rows, field) {
  const counts = {};
  for (const r of rows) {
    const key = r[field] || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// Mirrors the frontend's performanceIndex() in frontend/app/page.tsx exactly — kept in
// sync deliberately, both are the same "lightweight composite, not the full Impact
// formula" placeholder.
function performanceIndexServer(t) {
  const kdComponent = Math.min(t.kd_ratio || 0, 3) / 3;
  const adrComponent = Math.min(t.adr || 0, 150) / 150;
  const hsComponent = Math.min(t.headshot_pct || 0, 100) / 100;
  return Math.round((kdComponent * 0.5 + adrComponent * 0.35 + hsComponent * 0.15) * 100);
}

function buildMapBreakdown(matchList) {
  const byMap = new Map();
  for (const m of matchList) {
    const t = m.match_data?.telemetry || {};
    const map = m.map || t.map;
    if (!map || t.kd_ratio === undefined || t.kd_ratio === null) continue;
    if (!byMap.has(map)) byMap.set(map, { map, games: 0, kdSum: 0, adrSum: 0, hsSum: 0, perfSum: 0 });
    const entry = byMap.get(map);
    entry.games += 1;
    entry.kdSum += t.kd_ratio || 0;
    entry.adrSum += t.adr || 0;
    entry.hsSum += t.headshot_pct || 0;
    entry.perfSum += performanceIndexServer(t);
  }
  return Array.from(byMap.values())
    .map((e) => ({
      map: e.map,
      games: e.games,
      avg_kd: round1(e.kdSum / e.games),
      avg_adr: round1(e.adrSum / e.games),
      avg_hs_pct: round1(e.hsSum / e.games),
      avg_performance: round1(e.perfSum / e.games),
    }))
    .sort((a, b) => b.games - a.games);
}

// Oldest -> newest, matching the existing Home-tab trend charts' ordering convention.
function buildTrends(matchList, adaptationRows, positioningRows) {
  const matchOrder = matchList.map((m) => m.match_id).slice().reverse();
  const mapByMatchId = new Map(matchList.map((m) => [m.match_id, m.map || m.match_data?.telemetry?.map || null]));

  const reactionByMatch = new Map();
  for (const r of adaptationRows) {
    if (!reactionByMatch.has(r.match_id)) reactionByMatch.set(r.match_id, { total: 0, reacted: 0 });
    const e = reactionByMatch.get(r.match_id);
    e.total += 1;
    if (r.reaction_time_seconds !== null && r.reaction_time_seconds !== undefined) e.reacted += 1;
  }

  const positioningByMatch = new Map();
  for (const r of positioningRows) {
    if (!positioningByMatch.has(r.match_id)) positioningByMatch.set(r.match_id, { total: 0, good: 0 });
    const e = positioningByMatch.get(r.match_id);
    e.total += 1;
    if (r.outcome === 'survived' || r.teammate_within_trade_range_at_death === true) e.good += 1;
  }

  const reaction = matchOrder.filter((id) => reactionByMatch.has(id)).map((id) => {
    const e = reactionByMatch.get(id);
    return { match_id: id, map: mapByMatchId.get(id), reaction_pct: round1(100 * e.reacted / e.total) };
  });

  const positioning = matchOrder.filter((id) => positioningByMatch.has(id)).map((id) => {
    const e = positioningByMatch.get(id);
    return { match_id: id, map: mapByMatchId.get(id), good_decision_pct: round1(100 * e.good / e.total) };
  });

  return { reaction, positioning };
}

async function buildDashboardPayload(steamId) {
  const { data: matches } = await supabase
    .from('matches')
    .select('match_id, match_data, map, parsed_at')
    .eq('steam_id64', steamId)
    .order('parsed_at', { ascending: false })
    .limit(30);

  const matchList = matches || [];
  const matchIds = matchList.map((m) => m.match_id);

  const [economy, utility, adaptation, positioning, duels, engage, rankInfo] = await Promise.all([
    supabase.from('fact_economy').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_utility_throw').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_adaptation_event').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_positioning_risk').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_duel_placement').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    supabase.from('fact_engage_decision').select('*').eq('steam_id64', steamId).in('match_id', matchIds),
    getPlayerRankInfo(steamId, matchIds),
  ]);

  const factSummary = {
    economy: summarizeEconomy(economy.data || []),
    utility: summarizeUtility(utility.data || []),
    adaptation: summarizeAdaptation(adaptation.data || []),
    positioning: summarizePositioning(positioning.data || []),
    duels: summarizeDuels(duels.data || []),
    engage: summarizeEngage(engage.data || []),
  };

  const trends = buildTrends(matchList, adaptation.data || [], positioning.data || []);

  return {
    matchesTracked: matchList.length,
    rankNew: rankInfo.rankNew,
    rankTypeId: rankInfo.rankTypeId,
    factSummary,
    categoryScores: computeCategoryScores(factSummary),
    mapBreakdown: buildMapBreakdown(matchList),
    trends,
    loadoutMix: countBy(economy.data || [], 'loadout_tier'),
  };
}

app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
  const steamId = req.user.steamId;
  try {
    const payload = await buildDashboardPayload(steamId);
    res.json(payload);
  } catch (err) {
    console.error('Dashboard Stats API Error:', err);
    res.status(500).json({ error: 'Failed to build dashboard stats.' });
  }
});

// How many of the most recent turns get replayed back to Gemini for conversational
// continuity — kept small on purpose, since the fact-summary + match-summary context
// already carries the heavy statistical payload; this is just "what did we just discuss."
const CONVERSATION_HISTORY_TURNS = 6;

// GET so the frontend can restore the chat on page load/reload instead of starting empty
// every time — coaching_history was already being written to on every ask, just never read.
app.get('/api/coaching/history', authenticateToken, async (req, res) => {
  const steamId = req.user.steamId;
  try {
    const { data } = await supabase
      .from('coaching_history')
      .select('question, response, created_at')
      .eq('steam_id64', steamId)
      .order('created_at', { ascending: false })
      .limit(30);
    const chronological = (data || []).slice().reverse();
    res.json({ history: chronological });
  } catch (err) {
    console.error('Coaching History API Error:', err);
    res.status(500).json({ error: 'Failed to load coaching history.' });
  }
});

app.post('/api/coaching/ask', authenticateToken, async (req, res) => {
  const steamId = req.user.steamId;
  const { question } = req.body;

  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: 'Question text is required.' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY missing on server.' });
  }

  try {
    // Fetch the player's full retained match history (matches the 30-match retention cap
    // watcher.py enforces, so this is genuinely "everything currently kept"), newest first.
    const { data: matches } = await supabase
      .from('matches')
      .select('match_id, match_data, map, parsed_at')
      .eq('steam_id64', steamId)
      .order('parsed_at', { ascending: false })
      .limit(30);

    const matchList = matches || [];
    const matchIds = matchList.map((m) => m.match_id);

    // Compact per-match summary (small — safe to send in full) rather than the raw JSONB blob.
    const matchSummaries = matchList.map((m) => {
      const t = m.match_data?.telemetry || {};
      return {
        map: m.map || t.map || null,
        kd_ratio: t.kd_ratio ?? null,
        adr: t.adr ?? null,
        headshot_pct: t.headshot_pct ?? null,
      };
    });

    const [factSummary, rankInfo, recentHistory] = await Promise.all([
      buildFactSummary(steamId, matchIds),
      getPlayerRankInfo(steamId, matchIds),
      supabase
        .from('coaching_history')
        .select('question, response, created_at')
        .eq('steam_id64', steamId)
        .order('created_at', { ascending: false })
        .limit(CONVERSATION_HISTORY_TURNS)
        .then(({ data }) => (data || []).slice().reverse()),
    ]);

    const conversationContext = recentHistory.length > 0
      ? recentHistory.map((h) => `Player asked: ${h.question}\nYou answered: ${h.response}`).join('\n\n')
      : '(no prior conversation this session)';

    const prompt = `
    You are RoundSync, an expert, direct, and tactical Counter-Strike 2 AI coach.

    ${rankTierInstruction(rankInfo.rankNew)}

    If the player's question is too vague to answer with something specific and data-driven
    (e.g. "am I good", "help me improve", "rate my gameplay"), do NOT guess or pad out a
    generic answer. Instead, ask ONE short clarifying question that steers them toward a
    specific, answerable question, and give one concrete example of a strong question
    (e.g. "Why do I keep dying early on Mirage mid?" or "Was pushing B alone in round 14 a
    bad decision?"). Once the question is specific enough, answer it fully using the data below.

    Here is the recent conversation with this player, most recent last, for continuity:
    ${conversationContext}

    Here is a summary of the player's last ${matchSummaries.length} matches:
    ${JSON.stringify(matchSummaries)}

    Here is a statistical summary of the player's decision-making patterns, computed from
    round-by-round data across those same matches (already aggregated for you, not raw event logs):
    ${JSON.stringify(factSummary)}

    Player's Question / Request: ${question}

    Provide sharp, data-driven, actionable feedback to help them improve their gameplay, aim, or tactical awareness. Use the statistical patterns above to explain WHY something is happening, not just what the numbers are. Keep your response concise and focused.
    `;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    const aiReply = response.text;

    // Log query in coaching_history table
    await supabase.from('coaching_history').insert({
      steam_id64: steamId,
      question: question,
      response: aiReply,
      matches_context_count: matchList.length
    });

    res.json({ response: aiReply });
  } catch (err) {
    console.error('Coaching API Error:', err);
    res.status(500).json({ error: 'Failed to generate AI coaching response.' });
  }
});

// 5. User Onboarding Setup Endpoint
app.post('/api/user/onboard', authenticateToken, async (req, res) => {
  const steamId = req.user.steamId;
  const { gameAuthCode, recentShareCode } = req.body;

  if (!gameAuthCode || !recentShareCode) {
    return res.status(400).json({ error: 'Game Auth Code and Recent Share Code are required.' });
  }

  try {
    await supabase.from('users').upsert({
      steam_id64: String(steamId),
      game_auth_code: encryptValue(String(gameAuthCode)),
      last_known_code: String(recentShareCode)
    }, { onConflict: 'steam_id64' });

    // Also seed the first match into the queue
    await supabase.from('matches').upsert({
      match_id: String(recentShareCode),
      steam_id64: String(steamId),
      match_data: {
        match_id: String(recentShareCode),
        telemetry: {
          match_id: String(recentShareCode),
          share_code: String(recentShareCode),
          status: 'pending_url'
        }
      }
    }, { onConflict: 'match_id' });

    res.json({ success: true, message: 'Onboarding completed and first match queued!' });
  } catch (err) {
    console.error('Onboarding Error:', err);
    res.status(500).json({ error: 'Failed to save onboarding configuration.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 RoundSync Express API Gateway running on port ${PORT}`);
});
