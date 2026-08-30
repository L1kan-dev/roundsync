import bz2
import math
import os
import re
import tempfile
import time
import requests
import pandas as pd
from demoparser2 import DemoParser
from crypto_utils import decrypt_value

# weptype codes confirmed empirically against a real match (see services/watcher/DEMOPARSER2_FIELDS.md)
WEAPON_CLASS_BY_WEPTYPE = {1: "pistol", 2: "smg", 3: "rifle", 4: "shotgun", 5: "sniper"}
WEAPON_CLASS_RANK = {"pistol": 0, "smg": 1, "shotgun": 1, "sniper": 2, "rifle": 2}

# player_death/player_hurt's own `weapon` field, keyed by name substring rather than exact
# match — the same defensive pattern NON_GUN_WEAPON_KEYWORDS already uses elsewhere in this
# file, since different demoparser2 events format the weapon string differently (weapon_fire's
# own example is "weapon_smokegrenade", prefixed; fact_economy's real production data confirmed
# item_equip's names are NOT prefixed — "ak47", "awp", "hkp2000", etc, per a live query against
# fact_economy.primary_weapon). Names confirmed real via DEMOPARSER2_FIELDS.md's weptype table.
WEAPON_CLASS_KEYWORDS = {
    "sniper": "awp|ssg08|scar20|g3sg1",
    "shotgun": "nova|xm1014|mag7|sawedoff",
    "smg": "mac10|mp9|mp7|mp5|ump45|p90|bizon",
    "rifle": "ak47|m4a1|m4a4|famas|galil|aug|sg55",
    "pistol": "glock|usp|hkp2000|p250|fiveseven|five-seven|tec9|cz75|deagle|elite|revolver",
}


def _classify_weapon_by_name(weapon) -> str | None:
    w = str(weapon).lower()
    for weapon_class, pattern in WEAPON_CLASS_KEYWORDS.items():
        if re.search(pattern, w):
            return weapon_class
    return None


def parse_event(parser, event_name, **kwargs):
    """parser.parse_event() returns a plain [] (not an empty DataFrame) for an event type
    that never fires in a given demo (e.g. no decoys thrown all match) — every call site in
    this file immediately checks `.empty`, which crashes on a list and previously took down
    the entire extraction function for that match, silently losing every already-computed row.
    Centralizing the call here normalizes that return value once instead of at every site."""
    result = parser.parse_event(event_name, **kwargs)
    if not isinstance(result, pd.DataFrame):
        return pd.DataFrame()
    return result


def capped_damage_sum(hurt_rows) -> float:
    """Sum a set of player_hurt rows' dmg_health, capping each individual hit at 100 first —
    a single hit can't deal more than a player's full health, but the raw field sometimes
    reports a value above that. Centralized here since every site that sums damage needs the
    same cap; previously duplicated at 3 separate call sites, which is how the ADR damage-cap
    bug (see NEXT_STEPS.md) went unfixed in 2 of the 3 for as long as it did."""
    if hurt_rows.empty:
        return 0.0
    return float(hurt_rows["dmg_health"].clip(upper=100).sum())


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


def extract_fact_economy(parser, target_steam_id64: str, freeze_ticks: list) -> list:
    """One row per round for target_steam_id64 only (see project memory for why not all 10 players).
    freeze_ticks (from round_freeze_end) is parsed once by the caller and shared across every
    extract_fact_* function instead of each one re-parsing it independently (Tier 9)."""
    rows = []
    try:
        if not freeze_ticks:
            return rows

        snaps = parser.parse_ticks(
            ["start_balance", "cash_spent_this_round", "round_start_equip_value",
             "armor_value", "team_num", "ct_losing_streak", "t_losing_streak"],
            ticks=freeze_ticks,
        )
        snaps = snaps[snaps["steamid"].astype(str) == str(target_steam_id64)]

        equip_df = parse_event(parser, "item_equip")
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

# HLTV's minimum blind duration for a flash to count toward a "flash assist" kill
# (hltv.org/news/34796) — below this, the victim wasn't meaningfully impaired.
FLASH_ASSIST_MIN_BLIND_SECONDS = 1.1

GRENADE_DETONATE_EVENTS = {
    "flashbang_detonate": "flashbang",
    "hegrenade_detonate": "hegrenade",
    "decoy_started": "decoy",
    "smokegrenade_detonate": "smokegrenade",
}


def extract_fact_utility_throw(parser, target_steam_id64: str, freeze_ticks: list, fire_df, hurt_df, death_df) -> list:
    """One row per grenade thrown by target_steam_id64 only (same scoping rule as fact_economy).
    freeze_ticks/fire_df/hurt_df/death_df are parsed once by the caller and shared across every
    extract_fact_* function instead of each one re-parsing it independently (Tier 9)."""
    rows = []
    target = str(target_steam_id64)
    try:
        team_snap = parser.parse_ticks(["team_num"], ticks=freeze_ticks) if freeze_ticks else pd.DataFrame()

        throws = []
        for event_name, label in GRENADE_DETONATE_EVENTS.items():
            try:
                df = parse_event(parser, event_name)
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
            inferno_df = parse_event(parser, "inferno_startburn")
        except Exception:
            inferno_df = pd.DataFrame()

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
            blind_df = parse_event(parser, "player_blind")
        except Exception:
            blind_df = pd.DataFrame()
        try:
            inferno_expire_df = parse_event(parser, "inferno_expire")
        except Exception:
            inferno_expire_df = pd.DataFrame()

        for t in throws:
            round_number = _round_for(freeze_ticks, t["tick"])
            enemies_blinded = None
            teammates_blinded = None
            total_enemy_blind_duration = None
            flash_assist = None
            damage_dealt = None
            self_blind_duration = None

            if t["type"] == "flashbang" and not blind_df.empty and t["entityid"] is not None:
                # entityid alone isn't enough — CS2 recycles entity slots, so the same
                # entityid can belong to several unrelated flashbangs over a match (confirmed
                # against a real demo: one slot was reused by 3 different players' throws).
                # player_blind rows are logged at the exact same tick as their flash's
                # detonation, so pinning to t["tick"] isolates only this throw's real victims.
                matched = blind_df[(blind_df["entityid"] == t["entityid"]) & (blind_df["tick"] == t["tick"])]
                thrower_team = _team_for(team_snap, freeze_ticks, target, t["tick"])
                enemies_blinded, teammates_blinded, total_enemy_blind_duration = 0, 0, 0.0
                flash_assist = False
                for _, b in matched.iterrows():
                    victim = str(b["user_steamid"])
                    if victim == target:
                        # Previously discarded entirely (`continue`, no capture) — NEXT_STEPS.md
                        # Tier 5 "Self-flash duration". No industry-published definition exists
                        # for this (RoundSync original, per CS2_ANALYTICS_STANDARDS.md); a
                        # thrower can only self-blind once per thrown flash, so plain assignment
                        # (not accumulation) is correct here.
                        self_blind_duration = float(b["blind_duration"])
                        continue
                    duration = float(b["blind_duration"])
                    if _team_for(team_snap, freeze_ticks, victim, t["tick"]) == thrower_team:
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
                        if duration >= FLASH_ASSIST_MIN_BLIND_SECONDS:
                            for _, k in kills_on_victim.iterrows():
                                killer = str(k["attacker_steamid"])
                                if killer != target and _team_for(team_snap, freeze_ticks, killer, t["tick"]) == thrower_team:
                                    flash_assist = True

            elif t["type"] in ("hegrenade", "molotov", "incendiary") and not hurt_df.empty:
                keywords = {"hegrenade": "hegrenade", "molotov": "molotov|inferno", "incendiary": "incendiary|inferno"}[t["type"]]
                window_start, window_end = t["tick"], t["tick"] + int(TICK_RATE * 10)
                if t["type"] in ("molotov", "incendiary") and not inferno_expire_df.empty and t["entityid"] is not None:
                    # Same entityid-reuse issue as the flashbang fix above: iloc[0] with no
                    # tick bound could grab an EARLIER fire's expiry (same entity slot reused),
                    # putting window_end before window_start and silently zeroing out real
                    # damage. Only consider expiries at or after this throw, nearest first.
                    exp = inferno_expire_df[
                        (inferno_expire_df["entityid"] == t["entityid"]) & (inferno_expire_df["tick"] >= window_start)
                    ]
                    if not exp.empty:
                        window_end = int(exp.sort_values("tick").iloc[0]["tick"])
                relevant = hurt_df[
                    (hurt_df["attacker_steamid"].astype(str) == target)
                    & (hurt_df["tick"] >= window_start) & (hurt_df["tick"] <= window_end)
                    & (hurt_df["weapon"].astype(str).str.contains(keywords, case=False, na=False))
                ]
                # Capping per-row (not the final total) still allows one grenade to legitimately
                # total >100 across multiple victims — see capped_damage_sum's own docstring.
                damage_dealt = int(capped_damage_sum(relevant))

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
                "self_blind_duration": self_blind_duration,
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

# Movement-speed and audible-range conventions for category 8 (sound awareness). Both are
# real, cited community-tested approximations, NOT confirmed engine constants — see project
# memory. Speed is measured from real position deltas between samples rather than a raw
# velocity tick field, several of which are known to silently drop from bulk parse_ticks() calls.
RUN_SPEED_THRESHOLD_UPS = 200.0
WALK_SPEED_THRESHOLD_UPS = 80.0
RUNNING_AUDIBLE_RANGE_UNITS = 1000.0
WALKING_AUDIBLE_RANGE_UNITS = 900.0


def _angle_diff(a: float, b: float) -> float:
    """Signed shortest distance between two angles in degrees, handling the -180/180 wraparound."""
    return (a - b + 180) % 360 - 180


def _round_for(freeze_ticks: list, tick: int) -> int:
    """Which round number a given tick falls in — round N starts at freeze_ticks[N-1] and runs
    until the next round's freeze tick. Was copy-pasted as an identical inner function in 3
    different extract_fact_* functions; consolidated here since none of them customize it."""
    return max(1, sum(1 for t in freeze_ticks if t <= tick))


