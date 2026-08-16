import bz2
import json
import os
import tempfile
import time
from demoparser2 import DemoParser
import requests
import streamlit as st
from supabase import create_client


def get_match_demo_url(
    steam_id64: str, auth_code: str, match_code: str
) -> str:
  """Queries Valve API to resolve the .dem.bz2 download URL, automatically following nextcode chains."""
  api_key = st.secrets["STEAM_API_KEY"]
  url = "https://api.steampowered.com/ICSGOPlayers_730/GetNextMatchSharingCode/v1/"

  current_code = match_code
  max_chain_depth = 5

  for attempt in range(max_chain_depth):
    params = {
        "key": api_key,
        "steamid": steam_id64,
        "steamidkey": auth_code,
        "knowncode": current_code,
    }

    response = requests.get(url, params=params)
    print(f"DEBUG [Attempt {attempt + 1}] Status Code: {response.status_code}")

    if response.status_code != 200:
      raise Exception(
          f"Valve API request failed (HTTP {response.status_code}): {response.text}"
      )

    data = response.json()
    print(f"DEBUG [Attempt {attempt + 1}] Payload: {data}")

    result = data.get("result", {})
    match_url = result.get("matchurl")

    if match_url:
      return match_url

    next_code = result.get("nextcode")
    if next_code and next_code != "n/a" and next_code != current_code:
      print(f"Auto-following match chain: {current_code} -> {next_code}")
      current_code = next_code
    else:
      break

  raise Exception(
      f"Could not retrieve demo URL from Valve API for `{match_code}`. "
      "Replays usually take 5–15 minutes post-match to generate on Valve's CDN."
  )


def process_and_sync_matches(
    supabase_client,
    steam_id64: str,
    auth_code: str,
    match_code: str,
    progress_callback=None,
):
  """Fetches match download URL, streams download with real-time stats callback, parses, and pushes to Supabase."""
  # 1. Resolve demo download URL
  if match_code.startswith("http://") or match_code.startswith("https://"):
    print("Direct CDN URL detected. Skipping Valve API lookup...")
    demo_url = match_code
    match_id = (
        match_code.split("/")[-1].replace(".dem.bz2", "").replace(".dem", "")
    )
  else:
    print(f"Resolving demo URL for match {match_code} via Valve API...")
    demo_url = get_match_demo_url(steam_id64, auth_code, match_code)
    match_id = match_code

  temp_dir = tempfile.gettempdir()
  bz2_path = os.path.join(temp_dir, f"{match_id}.dem.bz2")
  dem_path = os.path.join(temp_dir, f"{match_id}.dem")

  try:
    # 2. Ephemeral Streamed Download with Metrics
    print("Downloading compressed replay from Valve CDN...")
    dl_response = requests.get(demo_url, stream=True)
    if dl_response.status_code != 200:
      raise Exception(
          f"Failed to download demo from CDN. Status: {dl_response.status_code}"
      )

    total_length = dl_response.headers.get("content-length")
    total_bytes = int(total_length) if total_length else None

    downloaded_bytes = 0
    start_time = time.time()
    chunk_size = 65536  # 64KB chunks for smooth UI updates

    with open(bz2_path, "wb") as f:
      for chunk in dl_response.iter_content(chunk_size=chunk_size):
        if chunk:
          f.write(chunk)
          downloaded_bytes += len(chunk)
          elapsed_time = time.time() - start_time

          if progress_callback:
            progress_callback(
                downloaded_bytes, total_bytes, elapsed_time, "downloading"
            )

    # 3. Decompress .bz2 -> .dem
    if progress_callback:
      progress_callback(downloaded_bytes, total_bytes, 0, "decompressing")

    print("Decompressing .dem.bz2 replay file...")
    with bz2.open(bz2_path, "rb") as source, open(dem_path, "wb") as target:
      while chunk := source.read(1024 * 1024):
        target.write(chunk)

    # 4. Tick-Level Parsing using demoparser2
    if progress_callback:
      progress_callback(downloaded_bytes, total_bytes, 0, "parsing")

    print(f"Parsing match {match_id} ticks...")
    parser = DemoParser(dem_path)

    deaths_df = parser.parse_event("player_death")
    shots_df = parser.parse_event("weapon_fire")

    # Clean NaN values into standard JSON-compliant nulls
    sample_deaths = []
    if deaths_df is not None and not deaths_df.empty:
      sample_deaths = json.loads(deaths_df.head(25).to_json(orient="records"))

    match_payload = {
        "match_id": match_id,
        "total_deaths": len(deaths_df) if deaths_df is not None else 0,
        "total_shots": len(shots_df) if shots_df is not None else 0,
        "sample_deaths": sample_deaths,
    }

    # 5. Upsert to Supabase
    if progress_callback:
      progress_callback(downloaded_bytes, total_bytes, 0, "saving")

    print(f"Caching telemetry for {match_id} into Supabase...")
    supabase_client.table("matches").upsert({
        "match_id": match_id,
        "steam_id64": steam_id64,
        "match_data": match_payload,
    }).execute()

    print(f"Match {match_id} successfully processed!")

  finally:
    # 6. Instant Cleanup
    for p in [bz2_path, dem_path]:
      if os.path.exists(p):
        os.remove(p)
        print(f"Cleaned up temporary file: {p}")


if __name__ == "__main__":
  SUPABASE_URL = os.getenv("SUPABASE_URL")
  SUPABASE_KEY = os.getenv("SUPABASE_KEY")
  if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)