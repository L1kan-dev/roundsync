import time
import requests
import streamlit as st
from supabase import create_client
from sync_pipeline import process_and_parse_real_demo, sync_user_matches

def init_supabase():
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets.get("SUPABASE_SERVICE_ROLE_KEY") or st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

supabase = init_supabase()

def download_valve_replay_with_retry(url: str, max_retries=4, delay=120) -> bytes:
    """Streams a demo replay, waiting for Valve's CDN to stabilize (~5-10 min total window)."""
    for attempt in range(1, max_retries + 1):
        try:
            print(f"Streaming match replay from official Valve CDN (Attempt {attempt}/{max_retries})...")
            response = requests.get(url, timeout=30)
            if response.status_code == 200:
                return response.content
            print(f"⚠️ Download attempt {attempt} failed: {response.status_code} Server Error: Bad Gateway")
        except Exception as e:
            print(f"⚠️ Download attempt {attempt} failed with exception: {e}")
        
        if attempt < max_retries:
            print(f"Waiting {delay} seconds for Valve CDN to stabilize...")
            time.sleep(delay)
            delay *= 2  # Scales: 2 mins -> 4 mins -> 8 mins
            
    raise Exception("Failed to download demo after maximum retry attempts.")

def check_for_new_valve_matches():
    """Loops through registered users and queries Valve's API for new matches."""
    try:
        users_res = supabase.table("users").select("steam_id64, game_auth_code, last_known_code").execute()
        if users_res.data:
            for user in users_res.data:
                steam_id = user.get("steam_id64")
                auth_code = user.get("game_auth_code")
                last_code = user.get("last_known_code")

                if steam_id and auth_code and last_code:
                    print(f"🔄 Auto-checking Valve API for new matches (User: {steam_id})...")
                    new_matches = sync_user_matches(
                        steam_id64=steam_id,
                        auth_code=auth_code,
                        start_code=last_code,
                        supabase=supabase
                    )
                    if new_matches > 0:
                        print(f"✨ Auto-discovered {new_matches} new match(es)!")
    except Exception as e:
        print(f"⚠️ Error auto-checking Valve API: {e}")

def process_pending_downloads():
    """Downloads and parses matches ready in the queue."""
    try:
        response = supabase.table('matches') \
            .select('match_id', 'steam_id64', 'match_data') \
            .eq('match_data->telemetry->>status', 'pending_download') \
            .limit(1) \
            .execute()
        
        if response.data:
            row = response.data[0]
            match_id = row['match_id']
            steam_id = row['steam_id64']
            
            telemetry = row['match_data']['telemetry']
            match_url = telemetry.get('download_url') or telemetry.get('match_url')
            
            print(f"Found ready match: {match_id}. Starting download and parse sequence...")
            
            # If your pipeline downloads inside process_and_parse_real_demo, 
            # ensure it utilizes the retry mechanism above.
            process_and_parse_real_demo(supabase, match_id, match_url, steam_id)
            
    except Exception as e:
        print(f"⚠️ Queue worker error: {e}")

def watch_queue():
    print("🚀 Python background watcher running in 100% automated mode...")
    last_api_check = 0
    API_CHECK_INTERVAL = 60  # Polls Valve API every 60 seconds

    while True:
        current_time = time.time()

        # 1. Automatically check Valve API for newly completed matches every 60s
        if current_time - last_api_check >= API_CHECK_INTERVAL:
            check_for_new_valve_matches()
            last_api_check = current_time

        # 2. Check download queue every 5s for ready demos
        process_pending_downloads()

        time.sleep(5)

if __name__ == "__main__":
    watch_queue()