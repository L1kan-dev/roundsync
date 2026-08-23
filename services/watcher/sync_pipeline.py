import bz2
import os
import tempfile
import time
import requests
import pandas as pd
from demoparser2 import DemoParser
from crypto_utils import decrypt_value

# weptype codes confirmed empirically against a real match (see services/watcher/DEMOPARSER2_FIELDS.md)
WEAPON_CLASS_BY_WEPTYPE = {1: "pistol", 2: "smg", 3: "rifle", 4: "shotgun", 5: "sniper"}
WEAPON_CLASS_RANK = {"pistol": 0, "smg": 1, "shotgun": 1, "sniper": 2, "rifle": 2}


def classify_team_buy_capacity(start_balance: int, is_ct: bool) -> str:
    """Money-only classification (never spend) to avoid judging a buy decision using itself as the yardstick."""
    if start_balance < 2000:
        return "full_eco"
    full_buy_threshold = 5000 if is_ct else 4500
    if start_balance < full_buy_threshold:
        return "semi_eco"
    return "full_buy_capacity"


def classify_loadout_tier(weapon_class: str, had_armor: bool, team_buy_capacity: str) -> str:
    """The real eco/half-buy/force-buy/full-buy label, from what was actually bought."""
    if weapon_class in ("rifle", "sniper"):
        return "full_buy" if had_armor else "half_buy"
    if weapon_class in ("smg", "shotgun"):
        if not had_armor:
            return "force_buy"
        return "half_buy" if team_buy_capacity == "full_buy_capacity" else "force_buy"
    return "eco"


def extract_fact_economy(parser, target_steam_id64: str) -> list:
    """One row per round for target_steam_id64 only (see project memory for why not all 10 players)."""
    rows = []
    try:
        freeze_end_df = parser.parse_event("round_freeze_end")
        if freeze_end_df.empty:
            return rows
        freeze_ticks = sorted(freeze_end_df["tick"].tolist())

        snaps = parser.parse_ticks(
            ["start_balance", "cash_spent_this_round", "round_start_equip_value",
             "armor_value", "team_num", "ct_losing_streak", "t_losing_streak"],
            ticks=freeze_ticks,
        )
        snaps = snaps[snaps["steamid"].astype(str) == str(target_steam_id64)]

        equip_df = parser.parse_event("item_equip")
        equip_df = equip_df[equip_df["user_steamid"].astype(str) == str(target_steam_id64)]
        equip_df = equip_df[equip_df["weptype"].isin(WEAPON_CLASS_BY_WEPTYPE.keys())]

        prev_tick = 0
        for round_number, tick in enumerate(freeze_ticks, start=1):
            snap_row = snaps[snaps["tick"] == tick]
            if snap_row.empty:
                prev_tick = tick
                continue
            row = snap_row.iloc[0]

            team_num = int(row["team_num"])
            is_ct = team_num == 3
            team = "CT" if is_ct else "T"

            round_equips = equip_df[(equip_df["tick"] > prev_tick) & (equip_df["tick"] <= tick)]
            primary_weapon = None
            primary_weapon_class = "pistol"
            if not round_equips.empty:
                round_equips = round_equips.copy()
                round_equips["class_rank"] = round_equips["weptype"].map(
                    lambda w: WEAPON_CLASS_RANK[WEAPON_CLASS_BY_WEPTYPE[int(w)]]
                )
                best = round_equips.sort_values("class_rank", ascending=False).iloc[0]
                primary_weapon = best["item"]
                primary_weapon_class = WEAPON_CLASS_BY_WEPTYPE[int(best["weptype"])]

            had_armor = int(row["armor_value"]) > 0
            start_balance = int(row["start_balance"])
            cash_spent_this_round = int(row["cash_spent_this_round"])
            team_buy_capacity = classify_team_buy_capacity(start_balance, is_ct)
            if cash_spent_this_round == 0:
                # Nothing was actually bought this round (e.g. a carried-over weapon from a
                # won round auto-re-equips and fires an item_equip event) — labeling this as
                # an active eco/force/full-buy DECISION would be misleading, since no decision
                # was made. Still records what they were holding, just not the judgment label.
                loadout_tier = "carried_over"
            else:
                loadout_tier = classify_loadout_tier(primary_weapon_class, had_armor, team_buy_capacity)
            team_losing_streak = int(row["ct_losing_streak"] if is_ct else row["t_losing_streak"])

            rows.append({
                "round_number": round_number,
                "steam_id64": str(target_steam_id64),
                "team": team,
                "start_balance": start_balance,
                "cash_spent_this_round": cash_spent_this_round,
                "round_start_equip_value": int(row["round_start_equip_value"]),
                "primary_weapon": primary_weapon,
                "primary_weapon_class": primary_weapon_class,
                "had_armor": had_armor,
                "team_buy_capacity": team_buy_capacity,
                "loadout_tier": loadout_tier,
                "team_losing_streak": team_losing_streak,
            })
            prev_tick = tick
    except Exception as e:
        print(f"⚠️ Warning parsing fact_economy: {e}")
    return rows


