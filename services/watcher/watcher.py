import os
import time
from datetime import datetime
from supabase import create_client
from sync_pipeline import process_and_parse_real_demo, sync_user_matches

MATCH_RETENTION_LIMIT = 30

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

def _match_sort_key(row):
    """Newest-first key: prefers the real Game Coordinator match_time, falls back
    to parsed_at for older matches that predate that field (mirrors the frontend's
    matchSortKey so 'most recent 30' means the same thing in both places)."""
    telemetry = (row.get("match_data") or {}).get("telemetry") or {}
    match_time = telemetry.get("match_time")
    if match_time:
        return float(match_time)
    parsed_at = row.get("parsed_at")
    if parsed_at:
        try:
            return datetime.fromisoformat(parsed_at).timestamp()
        except Exception:
            return 0.0
    return 0.0

def prune_old_matches():
    """Keeps only the MATCH_RETENTION_LIMIT most recent settled matches per user,
    deleting older ones to bound database storage as richer per-match data gets
    added later. Never touches matches still in flight (pending/downloading)."""
    try:
        users_res = supabase.table("users").select("steam_id64").execute()
        for user in users_res.data or []:
            steam_id = user.get("steam_id64")
            if not steam_id:
                continue

            matches_res = supabase.table("matches") \
                .select("match_id, match_data, parsed_at") \
                .eq("steam_id64", steam_id) \
                .execute()
            rows = matches_res.data or []

            settled = [
                r for r in rows
                if ((r.get("match_data") or {}).get("telemetry") or {}).get("status") in ("fully_parsed", "parse_failed")
            ]
            if len(settled) <= MATCH_RETENTION_LIMIT:
                continue

            settled.sort(key=_match_sort_key, reverse=True)
            to_delete = [r["match_id"] for r in settled[MATCH_RETENTION_LIMIT:]]

            if to_delete:
                supabase.table("matches").delete().in_("match_id", to_delete).execute()
                print(f"🗑️ Pruned {len(to_delete)} old match(es) for {steam_id}, keeping the most recent {MATCH_RETENTION_LIMIT}")
    except Exception as e:
        print(f"⚠️ Error pruning old matches: {e}")

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
    last_prune = 0
    API_CHECK_INTERVAL = 60
    PRUNE_INTERVAL = 300

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

        # Enforce the match-retention cap every 5 minutes
        if current_time - last_prune >= PRUNE_INTERVAL:
            prune_old_matches()
            last_prune = current_time

        process_pending_downloads()
        time.sleep(5)

if __name__ == "__main__":
    watch_queue()
