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
