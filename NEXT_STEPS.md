# Data Accuracy Roadmap

From the 2026-08-25 data audit and the follow-up standards research
(`services/watcher/CS2_ANALYTICS_STANDARDS.md`). This file is now trimmed
to current state: what's still open, in full, plus a one-line pointer for
anything already finished. **Full forensic detail on every finished item —
what was checked, exact before/after numbers — lives in
`NEXT_STEPS_ARCHIVE.md`, read only on demand, not every session.** Split
done 2026-08-28 specifically to cut this file's mandatory-read cost; two
lessons that generalize beyond their own bug got promoted to memory
(now folded into `project_supabase_operations.md`) before anything moved, so nothing
load-bearing got buried.

A fuller visual writeup of the 2026-08-25 audit also exists as a "RoundSync
Data Audit" Claude artifact, but that link lives outside this repo — this
file (plus the archive) is the source of truth, not the artifact.

## How this file is organized — three different things layered together

- **Tiers** (numbered sections further down, e.g. "Tier 2," "Tier 9") are
  the original grouping, by *category* — what kind of fix/feature it is (a
  rebuild, a net-new stat, a structural change). Created one at a time as
  things got found in past sessions — the number is chronological, not a
  priority ranking. Read a specific Tier's own section once you know which
  one you're implementing, for its full detail.
- **Bands** (the numbered list right below this) are a separate, later sort
  over those SAME tiers, grouped by *urgency and readiness* instead —
  Band 1 is "users are confused right now," Band 9 is "parked/blocked." A
  single tier's items can be scattered across several different bands
  depending on how ready each one actually is. **Read the Bands list to
  answer "what should I work on next" — that's literally what it's for.**
- **The Dependency Map** (right below the Bands) isn't a category or a
  priority order at all — it's a lookup table for cross-tier collisions:
  "if you're about to start X, check Y first, because X ships broken or
  needs redoing otherwise."

`IDEAS.md` is a separate, intentionally-overlapping list — some ideas below
also appear there in their own words. That duplication is deliberate.

## Dependency Map — check this BEFORE starting any tier below

Bands sort by urgency, not build order — they don't by themselves say
"doing A first changes how B has to be built." This table is the actual
cross-tier lineage: before starting any tier, check here first (a few
lines) rather than reading every other tier in full to notice a collision
yourself.

| If you're about to work on... | Check... | Because... |
|---|---|---|
| **Tier 2** (Time to Damage / reaction-time rebuild) | **Tier 6** (`awpy` evaluation), **Tier 5**'s raw/spray accuracy | All three need the same missing primitive: real player-visibility detection between ticks. `awpy` (MIT, already solves this) can unlock all three at once — evaluate it before building visibility detection from scratch for just one of them. |
| **Tier 6.5** (bracket comparison) | User count | Blocked, not sequenced — needs real population data across many users; RoundSync has ~3. Revisit when that changes, don't substitute a third-party benchmark in the meantime. |
| **Tier 8** (predictive/trend analysis) | Match history count | Same shape as above — gated behind more matches per user, not a build-order dependency. |

**How to use this as a new session:** once you know which tier you're
starting, scan this table for that tier's row before reading anything else
in this file in full. If it names a dependency, read that other tier's
section too before writing code. If it doesn't appear here, it's safe to
treat as standalone. Add a new row here immediately if a fix while working
on one tier turns out to touch another (same rule as
[[engineering_standards]] rule 9 — don't let a newly-found dependency go
undocumented).

**Standing note:** Tier 14's 502 fix, the GC match-resolution retry backoff,
and the `LoggedInElsewhere`-reconnect hang fix are all done — see Tier 14
below for the real root cause and fix (a missing `steamGuard` handler, not
something needing a restart). Not yet pushed to production as of this note;
verify `railway status` before assuming it's live.

## Recommended Priority Order — the Bands, read this to pick what's next

**Band 1 — Real users are confused right now. DONE, 2026-08-27.**
All 4 came from actually using the live app — full detail in archive, Tier
10 section:
- [x] Sync-progress counts not matching reality
- [x] Reaction time shown in seconds instead of ms
- [x] Inconsistent stat labels/units
- [x] Unclear "Positioning Decisions" tooltip