def _build_round_bounds(freeze_ticks: list, round_end_df, with_winner: bool = False) -> dict:
    """round_number -> (start_tick, end_tick) or (start_tick, end_tick, winner) if with_winner.
    Was copy-pasted (with two slightly different tuple shapes) in 4 different extract_fact_*
    functions; consolidated here — the with_winner flag picks the shape a caller needs instead
    of two near-identical duplicated blocks."""
    round_bounds = {}
    for round_number, start_tick in enumerate(freeze_ticks, start=1):
        end_rows = round_end_df[round_end_df["round"] == round_number]
        if end_rows.empty:
            continue
        end_tick = int(end_rows.iloc[0]["tick"])
        round_bounds[round_number] = (
            (start_tick, end_tick, str(end_rows.iloc[0]["winner"])) if with_winner else (start_tick, end_tick)
        )
    return round_bounds


def _team_for(team_snap, freeze_ticks: list, steamid, tick: int):
    """"CT"/"T"/None for a player at a given tick, looked up against the most recent
    round_freeze_end snapshot at or before that tick. Was copy-pasted as an identical inner
    function (modulo one team_snap = team_snap parameter) in 3 different extract_fact_*
    functions; consolidated here."""
    candidates = [t for t in freeze_ticks if t <= tick]
    lookup_tick = max(candidates) if candidates else (freeze_ticks[0] if freeze_ticks else tick)
    sub = team_snap[(team_snap["tick"] == lookup_tick) & (team_snap["steamid"].astype(str) == str(steamid))]
    return None if sub.empty else ("CT" if int(sub.iloc[0]["team_num"]) == 3 else "T")


def _build_slot_to_steamid_map(bullet_hit_df, bullet_damage_df) -> dict:
    """player_bullet_hit identifies players by a small per-match attacker_slot/victim_slot
    number (0-9), not steamid. bullet_damage (a separate event fired for the same hits) has
    the real steamids directly. Join the two on tick to learn the slot<->steamid mapping once
    per match, then reuse it for every player_bullet_hit row — slot is stable for one player
    all match (confirmed empirically against 5 real downloaded matches, 2026-08-30).

    A tick can carry more than one hit (multi-pellet shotgun, or two simultaneous
    engagements) — joining on tick alone would then pair the wrong rows together. Only ticks
    that are unique in BOTH events are used to build the map (confirmed empirically: ~90-95%
    of hits, still enough to see every one of the 10 slots at least once); once a slot's
    steamid is known it applies to every row for the rest of the match, ambiguous ticks
    included, since slot assignment doesn't change mid-match."""
    if bullet_hit_df.empty or bullet_damage_df.empty:
        return {}
    single_hit_ticks = bullet_hit_df["tick"].value_counts()
    single_hit_ticks = set(single_hit_ticks[single_hit_ticks == 1].index)
    single_damage_ticks = bullet_damage_df["tick"].value_counts()
    single_damage_ticks = set(single_damage_ticks[single_damage_ticks == 1].index)
    safe_ticks = single_hit_ticks & single_damage_ticks
    if not safe_ticks:
        return {}

    merged = (
        bullet_hit_df[bullet_hit_df["tick"].isin(safe_ticks)]
        .merge(bullet_damage_df[bullet_damage_df["tick"].isin(safe_ticks)], on="tick", how="inner")
    )
    slot_to_steamid = {}
    for _, row in merged.iterrows():
        slot_to_steamid[int(row["attacker_slot"])] = str(row["attacker_steamid"])
        slot_to_steamid[int(row["victim_slot"])] = str(row["victim_steamid"])
    return slot_to_steamid


def _get_player_rank(parser, target_steam_id64: str):
    """Returns (rank_new, rank_old, rank_type_id) from the demo's own rank_update event, or
    (None, None, None). rank_new is the player's rank AFTER this match (what the rest of the
    fact tables already store); rank_old is their rank BEFORE it started — i.e. what their
    Recent Matches card should show as "rank at match start" (see Part 4 of the redesign)."""
    target = str(target_steam_id64)
    try:
        rank_df = parse_event(parser, "rank_update")
        mine = rank_df[rank_df["user_steamid"].astype(str) == target] if not rank_df.empty else pd.DataFrame()
        if not mine.empty:
            last = mine.sort_values("tick").iloc[-1]
            rank_new = int(last["rank_new"]) if pd.notna(last["rank_new"]) else None
            rank_old = int(last["rank_old"]) if pd.notna(last["rank_old"]) else None
            rank_type_id = int(last["rank_type_id"]) if pd.notna(last["rank_type_id"]) else None
            return rank_new, rank_old, rank_type_id
    except Exception:
        pass
    return None, None, None


def _find_enemy_audible_triggers(parser, target: str, round_bounds: dict) -> list:
    """Returns [(tick, extra_dict), ...] for moments a living enemy becomes NEWLY audible to
    target (crosses into footstep range while walking/running) — a continuous per-round scan,
    unlike the discrete-event triggers in extract_fact_adaptation_event. Fires only on the
    transition into range, same anchor-on-new-information principle as every other trigger."""
    triggers = []
    sample_ticks = set()
    for start_tick, end_tick in round_bounds.values():
        t = start_tick
        while t <= end_tick:
            sample_ticks.add(t)
            t += POSITIONING_SAMPLE_INTERVAL_TICKS
    if not sample_ticks:
        return triggers
    snap = parser.parse_ticks(["X", "Y", "team_num", "is_alive"], ticks=sorted(sample_ticks))

    for start_tick, end_tick in round_bounds.values():
        round_snap = snap[(snap["tick"] >= start_tick) & (snap["tick"] <= end_tick)]
        if round_snap.empty:
            continue
        round_ticks_sorted = sorted(round_snap["tick"].unique())

        target_team_num = None
        for tick in round_ticks_sorted:
            trow = round_snap[(round_snap["tick"] == tick) & (round_snap["steamid"].astype(str) == target)]
            if not trow.empty:
                target_team_num = int(trow.iloc[0]["team_num"])
                break
        if target_team_num is None:
            continue

        prev_positions, was_audible = {}, {}
        for tick in round_ticks_sorted:
            tick_rows = round_snap[round_snap["tick"] == tick]
            trow = tick_rows[tick_rows["steamid"].astype(str) == target]
            if trow.empty or not bool(trow.iloc[0]["is_alive"]):
                continue
            tx, ty = float(trow.iloc[0]["X"]), float(trow.iloc[0]["Y"])

            enemies = tick_rows[(tick_rows["team_num"] != target_team_num) & (tick_rows["is_alive"])]
            for _, erow in enemies.iterrows():
                esteam = str(erow["steamid"])
                ex, ey = float(erow["X"]), float(erow["Y"])
                prev = prev_positions.get(esteam)
                prev_positions[esteam] = (tick, ex, ey)
                if prev is None:
                    continue
                prev_tick, px, py = prev
                dt = (tick - prev_tick) / TICK_RATE
                if dt <= 0:
                    continue
                speed = ((ex - px) ** 2 + (ey - py) ** 2) ** 0.5 / dt

                if speed >= RUN_SPEED_THRESHOLD_UPS:
                    movement_state = "running"
                elif speed >= WALK_SPEED_THRESHOLD_UPS:
                    movement_state = "walking"
                else:
                    movement_state = "silent"

                distance = ((ex - tx) ** 2 + (ey - ty) ** 2) ** 0.5
                audible_range = RUNNING_AUDIBLE_RANGE_UNITS if movement_state == "running" else WALKING_AUDIBLE_RANGE_UNITS
                is_audible_now = movement_state != "silent" and distance <= audible_range

                if is_audible_now and not was_audible.get(esteam, False):
                    triggers.append((int(tick), {
                        "source_enemy_steamid": esteam,
                        "enemy_movement_state": movement_state,
                        "enemy_distance_units": distance,
                    }))
                was_audible[esteam] = is_audible_now
    return triggers


def _resolve_bomb_site(callouts: list, plant_x: float, plant_y: float, plant_z: float):
    """Given this map's real BombsiteA/BombsiteB callout points (label, x, y, z tuples, from
    dim_map_callout) and a plant's real X/Y/Z, return whichever site letter's nearest callout
    point is closest in real 3D distance. A site can have several callout points (different
    corners/levels of the same site) — comparing against every point and taking the overall
    nearest, rather than a single center point per site, is what makes this accurate without
    needing site boundary polygons. Z (height) has to be part of the distance, not just X/Y —
    confirmed against real dim_map_callout data that de_nuke's Site B sits almost directly
    underneath Site A (B's callouts are ~250 units lower in Z, at very similar X/Y), so a
    flat-ground distance alone can pick the wrong site there specifically; a 2D-only version of
    this function is exactly why de_nuke was left unresolved in the historical backfill.
    Returns None if this map has no bombsite callouts at all (nothing to resolve against — the
    raw numeric code stays as the fallback at the call site)."""
    best_label, best_dist_sq = None, None
    for label, cx, cy, cz in callouts:
        dist_sq = (plant_x - cx) ** 2 + (plant_y - cy) ** 2 + (plant_z - cz) ** 2
        if best_dist_sq is None or dist_sq < best_dist_sq:
            best_label, best_dist_sq = label, dist_sq
    return best_label


def _resolve_bomb_sites_by_elevation(code_to_positions: dict, callouts: list):
    """Fallback for when _resolve_bomb_site can't be trusted for a whole match (its self-check
    failed) — for a map with exactly 2 real distinct site codes this match, sort the codes by
    their plants' average height (Z) and sort the map's 2 site letters by their own callout
    points' average height, then pair them up in the same order (lower code-group with lower
    site, higher with higher). Confirmed against real de_nuke data (2026-08-25): Site B sits
    almost 400 units lower than Site A there — X/Y-only or nearest-point matching gets confused
    by the two sites' overlapping footprint, but height alone cleanly and correctly separates
    them, matching the map's real, publicly well-known layout (A is the upper/outside site, B is
    the basement). This is NOT a de_nuke-specific rule — the "which letter is higher" direction
    is read from this map's own real callout data, not assumed, so it only ever fires (and only
    ever helps) on a map that's genuinely arranged this way. Returns a {raw_code: letter} dict,
    or None if there aren't exactly 2 codes and 2 site letters to pair (nothing safe to do)."""
    if len(code_to_positions) != 2:
        return None
    site_letters = sorted(set(label for label, _, _, _ in callouts))
    if len(site_letters) != 2:
        return None
    avg_letter_z = {
        label: sum(cz for l, _, _, cz in callouts if l == label) / sum(1 for l, _, _, _ in callouts if l == label)
        for label in site_letters
    }
    codes_by_z = sorted(code_to_positions.items(), key=lambda kv: sum(z for _, _, z in kv[1]) / len(kv[1]))
    letters_by_z = sorted(site_letters, key=lambda label: avg_letter_z[label])
    return {codes_by_z[0][0]: letters_by_z[0], codes_by_z[1][0]: letters_by_z[1]}


