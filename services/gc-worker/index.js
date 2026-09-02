import SteamUser from 'steam-user';
import GlobalOffensive from 'node-cs2';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import SteamTotp from 'steam-totp';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/\/+$/, '') : '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const STEAM_USERNAME = process.env.STEAM_USERNAME;
const STEAM_PASSWORD = process.env.STEAM_PASSWORD;
const STEAM_SHARED_SECRET = process.env.STEAM_SHARED_SECRET;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const user = new SteamUser();
const csgo = new GlobalOffensive(user);

let isGcReady = false;
let pollingInterval = null;
let isConnecting = false;
let isProcessingMatches = false;

// Robust Connection & Reconnection Handler
function connectToSteam() {
  if (isConnecting) return;
  isConnecting = true;

  console.log('🔄 Logging into Steam...');
  user.logOn({
    accountName: STEAM_USERNAME,
    password: STEAM_PASSWORD,
    twoFactorCode: SteamTotp.generateAuthCode(STEAM_SHARED_SECRET)
  });
}

// EResult codes (verified against DoctorMcKay/node-steam-user's real enum, not guessed) that
// mean the login will NEVER succeed by simply retrying — a wrong/rotated password, a banned/
// disabled/locked account, or a broken STEAM_SHARED_SECRET producing bad 2FA codes. Retrying
// these every 15s forever accomplishes nothing and risks Steam flagging repeated failed
// logins as suspicious. Anything else (network blip, Steam servers down) keeps retrying.
const FATAL_LOGIN_ERESULTS = new Set([
  5,   // InvalidPassword
  17,  // Banned
  43,  // AccountDisabled
  51,  // Suspended
  63,  // AccountLogonDenied — needs a human to approve this device/IP via email
  73,  // AccountLockedDown
  85,  // AccountLoginDeniedNeedTwoFactor
  88,  // TwoFactorCodeMismatch — STEAM_SHARED_SECRET is likely wrong or was rotated
  89,  // TwoFactorActivationCodeMismatch
  105, // IPBanned — retrying from the same IP won't help
  114, // AccountDeleted
]);

// Without an explicit handler, node-steam-user's own default behavior when it decides mid-
// session that it needs a FRESH verification code (distinct from the one already sent at
// logOn) is to fall back to prompting for one interactively via stdin — something a
// non-interactive Railway container can never answer, so the process just hangs forever.
// This is the confirmed root cause of the reconnect-after-kick hang (NEXT_STEPS.md Tier 14):
// registering this handler and auto-supplying a fresh TOTP code (same method the normal
// logOn path already uses) prevents the stuck state from ever happening, instead of trying
// to detect and recover from it after the fact.
user.on('steamGuard', (_domain, callback, lastCodeWrong) => {
  console.log(
    `🔐 Steam requested a fresh Guard code mid-session (lastCodeWrong: ${lastCodeWrong}) — ` +
    `auto-supplying via TOTP, no manual input needed.`
  );
  callback(SteamTotp.generateAuthCode(STEAM_SHARED_SECRET));
});

// Steam & GC Authentication Lifecycle
user.on('loggedOn', () => {
  console.log('✅ Logged into Steam successfully. Requesting CS2 license...');
  isConnecting = false;
  user.requestFreeLicense([730], (err) => {
    if (err) {
      console.warn('⚠️ License check note:', err.message);
    } else {
      console.log('🎮 CS2 license active. Launching game...');
    }
    user.gamesPlayed([730]);
  });
});

user.on('error', (err) => {
  isConnecting = false;
  isGcReady = false;
  stopPolling();

  if (FATAL_LOGIN_ERESULTS.has(err.eresult)) {
    console.error(
      `🛑 FATAL Steam login error: ${err.message} (eresult: ${err.eresult}). This will not ` +
      `fix itself by retrying — check STEAM_USERNAME/STEAM_PASSWORD/STEAM_SHARED_SECRET, or ` +
      `whether this account needs manual re-approval on Steam. Stopping automatic reconnects; ` +
      `restart this service once the underlying issue is fixed.`
    );
    return;
  }

  console.error(`❌ Steam login error: ${err.message} (eresult: ${err.eresult}). Retrying in 15 seconds...`);
  setTimeout(connectToSteam, 15000);
});

user.on('disconnected', (eresult, msg) => {
  console.warn(`⚠️ Disconnected from Steam (Code: ${eresult}, Msg: ${msg}). Reconnecting in 15 seconds...`);
  isGcReady = false;
  stopPolling();
  setTimeout(connectToSteam, 15000);
});

csgo.on('connectedToGC', () => {
  console.log('🎮 Connected to CS2 Game Coordinator.');
  isGcReady = true;
  startPolling();
});

