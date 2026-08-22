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
      .select('match_id, match_data, created_at')
      .eq('steam_id64', steamId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ matches: matches || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch match history.' });
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

    res.json({ onboarded: Boolean(userRow?.game_auth_code) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// 4. AI Coaching Chat Endpoint (Gemini Integration)
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
    // Fetch player's parsed match telemetry
    const { data: matches } = await supabase
      .from('matches')
      .select('match_data')
      .eq('steam_id64', steamId)
      .limit(10);

    const contextPayload = JSON.stringify(matches || []);

    const prompt = `
    You are RoundSync, an expert, direct, and tactical Counter-Strike 2 AI coach.
    Here is the player's recent match history data cached from their games:
    ${contextPayload}
    
    Player's Question / Request: ${question}
    
    Provide sharp, data-driven, actionable feedback to help them improve their gameplay, aim, or tactical awareness. Keep your response concise and focused.
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
      matches_context_count: matches ? matches.length : 0
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
