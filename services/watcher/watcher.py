import os
import time
from supabase import create_client
from sync_pipeline import process_and_parse_real_demo, sync_user_matches

def init_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY env variables.")
    return create_client(url, key)

supabase = init_supabase()

def update_heartbeat():
    """Writes heartbeat to service_health table for monitoring."""
    try:
        supabase.table("service_health").upsert({
            "service_name": "watcher",
            "status": "healthy",
            "last_activity": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }, on_conflict="service_name").execute()
    except Exception as e:
        # Don't crash watcher if health check table is not created yet
        pass

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
    """Finds pending matches and hands off download URL to demoparser2 pipeline."""
    try:
        response = supabase.table('matches') \
            .select('match_id', 'steam_id64', 'match_data') \
            .contains('match_data', {'telemetry': {'status': 'pending_download'}}) \
            .limit(10) \
            .execute()

        if response.data:
            for row in response.data:
                match_id = row['match_id']
                steam_id = row['steam_id64']
                match_data = row.get('match_data') or {}
                telemetry = match_data.get('telemetry') or {}
                match_url = telemetry.get('download_url') or telemetry.get('match_url')

                if match_url:
                    print(f"Found ready match: {match_id}. Starting download pipeline...")
                    process_and_parse_real_demo(supabase, match_id, match_url, steam_id, existing_telemetry=telemetry)
                    print(f"✅ Successfully processed match: {match_id}")
                    break
    except Exception as e:
        print(f"⚠️ Queue worker error: {e}")

def watch_queue():
    print("🚀 Standalone Python Watcher microservice running...")
    last_api_check = 0
    last_heartbeat = 0
    API_CHECK_INTERVAL = 60

    while True:
        current_time = time.time()

        # Heartbeat every 5 minutes
        if current_time - last_heartbeat >= 300:
            update_heartbeat()
            last_heartbeat = current_time

        # Poll Valve API every 60s
        if current_time - last_api_check >= API_CHECK_INTERVAL:
            check_for_new_valve_matches()
            last_api_check = current_time

        process_pending_downloads()
        time.sleep(5)

if __name__ == "__main__":
    watch_queue()
