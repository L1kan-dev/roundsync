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

      console.log(`🔍 Resolving match: ${dbMatchId} (Code: ${shareCode || matchIdCode})`);

      try {
        const gcData = await requestMatchUrl(matchIdCode, outcomeId, token, shareCode);

        console.log(`📦 Successfully retrieved GC match details for ${dbMatchId}`);

        // Note: roundstatsall[i].map is the MAP NAME (e.g. "de_mirage"), not a URL — confirmed
        // via the real protobuf schema audit (see project docs). A fallback here that read
        // from it would silently store a map name as a "download URL", failing confusingly
        // later instead of at the source — removed rather than left in as a broken fallback.
        const directUrl =
          gcData.matchurl ||
          gcData.match_url ||
          gcData.url ||
          (gcData.watchablematchinfo && (gcData.watchablematchinfo.matchurl || gcData.watchablematchinfo.match_url)) ||
          (gcData.match && (gcData.match.matchurl || gcData.match.match_url));

        if (directUrl) {
          const updatedTelemetry = {
            ...telemetry,
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
        }
      } catch (gcErr) {
        console.error(`❌ GC Resolution failed for match ${dbMatchId}:`, gcErr.message);
      }
    }
  } catch (err) {
    console.error('❌ Polling error:', err.message);
  } finally {
    isProcessingMatches = false;
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