csgo.on('disconnectedFromGC', (reason) => {
  console.warn(`⚠️ Disconnected from Game Coordinator: ${reason}. Re-launching CS2 session in 10 seconds...`);
  isGcReady = false;
  stopPolling();
  
  // Re-request games played to poke GC back awake
  setTimeout(() => {
    if (user.steamID) {
      console.log('🔄 Poking Steam to re-open CS2 app state...');
      user.gamesPlayed([730]);
    }
  }, 10000);
});

// Match Resolution Logic
async function processPendingMatches() {
  if (!isGcReady) return;
  // setInterval fires every 5s regardless of whether the previous run finished — resolving
  // up to 5 matches, each with its own 10s GC timeout, can genuinely take longer than that.
  // Without this guard, two overlapping runs would each register their own one-time
  // 'matchList' listener, and a response meant for one run's request could get consumed by
  // the other's listener — silently attaching the wrong download URL to the wrong match.
  if (isProcessingMatches) return;
  isProcessingMatches = true;

  try {
    const { data: matches, error } = await supabase
      .from('matches')
      .select('match_id,match_data')
      .contains('match_data', { telemetry: { status: 'pending_url' } })
      .limit(5);

    if (error) {
      console.error('❌ Supabase Fetch Error:', error.message);
      return;
    }

    if (!matches || matches.length === 0) return;

    for (const match of matches) {
      const dbMatchId = match.match_id;
      const currentMatchData = match.match_data || {};
      const telemetry = currentMatchData.telemetry || {};
      
      const shareCode = telemetry.share_code || currentMatchData.shareCode || dbMatchId;
      const matchIdCode = telemetry.match_id;
      const outcomeId = telemetry.outcome_id;
      const token = telemetry.token;

      // Skip a match still backing off from a recent failed attempt, instead of re-hitting
      // the GC on every single 5s poll tick regardless of how recently it failed.
      const nextRetryAt = telemetry.next_retry_at ? new Date(telemetry.next_retry_at).getTime() : 0;
      if (nextRetryAt > Date.now()) continue;

      console.log(`🔍 Resolving match: ${dbMatchId} (Code: ${shareCode || matchIdCode})`);

      try {
        const gcData = await requestMatchUrl(matchIdCode, outcomeId, token, shareCode);

        console.log(`📦 Successfully retrieved GC match details for ${dbMatchId}`);

        // TEMPORARY — 2026-09-02, remove after capturing one real response. Verifying the
        // real shape of roundstatsall (CS2_ANALYTICS_STANDARDS.md's "Game Coordinator match
        // resolution" section) before building against it — specifically whether a team
        // (CT/T) can be recovered per player, which the proto schema alone didn't confirm.
        try {
          const last = gcData.roundstatsall && gcData.roundstatsall.length > 0
            ? gcData.roundstatsall[gcData.roundstatsall.length - 1]
            : null;
          console.log(`🧪 [roundstatsall probe] ${dbMatchId} entries=${gcData.roundstatsall ? gcData.roundstatsall.length : 0}`);
          if (last) {
            console.log(`🧪 [roundstatsall probe] last entry keys: ${Object.keys(last).join(', ')}`);
            console.log(`🧪 [roundstatsall probe] kills=${JSON.stringify(last.kills)} assists=${JSON.stringify(last.assists)} deaths=${JSON.stringify(last.deaths)} mvps=${JSON.stringify(last.mvps)} enemy_headshots=${JSON.stringify(last.enemy_headshots)} scores=${JSON.stringify(last.scores)}`);
            console.log(`🧪 [roundstatsall probe] reservation keys: ${last.reservation ? Object.keys(last.reservation).join(', ') : 'none'}`);
            console.log(`🧪 [roundstatsall probe] account_ids=${JSON.stringify(last.reservation && last.reservation.account_ids)}`);
          }
        } catch (probeErr) {
          console.log(`🧪 [roundstatsall probe] failed: ${probeErr.message}`);
        }

        // Valve's GC repurposes the LAST round's "map" field to carry the demo download URL
        // instead of a map name (every other round's "map" is the real map name) — an
        // undocumented quirk, confirmed against Valve's own current protobuf schema (no
        // matchurl/url field exists anywhere in a real response) and a real, independent
        // open-source tool (claabs/cs-demo-downloader) doing this exact same GC lookup. See
        // CS2_ANALYTICS_STANDARDS.md's "Game Coordinator match resolution" section. Validated
        // with startsWith('http') so a genuine map name can never be mistaken for a URL.
        const lastRoundMap = gcData.roundstatsall && gcData.roundstatsall.length > 0
          ? gcData.roundstatsall[gcData.roundstatsall.length - 1].map
          : null;

        const directUrl =
          gcData.matchurl ||
          gcData.match_url ||
          gcData.url ||
          (gcData.watchablematchinfo && (gcData.watchablematchinfo.matchurl || gcData.watchablematchinfo.match_url)) ||
          (gcData.match && (gcData.match.matchurl || gcData.match.match_url)) ||
          (lastRoundMap && lastRoundMap.startsWith('http') ? lastRoundMap : null);

        if (directUrl) {
          // Strip the backoff-tracking fields before this telemetry gets persisted — they'd
          // otherwise ride along into every downstream stage (sync_pipeline.py spreads
          // existing_telemetry forward all the way to the final 'fully_parsed' row) and sit
          // in permanent storage forever, for every match that ever needed even one retry.
          const { resolve_attempts, next_retry_at, ...telemetryWithoutBackoffState } = telemetry;
          const updatedTelemetry = {
            ...telemetryWithoutBackoffState,
            match_id: matchIdCode ? matchIdCode.toString() : telemetry.match_id,
            outcome_id: outcomeId ? outcomeId.toString() : telemetry.outcome_id,
            token: token ? parseInt(token, 10) : telemetry.token,
            status: 'pending_download',
            download_url: directUrl,
            match_time: gcData.matchtime != null ? Number(gcData.matchtime) : (telemetry.match_time || null)
          };

          const { error: updateError } = await supabase
            .from('matches')
            .update({ match_data: { ...currentMatchData, telemetry: updatedTelemetry } })
            .eq('match_id', dbMatchId);

          if (updateError) {
            console.error(`❌ Failed to update Supabase for ${dbMatchId}:`, updateError.message);
          } else {
            console.log(`✅ Match ${dbMatchId} updated to 'pending_download'!`);
          }
        } else {
          console.warn(`⚠️ No direct URL found in GC response for ${dbMatchId}`);
          await persistBackoff(dbMatchId, currentMatchData, telemetry);
        }
      } catch (gcErr) {
        console.error(`❌ GC Resolution failed for match ${dbMatchId}:`, gcErr.message);
        await persistBackoff(dbMatchId, currentMatchData, telemetry);
      }
    }
  } catch (err) {
    console.error('❌ Polling error:', err.message);
  } finally {
    isProcessingMatches = false;
  }
}

