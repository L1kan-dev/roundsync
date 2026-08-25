# Data Accuracy Roadmap

From the 2026-08-25 data audit and the follow-up standards research
(`services/watcher/CS2_ANALYTICS_STANDARDS.md`). A fuller visual writeup of
the completed section below exists as a "RoundSync Data Audit" Claude
artifact, but that link lives outside this repo — treat this file as the
source of truth, not the artifact.

## Completed (2026-08-25) — for the record, not to redo

Five real bugs found and fixed this session, all backfilled into the live
Supabase data for the 8 matches that existed at the time:

1. **Self-flash miscounted as teammate flash** — the flash-blind loop never
   excluded the thrower's own name from the victim list. Fixed in
   `extract_fact_utility_throw`; team-flash rate dropped from a bogus 78%
   toward a physically sound number once combined with fix #3.
2. **Silent full-match data loss on rare events** — `parser.parse_event()`
   returns a plain `[]`, not an empty table, for an event that never fires
   in a demo (e.g. zero decoys thrown). The immediate `.empty` check crashed
   uncaught, wiping every already-computed row for that match, not just the
   affected grenade type. Fixed with a centralized `parse_event()` wrapper
   (~25 call sites); utility coverage went from 6/8 to 8/8 matches.
3. **Entity-ID reuse contaminated flash/molotov attribution** — CS2 recycles
   entity slots; blind-victim and molotov-burn-window lookups matched by
   entity ID alone with no time bound, so a later unrelated grenade reusing
   the same slot got blamed on an earlier throw. Confirmed against a real
   demo (one slot reused by 3 different players). Fixed: flash matches
   pinned to the exact detonation tick; molotov window anchored to the
   nearest expiry *after* the throw. Eliminated all 3 previously-impossible
   blind counts (e.g. 5 teammates blinded, when only 4 exist).
4. **`rounds_played` undercounted by 1 in 6 of 8 matches** —
   `m_totalRoundsPlayed` only increments once a round officially concludes,
   so a kill in a match's final round still reports the pre-final count.
   Switched to counting `round_freeze_end` events (same source every fact
   table already used, self-consistent with zero exceptions across all of
   them). Eliminated all 62 round-count-consistency violations found across
   6 fact tables; also silently corrected ADR downward in those 6 matches.
5. **Coaching token/cost tracking always logged zero** — the Gemini
   response's real `usageMetadata` was never read on insert into
   `coaching_history`. Fixed in `server.js`.

Plus a partial fix: **`bomb_site` stored a raw internal numeric code, not
"A"/"B"** — resolved for 7 of 8 historical matches by geometrically matching
each plant's real position against that map's actual BombsiteA/BombsiteB
callout coordinates (already in `dim_map_callout`). One match (`de_nuke`)
stayed genuinely ambiguous and was left as raw codes rather than writing a
confident-looking guess. **The production pipeline still emits raw codes for
every future match** — this is why it's also listed as unfinished in Tier 1
below, not just a historical note.

Also confirmed via research, not just code-reading: CS2's sub-tick input
system (client-side, sub-tick-precision input timestamps for movement/fire)
does **not** change the underlying 64Hz world-simulation tick rate or how
demo events are logged — every event in a `.dem` file is still tagged with a
whole simulation tick, never a fractional one. This was the basis for trusting
`TICK_RATE = 64.0` and the "blind events share the exact tick of their
flash's detonation" empirical finding used in fix #3 above. See
`services/watcher/DEMOPARSER2_FIELDS.md` for where this is now noted for any
future tick-timing question.

## Tier 1 — Wrong math, fix regardless of cost

