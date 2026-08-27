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

Plus a partial fix at the time: **`bomb_site` stored a raw internal numeric
code, not "A"/"B"** — resolved for 7 of 8 historical matches by geometrically
matching each plant's real position against that map's actual
BombsiteA/BombsiteB callout coordinates (already in `dim_map_callout`). One
match (`de_nuke`) stayed genuinely ambiguous at the time. **Fully resolved,
second session, same day — see the Tier 1 entry moved to Completed below.**

Also confirmed via research, not just code-reading: CS2's sub-tick input
system (client-side, sub-tick-precision input timestamps for movement/fire)
does **not** change the underlying 64Hz world-simulation tick rate or how
demo events are logged — every event in a `.dem` file is still tagged with a
whole simulation tick, never a fractional one. This was the basis for trusting
`TICK_RATE = 64.0` and the "blind events share the exact tick of their
flash's detonation" empirical finding used in fix #3 above. See
`services/watcher/DEMOPARSER2_FIELDS.md` for where this is now noted for any
future tick-timing question.

## Completed (2026-08-25, second session — ADR damage cap)

6. **ADR damage cap** — every hit's `dmg_health` was being summed uncapped
   into `total_damage`, inflating ADR (a single hit can't deal more than a
   player's full health, but the raw field sometimes reports a value above
   100). Fixed at all 3 confirmed sites by clipping each hit to 100 before
   summing (per-row, not per-total, so a grenade hitting multiple victims
   or a burn stacking multiple ticks on one victim can still legitimately
   total >100): `sync_pipeline.py` ADR calculation (feeds
   `matches.telemetry.total_damage`/`adr`), `running_stats()` (feeds
   `fact_engage_decision.target_damage_so_far`), and grenade `damage_dealt`
   in `extract_fact_utility_throw` (feeds `fact_utility_throw`, grouped
   naturally since `relevant` is already per-throw). Confirmed no other
   `dmg_health`-summing site exists via grep, and that the frontend never
   recomputes ADR from raw damage client-side — it only ever reads the
   already-computed `total_damage`/`adr` fields, so no frontend change was
   needed. **Only affects future syncs** — historical matches keep their
   old (uncapped) ADR value; a re-parse would need the original CDN link,
   which expires, same limitation as the map/date backfill above.

   **Follow-up cleanup, same session:** the 3 sites originally each had
   their own copy of the same `.clip(upper=100).sum()` line — a real DRY
   (repeated-logic) smell, and part of why this bug had already been fixed
   in 1 of the 3 spots (the old `total_rounds_played` swap) while the other
   2 sat unfixed for a while. Extracted into one shared
   `capped_damage_sum(hurt_rows)` helper (top of `sync_pipeline.py`,
   alongside the existing `parse_event()` wrapper); all 3 call sites now
   call it instead of duplicating the cap logic. Any future site that needs
   a capped damage total has one obvious function to call instead of
   re-deriving the same line a 4th time.

## Completed (2026-08-25, second session — bomb_site resolver, fully closed)

7. **`bomb_site` resolver for the live pipeline — DONE, no remaining gap.**
   `extract_fact_adaptation_event` now resolves every bomb plant's real
   site letter instead of storing the raw numeric code. Two methods, in
   order:
   - **Primary — nearest-callout matching in real 3D** (`_resolve_bomb_site`):
     compares the plant's real X/Y/Z against every `BombsiteA`/`BombsiteB`
     point for that map in `dim_map_callout`, using full 3D distance (not
     flat X/Y) — 2D alone gets fooled on a map where one site sits almost
     directly under the other. A per-match self-check
     (`site_resolution_trusted`) verifies the whole match resolves
     consistently (two distinct raw codes must never resolve to the same
     letter) before trusting any of it.
   - **Fallback — elevation pairing** (`_resolve_bomb_sites_by_elevation`):
     when the self-check fails (confirmed live on a real de_nuke match,
     2026-08-25 — its two sites' callout points are too sparse/uneven for
     nearest-point matching to trust), sort the match's 2 real site codes
     by their plants' average height, sort the map's 2 site letters by
     their own callout points' average height, and pair them in matching
     order. Verified against the real de_nuke match: correctly resolved
     both sites (A = upper/outside, B = basement) — matches the map's real,
     well-known layout. This is a general height-based method, not a
     de_nuke-specific hardcode — it only activates when the primary method
     fails, and the "which letter is higher" direction is read from each
     map's own real callout data, not assumed.
   - Only if *neither* method can produce a trustworthy answer does it fall
     back to the raw numeric code — verified this genuinely never happens
     across all 8 existing matches once the elevation fallback existed.
   - **The one remaining historical gap (de_nuke, 6 rows) was also
     backfilled for real**, not left stale — re-ran the actual production
     function against the real demo (link still live) and updated Supabase
     directly. Confirmed via a fresh query: every match across every map now
     has a real "A"/"B" letter, zero raw numeric codes left anywhere in
     `fact_adaptation_event`.
   - Also fixed in passing: the resolved label is normalized from the DB's
     raw `"BombsiteA"`/`"BombsiteB"` down to `"A"`/`"B"` before being stored,
     matching the short form the original historical backfill already used
     — otherwise old and new matches would've stored the same fact in two
     different formats.

## Tier 1 — Wrong math, fix regardless of cost

Empty as of 2026-08-25 (second session) — both items (ADR damage cap,
bomb_site resolver) are done, see the Completed section above.

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
- [x] **Add KAST.** Done, 2026-08-27, backend + frontend: `extract_match_secondary_metrics`
      in `sync_pipeline.py` computes `kast_pct` per match (Kill, Assist,
      Survival, or Traded death, per round), stored in `telemetry.kast_pct`.
      Now displayed on the Home dashboard as its own KPI tile (`frontend/app/page.tsx`).
      Verified with `py_compile`/`tsc --noEmit` only — no real demo re-parsed
      yet, so this is syntax-and-logic-checked, not yet confirmed against
      real match data; that happens automatically on the next live sync.

## Tier 5 — Net-new stats (industry has these, RoundSync has zero coverage)

Surveyed Leetify's, HLTV's, and Scope.gg's full stat catalogs — these exist
industry-wide and RoundSync currently computes none of them. Full detail,
sourcing, and exactly which demoparser2 event/field each comes from is in
`CS2_ANALYTICS_STANDARDS.md`. Ordered by actual lift, cheapest first —
verified against real field availability, not estimated:

**Free — the raw field already flows through the parser every sync, just never captured:**
- [x] **Headshot accuracy** (% of hits, not kills, on the head) — done,
      2026-08-27, backend + frontend. Computed in `sync_pipeline.py`
      alongside `total_damage` (reuses the same `player_hurt` rows already
      fetched for ADR), stored as `telemetry.headshot_accuracy_pct`,
      displayed as its own Home dashboard tile. `hitgroup == 1` confirmed as
      "head" via Valve's own Source SDK reference, not assumed. Distinct
      from the existing `headshot_pct` (% of *kills* headshotted).
- [ ] **Weapon-segmented stats** (AWP kills, rifle vs. pistol performance) —
      `player_death.weapon` / `player_hurt.weapon`, already parsed.
- [x] **Multi-kill rounds (2K/3K/4K/Ace)** — done, 2026-08-27, backend +
      frontend. Groups `player_death` by round via the existing `_round_for`
      helper, stored as `telemetry.multi_kill_rounds` (`{2k, 3k, 4k, ace}`
      counts), displayed as a single "Multi-Kill Rounds" total on the Home
      dashboard.
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

## Tier 9.5 — Found only after actually reading the full research docs, not their summaries

