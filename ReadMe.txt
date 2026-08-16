# RoundSync 🎯 Automated CS2 AI Coach

RoundSync is a web application that ingests Counter-Strike 2 match replays, parses tick-level telemetry using `demoparser2`, stores game data in Supabase, and delivers data-driven tactical feedback via Google Gemini 3.5 Flash.

---

## Key Features

* **Flexible Match Ingestion:** Supports direct Steam CDN replay URLs (`.dem.bz2`) as well as Valve Match Share Codes.
* **Live Ingestion Progress:** Real-time download progress bar displaying download speed (MB/s), elapsed time, file size, and processing stages (downloading, decompressing, parsing).
* **Tick-Level Telemetry Parsing:** Extracts detailed combat events (`player_death`, `weapon_fire`) and sanitizes data for database storage.
* **Database Caching:** Stores structured JSON telemetry payloads per player in Supabase PostgreSQL to prevent redundant demo parsing.
* **AI Coach:** Context-aware chat assistant powered by **Gemini 3.5 Flash** that analyzes your stored match history to provide actionable tactical advice.

---

## Tech Stack

* **Frontend Framework:** Streamlit
* **Database:** Supabase (PostgreSQL)
* **Demo Parsing:** `demoparser2`
* **AI Model:** Google Gemini 3.5 Flash (`google-genai`)
* **Core Language:** Python 3.10+

---

## Getting Started

### Prerequisites

* Python 3.10 or higher installed.
* A Steam Web API key.
* A Google Gemini API key.
* A Supabase project with a `matches` table.

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/RoundSync.git](https://github.com/your-username/RoundSync.git)
   cd RoundSync