def extract_fact_adaptation_event(parser, target_steam_id64: str, freeze_ticks: list, death_df, round_end_df,
                                   bomb_site_callouts: list = None) -> list:
    """One row per teammate-death, bomb-plant, or enemy-audible-movement trigger for
    target_steam_id64 only (same scoping rule as fact_economy/fact_utility_throw). Bomb-plant
    "opposite site" filtering is NOT applied here — distance_to_plant_units is stored as a raw
    fact and thresholded later, same facts-vs-rules split as reaction_time_seconds itself.
    freeze_ticks/death_df/round_end_df are parsed once by the caller and shared across every
    extract_fact_* function instead of each one re-parsing it independently (Tier 9)."""
    rows = []
    bomb_site_callouts = bomb_site_callouts or []
    # raw `site` code -> resolved letter, built and sanity-checked in the bomb-plant block below.
    _raw_code_to_resolved_site = {}
    target = str(target_steam_id64)
    try:
        team_snap = parser.parse_ticks(["team_num"], ticks=freeze_ticks) if freeze_ticks else pd.DataFrame()

        if death_df.empty or "user_steamid" not in death_df.columns:
            return rows

        target_death_ticks = sorted(death_df[death_df["user_steamid"].astype(str) == target]["tick"].tolist())

        def target_alive_at(tick):
            rnd = _round_for(freeze_ticks, tick)
            deaths_this_round = [t for t in target_death_ticks if _round_for(freeze_ticks, t) == rnd]
            return not any(dt <= tick for dt in deaths_this_round)

        player_rank_new, _player_rank_old, player_rank_type_id = _get_player_rank(parser, target)

        triggers = []  # each: (trigger_type, trigger_tick, extra_fields_dict)
        for _, d in death_df.iterrows():
            victim = str(d["user_steamid"])
            if victim == target:
                continue
            tick = int(d["tick"])
            victim_team = _team_for(team_snap, freeze_ticks, victim, tick)
            if victim_team is None or victim_team != _team_for(team_snap, freeze_ticks, target, tick):
                continue
            if not target_alive_at(tick):
                continue
            triggers.append(("teammate_death", tick, {"teammate_steamid": victim}))

        try:
            plant_df = parse_event(parser, "bomb_planted")
        except Exception:
            plant_df = pd.DataFrame()
        if not plant_df.empty and "user_steamid" in plant_df.columns:
            planter_ticks = sorted(int(t) for t in plant_df["tick"].tolist())
            # Z (height) is needed alongside X/Y — see _resolve_bomb_site's docstring for why
            # a flat 2D distance isn't enough on a map like de_nuke, where Site B sits almost
            # directly underneath Site A.
            planter_pos_df = parser.parse_ticks(["X", "Y", "Z"], ticks=planter_ticks)

            # Pass 1: resolve EVERY plant in the match (not just ones relevant to the tracked
            # player) and check the whole match is internally consistent before trusting any of
            # it. Confirmed empirically against a real de_nuke match (2026-08-25): nearest-point
            # matching can silently pick a wrong site when a map's extracted callout points are
            # too sparse/uneven, even with 3D distance — the two real, distinct site codes that
            # match resolved to conflicting letters. When that happens, try the elevation-based
            # fallback (_resolve_bomb_sites_by_elevation) before giving up to raw codes — proven
            # against the same real de_nuke match to correctly separate the two sites by height.
            site_resolution_trusted = True
            code_to_positions = {}  # raw_code -> list of (x, y, z), for the elevation fallback
            for _, p in plant_df.iterrows():
                tick = int(p["tick"])
                row = planter_pos_df[
                    (planter_pos_df["tick"] == tick) & (planter_pos_df["steamid"].astype(str) == str(p["user_steamid"]))
                ]
                if row.empty:
                    continue
                x, y, z = float(row.iloc[0]["X"]), float(row.iloc[0]["Y"]), float(row.iloc[0]["Z"])
                raw_code = str(p["site"])
                code_to_positions.setdefault(raw_code, []).append((x, y, z))
                resolved = _resolve_bomb_site(bomb_site_callouts, x, y, z)
                if resolved is None:
                    continue
                if raw_code in _raw_code_to_resolved_site and _raw_code_to_resolved_site[raw_code] != resolved:
                    site_resolution_trusted = False
                elif resolved in _raw_code_to_resolved_site.values() and raw_code not in _raw_code_to_resolved_site:
                    site_resolution_trusted = False
                _raw_code_to_resolved_site[raw_code] = resolved

            if not site_resolution_trusted:
                elevation_mapping = _resolve_bomb_sites_by_elevation(code_to_positions, bomb_site_callouts)
                if elevation_mapping:
                    print("⚠️ Warning: bomb site resolution by nearest-point looked unreliable for "
                          "this match — resolved by height instead (2 distinct sites, cleanly "
                          "separated by elevation)")
                    _raw_code_to_resolved_site = elevation_mapping
                    site_resolution_trusted = True
                else:
                    print("⚠️ Warning: bomb site resolution for this match looks unreliable (two "
                          "different site codes resolved to the same letter), and the elevation "
                          "fallback doesn't apply — falling back to raw numeric codes for every "
                          "bomb_plant this match instead of a wrong-looking guess")

            # Pass 2: build the actual trigger rows, scoped to the tracked player as before.
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
                planter_x = float(planter_row.iloc[0]["X"])
                planter_y = float(planter_row.iloc[0]["Y"])
                raw_code = str(p["site"])
                resolved_site = raw_code
                if site_resolution_trusted and raw_code in _raw_code_to_resolved_site:
                    resolved_site = _raw_code_to_resolved_site[raw_code]
                triggers.append(("bomb_plant", tick, {
                    "bomb_site": resolved_site,
                    "_planter_x": planter_x,
                    "_planter_y": planter_y,
                }))

        if not round_end_df.empty and "round" in round_end_df.columns:
            round_bounds = _build_round_bounds(freeze_ticks, round_end_df)
            for tick, extra in _find_enemy_audible_triggers(parser, target, round_bounds):
                if target_alive_at(tick):
                    triggers.append(("enemy_audible_movement", tick, extra))

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
                "round_number": _round_for(freeze_ticks, trigger_tick),
                "steam_id64": target,
                "trigger_type": trigger_type,
                "trigger_tick": trigger_tick,
                "teammate_steamid": extra.get("teammate_steamid"),
                "bomb_site": extra.get("bomb_site"),
                "distance_to_plant_units": distance_to_plant_units,
                "source_enemy_steamid": extra.get("source_enemy_steamid"),
                "enemy_movement_state": extra.get("enemy_movement_state"),
                "enemy_distance_units": extra.get("enemy_distance_units"),
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


# Real, cited conventions (not invented) — see project memory for sourcing:
# - trade distance ≈ 15m coaching convention (refrag before the enemy can reset/reposition)
# - contested-duel range ≈ 30m (assault rifles' effective-accuracy range) — a proxy for
#   "an enemy is close enough that a fight is genuinely possible right now"
# - conversion: CS engine's real, cited ~52.49 map units per meter
CS2_UNITS_PER_METER = 52.49
TEAMMATE_TRADE_DISTANCE_UNITS = round(15 * CS2_UNITS_PER_METER, -2)   # ≈ 800
ENEMY_CONTESTED_RANGE_UNITS = round(30 * CS2_UNITS_PER_METER, -2)     # ≈ 1500
POSITIONING_SAMPLE_INTERVAL_TICKS = int(TICK_RATE * 0.5)
# 4s matches Leetify's published trade-kill window (was 3s — NEXT_STEPS.md Band 5).
TRADE_KILL_WINDOW_TICKS = int(TICK_RATE * 4)