**Band 2 — Cheap, real value, no blockers. DONE, 2026-08-30.**
- [x] Tier 11: lifetime stats via Steam Web API — DONE, 2026-08-27
- [x] Tier 5 "Free/Cheap": weapon-segmented stats, kills/damage in wins vs. losses, kill distance, self-flash duration — DONE, 2026-08-30, see Tier 5 below
- [x] Tier 6.5: rank-tier label — already built, see Tier 6.5 below
- [x] KAST/headshot%/multi-kill parity in Insights — DONE, 2026-08-27
- [x] Real map thumbnails — DONE, 2026-08-27
- [x] Tier 13: precision-over-rounding sweep — DONE, 2026-08-27

**Band 3 — Consistency work tied to what's already shipped.**
- Performance Index redesign (Tier 10 — explicitly labeled a placeholder in its own code comment; KAST/multi-kill/positioning data now exists to build a real one)
- [x] Tier 5.5: Engage IQ redesign — Phase 1 (factor capture) DONE, 2026-08-30; scoring-methodology phase deliberately deferred, see Tier 5.5 below

**Band 4 — DONE, 2026-08-30.**
- [x] Tier 9: 8x-per-sync duplicate parsing — fixed, all 7 extraction functions now share one pre-parse
- [x] Tier 9.5: `fact_duel_placement` rebuild onto `fire_bullets`/`player_bullet_hit` — done together with Tier 9

**Band 5 — Cheap correctness tweaks, align to published definitions. DONE, 2026-08-30.**
- [x] Trade-kill window 3s → 4s (`TRADE_KILL_WINDOW_TICKS`) — feeds `fact_positioning_risk`'s trade check, `trade_kill_pct`, and KAST.
- [x] Flash assist: add HLTV's 1.1s minimum blind duration (`FLASH_ASSIST_MIN_BLIND_SECONDS`) before crediting a kill on a blinded victim.
- [x] Clutch won: exclude "fake" T-side clutches per HLTV's 2024 adjusted-clutch-requirements rule (verified against hltv.org/news/40818) — disqualified if more than one teammate was still alive at CTs' last realistic chance to start defusing (5s before detonation with a kit, 10s without; standard 40s C4 timer). Needed a new `bomb_planted` parse, added to the Tier 9 shared pre-parse and threaded into `extract_match_secondary_metrics` as `bomb_planted_df`. CT-side clutches aren't covered by this rule (not part of HLTV's published fix).

**Band 6 — Bigger builds, sequenced by shared dependency.**
Tier 2's Time to Damage and reaction-time rebuilds both need a real
player-visibility primitive. Tier 6's `awpy` (MIT) already has this solved
— evaluate it first.

**Band 7 — Bigger UX asks, real value but bigger scope.**
- Match-detail drill-down page
- Recent Matches carousel — missing fields
- Full metrics placement review
- [x] Rank badge visual redesign — DONE, 2026-08-27
- Rank-change celebration effects (confirm with the user first whether `RankChangeOverlay.tsx` — which already exists — was known about)
- Parse-time ETA

**Band 8 — Research-only, no build attached yet.**
- Tier 12: player-wanted-gaps research
- Tier 6: Round Swing / win-probability-added academic line
- Cheat detection (Tier 7) — flagged as a product-risk decision, needs explicit sign-off before research time goes toward it.

**Band 9 — Parked, blocked, or deliberately deferred:**
- Tier 6.5: bracket/population comparison — blocked on user count (~3 users)
- Tier 8: predictive/trend analysis — deliberately gated behind more match history
- `IDEAS.md` #4: team-level data schema fork — real, but no urgency

## Tier 13 — Precision-over-rounding sweep — DONE, 2026-08-27

Full detail (what was checked, before/after values) in
`NEXT_STEPS_ARCHIVE.md`. Standing rule this produced is in memory
`feedback_precision_over_rounding.md`.

## Tier 1 — Wrong math, fix regardless of cost

Empty — both items that used to live here (ADR damage cap, bomb_site
resolver) are done. Full detail in `NEXT_STEPS_ARCHIVE.md`.

## Tier 2 — Rebuild to the real definition

- [ ] **Time to Damage.** Rebuild anchored to enemy-becomes-visible (not
      your own first shot), store in ms, exclude ≥1s outliers, report
      median. Needs line-of-sight/visibility detection between players per
      tick — a real feature.
- [ ] **Reaction time.** Sample every tick after the trigger (not every
      0.5s), define "reacted" as first tick crossing a yaw/movement
      threshold, store in ms instead of seconds.

## Tier 3 — Align to the stricter published version — DONE, 2026-08-30

All three shipped together as Band 5. See Band 5 above for the real
implementation detail (constants changed, the bomb-timer fake-clutch logic).