const MAX_BACKOFF_MS = 5 * 60 * 1000; // never wait longer than 5 minutes between retries

// Called whenever a match fails to resolve (no URL found, or the GC request itself errored).
// Spaces out retries with exponential backoff instead of hammering the GC every 5s forever —
// a genuinely stuck match (expired code, GC has no data for it) would otherwise get hit up to
// ~34,000 times before watcher.py's 48h stuck-match cleanup ever removes it.
async function persistBackoff(dbMatchId, currentMatchData, telemetry) {
  const attempts = (telemetry.resolve_attempts || 0) + 1;
  const delayMs = Math.min(5000 * 2 ** attempts, MAX_BACKOFF_MS);
  const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

  const { error } = await supabase
    .from('matches')
    .update({
      match_data: {
        ...currentMatchData,
        telemetry: { ...telemetry, resolve_attempts: attempts, next_retry_at: nextRetryAt }
      }
    })
    .eq('match_id', dbMatchId);

  if (error) {
    console.error(`❌ Failed to persist backoff for ${dbMatchId}:`, error.message);
  } else {
    console.log(`⏳ ${dbMatchId}: attempt ${attempts} failed, retrying in ${Math.round(delayMs / 1000)}s`);
  }
}

function requestMatchUrl(matchId, outcomeId, token, shareCode) {
  return new Promise((resolve, reject) => {
    const handleMatchList = (matches) => {
      clearTimeout(timeout);
      csgo.removeListener('matchList', handleMatchList);
      if (matches && matches.length > 0) {
        resolve(matches[0]);
      } else {
        reject(new Error('Received empty match payload from GC.'));
      }
    };

    const timeout = setTimeout(() => {
      csgo.removeListener('matchList', handleMatchList);
      reject(new Error('GC Timeout after 10s - code may be expired or GC offline.'));
    }, 10000);

    csgo.once('matchList', handleMatchList);

    try {
      if (shareCode) {
        csgo.requestGame(shareCode);
      } else if (matchId && outcomeId && token) {
        csgo.requestGame({
          matchId: typeof matchId === 'bigint' ? matchId : BigInt(matchId),
          outcomeId: typeof outcomeId === 'bigint' ? outcomeId : BigInt(outcomeId),
          token: parseInt(token, 10)
        });
      } else {
        clearTimeout(timeout);
        csgo.removeListener('matchList', handleMatchList);
        reject(new Error('Missing valid shareCode or match details parameters.'));
      }
    } catch (err) {
      clearTimeout(timeout);
      csgo.removeListener('matchList', handleMatchList);
      reject(err);
    }
  });
}

function startPolling() {
  if (!pollingInterval) {
    pollingInterval = setInterval(processPendingMatches, 5000);
  }
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Initial Connection Kickoff
connectToSteam();
