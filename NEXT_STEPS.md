# Data Accuracy Roadmap

From the 2026-08-25 data audit and the follow-up standards research
(`services/watcher/CS2_ANALYTICS_STANDARDS.md`). This file is now trimmed
to current state: what's still open, in full, plus a one-line pointer for
anything already finished. **Full forensic detail on every finished item —
what was checked, exact before/after numbers — lives in
`NEXT_STEPS_ARCHIVE.md`, read only on demand, not every session.** Split
done 2026-08-28 specifically to cut this file's mandatory-read cost; two
lessons that generalize beyond their own bug got promoted to memory
(`project_supabase_security_patterns.md`) before anything moved, so nothing
load-bearing got buried.

A fuller visual writeup of the 2026-08-25 audit also exists as a "RoundSync
Data Audit" Claude artifact, but that link lives outside this repo — this
file (plus the archive) is the source of truth, not the artifact.

## Recommended Priority Order

The Tiers below are grouped by *category* (what kind of fix/feature), not by
urgency — they got appended session-by-session as things were found, not
reordered as the backlog grew. This section is the actual "what to work on
next" guide.

`IDEAS.md` is a separate, intentionally-overlapping list — some ideas below
also appear there in their own words. That duplication is deliberate.

**Standing note:** Tier 14's 502 fix and `gc-worker` GC retry-loop fix are
both applied and live. `gc-worker` is still not self-recovering from a
`LoggedInElsewhere` kick — see Tier 14 below, this is the one open item from
that production incident.

**Band 1 — Real users are confused right now. DONE, 2026-08-27.**
All 4 came from actually using the live app — full detail in archive, Tier
10 section:
- [x] Sync-progress counts not matching reality
- [x] Reaction time shown in seconds instead of ms
- [x] Inconsistent stat labels/units
- [x] Unclear "Positioning Decisions" tooltip

**Band 2 — Cheap, real value, no blockers.**
- [x] Tier 11: lifetime stats via Steam Web API — DONE, 2026-08-27
- Tier 5 "Free/Cheap": weapon-segmented stats, kills/damage in wins vs. losses, kill distance, self-flash duration
- Tier 6.5: rank-tier label (pure lookup on data already stored)
- [x] KAST/headshot%/multi-kill parity in Insights — DONE, 2026-08-27
- [x] Real map thumbnails — DONE, 2026-08-27
- [x] Tier 13: precision-over-rounding sweep — DONE, 2026-08-27

**Band 3 — Consistency work tied to what's already shipped.**
- Performance Index redesign (Tier 10 — explicitly labeled a placeholder in its own code comment; KAST/multi-kill/positioning data now exists to build a real one)
- Tier 5.5: Engage IQ redesign (staged plan already agreed, just not started)

**Band 4 — Needs one scope decision, then unblocks work.**
- Tier 9: 8x-per-sync duplicate parsing (touches all 7 extraction function signatures)
- Tier 9.5: `fact_duel_placement` rebuild onto `fire_bullets`/`player_bullet_hit` (touches production Crosshair Placement data)

**Band 5 — Cheap correctness tweaks, align to published definitions.**
- Trade-kill window 3s → 4s
- Flash assist: add HLTV's 1.1s minimum
- Clutch won: exclude "fake" clutches

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

## Tier 3 — Align to the stricter published version

- [ ] **Flash assist**: add HLTV's ~1.1s minimum blind-duration threshold.
- [ ] **Trade-kill window**: 3s → 4s to match Leetify's published window.
- [ ] **Clutch won**: exclude "fake" clutches (round already unwinnable for
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
- [ ] **Weapon-segmented stats** (AWP kills, rifle vs. pistol performance) —
      `player_death.weapon` / `player_hurt.weapon`, already parsed.
- [x] **Multi-kill rounds (2K/3K/4K/Ace)** — done, 2026-08-27. `telemetry.multi_kill_rounds`.
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
      (`continue`) instead of captured.
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

- [ ] **Rank-tier label** (Grey/Light Blue/Blue/Purple/Pink/Red/Gold for a
      given CS Rating number) — cheap, available now. Pure labeling of the
      `player_rank_new` value already stored in every fact table.
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

## Tier 9.5 — Found only after actually reading the full research docs, not their summaries

- [ ] **`extract_fact_duel_placement` uses a less precise data source than
      what's already documented as available.** Currently anchors on
      `weapon_fire` for the opening-shot tick, then does a separate
      `parse_ticks()` snapshot lookup for the shooter's position/yaw and
      (via `player_hurt`) the opponent's identity/position. But
      `DEMOPARSER2_FIELDS.md`'s full field crawl already documents two
      richer, more direct sources: `fire_bullets` carries the shooter's
      *exact* fired angle (`angles_x/y/z`) on the same row as the shot
      itself, and `player_bullet_hit` carries the victim's *exact* position
      at the hit (`victim_pos_x/y/z`) plus `round` built directly into the
      row. **Flagged for a scope decision** — this touches
      `fact_duel_placement`, which already feeds production data
      (Crosshair Placement card, `aim_placement` category score), so a
      rebuild needs sign-off, not a silent swap.

## Tier 5.5 — Engage IQ redesign (proposed 2026-08-27, queued behind the audit)

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
`feedback_five_lens_audit_framework.md` — redundancy/architecture, security,
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

- [ ] **`gc-worker` does NOT self-recover from a `LoggedInElsewhere` kick.**
      **CONFIRMED, 2026-08-27** via `railway logs --service gc-worker`:
      production logs stop dead at `Steam Guard App Code:` with zero
      further output, and `railway status` shows the service as
      "Completed" (process exited), not "Online" — meaning production's bot
      sits fully offline after a kick, not silently retrying. Root cause:
      `SteamTotp.generateAuthCode()` generates a real 2FA code automatically
      for the normal login path (`connectToSteam()`), but Steam's
      `LoggedInElsewhere` response apparently routes through a different
      flow that falls back to prompting for a code interactively via
      stdin — something a non-interactive Railway container can never
      answer, so the process just hangs. Separate bug from the already-fixed
      fatal-vs-transient EResult classification (that's correct for the
      *login* path — this hang happens on reconnect after a kick).
      **Not fixed yet — flagged for a dedicated session.** Production is
      currently down for `gc-worker` specifically because of this; the
      other 3 services are Online.

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
`NEXT_STEPS_ARCHIVE.md`. Two items are still open:

- [ ] **Every `extract_fact_*` function independently re-parses the same
      base demo events** (`round_freeze_end`, `round_end`, `player_death`,
      `player_hurt`, `weapon_fire`, etc.) from scratch, instead of reading
      each event once and sharing it. `round_freeze_end` alone is re-parsed
      independently up to 8 times per single match sync. Since
      `demoparser2` has to scan the compiled demo stream per call, this is
      real, repeated wasted work every sync — but fixing it means changing
      the signatures of all 7 extraction functions to accept pre-parsed
      DataFrames instead of parsing their own. **Flagged for a scope
      decision, not yet started.**
- [ ] **AI Coach model name worth revisiting.** `gemini-3.5-flash` is
      genuinely real and valid (checked against current docs, not a typo),
      but newer stable models now exist (`gemini-3.6-flash`,
      `gemini-3.7-flash` as of 2026-08-13). Upgrading is a cost/behavior
      tradeoff for the user to decide, not something to change unprompted.

## Already confirmed correct, no action needed

Entry/opening-duel success %, utility damage per round. See the standards
doc for why.