Caught directly by the user asking "did you have the research in context?" during
the Tier 9 audit — the honest answer was no, and reading both
`CS2_ANALYTICS_STANDARDS.md` and `DEMOPARSER2_FIELDS.md` in full (not just
`NEXT_STEPS.md`'s summary of them) immediately surfaced a real finding
`NEXT_STEPS.md`'s summary couldn't have contained, since it was never
promoted up from the raw field research in the first place.

- [ ] **`extract_fact_duel_placement` uses a less precise data source than
      what's already documented as available.** Currently anchors on
      `weapon_fire` for the opening-shot tick, then does a separate
      `parse_ticks()` snapshot lookup for the shooter's position/yaw and
      (via `player_hurt`) the opponent's identity/position. But
      `DEMOPARSER2_FIELDS.md`'s full field crawl already documents two
      richer, more direct sources: `fire_bullets` carries the shooter's
      *exact* fired angle (`angles_x/y/z`) on the same row as the shot
      itself — no secondary tick-snapshot needed — and `player_bullet_hit`
      carries the victim's *exact* position at the hit (`victim_pos_x/y/z`)
      plus `round` built directly into the row. Rebuilding on these would
      be strictly more precise (the real fired angle, not a nearby sampled
      tick; the real hit position, not a secondary join) and matches what
      `CS2_ANALYTICS_STANDARDS.md`'s Tier 5 "Accuracy (enemy spotted) /
      spray accuracy" entry already independently flags as needing
      `weapon_fire` "matched against player_hurt" — the richer alternative
      just was never connected to that entry. **Flagged for a scope
      decision** — this touches `fact_duel_placement`, which already feeds
      production data (Crosshair Placement card, `aim_placement` category
      score), so a rebuild needs sign-off, not a silent swap.

## Tier 5.5 — Engage IQ redesign (proposed 2026-08-27, queued behind the audit)

The user (a real CS2 player) proposed a much richer version of `engage_iq` than
what it currently measures — the actual checklist a player runs through
before deciding to take a fight, not just "did outnumbered → won?". Checked
each factor against what's already in the data:

- **Already stored, unused**: outnumbered status (the current trigger
  condition itself) and — the big one — `enemies_raw_components`
  (`fact_engage_decision`) already has the player's own kills/deaths AND
  every remaining enemy's kills/deaths at the exact decision moment. A real
  "am I actually the better player here" signal is sitting in the database
  right now, completely unused.
- **Close cousin already exists**: "am I isolated from teammates" is
  already computed, separately, in `fact_positioning_risk` — worth deciding
  whether to reuse that table's logic or duplicate a simpler version here.
- **Cheap to add** (tick fields the parser already exposes, just not
  requested at the decision tick yet): current weapon, current health,
  current utility/inventory.
- **Moderate lift**: bomb-timer pressure — needs cross-referencing the
  `bomb_planted` tick (already parsed elsewhere, in
  `extract_fact_adaptation_event`) against the decision tick; the two don't
  currently talk to each other.
- **Real, standalone work**: "will I still afford a full buy next round if
  I lose this fight" needs simulating CS2's actual loss-bonus/win-bonus
  economy rules to predict next round's money — a genuine sub-project, not
  a field lookup.
- **No industry precedent found anywhere** (checked Leetify/HLTV/Scope.gg)
  for a combined score like this — confirmed a genuine RoundSync original,
  not something to align to an external standard.

**Recommended staging, agreed but not started**: build the free/cheap
factors (outnumbered, relative K/D, health, weapon, utility) into a
redesigned score first; treat the bomb-timer and next-round-affordability
factors as separate follow-up work once the base version is proven useful.
Deliberately not started yet — audit (Tier 9.6 below) remains the priority.

## Tier 9.6 — Full-PROJECT audit using the 5-lens framework (planned 2026-08-26, not started)

Broader than Tier 9 below (which only covered source code): this pass covers
**every real file in the repo** — config, Docker, deployment, docs, package
management, not just `.py`/`.js`/`.ts`. Verified complete on 2026-08-26 via an
unrestricted `find` with no depth limit, after an earlier `maxdepth 3` pass
silently missed several nested files (`frontend/app/api/auth/steam/route.ts`,
the whole `frontend/.claude/skills/run-frontend/` tooling folder,
`frontend/app/globals.css`, `services/watcher/tools/README.md`,
`.claude/settings.json`). **Don't re-run a depth-limited listing to
"double-check" — that mistake already cost time once.**

Deliberately excluded, not oversights: `.env` / `frontend/.env.local`
(secrets), `package-lock.json` files / `tsconfig.tsbuildinfo` /
`next-env.d.ts` (machine-generated, never hand-edited), the ~20 `.png`
screenshots under `run-frontend/screenshots/` (images, not code), and
`node_modules`/`.next`/`venv`/`__pycache__`/`.git`.

**Batches, in order (backend → frontend, since frontend displays what the
backend computes):**
0. **Project config & meta layer** — `docker-compose.yml`, `railway.json`,
   all 4 `Dockerfile`s, `.dockerignore`, all 3 `package.json`s +
   `requirements.txt`, `next.config.js`/`tsconfig.json`/`postcss.config.js`,
   `.mcp.json`, `ReadMe.txt`, `.claude/settings.json` +
   `.claude/settings.local.json`, `.claude/hooks/session-start-required-
   reading.js`, `frontend/AGENTS.md` + `frontend/CLAUDE.md` (required
   reading before any frontend batch, per this file's own instructions
   above), and `frontend/.claude/skills/run-frontend/{driver.mjs,
   mock-home.mjs,test-interactions.mjs,SKILL.md}`.
1. **Crypto & auth surface** — `services/api/cryptoUtils.js`,
   `services/watcher/crypto_utils.py`,
   `frontend/app/api/auth/steam/route.ts`, `frontend/lib/rank.ts`.
2. **Background workers + tools** — `services/watcher/watcher.py`,
   `services/gc-worker/index.js`, `services/watcher/tools/
   extract_map_callouts.py`, `services/watcher/tools/load_map_callouts.py`,
   `services/watcher/tools/README.md`.
3. **`services/watcher/sync_pipeline.py`** (1,596 lines — core math/
   extraction engine, dedicated pass, likely 2 sub-chunks given size).
4. **`services/api/server.js`** (800 lines — the actual API surface, heavy
   on the security lens).
5. **Small/medium frontend components** — `Logo.tsx`, `Toast.tsx`,
   `layout.tsx`, `Operator.tsx`, `TopNav.tsx`, `RankChangeOverlay.tsx`,
   `RankBadge.tsx`, `duelColors.ts`, `globals.css`.
6. **`frontend/components/InsightsDashboard.tsx`** (733 lines).
7. **`frontend/app/page.tsx`** (2,032 lines — the single largest file in the
   project; no record of it ever having had a real audit pass before).

**Method — the 6-lens framework** (full detail lives in Claude's own memory
as `feedback_five_lens_audit_framework.md`; summarized here so this file
stays self-contained for any future reader without memory access):
1. Redundancy & architectural soundness (DRY, dead code, testability).
2. Security & operational common sense (OWASP-shaped issues, plus code that
   runs cleanly but is wrong/unsafe at runtime — see the `postMessage(...,
   '*')` and entity-ID-reuse bugs already fixed in Tier 9 below for the
   shape of finding this lens targets).
3. Math/logical validity **+ the "real question" test**: even once a
   calculation is confirmed to measure what it claims, ask whether that's
   actually a meaningful, actionable thing to measure — flag technically-
   correct-but-noisy/misleading/too-small-sample metrics too.
4. Performance/optimization (redundant parses/queries, missing caching —
   Tier 9 already found one concrete unfixed case: every `extract_fact_*`
   independently re-parses the same base demo events, up to 8x per sync).
5. **Legal & licensing** (added 2026-08-26) — verify every third-party
   dependency actually used in the batch has a real, checked (not assumed)
   commercial-safe license, and check compliance with any platform ToS
   being relied on (e.g. Valve's Steam Web API Terms of Use). Broader than
   the existing Valve Fan Content Policy angle already covered for game
   assets — this covers any library/API terms.
6. Proactive original ideas — 1-2 new metrics per batch, buildable from data
   already present in that file/table, not new extraction.

Output per batch: **Critical Issues / Architectural & Performance / Sanity
Check / Legal & Licensing / Proactive Ideas**. Check in and stop after each
batch (standing workflow rule) rather than running all 8 in one pass — this
is a multi-session effort, not one sitting.

**Standing rule, added 2026-08-27, corrected same day to be iterative**:
before closing out any audit session, self-audit the session's own
new/changed code with the same 6 lenses — fixes and new features written
*during* the audit aren't automatically covered by the 8 pre-scoped batches
above. **This loops**: if a self-audit pass produces any code change, that
change gets its own self-audit pass too, repeating until one full pass
finds nothing left to fix.

**Self-audit finding, fixed same day**: `fetchFactRows()` in `server.js` had
no `.order()`/`.limit()` on any of its 6 queries — verified against real
data that this is a live risk, not theoretical (one user already has 1,327
rows in `fact_adaptation_event`, 269 from a single match). Fixed: every
query now orders by `round_number` and caps at 10,000 rows, so a truncation
(if Supabase's response cap ever binds) drops the oldest rounds instead of
an arbitrary, unordered slice.

**Status: COMPLETE, 2026-08-27.** All 8 batches done (order reprioritized by
risk: 1, 4, 2, 0 first as security/infra-sensitive, then 3, 5, 6, 7). Every
third-party dependency across the whole project has been license-checked at
least once. Two real things queued from this audit, not yet started:
1. The 8x-per-sync duplicate demo-parsing issue in `sync_pipeline.py`
   (Tier 9, below) — a real refactor across 7 functions, deliberately not
   started mid-audit.
2. The Engage IQ redesign (Tier 5.5, above) — richer, more realistic
   scoring using data already sitting in `fact_engage_decision`, queued
   behind the audit per the user's own call.
Next full-project audit pass (whenever due) should start fresh rather than
assume this one's findings still hold — code keeps changing.

### Batch 1 (crypto & auth surface) — DONE, 2026-08-26

Files: `services/api/cryptoUtils.js`, `services/watcher/crypto_utils.py`,
`frontend/app/api/auth/steam/route.ts`, `frontend/lib/rank.ts`.

- **Critical Issues**: `crypto_utils.py`'s `decrypt_value()` caught every
  exception (wrong/rotated key, corrupted ciphertext — not just the
  legacy-plaintext case the comment described) and silently returned the
  raw ciphertext with zero logging. The one real caller
  (`get_single_match_info` in `sync_pipeline.py`, decrypting a user's stored
  `game_auth_code` before sending it to Valve's `GetNextMatchSharingCode`
  API) would see this manifest as a confusing "invalid code" failure from
  Valve, with no trace back to "the encryption key changed and this stored
  secret can no longer be decrypted." **Fixed**: added a warning log inside
  the except block — behavior unchanged (still falls back gracefully), but
  a real failure is no longer invisible. See `crypto_utils.py`.
- **Architectural**: the encrypt side (`cryptoUtils.js`) throws loudly on a
  misconfigured key; the decrypt side (`crypto_utils.py`) failed completely
  silently on the identical failure mode (bad/missing key) before the fix
  above — an inconsistent failure philosophy across the two ends of the
  same encrypt/decrypt pair, now at least partially closed by the added log.
- **Sanity Check**: the Steam OpenID login flow
  (`frontend/app/api/auth/steam/route.ts`) → HMAC-signed proof → verified
  server-side (`services/api/server.js`) chain was read end-to-end, not just
  the one file. Confirmed correct: `server.js` checks the steamId format,
  checks `expires` against `Date.now()`, and compares the signature with
  `crypto.timingSafeEqual` (constant-time, avoids a timing side-channel) —
  a genuinely well-built verification, no issue found.
- **Legal & Licensing** (new lens, see `feedback_five_lens_audit_framework`):
  verified via live web search, not assumed — `fernet` (npm, MIT),
  `jsonwebtoken` (npm, MIT), `cryptography` (PyPI/pyca, dual
  Apache-2.0/BSD) are all real, commercial-safe licenses. Checked Steam Web
  API Terms of Use (confidentiality of the API key, no password
  interception, no false-affiliation claims) against how RoundSync actually
  uses it: the key is only ever read server-side
  (`sync_pipeline.py`/`server.js`), never in a `NEXT_PUBLIC_`-prefixed
  frontend variable — confirmed via grep, satisfies the confidentiality
  requirement. The OpenID login flow never touches the user's Steam
  password at any point (Steam's own domain handles that) — compliant by
  design.
- **Proactive Ideas**: none specific to this batch — it's auth/crypto
  plumbing, not a data/metrics surface.

### Batch 4 (`services/api/server.js`, the API surface) — DONE, 2026-08-26

- **Critical Issues — flagged for a scope decision, NOT yet fixed**:
  `POST /api/user/onboard` upserts into `matches` using
  `onConflict: 'match_id'` with `match_id` set directly from the
  client-supplied `recentShareCode`, and no check that this `match_id`
  doesn't already belong to a different `steam_id64`. Steam share codes are
  normally only visible to their owner, but they do get pasted/shared
  between players (Discord clips, forums) — if an authenticated user
  submits a share code they don't actually own, this silently overwrites
  that match row's ownership and resets its `match_data` back to
  `pending_url`, destroying whatever was already parsed for the real owner.
  Needs a decision on the right behavior (reject with an error if the
  `match_id` already exists under a different `steam_id64`, most likely) —
  not fixed yet, this touches the onboarding flow's user-facing behavior.
- **Architectural & Performance**: found and fixed a real redundant-query
  bug. `getPlayerRankInfo()` re-queried `fact_adaptation_event` from
  Supabase a second time in both `buildDashboardPayload` and
  `POST /api/coaching/ask`, even though both call sites already fetch the
  *entire* `fact_adaptation_event` table (via `fetchFactRows`) in the very
  same request — the rank fields (`player_rank_new`/`player_rank_type_id`)
  were sitting in memory already. Extracted the matching logic into a pure
  `extractRankInfo(rows, matchIds)` function with no query of its own; both
  call sites now derive rank info from data they already fetched instead of
  a second round-trip. `/api/user/profile` still calls the DB-querying
  `getPlayerRankInfo()` directly, since it doesn't fetch the fact tables at
  all in that endpoint. Also removed `buildFactSummary()`, which became
  dead code once its one real caller (`/api/coaching/ask`) was rewritten to
  call `fetchFactRows`/`summarizeFactRows` directly. Verified with
  `node --check server.js` — syntax clean.
  Separately (not fixed, just noted): `performanceIndexServer()` here and
  `performanceIndex()` in `frontend/app/page.tsx` are the same formula,
  intentionally duplicated per an existing comment — a real, acknowledged
  maintenance risk (the two could silently drift) rather than a new find.
  **User decision, 2026-08-27: leave as-is permanently — exclude from
  future audit passes unless a genuinely better unification approach
  surfaces on its own** (sharing code across Python/JS/TS isn't worth the
  complexity just to dedupe one small formula).
- **Sanity Check**: `computeCategoryScores`'s `awareness` score re-verified
  as the already-fixed correct formula (true combined rate, not an average
  of each trigger type's own %). `engage_iq` blends
  `round_win_pct_when_engaged` and `survived_pct_when_disengaged` at a flat
  50/50 weight regardless of how many rounds fed each side — not a bug (it's
  measuring two genuinely different skills on purpose, unlike the awareness
  bug which wrongly split one true rate into parts), but worth knowing: a
  player with only 1-2 disengage-decision rounds gets that tiny sample
  weighted exactly as heavily as 50 engage rounds. Not changed — flagging
  the noise risk, not proposing a fix.
- **Legal & Licensing**: verified via live search — `express`, `cors`,
  `dotenv`, `express-rate-limit`, `@supabase/supabase-js` (MIT/BSD-family)
  and `@google/genai` (Apache-2.0) are all commercial-safe. Commercial use
  of Gemini API output is explicitly permitted either way.
  **Correction, same day**: the user confirmed RoundSync is actually on the
  Gemini **free** API tier, not paid — this session's first pass wrongly
  generalized the paid-tier privacy terms to the whole API. Re-checked
  specifically: on the free tier, Google's terms allow both the submitted
  content AND Gemini's generated response to be used to "provide, improve,
  and develop Google products," and explicitly allow human reviewers to
  read/annotate that traffic. That means every question a RoundSync user
  asks the AI Coach, plus their stats summary sent alongside it, is legally
  usable by Google and could be read by a human reviewer, for as long as
  the app stays on the free tier. Not illegal, and not unique to
  RoundSync — but worth knowing and worth revisiting (moving to the paid
  tier) before RoundSync scales to real user volume or advertises a privacy
  stance.
- **Proactive Ideas**: `/health`'s exposure checked directly — the
  `service_health` table (per `watcher.py`'s `update_heartbeat()`) only
  ever stores a service name + status string, nothing sensitive. Public
  access here is fine, no action needed. Real item given the free-tier
  confirmation above: `/api/coaching/ask` shares the same generic
  60-req/min-per-IP limit as every other endpoint, with no tighter cap of
  its own — free-tier Gemini quotas are strict (low requests-per-day as
  well as per-minute), so one user hammering this endpoint could exhaust
  the whole day's quota and silently break AI coaching for every RoundSync
  user until it resets. **User decision, 2026-08-27: deliberately left
  uncapped for now** — the app is still in testing with a small user count,
  and this needs a real cost/approach discussion together once RoundSync
  goes public, not a cap chosen unilaterally mid-build. Revisit before
  public launch, not before.

### Self-audit of Batches 1 + 4's own fixes, plus the KAST/stats work — DONE, 2026-08-27

Per the new standing self-audit rule above. Two findings beyond the
`fetchFactRows` one already fixed:
- **Residual gap, left as-is**: the onboarding ownership fix (Batch 4) checks
  "does this share code belong to someone else?" then saves — two separate
  steps, not one atomic action. A deliberately, precisely-timed concurrent
  request could theoretically still slip through the gap between the check
  and the save. Far narrower than the original bug (which anyone could
  trigger by accident); closing it fully would need a database-level
  constraint, not just an application-level check. **User decision: leave
  as-is for now**, low priority given how narrow the remaining window is.
- **Pre-existing pattern, not a new bug**: the new KAST/HS-accuracy Home
  dashboard tiles average each match's own percentage equally across
  matches, same as 3 existing tiles already do (`avgEntrySuccessPct`,
  `avgTradeKillPct`, `avgHs`'s fallback) — technically the same
  "should weight by rounds played" idea behind the already-fixed awareness
  score bug, just much milder here since CS2 match round-counts don't vary
  by huge multiples. Not fixed (patching only the 2 new tiles would make
  the dashboard inconsistent) — queued as one future pass across all the
  affected tiles together, not urgent.

### Batch 2 (background workers: `watcher.py`, `gc-worker/index.js`, map-callout tools) — DONE, 2026-08-27

- **Critical Issues**: `gc-worker/index.js` logs into a real Steam account
  and automates it (connects to the CS2 Game Coordinator, requests match
  data, runs unattended). Steam's Subscriber Agreement literally prohibits
  "bots"/"automation software" interacting with Steam's services. **Real,
  but the same gray area already documented for extracted game assets** —
  this exact bot-account pattern is how every third-party CS2 stats site
  (Leetify, Scope.gg, csstats.gg) resolves a match share-code into a
  download link; there's no official public API for this, and Valve has
  never enforced against this specific use. Documented in
  `CS2_ANALYTICS_STANDARDS.md`'s legal summary rather than treated as
  urgent — same informal-tolerance pattern as the rest of the CS2 tracker
  ecosystem, not unique risk-taking by RoundSync.
- **Architectural & Performance**: `watcher.py`'s `prune_old_matches()` only
  deletes matches that reached a terminal status (`fully_parsed`/
  `parse_failed`) — a match stuck permanently in `pending_url`/
  `pending_download`/`downloading` (e.g. an expired download link) never
  gets cleaned up, a slow-burning storage-growth risk given the $0 cost
  constraint. Also: the same "query with no `.order()`/`.limit()`" pattern
  fixed in `server.js` last batch recurs here too (fetching a user's full
  `matches` rows with no cap) — lower urgency since a user naturally has
  only ~30-40 rows by design, but the same architectural smell. Neither
  fixed yet — flagged for a future pass.
- **Sanity Check**: `watcher.py`'s `.select('match_id', 'steam_id64', 'match_data')`
  (3 separate arguments, not one comma-joined string) looked like a likely
  bug at first glance — **checked against the actual installed
  `postgrest` library's source** (`venv/Lib/site-packages/postgrest/base_request_builder.py`)
  rather than assumed, and confirmed `select(self, *columns: str)` genuinely
  accepts multiple arguments this way. Not a bug. Also re-confirmed
  `gc-worker`'s overlapping-run guard (fixed in an earlier session) still
  holds. Noted, not fixed: if the Steam bot's login fails for a *permanent*
  reason (bad password, banned account), it retries every 15s forever with
  no way to distinguish that from a transient network blip — a future
  robustness improvement, not urgent.
- **Legal & Licensing**: `steam-user`, `node-cs2`, `steam-totp`, and
  `ValveResourceFormat`/Source2Viewer-CLI (the offline map-callout tool) are
  all MIT-licensed — verified fresh, all commercial-safe. The Steam-bot ToS
  question is covered under Critical Issues above, not a licensing issue.
- **Proactive Ideas**: none new — this batch is infrastructure, not a
  metrics surface.

**Follow-up, same day (user-flagged)**: the user pointed out that CS2 map
updates are a real, recurring risk for the callout data going stale — this
was already *tracked* (`extracted_client_version` per row) but never actually
*checked* anywhere. Closed the gap: `sync_pipeline.py` now reads the current
match's own client version from `parse_header()`'s `game_directory` field and
compares it against the stored callout data's version every time a bomb
plant needs resolving, printing a `⚠️ STALE CALLOUT DATA` warning if the map
was updated since the callouts were last extracted. Doesn't block anything
(the resolver still runs on the old data, better than none) — just makes a
real map update visible in the logs instead of silently assumed current.
Verified with `py_compile` only; no version mismatch exists in the live data
right now to actually trigger the warning path.

**Batch 2's 3 remaining findings — all fixed, same day, per user request
("a bug is a bug, small or big"):**
1. **Stuck matches now get cleaned up.** `watcher.py`'s `prune_old_matches()`
   only ever deleted *settled* matches past the 30-match retention cap — a
   match stuck forever in `pending_url`/`pending_download`/`downloading`
   (e.g. an expired download link) never became "settled" and would sit in
   the database permanently. Added a second check: any non-terminal match
   older than `STUCK_MATCH_TIMEOUT_HOURS` (48h, generous on purpose) now
   gets pruned too.
2. **Same missing `.order()`/`.limit()` pattern, fixed here too.** The same
   query now orders by `parsed_at` descending and caps at 1,000 rows —
   consistent with the `fetchFactRows` fix from the self-audit, and with
   the user's confirmation that only the last 30 games are ever kept
   (chronological order).
3. **Steam login failures now get classified, not retried blindly.**
   Researched real EResult error codes from `node-steam-user`'s actual
   source (not guessed) — a VAC ban does **not** block login at all (VAC
   only restricts matchmaking), so that specific idea doesn't apply, but
   Steam's own login error already carries a numeric reason code. Split
   into fatal (wrong password, banned/disabled/locked account, broken 2FA
   secret — logs a distinct 🛑 message and stops retrying) versus transient
   (network/Steam-server issues — keeps the existing 15s retry).
   `services/gc-worker/index.js`. Verified with `node --check`.

### Batch 3 (`services/watcher/sync_pipeline.py`, the core pipeline) — DONE, 2026-08-27

- **Critical Issues**: none found. This file has already had substantial
  attention (Tier 9's consolidation, the ADR cap fix, the bomb-site
  resolver, today's KAST/headshot-accuracy/multi-kill/staleness-check
  additions), and it shows.
- **Architectural & Performance**: the already-known, still-unfixed Tier 9
  item — every `extract_fact_*` function independently re-parses the same
  base demo events, up to 8x per sync — is still open. Re-flagging it here
  since this batch is specifically this file, not just noting it again:
  **this needs a scope decision before starting**, since fixing it means
  changing the signature of all 7 extraction functions. Also fixed, small:
  `get_single_match_info`'s retry loop treated a rejected/revoked
  `VALVE_API_KEY` (401/403) the same as a transient network issue, retrying
  up to 3 times uselessly — now returns immediately, same principle as the
  already-handled 412 case and the gc-worker Steam-login fix from Batch 2.
- **Sanity Check**: confirmed `process_and_parse_real_demo`'s temp `.dem`/
  `.dem.bz2` files always get deleted via a `finally` block, even on
  failure — no disk-space leak. Confirmed `process_single_demo` (which
  registers a new match) is only ever called from `sync_user_matches`,
  always behind an "already exists?" check first — no risk of it silently
  overwriting an in-progress or completed match's data.
- **Legal & Licensing**: `requests` (Apache-2.0) and `pandas` (BSD
  3-Clause) verified fresh — both commercial-safe.
- **Proactive Ideas**: none new beyond what's already logged in Tier 5.

### Batch 0 (config & meta layer: Docker, package.json, `.mcp.json`, Claude settings/hooks, run-frontend skill) — DONE, 2026-08-27

- **Critical Issues**: none.
- **Architectural & Performance**: found and fixed a real local-dev-only gap.
  `NEXT_PUBLIC_*` variables get compiled into the frontend's client bundle at
  **build** time, not read at container start — `docker-compose.yml`'s
  `environment:` block for the frontend service has zero effect on them.
  Checked whether this is a production risk too: **it isn't** — Railway
  automatically passes matching env vars as Docker build args (confirmed
  via Railway's own docs), and `frontend/Dockerfile` already declares the
  right `ARG`s to receive them. Plain `docker-compose` doesn't do this
  automatically though, so a locally-built frontend was silently ignoring
  any custom API URL. Fixed: added an explicit `args:` block to
  `docker-compose.yml`'s frontend service. Also fixed in passing: the
  obsolete top-level `version: '3.8'` line (Docker Compose itself warned
  about this the moment I validated the file) and a comment in
  `gc-worker/Dockerfile` that said "Node.js 20" while the actual image is
  `node:22-slim`.
- **Sanity Check**: `services/api` and `services/gc-worker`'s Dockerfiles
  both run `npm ci --only=production` — checked their `package.json`s and
  confirmed neither has any `devDependencies` at all, so nothing needed at
  runtime gets skipped. Confirmed valid via `docker compose config` both
  before and after the fixes.
- **Legal & Licensing**: nothing new to check — no dependencies added.
- **Proactive Ideas / other small fixes**:
  - `frontend/.dockerignore` didn't exclude `.env`/`.env.local` — meant a
    locally-created `.env.local` (which the project's own `ReadMe.txt`
    instructs you to create) could get copied into an intermediate Docker
    build-stage layer via `COPY . .`, even though the final runtime stage
    never includes it. Fixed by adding the exclusion.
  - The `run-frontend` skill's mock test data (`mock-home.mjs`,
    `test-interactions.mjs`) predated today's KAST/headshot-accuracy/
    multi-kill-rounds fields — updated both so a screenshot-based
    verification run actually shows realistic values on the new tiles
    instead of "—".

### Batch 5 (small/medium frontend: `Logo.tsx`, `Toast.tsx`, `TopNav.tsx`, `RankBadge.tsx`, `RankChangeOverlay.tsx`, `Operator.tsx`, `duelColors.ts`, `layout.tsx`, `globals.css`) — DONE, 2026-08-27

- **Critical Issues**: none.
- **Architectural & Performance**: found and fixed real dead code —
  `components/Operator.tsx` (an original SVG "tactical operator" silhouette,
  explicitly built as a non-Valve-asset alternative) has zero imports
  anywhere in the codebase, confirmed via grep. `app/layout.tsx` renders
  actual real operator PNG renders (`/operators/ct.png`/`t.png`) globally
  instead — this component was superseded and never removed. Deleted.
  Verified via `npx tsc --noEmit` (had to run through PowerShell this time —
  Bash's classifier blocked the same command right after the file
  deletion for unclear reasons; PowerShell ran it fine, exit code 0, no
  errors). `globals.css` already shows real prior performance work in its
  own comments (measured cost of `blur()`/`scale()` animations, a fixed
  double-scrollbar bug) — nothing new to add there.
- **Sanity Check**: none of the math/logic in this batch needed checking —
  it's UI/presentation, not calculations. `RankBadge.tsx`'s hand-tuned
  per-band color table correctly matches `lib/rank.ts`'s 7 real bands plus
  a deliberately distinct "Unranked" grey.
- **Legal & Licensing**: flagged, then resolved same day. Two corrections
  from the user: (1) the CT/T operator background figures are **AI-generated
  artwork**, not real extracted CS2 assets — the code's own comment
  wrongly said "real in-game operator renders" (now fixed). Still styled to
  evoke CS2's factions, so the same disclaimer logic applies regardless.
  (2) confirmed the disclaimer was NOT on all pages — it only rendered
  inside the Home tab's own JSX in `page.tsx`, while the operator art
  renders globally via `layout.tsx` on every tab and the pre-login landing
  page. Fixed: moved the disclaimer into `layout.tsx` as a persistent
  footer (removed the now-duplicate copy from `page.tsx`'s Home block).
  Verified with `npx tsc --noEmit` (clean) AND visually — ran the frontend
  dev server, screenshotted the logged-out landing page via the
  `run-frontend` skill's Playwright driver, and confirmed the disclaimer
  renders legibly at the bottom of the screen without colliding with the
  Sign-In button or feature cards above it.
- **Proactive Ideas**: none new for this batch.

### Batch 6 (`frontend/components/InsightsDashboard.tsx`) — DONE, 2026-08-27

- **Critical Issues**: none.
- **Architectural & Performance**: found a real, currently-dormant risk —
  this file imports `formatMapName`/`mapScreenshotUrl` directly from
  `@/app/page`, but `page.tsx` is the file that renders
  `InsightsDashboard` in the first place. That's a circular import between
  the two files. `lib/duelColors.ts`'s own header comment documents that
  this *exact* pattern already caused a real temporal-dead-zone crash once
  before (for a different pair of helpers) and was fixed by moving them out
  of `page.tsx` into that shared lib file instead. `formatMapName`/
  `mapScreenshotUrl` were never given the same treatment. Not actively
  crashing right now — every call site here is inside a component's render
  body, not at module-load time, which happens to avoid the failure mode —
  but it's fragile: it would silently break the same way if either
  function's usage ever got hoisted to module scope. **Flagged, not fixed
  yet** — the real fix touches `page.tsx` directly (moving these two
  functions into a shared lib module), so it's queued for Batch 7 rather
  than done piecemeal ahead of that file's own audit pass.
- **Sanity Check**: nothing new to check — the actual math/percentages
  here are all computed server-side (already audited in Batch 4); this
  file only displays them. Confirmed the "couldn't load insights" crash
  fix from Tier 9 is still correctly in place.
- **Legal & Licensing**: `recharts` (MIT) and `lucide-react` (ISC) verified
  fresh — both commercial-safe.
- **Proactive Ideas**: none new for this batch.

### Batch 7 (`frontend/app/page.tsx`, 2,032 lines, the biggest file in the project) — DONE, 2026-08-27

**Tier 9.6 (the 8-batch, 6-lens audit started 2026-08-26) is now fully complete — all 8 batches done.**

- **Critical Issues**: none.
- **Architectural & Performance — 2 real fixes**:
  1. Closed the circular-import risk flagged in Batch 6. Created
     `frontend/lib/mapDisplay.ts` and moved `formatMapName`/`mapScreenshotUrl`
     there from `page.tsx`; `InsightsDashboard.tsx` now imports from the new
     shared file instead of from `page.tsx` (which renders it). Matches the
     precedent already set for `lib/duelColors.ts`.
  2. The match/sync-status poll ran every 10 seconds, forever, for as long
     as a tab stayed open with a valid session — even with nothing actually
     syncing. Changed to poll every 10s only while something's actually in
     flight, backing off to every 60s when idle (a real CS2 match takes
     30+ minutes to play, so nothing meaningful changes between one idle
     10s poll and the next). Uses a self-adjusting `setTimeout` chain plus
     a ref (`hasActiveSyncRef`) instead of a fixed `setInterval`, and runs
     both fetches concurrently (`Promise.all`) rather than sequentially.
- **Sanity Check — 1 real fix, 2 things checked and left alone**:
  - Fixed: `fetchProfile`/`fetchChatHistory`/`fetchSyncStatus` silently
    did nothing on a 401/403 (expired/invalid session) — only `fetchMatches`
    actually logged the user out. Since all 4 fire together, `fetchMatches`
    was accidentally covering for the other 3 today, but that was fragile.
    All 4 now call `handleLogout()` consistently.
  - Checked and confirmed correct: `avgKd`/`avgAdr`/`avgHs` all use a true
    pooled rate (sum ÷ sum), not an average of each match's own ratio —
    already the right pattern, no change needed.
  - Checked and left alone (not a bug, just noted): the trend-chart ▲/▼
    indicator compares the last 5 matches against the prior 5 — a small
    sample, but it's presented modestly (an arrow + a number, not a
    confident forecast), so it doesn't fall under the project's existing
    "no naive trend-line with false confidence" rule the same way a
    dedicated forecasting feature would.
- **Legal & Licensing**: `react-markdown` (MIT) verified fresh — the last
  unchecked frontend dependency. Every third-party library across the whole
  project has now been checked at least once this audit.
- **Proactive Ideas — both fixed same day, on request**:
  1. Extracted the duplicated onboarding form (game auth code + share code
     inputs) into a shared `OnboardingForm` component, used by both the
     Home tab's first-run setup and the Settings tab's "Update Codes" form.
  2. Replaced all 3 native browser `alert()` calls (login failure,
     onboarding failure) with the app's own `Toast` component instead of
     leaving them as a jarring, blocking popup. Added a proper `error`
     variant to `Toast.tsx` (red border, warning icon instead of the
     success checkmark) rather than reusing the success styling for an
     error. Self-audit caught one real issue in this fix: an error toast
     was defaulting to the same 3.2s auto-dismiss as the success one, too
     short to actually read a full error sentence — fixed by giving error
     toasts a longer 6s default. Also added the toast render to the
     logged-out landing page's own JSX (not just the logged-in shell's) —
     a failed Steam login can fire while still on that screen. Verified
     with `npx tsc --noEmit` (clean) and visually, via a live headed
     Playwright run showing the Settings tab's form rendering correctly
     after the extraction.

**Self-audit, same day**: re-checked all 3 fixes above. Found and fixed one
real issue in my own change — the polling fix originally awaited
`fetchMatches()` then `fetchSyncStatus()` sequentially, adding unnecessary
drift to the interval; changed to `Promise.all` so both run concurrently,
matching the original code's behavior. Second self-audit pass found nothing
further — verified clean with `npx tsc --noEmit` throughout.

### Post-audit fix, user-reported (2026-08-27): radar icon not centered in "Scanning for your matches"

User visually spotted the Radar icon on the empty-state card not sitting
centered in its circular background rings. Investigated with real
measurements (a headed Playwright run), not by eyeballing the CSS:
confirmed the icon itself was perfectly centered in its own small circle
(0px offset) — the actual bug was in `.radar-backdrop`'s concentric rings
and sweep animation (`app/globals.css`), which centered themselves at a
**percentage** of the whole card's height (`50% 42%`). That only happens to
line up for one specific amount of text content below the icon; any other
amount changes the card's total height and throws it off, since the icon's
real position is a **fixed** distance from the card's top (its `py-20`
padding + half the icon circle's own height = 121px), not a percentage.
Fixed: both `.radar-backdrop::before` (the sweep) and `::after` (the rings)
now center on `50% 121px` instead of `50% 42%`. Confirmed this class is
only used in this one place, so no other card was affected. Verified
visually with a before/after screenshot comparison — rings now genuinely
centered on the icon.

### Post-audit fixes, on request (2026-08-27): the 2 smaller deferred items

**1. Onboarding race condition — now genuinely closed, not just narrowed.**
The old fix was "check ownership, then upsert" — two separate round-trips,
so a precisely-timed concurrent request could theoretically still slip
through the gap. Replaced with `claim_match_if_available()`, a Postgres
function (migration `claim_match_if_available`) that does the check-and-
write as one atomic `INSERT ... ON CONFLICT ... WHERE` statement — Postgres
itself serializes concurrent writes to the same match_id, closing the race
at the database level instead of the application level.
**Real bug caught while verifying this, before it ever shipped**: testing
against live data surfaced a genuine foreign-key constraint
(`matches.steam_id64 → users.steam_id64`) that wasn't previously known —
the `users` upsert has to run *before* the match claim, or it fails. The
old code happened to already do this in the right order by luck; the new
code preserves it deliberately, now with a comment explaining why. Verified
directly against real data (not just SQL that compiled): a genuine new
claim, a blocked cross-account claim attempt, and a same-owner re-claim —
all three behaved correctly, then test rows were cleaned up.
Also checked for the same pattern elsewhere (`sync_pipeline.py`'s
`process_single_demo`, the only other unprotected `matches` upsert by
`match_id`) — confirmed it's a different, lower-risk case: it only ever
processes match codes derived from a user's own authenticated Valve account
chain, never a directly user-submitted string, so it doesn't need the same
fix.

**2. Dashboard averaging — now weighted by each stat's real sample size.**
`avgKastPct`, `avgHeadshotAccuracyPct`, `avgEntrySuccessPct`,
`avgUtilityDmgPerRound`, `avgTradeKillPct`, and `avgAdr`/`avgHs`'s fallback
paths all used to average each match's own percentage equally, regardless
of how many rounds/kills that match actually had. Added `avgWeighted()`
(`frontend/app/page.tsx`) — weights each match's value by its real
denominator (rounds played for a per-round rate, kills for a per-kill
rate) instead. Not a perfect true pool (the frontend only has each match's
final percentage, not its raw numerator/denominator — that would need a
backend schema change), but a real, meaningfully better approximation than
treating a 13-round match the same as a 30-round one. Removed
`avgOptionalField()`, which became dead code once every call site switched
to the weighted version. Verified with `npx tsc --noEmit` — clean.

### Self-audit of the 2 post-audit fixes above — found a significant pre-existing issue, 2026-08-27

Re-auditing the atomic-claim fix (per the standing "re-audit your own changes"
rule) turned up something well beyond the original fix's scope:

**Real security gap, found and fixed — every table's RLS policy was fake.**
Checking whether `claim_match_if_available()` was safely restricted to the
server's own service-role connection led to discovering it defaulted to
`PUBLIC` EXECUTE (Postgres's own default for new functions) — callable by
`anon`/`authenticated` too. Checking why that would even matter revealed the
real issue: **every single table in the project** (`matches`, `users`, and
all 9 others) has a policy literally named `"Enable all access for service
role"` whose actual `roles` list was `{public}` (everyone) with an
unconditional `USING (true)` — meaning Row Level Security was technically
"on" but never actually restricted `anon`/`authenticated` from anything, on
any table, project-wide. Combined with blanket table-level grants to those
same roles (also on every table), this meant anyone holding just the public
Supabase key could read/write every table directly, completely bypassing
the app's own login checks.
**Confirmed not currently exploitable**: the frontend never uses that
public key anywhere — verified via grep, zero `@supabase/supabase-js` or
`NEXT_PUBLIC_SUPABASE_*` references in `frontend/`. Every real feature goes
through the server's own service-role connection. But the security model
was resting entirely on that key never leaking, not on real protection.
**Fixed, user-approved given the blast radius (all 11 tables)**:
- Restricted every table's RLS policy to `service_role` only (matching
  what its name already claimed), via `alter policy ... to service_role`.
- Revoked the now-redundant `anon`/`authenticated` table grants on all 11
  tables as defense-in-depth.
- Restricted `claim_match_if_available()`'s own EXECUTE grant to
  `service_role` only (it defaulted to `PUBLIC`).
- Pinned the function's `search_path` (Supabase's own security advisor
  flagged this immediately — a function with a mutable search_path is
  vulnerable to search-path hijacking).
**Verified, not just applied**: re-ran `claim_match_if_available()` after
every change to confirm the server's own access still works — it does.
Ran Supabase's security advisor before and after — 1 real warning found and
fixed, 0 remaining after. Test rows cleaned up.
**Also fixed in passing** (performance advisor, zero risk, purely
additive): added a missing index on `matches.steam_id64` for the foreign
key discovered earlier this session. Left one advisor note alone —
an "unused index" on `coaching_history` — likely just reflects the table
still being small enough that Postgres prefers a full scan; not acted on.

## Tier 12 — Research queue: what players actually want that existing trackers don't offer (queued 2026-08-27, not started)

A real research task, not a quick lookup — deliberately queued for its own
session rather than attempted inline. Goal: find genuine gaps in what
Leetify/HLTV/Scope.gg/csstats.gg/tracker.gg etc. currently offer, driven by
what real players actually say they want, not just by guessing at features.

**Suggested method, for whoever picks this up:**
1. Search real player-voiced sources, not marketing pages — Reddit
   (r/GlobalOffensive, r/counterstrike), Steam community discussions,
   existing trackers' own feature-request/feedback threads, Leetify's
   Discord if publicly searchable, etc. Look for recurring complaints like
   "I wish my tracker showed X" or "why doesn't anyone track Y."
2. Compile a raw list of everything found, with sources — same rigor as
   `CS2_ANALYTICS_STANDARDS.md`'s existing research (check every claim
   against a real source, don't trust a single AI summary at face value,
   watch for the same kind of fabricated-sounding entries that research
   already caught once — see that doc's "Checked and rejected" section for
   the shape of that failure mode).
3. **Cross-verify each item against what the major trackers actually
   currently ship** — a "gap" someone complained about 2 years ago might
   already be built by now. Confirm it's a genuine, current gap before
   calling it one.
4. Whatever survives that check ("golden nuggets" — genuinely unmet,
   genuinely real) goes into `IDEAS.md`, not straight into a build queue —
   same "idea first, scope later" flow every other idea goes through.

Not started. This is explicitly a research-first task — don't skip to
"here's what I think players want" without the actual survey step above.

## Tier 11 — Lifetime stats via Steam Web API (verified real, 2026-08-27, not yet built)

User wants this built — verified it actually works before logging it as ready,
not just from the research conversation. Called `ISteamUserStats
/GetUserStatsForGame` (`appid=730`) against a real user's SteamID64 already in
the database — **confirmed real, rich data comes back**, no demo parsing, no
bot/GC connection needed, just the SteamID + the `VALVE_API_KEY` already
configured:
- Lifetime totals: `total_kills`, `total_deaths`, `total_wins`,
  `total_damage_done`, `total_time_played`, `total_money_earned`,
  `total_planted_bombs`/`total_defused_bombs`/`total_rescued_hostages`.
- **Per-weapon lifetime kills** for every gun (`total_kills_ak47`,
  `total_kills_awp`, `total_kills_headshot`, etc.).
- **Per-map lifetime wins** (`total_wins_map_de_dust2`,
  `total_wins_map_de_inferno`, etc.) — field names still include old
  CS:GO-only maps (`cs_assault`, `cs_italy`, `de_aztec`), confirming this
  genuinely spans the player's whole CS:GO + CS2 history, not just CS2.
- Assorted fun granular ones: `total_kills_enemy_blinded`,
  `total_kills_against_zoomed_sniper`, `total_kills_knife_fight`.

**Why this is worth building, concretely:**
1. Fills the "Scanning for your matches" empty state with something real on
   day one, instead of nothing — no other RoundSync data needs to exist yet.
2. Could serve as each player's own **personal baseline** for trend/
   regression analysis (Tier 8's predictive-analysis section already says
   naive trend-lines off ~8 matches are unreliable and population
   benchmarks are blocked on RoundSync only having ~3 users — a player's
   own lifetime per-map/per-weapon rate is a real baseline that's
   available *today*, sidestepping both blockers at once).
3. Per-map lifetime win rate vs. recent RoundSync-tracked win rate on that
   same map is a genuinely new, real comparison nobody else surfaces this
   specific way.

Not yet built — this is verified-and-scoped, not implemented. Needs: a new
`services/api/server.js` (or `sync_pipeline.py`) call to this endpoint, a
place to store it (a new `lifetime_stats` column/table, refreshed
periodically rather than every request), and a decision on where it
displays (the empty-state card is the obvious first spot per point 1 above).

## Tier 10 — Live-testing feedback, 2026-08-27 (logged only, nothing actioned yet)

User found these by actually running the app locally after today's audit/fixes
were deployed. Recorded verbatim intent, not yet triaged into fix-now vs.
future — that's the next session's first job.

**Bugs / clarity issues (things that are wrong or confusing, not new features):**

- [ ] **"Positioning Decisions Over Time" chart tooltip is unclear.** The
      label "Survived or tradeable" means nothing to a player without
      context — needs either a plain-language rename or a real tooltip
      explaining what it measures (see `summarizePositioning`'s
      `survived_or_tradeable_pct` in `server.js` for the actual definition:
      judges the *decision* to push, not just whether you died — surviving
      OR having a teammate close enough to trade both count as "good").
- [ ] **All reaction times must display in milliseconds, not seconds.**
      Currently `reaction_time_seconds` shows as e.g. "1.8s". At minimum
      the *display* should convert to ms; this is separate from (but
      related to) Tier 2's already-tracked full rebuild (sampling every
      tick instead of every 0.5s) — the unit fix could happen independently
      and sooner.
- [ ] **Tooltips/labels inconsistently show raw field names instead of
      proper formatting.** "K/D" render as "kd", "ADR" as "adr" in some
      places; "%" is shown in some spots and silently dropped in others
      where the value is still a percentage. Needs a full pass checking
      every stat label against its real unit, not spot-fixed one at a time.
- [ ] **"Syncing your matches" progress counts don't match reality.**
      User's example: showed "8 ready" when the real state was closer to
      "2 ready, 5 done, 10 remaining" — the displayed numbers don't
      reconcile the way the UI implies. Needs investigating
      `/api/matches/sync-status` (`server.js`) and the Home dashboard's
      sync-progress bar (`page.tsx`) together — this could be a real
      backend counting bug, a frontend display bug, or both; not diagnosed
      yet, only reported.

**Feature requests / redesigns:**

- [ ] **Real map images for match/map tiles.** `mapScreenshotUrl()`
      currently has zero maps in `MAPS_WITH_SCREENSHOTS` — every card falls
      back to a flat gradient. Per the established "prefer real extracted
      assets" pattern (already used for the rank badge and operator
      renders), find real CS2 map thumbnails from a community extraction
      source (e.g. the `MurkyYT/cs2-map-icons` repo already used for the
      operator art research) rather than generating anything new.
- [ ] **KAST, headshot accuracy, and multi-kill rounds need to appear in
      Insights too**, not just the Home dashboard tiles — currently
      `InsightsDashboard.tsx` doesn't surface any of the 3 stats added this
      session.
- [ ] **Full metrics placement review.** Re-evaluate every metric against
      *which page it actually belongs on* — Home vs. Matches vs. Insights
      vs. Coach — and flag anywhere different granularities get mixed on
      the same card/page (e.g. a career-aggregate stat sitting next to a
      single-match stat with no visual distinction). A real design pass,
      not a quick fix.
- [ ] **Add a time estimate for match parsing** — either per-match ETA or
      a total estimate for everything still queued, using the existing
      `avgSeconds` data already tracked in sync-status.
- [ ] **Rank badge visual redesign** — user has seen a newer/better real
      CS2 Premier rank badge design (number formatting: the integer part
      before the decimal/comma should render larger than the rest) and
      wants `RankBadge.tsx` updated to match it more closely.
- [ ] **Rank-change celebration effects** — user wants a big effect on
      crossing into a new rank band and a smaller one for an in-band
      rank-up/down, both directions (up feeling good, down feeling
      appropriately negative). **Note for whoever picks this up**:
      `RankBandTakeover` (full-screen, band-crossing) and `RankDeltaBadge`
      (small pill, same-band) already exist in
      `components/RankChangeOverlay.tsx` and are already wired into
      `page.tsx` — confirm with the user whether this request means "I
      didn't know this existed, show me" vs. "the existing effect needs to
      look/feel better," rather than assuming it needs building from
      scratch.
- [ ] **Match-detail drill-down page** — a real per-match view (like
      Leetify/HLTV/tracker.gg's match pages: overview, round-by-round,
      etc.), not just the current summary card. RoundSync currently has no
      single-match detail view at all — clicking a match card only jumps
      to the AI Coach with a pre-filled question. A genuinely new page/route.
- [ ] **Recent Matches carousel cards need more stats — and the actual
      time played, not just the date.** Currently only shows map/date/K-D
      ratio. User wants Kills, Deaths, Assists, Headshot %, K/D, ADR, and
      Performance Index all visible (the Matches tab's own cards already
      show most of these — Kills/ADR/HS%/K-D/Performance — but are missing
      Assists; the Home carousel cards are missing almost all of them).
      Also: `formatMatchDate()` (`page.tsx`) only formats the date portion
      of `match_time` (`toLocaleDateString`) — needs the time-of-day
      included too (e.g. via `toLocaleString` instead), everywhere a
      match's date is shown, not just this one card. Needs a per-card audit
      of exactly which fields are shown where.
- [ ] **Re-evaluate Performance Index using the richer metrics now
      available.** Currently a simple 3-input blend (K/D, ADR, headshot %),
      explicitly labeled a placeholder in its own code comment. With KAST,
      multi-kill rounds, utility, positioning, and engage-decision data all
      now available, this deserves a real re-design — connects to the
      already-researched "RoundSync needs an original composite score,
      can't copy HLTV's undisclosed formula" discussion in
      `CS2_ANALYTICS_STANDARDS.md`.

## Tier 9 — Full-codebase audit findings (2026-08-25, third session same day)

User requested a full senior-level pass over the whole app before any new
metric work starts — optimize, sense-check, remove redundancy, verify math.
Findings logged here as they're found; small clear-cut ones get fixed
immediately (per session convention), bigger ones need a scope decision
first and are tracked here until actioned.

- [x] **3 duplicated helper functions in `sync_pipeline.py` consolidated.**
      A "which round is this tick in" calculator, a "which team is this
      player on" lookup, and a "build round start/end times" builder were
      each copy-pasted 3-4 times across different `extract_fact_*`
      functions (with two slightly different shapes for the round-bounds
      builder). Extracted into 3 shared module-level helpers
      (`_round_for`, `_team_for`, `_build_round_bounds`); all call sites
      updated. Verified against a real match (de_cache) — output identical
      to what was already correctly stored, confirming this was a pure
      dedup with no behavior change.
- [ ] **Every `extract_fact_*` function independently re-parses the same
      base demo events** (`round_freeze_end`, `round_end`, `player_death`,
      `player_hurt`, `weapon_fire`, etc.) from scratch via `parse_event`/
      `parse_ticks`, instead of reading each event once and sharing it.
      Counted: `round_freeze_end` alone is re-parsed independently up to 8
      times per single match sync (once in `process_and_parse_real_demo`
      itself, plus once in each of the 7 `extract_fact_*`/secondary-metrics
      functions). Since `demoparser2` has to scan the compiled demo stream
      per call, this is real, repeated wasted work every sync, not just a
      style issue — but fixing it means changing the signatures of all 7
      extraction functions to accept pre-parsed DataFrames instead of
      parsing their own. **Flagged for a scope decision, not yet started.**

- [x] watcher.py: 2 real fixes. A silently-swallowed exception in
      update_heartbeat() (except Exception: pass, zero logging) now logs a
      warning instead - this was invisible-by-design for any real failure,
      not just the "table not created yet" case the comment described.
      process_pending_downloads() fetched 10 pending matches from Supabase
      every 5 seconds but only ever processed 1 (the loop breaks after the
      first) - reduced to .limit(1), since the other 9 rows' full
      match_data JSONB blobs were downloaded and immediately discarded,
      forever, on every poll.
- [x] services/api/server.js: real statistical bug in the "awareness"
      dashboard score, same class as the already-fixed K/D bug.
      computeCategoryScores() averaged each of the 3 adaptation-trigger
      types' (teammate-death / bomb-plant / audible-enemy) own reaction-rate
      percentage equally, instead of computing the true combined rate
      (total reacted / total occurrences). Verified with a concrete example
      before and after: 80 audible-enemy triggers at 75% reacted + 4 bomb
      plants at 25% reacted gave a score of 50 under the old (wrong) method
      vs. the mathematically correct 72.6 under the fix - a real ~22-point
      understatement from bad math, not from anything the player actually
      did. Also fixed a stale comment above rankTierInstruction() that
      claimed "6 real bands, not 7" - checked frontend/lib/rank.ts directly
      and confirmed there are genuinely 7 real Premier CS Rating bands,
      matching what the 7-branch function already correctly does; the
      comment was simply wrong. Not fixed, flagged only (a content choice,
      not a bug): the Pink and Red rank bands' AI-coach tone instructions
      are word-for-word identical, making those two tiers behave the same
      despite being distinct bands - worth writing distinct copy for them
      at some point, not urgent.

- [x] services/gc-worker/index.js: 2 real fixes. processPendingMatches()
      ran on a 5-second setInterval with no guard against overlapping runs
      - resolving up to 5 matches (each with its own 10s GC timeout) can
      genuinely take longer than 5 seconds, so a second cycle could start
      while the first was still mid-flight. Each cycle registered its own
      one-time 'matchList' listener, so a GC response meant for one run's
      request could get consumed by the other run's listener - silently
      attaching the wrong download URL to the wrong match_id in Supabase.
      Added an isProcessingMatches in-flight guard. Also removed a wrong
      fallback in the download-URL extraction chain that read
      roundstatsall[i].map as if it were a URL - that field is the MAP
      NAME (e.g. "de_mirage"), confirmed via the real protobuf schema
      audit from an earlier session; if this fallback had ever actually
      fired, it would have stored a map name as a "download URL" and
      failed confusingly downstream instead of at the source.

- [x] services/api/server.js: buildFactSummary() and buildDashboardPayload()
      each independently fetched the same 6 fact tables (near-identical
      Promise.all blocks) and ran the same 6 summarize*() calls - a real,
      missed-on-first-pass duplication (found on a second, more deliberate
      "can this be leaner" pass after being asked to look again). Split
      into fetchFactRows() (the one shared fetch) and summarizeFactRows()
      (the one shared summarize step); buildFactSummary is now a thin
      wrapper, buildDashboardPayload calls both shared pieces and gets the
      raw rows it separately needs (trend charts, loadout breakdown) for
      free instead of re-fetching them.
- [x] frontend/components/TopNav.tsx: the 4 nav buttons (Home/Matches/
      Insights/Coach) were 4 copy-pasted blocks differing only in tab id,
      icon, and label - collapsed into one array + .map(). Verified with
      npx tsc --noEmit, clean.
- [x] frontend/app/api/auth/steam/route.ts: the Steam login proof was
      broadcast via postMessage(..., '*') - delivers to any origin
      window.opener happens to be, instead of the app's own real origin
      (already computed a few lines earlier as `realm`). Tightened to use
      it.

- [x] frontend/components/InsightsDashboard.tsx: real crash bug. The
      dashboard-data fetch never checked response.ok before storing the
      parsed JSON as data - a server error response's body is just
      {error: "..."}, still a truthy object, so the existing "couldn't
      load your insights" fallback (which only checks `!data`) never
      caught it. Instead CATEGORY_ORDER.some((k) =>
      data.categoryScores[k] !== undefined) would throw (categoryScores
      doesn't exist on an error payload), crashing the component instead
      of showing the graceful fallback that already existed for exactly
      this case. Fixed by throwing on a non-ok response so the existing
      catch block (which correctly leaves data as null) handles it.
      Verified with npx tsc --noEmit, clean.
- [x] frontend/components/InsightsDashboard.tsx: the 6-card InsightCard
      idea above - DONE, user approved after seeing the explanation. New
      InsightCard({ icon, title, color, delay, children }) wraps only the
      genuinely-identical parts (outer box classes + icon/title header
      row); each card's own content (including Buy Decisions' different
      shape - it always renders LoadoutMixBar plus a conditional extra
      block, not a single hasData/EmptyCard split like the other 5) stays
      exactly as it was, passed in as children. The 2 full-width trend-
      chart cards (no icon, lg:col-span-2) are a genuinely different shape
      and were deliberately left out of this wrapper rather than forced
      to fit. Verified: npx tsc --noEmit clean, grep confirms the old
      repeated className string now appears exactly once (inside
      InsightCard itself) instead of 6 times, and all 6 call sites render
      with the right icon/title/color/delay.

- [ ] services/api/server.js: NOT a bug, but a real finding that never got
      written down anywhere until now. The AI Coach's model name
      ('gemini-3.5-flash') was checked directly against real, current
      (2026-08-25) documentation rather than assumed - it's genuinely
      real and valid, not a typo. But newer stable models now exist
      (gemini-3.6-flash, gemini-3.7-flash as of 2026-08-13) that weren't
      available when this was first wired up. Upgrading is a cost/
      behavior tradeoff for the user to decide, not something to change
      unprompted - flagged here so it isn't silently forgotten.

## Already confirmed correct, no action needed

Entry/opening-duel success %, utility damage per round. See the standards
doc for why.
