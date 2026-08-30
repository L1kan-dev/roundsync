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
something needing a restart). Pushed to `main` 2026-08-31 (18 commits,
including this fix) — Railway's auto-deploy-on-push means this and every
other item below marked done-but-not-yet-pushed is now live; verify
`railway status` if anything here still seems stale.

## Recommended Priority Order — the Bands, read this to pick what's next

**Band 0 — UI/UX stabilization pass. NEXT UP, decided 2026-08-31, not
started.** Numbered 0 deliberately, out of the Bands' normal chronological
sequence — user's explicit call 2026-08-31: consolidate every currently-known
UI/UX issue into one dedicated pass (their words: "get it to a version 2.0 or
3.0") before resuming any new-feature Tier below. Rationale, confirmed with
the user: most of these are the same root cause repeated across several
pages (missing glossary, inconsistent tooltip styling, tile sizing) — fixing
the pattern once is cheaper than re-solving it page by page while also
shipping new features on top. No version-number tag exists anywhere in this
repo currently (no semver/git tags) — "2.0"/"3.0" is a milestone label for
the user's own tracking, not something the codebase needs; a real git tag
can be added when this ships if wanted. Full item list and detail: **Tier
15** below.
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

**Band 3 — Consistency work tied to what's already shipped. DONE, 2026-08-30.**
- [x] Performance Index redesign (Tier 10) — DONE, 2026-08-30, see Tier 10 below
- [x] Tier 5.5: Engage IQ redesign — Phase 1 (factor capture) DONE, 2026-08-30; scoring-methodology phase deliberately deferred, see Tier 5.5 below

**Band 4 — DONE, 2026-08-30.**
- [x] Tier 9: 8x-per-sync duplicate parsing — fixed, all 7 extraction functions now share one pre-parse
- [x] Tier 9.5: `fact_duel_placement` rebuild onto `fire_bullets`/`player_bullet_hit` — done together with Tier 9

**Band 5 — Cheap correctness tweaks, align to published definitions. DONE, 2026-08-30.**
- [x] Trade-kill window 3s → 4s (`TRADE_KILL_WINDOW_TICKS`) — feeds `fact_positioning_risk`'s trade check, `trade_kill_pct`, and KAST.
- [x] Flash assist: add HLTV's 1.1s minimum blind duration (`FLASH_ASSIST_MIN_BLIND_SECONDS`) before crediting a kill on a blinded victim.
- [x] Clutch won: exclude "fake" T-side clutches per HLTV's 2024 adjusted-clutch-requirements rule (verified against hltv.org/news/40818) — disqualified if more than one teammate was still alive at CTs' last realistic chance to start defusing (5s before detonation with a kit, 10s without; standard 40s C4 timer). Needed a new `bomb_planted` parse, added to the Tier 9 shared pre-parse and threaded into `extract_match_secondary_metrics` as `bomb_planted_df`. CT-side clutches aren't covered by this rule (not part of HLTV's published fix).

