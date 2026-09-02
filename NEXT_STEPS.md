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

**Band 0 — UI/UX stabilization pass. DONE, 2026-09-02.** All 8 of Tier 15's
items are done: the original tooltip/glossary cluster (tooltip styling
consistency, Home's trend-chart glossary, Insights' reaction-rate-chart
glossary, full Insights tile glossary coverage), a second pass the same day
2026-08-31 (rank badge centering, tile-gradient consistency, the
round-by-round horizontal/3D layout, the back-button history bug, Insights'
dead-whitespace/tile-sizing fix, the new Economy & Utility trend charts, and
the AI Coach tone rewrite), and finally the per-player stat table (built
2026-09-02, after its own dedicated research pass — see Tier 15 below).
**Not yet committed** — built and verified live, holding per the user's
explicit instruction (2026-09-02) to wait until they've tested it
themselves before anything in this batch gets committed. Numbered 0
deliberately, out of the Bands' normal chronological sequence. **Scope history, so this doesn't read
as inconsistent later:** started 2026-08-31 as a narrow "UI/UX
stabilization pass" (consolidate the known tooltip/tile/glossary bugs into
one pass, user's words: "get it to a version 2.0 or 3.0"). Same day, widened
to a full from-scratch visual redesign + logic audit after the user asked
for "an entire website overhaul... visual = sensible = logic = fail or
pass... completely change the frontend design to something better and more
unique to RoundSync." **That wider attempt is now ABANDONED, same day,
on the user's explicit instruction ("nvm lets stick to our original
overhaul on the backlog. you are not very good at designing websites") —
back to the narrow scope below, tracked but not being actively worked.**

**What was actually tried, and why it failed, so a future session doesn't
repeat the same approach:** four full redesign attempts, all rejected —
(1) three parallel subagents each given only a text brief (hex color
tokens + stat names, no real screenshots) produced generic, flat concepts
that discarded the app's real existing distinctive assets (the CT/T
operator-art background, the glossy 3D rank badge, real map thumbnails,
the two-tone brain icon) — rejected as "a literal downgrade"; (2) a
follow-up personal attempt read the real `globals.css`/`RankBadge.tsx`
source directly and extended the app's actual existing visual system
(exact colors, fonts, the real embossed-tile/duel-color CSS, the real
badge SVG path data) instead of inventing a new one — still rejected as
"objectively worse," with the user's own conclusion being that visual/
graphic design generally isn't a strength here. **Standing lesson saved
to memory** ([[feedback_visual_design_not_a_strength]]): don't initiate
another from-scratch visual redesign attempt (self or subagent) for
RoundSync's frontend without the user asking for it specifically again —
default to small, targeted, code-level fixes instead (the narrow list
below), not new creative visual exploration.

The "visual = sensible = logic, pass/fail" audit IDEA itself is still
sound and worth keeping for whenever this is revisited — check not just
"does it look good" but "does what it visually communicates actually
match what the underlying data/logic means" — but it depends on a visual
redesign happening first, so it's parked with it, not being run standalone.

