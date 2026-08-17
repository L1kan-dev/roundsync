import SteamUser from 'steam-user';
import GlobalOffensive from 'node-cs2';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const csgoSharecode = require('csgo-sharecode');
const decodeMatch = csgoSharecode.decodeMatchShareCode || csgoSharecode.decode || csgoSharecode;

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/\/+$/, '') : '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const STEAM_USERNAME = process.env.STEAM_USERNAME;
const STEAM_PASSWORD = process.env.STEAM_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const user = new SteamUser();
const csgo = new GlobalOffensive(user);

let isGcReady = false;

// Steam & GC Authentication Lifecycle
user.logOn({
  accountName: STEAM_USERNAME,
  password: STEAM_PASSWORD
});

user.on('loggedOn', () => {
  console.log('✅ Logged into Steam successfully. Requesting CS2 license...');
  user.requestFreeLicense([730], (err) => {
    if (err) {
      console.warn('⚠️ License check note:', err.message);
    } else {
      console.log('🎮 CS2 license active. Launching game...');
    }
    user.gamesPlayed([730]);
  });
});

csgo.on('connectedToGC', () => {
  console.log('🎮 Connected to CS2 Game Coordinator.');
  isGcReady = true;
  startPolling();
});

csgo.on('disconnectedFromGC', (reason) => {
  console.warn('⚠️ Disconnected from Game Coordinator:', reason);
  isGcReady = false;
});

// Match Resolution Logic
async function processPendingMatches() {
  if (!isGcReady) return;

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
      
      // FIXED: Use dbMatchId as the shareCode fallback since match_id contains the share code string
      const shareCode = telemetry.share_code || currentMatchData.shareCode || dbMatchId;
      const matchIdCode = telemetry.match_id;
      const outcomeId = telemetry.outcome_id;
      const token = telemetry.token;

      console.log(`🔍 Resolving match: ${dbMatchId} (Code: ${shareCode || matchIdCode})`);

      try {
        const gcData = await requestMatchUrl(matchIdCode, outcomeId, token, shareCode);
        
        // Log raw object safely handling BigInts
        console.log('📦 GC Raw Response Payload:\n', JSON.stringify(gcData, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

        // Extract demo download URL across all known CS2 Protobuf fields
        const directUrl = 
          gcData.matchurl || 
          gcData.match_url || 
          gcData.url || 
          (gcData.watchablematchinfo && (gcData.watchablematchinfo.matchurl || gcData.watchablematchinfo.match_url)) ||
          (gcData.roundstatsall && gcData.roundstatsall.length > 0 && gcData.roundstatsall[gcData.roundstatsall.length - 1].map) ||
          (gcData.match && (gcData.match.matchurl || gcData.match.match_url));

        if (directUrl) {
          const updatedTelemetry = {
            ...telemetry,
            match_id: matchIdCode ? matchIdCode.toString() : telemetry.match_id,
            outcome_id: outcomeId ? outcomeId.toString() : telemetry.outcome_id,
            token: token ? parseInt(token, 10) : telemetry.token,
            status: 'pending_download',
            download_url: directUrl
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
  }
}

function requestMatchUrl(matchId, outcomeId, token, shareCode) {
  return new Promise((resolve, reject) => {
    // 1. Listen for Valve GC response event
    const handleMatchList = (matches) => {
      clearTimeout(timeout);
      csgo.removeListener('matchList', handleMatchList);
      if (matches && matches.length > 0) {
        resolve(matches[0]);
      } else {
        reject(new Error('Received empty match payload from GC.'));
      }
    };

    // 2. Safety timeout
    const timeout = setTimeout(() => {
      csgo.removeListener('matchList', handleMatchList);
      reject(new Error('GC Timeout after 10s - code may be expired or GC offline.'));
    }, 10000);

    // 3. Attach event listener BEFORE sending request
    csgo.once('matchList', handleMatchList);

    // 4. Send request (node-cs2 accepts raw shareCode string OR parameters object)
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
  setInterval(processPendingMatches, 5000);
}