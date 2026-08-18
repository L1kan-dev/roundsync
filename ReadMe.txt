# RoundSync 🎯 Automated CS2 AI Coach

**Version**: 1.0 (MVP - Local Development)  
**Status**: Active Development  
**Last Updated**: 2026-08-18

---

## Overview

RoundSync is a **hybrid local-cloud Counter-Strike 2 AI coaching platform** that automatically ingests match replays, extracts tick-level telemetry, and delivers personalized tactical feedback via Google Gemini 3.5 Flash.

The system works as a **three-part pipeline**:
1. **Frontend** (Streamlit) — Web UI for authentication, dashboard, and coaching
2. **Watcher** (Python) — Polls Valve API, downloads demos, parses telemetry
3. **GC Worker** (Node.js) — Maintains Steam connection, resolves match URLs
4. **Database** (Supabase) — Stores users, matches, and coaching history

---

## Key Features

✅ **Automatic Match Discovery** — Polls Valve API every 60 seconds for new matches  
✅ **Tick-Level Telemetry Extraction** — Parses `player_death`, `player_hurt` events with demoparser2  
✅ **Database Caching** — Stores K/D, ADR, headshot% to prevent re-parsing  
✅ **Steam Integration** — Auto-resolves match share codes via Game Coordinator  
✅ **AI Coaching** — Context-aware tactical advice powered by Gemini 3.5 Flash  
✅ **Zero Infrastructure Overhead** — Runs locally, zero cloud costs initially  

---

## Tech Stack

**Frontend:**
- Streamlit (Python web framework)
- Pandas (data visualization)
- Streamlit session state

**Background Workers:**
- Python 3.11+ (Watcher service)
- Node.js 20+ (GC Worker service)
- demoparser2 (CS2 demo parsing)
- steam-user + node-cs2 (Steam integration)

**Database & APIs:**
- Supabase PostgreSQL (cloud database)
- Google Gemini 3.5 Flash (AI coaching)
- Valve Match API (match discovery)
- Valve Demo CDN (replay downloads)
- Steam Game Coordinator (URL resolution)

---

## Getting Started

### Prerequisites

✓ **Windows 10/11** (or adjust paths for macOS/Linux)  
✓ **Python 3.9+** installed globally  
✓ **Node.js 20+** installed globally  
✓ **Git** (for version control)  
✓ **Valve Steam Account** with CS2 library and recent matches  
✓ **Steam Bot Account** (separate account for GC Worker)  

### API Keys Required

Obtain these free keys before starting:

1. **Valve Steam API Key**
   - Get at: https://steamcommunity.com/dev/apikey
   - Requires Steam account with CS2 license

2. **Google Gemini API Key**
   - Get at: https://console.cloud.google.com/apis/credentials
   - Enable: Generative Language API
   - Free tier: 15 requests/min

3. **Supabase PostgreSQL**
   - Create at: https://supabase.com
   - Free tier: 500MB storage, automatic backups

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/RoundSync.git
   cd RoundSync
   ```

2. **Create Python virtual environment:**
   ```bash
   python -m venv venv
   venv\Scripts\Activate.ps1  # Windows PowerShell
   # or: source venv/bin/activate  # macOS/Linux
   ```

3. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Install Node.js dependencies:**
   ```bash
   cd roundsync-node-worker
   npm install
   cd ..
   ```

5. **Create `.env` file** in project root:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   STEAM_API_KEY=your-steam-api-key
   STEAM_USERNAME=your-bot-steam-account
   STEAM_PASSWORD=your-bot-steam-password
   GEMINI_API_KEY=your-gemini-api-key
   ```

   ⚠️ **Never commit `.env` file** (already in `.gitignore`)

6. **Verify setup:**
   ```bash
   python -c "from supabase import create_client; print('✅ Supabase OK')"
   node -e "console.log('✅ Node.js OK')"
   ```

---

## Running the Application

### Quick Start (3 Terminals Required)

**Terminal 1: Start Streamlit Frontend**
```bash
streamlit run app.py
# Opens: http://localhost:8501 in browser
```

**Terminal 2: Start Python Watcher**
```bash
python watcher.py
# Polls Valve API every 60s, downloads & parses demos
```

**Terminal 3: Start Node.js GC Worker**
```bash
cd roundsync-node-worker
node index.js
# Maintains Steam connection, resolves match URLs
```

**Expected Output:**

Terminal 1:
```
Local URL: http://localhost:8501
Network URL: http://192.168.1.X:8501  (local only)
```