Full item list and detail: **Tier 15** below (the narrow, original list —
the AI Coach jargon/tone item stays on this list since that's a
backend/prompt-copy fix, not a visual-design task, and wasn't part of
what failed above).
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
- [x] **AI Coach missing round-by-round data — FIXED, 2026-08-31.** Real bug,
      caught by the user directly asking the Coach for a round-by-round
      breakdown of their most recent match and being told that data didn't
      exist — even though the match-detail drill-down page (above) already
      serves exactly this data. Root cause: `/api/coaching/ask`
      (`services/api/server.js`) only ever built `factSummary`, a
      cross-match AGGREGATE of `fact_duel_placement`/`fact_positioning_risk`/
      `fact_engage_decision` percentages, and never gave the model any
      single match's real per-round breakdown — so the model was being
      technically honest given what it was actually handed, not
      hallucinating. Fix: extracted the drill-down page's own grouping logic
      into `fetchRoundByRoundForMatch()` (shared with
      `GET /api/matches/:matchId/rounds`, removing the prior duplication)
      and now also fetch it for the player's single most recent match,
      adding it to the Coach's prompt as real per-round data. Verified
      against live production data (read-only SQL check, not assumed): the
      most recent match has 40 duel rows/19 positioning rows/7 engage rows,
      so the fix has real data to serve, not an empty array. Deliberately
      scoped to the MOST RECENT match only, not all 30 — sending every
      match's raw per-round rows every request would balloon prompt size/
      Gemini cost for little benefit when the player usually means "my last
      game." **Explicitly NOT the full fix — user pushed back on this same
      day**, correctly: the Coach needs to answer about ANY match/round the
      player references, not only the most recent one. Agreed direction for
      tomorrow (Band 0): an Always/Topic split, same shape this project
      already uses for its own memory/doc tiering — an "always" cheap
      cross-match summary (what `factSummary`/`matchSummaries` already are)
      plus "topic" data fetched ONLY on demand for whichever specific match/
      round the question actually needs. The real mechanism for this on
      Gemini is function-calling/tool-use: give the model callable tools
      (e.g. "list recent matches," "get round-by-round for match X") instead
      of the server pre-guessing which match to stuff into the prompt —
      this is what keeps cost down, since a token is only spent on a
      match's data when the model actually decided it needed it that turn,
      not on all 30 every request. Real design work still needed before
      building: how the model references "which match" back to the server
      (index? match_id? by map+date?), how many tool-call round-trips are
      acceptable cost/latency-wise, and how this interacts with
      `conversationContext`'s existing multi-turn history.

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

## Tier 15 — UI/UX stabilization pass (2026-08-31, user-reported, in progress)

**Scope note:** this briefly expanded into a full site-wide visual redesign
same-day, then was reverted back to this narrow list after 4 redesign
attempts were rejected — see Band 0 above for the full history. Treat this
as the real, current scope of this tier: small, targeted, code-level fixes,
not a creative visual overhaul.

Pick this up as a whole Band (Band 0 above) rather than one item at a time,
since several of these likely share one fix (see the grouping notes below
each item).

- [x] **Tooltip styling inconsistency — DONE, 2026-08-31.** The "custom
      styled tooltip already built and used in a few places" was
      `useHoverTooltip`, a cursor-following portal-mounted tooltip built
      inline, once, just for Home's Performance tile (`matchPerformanceTooltip`
      already proved the "one shared hook instance, `.handlers` spread
      across a `.map()`" pattern for reusing it against dynamic lists).
      Extracted to `frontend/lib/useHoverTooltip.tsx` so every page can share
      it. Full inventory of every native `title=` glossary usage (not
      action-label titles like "Close"/"Previous"/"Next", which correctly
      stay native) converted: Home's KPI tiles, Matches-card grid, and
      Recent Matches carousel (`app/page.tsx`); the match-detail page's
      `StatTile` (`app/matches/[matchId]/page.tsx`); and Insights'
      `StatTile` (`components/InsightsDashboard.tsx`) — the latter two now
      call the hook internally per-component-instance rather than the
      parent managing named instances, since each `<StatTile>` is its own
      component call and can safely own its own hook state regardless of
      how many render inside a `.map()`.
- [x] **Home page trend-analysis chart has no glossary — DONE, 2026-08-31.**
      All 4 Trends charts (K/D Ratio, ADR, Headshot %, Performance Index)
      now show an Info icon next to their title, reusing the same shared
      tooltip instances the KPI tiles above already use.
- [x] **Match Detail: rank badge number isn't centered — DONE, 2026-08-31.**
      The visible badge face is the slanted trapezoid
      `M178 0H33.9996L22 64H166L178 0Z`, whose true horizontal center at
      mid-height is x=100 — the old text was drawn at x=106/107, centered
      against the badge's outer bounding box rather than the actual slanted
      shape. `frontend/components/RankBadge.tsx`'s two `<text>` elements
      recentered to x=100/101 (main/shadow), y=31/33 (vertical center of the
      0-64 face), same relative emboss offset preserved.
