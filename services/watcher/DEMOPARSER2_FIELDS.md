# demoparser2 field reference

Captured from https://github.com/LaihoE/demoparser (`README.md`) on 2026-08-23,
so RoundSync doesn't have to re-research field names every time a new coaching
fact category gets built. Re-check the source if a field below stops working —
this is a snapshot, not a guarantee it stays accurate forever.

**Sub-tick vs. tick rate (researched 2026-08-25, don't re-derive this):** CS2's
sub-tick input system gives client-side player *inputs* (fire, move, jump)
precise sub-tick timestamps for hit-registration purposes, but this does
**not** change the underlying 64Hz world-simulation tick rate, and it does
**not** give demo events fractional tick values — every event in a `.dem`
file (`player_blind`, `flashbang_detonate`, deaths, etc.) is still logged
against a whole simulation tick. `TICK_RATE = 64.0` in `sync_pipeline.py` is
correct and unaffected by sub-tick. This was confirmed empirically too: a
flashbang's `player_blind` rows share the *exact* tick of their
`flashbang_detonate` event (verified against a live demo, not assumed) — the
basis for the entity-ID-reuse fix in `extract_fact_utility_throw`.

## How this parser works (two calling patterns)

```python
from demoparser2 import DemoParser
parser = DemoParser("path_to_demo.dem")

# Per-event rows (kills, hurts, round boundaries, etc.) — event name plus
# optional extra tick-level fields attached to each event row via `other=`.
event_df = parser.parse_event("player_death", player=["X", "Y"], other=["total_rounds_played"])

# Per-tick snapshots of any field(s) below, for all players or a specific list.
ticks_df = parser.parse_ticks(["X", "Y"])
```

**Important, not fully resolvable from docs alone:** there is no published list of
every valid *event* name (`player_death`, `round_end`, `bomb_planted`, etc.) —
only `parser.list_game_events()` run against a real `.dem` file tells you for
certain what events exist in a given match. The tables below are *tick-level
fields* (usable with `parse_ticks` or as `other=` columns on any event), which
ARE fully documented. Do not assume an event name exists without checking
`list_game_events()` on a real file first.

## Player data (per-tick, per-player)

| Field | Real CS2 prop |
|---|---|
| X / Y / Z | `m_vec` + `m_cell` |
| health | `m_iHealth` |
| score | `m_iScore` |
| mvps | `m_iMVPs` |
| is_alive | `m_bPawnIsAlive` |
| balance | `m_iAccount` |
| inventory / inventory_as_ids | (derived) |
| life_state | `m_lifeState` |
| pitch / yaw | `m_angEyeAngles[0]` / `[1]` |
| rank | `m_iCompetitiveRanking` |
| rank_if_win / rank_if_loss / rank_if_tie | `m_iCompetitiveRankingPredicted_*` |
| comp_wins | `m_iCompetitiveWins` |
| comp_rank_type | `m_iCompetitiveRankType` |
| has_defuser | `m_bPawnHasDefuser` |
| has_helmet | `m_bPawnHasHelmet` |
| player_name / player_steamid | `m_iszPlayerName` / `m_steamID` |
| start_balance | `m_iStartAccount` — money before the buy phase |
| total_cash_spent | `m_iTotalCashSpent` |
| cash_spent_this_round | `m_iCashSpentThisRound` |
| ping | `m_iPing` |
| team_num | `m_iTeamNum` |
| active_weapon | `m_hActiveWeapon` (handle — see Weapon table for the resolved name) |
| in_crouch / ducked / ducking / is_walking / is_strafing | movement state props |
| weapon_purchases_this_match / weapon_purchases_this_round | `m_iWeaponPurchasesThis*` |
| spotted / approximate_spotted_by | `m_bSpotted` / `m_bSpottedByMask` |
| is_defusing / is_grabbing_hostage | action-state props |
| in_bomb_zone / in_buy_zone / in_no_defuse_area / in_hostage_rescue_zone | zone props |
| stamina | `m_flStamina` |
| shots_fired | `m_iShotsFired` |
| armor_value | `m_ArmorValue` |
| flash_duration / flash_max_alpha | `m_flFlashDuration` / `m_flFlashMaxAlpha` |
| last_place_name | `m_szLastPlaceName` — named map callout the player is standing in |
| round_start_equip_value | `m_unRoundStartEquipmentValue` — resulting loadout value after the buy |
| current_equip_value | `m_unCurrentEquipmentValue` |
| velocity / velocity_X/Y/Z | (derived) |
| aim_punch_angle / aim_punch_angle_vel | recoil-kick props |

(Full raw table has ~90 player-data fields total, including cosmetics like
`glove_paint_id`/`music_kit_id` that are irrelevant to coaching — trimmed here
to the ones with plausible use; see the source URL above for literally everything.)

## Buttons (per-tick, boolean)

`FORWARD`, `LEFT`, `RIGHT`, `BACK`, `FIRE`, `RIGHTCLICK`, `RELOAD`, `INSPECT`,
`USE`, `ZOOM`, `SCOREBOARD`, `WALK` — all derived from the raw `buttons`
bitmask (`m_nButtonDownMaskPrev`).

## Game State (per-tick, match/round-level — not per-player)

| Field | Real CS2 prop | Why it might matter for coaching facts |
|---|---|---|
| team_rounds_total | `m_iScore` | |
| team_score_first_half / team_score_second_half | `m_scoreFirstHalf` / `m_scoreSecondHalf` | |
| is_freeze_period | `m_bFreezePeriod` | flips false = round just went live; the tick to sample loadout at |
| total_rounds_played | `m_totalRoundsPlayed` | the real rounds-played fix uses this |
| is_bomb_dropped / is_bomb_planted | `m_bBombDropped` / `m_bBombPlanted` | |
| **round_win_status** | `m_iRoundWinStatus` | which side won |
| **round_win_reason** | `m_eRoundWinReason` | **bomb defused / exploded / elimination / time out — readable directly as a tick prop, no `round_end` event needed** |
| terrorist_cant_buy / ct_cant_buy | `m_bTCantBuy` / `m_bCTCantBuy` | |
| **ct_losing_streak / t_losing_streak** | `m_iNumConsecutiveCTLoses` / `...Terrorist...` | **real, hard-fact loss-streak counter per team — directly relevant to the Liquipedia force-buy definition ("breaking the enemy's economy" after a losing streak)** |
| round_in_progress | `m_bRoundInProgress` | |

## Weapon (per-tick, resolves what's actually in a player's hands)

| Field | Real CS2 prop |
|---|---|
| active_weapon_name | `m_iItemDefinitionIndex` + lookup — the actual weapon name string |
| active_weapon_skin | `m_iRawValue32` + lookup |
| active_weapon_ammo | `m_iClip1` |
| total_ammo_left | `m_pReserveAmmo` |
| item_def_idx | `m_iItemDefinitionIndex` |
| is_silencer_on | `m_bSilencerOn` |
| zoom_lvl | `m_zoomLevel` |

(Full table has ~55 weapon fields, mostly cosmetic — skins, paint seeds,
stickers, float/wear values. Irrelevant to coaching, trimmed here.)

## usercommands (raw client input, per-tick)

`usercmd_viewangle_x/y/z`, `usercmd_buttonstate_1/2/3`, `usercmd_forward_move`,
`usercmd_left_move`, `usercmd_mouse_dx/dy`, `usercmd_weapon_select`, etc. —
lower-level than the derived Player/Button fields above; probably not needed
unless a future category needs raw input timing.

## Aggregate stats (updates once per round, per player — scoreboard-style totals)

| Field | Real CS2 prop |
|---|---|
| kills_total / deaths_total / assists_total | `m_iKills` / `m_iDeaths` / `m_iAssists` |
| headshot_kills_total | `m_iHeadShotKills` |
| ace_rounds_total / 4k_rounds_total / 3k_rounds_total | `m_iEnemy5Ks` / `4Ks` / `3Ks` |
| damage_total | `m_iDamage` |
| utility_damage_total | `m_iUtilityDamage` |
| enemies_flashed_total | `m_iEnemiesFlashed` |
| equipment_value_total | `m_iEquipmentValue` |
| money_saved_total | `m_iMoneySaved` |
| kill_reward_total | `m_iKillReward` |
| cash_earned_total | `m_iCashEarned` |

## Full confirmed event list (2026-08-23, ran `list_game_events()` against a real downloaded match)

All 49 real events, confirmed empirically against an actual `.dem` file, not assumed:

```
announce_phase_end, begin_new_match, bomb_begindefuse, bomb_beginplant,
bomb_defused, bomb_dropped, bomb_exploded, bomb_pickup, bomb_planted,
bullet_damage, buytime_ended, chat_message, cs_pre_restart,
cs_round_final_beep, cs_round_start_beep, cs_win_panel_match,
decoy_detonate, decoy_started, fire_bullets, flashbang_detonate,
hegrenade_detonate, hltv_versioninfo, inferno_expire, inferno_startburn,
item_equip, item_pickup, other_death, player_blind, player_bullet_hit,
player_death, player_disconnect, player_footstep, player_hurt,
player_spawn, player_team, rank_update, round_announce_last_round_half,
round_announce_match_point, round_announce_match_start, round_freeze_end,
round_officially_ended, round_poststart, round_prestart, server_cvar,
smokegrenade_detonate, smokegrenade_expired, weapon_fire, weapon_reload,
weapon_zoom
```

**No `item_purchase` event exists** — confirmed, not assumed. `player_death`
and `player_hurt` (both already used in `sync_pipeline.py`) plus `round_end`
and `player_blind` (referenced in the granularity design, not yet coded) are
all confirmed real, exact matches to what the design assumed.

**How to detect a real weapon purchase, since there's no dedicated event:**
`item_equip` fires whenever a player equips an item — including buys, since
buying in CS2 auto-equips. Columns: `item` (exact weapon name string),
`weptype` (numeric weapon-class code), `user_steamid`, `tick`, plus whatever
`other=` fields you request (e.g. `total_rounds_played`, `is_freeze_period`).
Filter to `is_freeze_period == True` (or the tick range before that round's
`buytime_ended` event) to isolate real buy-phase equips from mid-round weapon
swaps (picking up a dropped gun, etc.).

**`weptype` mapping, confirmed empirically from real match data** (not the
public enum assumed from memory — actually verified against real equip rows):

| weptype | Weapon class | Items seen |
|---|---|---|
| 0 | Knife | `knife` |
| 1 | Pistol | `deagle`, `elite`, `fiveseven`, `glock`, `hkp2000`, `p250`, `tec9` |
| 2 | SMG | `bizon`, `mac10`, `mp7`, `mp9`, `p90`, `ump45` |
| 3 | Rifle | `ak47`, `m4a1`, `sg556` |
| 4 | Shotgun | `mag7`, `nova`, `xm1014` |
| 5 | Sniper | `awp`, `ssg08` |
| 7 | C4 | `c4` |
| 8 | Zeus | `taser` |
| 9 | Grenade | `decoy`, `flashbang`, `hegrenade`, `incgrenade`, `molotov`, `smokegrenade` |

(weptype 6, machine gun, wasn't purchased in this sample match — not seen,
not necessarily nonexistent.)

This mapping is exactly what `fact_economy`'s `loadout_tier` classification
needs: weptype 1 (with cheap items only) = pistol/eco round, weptype 2 or 4 =
the "upgrade weapon, incomplete kit" force-buy signature, weptype 3/5 = rifle
tier = full buy.

`buytime_ended` fires once per round (20 rows for a ~19-round real match —
close enough that the off-by-one is probably a pre-match/warmup firing, not
investigated further) with just a `tick` column — a second, independent way
to mark the buy-phase boundary alongside `is_freeze_period`.

## FULL CRAWL (2026-08-23) — every event's real columns, every special parse method

Ran `parser.parse_event(name)` for all 49 events, plus `parse_grenades()`,
`parse_player_info()`, `parse_item_drops()`, `parse_skins()`, `parse_voice()`,
and the `inventory`/`inventory_as_ids` tick fields, against the same real
demo. This is the actual, inspected shape of everything — not just names.

### BREAKTHROUGH: `rank_update` event solves the skill-context dimension

The GC `rankings` field (investigated earlier this session) came back empty
twice and looked like a dead end. **The demo file itself has a real,
populated `rank_update` event that GC access didn't need at all:**

```
columns: ['num_wins', 'rank_change', 'rank_new', 'rank_old', 'rank_type_id', 'tick', 'user_name', 'user_steamid']
sample:  {'num_wins': 66, 'rank_change': -229.0, 'rank_new': 7739, 'rank_old': 7968, 'rank_type_id': 11, ...}
10 rows — one per player in the match, all 10, not just the bot's own account.
```

This directly resolves the skill-context/lobby-rank question — reroute that
whole design away from the GC path (dead end) to `parser.parse_event("rank_update")`
instead. `rank_type_id` distinguishes Premier/Competitive/Wingman.

### Header (`parse_header()`)

`map_name`, `server_name`, `demo_version_guid`, `demo_version_name`,
`patch_version`, `demo_file_stamp`, `game_directory`, `client_name`,
`fullpackets_version`, `allow_clientside_entities`, `allow_clientside_particles`.
(`map_name` is what `sync_pipeline.py` already reads.)

### Every event, real columns (grouped by relevance)

**Kills/damage/aim — richer than assumed:**
- `player_death`: `assistedflash`, `assister_name/steamid`, `attacker_name/steamid`, `attackerblind`, `attackerinair`, `distance`, `dmg_armor`, `dmg_health`, `dominated`, `headshot`, `hitgroup`, `noscope`, `penetrated`, `revenge`, `thrusmoke`, `weapon`, `wipe`, `tick`.
- `player_hurt`: `armor`, `attacker_name/steamid`, `dmg_armor`, `dmg_health`, `health`, `hitgroup`, `weapon`, `tick`.
- `player_blind`: `attacker_name/steamid`, `blind_duration`, `entityid`, `tick` — exact flash-effectiveness data category 2 needs.
- `bullet_damage`: per-shot ballistics — `aim_punch_x/y/z`, `distance`, `inaccuracy_air/move/total`, `no_scope`, `num_penetrations`, `shoot_ang_x/y/z`, `recoil_index`, attacker/victim.
- `player_bullet_hit`: `attacker_slot`, `damage`, `hit_group`, `is_kill`, `penetration_count`, `round` (!), `victim_pos_x/y/z`, `victim_slot` — **has `round` directly on the row and full victim position, richer than `weapon_fire` for category 5 (crosshair placement)**.
- `fire_bullets`: `angles_x/y/z` (shooter's exact aim), `origin_x/y/z`, `player_inair`, `player_scoped`, `recoil_index`, `spread`, `round`, `weapon_id` — this is the real per-shot view-angle source, richer than assumed.
- `other_death`: same shape as player_death but for killing props/entities, not players — low coaching value.

**Economy/purchases:**
- `item_equip`: (see weptype table above) — real weapon/purchase signal.
- `item_pickup`: `defindex`, `item`, `silent`, `tick` — picking up items off the ground (dropped guns), distinguishable from buys via `is_freeze_period`/timing, not a separate purchase flag itself.
- `bomb_dropped` / `bomb_pickup`: `entindex`, who, `tick` — bomb-carrier handoff tracking.

**Utility:**
- `flashbang_detonate`, `hegrenade_detonate`, `smokegrenade_detonate`, `smokegrenade_expired`, `inferno_startburn`, `inferno_expire`, `decoy_started`, `decoy_detonate`: all share `entityid`, `user_name/steamid`, `x/y/z`, `tick` — clean, real detonation-point data for every grenade type.
- `weapon_fire` also fires for grenade throws (`weapon: 'weapon_smokegrenade'` seen in sample) — a second way to catch a throw, at the moment of release rather than detonation.

**Round/match structure:**
- `round_freeze_end`, `round_poststart`, `round_prestart`, `round_officially_ended`, `cs_round_start_beep`, `cs_round_final_beep`, `cs_pre_restart`: all just `tick` — round-boundary markers, several redundant ways to find the same moments.
- `bomb_planted`, `bomb_begindefuse`, `bomb_defused`, `bomb_exploded`: `c4` (entity id), `site`, who, `tick` — **this is the "why did the round end" reason data**, confirms the granularity design's assumption.
- `player_team`: `oldteam`, `team`, `disconnect`, `isbot`, `silent`, `tick` — real side-assignment/swap events, 10 rows (once per player) in this match.
- `player_spawn`, `player_disconnect` (has `xuid`, `networkid`, `reason`), `player_footstep` (just tick+player — combine with position ticks for category 8's sound-awareness work), `weapon_reload`, `weapon_zoom`: bookkeeping/state events.
- `chat_message`: `chat_message`, who, `tick` — text chat content (voice is separate, see below).
- `announce_phase_end`, `begin_new_match`, `round_announce_last_round_half`, `round_announce_match_point`, `round_announce_match_start`, `hltv_versioninfo`, `cs_win_panel_match`: single/few-row match-structure bookkeeping, low coaching value.
- `server_cvar`: 1036 rows of engine config name/value pairs — noise, safe to ignore for coaching purposes.

### Special parse methods (beyond `parse_event`/`parse_ticks`)

- **`parse_grenades()`** — ⚠️ **1,057,073 rows for one match.** This is full per-tick trajectory data for every grenade's flight (`grenade_type`, `grenade_entity_id`, `x/y/z`, `tick`, `steamid`, `name`), not one row per throw. Genuinely useful for category 2's smoke-placement work eventually, but **must be filtered (e.g. last tick per `grenade_entity_id`, or joined against the matching detonate event) before storing anything** — pulling this raw into any pipeline unfiltered would be a real performance/storage problem.
- **`parse_player_info()`** — `steamid`, `name`, `team_number`, 10 rows (one per player) — simple roster/team-assignment snapshot.
- **`parse_item_drops()`** — real columns (`account_id`, `def_index`, `dropreason`, `inventory`, `item_id`, `paint_index/seed/wear`, `custom_name`) but returned 0 rows in this match — schema confirmed, but need a match with an actual economy item-drop event to confirm it populates.
- **`parse_skins()`** — weapon skin/cosmetic data per player, 11 rows. Zero coaching relevance, confirmed cosmetic-only.
- **`parse_voice()`** — 0 packets in this match (GOTV/matchmaking demos may not carry voice, or this match had none recorded) — shape was already known from the type stub (`tick`, `steamid`, `bytes`), but couldn't confirm real audio data populates. Also explicitly out of scope anyway per the granularity design (voice comms already decided as not usable).
- **`inventory` / `inventory_as_ids` tick fields** — confirmed real: `parser.parse_ticks(["inventory", "inventory_as_ids"], ticks=[...])` returns each player's **full inventory as a list** (e.g. `['knife', 'USP-S']`), not just the active weapon — better than `active_weapon_name` alone for `fact_economy`'s `loadout_tier`, since it sees grenades/secondary carried too, not just what's currently equipped.

## SECOND FULL CRAWL (2026-08-23, later same session) — every tick field verified, plus the raw engine layer

The first crawl only confirmed event columns and the 5 special methods, per
the README's *curated* field list. This pass verified the actual tick-level
fields against real data, and went beyond the README entirely.

### BREAKTHROUGH #2: raw internal engine prop paths work directly, not just the curated names

`parser.list_updated_fields()` returns **968 real raw property paths** —
every networked Source 2 entity property this specific demo actually touched
(saved in full at `services/watcher/DEMOPARSER2_RAW_FIELDS.txt`, one per line,
e.g. `CCSGameRulesProxy.CCSGameRules.m_iMatchStats_PlayersAlive_CT`). These
are **not** limited to the README's curated friendly-name table — that table
is a convenience subset. **Confirmed empirically: `parse_ticks()` accepts a
raw path directly** (`parser.parse_ticks(["CCSGameRulesProxy.CCSGameRules.m_iMatchStats_PlayersAlive_CT"], ticks=[...])`
returned real data, e.g. `4` alive CTs at tick 50000). This means the entire
968-field catalog is real, usable data — not just names to wonder about.

Standout raw-only fields not in the curated README table, worth remembering:
- `m_eRoundEndReason` — a **separate** field from `m_eRoundWinReason` (which
  the README does document). Two different things; don't assume they're the
  same value under two names without checking both.
- `m_iMatchStats_PlayersAlive_CT` / `m_iMatchStats_PlayersAlive_T` — live
  per-round alive-count, per team. A much cheaper clutch-detection signal
  than reconstructing alive/dead state from the `player_death` event log.
- `m_iMatchStats_RoundResults` — likely a compact whole-match array of
  per-round result codes in one field; not yet inspected in depth.
- `m_iFreezeTime` — the configured freeze-time duration (a setting, not a
  live state) — useful for computing exact buy-phase tick windows precisely
  rather than relying on `is_freeze_period`'s transition alone.
- `m_iFirstSecondHalfRound` — the exact round number where sides swap; a
  hard fact rather than inferring the halfway point from round count.
- `m_arrProhibitedItemIndices`, `m_bBlockersPresent`, `m_hBombPlanter`,
  `m_iBombSite`, `m_iRoundEndFunFactData1`/`m_iRoundEndFunFactData2` — lower
  obvious value, noted for completeness rather than immediate use.

If a future category needs something that isn't in the curated tables above,
**check `DEMOPARSER2_RAW_FIELDS.txt` before assuming it doesn't exist** — grep
it for a keyword first.

### Bulk verification of every curated tick field, real data confirmed

Ran every field from the README's Player Data / Buttons / Weapon / Game
State / usercommands tables through one `parse_ticks()` call per category,
at 4 real sample ticks spread across the match, and checked actual non-null
values came back (not just that the call didn't error):

- **Player data (105 fields tested): confirmed working with real values** —
  `balance`, `start_balance`, `cash_spent_this_round`, `rank`, `comp_wins`,
  `has_defuser`, `has_helmet`, `armor_value`, `round_start_equip_value`,
  position/velocity, etc. all returned real per-player values.
- **Weapon (21 tested): confirmed working.**
- **Game State (41 tested): confirmed working** — including
  `round_win_reason`, `ct_losing_streak`/`t_losing_streak`,
  `total_rounds_played` (used in the ADR fix), all real.
- **usercommands (9 tested): confirmed working.**
- **Buttons (13 tested): mostly working**, but `WALK` and the raw `buttons`
  bitmask did **not** come back in the bulk result — silently dropped, not
  errored. Individual buttons (`FORWARD`/`FIRE`/`RELOAD`/etc.) all worked fine.

**Important gotcha found: a bulk multi-field `parse_ticks()` call can
silently drop individual field names instead of raising an error** — the
call itself succeeds, it just omits whatever it couldn't resolve, with no
warning. Fields requested but silently absent from the Player Data result:
`looking_at_weapon`, `holding_look_at_weapon`, `duck_time_ms`,
`max_fall_velo`, `in_duck_jump`, `allow_auto_movement`, `jump_time_ms`,
`jump_until`, `jump_velo`, `crouch_state`, `direction_last_injury`,
`direction`, `killed_by_taser`, `move_state`, `stamina`, `is_strafing`,
`aim_punch_angle`, `aim_punch_angle_vel`. **These are NOT confirmed broken**
— they may just need to be requested individually or in a smaller batch
rather than all 105+ at once. Don't assume they don't exist; don't assume
they do either — retest individually before depending on one.

### Voice/audio — still unresolved, and deliberately not chased further

`parse_voice()` returned 0 packets on this match, same as the first crawl.
Not re-tested against a different match. **Not chasing this further** —
voice/text comms were already explicitly decided out of scope for the
coaching fact-table design (see [[project_match_granularity_discussion]]),
so this doesn't block anything currently planned.

### Practical takeaway for building fact tables from here

Prefer `player_bullet_hit`/`fire_bullets` (have `round` built in) over deriving
round number from tick ranges where possible. Prefer `inventory_as_ids` tick
snapshots over `item_equip` alone when the goal is "full loadout," and
`item_equip` when the goal is "what did they just buy." Route skill-context
entirely through `rank_update`, not the GC `rankings` path. Always filter
`parse_grenades()` before storing anything from it.
