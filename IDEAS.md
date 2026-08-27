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