def extract_fact_positioning_risk(parser, target_steam_id64: str, freeze_ticks: list, round_end_df, death_df) -> list:
    """One row per isolated-commitment moment for target_steam_id64 only. Fires the instant the
    player has no living teammate within trade distance AND a living enemy within contested
    range — anchored on the COMMITMENT, not the death, per the standing design principle (a
    lucky survival on a bad push must still be visible). Outcome (died/survived, and whether a
    death was tradeable) is filled in after the fact, as a column, not the trigger itself.
    freeze_ticks/round_end_df/death_df are parsed once by the caller and shared across every
    extract_fact_* function instead of each one re-parsing it independently (Tier 9)."""
    rows = []
    target = str(target_steam_id64)
    try:
        if not freeze_ticks or round_end_df.empty or "round" not in round_end_df.columns:
            return rows

        round_bounds = _build_round_bounds(freeze_ticks, round_end_df)
        if not round_bounds:
            return rows

        target_deaths = (
            death_df[death_df["user_steamid"].astype(str) == target]
            if not death_df.empty and "user_steamid" in death_df.columns else pd.DataFrame()
        )

        sample_ticks = set()
        for start_tick, end_tick in round_bounds.values():
            t = start_tick
            while t <= end_tick:
                sample_ticks.add(t)
                t += POSITIONING_SAMPLE_INTERVAL_TICKS
        # ensure exact death ticks are present too, so death-moment trade checks aren't
        # off by up to half a second from the regular sampling grid
        sample_ticks.update(int(t) for t in target_deaths["tick"].tolist())

        snap = parser.parse_ticks(["X", "Y", "Z", "team_num", "is_alive"], ticks=sorted(sample_ticks))
        player_rank_new, _player_rank_old, player_rank_type_id = _get_player_rank(parser, target)

        def death_at_or_after(round_number, from_tick, to_tick):
            if target_deaths.empty:
                return None
            in_round = target_deaths[(target_deaths["tick"] >= from_tick) & (target_deaths["tick"] <= to_tick)]
            return None if in_round.empty else in_round.sort_values("tick").iloc[0]

        def was_traded(attacker_steamid, death_tick):
            if death_df.empty or attacker_steamid is None:
                return False
            window = death_df[
                (death_df["user_steamid"].astype(str) == str(attacker_steamid))
                & (death_df["tick"] > death_tick) & (death_df["tick"] <= death_tick + TRADE_KILL_WINDOW_TICKS)
            ]
            return not window.empty

        for round_number, (start_tick, end_tick) in round_bounds.items():
            round_snap = snap[(snap["tick"] >= start_tick) & (snap["tick"] <= end_tick)]
            if round_snap.empty:
                continue
            round_ticks_sorted = sorted(round_snap["tick"].unique())

            state = "safe"
            commit_tick, commit_pos, commit_teammate_dist, commit_enemy_dist = None, None, None, None

            def emit(outcome, death_row):
                death_tick_val, tradeable, traded = None, None, None
                if death_row is not None:
                    death_tick_val = int(death_row["tick"])
                    attacker = death_row.get("attacker_steamid")
                    death_snap = snap[snap["tick"] == death_tick_val]
                    trow_at_death = death_snap[death_snap["steamid"].astype(str) == target]
                    if not trow_at_death.empty:
                        tx, ty = float(trow_at_death.iloc[0]["X"]), float(trow_at_death.iloc[0]["Y"])
                        others = death_snap[(death_snap["steamid"].astype(str) != target) & (death_snap["is_alive"])]
                        if not others.empty:
                            teammates = others[others["team_num"] == int(trow_at_death.iloc[0]["team_num"])]
                            if not teammates.empty:
                                dists = ((teammates["X"].astype(float) - tx) ** 2 + (teammates["Y"].astype(float) - ty) ** 2) ** 0.5
                                tradeable = bool(dists.min() <= TEAMMATE_TRADE_DISTANCE_UNITS)
                    traded = was_traded(attacker, death_tick_val)
                rows.append({
                    "round_number": round_number,
                    "steam_id64": target,
                    "commitment_tick": commit_tick,
                    "player_x": commit_pos[0], "player_y": commit_pos[1], "player_z": commit_pos[2],
                    "nearest_teammate_distance_units": commit_teammate_dist,
                    "nearest_enemy_distance_units": commit_enemy_dist,
                    "outcome": outcome,
                    "death_tick": death_tick_val,
                    "teammate_within_trade_range_at_death": tradeable,
                    "was_traded": traded,
                    "player_rank_new": player_rank_new,
                    "player_rank_type_id": player_rank_type_id,
                })

            for tick in round_ticks_sorted:
                tick_rows = round_snap[round_snap["tick"] == tick]
                trow = tick_rows[tick_rows["steamid"].astype(str) == target]

                if trow.empty or not bool(trow.iloc[0]["is_alive"]):
                    if state == "isolated":
                        death_row = death_at_or_after(round_number, commit_tick, tick)
                        emit("died" if death_row is not None else "survived", death_row)
                    state = "safe"
                    commit_tick = None
                    continue

                trow = trow.iloc[0]
                tx, ty = float(trow["X"]), float(trow["Y"])
                team_num = int(trow["team_num"])

                others = tick_rows[(tick_rows["steamid"].astype(str) != target) & (tick_rows["is_alive"])]
                nearest_teammate_dist, nearest_enemy_dist = None, None
                if not others.empty:
                    others = others.copy()
                    others["dist"] = ((others["X"].astype(float) - tx) ** 2 + (others["Y"].astype(float) - ty) ** 2) ** 0.5
                    teammates = others[others["team_num"] == team_num]
                    enemies = others[others["team_num"] != team_num]
                    nearest_teammate_dist = float(teammates["dist"].min()) if not teammates.empty else None
                    nearest_enemy_dist = float(enemies["dist"].min()) if not enemies.empty else None

                is_isolated_now = (
                    (nearest_teammate_dist is None or nearest_teammate_dist > TEAMMATE_TRADE_DISTANCE_UNITS)
                    and (nearest_enemy_dist is not None and nearest_enemy_dist <= ENEMY_CONTESTED_RANGE_UNITS)
                )

                if is_isolated_now and state == "safe":
                    state = "isolated"
                    commit_tick = int(tick)
                    commit_pos = (tx, ty, float(trow["Z"]))
                    commit_teammate_dist = nearest_teammate_dist
                    commit_enemy_dist = nearest_enemy_dist
                elif not is_isolated_now and state == "isolated":
                    emit("survived", None)
                    state = "safe"
                    commit_tick = None

            if state == "isolated" and commit_tick is not None:
                death_row = death_at_or_after(round_number, commit_tick, end_tick)
                emit("died" if death_row is not None else "survived", death_row)
    except Exception as e:
        print(f"⚠️ Warning parsing fact_positioning_risk: {e}")
    return rows


# A gap this long between shots ends one engagement attempt and starts counting a new one.
BURST_GAP_TICKS = int(TICK_RATE * 2)
# How far past the opening shot we look for the hit/kill/death that resolves the engagement.
ENGAGEMENT_WINDOW_TICKS = int(TICK_RATE * 5)
# Found 2026-08-30 while rebuilding fact_duel_placement (Tier 9.5): this list was missing
# "flashbang" and "knife" — weapon_fire fires for a flashbang THROW and a knife SWING too, not
# just real bullets, so both extract_fact_duel_placement's opening-shot detection and
# extract_fact_engage_decision's player_engaged flag were treating them as gunfight shots.
# Confirmed against a real match: 9 of 44 "opening shots" for one player were actually
# flashbang throws/knife swings, not gunfire. fire_bullets (which only fires for real bullets)
# exposed this directly — those 9 ticks have no matching fire_bullets row at all.
NON_GUN_WEAPON_KEYWORDS = "grenade|molotov|decoy|incgrenade|flashbang|knife"


def extract_fact_duel_placement(parser, target_steam_id64: str, freeze_ticks: list, fire_df, death_df,
                                 fire_bullets_df, bullet_hit_df, slot_to_steamid: dict) -> list:
    """One row per gunfight target_steam_id64 opens (their own opening shot only — this is a
    proxy for pre-aim, not true visibility-based pre-aim, see project memory). Fires for both
    wins and losses, per the decision-vs-outcome principle. When target's shots land, the real
    opponent (and a real time-to-damage) comes from player_bullet_hit; when they don't, the
    nearest living enemy is used as a best-guess opponent for the angle check only, flagged via
    opponent_inferred so the two cases are never silently conflated.

    Rebuilt 2026-08-30 (Tier 9.5) onto fire_bullets/player_bullet_hit instead of weapon_fire +
    a separate parse_ticks() snapshot lookup — both richer, more precise sources confirmed
    already available (see DEMOPARSER2_FIELDS.md). fire_bullets carries the shooter's own
    EXACT position/angle at the instant of the shot (angles_y = yaw, confirmed empirically
    against 5 real matches, avg diff ~0.5-0.7deg from the nearest per-tick sample — see
    NEXT_STEPS.md Tier 9.5), replacing a snapshot at the nearest sampled tick. player_bullet_hit
    carries the victim's exact position at the hit directly on the row, replacing a second
    snapshot lookup — but only identifies players by a small attacker_slot/victim_slot number,
    resolved to a real steamid via slot_to_steamid (see _build_slot_to_steamid_map). Burst/
    opening-shot detection still uses weapon_fire (fire_df, shared, unchanged) — that part
    wasn't the imprecise piece Tier 9.5 flagged, only the position/angle/opponent lookup was.
    freeze_ticks/fire_df/death_df are parsed once by the caller and shared across every
    extract_fact_* function instead of each one re-parsing it independently (Tier 9)."""
    rows = []
    target = str(target_steam_id64)
    try:
        if fire_df.empty or "user_steamid" not in fire_df.columns:
            return rows
        my_fires = fire_df[fire_df["user_steamid"].astype(str) == target]
        my_fires = my_fires[~my_fires["weapon"].astype(str).str.contains(NON_GUN_WEAPON_KEYWORDS, case=False, na=False)]
        if my_fires.empty:
            return rows

        fire_ticks = sorted(int(t) for t in my_fires["tick"].tolist())
        bursts, current = [], [fire_ticks[0]]
        for t in fire_ticks[1:]:
            if t - current[-1] > BURST_GAP_TICKS:
                bursts.append(current)
                current = [t]
            else:
                current.append(t)
        bursts.append(current)
        opening_ticks = [b[0] for b in bursts]

        # still needed for the fallback path (team_num/position of players who WEREN'T hit) —
        # fire_bullets/player_bullet_hit only carry data for the shooter and whoever got hit,
        # not for every other living player at that tick.
        pos_df = parser.parse_ticks(["X", "Y", "team_num", "is_alive"], ticks=opening_ticks)
        my_fire_bullets = (
            fire_bullets_df[fire_bullets_df["user_steamid"].astype(str) == target]
            if not fire_bullets_df.empty else pd.DataFrame()
        )
        my_slot = next((slot for slot, sid in slot_to_steamid.items() if sid == target), None)
        player_rank_new, _player_rank_old, player_rank_type_id = _get_player_rank(parser, target)

        for opening_tick in opening_ticks:
            shot_row = my_fire_bullets[my_fire_bullets["tick"] == opening_tick] if not my_fire_bullets.empty else pd.DataFrame()
            trow = pos_df[(pos_df["tick"] == opening_tick) & (pos_df["steamid"].astype(str) == target)]
            if shot_row.empty or trow.empty:
                continue
            shot_row = shot_row.iloc[0]
            tx, ty, tz = float(shot_row["origin_x"]), float(shot_row["origin_y"]), float(shot_row["origin_z"])
            tyaw = float(shot_row["angles_y"])
            team_num = int(trow.iloc[0]["team_num"])
            window_end = opening_tick + ENGAGEMENT_WINDOW_TICKS

            opponent_steamid, opponent_inferred, opp_x, opp_y = None, False, None, None
            first_hit = None
            if my_slot is not None and not bullet_hit_df.empty:
                my_hits = bullet_hit_df[
                    (bullet_hit_df["attacker_slot"] == my_slot)
                    & (bullet_hit_df["tick"] >= opening_tick) & (bullet_hit_df["tick"] <= window_end)
                ]
                if not my_hits.empty:
                    first_hit = my_hits.sort_values("tick").iloc[0]
                    opponent_steamid = slot_to_steamid.get(int(first_hit["victim_slot"]))

            if opponent_steamid is not None and first_hit is not None:
                opp_x, opp_y = float(first_hit["victim_pos_x"]), float(first_hit["victim_pos_y"])
            else:
                opponent_steamid, first_hit = None, None
                others = pos_df[
                    (pos_df["tick"] == opening_tick) & (pos_df["steamid"].astype(str) != target) & (pos_df["is_alive"])
                ]
                enemies = others[others["team_num"] != team_num]
                if enemies.empty:
                    continue
                enemies = enemies.copy()
                enemies["dist"] = ((enemies["X"].astype(float) - tx) ** 2 + (enemies["Y"].astype(float) - ty) ** 2) ** 0.5
                nearest = enemies.sort_values("dist").iloc[0]
                opponent_steamid, opponent_inferred = str(nearest["steamid"]), True
                opp_x, opp_y = float(nearest["X"]), float(nearest["Y"])

            angle_to_opponent = math.degrees(math.atan2(opp_y - ty, opp_x - tx))
            angle_deviation_deg = round(abs(_angle_diff(angle_to_opponent, tyaw)), 2)

            time_to_damage_seconds = None
            if not opponent_inferred and first_hit is not None:
                time_to_damage_seconds = round((int(first_hit["tick"]) - opening_tick) / TICK_RATE, 2)

            engagement_result = "no_result"
            if not death_df.empty:
                won = death_df[
                    (death_df["attacker_steamid"].astype(str) == target)
                    & (death_df["user_steamid"].astype(str) == opponent_steamid)
                    & (death_df["tick"] >= opening_tick) & (death_df["tick"] <= window_end)
                ]
                lost = death_df[
                    (death_df["user_steamid"].astype(str) == target)
                    & (death_df["tick"] >= opening_tick) & (death_df["tick"] <= window_end)
                ]
                if not won.empty:
                    engagement_result = "won"
                elif not lost.empty:
                    engagement_result = "lost"

            rows.append({
                "round_number": _round_for(freeze_ticks, opening_tick),
                "steam_id64": target,
                "engagement_tick": opening_tick,
                "opponent_steamid": opponent_steamid,
                "opponent_inferred": opponent_inferred,
                "player_x": tx, "player_y": ty, "player_z": tz, "player_yaw": tyaw,
                "angle_deviation_deg": angle_deviation_deg,
                "time_to_damage_seconds": time_to_damage_seconds,
                "engagement_result": engagement_result,
                "player_rank_new": player_rank_new,
                "player_rank_type_id": player_rank_type_id,
            })
    except Exception as e:
        print(f"⚠️ Warning parsing fact_duel_placement: {e}")
    return rows