# Standard CS2 matchmaking/Premier tick rate — used only to convert blind_duration
# (seconds) into a tick window for the flash-assist lookup. Not read from the demo
# itself (no explicit tick-rate field found in parse_header()'s output).
TICK_RATE = 64.0

GRENADE_DETONATE_EVENTS = {
    "flashbang_detonate": "flashbang",
    "hegrenade_detonate": "hegrenade",
    "decoy_started": "decoy",
    "smokegrenade_detonate": "smokegrenade",
}


def extract_fact_utility_throw(parser, target_steam_id64: str) -> list:
    """One row per grenade thrown by target_steam_id64 only (same scoping rule as fact_economy)."""
    rows = []
    target = str(target_steam_id64)
    try:
        freeze_end_df = parser.parse_event("round_freeze_end")
        freeze_ticks = sorted(freeze_end_df["tick"].tolist()) if not freeze_end_df.empty else []

        team_snap = parser.parse_ticks(["team_num"], ticks=freeze_ticks) if freeze_ticks else pd.DataFrame()

        def team_for(steamid, tick):
            candidates = [t for t in freeze_ticks if t <= tick]
            lookup_tick = max(candidates) if candidates else (freeze_ticks[0] if freeze_ticks else tick)
            sub = team_snap[(team_snap["tick"] == lookup_tick) & (team_snap["steamid"].astype(str) == str(steamid))]
            if sub.empty:
                return None
            return "CT" if int(sub.iloc[0]["team_num"]) == 3 else "T"

        def round_for(tick):
            return max(1, sum(1 for t in freeze_ticks if t <= tick))

        throws = []
        for event_name, label in GRENADE_DETONATE_EVENTS.items():
            try:
                df = parser.parse_event(event_name)
            except Exception:
                continue
            if df.empty or "user_steamid" not in df.columns:
                continue
            mine = df[df["user_steamid"].astype(str) == target]
            for _, r in mine.iterrows():
                throws.append({
                    "tick": int(r["tick"]), "type": label, "entityid": r.get("entityid"),
                    "x": r.get("x"), "y": r.get("y"), "z": r.get("z"),
                })

        # Molotov vs incendiary aren't distinguishable from inferno_startburn alone —
        # both grenades produce the same event. Disambiguate via the nearest preceding
        # weapon_fire by the same player (weapon_fire's `weapon` field does name the
        # exact grenade).
        try:
            inferno_df = parser.parse_event("inferno_startburn")
        except Exception:
            inferno_df = pd.DataFrame()
        try:
            fire_df = parser.parse_event("weapon_fire")
        except Exception:
            fire_df = pd.DataFrame()

        my_infernos = inferno_df[inferno_df["user_steamid"].astype(str) == target] if not inferno_df.empty else pd.DataFrame()
        my_fires = (
            fire_df[(fire_df["user_steamid"].astype(str) == target) & (fire_df["weapon"].astype(str).str.contains("molotov|incendiary|incgrenade", case=False, na=False))]
            if not fire_df.empty else pd.DataFrame()
        )
        for _, r in my_infernos.iterrows():
            tick = int(r["tick"])
            grenade_type = "molotov"
            if not my_fires.empty:
                preceding = my_fires[my_fires["tick"] <= tick]
                if not preceding.empty:
                    best = preceding.sort_values("tick").iloc[-1]
                    grenade_type = "incendiary" if "incendiary" in str(best["weapon"]).lower() or "incgrenade" in str(best["weapon"]).lower() else "molotov"
            throws.append({
                "tick": tick, "type": grenade_type, "entityid": r.get("entityid"),
                "x": r.get("x"), "y": r.get("y"), "z": r.get("z"),
            })

        try:
            blind_df = parser.parse_event("player_blind")
        except Exception:
            blind_df = pd.DataFrame()
        try:
            hurt_df = parser.parse_event("player_hurt")
        except Exception:
            hurt_df = pd.DataFrame()
        try:
            death_df = parser.parse_event("player_death")
        except Exception:
            death_df = pd.DataFrame()
        try:
            inferno_expire_df = parser.parse_event("inferno_expire")
        except Exception:
            inferno_expire_df = pd.DataFrame()

        for t in throws:
            round_number = round_for(t["tick"])
            enemies_blinded = None
            teammates_blinded = None
            total_enemy_blind_duration = None
            flash_assist = None
            damage_dealt = None

            if t["type"] == "flashbang" and not blind_df.empty and t["entityid"] is not None:
                matched = blind_df[blind_df["entityid"] == t["entityid"]]
                thrower_team = team_for(target, t["tick"])
                enemies_blinded, teammates_blinded, total_enemy_blind_duration = 0, 0, 0.0
                flash_assist = False
                for _, b in matched.iterrows():
                    victim = str(b["user_steamid"])
                    duration = float(b["blind_duration"])
                    if team_for(victim, t["tick"]) == thrower_team:
                        teammates_blinded += 1
                        continue
                    enemies_blinded += 1
                    total_enemy_blind_duration += duration
                    if not death_df.empty:
                        window_end = b["tick"] + duration * TICK_RATE
                        kills_on_victim = death_df[
                            (death_df["user_steamid"].astype(str) == victim)
                            & (death_df["tick"] >= b["tick"]) & (death_df["tick"] <= window_end)
                        ]
                        for _, k in kills_on_victim.iterrows():
                            killer = str(k["attacker_steamid"])
                            if killer != target and team_for(killer, t["tick"]) == thrower_team:
                                flash_assist = True

            elif t["type"] in ("hegrenade", "molotov", "incendiary") and not hurt_df.empty:
                keywords = {"hegrenade": "hegrenade", "molotov": "molotov|inferno", "incendiary": "incendiary|inferno"}[t["type"]]
                window_start, window_end = t["tick"], t["tick"] + int(TICK_RATE * 10)
                if t["type"] in ("molotov", "incendiary") and not inferno_expire_df.empty and t["entityid"] is not None:
                    exp = inferno_expire_df[inferno_expire_df["entityid"] == t["entityid"]]
                    if not exp.empty:
                        window_end = int(exp.iloc[0]["tick"])
                relevant = hurt_df[
                    (hurt_df["attacker_steamid"].astype(str) == target)
                    & (hurt_df["tick"] >= window_start) & (hurt_df["tick"] <= window_end)
                    & (hurt_df["weapon"].astype(str).str.contains(keywords, case=False, na=False))
                ]
                damage_dealt = int(relevant["dmg_health"].sum()) if not relevant.empty else 0

            rows.append({
                "round_number": round_number,
                "steam_id64": target,
                "throw_tick": t["tick"],
                "grenade_type": t["type"],
                "land_x": float(t["x"]) if t["x"] is not None and not pd.isna(t["x"]) else None,
                "land_y": float(t["y"]) if t["y"] is not None and not pd.isna(t["y"]) else None,
                "land_z": float(t["z"]) if t["z"] is not None and not pd.isna(t["z"]) else None,
                "enemies_blinded": enemies_blinded,
                "teammates_blinded": teammates_blinded,
                "total_enemy_blind_duration": total_enemy_blind_duration,
                "flash_assist": flash_assist,
                "damage_dealt": damage_dealt,
            })
    except Exception as e:
        print(f"⚠️ Warning parsing fact_utility_throw: {e}")
    return rows