- [ ] **ADR damage cap.** Cap each hit at 100 damage before summing
      `total_damage`. Currently sums raw uncapped `dmg_health` — every ADR
      number in the app is inflated. Needs a demo re-parse. **Same fix
      needed at all 3 sites that sum `dmg_health`** (verified by grep,
      2026-08-25): `sync_pipeline.py:1288` (feeds ADR, this one),
      `sync_pipeline.py:901` (`running_stats`, feeds
      `fact_engage_decision.target_damage_so_far` — same "total damage
      dealt" quantity, same bug) — both need capping per-victim-per-hit.
      `sync_pipeline.py:281` (grenade `damage_dealt` in
      `extract_fact_utility_throw`) is **not** "already confirmed correct" —
      that only verified the aggregate `utility_dmg_per_round` sits in a
      realistic range, not that this specific line is free of the cap
      issue. It needs the *same* fix in principle, but grouped by victim
      first (one grenade can legitimately hit multiple people for >100
      total) — low priority since HE/molotov per-hit damage rarely exceeds
      100 to one person the way AWP does, but don't skip it while treating
      it as already settled.
- [ ] **`bomb_site` resolver for the live pipeline.** Historical backfill
      used real per-map callout coordinates for 7 of 8 matches; production
      code still emits raw numeric site codes for every future sync. Needs
      full per-map callout coverage (not just 2-3 sample points) and a
      nearest-region classifier with a self-check that refuses to write a
      mapping where two different codes resolve to the same letter.

## Tier 2 — Rebuild to the real definition

- [ ] **Time to Damage.** Rebuild anchored to enemy-becomes-visible (not
      your own first shot), store in ms, exclude ≥1s outliers, report
      median. Needs line-of-sight/visibility detection between players per
      tick — a real feature.
- [ ] **Reaction time.** Sample every tick after the trigger (not every
      0.5s), define "reacted" as first tick crossing a yaw/movement
      threshold, store in ms instead of seconds.

## Tier 3 — Align to the stricter published version

- [ ] **Flash assist**: add HLTV's ~1.1s minimum blind-duration threshold.
- [ ] **Trade-kill window**: 3s → 4s to match Leetify's published window.
- [ ] **Clutch won**: exclude "fake" clutches (round already unwinnable for
      the other side before the last-alive moment), per HLTV's 2024
      adjustment.

## Tier 4 — Structural

- [ ] **Post-sync validation gate.** Turn this session's audit queries
      (physical bounds, round-count consistency, entity-ID reuse sanity)
      into an automated check that runs after every sync and flags/blocks
      violations immediately, instead of relying on a manual audit to catch
      them after the fact.
- [ ] **Add KAST.** All four ingredients (kills, assists, survival, trade)
      already exist in the fact tables — this is assembly, not new
      extraction. See `CS2_ANALYTICS_STANDARDS.md` for the definition.

## Tier 5 — Net-new stats (industry has these, RoundSync has zero coverage)

Surveyed Leetify's, HLTV's, and Scope.gg's full stat catalogs — these exist
industry-wide and RoundSync currently computes none of them. Full detail,
sourcing, and exactly which demoparser2 event/field each comes from is in
`CS2_ANALYTICS_STANDARDS.md`. Ordered by actual lift, cheapest first —
verified against real field availability, not estimated:

**Free — the raw field already flows through the parser every sync, just never captured:**
- [ ] **Headshot accuracy** (% of hits, not kills, on the head) —
      `player_hurt.hitgroup`, already parsed.
- [ ] **Weapon-segmented stats** (AWP kills, rifle vs. pistol performance) —
      `player_death.weapon` / `player_hurt.weapon`, already parsed.
- [ ] **Multi-kill rounds (2K/3K/4K/Ace)** — pure aggregation of
      `player_death`, already parsed.
- [ ] **Kills/damage in round wins vs. losses** — `round_won` already
      stored per row in `fact_engage_decision`.
- [ ] **Positioning heatmap / map control visualization** — X/Y/Z data
      already exists; pure frontend work, zero backend extraction.

**Cheap — reuses an existing pattern already written elsewhere in the codebase:**
- [ ] **Kill distance** (avg map distance to your kills) — reuses the
      existing `pos_df` position-lookup pattern from
      `extract_fact_duel_placement`.
- [ ] **Self-flash duration** — the self-blind rows already exist in
      `blind_df` inside `extract_fact_utility_throw`, currently discarded
      (`continue`) instead of captured. Distinct from the self-flash bug
      fixed this session (that fix stopped self-blinds being miscounted as
      teammate flashes — this is tracking them as their own signal).
- [ ] **Spray accuracy** — reuses the existing `BURST_GAP_TICKS` burst
      grouping from `extract_fact_duel_placement`.
- [ ] **Counter-strafing quality** — reuses the existing position-delta
      speed calculation from `_find_enemy_audible_triggers`, applied to the
      shooter instead of the target.
- [ ] **Per-scenario clutch win rate** (1v1/../1v5, not lumped together) —
      small extraction change: persist `enemies_alive` at the clutch moment
      in `extract_match_secondary_metrics`, currently only a counter
      increment.
- [ ] **Trade-kill funnel, 2 of 3 stages** (opportunity + success) —
      already in `fact_positioning_risk`
      (`teammate_within_trade_range_at_death`, `was_traded`).

**Real new extraction:**
- [ ] **Eco-frags / equipment value diff** — confirmed real via HLTV Rating
      3.0's eco-adjustment (low-equipment kills discounted, low-equipment-
      vs-full-buy kills boosted). Needs enemy equipment value at the death
      tick, not currently captured (RoundSync's own equip value is already
      in `fact_economy`).