- [x] **Tiles don't apply their position-based color gradient consistently —
      DONE, 2026-08-31.** Root cause: the match-detail page's `StatTile` and
      its Multi-Kill/Wins-Losses/Kills-by-Distance/Weapon-Breakdown sections
      were the one place in the app still using a flat `bg-[var(--panel)]`
      box instead of the shared `chip3d` + `ctTAccent()` position-based
      duel-color treatment every other page (Home's KPI row, every Insights
      `StatTile`, the Matches-tab cards) already uses. Same root cause as the
      round-by-round item below — fixed together in
      `frontend/app/matches/[matchId]/page.tsx`.
- [x] **Match Detail: round-by-round section needs a layout overhaul — DONE,
      2026-08-31.** Rebuilt as a horizontal scrollable row of `RoundCard`s
      (was a vertical stack), each using the shared `chip3d` bevel treatment
      so it reads as 3D like the rest of the app — win/loss keeps its own
      semantic color (cyan/danger) as `--c` rather than a purely positional
      accent, since a round's color here means something. Also converted the
      "Isolated" tag off its last native `title=` popup onto the shared
      `useHoverTooltip`, caught while already rebuilding this section.
- [x] **Match Detail: full per-player stat table — DONE, 2026-09-02.** Built
      exactly to the researched scope (`CS2_ANALYTICS_STANDARDS.md`'s "Match
      Detail: full per-player stat table" section): a basic K/D/A/ADR/HS%
      table for all 10 players, grouped 5-and-5 by team, NOT extending
      KAST/trade%/positioning-risk to non-tracked players. New
      `extract_match_scoreboard()` in `sync_pipeline.py` (right before
      `capped_damage_sum`) aggregates the already-shared `deaths_df`/
      `hurt_df` per player — no new parsing beyond one extra
      `parser.parse_ticks(["team_num"], ticks=freeze_ticks)` call for roster/
      team assignment (reusing the same pattern `extract_fact_utility_throw`/
      `extract_match_secondary_metrics` already use locally). Names recovered
      from `player_death`'s `attacker_name`/`user_name`/`assister_name`
      columns; a player with zero kills/deaths/assists the whole match (rare)
      falls back to a truncated-steamid label instead of vanishing from the
      table. Stored as `telemetry.player_scoreboard`, added to `Telemetry` in
      `frontend/lib/matchStats.ts`. Frontend: new `ScoreboardTable` component
      in `frontend/app/matches/[matchId]/page.tsx`, reusing the app's
      existing CT-cyan/T-amber convention (`duelLerp(0)`/`duelLerp(1)`) rather
      than inventing new colors, with the tracked player's own row bolded.
      Since this is computed at sync time only, older already-synced matches
      won't have it — the UI shows "unavailable for this match... re-sync to
      include it" rather than a false-empty table.
      **Verified live** (headed Playwright via `run-frontend`'s
      `mock-match-detail.mjs`, extended with a full 10-player mock roster):
      `npx tsc --noEmit` clean, 0 console errors, CT/T grouping and accent
      colors render correctly, tracked player's row highlighted. Not yet
      verified against a real downloaded demo's actual parser output (no
      local demo file available this session) — the aggregation logic itself
      mirrors the already-proven `total_kills`/`total_deaths`/
      `capped_damage_sum` patterns used elsewhere in the same function, not
      new parsing logic.
      **Real follow-up finding, same day**: `gc-worker` already fetches
      `roundstatsall` (for the demo URL) whose last entry carries an official
      Kills/Deaths/Assists/MVPs/headshot-kills/multi-kills scoreboard for all
      10 players, confirmed against Valve's real current proto — see
      `CS2_ANALYTICS_STANDARDS.md`'s "Game Coordinator match resolution"
      section for the field names and what's still unverified (team-split by
      slot). A real future cost optimization (skip the demo-parse path for
      everything but ADR), not a correction to what's built — needs a real
      captured `roundstatsall` response before writing code against it.