# How far ahead of a trigger we sample the player's view/position, and how big a
# change counts as "started reacting" — a first-pass convention (see project memory),
# not a measured constant. Revisit once real match data can calibrate it.
ADAPTATION_SAMPLE_OFFSETS_SEC = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
YAW_CHANGE_THRESHOLD_DEG = 30.0
MOVE_DISTANCE_THRESHOLD_UNITS = 50.0


def _angle_diff(a: float, b: float) -> float:
    """Signed shortest distance between two angles in degrees, handling the -180/180 wraparound."""
    return (a - b + 180) % 360 - 180


def extract_fact_adaptation_event(parser, target_steam_id64: str) -> list:
    """One row per teammate-death or bomb-plant trigger for target_steam_id64 only (same
    scoping rule as fact_economy/fact_utility_throw). Bomb-plant "opposite site" filtering is
    NOT applied here — distance_to_plant_units is stored as a raw fact and thresholded later,
    same facts-vs-rules split as reaction_time_seconds itself."""
    rows = []
    target = str(target_steam_id64)
    try:
        freeze_end_df = parser.parse_event("round_freeze_end")
        freeze_ticks = sorted(freeze_end_df["tick"].tolist()) if not freeze_end_df.empty else []

        def round_for(tick):
            return max(1, sum(1 for t in freeze_ticks if t <= tick))

        team_snap = parser.parse_ticks(["team_num"], ticks=freeze_ticks) if freeze_ticks else pd.DataFrame()

        def team_for(steamid, tick):
            candidates = [t for t in freeze_ticks if t <= tick]
            lookup_tick = max(candidates) if candidates else (freeze_ticks[0] if freeze_ticks else tick)
            sub = team_snap[(team_snap["tick"] == lookup_tick) & (team_snap["steamid"].astype(str) == str(steamid))]
            return None if sub.empty else ("CT" if int(sub.iloc[0]["team_num"]) == 3 else "T")

        death_df = parser.parse_event("player_death")
        if death_df.empty or "user_steamid" not in death_df.columns:
            return rows

        target_death_ticks = sorted(death_df[death_df["user_steamid"].astype(str) == target]["tick"].tolist())

        def target_alive_at(tick):
            rnd = round_for(tick)
            deaths_this_round = [t for t in target_death_ticks if round_for(t) == rnd]
            return not any(dt <= tick for dt in deaths_this_round)

        player_rank_new, player_rank_type_id = None, None
        try:
            rank_df = parser.parse_event("rank_update")
            mine = rank_df[rank_df["user_steamid"].astype(str) == target] if not rank_df.empty else pd.DataFrame()
            if not mine.empty:
                last = mine.sort_values("tick").iloc[-1]
                player_rank_new = int(last["rank_new"]) if pd.notna(last["rank_new"]) else None
                player_rank_type_id = int(last["rank_type_id"]) if pd.notna(last["rank_type_id"]) else None
        except Exception:
            pass

        triggers = []  # each: (trigger_type, trigger_tick, extra_fields_dict)
        for _, d in death_df.iterrows():
            victim = str(d["user_steamid"])
            if victim == target:
                continue
            tick = int(d["tick"])
            if team_for(victim, tick) is None or team_for(victim, tick) != team_for(target, tick):
                continue
            if not target_alive_at(tick):
                continue
            triggers.append(("teammate_death", tick, {"teammate_steamid": victim}))

        try:
            plant_df = parser.parse_event("bomb_planted")
        except Exception:
            plant_df = pd.DataFrame()
        if not plant_df.empty and "user_steamid" in plant_df.columns:
            planter_ticks = sorted(int(t) for t in plant_df["tick"].tolist())
            planter_pos_df = parser.parse_ticks(["X", "Y"], ticks=planter_ticks)
            for _, p in plant_df.iterrows():
                planter = str(p["user_steamid"])
                tick = int(p["tick"])
                if planter == target or not target_alive_at(tick):
                    continue
                planter_row = planter_pos_df[
                    (planter_pos_df["tick"] == tick) & (planter_pos_df["steamid"].astype(str) == planter)
                ]
                if planter_row.empty:
                    continue
                triggers.append(("bomb_plant", tick, {
                    "bomb_site": str(p["site"]),
                    "_planter_x": float(planter_row.iloc[0]["X"]),
                    "_planter_y": float(planter_row.iloc[0]["Y"]),
                }))

        if not triggers:
            return rows

        sample_ticks_needed = {
            tick + int(off * TICK_RATE)
            for _, tick, _ in triggers
            for off in ADAPTATION_SAMPLE_OFFSETS_SEC
        }
        pos_df = parser.parse_ticks(["X", "Y", "Z", "yaw"], ticks=sorted(sample_ticks_needed))
        pos_df = pos_df[pos_df["steamid"].astype(str) == target]

        def sample_at(tick):
            sub = pos_df[pos_df["tick"] == tick]
            return None if sub.empty else sub.iloc[0]

        for trigger_type, trigger_tick, extra in triggers:
            baseline = sample_at(trigger_tick)
            if baseline is None:
                continue

            reaction_time_seconds, reaction_type = None, None
            for off in ADAPTATION_SAMPLE_OFFSETS_SEC[1:]:
                probe = sample_at(trigger_tick + int(off * TICK_RATE))
                if probe is None:
                    continue
                turned = abs(_angle_diff(float(probe["yaw"]), float(baseline["yaw"]))) >= YAW_CHANGE_THRESHOLD_DEG
                moved = ((float(probe["X"]) - float(baseline["X"])) ** 2
                         + (float(probe["Y"]) - float(baseline["Y"])) ** 2) ** 0.5 >= MOVE_DISTANCE_THRESHOLD_UNITS
                if turned or moved:
                    reaction_time_seconds = off
                    reaction_type = "both" if turned and moved else ("view_turn" if turned else "movement")
                    break

            distance_to_plant_units = None
            if trigger_type == "bomb_plant":
                distance_to_plant_units = ((float(baseline["X"]) - extra["_planter_x"]) ** 2
                                            + (float(baseline["Y"]) - extra["_planter_y"]) ** 2) ** 0.5

            rows.append({
                "round_number": round_for(trigger_tick),
                "steam_id64": target,
                "trigger_type": trigger_type,
                "trigger_tick": trigger_tick,
                "teammate_steamid": extra.get("teammate_steamid"),
                "bomb_site": extra.get("bomb_site"),
                "distance_to_plant_units": distance_to_plant_units,
                "player_x": float(baseline["X"]),
                "player_y": float(baseline["Y"]),
                "player_z": float(baseline["Z"]),
                "player_yaw": float(baseline["yaw"]),
                "reaction_time_seconds": reaction_time_seconds,
                "reaction_type": reaction_type,
                "player_rank_new": player_rank_new,
                "player_rank_type_id": player_rank_type_id,
            })
    except Exception as e:
        print(f"⚠️ Warning parsing fact_adaptation_event: {e}")
    return rows