- [ ] **Raw accuracy** (shots hit ÷ shots fired while enemy visible) — needs
      the same visibility-detection primitive as the true Time-to-Damage
      rebuild (Tier 2) — build once, unlocks both.
- [ ] **Trade-kill funnel, 3rd stage** ("attempt") — needs cross-referencing
      teammates' `weapon_fire`/`player_hurt` against the killer within the
      trade window.
- [ ] **[CT] Smokes that stopped a push** — needs correlating smoke
      position/timing against enemy movement afterward.
- [ ] **Unused utility value on death** — needs reconstructing inventory
      (`item_equip` minus already-thrown from `fact_utility_throw`) at the
      death tick.

**Biggest lift — needs a trained model, not just data already in one demo:**
- [ ] **Round Swing / win-probability-added** — see Tier 6 below for the
      open academic path to build this without guessing at HLTV's formula.

## Tier 6.5 — Bracket comparison (real methodology, blocked on population data)

- [ ] **Rank-tier label** (Grey/Light Blue/Blue/Purple/Pink/Red/Gold for a
      given CS Rating number) — cheap, available now. Pure labeling of the
      `player_rank_new` value already stored in every fact table.
- [ ] **"Average ADR/KAST/etc for your bracket" comparison** — **blocked**,
      not just unbuilt. Needs population data across many users grouped by
      rank; RoundSync has ~3 users right now, nowhere near enough. Revisit
      once user count grows — the `player_rank_new` tagging already in
      place is the right foundation, this becomes a `group by` once there's
      real population data to group. Do not substitute a third party's
      compiled benchmark numbers in the meantime — unverifiable methodology,
      not RoundSync's own data.
- [ ] If built later: follow Leetify's rank-dependent vs. rank-independent
      split (not every stat should renormalize by bracket — ADR/K/D-style
      stats stay on one universal scale, reaction-speed-style stats
      genuinely need bracket-relative comparison).

## Tier 7 — Cheat-detection signal (real methodology, different risk category)

- [ ] **Possible-cheater flag per match.** Real, peer-reviewed, CC BY 4.0 +
      open-source methodology exists (AntiCheatPT, works on recorded `.dem`
      files RoundSync already has). But: 63% recall / 85% precision means
      it misses over a third of real cheaters and wrongly flags ~1 in 7.
      **Not a legal question — a product-risk one.** This accuses a real
      third-party opponent, not the tracked user. If built: frame as a
      probabilistic "unusual patterns" signal for the user's own awareness,
      never a named accusation, and never presented with more confidence
      than the 63%/85% numbers actually support.

## Tier 8 — Predictive / trend analysis (needs the right statistics, not a trend-line)

- [ ] **"Where you're headed if this continues" feature.** No real industry
      precedent for genuine forecasting (only static benchmark-gap
      comparison exists elsewhere). The correct methodology is regression-
      to-the-mean / Bayesian shrinkage toward a rank-tier baseline, not
      naive trend-line extrapolation — with only 8 matches of history right
      now, a naive version would be forecasting off noise. Gate behind a
      minimum match count; show a confidence range, not a single number.
      Builds on the same Tier 6 win-probability research line.

## Tier 6 — Academic/open-source layer (legally cleanest path to anything HLTV-Impact-like)

- [ ] Evaluate `awpy` (MIT license, github.com/pnxenopoulos/awpy) as a
      reference or dependency — it already solves player-visibility
      detection (unlocks Tier 2's Time-to-Damage rebuild + raw accuracy
      above) and has nav-mesh data that could replace the manual
      callout-centroid approach used for the bombsite fix.
- [ ] Consider building RoundSync's own composite score from the published,
      peer-reviewed "Valuing Player Actions in CS:GO" win-probability
      framework (arxiv.org/abs/2011.01324) instead of guessing at HLTV's
      undisclosed Impact formula — same open-source lineage as `awpy`.
- [ ] Consider "Optimal Spending Error" as a rigorous replacement for the
      existing `buy_decisions_against_team_economy` heuristic.

## Already confirmed correct, no action needed

Entry/opening-duel success %, utility damage per round. See the standards
doc for why.
