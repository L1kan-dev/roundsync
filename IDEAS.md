# Ideas

Original feature/metric ideas — things nobody explicitly asked for, surfaced
proactively (the "Bring Your Own Ideas" lens of the standing 6-lens audit
framework, plus ad-hoc ideas from regular conversation). Distinct from
`NEXT_STEPS.md`, which tracks bugs, fixes, and explicitly-requested work —
this file is just the idea backlog, not yet scoped into a tracked tier.

When an idea here gets picked up for real, move it into `NEXT_STEPS.md` as
its own tier/item and remove it from here (or leave a short cross-reference)
so there's one source of truth for "what's actually being worked on."

---

## 1. Use lifetime Steam stats as each player's own personal baseline

Two real problems already on file in `NEXT_STEPS.md`: trend charts are
unreliable off only ~8 matches of history, and rank-bracket population
comparisons are blocked because RoundSync only has ~3 total users. A
player's own lifetime per-map/per-weapon numbers (see Tier 11 —
`GetUserStatsForGame`, verified real 2026-08-27) sidestep both at once —
it's a real personal baseline available today, no other users' data
needed. E.g. "your AWP kill rate lifetime vs. your last 10 tracked
matches" — an honest comparison, not a guess.

## 2. Score how good the enemy actually was in a clutch, not just whether you won

`fact_engage_decision` already stores `enemies_raw_components` — every
remaining enemy's own kills/deaths/damage at the exact moment you got
outnumbered. Nobody has ever built anything with the enemy side of this
data; it's collected and currently unused. A real, data-backed metric:
"how much better were the players you actually clutched against" — not
estimated, computed directly from what's already stored.

## 3. Fill the "Scanning for your matches" empty state with lifetime stats

A brand-new signup currently sees nothing until their first demo finishes
parsing. Lifetime stats (Tier 11) could fill that instantly — real,
day-one value with zero wait, using data that needs no bot/GC connection
at all.

## 4. Bigger structural fork worth knowing about: team-level data

The whole schema is built around *the tracked player's own perspective* —
every fact table is scoped to one `steam_id64`. If RoundSync ever wants
team-level insight ("how did my whole team do this round," not just me),
that's a real schema-level shift, not a small addition. Not urgent, just
worth having on record as a known fork in the road.

## 5. A dedicated "Lifetime Stats" section using ALL of Valve's data, not just a curated subset

User's own framing (2026-08-27): all of the 215 real fields Valve's
`GetUserStatsForGame` returns (see `NEXT_STEPS.md` Tier 11 for the full
live-verified field list) would be valuable somewhere — not just the small
curated summary (career K/D, top weapons, etc.) planned for the "Scanning
for your matches" empty state. Think a real dedicated page/tab: full
per-weapon breakdown (kills/shots/hits/accuracy for every CS:GO-era
weapon), every map Valve tracks (with an honest note for the ones it
doesn't — Mirage/Ancient/Anubis/Overpass have zero lifetime data), the
novelty stats (dominations, revenges, broken windows, weapons donated),
total contribution score, last-match snapshot, all of it.

This is a bigger, separate vision from Tier 11's day-one empty-state card —
not a replacement for it. Tier 11's endpoint (`GET
/api/user/lifetime-stats`) should be built to return enough of the real
decoded data that this future full page can reuse it directly rather than
needing a second endpoint built later. When this gets picked up for real,
move it into `NEXT_STEPS.md` as its own tier.

## 6. Distance-bucketed kill accuracy (proposed by the user, 2026-08-30) — DONE, 2026-08-30

`NEXT_STEPS.md` Tier 5 already plans a plain "average kill distance" stat
(reusing the existing `pos_df` position-lookup pattern from
`extract_fact_duel_placement`). The user's extension: don't stop at one
average number — bucket kills into close/medium/long range and show
accuracy per bucket, so a player can see "I'm strong up close, weak at
range" instead of one blended figure. The user's own example: compare a
player's long-range bucket against a known real-world yardstick, like
Mirage's Top-Mid-boxes-to-Sniper-Window sightline, so "long range" means
something concrete instead of an arbitrary number.

**Research resolved, 2026-08-30, both questions:**
1. Unit conversion was already solved before this idea was even proposed —
   `CS2_UNITS_PER_METER = 52.49` was already in use elsewhere in
   `sync_pipeline.py`, cited as a real, verified conversion.
2. Checked Leetify/HLTV/Scope.gg (web search, current as of 2026-08-30) —
   no tracker publishes a range-bucketed accuracy/kill stat with defined
   boundaries. This is a genuine RoundSync original. Bucket boundaries are
   anchored to two independently-cited real facts rather than a guess:
   **close ≤30m** reuses `ENEMY_CONTESTED_RANGE_UNITS` (already cited
   elsewhere as assault rifles' effective-accuracy range); **medium
   30-50m** is where CS2 rifles retain near-max damage before falloff
   (confirmed via 2 independent current sources — CSStatLab, profilerr);
   **long 50m+** is where falloff becomes clearly noticeable per the same
   sources.

**Shipped as kill count + headshot% per bucket** (`telemetry.kill_distance_buckets`),
NOT a shots-fired accuracy% per bucket — true accuracy needs the same
enemy-visibility primitive Tier 2's true-accuracy rebuild is blocked on
(see `NEXT_STEPS.md`'s Dependency Map). The real-world-yardstick comparison
(Mirage Top-Mid-to-Sniper-Window) the user proposed as a frontend display
idea is not yet built — that's a presentation layer on top of the now-real
backend data, open for whoever picks up the frontend side.