Terminal 2:
```
🚀 Python background watcher running in 100% automated mode...
✨ Auto-discovered 2 new match(es)!
✅ Successfully saved real parsed telemetry!
```

Terminal 3:
```
✅ Logged into Steam successfully
🎮 Connected to CS2 Game Coordinator
✅ Match ... updated to 'pending_download'!
```

---

## First Time User Flow

1. **Start all 3 terminals** (see above)
2. **Open browser**: http://localhost:8501
3. **Click "Sign in with Steam"** (Steam OpenID flow)
4. **Enter Game Auth Code + Match Share Code** (one-time setup)
   - Find code: CS2 → watch your latest replay → "Share Code" button
5. **Click "Verify & Activate Auto-Sync"**
6. **Wait 60 seconds** for Watcher to discover new matches
7. **Check Watcher terminal** for "Discovered X new matches"
8. **Refresh browser** to see parsed matches in dashboard
9. **Ask AI Coach** questions about your gameplay

---

## Project Structure

```
RoundSync/
├── app.py                              # Streamlit frontend (1000+ lines)
├── watcher.py                          # Match discovery loop (100 lines)
├── sync_pipeline.py                    # Demo download/parse (300 lines)
├── ai_coach.py                         # Gemini integration (50 lines)
├── steam_auth.py                       # Steam OpenID auth (150 lines)
├── parser_utils.py                     # Demo parsing helpers (100 lines)
│
├── roundsync-node-worker/
│   ├── index.js                        # GC Worker (300 lines)
│   ├── package.json
│   └── node_modules/
│
├── venv/                               # Python virtual environment
├── requirements.txt                    # Python dependencies
├── .env                                # ⚠️ Secrets (DO NOT COMMIT)
├── .gitignore                          # Excludes .env
│
├── CURRENT_ARCHITECTURE.md             # Current system design (detailed)
├── CURRENT_SOP.md                      # Current operations guide (detailed)
├── ARCHITECTURE.md                     # Recommended production system
├── SOP.md                              # Production operations guide
└── ReadMe.txt                          # This file
```

---

## Architecture at a Glance

```
┌────────────────────────────────────────────┐
│        Your Local Windows PC               │
├────────────────────────────────────────────┤
│  Terminal 1: Streamlit App (UI)            │ → http://localhost:8501
│  Terminal 2: Python Watcher (polling)      │ → Valve API polling
│  Terminal 3: Node.js GC Worker (Steam)     │ → Steam GC connection
└────────────────────────────────────────────┘
                      ↓↑
        ┌─────────────────────────────┐
        │  Supabase (Cloud Database)  │
        └─────────────────────────────┘
                      ↓↑
        ┌─────────────────────────────┐
        │   Google Gemini API         │
        │  (AI Coaching)              │
        └─────────────────────────────┘
```

For detailed architecture, see: **[CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md)**

---

## Common Tasks

### View Recent Matches
1. Start Streamlit (`streamlit run app.py`)
2. Navigate to "📊 Stats Dashboard" tab
3. See: Matches, K/D ratio, ADR, headshot%

### Ask AI Coach a Question
1. Navigate to "🤖 AI Coach Chat" tab
2. Type: "Why is my ADR dropping?" or "How to improve positioning?"
3. Gemini responds with tactical advice based on your match history

### Reset All Data
1. Dashboard tab → Click "🚨 Reset Account & Clear Data"
2. Confirms deletion of all your matches
3. You can sign back in to restart

### Check Watcher Logs
- Terminal 2 shows all match discovery/parsing events
- Look for: ✅ success, ⚠️ warnings, 🔴 errors

### Troubleshooting
See: **[CURRENT_SOP.md](CURRENT_SOP.md)** → "Common Issues & Solutions"

---

## Monitoring & Health Checks

**All 3 processes running?**
```bash
# Terminal 1: Streamlit loading?
# Browser: http://localhost:8501 responsive?

# Terminal 2: "Auto-discovered" or "Successfully parsed" messages?
# (Expect every 1-5 minutes if you have recent matches)

# Terminal 3: "Connected to CS2 Game Coordinator" message?
# (Should appear within 10 seconds of startup)
```

**Database connected?**
- Streamlit dashboard loads → Supabase ✅
- No "Database error" → Connection OK ✅

**Matches being parsed?**
- Check Terminal 2 logs for "✅ Successfully saved real parsed telemetry"
- Check Streamlit dashboard for new matches

---

## Limitations (Current MVP)