- [x] **Flash assist**: add HLTV's ~1.1s minimum blind-duration threshold.
- [x] **Trade-kill window**: 3s → 4s to match Leetify's published window.
- [x] **Clutch won**: exclude "fake" clutches (round already unwinnable for
      the other side before the last-alive moment), per HLTV's 2024
      adjustment.

## Tier 4 — Structural

- [ ] **Post-sync validation gate.** Turn the 2026-08-25 audit queries
      (physical bounds, round-count consistency, entity-ID reuse sanity)
      into an automated check that runs after every sync and flags/blocks
      violations immediately, instead of relying on a manual audit to catch
      them after the fact.
- [x] **Add KAST.** Done, 2026-08-27 — `telemetry.kast_pct`, Home dashboard
      KPI tile.

## Tier 5 — Net-new stats (industry has these, RoundSync has zero coverage)

Surveyed Leetify's, HLTV's, and Scope.gg's full stat catalogs — these exist
industry-wide and RoundSync currently computes none of them (except what's
marked done below). Full detail, sourcing, and exactly which demoparser2
event/field each comes from is in `CS2_ANALYTICS_STANDARDS.md`. Ordered by
actual lift, cheapest first:

**Free — the raw field already flows through the parser every sync, just never captured:**
- [x] **Headshot accuracy** — done, 2026-08-27. `telemetry.headshot_accuracy_pct`, Home dashboard tile.
- [x] **Weapon-segmented stats** — done, 2026-08-30.
      `telemetry.weapon_segmented_stats` (kills/damage grouped by weapon
      class — pistol/smg/rifle/shotgun/sniper — plus AWP broken out
      individually per this line's own wording). Classification is
      name-substring based (`_classify_weapon_by_name`), confirmed against
      real `fact_economy.primary_weapon` production values.
- [x] **Multi-kill rounds (2K/3K/4K/Ace)** — done, 2026-08-27. `telemetry.multi_kill_rounds`.
- [x] **Kills/damage in round wins vs. losses** — done, 2026-08-30.
      `telemetry.kills_damage_by_round_outcome` (`{wins: {kills, damage},
      losses: {...}}`), reusing the same round_bounds-with-winner pattern
      already used for `entry_success_pct`/`clutches_won`.
- [ ] **Positioning heatmap / map control visualization** — X/Y/Z data
      already exists; pure frontend work, zero backend extraction.

**Cheap — reuses an existing pattern already written elsewhere in the codebase:**
- [x] **Kill distance** — done, 2026-08-30, as `telemetry.kill_distance_buckets`
      (`{close: {kills, headshots}, medium: {...}, long: {...}}`). `IDEAS.md`
      #6's two open research questions are now resolved: (1) unit conversion
      was already solved (`CS2_UNITS_PER_METER = 52.49`, already in use
      elsewhere); (2) no industry-published bucket convention exists
      (checked) — so this is a documented RoundSync original, anchored to
      two real facts rather than an arbitrary guess: close ≤30m reuses the
      already-cited `ENEMY_CONTESTED_RANGE_UNITS` (assault rifles'
      effective-accuracy range), medium 30-50m is where CS2 rifles retain
      near-max damage before falloff (confirmed via 2 independent sources),
      long is 50m+. Reports kill count + headshot% per bucket, NOT a
      shots-fired accuracy% — that still needs Tier 2's blocked
      enemy-visibility primitive, see the Dependency Map.
- [x] **Self-flash duration** — done, 2026-08-30. The self-blind row inside
      `extract_fact_utility_throw` is now captured as
      `fact_utility_throw.self_blind_duration` (new nullable column,
      migration applied) instead of being discarded via `continue`.
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
      3.0's eco-adjustment. Needs enemy equipment value at the death tick,
      not currently captured (RoundSync's own equip value is already in
      `fact_economy`).
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

- [x] **Rank-tier label** (Grey/Light Blue/Blue/Purple/Pink/Red/Gold for a
      given CS Rating number) — **already built**, this list entry was
      stale. `RANK_BANDS`/`rankBand()` in `frontend/lib/rank.ts` is the
      source of truth (kept in sync with `services/api/server.js`'s
      `rankTierInstruction()`), surfaced in match-card rank tooltips
      (`page.tsx`), the rank-band-crossing celebration copy
      (`RankChangeOverlay.tsx`), and the AI Coach's tone instructions.
- [ ] **"Average ADR/KAST/etc for your bracket" comparison** — **blocked**,
      not just unbuilt. Needs population data across many users grouped by
      rank; RoundSync has ~3 users right now, nowhere near enough. Revisit
      once user count grows. Do not substitute a third party's compiled
      benchmark numbers in the meantime — unverifiable methodology.
- [ ] If built later: follow Leetify's rank-dependent vs. rank-independent
      split (not every stat should renormalize by bracket).

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
      precedent for genuine forecasting. The correct methodology is
      regression-to-the-mean / Bayesian shrinkage toward a rank-tier
      baseline, not naive trend-line extrapolation — with only ~8 matches
      of history right now, a naive version would be forecasting off noise.
      Gate behind a minimum match count; show a confidence range, not a
      single number. Builds on the same Tier 6 win-probability research
      line.

## Tier 6 — Academic/open-source layer (legally cleanest path to anything HLTV-Impact-like)

- [ ] Evaluate `awpy` (MIT license, github.com/pnxenopoulos/awpy) as a
      reference or dependency — it already solves player-visibility
      detection (unlocks Tier 2's Time-to-Damage rebuild + raw accuracy
      above) and has nav-mesh data that could replace the manual
      callout-centroid approach used for the bombsite fix.
- [ ] Consider building RoundSync's own composite score from the published,
      peer-reviewed "Valuing Player Actions in CS:GO" win-probability
      framework (arxiv.org/abs/2011.01324) instead of guessing at HLTV's
      undisclosed Impact formula.
- [ ] Consider "Optimal Spending Error" as a rigorous replacement for the
      existing `buy_decisions_against_team_economy` heuristic.

## Tier 9.5 — `fact_duel_placement` rebuild — DONE, 2026-08-30

Rebuilt onto `fire_bullets` (shooter's exact position/angle at the shot) and
`player_bullet_hit` (victim's exact position at the hit), replacing the old
`weapon_fire` + a separate `parse_ticks()` snapshot lookup. The yaw-angle
blocker was resolved empirically before implementing: `fire_bullets`'
`angles_y` is the real yaw (horizontal aim), `angles_x` is pitch, `angles_z`
is always 0/unused — confirmed against 5 real downloaded matches (~9,500
shots total), avg diff ~0.5-0.7° from the nearest per-tick sample (that gap
is just sampling lag, not error). `player_bullet_hit` identifies players by
a small `attacker_slot`/`victim_slot` number, not steamid — resolved via a
new `_build_slot_to_steamid_map()` helper (cross-references `bullet_damage`,
which has real steamids, on unambiguous single-hit ticks), confirmed 100%
reliable across the same 5 matches. Full sourcing in
`services/watcher/DEMOPARSER2_FIELDS.md`.

**Real bug found and fixed along the way**: `NON_GUN_WEAPON_KEYWORDS`
(`"grenade|molotov|decoy|incgrenade"`) never excluded flashbang throws or
knife swings — `weapon_fire` fires for those too, not just real bullets — so
both `fact_duel_placement`'s opening-shot detection and
`fact_engage_decision`'s `player_engaged` flag were treating them as
gunfight shots. Confirmed against a real match: 9 of 44 "opening shots" for
one player were flashbang throws/knife swings, not gunfire. Now
`"grenade|molotov|decoy|incgrenade|flashbang|knife"`.

Verified byte-for-byte against the pre-rebuild version (with the keyword fix
applied to both) across all 10 players in 2 independent real downloaded
matches — same row counts everywhere, confirming the rebuild changes
*precision*, not which engagements get captured.

## Tier 5.5 — Engage IQ redesign (proposed 2026-08-27, queued behind the audit)

**Phase 1 (factor capture) DONE, 2026-08-30.** `fact_engage_decision` now
stores `is_isolated`, `current_health`, `current_weapon`, `current_utility`
(grenades held) at the decision moment — the free/cheap factors below,
raw. **Deliberately NOT folded into a new `engage_iq` score** — the
current score is an OUTCOME measure (did you win/survive?), the redesign
goal was a DECISION-QUALITY measure (was taking/avoiding the fight smart,
regardless of outcome?), and turning these raw factors into a "good
decision" verdict needs real methodology (what counts as too outnumbered,
how much isolation matters) that was never actually agreed — confirmed
with the user 2026-08-30 rather than guessing at thresholds unilaterally.
**Open follow-up**: design that scoring methodology, then apply it to the
now-available data (no new extraction needed for phase 1's factors).

The user proposed a much richer version of `engage_iq` than what it
currently measures — the actual checklist a player runs through before
deciding to take a fight, not just "did outnumbered → won?". Checked each
factor against what's already in the data:

- **Already stored, unused**: outnumbered status (the current trigger
  condition itself) and — the big one — `enemies_raw_components`
  (`fact_engage_decision`) already has the player's own kills/deaths AND
  every remaining enemy's kills/deaths at the exact decision moment.
- **Close cousin already exists**: "am I isolated from teammates" is
  already computed, separately, in `fact_positioning_risk`.
- **Cheap to add**: current weapon, current health, current
  utility/inventory (tick fields the parser already exposes).
- **Moderate lift**: bomb-timer pressure — needs cross-referencing the
  `bomb_planted` tick against the decision tick.
- **Real, standalone work**: "will I still afford a full buy next round if
  I lose this fight" needs simulating CS2's actual loss-bonus/win-bonus
  economy rules.
- **No industry precedent found anywhere** (checked Leetify/HLTV/Scope.gg)
  — confirmed a genuine RoundSync original.

**Recommended staging, agreed but not started**: build the free/cheap
factors first; treat bomb-timer and next-round-affordability as separate
follow-up work.

## Tier 9.6 — Full-PROJECT audit using the 6-lens framework — COMPLETE, 2026-08-27

Broader than Tier 9 below: covered every real file in the repo — config,
Docker, deployment, docs, package management, not just source code. All 8
batches done (crypto/auth, background workers, sync_pipeline.py, server.js,
small frontend components, InsightsDashboard.tsx, page.tsx, project config).
Every third-party dependency across the whole project license-checked at
least once. **Full batch-by-batch writeup in `NEXT_STEPS_ARCHIVE.md`.**

Two real things queued from this audit, not yet started — both tracked in
their own tiers below/above, not duplicated here:
1. The 8x-per-sync duplicate demo-parsing issue (Tier 9).
2. The Engage IQ redesign (Tier 5.5, above).

Method reference: the standing 6-lens framework lives in memory
`engineering_standards.md` (rule 12) — redundancy/architecture, security,
math validity + the "real question" test, performance, legal/licensing,
and proactive original-idea generation. Applies to every RoundSync code
change now, not just formal audits.

## Tier 12 — Research queue: what players actually want that existing trackers don't offer

A real research task, not a quick lookup — deliberately queued for its own
session. Goal: find genuine gaps in what Leetify/HLTV/Scope.gg/csstats.gg/
tracker.gg currently offer, driven by what real players actually say they
want, not by guessing at features.

**Suggested method, for whoever picks this up:**
1. Search real player-voiced sources (Reddit, Steam community discussions,
   existing trackers' own feedback threads), not marketing pages.
2. Compile a raw list with sources, same rigor as `CS2_ANALYTICS_STANDARDS.md`'s
   existing research.
3. Cross-verify each item against what major trackers actually currently
   ship — a "gap" from 2 years ago might already be built by now.
4. Whatever survives goes into `IDEAS.md`, not straight into a build queue.

Not started. This is explicitly a research-first task — don't skip to "here's
what I think players want" without the actual survey step above.

## Tier 11 — Lifetime stats via Steam Web API — DONE, 2026-08-27

Full detail (215 real fields confirmed live, the `total_wins` vs.
`total_matches_won` gotcha, the CS:GO-era map-pool limitation) in
`NEXT_STEPS_ARCHIVE.md`. See also `IDEAS.md`'s entry for the bigger,
separate future vision (full dedicated Lifetime Stats page).

## Tier 14 — Production incident findings, 2026-08-27

Found while bringing production back online for a planned showcase. The 502
fix and the `gc-worker` GC retry-loop fix are both done and live — full
forensic detail in `NEXT_STEPS_ARCHIVE.md`. This is the one item still open:

- [x] **`gc-worker` does NOT self-recover from a `LoggedInElsewhere` kick —
      FIXED, 2026-08-30.** Root cause confirmed: `node-steam-user`'s default
      behavior, when it decides mid-session it needs a FRESH verification
      code, is to prompt for one interactively via stdin if no `steamGuard`
      event listener is registered — something a non-interactive Railway
      container can never answer, so the process hung forever. `index.js`
      never registered that listener. Separate bug from the already-fixed
      fatal-vs-transient EResult classification (that one is correct for the
      *initial login* path — this hang happened on reconnect after a kick).
      **Fix:** added a `steamGuard` handler that auto-supplies a fresh TOTP
      code (same method the normal login path already uses), with a clearly
      tagged log line each time it fires, for tracing. **Deliberately NOT an
      auto-restart** — the user's own reasoning: a `LoggedInElsewhere` kick
      is usually caused by a local/dev `gc-worker` left running against the
      same account ([[project_gc_worker_operations]]); an
      auto-restart in that case would just crash-loop production forever
      against the same live conflict instead of fixing anything. Full
      writeup: memory `project_gc_worker_operations.md`. Not yet pushed
      to production as of this note.

## Tier 10 — Live-testing feedback, 2026-08-27

User found these by actually running the app locally. The bugs/clarity
issues (Band 1 above) are all fixed — full detail in `NEXT_STEPS_ARCHIVE.md`.
These feature requests/redesigns are still open:

- [ ] **Full metrics placement review.** Re-evaluate every metric against
      *which page it actually belongs on* — Home vs. Matches vs. Insights
      vs. Coach — and flag anywhere different granularities get mixed on
      the same card/page. A real design pass, not a quick fix.
- [ ] **Add a time estimate for match parsing** — either per-match ETA or
      a total estimate for everything still queued, using the existing
      `avgSeconds` data already tracked in sync-status.
- [ ] **Rank-change celebration effects** — user wants a big effect on
      crossing into a new rank band and a smaller one for an in-band
      rank-up/down, both directions. **Note for whoever picks this up**:
      `RankBandTakeover` (full-screen, band-crossing) and `RankDeltaBadge`
      (small pill, same-band) already exist in
      `components/RankChangeOverlay.tsx` and are already wired into
      `page.tsx` — confirm with the user whether this request means "I
      didn't know this existed, show me" vs. "the existing effect needs to
      look/feel better," rather than assuming it needs building from
      scratch.
- [ ] **Match-detail drill-down page** — a real per-match view (overview,
      round-by-round, etc.), not just the current summary card. RoundSync
      currently has no single-match detail view at all.
- [ ] **Recent Matches carousel cards need more stats — and the actual
      time played, not just the date.** Currently only shows map/date/K-D
      ratio. User wants Kills, Deaths, Assists, Headshot %, K/D, ADR, and
      Performance Index all visible (the Matches tab's own cards already
      show most of these but are missing Assists; the Home carousel cards
      are missing almost all of them). Also: `formatMatchDate()`
      (`page.tsx`) only formats the date portion of `match_time` — needs
      the time-of-day included too, everywhere a match's date is shown.
- [ ] **Re-evaluate Performance Index using the richer metrics now
      available.** Currently a simple 3-input blend (K/D, ADR, headshot %),
      explicitly labeled a placeholder in its own code comment. With KAST,
      multi-kill rounds, utility, positioning, and engage-decision data all
      now available, this deserves a real re-design.

## Tier 9 — Full-codebase audit findings (2026-08-25, third session same day)

Most findings from this audit are fixed — full detail in
`NEXT_STEPS_ARCHIVE.md`. One item remains, now done:

- [x] **Every `extract_fact_*` function independently re-parses the same
      base demo events — FIXED, 2026-08-30.** `round_freeze_end`,
      `round_end`, `player_death`, `player_hurt`, and `weapon_fire` are now
      each parsed exactly once in `process_and_parse_real_demo` and passed
      into all 7 extraction functions as arguments, instead of every
      function independently re-parsing them (`round_freeze_end` alone was
      re-parsed up to 8 times per sync before this). Done together with
      Tier 9.5 (below) per the dependency-map note that used to sit here —
      the shared pre-parse also includes `fire_bullets`/`player_bullet_hit`/
      `bullet_damage`, which Tier 9.5's rebuild needed. Verified
      byte-for-byte identical output against the pre-refactor version
      across all 10 players in 2 real downloaded matches for every function
      except `fact_duel_placement` (which changed on purpose — see Tier
      9.5). See `_build_slot_to_steamid_map()`'s docstring in
      `services/watcher/sync_pipeline.py` for the one genuinely new parse
      added (`bullet_damage`, needed only to resolve `player_bullet_hit`'s
      slot numbers into real steamids).
- [ ] **AI Coach model name worth revisiting.** `gemini-3.5-flash` is
      genuinely real and valid (checked against current docs, not a typo),
      but newer stable models now exist (`gemini-3.6-flash`,
      `gemini-3.7-flash` as of 2026-08-13). Upgrading is a cost/behavior
      tradeoff for the user to decide, not something to change unprompted.

## Already confirmed correct, no action needed

Entry/opening-duel success %, utility damage per round. See the standards
doc for why.