**Band 6 — Bigger builds, sequenced by shared dependency. BLOCKED
upstream, 2026-08-30.**
Tier 2's Time to Damage and reaction-time rebuilds, plus Tier 5's spray
accuracy / raw accuracy (both need "was the enemy visible" gating per
Leetify's own definition, confirmed 2026-08-31), all need a real
player-visibility primitive. `awpy` looked like the answer (real API,
MIT, built on the same `demoparser2` already in use) — but real testing
2026-08-30 found its own asset pipeline is currently broken: `awpy get
tris` 404s against every build ID tried, including the newest one awpy's
own CI has published, so the library can't actually serve the map data
`VisibilityChecker` needs right now. Not a RoundSync mistake — confirmed
upstream. Reverted the `requirements.txt`/`Dockerfile` changes that had
been added for this (a broken `RUN awpy get tris` step would have failed
the watcher service's Docker build in production). Full trail in
`CS2_ANALYTICS_STANDARDS.md`'s Academic/open-source layer section. **Next
step for whoever picks this back up: re-check whether `awpy get tris`
works again before resuming** — if still broken, the workaround is
building `.tri` mesh files locally from the game's own installed map
files per awpy's docs, rather than waiting indefinitely.

**Band 7 — Bigger UX asks, real value but bigger scope.**
- [x] Match-detail drill-down page — DONE, 2026-08-31. New route `frontend/app/matches/[matchId]/page.tsx`, reached via a "View Details" button on each Matches-tab card. Backed by two new endpoints (`GET /api/matches/:matchId`, `GET /api/matches/:matchId/rounds`), both ownership-checked against `req.user.steamId`. Overview section finally surfaces `weapon_segmented_stats`/`kills_damage_by_round_outcome`/`kill_distance_buckets` — all three were computed and stored since 2026-08-30 (Tier 5) but had no UI anywhere until this page. Round-by-round section groups this player's own rows from `fact_duel_placement`/`fact_positioning_risk`/`fact_engage_decision` by round — deliberately NOT a full 10-player round-result timeline (no round-winner field is persisted anywhere; round_end is only ever parsed transiently in sync_pipeline.py to derive other stats). Extracted `performanceIndex`/`formatMatchDate`/the `Match`/`Telemetry` types into `frontend/lib/matchStats.ts`, shared with `page.tsx`, rather than duplicating them into the new page.
- [x] Recent Matches carousel — missing fields — DONE, 2026-08-30
- [x] Full metrics placement review — DONE, 2026-08-31. Full inventory of every metric across Home/Matches/Insights/Coach found the tab structure itself already sound (Home = aggregate/recent, Matches = per-match cards, Insights = deeper analytical breakdowns, Coach computes nothing new) — no metric needed relocating. But it surfaced a real computation-method bug: `buildMapBreakdown()` (`services/api/server.js`) averaged each match's own `kd_ratio`/`adr`/`headshot_pct` directly instead of pooling by real per-map totals — same "average the percentages instead of pooling the real counts" bug class as the already-fixed awareness-score issue. Verified with a concrete example: a 3-1 match + a 20-18 match on one map used to report K/D 2.1 (skewed by the small-sample outlier), now correctly reports 1.2 (pooled kills/deaths). Also found `/api/matches`'s `.limit(50)` was dead margin — `watcher.py`'s `MATCH_RETENTION_LIMIT` caps the database at 30 matches/user regardless, so it never actually served a 50-match window; aligned to 30 to match Insights/Coach and remove the false impression of a cross-tab data-window mismatch. **Follow-up, same day:** user directly flagged tooltip/caption inconsistency across pages. Extracted `frontend/lib/statGlossary.ts` as the single source for every non-obvious stat's explanation (Trade Kill %, Entry Success %, KAST, ADR, HS Accuracy, Utility Dmg/Rd, Clutches Won, Isolated Push, Outnumbered Moment), wired into `page.tsx`, `matches/[matchId]/page.tsx`, and `InsightsDashboard.tsx`. Deliberately did NOT add tooltips to self-evident stats (Kills, Deaths, Rounds Played) — the other half of the same report was that captions/tooltips weren't everywhere necessary. Real bug caught along the way: both Performance Index hover-tooltips (Home + Matches) still described the OLD 3-input formula (K/D/ADR/HS%) — stale ever since the 6-input redesign (Tier 10 below, 2026-08-30) — now state the real weights.
- [x] Rank badge visual redesign — DONE, 2026-08-27
- [x] Rank-change celebration effects — DONE, 2026-08-31. User confirmed they didn't know `RankChangeOverlay.tsx`'s effects already existed; watched both live (headed Playwright, not just screenshots — see `feedback_local_dev_testing_windows.md`), then asked for the takeover to feel bigger/louder. Real bug found along the way: the badge's own number and the takeover's number both jumped straight to the new value with zero animation — extracted a shared `useCountUp` hook (`frontend/lib/useCountUp.ts`) used by both `RankBadge.tsx` (badge glow + count-up) and the takeover. Bigger miss caught by the user directly: the takeover never rendered the actual CS2 rank badge SVG asset at all, just plain number text — replaced with a real `<RankBadge>` instance, same asset the profile tile uses. Particle burst bumped from a single 1.1s wave to two staggered 2.2s waves (`rank-particle-burst` in `globals.css`) since a single fast burst had already fully faded before a viewer's eyes settled on the takeover.
- [x] Parse-time ETA — DONE, 2026-08-30. Full detail in Tier 10 below (was a stale duplicate entry here, left `[ ]` after Tier 10 was already marked done — fixed).
- [x] AI Coach adaptive prompt framing — DONE, 2026-08-31. User feedback, direct quote: "you tend to think the players using the application is not good... what about if a high rank player wants to improve? ... having a mindset of the player is bad makes high rank players question the questions more." Every hardcoded-deficiency `promptCoach()` call across Home/Matches/Insights assumed the player was underperforming regardless of their actual number. Chose "full pass, adaptive framing" (user's explicit choice over a narrower fix). New `frontend/lib/promptTone.ts`: `statTier()`/`adaptivePrompt()` classify a stat as weak/neutral/strong against real published benchmarks (web-searched 2026-08-31, sourced inline in the file: K/D, ADR, headshot%, KAST, entry-success%, utility-dmg/round from pley.gg/cs2bet.io/blog.cs2.ad/leetify/recoilanalytics/faceitfinder; RoundSync's own `performanceIndex` scale is explicitly flagged as an internal convention, not external research). No benchmark exists for trade-kill%, clutches-won, multi-kill counts, or headshot-accuracy(vs-kill%) — those stay neutrally worded instead of getting a fabricated threshold. Applied across ~10 `page.tsx` prompts (Performance Index, K/D, ADR, HS%, Entry Success%, Utility Dmg/Rd, KAST, plus both per-match "what went wrong" prompts on the carousel and Matches cards, which branch on that match's own performance index) and ~2 adaptive + ~7 neutrally-reworded prompts in `InsightsDashboard.tsx`. Verified live (headed Playwright, mocked a K/D-1.8/ADR-100/HS-55%/KAST-80 player): K/D prompt now reads "already strong — what's the next-level habit that separates this from elite?" instead of presuming a deficiency.

**Band 8 — Research-only, no build attached yet.**
- [x] Tier 12: player-wanted-gaps research — DONE, 2026-08-31, see Tier 12 below. Findings moved to `IDEAS.md` items 7-9, not a build queue yet.
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
- [ ] **Spray accuracy** — **moved out of "Cheap," was miscategorized.**
      Verified 2026-08-31 against Leetify's own published definition (real
      web research, not assumed): a spray is 3+ shots, and spray accuracy
      only counts shots fired *while the enemy was spotted/visible* —
      the same missing enemy-visibility primitive Tier 2/Band 6 needs,
      currently blocked upstream (`awpy get tris` 404s, see Band 6). The
      `BURST_GAP_TICKS` grouping (already in `extract_fact_duel_placement`)
      only solves the "what counts as one spray" half of this, not the
      "was the enemy actually visible" half — building it without that gate
      would silently ship a different, weaker metric (hit-rate during any
      3+ shot burst) under the "spray accuracy" label. Blocked on the same
      dependency as Tier 2 until `awpy`'s asset pipeline is fixed or a
      local `.tri`-mesh workaround is built — see Band 6 for the real
      status. `CS2_ANALYTICS_STANDARDS.md` already correctly flagged this
      dependency (line ~319); this file just hadn't matched it until now.
- [x] **Counter-strafing quality** — DONE, 2026-08-31. New
      `telemetry.counter_strafe_clean_shot_pct` (rifle-only, matching
      Leetify's own rifle-only scoping for its analogous spray-accuracy
      stat). "Clean" = the shooter's real ground speed at the instant of
      firing was at/under the real CS2 movement-accuracy threshold — 88
      units/s (34% of a rifle's max run speed), confirmed 2026-08-31 via
      real web research cross-checking multiple independent sources
      including NextFrag's shipped "counter-strafe clean shot %" demo
      metric, not guessed. New `COUNTER_STRAFE_ACCURATE_SPEED_UPS` constant
      in `sync_pipeline.py`. Speed computed from real position deltas (one
      tick before the shot vs. `fire_bullets`' own exact origin at the shot
      tick) — same convention `RUN_SPEED_THRESHOLD_UPS` already uses,
      deliberately NOT the raw `velocity`/`velocity_X/Y/Z` tick fields,
      since those are known to silently drop from bulk `parse_ticks()`
      calls (an existing code comment already flagged this; resolves a
      contradiction found in `DEMOPARSER2_FIELDS.md`'s bulk-field-sweep
      note, which had claimed velocity "confirmed working" — that claim
      wasn't re-verified against a real demo and the safer, already-proven
      position-delta path was used instead).

      **Real bug caught during real-data verification, same day:** an
      earlier version tried to exclude airborne shots via
      `fire_bullets.player_inair`, which came back `NaN` for every single
      row in a real downloaded match — not just unavailable, but actively
      wrong, since `bool(float('nan'))` is `True` in Python, so every shot
      was silently treated as airborne and skipped, and the stat came back
      `None` even for a player with 16 real rifle shots. Confirmed the
      field itself was the broken part (not the player's real movement) two
      independent ways: the player's own Z position was completely flat
      during every one of those "airborne" ticks, and `bullet_damage`'s own
      separate `in_air` field said `False` for the matching tick. Fix:
      dropped the airborne exclusion entirely rather than trust the broken
      field — verified against the same real match afterward, now correctly
      returns `100.0` (16/16 clean shots), matching an independent manual
      recomputation. Known, documented limitation left in place rather than
      silently patched over: a real jump-shot (its own separate inaccuracy
      penalty) could still register as "clean" if horizontal speed happened
      to be low mid-jump — no reliable alternative airborne signal was
      verified in the time available.
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

- [x] **Evaluate `awpy` (MIT license, github.com/pnxenopoulos/awpy) — DONE,
      2026-08-30, verdict: BLOCKED upstream.** Design is sound: runs on top
      of the same `demoparser2` `sync_pipeline.py` already uses, exposes
      `awpy.visibility.VisibilityChecker.is_visible(p1, p2)` at
      ~65-177μs/check with a one-time per-map BVH build (744ms-9.6s), covers
      CS2's current competitive map pool. **But real testing found `awpy get
      tris` — the only way to get the map data the checker needs — 404s
      against awpy's own asset mirror for every build ID tried**, including
      the newest one their own CI has published. Confirmed a real upstream
      bug, not a RoundSync mistake. Nothing installed in production; the
      `requirements.txt`/`Dockerfile` changes made for this were reverted
      the same session once the block was found. Full trail in
      `CS2_ANALYTICS_STANDARDS.md`. Re-check before resuming.
- [ ] Nav-mesh data as a possibly more reliable path to bombsite resolution
      than the manual callout-centroid approach — not yet evaluated in
      detail (visibility was the priority check).
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

## Tier 12 — Research queue: what players actually want that existing trackers don't offer — DONE, 2026-08-31

Ran the survey method below via a dedicated research pass. **Real tooling
constraint hit:** Reddit and HLTV forums were blocked to the research
tool's web access (403s) — substituted Steam Community discussions
(including Leetify's own 191k-member Steam group), Trustpilot reviews of
Leetify/Scope.gg, and tracker.gg's own public feedback board. Still real
player-voiced sources, just thinner coverage than a full Reddit sweep
would give — noted so this isn't mistaken for a complete survey later.

All surviving findings, sourced and cross-verified against each tracker's
current shipped feature set, moved to `IDEAS.md` items 7-9 (highest
confidence: async annotated demo review, automated buy-decision quality
scoring, explainable round-level rating attribution) plus a "weaker/
unsourced candidates" note for the rest, per this tier's own step 4 below.
Nothing here jumped straight to a build queue — that was deliberate.

**Method used:**
1. Search real player-voiced sources (Reddit, Steam community discussions,
   existing trackers' own feedback threads), not marketing pages.
2. Compile a raw list with sources, same rigor as `CS2_ANALYTICS_STANDARDS.md`'s
   existing research.
3. Cross-verify each item against what major trackers actually currently
   ship — a "gap" from 2 years ago might already be built by now.
4. Whatever survives goes into `IDEAS.md`, not straight into a build queue.

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

- [x] **Full metrics placement review — DONE, 2026-08-31.** Full detail in
      Band 7's summary entry above. Tab structure itself was already sound;
      surfaced a real `buildMapBreakdown()` K/D-pooling bug and a dead
      `.limit(50)` vs. the real 30-match retention cap. Follow-up from the
      same review: tooltip/caption wording was inconsistent across pages
      (Performance Index's hover tooltip still described the OLD 3-input
      formula after the 6-input redesign) — fixed, extracted
      `frontend/lib/statGlossary.ts` as the single source for stat wording.
- [x] **Add a time estimate for match parsing — DONE, 2026-08-30.** Full
      detail in Band 7's summary entry above. Total + per-match-remaining
      ETA in the sync progress panel, from the existing `avgSeconds`.
- [x] **Rank-change celebration effects — DONE, 2026-08-31.** Full detail
      in Band 7's summary entry above. Confirmed with the user: "show me
      what exists first," not build-from-scratch. Real gaps found once
      shown live: neither number animated, and the fullscreen takeover
      never rendered the actual rank badge SVG asset at all.
- [x] **Match-detail drill-down page — DONE, 2026-08-31.** Full detail in
      Band 7's summary entry above.
- [x] **Recent Matches carousel cards need more stats — and the actual
      time played, not just the date — DONE, 2026-08-30.** `assists` never
      existed as a real backend stat at all — `player_death`'s
      `assister_steamid` was already parsed for KAST but never counted per
      player. Added `total_assists` extraction in `sync_pipeline.py`
      (same pattern as `total_kills`/`total_deaths`) and threaded it into
      `real_payload.telemetry.assists`; passes through `/api/matches`
      unchanged since that endpoint selects the whole `match_data` blob.
      Frontend: added `assists?: number | null` to the `Match` telemetry
      type (optional/nullable like the other post-hoc fields, since older
      already-parsed matches won't have it — renders `—` via `t.assists ?? '—'`,
      verified in a mocked screenshot). Matches tab card grid went from
      4 stats (K/D, Kills, ADR, HS) to 6 (added Deaths, Assists), 3-col x
      2-row. Home carousel card was previously image-heavy showing only
      K/D — redesigned to a compact 4-col stat grid (K/D, Kills, Deaths,
      Assists / ADR, HS, Performance spanning 2 cells) below a smaller
      image, verified in a mocked screenshot at 5-cards-per-page width.
      `formatMatchDate()` now uses `toLocaleString` with `hour`/`minute`
      instead of `toLocaleDateString` — fixes every call site at once
      since it's the one shared function (Home carousel, Matches tab,
      AI Coach prompt text).
- [x] **Re-evaluate Performance Index using the richer metrics now
      available — DONE, 2026-08-30.** Was a simple 3-input blend (K/D 50%
      / ADR 35% / HS% 15%), explicitly labeled a placeholder. Now a
      6-input blend — `frontend/app/page.tsx`'s `performanceIndex()` and
      `services/api/server.js`'s `performanceIndexServer()` (kept in sync
      deliberately, same as before) — adding KAST (30%), trade-kill% (10%),
      and a multi-kill bonus (8%), while re-weighting ADR up to 30% and
      K/D down to 15%. Weights are grounded in real published research
      (checked 2026-08-30, not guessed): ADR and KAST are the two most
      outcome-predictive classic stats; K/D is explicitly the LEAST
      correlated with actual round impact among them (ignores damage/
      trades/survival); headshot% is a mechanics indicator, not an outcome
      predictor, so it stays small (7%). A component missing on an older
      already-parsed match (KAST/trade-kill%/multi-kill weren't always
      captured) doesn't get penalized as 0 — its weight is redistributed
      proportionally across whichever components ARE present, verified via
      constructed test cases (full data, missing components, and a
      genuine measured 0% KAST correctly NOT treated as missing).

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

## Tier 15 — UI/UX stabilization pass (2026-08-31, user-reported, not yet started)

Raw list from the user's own live use of the app, 2026-08-31 — not yet
triaged into root causes or an implementation order. Pick this up as a whole
Band (Band 0 above) rather than one item at a time, since several of these
likely share one fix (see the grouping notes below each item).

- [ ] **Tooltip styling inconsistency.** Most tooltips render as the
      browser's generic native tooltip (`title` attribute), not the custom
      styled tooltip already built and used in a few places. Needs an
      inventory of every tooltip in the app and a pass to standardize all of
      them onto the existing custom component.
- [ ] **Home page trend-analysis chart has no glossary.** The chart itself
      renders but nothing explains what it's showing — same gap as several
      Insights items below, likely the same missing pattern everywhere a
      chart/tile was added after `frontend/lib/statGlossary.ts` was built.
- [ ] **Match Detail: rank badge number isn't centered** inside the badge
      asset (visual bug, not a data bug).
- [ ] **Tiles don't apply their position-based color gradient consistently.**
      Some tiles are supposed to shift color by their position on the page;
      not currently applied everywhere it should be.
- [ ] **Match Detail: round-by-round section needs a layout overhaul.**
      User's specific ask: horizontal orientation instead of the current
      layout, and every tile in the match-detail page should read as "3D"
      (visual depth/styling), not flat.
- [ ] **Match Detail: missing a full per-player stat table.** No comparison
      table of every player's stats for the match exists anywhere in the
      app right now (only the tracked user's own numbers are shown).
      **Needs real research** (same rigor as `CS2_ANALYTICS_STANDARDS.md`'s
      other research, not a guess) into how other trackers (Leetify, HLTV,
      Scope.gg, tracker.gg) lay this out before building — user explicitly
      asked for this to be researched, not assumed.
- [ ] **Browser back button goes to Home, not back to the Matches tab** the
      user actually came from — a navigation/history-state bug on the
      match-detail route.
- [ ] **Insights: dead empty space next to the Consistency/Impact tiles**,
      and inconsistent tile sizing across the page generally.
- [ ] **Insights: "Reaction rate over time" chart has no glossary.**
- [ ] **Insights: Economy and Utility section has no trending chart** (other
      sections on the same page do).
- [ ] **Insights: every tile is missing a glossary entry** — broadest item
      on this list, likely the single biggest chunk of Band 0's work. Same
      `frontend/lib/statGlossary.ts` pattern already used on Home/Matches/
      match-detail should extend to cover every Insights tile.

## Already confirmed correct, no action needed

Entry/opening-duel success %, utility damage per round. See the standards
doc for why.