def extract_fact_engage_decision(parser, target_steam_id64: str, freeze_ticks: list, round_end_df,
                                  death_df, hurt_df, fire_df) -> list:
    """One row per moment target_steam_id64's team first becomes outnumbered while target is
    still alive (not exclusive to true 1-vs-N clutches, per category 7's design). Deliberately
    does NOT compute a weighted HLTV-style Impact Score — those coefficients are undisclosed
    even for HLTV's own real formula and need real calibration (see project memory). Instead
    stores the raw running components (kills/deaths/damage/rounds, for target AND every
    remaining enemy) so any weighting scheme can be applied later without re-parsing.
    freeze_ticks/round_end_df/death_df/hurt_df/fire_df are parsed once by the caller and shared
    across every extract_fact_* function instead of each one re-parsing it independently (Tier 9).

    Also captures the Tier 5.5 "Engage IQ redesign" free/cheap factors (is_isolated,
    current_weapon, current_health, current_utility) as raw columns, per the staged plan's
    first phase — deliberately NOT folded into a new engage_iq score yet. Turning these into a
    "was this a good decision" verdict needs real methodology (what counts as too outnumbered,
    how much isolation matters) that was never actually agreed; capturing the real data now
    without guessing at that methodology keeps the door open for whoever designs it for real."""
    rows = []
    target = str(target_steam_id64)
    try:
        if not freeze_ticks or round_end_df.empty or "round" not in round_end_df.columns:
            return rows

        round_bounds = _build_round_bounds(freeze_ticks, round_end_df, with_winner=True)
        if not round_bounds:
            return rows

        if death_df.empty:
            return rows
        target_death_events = death_df[death_df["user_steamid"].astype(str) == target]

        sample_ticks = set()
        for start_tick, end_tick, _ in round_bounds.values():
            t = start_tick
            while t <= end_tick:
                sample_ticks.add(t)
                t += POSITIONING_SAMPLE_INTERVAL_TICKS
        # X/Y/health/active_weapon_name/inventory added alongside the original team_num/is_alive
        # for the Tier 5.5 Engage IQ free/cheap factors (isolation distance, current
        # weapon/health/utility at the decision moment) — one combined parse_ticks call rather
        # than a second pass over the same ticks.
        snap = parser.parse_ticks(
            ["team_num", "is_alive", "X", "Y", "health", "active_weapon_name", "inventory"],
            ticks=sorted(sample_ticks),
        )
        player_rank_new, _player_rank_old, player_rank_type_id = _get_player_rank(parser, target)

        def running_stats(steamid, cutoff_tick):
            kills = len(death_df[(death_df["attacker_steamid"].astype(str) == steamid) & (death_df["tick"] < cutoff_tick)])
            deaths = len(death_df[(death_df["user_steamid"].astype(str) == steamid) & (death_df["tick"] < cutoff_tick)])
            damage = 0.0
            if not hurt_df.empty:
                mine = hurt_df[(hurt_df["attacker_steamid"].astype(str) == steamid) & (hurt_df["tick"] < cutoff_tick)]
                damage = capped_damage_sum(mine)
            return kills, deaths, damage

        for round_number, (start_tick, end_tick, winner) in round_bounds.items():
            round_snap = snap[(snap["tick"] >= start_tick) & (snap["tick"] <= end_tick)]
            if round_snap.empty:
                continue
            round_ticks_sorted = sorted(round_snap["tick"].unique())
            rounds_so_far = round_number - 1

            target_team_num = None
            for tick in round_ticks_sorted:
                trow = round_snap[(round_snap["tick"] == tick) & (round_snap["steamid"].astype(str) == target)]
                if not trow.empty:
                    target_team_num = int(trow.iloc[0]["team_num"])
                    break
            if target_team_num is None:
                continue

            state = "even_or_favorable"
            for tick in round_ticks_sorted:
                tick_rows = round_snap[round_snap["tick"] == tick]
                trow = tick_rows[tick_rows["steamid"].astype(str) == target]
                if trow.empty or not bool(trow.iloc[0]["is_alive"]):
                    continue

                # teammates_alive is target's own SIDE's total living headcount, target included
                # (the conventional "3v2" framing, where the 2 includes you) — this is the
                # existing, already-shipped semantics of this stored field; do not change it.
                # other_teammate_rows (target excluded) is only for the new isolation-distance
                # check below, which needs OTHER players' positions, not target's own.
                teammates_alive = len(tick_rows[(tick_rows["team_num"] == target_team_num) & (tick_rows["is_alive"])])
                other_teammate_rows = tick_rows[
                    (tick_rows["team_num"] == target_team_num) & (tick_rows["is_alive"])
                    & (tick_rows["steamid"].astype(str) != target)
                ]
                enemy_rows = tick_rows[(tick_rows["team_num"] != target_team_num) & (tick_rows["is_alive"])]
                enemies_alive = len(enemy_rows)
                is_outnumbered = enemies_alive > teammates_alive

                if is_outnumbered and state == "even_or_favorable":
                    state = "outnumbered"
                    decision_tick = int(tick)
                    target_kills, target_deaths, target_damage = running_stats(target, decision_tick)

                    # Engage IQ free/cheap factors (Tier 5.5) — raw data only, no scoring yet.
                    if other_teammate_rows.empty:
                        is_isolated = True
                    else:
                        tx, ty = float(trow.iloc[0]["X"]), float(trow.iloc[0]["Y"])
                        teammate_dists = (
                            (other_teammate_rows["X"].astype(float) - tx) ** 2 + (other_teammate_rows["Y"].astype(float) - ty) ** 2
                        ) ** 0.5
                        is_isolated = bool(teammate_dists.min() > TEAMMATE_TRADE_DISTANCE_UNITS)
                    current_health = (
                        int(trow.iloc[0]["health"]) if "health" in trow.columns and pd.notna(trow.iloc[0]["health"]) else None
                    )
                    current_weapon = (
                        str(trow.iloc[0]["active_weapon_name"])
                        if "active_weapon_name" in trow.columns and pd.notna(trow.iloc[0]["active_weapon_name"]) else None
                    )
                    inventory_list = trow.iloc[0]["inventory"] if "inventory" in trow.columns else None
                    current_utility = (
                        [item for item in inventory_list if re.search("grenade|flashbang|molotov|incendiary|decoy", str(item), re.IGNORECASE)]
                        if isinstance(inventory_list, (list, tuple)) else None
                    )

                    enemies_components = [
                        dict(zip(
                            ["steam_id64", "kills_so_far", "deaths_so_far", "damage_so_far"],
                            (str(erow["steamid"]), *running_stats(str(erow["steamid"]), decision_tick)),
                        ))
                        for _, erow in enemy_rows.iterrows()
                    ]

                    player_engaged = False
                    if not fire_df.empty:
                        after = fire_df[
                            (fire_df["user_steamid"].astype(str) == target)
                            & (fire_df["tick"] >= decision_tick) & (fire_df["tick"] <= end_tick)
                            & (~fire_df["weapon"].astype(str).str.contains(NON_GUN_WEAPON_KEYWORDS, case=False, na=False))
                        ]
                        player_engaged = not after.empty

                    target_died = not target_death_events[
                        (target_death_events["tick"] >= decision_tick) & (target_death_events["tick"] <= end_tick)
                    ].empty
                    round_won = winner == ("CT" if target_team_num == 3 else "T")

                    rows.append({
                        "round_number": round_number,
                        "steam_id64": target,
                        "decision_tick": decision_tick,
                        "teammates_alive": teammates_alive,
                        "enemies_alive": enemies_alive,
                        "target_kills_so_far": target_kills,
                        "target_deaths_so_far": target_deaths,
                        "target_damage_so_far": target_damage,
                        "target_rounds_so_far": rounds_so_far,
                        "enemies_raw_components": enemies_components,
                        "player_engaged": player_engaged,
                        "target_died": target_died,
                        "round_won": round_won,
                        "player_rank_new": player_rank_new,
                        "player_rank_type_id": player_rank_type_id,
                        "is_isolated": is_isolated,
                        "current_health": current_health,
                        "current_weapon": current_weapon,
                        "current_utility": current_utility,
                    })
                elif not is_outnumbered and state == "outnumbered":
                    state = "even_or_favorable"
    except Exception as e:
        print(f"⚠️ Warning parsing fact_engage_decision: {e}")
    return rows