⚠️ **Single-user only** (Streamlit limitation, not scalable)  
⚠️ **Requires PC always on** (no cloud hosting yet)  
⚠️ **Manual restart on crash** (no auto-recovery)  
⚠️ **Local only** (not accessible from other devices)  
⚠️ **Security gaps** (auth codes plaintext, no RLS)  
⚠️ **No persistent logs** (console output only)  

**Production roadmap**: See **[ARCHITECTURE.md](ARCHITECTURE.md)** for cloud deployment (Next.js + Railway)

---

## Performance Expectations

| Operation | Time | Notes |
|---|---|---|
| **Match discovery** | ~2 sec | Every 60s, checks Valve API |
| **Demo download** | 10-30 sec | Streams from CDN, depends on file size |
| **Parsing demo** | 10-30 sec | Extracts telemetry with demoparser2 |
| **Coaching response** | 2-5 sec | Gemini API call (network latency) |
| **Dashboard load** | <1 sec | Reads cached telemetry from Supabase |

**Memory usage:**
- Streamlit: ~150MB
- Watcher: 100-200MB (spikes during parsing)
- GC Worker: ~80MB
- **Total**: ~400MB

---

## Troubleshooting Quick Links

| Issue | Solution |
|---|---|
| Streamlit won't load | Restart Terminal 1: `Ctrl+C` → `streamlit run app.py` |
| No matches discovered | Check Valve auth code expired (re-enter in Streamlit) |
| GC Worker disconnects | Restart Terminal 3: `Ctrl+C` → `node index.js` |
| Demo parsing fails | Check file size, restart Watcher (Terminal 2) |
| Coaching not working | Verify GEMINI_API_KEY in `.env`, check internet |

**Detailed guide**: **[CURRENT_SOP.md](CURRENT_SOP.md)** → "Troubleshooting Guide"

---

## Security & Privacy

⚠️ **Current MVP Security Model:**
- Game auth codes stored in plaintext (Supabase)
- No database row-level security (RLS)
- Local-only (no internet exposure)
- HTTPS to all external APIs (Valve, Gemini, Supabase)

**Production improvements** (in ARCHITECTURE.md):
- Encrypted auth codes (Fernet cipher)
- Row-level security (Supabase RLS)
- Managed secrets vault (Railway)
- Regular security audits

---

## Cost Breakdown

| Service | Cost | Notes |
|---|---|---|
| **Streamlit** | $0 | Local, no hosting |
| **Supabase** | $0-5/month | Free tier: 500MB, hourly backups |
| **Gemini API** | $0-2/month | Free tier: 15 req/min, ~1 req per user question |
| **Steam API** | $0 | Free (rate limited by Valve) |
| **Your PC** | Electricity | Already have it |
| **Total MVP** | **$0-7/month** | | 

**Production costs** (when scaling to cloud): $50-500/month

---

## Next Steps

### Short Term (This Week)
1. ✅ Get all 3 processes running locally
2. ✅ Verify Supabase connection
3. ✅ Test end-to-end (play match → sync → parse → coach)

### Medium Term (Next Month)
1. 🔄 Improve telemetry extraction (add grenade tracking)
2. 🔄 Enhance coaching prompts (more tactical depth)
3. 🔄 Add data visualization (charts, heatmaps)

### Long Term (Scale)
1. 📈 Migrate to production architecture (Next.js + Railway)
2. 📈 Enable multi-user support
3. 📈 Deploy as always-on cloud service
4. 📈 Implement premium features (team analytics, coaches)

See: **[ARCHITECTURE.md](ARCHITECTURE.md)** for detailed production roadmap

---

## Documentation

- **[CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md)** — Detailed system design (as-is)
- **[CURRENT_SOP.md](CURRENT_SOP.md)** — Operations guide for current setup
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Recommended production architecture
- **[SOP.md](SOP.md)** — Production deployment & operations guide

---

## Support & Issues

**For bugs:**
1. Check Terminal 2/3 logs for error messages
2. Restart the offending process
3. See **[CURRENT_SOP.md](CURRENT_SOP.md)** "Troubleshooting" section

**For features:**
- Improve `ai_coach.py` for better coaching prompts
- Enhance `sync_pipeline.py` for more telemetry extraction
- Update `app.py` for better UI/UX

**For deployment:**
- See **[ARCHITECTURE.md](ARCHITECTURE.md)** for cloud migration

---

## License

[Your chosen license, e.g., MIT]

---

## Contact

**Author**: [Your name/team]  
**Email**: [Your email]  
**GitHub**: [Your GitHub]  
**Last Updated**: 2026-08-18