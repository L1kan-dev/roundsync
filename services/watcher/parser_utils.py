from demoparser2 import DemoParser
import pandas as pd

def parse_demo_telemetry(dem_file_path: str, player_steam_id: str) -> dict:
    """
    Parses a .dem replay file and extracts deep telemetry metrics 
    filtered for a specific player's SteamID64.
    """
    parser = DemoParser(dem_file_path)
    
    # Wrap event outputs in pd.DataFrame to prevent 'list' attribute errors
    deaths_df = pd.DataFrame(parser.parse_event("player_death"))
    hurt_df = pd.DataFrame(parser.parse_event("player_hurt"))
    weapon_fires_df = pd.DataFrame(parser.parse_event("weapon_fire"))
    round_ends_df = pd.DataFrame(parser.parse_event("round_end"))

    target_id = str(player_steam_id)

    # 1. Kills & Headshots Calculation
    user_kills = 0
    headshot_kills = 0
    if not deaths_df.empty and "attacker_steamid" in deaths_df.columns:
        kills_df = deaths_df[deaths_df["attacker_steamid"].astype(str) == target_id]
        user_kills = len(kills_df)
        if "headshot" in kills_df.columns:
            headshot_kills = len(kills_df[kills_df["headshot"] == True])

    # 2. Deaths Calculation
    user_deaths = 0
    if not deaths_df.empty and "user_steamid" in deaths_df.columns:
        user_deaths = len(deaths_df[deaths_df["user_steamid"].astype(str) == target_id])

    # 3. Total Damage Dealt Calculation
    total_damage = 0
    if not hurt_df.empty and "attacker_steamid" in hurt_df.columns and "dmg_health" in hurt_df.columns:
        player_hurt_df = hurt_df[hurt_df["attacker_steamid"].astype(str) == target_id]
        total_damage = int(player_hurt_df["dmg_health"].sum())

    # 4. Shots Fired & Utility Usage Count
    shots_fired = 0
    flashes_thrown = 0
    smokes_thrown = 0
    if not weapon_fires_df.empty and "user_steamid" in weapon_fires_df.columns and "weapon" in weapon_fires_df.columns:
        player_fires = weapon_fires_df[weapon_fires_df["user_steamid"].astype(str) == target_id]
        shots_fired = len(player_fires)
        flashes_thrown = len(player_fires[player_fires["weapon"] == "weapon_flashbang"])
        smokes_thrown = len(player_fires[player_fires["weapon"] == "weapon_smokegrenade"])

    # 5. Total Rounds
    total_rounds = len(round_ends_df) if not round_ends_df.empty else 0

    # 6. Calculated Metrics
    headshot_pct = round((headshot_kills / user_kills * 100), 1) if user_kills > 0 else 0.0
    adr = round(total_damage / total_rounds, 1) if total_rounds > 0 else 0.0
    kd_ratio = round(user_kills / max(1, user_deaths), 2)

    return {
        "kills": user_kills,
        "deaths": user_deaths,
        "kd_ratio": kd_ratio,
        "headshots": headshot_kills,
        "headshot_pct": headshot_pct,
        "total_damage": total_damage,
        "adr": adr,
        "shots_fired": shots_fired,
        "flashes_thrown": flashes_thrown,
        "smokes_thrown": smokes_thrown,
        "total_rounds": total_rounds
    }