def get_single_match_info(steam_id64: str, auth_code: str, match_code: str, retries: int = 3) -> dict:
    """Queries Valve API using VALVE_API_KEY or STEAM_API_KEY from env to validate a match code."""
    api_key = os.getenv("VALVE_API_KEY") or os.getenv("STEAM_API_KEY")
    if not api_key:
        print("⚠️ VALVE_API_KEY / STEAM_API_KEY environment variable missing!")
        return {"is_valid": False, "next_code": "n/a"}

    # Decrypt auth code if it's encrypted
    raw_auth_code = decrypt_value(auth_code)

    url = "https://api.steampowered.com/ICSGOPlayers_730/GetNextMatchSharingCode/v1/"
    params = {
        "key": api_key,
        "steamid": steam_id64,
        "steamidkey": raw_auth_code,
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
                return {"is_valid": True, "next_code": "n/a"}
            elif response.status_code == 412:
                print("Valve API returned 412: Precondition Failed (Invalid code or expired key).")
                return {"is_valid": False, "next_code": "n/a"}
            else:
                time.sleep(1)
        except requests.RequestException as e:
            print(f"Request exception encountered: {e}")
            time.sleep(1)

    return {"is_valid": False, "next_code": "n/a"}

def process_single_demo(supabase_client, steam_id64: str, auth_code: str, match_code: str):
    """Registers a new match code so the GC worker can fetch its URL."""
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

def process_and_parse_real_demo(supabase_client, match_code: str, cdn_url: str, target_steam_id64: str, existing_telemetry: dict = None):
    """Downloads the real demo from Valve's CDN, parses it with demoparser2, and updates Supabase."""
    temp_dir = tempfile.gettempdir()
    bz2_path = os.path.join(temp_dir, f"{match_code}.dem.bz2")
    dem_path = os.path.join(temp_dir, f"{match_code}.dem")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    start_time = time.time()
    try:
        supabase_client.table("matches").update({
            "match_data": {
                "match_id": match_code,
                "telemetry": {
                    **(existing_telemetry or {}),
                    "match_id": match_code,
                    "match_url": cdn_url,
                    "status": "downloading",
                    "started_at": start_time
                }
            }
        }).eq("match_id", match_code).execute()
    except Exception as e:
        print(f"⚠️ Failed to mark match as downloading: {e}")

    try:
        download_success = False
        max_retries = 3

        for attempt in range(1, max_retries + 1):
            try:
                print(f"Streaming replay from CDN (Attempt {attempt}/{max_retries})...")
                res = requests.get(cdn_url, headers=headers, stream=True, timeout=30)
                if res.status_code == 200:
                    with open(bz2_path, "wb") as f:
                        for chunk in res.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                f.write(chunk)
                    download_success = True
                    break
            except Exception as dl_err:
                print(f"⚠️ Download attempt {attempt} failed: {dl_err}")
                time.sleep(2)

        if not download_success or not os.path.exists(bz2_path):
            raise Exception("Failed to download demo archive from CDN after retries.")

        # Decompress BZ2
        with bz2.BZ2File(bz2_path, "rb") as source, open(dem_path, "wb") as dest:
            for data in iter(lambda: source.read(1024 * 1024), b""):
                dest.write(data)

        # Parse with demoparser2
        parser = DemoParser(dem_path)

        map_name = None
        try:
            header = parser.parse_header()
            map_name = header.get("map_name")
        except Exception as e:
            print(f"⚠️ Warning parsing header: {e}")

        total_kills = 0
        total_deaths = 0
        headshots = 0
        rounds_played = 0

        try:
            deaths_df = parser.parse_event("player_death", other=["total_rounds_played"])
            if not deaths_df.empty:
                if "attacker_steamid" in deaths_df.columns:
                    user_kills = deaths_df[deaths_df["attacker_steamid"].astype(str) == str(target_steam_id64)]
                    total_kills = len(user_kills)
                    if "headshot" in user_kills.columns:
                        headshots = len(user_kills[user_kills["headshot"] == True])
                if "user_steamid" in deaths_df.columns:
                    user_deaths = deaths_df[deaths_df["user_steamid"].astype(str) == str(target_steam_id64)]
                    total_deaths = len(user_deaths)
                if "total_rounds_played" in deaths_df.columns:
                    rounds_played = int(deaths_df["total_rounds_played"].max())
        except Exception as e:
            print(f"⚠️ Warning parsing deaths: {e}")

        total_damage = 0.0
        try:
            hurt_df = parser.parse_event("player_hurt")
            if not hurt_df.empty and "attacker_steamid" in hurt_df.columns and "dmg_health" in hurt_df.columns:
                user_damage = hurt_df[hurt_df["attacker_steamid"].astype(str) == str(target_steam_id64)]
                total_damage = float(user_damage["dmg_health"].sum())
        except Exception as e:
            print(f"⚠️ Warning parsing damage: {e}")

        calculated_kd = round(total_kills / max(1, total_deaths), 2)
        headshot_pct = round((headshots / max(1, total_kills)) * 100, 1) if total_kills > 0 else 0.0
        calculated_adr = round(total_damage / max(1, rounds_played), 1) if rounds_played > 0 else 0.0

        fact_economy_rows = extract_fact_economy(parser, target_steam_id64)
        if fact_economy_rows:
            try:
                for r in fact_economy_rows:
                    r["match_id"] = match_code
                supabase_client.table("fact_economy").upsert(
                    fact_economy_rows, on_conflict="match_id,round_number,steam_id64"
                ).execute()
                print(f"✅ Saved {len(fact_economy_rows)} fact_economy rows for {match_code}")
            except Exception as e:
                print(f"⚠️ Failed to save fact_economy: {e}")

        fact_utility_rows = extract_fact_utility_throw(parser, target_steam_id64)
        if fact_utility_rows:
            try:
                for r in fact_utility_rows:
                    r["match_id"] = match_code
                supabase_client.table("fact_utility_throw").upsert(
                    fact_utility_rows, on_conflict="match_id,round_number,steam_id64,throw_tick"
                ).execute()
                print(f"✅ Saved {len(fact_utility_rows)} fact_utility_throw rows for {match_code}")
            except Exception as e:
                print(f"⚠️ Failed to save fact_utility_throw: {e}")

        fact_adaptation_rows = extract_fact_adaptation_event(parser, target_steam_id64)
        if fact_adaptation_rows:
            try:
                for r in fact_adaptation_rows:
                    r["match_id"] = match_code
                supabase_client.table("fact_adaptation_event").upsert(
                    fact_adaptation_rows, on_conflict="match_id,round_number,steam_id64,trigger_type,trigger_tick"
                ).execute()
                print(f"✅ Saved {len(fact_adaptation_rows)} fact_adaptation_event rows for {match_code}")
            except Exception as e:
                print(f"⚠️ Failed to save fact_adaptation_event: {e}")

        real_payload = {
            "match_id": match_code,
            "telemetry": {
                **(existing_telemetry or {}),
                "match_id": match_code,
                "match_url": cdn_url,
                "status": "fully_parsed",
                "map": map_name,
                "kd_ratio": calculated_kd,
                "adr": calculated_adr,
                "kills": total_kills,
                "deaths": total_deaths,
                "headshot_pct": headshot_pct,
                "total_damage": total_damage,
                "headshots": headshots,
                "rounds_played": rounds_played,
                "processing_seconds": round(time.time() - start_time, 1)
            }
        }

        supabase_client.table("matches").update({
            "match_data": real_payload
        }).eq("match_id", match_code).execute()

        print(f"✅ Successfully saved telemetry for match {match_code}!")

    except Exception as e:
        print(f"Error processing real demo: {e}")
        try:
            error_payload = {
                "match_id": match_code,
                "telemetry": {
                    **(existing_telemetry or {}),
                    "match_id": match_code,
                    "match_url": cdn_url,
                    "status": "parse_failed",
                    "error": str(e)
                }
            }
            supabase_client.table("matches").update({
                "match_data": error_payload
            }).eq("match_id", match_code).execute()
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
