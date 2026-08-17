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
    """Finds pending matches and hands off the download URL to the parsing pipeline."""
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
            
            if not match_url:
                print(f"⚠️ Match {match_id} is missing a download URL. Skipping for now.")
                return

            print(f"Found ready match: {match_id}. Starting download pipeline...")
            
            # Pass the URL string directly into the pipeline parser
            process_and_parse_real_demo(supabase, match_id, match_url, steam_id)
            print(f"✅ Successfully processed match: {match_id}")
            
    except Exception as e:
        print(f"⚠️ Queue worker error: {e}")

def watch_queue():
    print("🚀 Python background watcher running in 100% automated mode...")
    last_api_check = 0
    API_CHECK_INTERVAL = 60  # Polls Valve API every 60 seconds

    while True:
        current_time = time.time()

        if current_time - last_api_check >= API_CHECK_INTERVAL:
            check_for_new_valve_matches()
            last_api_check = current_time

        process_pending_downloads()
        time.sleep(5)

if __name__ == "__main__":
    watch_queue()