import bz2
import os
import tempfile
import time
import requests
import streamlit as st
import pandas as pd
from demoparser2 import DemoParser
from urllib3.exceptions import IncompleteRead


def get_single_match_info(steam_id64: str, auth_code: str, match_code: str, retries: int = 3) -> dict:
    """Queries Valve API to validate a match code and fetch the next sequential code."""
    api_key = st.secrets["STEAM_API_KEY"]
    url = "https://api.steampowered.com/ICSGOPlayers_730/GetNextMatchSharingCode/v1/"
    
    params = {
        "key": api_key,
        "steamid": steam_id64,
        "steamidkey": auth_code,
        "knowncode": match_code,
    }

    for attempt in range(retries):
        try:
            response = requests.get(url, params=params, timeout=8)
            
            if response.status_code == 200:
                data = response.json()
                result = data.get("result", {})
                return {
                    "is_valid": True,
                    "next_code": result.get("nextcode", "n/a")
                }
            elif response.status_code == 202:
                return {
                    "is_valid": True,
                    "next_code": "n/a"
                }
            elif response.status_code == 412:
                print("Valve API returned 412: Precondition Failed (Invalid code or expired key).")
                return {"is_valid": False, "next_code": "n/a"}
            else:
                time.sleep(1)
        except requests.RequestException as e:
            print(f"Request exception encountered: {e}")
            time.sleep(1)

    return {"is_valid": False, "next_code": "n/a"}


def get_match_download_url(steam_id64: str, auth_code: str, match_code: str) -> str:
    """Note: Valve's web API does not support direct HTTP demo downloads via share codes. 
    Demos require Steam Game Coordinator client connection."""
    return None


def process_single_demo(supabase_client, steam_id64: str, auth_code: str, match_code: str):
    """Registers a new match code so the Node.js worker can fetch its URL."""
    print(f"Registering match code for background URL resolution: {match_code}")
    
    initial_payload = {
        "match_id": match_code,
        "telemetry": {
            "match_id": match_code,
            "match_url": None,
            "status": "pending_url"
        }
    }

    supabase_client.table("matches").upsert({
        "match_id": match_code,
        "steam_id64": steam_id64,
        "match_data": initial_payload
    }, on_conflict="match_id").execute()
    
    print(f"Match {match_code} staged as pending_url successfully!")


def process_and_parse_real_demo(supabase_client, match_code: str, cdn_url: str, target_steam_id64: str):
    """Downloads the real demo from Valve's CDN, parses it with demoparser2, and updates Supabase."""
    temp_dir = tempfile.gettempdir()
    bz2_path = os.path.join(temp_dir, f"{match_code}.dem.bz2")
    dem_path = os.path.join(temp_dir, f"{match_code}.dem")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        download_success = False
        max_retries = 3

        for attempt in range(1, max_retries + 1):
            try:
                print(f"Streaming match replay from official Valve CDN (Attempt {attempt}/{max_retries})...")
                response = requests.get(cdn_url, headers=headers, stream=True, timeout=30)
                response.raise_for_status()

                with open(bz2_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=1024 * 1024): 
                        if chunk:
                            f.write(chunk)
                
                download_success = True
                print("Replay file downloaded successfully!")
                break

            except (requests.exceptions.RequestException, IncompleteRead, Exception) as download_err:
                print(f"⚠️ Download attempt {attempt} failed: {download_err}")
                if attempt < max_retries:
                    time.sleep(3)

        if not download_success:
            raise RuntimeError(f"Failed to download demo after {max_retries} attempts.")

        print(f"Decompressing BZ2 archive...")
        with bz2.BZ2File(bz2_path, "rb") as source, open(dem_path, "wb") as dest:
            for data in iter(lambda: source.read(512 * 1024), b""):
                dest.write(data)

        print(f"Parsing raw demo telemetry using demoparser2...")
        parser = DemoParser(dem_path)

        total_kills = 0
        total_deaths = 0
        headshots = 0

        try:
            deaths_df = parser.parse_event("player_death")
            if not deaths_df.empty:
                if "attacker_steamid" in deaths_df.columns:
                    user_kills = deaths_df[deaths_df["attacker_steamid"].astype(str) == str(target_steam_id64)]
                    total_kills = len(user_kills)
                    if "headshot" in user_kills.columns:
                        headshots = int(user_kills["headshot"].sum())

                if "user_steamid" in deaths_df.columns:
                    user_deaths = deaths_df[deaths_df["user_steamid"].astype(str) == str(target_steam_id64)]
                    total_deaths = len(user_deaths)
        except Exception as event_err:
            print(f"⚠️ Warning parsing deaths: {event_err}")

        total_damage = 0.0
        try:
            hurt_df = parser.parse_event("player_hurt")
            if not hurt_df.empty and "attacker_steamid" in hurt_df.columns and "dmg_health" in hurt_df.columns:
                user_damage = hurt_df[hurt_df["attacker_steamid"].astype(str) == str(target_steam_id64)]
                total_damage = float(user_damage["dmg_health"].sum())
        except Exception as hurt_err:
            print(f"⚠️ Warning parsing damage: {hurt_err}")

        calculated_kd = round(total_kills / max(1, total_deaths), 2)
        headshot_pct = round((headshots / max(1, total_kills)) * 100, 1) if total_kills > 0 else 0.0
        calculated_adr = round(total_damage / 24, 1)

        real_payload = {
            "match_id": match_code,
            "telemetry": {
                "match_id": match_code,
                "match_url": cdn_url,
                "status": "fully_parsed",
                "kd_ratio": calculated_kd,
                "adr": calculated_adr,
                "kills": total_kills,
                "deaths": total_deaths,
                "headshot_pct": headshot_pct,
                "flashes_thrown": 0,
                "smokes_thrown": 0
            }
        }

        supabase_client.table("matches").update({
            "match_data": real_payload
        }).eq("match_id", match_code).execute()
        
        print(f"Successfully saved real parsed telemetry for match {match_code}!")

    except Exception as e:
        print(f"Error processing real demo: {e}")
        try:
            error_payload = {
                "match_id": match_code,
                "telemetry": {
                    "match_id": match_code,
                    "match_url": cdn_url,
                    "status": "parse_failed",
                    "error": str(e)
                }
            }
            supabase_client.table("matches").update({
                "match_data": error_payload
            }).eq("match_id", match_code).execute()
            print(f"Marked match {match_code} as 'parse_failed' in Supabase.")
        except Exception as db_err:
            print(f"Failed to update error status in Supabase: {db_err}")

    finally:
        if os.path.exists(bz2_path):
            os.remove(bz2_path)
        if os.path.exists(dem_path):
            os.remove(dem_path)


def sync_user_matches(steam_id64: str, auth_code: str, start_code: str, supabase) -> int:
    """Loops forward through Valve's API chain starting from start_code."""
    active_code = start_code
    synced_count = 0

    while active_code and active_code != "n/a":
        match_info = get_single_match_info(steam_id64, auth_code, active_code)
        is_valid = match_info.get("is_valid")
        next_code = match_info.get("next_code")

        if not is_valid:
            break

        existing = supabase.table("matches").select("match_id").eq("match_id", active_code).execute()
        if not existing.data:
            process_single_demo(supabase, steam_id64, auth_code, active_code)
            synced_count += 1

        supabase.table("users").update({
            "last_known_code": active_code
        }).eq("steam_id64", steam_id64).execute()

        if next_code and next_code != "n/a" and next_code != active_code:
            active_code = next_code
            time.sleep(1)
        else:
            break

    return synced_count