- [x] **Browser back button goes to Home, not back to the Matches tab — DONE,
      2026-08-31.** Root cause: the match-detail page's own Back button (and
      its error-state fallback) hard-navigated to `/` via `router.push('/')`
      instead of returning to wherever the user actually came from. Since
      Home's tab switcher already pushes a real history entry per tab
      (`?tab=matches`), the fix was just using `router.back()` instead —
      verified live (headed Playwright): clicking Back from the match-detail
      page lands on `/?tab=matches`, not Home.
- [x] **Insights: dead empty space next to the Consistency/Impact tiles —
      DONE, 2026-08-31.** The "Aim & Reaction" subtab's 2-column grid had 3
      `InsightCard`s (Crosshair Placement, Reaction to Information,
      Consistency & Impact) followed by an already-full-width chart —
      leaving Consistency & Impact alone in its row with an empty cell next
      to it. Added a `wide` prop to `InsightCard` (`lg:col-span-2`) and
      applied it to that card instead of inventing a 4th filler card.
- [x] **Insights: "Reaction rate over time" chart has no glossary — DONE,
      2026-08-31.** Info icon added next to the header, explaining what
      "reacted within 3s" means (new `STAT_GLOSSARY.reactedWithin3s`).
- [x] **Insights: Economy and Utility section has no trending chart — DONE,
      2026-08-31.** `fact_economy`/`fact_utility_throw` rows were already
      being fetched every request for the "Buy Decisions"/"Utility
      Effectiveness" summary tiles, just never aggregated per match into a
      trend series the way `fact_adaptation_event`/`fact_positioning_risk`
      already were for the other 2 subtabs. Extended `buildTrends()`
      (`services/api/server.js`) with `economy`/`utility` series (against-
      team-economy % and team-flash %, same mismatch/team-flash definitions
      as `summarizeEconomy`/`summarizeUtility`, aggregated per match instead
      of across the whole window) and added two new wide `TrendChart`s to
      the "Economy & Utility" subtab — two separate charts, not one merged
      line, since the two metrics come from different fact tables with no
      shared unit to overlay meaningfully.
- [x] **Insights: every tile is missing a glossary entry — DONE, 2026-08-31.**
      Extended `STAT_GLOSSARY` with 15 new entries (grounded in the real
      backend definitions in `services/api/server.js`, not guessed —
      e.g. `againstTeamEconomy` matches `summarizeEconomy()`'s actual
      force-buy/full-buy-vs-team-eco rule, `flashAssists` cites the real
      1.1s HLTV threshold already in `sync_pipeline.py`) and wired a `title`
      into every previously-bare `StatTile` across all 4 Insights sub-tabs:
      Crosshair Placement, Consistency & Impact, Isolated Pushes, Engage vs.
      Save, Buy Decisions, Utility Effectiveness. Also added a new `info`
      prop to the shared `InsightCard` shell (a hoverable Info icon next to
      the card title) for the "Reaction to Information" card, whose content
      is a chart rather than individual tiles. "Positioning Decisions Over
      Time" deliberately left without a duplicate tooltip — it already has
      its own caption text explaining "Good Push Rate" below the chart.
