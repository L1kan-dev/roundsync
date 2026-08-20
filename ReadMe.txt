# RoundSync — Automated CS2 AI Coach

**Status**: Active Development
**Last Updated**: 2026-08-20

---

## Overview

RoundSync is a Counter-Strike 2 AI coaching platform. It automatically watches for your finished matches, downloads and analyzes the replay file, and gives you personalized tactical feedback through Google Gemini.

The system is split into four small services that each do one job:

1. **frontend** (Next.js) — the website you actually see and click around in
2. **services/api** (Express, Node.js) — the "front desk": handles logins and all requests from the website, talks to the database
3. **services/watcher** (Python) — checks Valve's servers for your new matches, downloads the replay, and extracts stats from it
4. **services/gc-worker** (Node.js) — stays connected to Steam's game servers so match replay links can be looked up
5. **Supabase** (PostgreSQL database) — stores users, matches, and coaching history in the cloud

---

## Tech Stack

- **frontend**: Next.js 14, React, Tailwind CSS, Recharts
- **services/api**: Node.js, Express, jsonwebtoken (login sessions), Supabase client
- **services/watcher**: Python, demoparser2 (reads CS2 replay files), cryptography
- **services/gc-worker**: Node.js, steam-user (talks to Steam)
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini API

---

## Running It Locally

The easiest way is Docker Compose, which starts all four services together.

### 1. Create your `.env` file

In the project root, create a file named `.env` with:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
JWT_SECRET=a-long-random-string-you-generate
ENCRYPTION_KEY=a-long-random-string-you-generate
VALVE_API_KEY=your-steam-web-api-key
STEAM_USERNAME=your-bot-steam-account
STEAM_PASSWORD=your-bot-steam-password
```

⚠️ Never commit this file — it's already excluded in both `.gitignore` and `.claudeignore`.

### 2. Also create `frontend/.env.local`

The frontend needs its own copy of one shared secret, since it runs in a separate process:

```
JWT_SECRET=same-value-as-above
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Start everything

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:3001

### Running services individually (without Docker)

```bash
# API gateway
cd services/api && npm install && npm start

# Frontend
cd frontend && npm install && npm run dev

# Watcher (needs Python 3.11+ and a virtual environment)
cd services/watcher && pip install -r requirements.txt && python watcher.py

# GC Worker
cd services/gc-worker && npm install && node index.js
```

---

## API Keys Required

1. **Valve Steam Web API Key** — https://steamcommunity.com/dev/apikey (needs a Steam account with a CS2 license)
2. **Google Gemini API Key** — https://console.cloud.google.com/apis/credentials (enable the Generative Language API)
3. **Supabase project** — https://supabase.com (free tier is enough to start)
4. **A Steam bot account** — a *separate* Steam account (not your main one) used only by the GC Worker to stay connected to Steam's servers

---

## Project Structure

```
RoundSync/
├── frontend/              # Next.js website
│   └── app/
│       ├── page.tsx       # Main UI (dashboard, login, AI coach chat)
│       └── api/auth/steam/route.ts   # Handles the Steam login callback
├── services/
│   ├── api/               # Express API gateway (server.js)
│   ├── watcher/           # Python match-discovery + parsing loop
│   └── gc-worker/         # Node.js Steam connection worker
├── docker-compose.yml     # Runs all four services together, for local dev
├── railway.json           # Deployment config for Railway (cloud hosting)
└── .env                   # Secrets (never committed)
```

---

## Security Notes

- Steam login is verified server-side against Steam's OpenID service before any session is issued (fixed 2026-08-20).
- ⚠️ **Known gap**: the game auth code you enter during setup is currently saved to the database in plain text — encryption code exists in `services/watcher/crypto_utils.py` but isn't wired into the save path yet. Don't treat this code as safe from database exposure until that's fixed.

---

## Deployment

Cloud hosting is via **Railway**, using `railway.json`, which maps each of the four services to its own folder. Each service also has its own `Dockerfile`.