def extract_match_secondary_metrics(parser, target_steam_id64: str, freeze_ticks: list, round_end_df, deaths_df, bomb_planted_df, hurt_df) -> dict:
    """Home-dashboard/Insights KPI tiles, computed once per match from data already parsed here
    (freeze_ticks/round_end_df/deaths_df/bomb_planted_df/hurt_df are all passed in so this
    doesn't re-run parse_event() a second time for events every other extract_fact_* function
    already shares — Tier 9). Every value defaults to None and is left out of the telemetry blob
    by the caller when it couldn't be computed — same optional-field/graceful-fallback pattern as
    total_damage/headshots/rounds_played already use, so older already-parsed matches just show
    nothing for a tile instead of a fake zero."""
    target = str(target_steam_id64)
    metrics = {
        "entry_success_pct": None,
        "utility_dmg_per_round": None,
        "clutches_won": None,
        "trade_kill_pct": None,
        "kast_pct": None,
        "weapon_segmented_stats": None,
        "kills_damage_by_round_outcome": None,
        "kill_distance_buckets": None,
    }
    try:
        if not freeze_ticks or round_end_df.empty or "round" not in round_end_df.columns:
            return metrics

        round_bounds = _build_round_bounds(freeze_ticks, round_end_df, with_winner=True)
        if not round_bounds:
            return metrics

        if deaths_df.empty or "user_steamid" not in deaths_df.columns or "attacker_steamid" not in deaths_df.columns:
            return metrics

        team_snap = parser.parse_ticks(["team_num"], ticks=freeze_ticks)

        # --- 1. Entry Success % — win rate of the FIRST death of the round, for either side,
        # when target was one of the two people involved (the killer or the victim). Rounds
        # where target wasn't part of the opening duel are excluded entirely, not counted as
        # a loss, since they say nothing about target's own entry performance.
        entry_wins, entry_losses = 0, 0
        for start_tick, end_tick, _winner in round_bounds.values():
            round_deaths = deaths_df[(deaths_df["tick"] >= start_tick) & (deaths_df["tick"] <= end_tick)]
            if round_deaths.empty:
                continue
            first_death = round_deaths.sort_values("tick").iloc[0]
            victim = str(first_death["user_steamid"])
            attacker = str(first_death["attacker_steamid"])
            if victim == target:
                entry_losses += 1
            elif attacker == target:
                entry_wins += 1
        entry_total = entry_wins + entry_losses
        if entry_total > 0:
            metrics["entry_success_pct"] = round(100 * entry_wins / entry_total, 1)

        # --- 2. Clutches Won — target is the last player alive on their team, at least one
        # enemy is still alive at that same moment, and their team goes on to win the round.
        # Uses the same per-round alive-count sampling as extract_fact_engage_decision above
        # (the "much cheaper clutch-detection signal" noted in DEMOPARSER2_FIELDS.md), not a
        # full player_death reconstruction.
        sample_ticks = set()
        for start_tick, end_tick, _winner in round_bounds.values():
            t = start_tick
            while t <= end_tick:
                sample_ticks.add(t)
                t += POSITIONING_SAMPLE_INTERVAL_TICKS
        alive_snap = parser.parse_ticks(["team_num", "is_alive"], ticks=sorted(sample_ticks))

        # "Fake" clutch exclusion (HLTV's 2024 "adjusted clutch requirements",
        # hltv.org/news/40818): a T-side clutch doesn't count if the bomb already made the
        # round's outcome a foregone conclusion before the player was even down to their last
        # life — i.e. more than one teammate was still alive at CTs' last realistic chance to
        # start defusing (5s before detonation with a kit, 10s without). Standard CS2 C4 timer
        # is 40s. CT-side clutches (defusing solo) aren't covered by this rule.
        BOMB_TIMER_SECONDS = 40
        DEFUSE_WINDOW_WITH_KIT_SECONDS = 5
        DEFUSE_WINDOW_NO_KIT_SECONDS = 10

        plant_tick_by_round = {}
        if bomb_planted_df is not None and not bomb_planted_df.empty and "tick" in bomb_planted_df.columns:
            for _, p in bomb_planted_df.iterrows():
                rnd = _round_for(freeze_ticks, int(p["tick"]))
                if rnd is not None and rnd not in plant_tick_by_round:
                    plant_tick_by_round[rnd] = int(p["tick"])

        detonation_by_round = {
            rnd: plant_tick + int(BOMB_TIMER_SECONDS * TICK_RATE)
            for rnd, plant_tick in plant_tick_by_round.items()
        }
        deadline_ticks = set()
        for detonation_tick in detonation_by_round.values():
            deadline_ticks.add(detonation_tick - int(DEFUSE_WINDOW_WITH_KIT_SECONDS * TICK_RATE))
            deadline_ticks.add(detonation_tick - int(DEFUSE_WINDOW_NO_KIT_SECONDS * TICK_RATE))
        defuse_snap = (
            parser.parse_ticks(["team_num", "is_alive", "has_defuser"], ticks=sorted(deadline_ticks))
            if deadline_ticks else pd.DataFrame()
        )

        def is_fake_t_clutch(round_number) -> bool:
            if round_number not in detonation_by_round or defuse_snap.empty:
                return False
            detonation_tick = detonation_by_round[round_number]
            kit_check_tick = detonation_tick - int(DEFUSE_WINDOW_WITH_KIT_SECONDS * TICK_RATE)
            kit_rows = defuse_snap[
                (defuse_snap["tick"] == kit_check_tick) & (defuse_snap["team_num"] == 3) & (defuse_snap["is_alive"])
            ]
            any_defuser = bool(kit_rows["has_defuser"].any()) if not kit_rows.empty else False
            window_seconds = DEFUSE_WINDOW_WITH_KIT_SECONDS if any_defuser else DEFUSE_WINDOW_NO_KIT_SECONDS
            deadline_tick = detonation_tick - int(window_seconds * TICK_RATE)
            ts_alive_at_deadline = defuse_snap[
                (defuse_snap["tick"] == deadline_tick) & (defuse_snap["team_num"] != 3) & (defuse_snap["is_alive"])
            ]
            return len(ts_alive_at_deadline) > 1

        clutches_won = 0
        for round_number, (start_tick, end_tick, winner) in round_bounds.items():
            round_snap = alive_snap[(alive_snap["tick"] >= start_tick) & (alive_snap["tick"] <= end_tick)]
            if round_snap.empty:
                continue
            round_ticks_sorted = sorted(round_snap["tick"].unique())
            target_team = _team_for(team_snap, freeze_ticks, target, start_tick)
            if target_team is None or winner != target_team:
                continue
            was_clutch = False
            for tick in round_ticks_sorted:
                tick_rows = round_snap[round_snap["tick"] == tick]
                trow = tick_rows[tick_rows["steamid"].astype(str) == target]
                if trow.empty or not bool(trow.iloc[0]["is_alive"]):
                    continue
                target_team_num = int(trow.iloc[0]["team_num"])
                teammates_alive = len(tick_rows[
                    (tick_rows["team_num"] == target_team_num) & (tick_rows["is_alive"])
                    & (tick_rows["steamid"].astype(str) != target)
                ])
                enemies_alive = len(tick_rows[(tick_rows["team_num"] != target_team_num) & (tick_rows["is_alive"])])
                if teammates_alive == 0 and enemies_alive >= 1:
                    was_clutch = True
                    break
            if was_clutch and target_team == "T" and is_fake_t_clutch(round_number):
                was_clutch = False
            if was_clutch:
                clutches_won += 1
        metrics["clutches_won"] = clutches_won

        # --- 3. Utility Dmg/Round — the aggregate m_iUtilityDamage scoreboard stat, sampled at
        # the last tick of the match (it's a running total, so the final round's value is the
        # match total) and divided by round count, same shape as ADR's total_damage/rounds_played.
        try:
            last_tick = max(end_tick for _, end_tick, _ in round_bounds.values())
            util_snap = parser.parse_ticks(["utility_damage_total"], ticks=[last_tick])
            util_row = util_snap[util_snap["steamid"].astype(str) == target]
            if not util_row.empty:
                utility_damage_total = float(util_row.iloc[0]["utility_damage_total"])
                metrics["utility_dmg_per_round"] = round(utility_damage_total / len(round_bounds), 1)
        except Exception as e:
            print(f"⚠️ Warning parsing utility_damage_total: {e}")

        # --- 4. Trade Kill % — of target's own kills, what share avenged a teammate: the enemy
        # they killed had killed one of target's teammates within TRADE_KILL_WINDOW_TICKS (the
        # same 3-second trade window fact_positioning_risk already uses, just applied in the
        # other direction — crediting the trader instead of flagging the traded death).
        my_kills = deaths_df[deaths_df["attacker_steamid"].astype(str) == target]
        if not my_kills.empty:
            trade_kills = 0
            for _, kill in my_kills.iterrows():
                kill_tick = int(kill["tick"])
                enemy_steamid = str(kill["user_steamid"])
                window_start = kill_tick - TRADE_KILL_WINDOW_TICKS
                prior_enemy_kills = deaths_df[
                    (deaths_df["attacker_steamid"].astype(str) == enemy_steamid)
                    & (deaths_df["tick"] >= window_start) & (deaths_df["tick"] < kill_tick)
                ]
                if prior_enemy_kills.empty:
                    continue
                target_team = _team_for(team_snap, freeze_ticks, target, kill_tick)
                for _, prior_kill in prior_enemy_kills.iterrows():
                    victim = str(prior_kill["user_steamid"])
                    if victim == target:
                        continue
                    if _team_for(team_snap, freeze_ticks, victim, kill_tick) == target_team:
                        trade_kills += 1
                        break
            metrics["trade_kill_pct"] = round(100 * trade_kills / len(my_kills), 1)

        # --- 5. KAST % — per round, did target get a Kill, an Assist, Survive to round end,
        # or die but get Traded (a teammate killed their killer within TRADE_KILL_WINDOW_TICKS)?
        # All four ingredients reuse data/logic already computed elsewhere in this file (kills
        # via deaths_df, the trade window via TRADE_KILL_WINDOW_TICKS) — assembly, not new
        # extraction, per CS2_ANALYTICS_STANDARDS.md's KAST entry.
        assist_col = "assister_steamid" if "assister_steamid" in deaths_df.columns else None
        kast_rounds = 0
        for start_tick, end_tick, _winner in round_bounds.values():
            round_deaths = deaths_df[(deaths_df["tick"] >= start_tick) & (deaths_df["tick"] <= end_tick)]

            got_kill = not round_deaths[round_deaths["attacker_steamid"].astype(str) == target].empty
            got_assist = (
                assist_col is not None
                and not round_deaths[round_deaths[assist_col].astype(str) == target].empty
            )
            target_death = round_deaths[round_deaths["user_steamid"].astype(str) == target]
            survived = target_death.empty

            was_traded = False
            if not survived:
                death_row = target_death.sort_values("tick").iloc[0]
                death_tick = int(death_row["tick"])
                attacker = str(death_row["attacker_steamid"])
                target_team = _team_for(team_snap, freeze_ticks, target, death_tick)
                revenge_kills = deaths_df[
                    (deaths_df["user_steamid"].astype(str) == attacker)
                    & (deaths_df["tick"] > death_tick) & (deaths_df["tick"] <= death_tick + TRADE_KILL_WINDOW_TICKS)
                ]
                for _, r in revenge_kills.iterrows():
                    killer = str(r["attacker_steamid"])
                    if _team_for(team_snap, freeze_ticks, killer, death_tick) == target_team:
                        was_traded = True
                        break

            if got_kill or got_assist or survived or was_traded:
                kast_rounds += 1
        metrics["kast_pct"] = round(100 * kast_rounds / len(round_bounds), 1)

        # --- 6. Weapon-segmented stats — kills/damage grouped by weapon class, plus AWP broken
        # out individually since NEXT_STEPS.md names it explicitly ("AWP kills, rifle vs. pistol
        # performance"). AWP intentionally double-counts under "sniper" too — it's a named
        # callout on top of the class breakdown, not a replacement for it. Classification is
        # name-substring based (see _classify_weapon_by_name's docstring for why).
        my_kills_all = deaths_df[deaths_df["attacker_steamid"].astype(str) == target]
        my_damage_all = (
            hurt_df[hurt_df["attacker_steamid"].astype(str) == target]
            if not hurt_df.empty and "attacker_steamid" in hurt_df.columns else pd.DataFrame()
        )
        weapon_segmented_stats = {}
        for weapon_class in list(WEAPON_CLASS_KEYWORDS.keys()) + ["awp"]:
            if weapon_class == "awp":
                kill_mask = my_kills_all["weapon"].astype(str).str.contains("awp", case=False, na=False)
                dmg_mask = (
                    my_damage_all["weapon"].astype(str).str.contains("awp", case=False, na=False)
                    if not my_damage_all.empty else None
                )
            else:
                kill_mask = my_kills_all["weapon"].apply(_classify_weapon_by_name) == weapon_class
                dmg_mask = (
                    my_damage_all["weapon"].apply(_classify_weapon_by_name) == weapon_class
                    if not my_damage_all.empty else None
                )
            kills = int(kill_mask.sum()) if not my_kills_all.empty else 0
            damage = capped_damage_sum(my_damage_all[dmg_mask]) if dmg_mask is not None else 0.0
            if kills > 0 or damage > 0:
                weapon_segmented_stats[weapon_class] = {"kills": kills, "damage": round(damage, 1)}
        metrics["weapon_segmented_stats"] = weapon_segmented_stats or None

        # --- 7. Kills/damage in round wins vs. losses — same round_bounds-with-winner pattern
        # already used for entry_success_pct/clutches_won above, split by whether target's team
        # won that round.
        kills_damage_by_outcome = {
            "wins": {"kills": 0, "damage": 0.0},
            "losses": {"kills": 0, "damage": 0.0},
        }
        for start_tick, end_tick, winner in round_bounds.values():
            round_team = _team_for(team_snap, freeze_ticks, target, start_tick)
            if round_team is None:
                continue
            outcome = "wins" if winner == round_team else "losses"
            round_kills = my_kills_all[(my_kills_all["tick"] >= start_tick) & (my_kills_all["tick"] <= end_tick)]
            kills_damage_by_outcome[outcome]["kills"] += len(round_kills)
            if not my_damage_all.empty:
                round_damage = my_damage_all[(my_damage_all["tick"] >= start_tick) & (my_damage_all["tick"] <= end_tick)]
                kills_damage_by_outcome[outcome]["damage"] += capped_damage_sum(round_damage)
        kills_damage_by_outcome["wins"]["damage"] = round(kills_damage_by_outcome["wins"]["damage"], 1)
        kills_damage_by_outcome["losses"]["damage"] = round(kills_damage_by_outcome["losses"]["damage"], 1)
        metrics["kills_damage_by_round_outcome"] = kills_damage_by_outcome

        # --- 8. Kill distance buckets — close/medium/long, a RoundSync-original methodology
        # since no industry-published bucket boundaries exist (checked; see IDEAS.md #6 and
        # CS2_ANALYTICS_STANDARDS.md's Kill distance entry for the real sourcing trail).
        # Boundaries anchor to two independently-cited real facts, not arbitrary guesses:
        #   - close: 0-30m — reuses ENEMY_CONTESTED_RANGE_UNITS, already cited elsewhere in this
        #     file as assault rifles' effective-accuracy range.
        #   - medium: 30-50m — rifles retain near-max damage under 50m per CS2's own damage
        #     falloff curve, confirmed via 2 independent sources.
        #   - long: 50m+ — where falloff becomes clearly noticeable per the same sources.
        # Distances are 2D (X/Y only), matching the convention fact_positioning_risk already
        # uses for teammate/enemy distance. This buckets kills already made, NOT a shots-fired
        # accuracy-per-bucket — that needs the enemy-visibility primitive Tier 2's true-accuracy
        # rebuild is blocked on (see NEXT_STEPS.md's Dependency Map); headshot% within a bucket
        # doesn't need that primitive since it's already known which shots resulted in kills.
        CLOSE_RANGE_MAX_UNITS = ENEMY_CONTESTED_RANGE_UNITS  # ≈ 30m
        MEDIUM_RANGE_MAX_UNITS = round(50 * CS2_UNITS_PER_METER, -2)  # ≈ 50m

        kill_distance_buckets = {
            "close": {"kills": 0, "headshots": 0},
            "medium": {"kills": 0, "headshots": 0},
            "long": {"kills": 0, "headshots": 0},
        }
        if not my_kills_all.empty:
            kill_ticks = sorted(my_kills_all["tick"].unique().tolist())
            kill_pos_snap = parser.parse_ticks(["X", "Y"], ticks=kill_ticks)
            for _, kill in my_kills_all.iterrows():
                tick = int(kill["tick"])
                victim = str(kill["user_steamid"])
                tick_rows = kill_pos_snap[kill_pos_snap["tick"] == tick]
                attacker_row = tick_rows[tick_rows["steamid"].astype(str) == target]
                victim_row = tick_rows[tick_rows["steamid"].astype(str) == victim]
                if attacker_row.empty or victim_row.empty:
                    continue
                dx = float(attacker_row.iloc[0]["X"]) - float(victim_row.iloc[0]["X"])
                dy = float(attacker_row.iloc[0]["Y"]) - float(victim_row.iloc[0]["Y"])
                dist_units = (dx ** 2 + dy ** 2) ** 0.5
                bucket = "close" if dist_units <= CLOSE_RANGE_MAX_UNITS else (
                    "medium" if dist_units <= MEDIUM_RANGE_MAX_UNITS else "long"
                )
                kill_distance_buckets[bucket]["kills"] += 1
                if bool(kill.get("headshot")):
                    kill_distance_buckets[bucket]["headshots"] += 1
        metrics["kill_distance_buckets"] = kill_distance_buckets
    except Exception as e:
        print(f"⚠️ Warning parsing match secondary metrics: {e}")
    return metrics


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
            elif response.status_code in (401, 403):
                # A bad/revoked VALVE_API_KEY won't fix itself by retrying — same "don't retry
                # a permanent failure" principle as the 412 case above and the gc-worker Steam
                # login fix. Small impact here (3 attempts max, not forever), but still real.
                print(f"Valve API returned {response.status_code}: API key rejected — not retrying.")
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
        match_client_version = None
        try:
            header = parser.parse_header()
            map_name = header.get("map_name")
            # e.g. "csgo_v2000885" -> 2000885 — same version number
            # tools/extract_map_callouts.py tags dim_map_callout rows with, so the two can be
            # compared below instead of just tracked separately (see tools/README.md).
            version_match = re.search(r"_v(\d+)", header.get("game_directory") or "")
            if version_match:
                match_client_version = int(version_match.group(1))
        except Exception as e:
            print(f"⚠️ Warning parsing header: {e}")

        # Real per-map bombsite callout points (label + X/Y), fetched once per match and reused
        # for every plant this match has — resolves the raw numeric bomb_site code from the demo
        # into a real "A"/"B" letter via nearest-callout matching (_resolve_bomb_site).
        bomb_site_callouts = []
        if map_name:
            try:
                callout_res = (
                    supabase_client.table("dim_map_callout")
                    .select("callout_name, origin_x, origin_y, origin_z, extracted_client_version")
                    .eq("map_name", map_name)
                    .ilike("callout_name", "%bombsite%")
                    .execute()
                )
                # Normalize "BombsiteA"/"BombsiteB" (the raw env_cs_place label) down to just
                # "A"/"B", matching the short form the historical backfill already wrote — a
                # single-bombsite map's label ("BombSite", capital S, e.g. de_debris) has no
                # letter suffix to strip and is left as-is.
                bomb_site_callouts = [
                    (row["callout_name"].removeprefix("Bombsite") or row["callout_name"],
                     row["origin_x"], row["origin_y"], row["origin_z"])
                    for row in callout_res.data
                ]
                # Staleness CHECK, not just tracking — closes the gap tools/README.md flagged as
                # "known, not built yet". CS2 map updates can move/rename callout zones; this
                # doesn't block anything (still uses the old coordinates, better than none), but
                # makes a real map update visible in the logs instead of silently trusting
                # possibly-outdated geometry.
                if match_client_version:
                    callout_versions = {
                        row["extracted_client_version"] for row in callout_res.data
                        if row.get("extracted_client_version")
                    }
                    stale_versions = {v for v in callout_versions if v < match_client_version}
                    if stale_versions:
                        print(
                            f"⚠️ STALE CALLOUT DATA for {map_name}: extracted at version(s) "
                            f"{sorted(stale_versions)}, but this match is version "
                            f"{match_client_version} (newer). Bomb-site resolution may be using "
                            f"outdated zone coordinates — re-run tools/extract_map_callouts.py "
                            f"and tools/load_map_callouts.py."
                        )
            except Exception as e:
                print(f"⚠️ Warning fetching bombsite callouts for {map_name}: {e}")

        total_kills = 0
        total_deaths = 0
        total_assists = 0
        headshots = 0
        rounds_played = 0
        deaths_df = pd.DataFrame()

        # m_totalRoundsPlayed (the previous source for rounds_played) only increments once a
        # round officially concludes, so a kill in the FINAL round of the match still reports
        # the round count from before that round finished — undercounting by 1 in whichever
        # matches happen to end on a kill. round_freeze_end fires at the start of every round
        # instead, including the last one, and is the same source every fact_* extractor below
        # already uses to count rounds — confirmed self-consistent across all of them.
        freeze_ticks = []
        try:
            freeze_end_df = parse_event(parser, "round_freeze_end")
            rounds_played = len(freeze_end_df)
            freeze_ticks = sorted(freeze_end_df["tick"].tolist()) if not freeze_end_df.empty else []
        except Exception as e:
            print(f"⚠️ Warning parsing round count: {e}")

        try:
            deaths_df = parse_event(parser, "player_death")
            if not deaths_df.empty:
                if "attacker_steamid" in deaths_df.columns:
                    user_kills = deaths_df[deaths_df["attacker_steamid"].astype(str) == str(target_steam_id64)]
                    total_kills = len(user_kills)
                    if "headshot" in user_kills.columns:
                        headshots = len(user_kills[user_kills["headshot"] == True])
                if "user_steamid" in deaths_df.columns:
                    user_deaths = deaths_df[deaths_df["user_steamid"].astype(str) == str(target_steam_id64)]
                    total_deaths = len(user_deaths)
                # assister_steamid was already parsed for KAST (below) but never counted into a
                # real per-player assists stat — NEXT_STEPS.md Band 7 flagged the frontend as
                # missing Assists entirely, and there was no backend field to surface at all.
                if "assister_steamid" in deaths_df.columns:
                    user_assists = deaths_df[deaths_df["assister_steamid"].astype(str) == str(target_steam_id64)]
                    total_assists = len(user_assists)
        except Exception as e:
            print(f"⚠️ Warning parsing deaths: {e}")

        total_damage = 0.0
        headshot_accuracy_pct = None
        try:
            hurt_df = parse_event(parser, "player_hurt")
            if not hurt_df.empty and "attacker_steamid" in hurt_df.columns and "dmg_health" in hurt_df.columns:
                user_damage = hurt_df[hurt_df["attacker_steamid"].astype(str) == str(target_steam_id64)]
                total_damage = capped_damage_sum(user_damage)
                # % of HITS on the head, not % of kills headshotted (that's headshot_pct below) —
                # hitgroup 1 = head, the standard Source-engine hitgroup enum (confirmed via
                # Valve SDK's shareddefs.h; unchanged since CS:S/CS:GO, still used in CS2).
                if "hitgroup" in user_damage.columns and not user_damage.empty:
                    head_hits = len(user_damage[user_damage["hitgroup"] == 1])
                    headshot_accuracy_pct = round(100 * head_hits / len(user_damage), 1)
        except Exception as e:
            print(f"⚠️ Warning parsing damage: {e}")

        # Shared events every extract_fact_* function below used to re-parse independently
        # (round_freeze_end/player_death/player_hurt above, plus these) — up to 8x per sync for
        # round_freeze_end alone. Parsed once here and passed into every function instead
        # (Tier 9, NEXT_STEPS.md). fire_bullets/player_bullet_hit are the richer sources
        # fact_duel_placement's rebuild uses (Tier 9.5) — see _build_slot_to_steamid_map's
        # docstring for why player_bullet_hit needs bullet_damage to resolve its slot numbers.
        round_end_df = pd.DataFrame()
        fire_df = pd.DataFrame()
        fire_bullets_df = pd.DataFrame()
        bullet_hit_df = pd.DataFrame()
        slot_to_steamid = {}
        bomb_planted_df = pd.DataFrame()
        try:
            round_end_df = parse_event(parser, "round_end")
            fire_df = parse_event(parser, "weapon_fire")
            fire_bullets_df = parse_event(parser, "fire_bullets", other=["angles_x", "angles_y", "angles_z"])
            bullet_hit_df = parse_event(parser, "player_bullet_hit")
            bullet_damage_df = parse_event(parser, "bullet_damage")
            slot_to_steamid = _build_slot_to_steamid_map(bullet_hit_df, bullet_damage_df)
            bomb_planted_df = parse_event(parser, "bomb_planted")
        except Exception as e:
            print(f"⚠️ Warning parsing shared round_end/weapon_fire/fire_bullets/player_bullet_hit/bomb_planted: {e}")

        # Rounds where target got a 2/3/4/5(ace)-kill — pure aggregation of deaths_df, already
        # parsed above; grouped by round via the same _round_for helper every fact_* extractor uses.
        multi_kill_rounds = None
        try:
            if not deaths_df.empty and "attacker_steamid" in deaths_df.columns and freeze_ticks:
                user_kills_for_multi = deaths_df[deaths_df["attacker_steamid"].astype(str) == str(target_steam_id64)]
                kills_per_round = {}
                for _, k in user_kills_for_multi.iterrows():
                    rnd = _round_for(freeze_ticks, int(k["tick"]))
                    kills_per_round[rnd] = kills_per_round.get(rnd, 0) + 1
                multi_kill_rounds = {"2k": 0, "3k": 0, "4k": 0, "ace": 0}
                for count in kills_per_round.values():
                    if count == 2:
                        multi_kill_rounds["2k"] += 1
                    elif count == 3:
                        multi_kill_rounds["3k"] += 1
                    elif count == 4:
                        multi_kill_rounds["4k"] += 1
                    elif count >= 5:
                        multi_kill_rounds["ace"] += 1
        except Exception as e:
            print(f"⚠️ Warning parsing multi_kill_rounds: {e}")

        calculated_kd = round(total_kills / max(1, total_deaths), 2)
        headshot_pct = round((headshots / max(1, total_kills)) * 100, 1) if total_kills > 0 else 0.0
        calculated_adr = round(total_damage / max(1, rounds_played), 1) if rounds_played > 0 else 0.0

        # Rank at match START (not current rank) for the Recent Matches card — the demo's own
        # rank_update event carries rank_old (pre-match) alongside rank_new (post-match, already
        # used elsewhere). Only ranked Premier matches fire this event, so it's None for
        # unranked/other modes — the frontend shows "—" for that match's rank pill in that case.
        _rank_new_unused, rank_at_match_start, _rank_type_unused = _get_player_rank(parser, target_steam_id64)

        secondary_metrics = extract_match_secondary_metrics(parser, target_steam_id64, freeze_ticks, round_end_df, deaths_df, bomb_planted_df, hurt_df)

        fact_economy_rows = extract_fact_economy(parser, target_steam_id64, freeze_ticks)
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

        fact_utility_rows = extract_fact_utility_throw(parser, target_steam_id64, freeze_ticks, fire_df, hurt_df, deaths_df)
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

        fact_adaptation_rows = extract_fact_adaptation_event(
            parser, target_steam_id64, freeze_ticks, deaths_df, round_end_df, bomb_site_callouts
        )
        if fact_adaptation_rows:
            try:
                for r in fact_adaptation_rows:
                    r["match_id"] = match_code
                supabase_client.table("fact_adaptation_event").upsert(
                    fact_adaptation_rows,
                    on_conflict="match_id,round_number,steam_id64,trigger_type,trigger_tick,teammate_steamid,source_enemy_steamid"
                ).execute()
                print(f"✅ Saved {len(fact_adaptation_rows)} fact_adaptation_event rows for {match_code}")
            except Exception as e:
                print(f"⚠️ Failed to save fact_adaptation_event: {e}")

        fact_positioning_rows = extract_fact_positioning_risk(parser, target_steam_id64, freeze_ticks, round_end_df, deaths_df)
        if fact_positioning_rows:
            try:
                for r in fact_positioning_rows:
                    r["match_id"] = match_code
                supabase_client.table("fact_positioning_risk").upsert(
                    fact_positioning_rows, on_conflict="match_id,round_number,steam_id64,commitment_tick"
                ).execute()
                print(f"✅ Saved {len(fact_positioning_rows)} fact_positioning_risk rows for {match_code}")
            except Exception as e:
                print(f"⚠️ Failed to save fact_positioning_risk: {e}")

        fact_duel_rows = extract_fact_duel_placement(
            parser, target_steam_id64, freeze_ticks, fire_df, deaths_df,
            fire_bullets_df, bullet_hit_df, slot_to_steamid
        )
        if fact_duel_rows:
            try:
                for r in fact_duel_rows:
                    r["match_id"] = match_code
                supabase_client.table("fact_duel_placement").upsert(
                    fact_duel_rows, on_conflict="match_id,round_number,steam_id64,engagement_tick"
                ).execute()
                print(f"✅ Saved {len(fact_duel_rows)} fact_duel_placement rows for {match_code}")
            except Exception as e:
                print(f"⚠️ Failed to save fact_duel_placement: {e}")

        fact_engage_rows = extract_fact_engage_decision(
            parser, target_steam_id64, freeze_ticks, round_end_df, deaths_df, hurt_df, fire_df
        )
        if fact_engage_rows:
            try:
                for r in fact_engage_rows:
                    r["match_id"] = match_code
                supabase_client.table("fact_engage_decision").upsert(
                    fact_engage_rows, on_conflict="match_id,round_number,steam_id64,decision_tick"
                ).execute()
                print(f"✅ Saved {len(fact_engage_rows)} fact_engage_decision rows for {match_code}")
            except Exception as e:
                print(f"⚠️ Failed to save fact_engage_decision: {e}")

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
                "assists": total_assists,
                "headshot_pct": headshot_pct,
                "total_damage": total_damage,
                "headshots": headshots,
                "rounds_played": rounds_played,
                "rank_at_match_start": rank_at_match_start,
                "entry_success_pct": secondary_metrics["entry_success_pct"],
                "utility_dmg_per_round": secondary_metrics["utility_dmg_per_round"],
                "clutches_won": secondary_metrics["clutches_won"],
                "trade_kill_pct": secondary_metrics["trade_kill_pct"],
                "kast_pct": secondary_metrics["kast_pct"],
                "weapon_segmented_stats": secondary_metrics["weapon_segmented_stats"],
                "kills_damage_by_round_outcome": secondary_metrics["kills_damage_by_round_outcome"],
                "kill_distance_buckets": secondary_metrics["kill_distance_buckets"],
                "headshot_accuracy_pct": headshot_accuracy_pct,
                "multi_kill_rounds": multi_kill_rounds,
                "processing_seconds": round(time.time() - start_time, 1)
            }
        }

        supabase_client.table("matches").update({
            "match_data": real_payload,
            "map": map_name
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