- [x] **AI Coach responses read like a raw-telemetry report, not a coach
      talking to a player — FIXED, 2026-08-31.** Root cause
      confirmed in `services/api/server.js`'s `/api/coaching/ask` prompt
      (around line 997): the current instruction is purely mechanical
      field-name translation (append "°"/"ms"/"%" to a raw key, never repeat
      the snake_case name) — it never asks the model to actually interpret
      what a number means or to speak in a natural, player-to-player voice.
      Three concrete failures found from a real transcript the user shared:
      1. **"0-second time-to-damage" reads as physically impossible.**
         Traced to `sync_pipeline.py:1021`:
         `time_to_damage_seconds = round((hit_tick - opening_tick) / 64, 2)`
         — a hit registering on the same tick as the opening shot rounds to
         `0.00`. The underlying value is real (sub-~15.6ms, one tick), but
         nothing tells the model to phrase a near-zero value as "landed
         almost the instant you fired" instead of the literal rounded
         number. Not a data bug — a missing humanization rule.
      2. **Raw distances never get converted to meters before reaching the
         model.** `nearest_teammate_distance_units`/`nearest_enemy_distance_units`
         (`fact_positioning_risk`) are CS2 engine units. The real conversion
         constant already exists (`CS2_UNITS_PER_METER = 52.49`,
         `sync_pipeline.py:761`) but `server.js` never applies it before
         building the JSON blob sent to Gemini — so the model either repeats
         "925 units" verbatim (meaningless to a player) or does the
         meter-conversion arithmetic itself inside the response, which is
         unreliable to trust an LLM with.
      3. **No natural-voice instruction at all.** The prompt only asks for
         "sharp, data-driven, actionable feedback" — nothing tells it to
         talk like a teammate reviewing the game together rather than
         producing a clinical report (real transcript had section headers
         like "The Telemetry Diagnostics" and "The Tactical Reality").
      **Fix, built as real math in `server.js`, not left to the LLM to
      compute:** new `humanizeRoundsForCoach()` (`services/api/server.js`,
      right after `fetchRoundByRoundForMatch`) transforms the same raw
      `select('*')` fact-table rows the match-detail page fetches into what
      actually gets sent to Gemini for `/api/coaching/ask` specifically
      (the match-detail page itself is untouched — its own UI already picks
      the fields it renders). New `CS2_UNITS_PER_METER = 52.49` constant
      mirrors `sync_pipeline.py`'s exactly. `nearest_teammate_distance_units`/
      `nearest_enemy_distance_units` convert to real meters
      (`nearest_*_distance_meters`, `round1`'d). `time_to_damage_seconds`
      becomes a worded `time_to_damage`: below ~16ms (one 64-tick-rate tick)
      it reads "landed almost the instant the player fired (same game
      tick)" instead of a literal `0.00`; otherwise a plain `"NNNms after
      the opening shot"`. Also drops the columns that were never meant to
      be player-facing in the first place (tick numbers, X/Y/Z world
      coordinates, per-round rank ids, and — a real privacy improvement
      caught along the way — every remaining enemy's real steamid from
      `fact_engage_decision`'s `enemies_components`, which had no reason to
      leave the server at all). The prompt's system instruction was rewritten
      from "expert, direct, and tactical coach" + a purely mechanical
      field-name-translation rule to explicitly frame the model as "a sharp
      CS2 teammate reviewing this player's own games with them," ban
      report-style section headers, and state that per-round data already
      arrives in real-world units/worded phrases so the model must never
      invent its own unit conversion. **Verified two ways:** `node --check`
      passed, and `humanizeRoundsForCoach`'s real math was checked against 4
      constructed before/after cases (a same-tick 0.00s hit, a real 310ms
      hit, a real 925/410-unit distance pair independently hand-verified as
      17.6m/7.8m, and a null-safety case) — all 4 assertions passed, not
      just "the code looks right." Not independently verified against a
      real live Gemini call (would need the production `GEMINI_API_KEY`,
      out of scope for local verification) — the prompt-construction logic
      and its inputs are what were checked.

## Tier 16 — Live-testing feedback on the full stack, 2026-09-02

User ran the full local stack (`api` + `frontend`, `gc-worker` deliberately excluded —
see `project_gc_worker_operations.md`) for the first time since Band 0 and reported 7
issues across Home/Matches/Insights/AI Coach. Investigated each against real code/data
before acting, per standing rule — two turned out not to be bugs:

- **NOT bugs, confirmed via a real Supabase query**: "assists show —" and "Full Scoreboard
  unavailable" are both the correct fallback on real data — every match in production was
  parsed 2026-08-24/08-27, before `total_assists` (2026-08-30) or `player_scoreboard`
  (2026-09-02) existed, and nothing has re-synced since (can't, locally, without
  `gc-worker`). Resolves once a match syncs in production after these fixes ship.
- **NOT a bug, confirmed via code**: the Reaction Rate / Buy Decisions / Utility
  Effectiveness trend-chart line gradient (cyan -> grey -> amber) already exists
  (`TrendChart`'s `linearGradient`, `InsightsDashboard.tsx`) and the reaction tooltip
  already formats as `%`, not seconds/ms.

- [x] **Every stat tile app-wide was silently hoverable with zero visual cue — DONE.**
      Added a small Info icon next to the label on every `StatTile`-shaped component
      (`InsightsDashboard.tsx`, match-detail's `StatTile`) and every bespoke KPI tile in
      Home's 3 grid rows (`app/page.tsx`) — this was the root cause behind most of the
      "missing glossary" reports; the explanations were already wired, just undiscoverable.
      **First pass missed two spots, caught by the user re-checking live**: the top-of-page
      6-tile category-score strip (Economic Discipline/Utility IQ/Awareness/Trade
      Discipline/Aim Placement/Engage IQ — a separate inline component never covered by the
      `StatTile` sweep, had zero tooltip mechanism at all) and the "Isolated Pushes"
      Survived/Died split bar (a second `EmphasisBar` call site, same component as Utility
      Effectiveness's split bar but only that one had gotten a `title` wired). Both fixed —
      6 new `STAT_GLOSSARY` entries added mirroring `computeCategoryScores()`'s real formulas
      in `server.js`, not guessed. `mock-insights.mjs` also extended to actually screenshot
      the Decision-Making subtab, which the original verification pass never captured —
      that's how the split-bar miss went uncaught the first time.
- [x] **Home: Multi-Kill Rounds tile had no tooltip at all — DONE.** The one KPI tile in
      its row with no `useHoverTooltip` wired up; added `multiKillTooltip` using the
      existing `STAT_GLOSSARY.multiKillRounds`.
- [x] **Insights: "Buy Decisions" mix bar gave the native browser tooltip — DONE.**
      `LoadoutMixBar` used a raw `title=` attribute (missed by Tier 15's tooltip sweep
      since it's data-driven, not a static call site) — swapped for the app's custom
      tooltip, one `useHoverTooltip` per fixed `LOADOUT_ORDER` key, with a new
      `LOADOUT_GLOSSARY` mirroring `sync_pipeline.py`'s real `classify_loadout_tier()`
      logic, not guessed.
- [x] **Insights: "Utility Effectiveness" split bar had no tooltip at all — DONE.**
      `EmphasisBar` had zero tooltip mechanism; added an optional `title` + Info icon,
      new `STAT_GLOSSARY.teamFlashSplit` entry.
- [x] **AI Coach tone — DONE.** User feedback: reads as a "passive-aggressive friend,"
      implies false continuity ("next time we play..."), and lost all markdown structure
      (`page.tsx`'s `ReactMarkdown`/`markdownComponents` already style `**bold**` cyan and
      headers — confirmed this was a prompt problem, not a frontend rendering bug). Prompt
      (`server.js`, `/api/coaching/ask`) reframed as "coach reviewing footage," explicitly
      forbidden from implying it was in the match or will be in the next one ("we" ->
      "you"/"your team"), and now explicitly required to (a) bold the few numbers/verdicts
      that matter and (b) end with 2-3 concrete practiceable action items — without
      reverting to the report-style headers the previous fix correctly banned.
- [x] **`mock-home.mjs` testing-infra bug, found while verifying the above — DONE.**
      Never mocked `/api/user/lifetime-stats`; against a bare frontend-only dev server this
      silently no-op'd (network error, not a real HTTP response), but against a REAL `api`
      backend it returns a genuine 401/403, which `page.tsx`'s shared error handling reads
      as "session invalid" and calls `handleLogout()` — silently bouncing the whole script
      back to the logged-out landing page before anything else could render. Added the
      missing route mock.
- **Real finding, verified against 10 real captured responses, 2026-09-02** — `gc-worker`
  already fetches `roundstatsall` (for the demo URL), and its last entry has a real
  `mvps` field (confirmed populated, e.g. `[4,4,2,2,1,0,1,3,0,0]`) with no demo-based
  equivalent anywhere in `sync_pipeline.py` — a genuinely new stat, not yet added.
  **Smaller win than first hoped, though**: confirmed via the same real captures that
  neither `roundstatsall` nor `reservation` carries a per-player team (CT/T) field, so
  team-grouping still needs the demo's `team_num` regardless, and Kills/Deaths/Assists/
  headshot-kills are already effectively free from `deaths_df` (already parsed for the
  tracked player) — pulling those same numbers from the GC instead wouldn't meaningfully
  cut cost. `extract_match_scoreboard()` stays the right primary source; only `mvps` is
  worth adding as a genuinely new field later. Full field-level detail in
  `CS2_ANALYTICS_STANDARDS.md`'s "Game Coordinator match resolution" section.
- **Deferred, needs the user's specifics before touching it**: Match Detail's Round-by-Round
  section — "hard to read/understand," not yet actionable without concrete detail on what
  specifically reads poorly.

**Second round of live-testing feedback (against real re-synced production data), 2026-09-02:**

- [x] **Real data bug: Kills by Distance was 100% "close" on every single match — FIXED.**
      Confirmed impossible by the user, verified against real re-synced data. Root cause:
      `sync_pipeline.py`'s distance calc manually reconstructed attacker/victim position from
      an X/Y tick snapshot at the kill tick — the same fragile snapshot-timing pattern
      already broken once before (the `player_inair` NaN bug). `player_death` already carries
      a real `distance` column (confirmed in `DEMOPARSER2_FIELDS.md`'s bulk field sweep) that
      was simply never used. Swapped to reading `kill["distance"]` directly — also removes a
      whole extra `parser.parse_ticks()` call per match, a real cost win alongside the fix.
- [x] **Match Detail: nothing below the Overview tiles was clickable-to-Coach, and several
      sections had no tooltip — FIXED.** This page never adopted the "click a tile to ask
      the coach" convention every other page uses. Built a cross-route hand-off (`askCoach()`
      pushes `/?tab=coach&q=...`, Home's `page.tsx` reads the `q` param once on mount and
      fills the chat input) since match-detail is a separate route from Home's local
      `promptCoach()` state. Every Overview tile, Multi-Kill Rounds tile, Wins/Losses card,
      Kills-by-Distance tile (now also with a real tooltip — 3 new `STAT_GLOSSARY` entries),
      Weapon Breakdown row, and Round-by-Round card is now a real clickable button.
- [x] **Full Scoreboard: side-by-side CT/T columns replaced with a single stacked list —
      FIXED.** User's reasoning: sides swap at halftime, so labeling a whole-match table
      "Counter-Terrorists"/"Terrorists" misrepresents any player who spent half the match on
      the other side. Still visually groups the two rosters (a divider, each keeping its own
      accent color) without naming which side is which.
- [x] **Insights' 2 trend charts (Buy Decisions / Utility Effectiveness) didn't blend into
      each other like Home's own paired trend charts do — FIXED.** User pointed at Home's
      existing implementation directly rather than have the gradient re-debugged from
      scratch. Real difference found: Home's trend charts scope their gradient to whichever
      half of a 2-up grid they sit in (left chart sweeps cyan->grey only, right chart sweeps
      grey->amber only, so the pair blends at the shared center) — Insights' `TrendChart`
      never did that, always running the full cyan-grey-amber sweep independently per chart.
      New `col` prop on `TrendChart`, applied only to the 2 charts that are actually paired
      side-by-side (Reaction Rate / Positioning Decisions stay full-range — they're each
      full-width on their own row, not paired).
      **Investigated and NOT a bug, confirmed by direct measurement**: the claim that the
      gradient's color-vs-position mapping itself was wrong. Rendered the exact component
      in a controlled test, measured the real SVG path bounding box and gradient stops, and
      screenshotted it — color genuinely tracks each point's real chronological position
      (cyan at the first point, grey at the middle, amber at the last), not a "center of the
      tile" artifact. Left as-is; only the column-scoping (above) was real.
- **Flagged, needs a placement decision, not yet built**: Lifetime Stats currently only
  renders as a "while you wait" placeholder when a user has ZERO synced matches
  (`app/page.tsx`, `parsedMatches.length === 0 && lifetimeStats?.available`) — for any user
  with even one match synced (i.e. almost everyone), it's completely invisible with no
  other place in the app to see it. Real UX gap, confirmed in code, not yet fixed — needs a
  decision on where it should permanently live (profile dropdown? a dedicated tab? a
  collapsed section on Home regardless of match count?) before building.

**Two real, unrelated production bugs found while the bulk resync above was running (user
noticed one match stuck at "1793s elapsed"), both fixed live, 2026-09-02:**
- [x] **`prune_old_matches()` (`watcher.py`) could never delete a match with any `fact_*`
      rows — FIXED via a real DB migration.** All 6 `fact_*` tables' `match_id` foreign key
      had `delete_rule = NO ACTION` (confirmed via `information_schema`, not assumed) — any
      delete touching a match with fact rows failed outright with a `23503` violation, and
      since `prune_old_matches()` deletes its whole `to_delete` batch in one `.in_()` call,
      **one bad match blocked every other match in that same prune pass from being cleaned
      up too**. Migration `cascade_delete_fact_tables_on_match_delete` added `ON DELETE
      CASCADE` to all 6 constraints (`fact_adaptation_event`, `fact_duel_placement`,
      `fact_economy`, `fact_engage_decision`, `fact_positioning_risk`,
      `fact_utility_throw`) — verified via `get_advisors` (no new security lints) and a
      direct `information_schema` re-check (all 6 now show `delete_rule = CASCADE`).
- [x] **One match hung indefinitely in `downloading` status — unstuck, root cause
      identified but the underlying gap (no timeout on the CDN stream) not yet fixed.**
      `CSGO-7KRG2-6PzXc-53GS2-dvWdZ-wkYHK` sat in `status: "downloading"` for ~30 minutes
      with no `✅ Successfully processed` or error line ever printed for it in
      `watcher` logs — `sync_pipeline.py`'s `process_and_parse_real_demo()` writes
      `"downloading"` as its very first DB write, then streams the demo from Valve's CDN
      with no timeout on that step, so a slow/stalled stream can hang forever with nothing
      to recover it. Manually reset (`status` -> `pending_download`, `parsed_at` -> now) so
      `watcher`'s normal queue picks it up again. **Real follow-up, not yet built**: add an
      actual timeout (and a retry/backoff path, same shape as `gc-worker`'s
      `resolve_attempts`/`next_retry_at`) around the CDN stream step so this can't hang
      indefinitely again.
- **Side effect of the bulk resync itself**: resetting all 10 matches' `status` back to
  `pending_url` without also refreshing `parsed_at` made the (correct, pre-existing)
  48-hour stuck-match detector in `prune_old_matches()` see them as abandoned — this is
  what surfaced the FK bug in the first place, not something the resync broke on its own.

All of the above verified live (headed/headless Playwright against the real
`docker-compose` `api`+`frontend` stack, not just the frontend-only dev server) —
`npx tsc --noEmit` clean, `node --check server.js` clean, 0 console errors on Home/
Insights(aim)/Insights(resources)/match-detail. **Not committed** — holding per the
user's explicit instruction to wait until they've tested Band 0 themselves.

## Already confirmed correct, no action needed

Entry/opening-duel success %, utility damage per round. See the standards
doc for why.
