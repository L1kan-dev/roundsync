# CS2 Analytics Standards Reference

Research log for every stat RoundSync computes (or is considering computing),
checked against how the wider CS2 analytics community (HLTV, Leetify, FACEIT,
Scope.gg, csstats.gg) actually defines and measures it. Check here before
re-researching any of these terms. **Trimmed 2026-08-28** — the research
*process* behind several findings (rank badge pixel-measurement, the full
Google AI Mode fact-checking trail) moved to
`CS2_ANALYTICS_STANDARDS_ARCHIVE.md`, on-demand only; every verdict and
reusable fact below is unchanged and complete on its own.

Format per metric: **Calculation** (industry-standard definition) · **Purpose**
(what question it answers) · **Measurement** (unit/scale/aggregation) ·
**RoundSync verdict** (have it / need it / fix it) · **Legal**.

---

## Legal summary (read this first)

General pattern found across every metric researched: a statistic that is a
**simple, mechanical calculation over publicly-observable game data**
(K/D, ADR, KAST, entry-duel win rate, trade-kill %, clutch %, time-to-damage
as a *concept*) is **not proprietary** — these are treated as open,
community-standard terminology across the whole industry, the same way
"batting average" isn't owned by anyone in baseball. What IS protected:

- **Branded product names** — "HLTV Rating", "Leetify Rating", "Leetify Aim
  Score" are specific companies' named products. Don't use their names on
  RoundSync's own numbers, even if the underlying concept is generic.
- **Genuinely undisclosed formulas** — HLTV's Rating 3.0 coefficients have
  never been published (confirmed via research, not assumption — Rating 2.0
  was only ever *reverse-engineered* by third parties, never officially
  released, and 3.0 is stricter still). That's a trade secret. We can't copy
  it because nobody outside HLTV has it, and reconstructing an
  independently-designed formula from our own extracted data is fine — it's
  not the same as copying theirs.

None of this is a legal opinion — it's engineering-level diligence. If
RoundSync ships a public composite score, a real IP/trademark check before
launch is the safe move, not this doc.

**The Steam bot account itself.** `services/gc-worker` logs into a real
Steam account and automates it (connects to CS2's Game Coordinator,
requests match data, runs unattended). Steam's Subscriber Agreement
prohibits "bots"/"automation software" interacting with Steam's services,
read literally. In practice, this is the *only* way to resolve a match
share-code into a downloadable demo link — there's no official public API
for it — and every third-party CS2 stats site (Leetify, Scope.gg,
csstats.gg) runs the same kind of bot account to do exactly this. Valve has
never enforced against this specific use. Same category of finding as the
extracted-assets gray area above: real on paper, informally tolerated
industry-wide, not something RoundSync is uniquely exposed on.

---

## Master categorization: Can do / Must build ourselves / Not allowed

Every metric and feature researched in this doc, sorted by what kind of
thing it is — not by cost or priority (see `NEXT_STEPS.md` for that). Each
line points to its full detail further down.

### ✅ Can do — a real, verifiable external standard exists; legal to align to it

Implementing these means *matching a known definition*, not inventing one.

- **ADR** (add the 100-per-hit cap) → §ADR
- **KAST** (assemble from data already collected) → §KAST
- **True Time to Damage** (visibility-anchored, ms, median, ≥1s excluded) → §Time to Damage
- **Reaction time** (ms, tick-level, ~190-300ms scale) → §Reaction time
- **Trade kill %** (window aligned to 4s — DONE, 2026-08-30) → §Trade kill %
- **Entry/opening duel success** (already correct) → §Entry / opening duel success
- **Flash assist** (HLTV's 1.1s minimum added — DONE, 2026-08-30) → §Flash assist
- **Clutch won** ("fake clutch" exclusion added — DONE, 2026-08-30) → §Clutch won
- **Utility damage per round** (already correct) → §Utility damage per round
- **Headshot accuracy** (% of hits, not kills) → §Full industry inventory
- **Weapon-segmented stats** (AWP/rifle/pistol splits — DONE, 2026-08-30) → §Full industry inventory
- **Raw accuracy (enemy spotted) / spray accuracy** → §Full industry inventory
- **Counter-strafing quality** → §Full industry inventory
- **Multi-kill rounds (2K/3K/4K/Ace)** → §Full industry inventory
- **Kills/damage in round wins vs. losses** (DONE, 2026-08-30) → §Full industry inventory
- **Trade-kill funnel** (opportunity/attempt/success) → §Full industry inventory
- **Per-scenario clutch win rate** (1v1..1v5) → §Full industry inventory
- **Eco-frags / equipment value diff** → §Full industry inventory
- **Kill distance** (bucketed close/medium/long — DONE, 2026-08-30) → §Full industry inventory
- **CT/T side splits** → §Full industry inventory
- **Reconstructed duel context** (peek order) — no rigorous published
  methodology, real derived-metric category per NextFrag's own product
  (full source trail in `CS2_ANALYTICS_STANDARDS_ARCHIVE.md`)
- **Heatmap / map control visualization** (data exists, frontend work) → §Full industry inventory
- **Rank-tier label** (color band for a CS Rating number) → §Bracket comparison
- **`awpy` as reference or dependency** (MIT) → §Academic / open-source layer
- **Win-probability action-valuation methodology, Optimal Spending Error, Plus/Minus rating** — open academic foundations, legal to build from → §Academic / open-source layer
- **Cheat-detection model itself** (CC BY 4.0 + open-source) — legal to use; see Not Allowed below for how it must be *presented* → §Cheat detection
- **Lifetime stats via Steam Web API** (career K/D, win rate, per-weapon accuracy, etc. — DONE, 2026-08-27) → §Lifetime stats via Steam Web API
- **Premier rank badge visual redesign** — DONE, 2026-08-27, shipped. Full research process in `CS2_ANALYTICS_STANDARDS_ARCHIVE.md`.

### 🔧 Must build ourselves — no real external standard exists, or the data doesn't exist yet

Nobody else publishes a definition or dataset to align to; RoundSync would
be setting its own methodology, not matching one.

- **Self-flash duration** — **done, 2026-08-30**, `fact_utility_throw.self_blind_duration`
  (new nullable column). No published external definition exists — a
  RoundSync original, matching this doc's own scoping.
- **[CT] Smokes that stopped a push** — no defined formula anywhere, must
  invent the correlation logic → §Full industry inventory
- **Unused utility value on death** — no rigorous standard for "value" →
  §Full industry inventory
- **Post-plant win rate / retake success / site-hold duration / plant-
  defuse denials** — real community concepts, no rigorous published
  definition found anywhere → §Checked and confirmed real, but not
  rigorously standardized
- **Pistol-round-specific performance** — real category, no published
  methodology → §Checked and confirmed real, but not rigorously
  standardized
- **Self-audibility / sound discipline** — confirmed zero industry
  precedent anywhere researched → §Checked and found no industry precedent
- **Round Swing / win-probability-added composite** — the open academic
  *methodology* exists to build from, but there's no plug-in formula; this
  means training RoundSync's own model, not implementing someone else's →
  §Full industry inventory, §Academic / open-source layer
- **RoundSync's own composite performance score** — must be original by
  definition, since copying HLTV's is both impossible (undisclosed) and
  inadvisable (branding risk) → §HLTV Rating
- **Bracket/population benchmarks** ("average ADR for your rank") —
  blocked on RoundSync's own population data (~3 users right now); when
  buildable, it's RoundSync's own dataset, not anyone else's → §Bracket
  comparison
- **Predictive/trend analysis** (regression-to-the-mean, not a trend-line)
  — no industry precedent for genuine forecasting exists to copy; the
  *statistical method* is well-established in sports analytics generally,
  but applying it to CS2/RoundSync's own data is original work → §Predictive
  / trend analysis
- **Cheat-detection presentation/thresholds** — the underlying model is
  reusable (see Can Do), but there's no external template for how to
  surface an accusation about a real person responsibly; RoundSync has to
  design this itself → §Cheat detection

### 🚫 Not allowed

- **Reproducing HLTV's Rating 2.0/3.0 formula**, or presenting a
  reverse-engineered approximation as if it *is* HLTV's real number — 3.0's
  coefficients were never published anywhere, by anyone → §HLTV Rating
- **Using another company's branded product name** on RoundSync's own
  numbers — "HLTV Rating", "Leetify Rating", "Leetify Time to Damage",
  "Leetify Aim Score" — even when RoundSync's underlying concept is
  legitimately the same generic idea → see Legal summary above
- **Presenting a third party's compiled benchmark/population dataset as
  RoundSync's own verified data** — e.g. Leetify-derived rank-distribution
  numbers republished by community sites, which carry unknown/unverifiable
  methodology → §Bracket comparison
- **Naming a specific real opponent as a cheater with unqualified
  confidence** — the detection model exists and is legal to use, but at
  63% recall / 85% precision, presenting its output as a confident
  accusation (rather than a probabilistic, non-accusatory signal) is a
  product/ethics red line, not a feature-completeness gap → §Cheat detection
- **Presenting a naive trend-line extrapolation with unwarranted
  confidence** from RoundSync's currently tiny sample (8 matches) — this
  isn't an IP issue, it's a "don't mislead the user with false precision"
  issue, and the field of sports analytics has an established correct
  alternative (shrinkage toward a baseline) that must be used instead →
  §Predictive / trend analysis

---

## ADR — Average Damage per Round

- **Calculation**: total damage dealt ÷ rounds played. **Each individual hit
  is capped at 100 damage** (a target's max HP) before summing.
- **Purpose**: consistency measure, less swingy than K/D since it counts
  near-misses (damage without a kill) too.
- **Measurement**: integer/float, per round, capped per hit at 100.
- **RoundSync verdict**: **fixed, 2026-08-25.** Was summing raw uncapped
  `dmg_health`; now capped at all 3 confirmed sites via a shared
  `capped_damage_sum()` helper in `sync_pipeline.py`. Only affects matches
  synced from this fix onward.
- **Legal**: open, generic term. Safe.
- **Sources**: [esports.net](https://www.esports.net/wiki/guides/cs2-adr-explained/), [thunderpick.io](https://thunderpick.io/blog/adr-in-cs2-everything-you-need-to-know), [daddyskins.com](https://daddyskins.com/blog/counterpedia/cs2-stats-explained-adr-kda-kast/)

## KAST — % of rounds with a Kill, Assist, Survival, or Traded death

- **Calculation**: per round, did the player get at least one of: a kill, an
  assist, survive to round end, or die but get traded (teammate kills their
  killer within a short window)? Count of qualifying rounds ÷ total rounds.
- **Purpose**: "how often did you contribute something," a floor-level
  consistency stat.
- **Measurement**: percentage, per-round boolean OR'd across 4 conditions.
- **RoundSync verdict**: **backend built, 2026-08-27.** Computed per-round
  in `extract_match_secondary_metrics` (`sync_pipeline.py`), stored as
  `telemetry.kast_pct`, displayed on the Home dashboard.
- **Legal**: introduced by HLTV in 2017 as part of Rating 2.0, but the KAST
  metric itself is not proprietary — published independently by FACEIT,
  Leetify, Vandal, and others.
- **Sources**: [daddyskins.com](https://daddyskins.com/blog/counterpedia/cs2-stats-explained-adr-kda-kast/), [cs2bet.io](https://www.cs2bet.io/cs2-stats/)

## Time to Damage (TTD)

- **Calculation**: time from the moment an enemy becomes *visible* to you, to
  the moment you deal damage to them. Leetify excludes any instance ≥1
  second (treated as "trigger discipline") and reports the **median**, not
  the mean, to resist outlier skew.
- **Purpose**: pure aim-speed/target-acquisition metric.
- **Measurement**: **milliseconds**. Elite players: 100-200ms.
- **RoundSync verdict**: **have a field with this name, but it measures
  something else.** Current `time_to_damage_seconds` runs from *your own
  first shot* to your first hit — skips the visibility/reaction phase
  entirely. Needs line-of-sight/visibility detection between players each
  tick — a real feature, not a patch.
- **Legal**: the concept is generic. Leetify's specific branded stat name
  and their exact algorithm are theirs — don't call RoundSync's version
  "Leetify Time to Damage."
- **Sources**: [leetify.com/blog/enemy-actually-spotted](https://leetify.com/blog/enemy-actually-spotted/), [leetify.com/blog/aim-stat-calculation-hitboxes-improved](https://leetify.com/blog/aim-stat-calculation-hitboxes-improved/)

## Reaction time (to sound/sight cues)

- **Calculation**: time from a specific stimulus (enemy sound cue or an
  enemy becoming visible) to the first measurable response (view-angle
  change, movement).
- **Purpose**: situational-awareness/game-sense proxy.
- **Measurement**: **milliseconds**. Typical range 190-300ms; sub-150ms
  considered elite.
- **RoundSync verdict**: **have a comparable concept, wrong scale.** Current
  `reaction_time_seconds` samples in fixed 0.5s steps — 10-20x coarser than
  the real metric. To align: sample every tick, define "reacted" as first
  tick crossing a yaw/movement threshold, store in ms.
- **Legal**: generic concept, safe.
- **Sources**: [insider-gaming.com](https://insider-gaming.com/what-is-reaction-time-and-does-it-make-you-better-at-cs2-or-valorant/)

## Trade kill %

- **Calculation**: of a player's kills, what % avenged a teammate's death
  within a short window. Leetify's kill-chain grouping uses a **4-second**
  window.
- **Purpose**: measures whether a player capitalizes on the moment an enemy
  is most vulnerable.
- **Measurement**: percentage; window is the key design parameter.
- **RoundSync verdict**: **fixed, 2026-08-30** — `TRADE_KILL_WINDOW_TICKS`
  changed 3s → 4s, now directly comparable to Leetify's published figure.
  Feeds `fact_positioning_risk`'s trade check, `trade_kill_pct`, and KAST —
  all three share the one constant.
- **Legal**: generic concept, safe.
- **Sources**: [blog.scope.gg/trade-kills-en](https://blog.scope.gg/trade-kills-en/), [csgo-guides.com/gameplay/trading](https://csgo-guides.com/gameplay/trading), [leetify.com/blog/what-is-leetify-rating](https://leetify.com/blog/what-is-leetify-rating/)

## Entry / opening duel success

- **Calculation**: first death of the round. Win if you're the attacker,
  loss if you're the victim. Rounds you weren't involved in are excluded.
- **Purpose**: single most predictive individual stat for round outcome —
  the team that wins the opening duel wins the round 70-80% of the time.
- **Measurement**: percentage.
- **RoundSync verdict**: **already have it, confirmed correct** — exact
  match to the standard definition. No change needed.
- **Legal**: generic concept, safe.
- **Sources**: [recoilanalytics.com](https://recoilanalytics.com/blog/cs2-opening-duels-guide), [cs2bet.io/glossary/opening-duel](https://www.cs2bet.io/glossary/opening-duel/)

## Flash assist

- **Calculation**: a teammate (not you) kills an enemy while that enemy is
  actively blinded by your flash. HLTV's stricter version additionally
  excludes "half-blind" cases under ~1.1 seconds.
- **Purpose**: credits utility usage that leads to a kill.
- **Measurement**: count / percentage of flashes.
- **RoundSync verdict**: **fixed, 2026-08-30** — added
  `FLASH_ASSIST_MIN_BLIND_SECONDS = 1.1`; a kill on a blinded victim only
  credits the flash assist if the blind duration met that minimum.
- **Legal**: generic concept, safe.
- **Sources**: [hltv.org/news/34796](https://www.hltv.org/news/34796/using-flashbang-statistics-effectively)

## Clutch won

- **Calculation**: last player alive on their team, 1+ enemies still alive,
  round won. HLTV's 2024 "adjusted clutch requirements" additionally
  exclude "fake" clutches (round already unwinnable before the last-alive
  moment).
- **Purpose**: identifies late-round, high-pressure performers.
- **Measurement**: count, sometimes by 1v1/1v2/.../1v5 (1v1≈50%, 1v2≈15-22%, 1v3≈5-8%, 1v4≈1-2%).
- **RoundSync verdict**: **fixed, 2026-08-30** — implements HLTV's real
  rule (confirmed against the source article, not guessed): a T-side clutch
  is disqualified if more than one teammate was still alive at CTs' last
  realistic chance to start defusing (5s before detonation with a kit, 10s
  without; standard 40s C4 timer). Needed a new `bomb_planted` parse,
  folded into the Tier 9 shared pre-parse. CT-side clutches aren't covered
  by HLTV's published fix, so left untouched.
- **Legal**: generic concept, safe.
- **Sources**: [hltv.org/news/40818](https://www.hltv.org/news/40818/introducing-adjusted-clutch-requirements), [hltv.org/stats/players/13514/clutch](https://www.hltv.org/stats/players/13514/clutch)

## Utility damage per round

- **Calculation**: total grenade damage (HE + molotov/incendiary) ÷ rounds
  played.
- **Purpose**: measures utility usage effectiveness beyond just flashes.
- **Measurement**: damage points per round. Community benchmark: a
  dedicated support player averages 5-10/round.
- **RoundSync verdict**: **already have it, confirmed in realistic range**
  (0.7-8.4 observed across 8 matches). No change needed.
- **Legal**: generic concept, safe.
- **Sources**: [profilerr.net/cs2-damage-dealt-explained](https://profilerr.net/cs2-damage-dealt-explained/), [leetify.com/blog/utility-ratings](https://leetify.com/blog/utility-ratings/)

## Full industry inventory — what exists that RoundSync doesn't have at all

Survey of Leetify's, HLTV's, and Scope.gg's published stat catalogs,
checked against what RoundSync has *zero* coverage of. Each entry includes
how it's actually obtained — the demoparser2 event/field it comes from, and
whether that event is already parsed every sync (cheap) or not (real new
extraction).

**Aim/mechanics:**
- **Headshot accuracy** — **done, 2026-08-27.** `player_hurt` already
  carries `hitgroup` (`1 == head`, confirmed via Valve's Source SDK
  reference), already parsed every sync for ADR.
- **Weapon-segmented stats** — **done, 2026-08-30**,
  `telemetry.weapon_segmented_stats`. Grouped by weapon class
  (pistol/smg/rifle/shotgun/sniper) via `_classify_weapon_by_name`
  (name-substring match, since different demoparser2 events format the
  `weapon` field differently — confirmed no prefix on real production
  `fact_economy.primary_weapon` values, but kept substring-based for the
  same defensive reason `NON_GUN_WEAPON_KEYWORDS` is), plus AWP broken out
  individually since NEXT_STEPS.md named it explicitly.
- **Accuracy (enemy spotted)** / **spray accuracy** — genuinely new
  extraction, needs `weapon_fire` matched against `player_hurt` plus
  enemy-visibility determination (same missing primitive as TTD, Tier 2).
  Spray accuracy reuses the existing `BURST_GAP_TICKS` burst grouping.
- **Counter-strafing quality** — needs shooter velocity at each
  `weapon_fire` tick. No raw velocity field in bulk `parse_ticks()`, but a
  proven workaround exists: compute speed from position deltas, same
  technique `_find_enemy_audible_triggers` already uses.

**Utility:**
- **[CT] Smokes that stopped a push** — needs smoke position/timing
  correlated against enemy movement afterward — nontrivial correlation
  logic.
- **Unused utility value on death** — needs inventory reconstructed at
  death tick (`item_equip` minus already-thrown `fact_utility_throw`) —
  moderate lift.

**Team play:**
- **Trade-kill funnel** — opportunity and success already exist in
  `fact_positioning_risk`; attempt (did a teammate engage, whether or not
  they landed it) needs cross-referencing `weapon_fire`/`player_hurt`
  against the killer within the trade window.

**Round-outcome:**
- **Multi-kill rounds (2K/3K/4K/Ace)** — **done, 2026-08-27.** Pure
  aggregation of `player_death`, grouped by round.
- **Kills/damage in round wins vs. losses** — **done, 2026-08-30**,
  `telemetry.kills_damage_by_round_outcome`. Reuses the round_bounds-with-
  winner pattern (not literally `fact_engage_decision`'s sparse rows, which
  only cover outnumbered moments — the reusable part was the win/loss
  determination pattern, not that table's data).
- **Round Swing / win-probability-added** — needs a *trained* win-
  probability model, the biggest lift on this list.

**Clutch:**
- **Per-scenario clutch win rate** (1v1/../1v5 tracked separately) — needs
  a small extraction change: persist `enemies_alive` at the clutch moment,
  currently only a counter increment.

**Positioning — zero new extraction needed:**
- **Heatmaps / map control visualization** — X/Y/Z already exists in
  `fact_positioning_risk` and `fact_duel_placement`. Pure frontend work.

**From cross-checking Google AI Mode's answer (full verification trail in
`CS2_ANALYTICS_STANDARDS_ARCHIVE.md`):**
- **Eco-frags / equipment value diff** — confirmed via HLTV Rating 3.0's
  eco-adjustment. `fact_economy` has the tracked player's own equip value;
  the enemy side needs the killer/victim's equipment value at death — real
  new extraction, but the raw ingredient is already proven parseable.
- **Kill distance** — **done, 2026-08-30**, `telemetry.kill_distance_buckets`.
  Bucketed close/medium/long (see IDEAS.md #6 for the full sourcing of the
  30m/50m boundaries — no industry-published convention exists, so this is
  a documented RoundSync original anchored to real CS2 damage-falloff facts,
  not a guess). Reports kill count + headshot% per bucket, not shots-fired
  accuracy — that still needs Tier 2's blocked visibility primitive.
- **CT/T side splits** — `fact_economy.team` already carries this, cheap to
  add across most existing stats.

**Sources**: [leetify.com/blog/leetify-stats-glossary](https://leetify.com/blog/leetify-stats-glossary/), [hltv.org/news/42485 — Introducing Rating 3.0](https://www.hltv.org/news/42485/introducing-rating-30), [blog.scope.gg — mistake identification](https://esports.gg/news/counter-strike-2/scope-gg-review/)

## Lifetime stats via Steam Web API (`GetUserStatsForGame`)

Valve's own official per-account career totals, pulled live via
`ISteamUserStats/GetUserStatsForGame` (`appid=730`, the existing
`VALVE_API_KEY`). Not a stat RoundSync computes from a demo. **Built and
shipped, 2026-08-27** — full build detail in `NEXT_STEPS_ARCHIVE.md` Tier
11; this is the research summary.

- **215 real stat fields confirmed live** — career totals, per-weapon
  kills/shots/hits (accuracy directly computable), per-map wins/rounds for
  an old map pool, novelty fields.
- **Real gotcha: `total_wins` is round wins, not match wins.** Roughly half
  of `total_rounds_played`. Computing a win rate against
  `total_matches_played` with this field produces an impossible 1028%. The
  real match-win counter is `total_matches_won` (verified: 43.1% for a
  real test account, a sane number).
- **Real gap: per-map stats are frozen to an old CS:GO-era pool.**
  Confirmed absent: `de_mirage`, `de_ancient`, `de_anubis`, `de_overpass`
  — zero lifetime data for any of them. Any feature using this must treat
  "no lifetime data for this map" as a real, expected case.
- **Legal**: the player's own account data, requested with their own Steam
  login and the project's own `VALVE_API_KEY` — no new legal question
  beyond what's already covered for the Steam Web API elsewhere in this doc.
- **Sources**: live API call, `api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/`, verified directly against a real account, twice.

## Game Coordinator match resolution — how `gc-worker` gets a demo download link

Not a stat — research into the Game Coordinator (GC), the live Steam-bot
connection `services/gc-worker/index.js` uses to ask Valve "where's the
download link for this match's demo file?" **This is the canonical,
single home for this finding** — don't re-derive it if it comes up again
via a `gc-worker` bug.

**The real, current Valve protobuf schema has no "download URL" field,
verified directly against Steam's own tracked source**
(`SteamDatabase/GameTracking-CS2` on GitHub) — `CDataGCCStrike15_v2_MatchInfo`
(the message `gc-worker` receives) only has `matchid`, `matchtime`,
`watchablematchinfo` (live-spectate info, not a downloadable file), and
`roundstatsall` (per-round scoreboard stats). No `matchurl`/`match_url`/
`url` field exists anywhere in it.

**The real, undocumented answer, confirmed against a genuine independent
open-source project doing the same job** (`claabs/cs-demo-downloader`):
the download URL comes from `match.roundstatsall.at(-1)?.map` — the
**last** round entry's `map` field. Valve repurposes that one field: every
other round's `map` holds the real map name, but the final entry's `map`
holds the actual demo download URL string instead. Undocumented by Valve
anywhere, only knowable by checking how a real working tool handles it.

**A field being named "map" and a field only ever containing a map name
are different claims** — an earlier session's schema-only audit
(confirmed the field's declared name/type) reasoned from the first to the
second incorrectly, removed this fallback, and caused a real production
incident (`NEXT_STEPS_ARCHIVE.md` Tier 14). Restored, now guarded with
`startsWith('http')` so a real map name can never again be mistaken for a
URL.

**Sources**: [`SteamDatabase/GameTracking-CS2` — cstrike15_gcmessages.proto](https://github.com/SteamDatabase/GameTracking-CS2/blob/a00b71ec84b24e0773c5fbd595eb91e17fa57f8f/Protobufs/cstrike15_gcmessages.proto), [`claabs/cs-demo-downloader`](https://github.com/claabs/cs-demo-downloader) (`src/steam-gc.ts`).

## Academic / open-source layer — the safest tier for anything HLTV-Impact-like

- **`awpy`** (github.com/pnxenopoulos/awpy) — Python library, ~100k
  installs, actively maintained, **MIT licensed**. Computes ADR, KAST%, its
  own open Rating. Exposes **player visibility in microseconds** — the
  missing piece for a real Time-to-Damage fix. Also does nav-mesh parsing,
  a possibly more reliable path to bombsite resolution than the manual
  callout-centroid approach.
  **Real evaluation done 2026-08-30** (checked live against readthedocs/PyPI/GitHub,
  not assumed from the name — this is Tier 6's Band-6 dependency task from
  `NEXT_STEPS.md`):
  - **Version 2.0.2** (Mar 2025), Python `>=3.11,<3.14`, MIT.
  - **Runs on top of `demoparser2`** — the exact same parser
    `sync_pipeline.py` already uses, confirmed via its own docs ("We now
    rely on demoparser2 for parsing"). Not a second/competing parser to
    reconcile — it composes with the existing pipeline.
  - **Real API**: `awpy.visibility.VisibilityChecker.is_visible(point1,
    point2)` → bool, given two `(x, y, z)` positions. This is exactly the
    primitive Tier 2 (Time to Damage, reaction time) and Tier 5's raw
    accuracy/spray accuracy all need.
  - **Requires per-map collision-mesh files** (`.tri`), fetched via `awpy
    get tris` (~20MB total, all maps combined) — a one-time asset download,
    not bundled in the pip package itself.
  - **Map coverage confirmed**: ar_baggage, ar_shoots, cs_italy, cs_office,
    de_ancient, de_anubis, de_dust2, de_inferno, de_mirage, de_nuke,
    de_overpass, de_train, de_vertigo, lobby_mapveto — covers CS2's current
    active Premier/competitive pool. `sync_pipeline.py` has no hardcoded
    map allowlist (confirmed via grep, 2026-08-30), so a demo on an
    unlisted map would just mean visibility data isn't available for that
    one match, not a crash — a real but survivable edge case, no code
    changes needed to tolerate it.
  - **Real performance numbers, not estimated**: `VisibilityChecker`
    build cost (once per map, from the BVH tree over the mesh) ranges 744ms
    (de_mirage, smallest) to 9.62s (de_inferno, largest) — a one-time
    per-sync cost, not per-check. Each individual `is_visible()` call is
    ~65-177 microseconds — cheap enough to run per-tick, per-player-pair
    across a full match without a real perf concern.
  - **Real caveat, stated in awpy's own docs**: the mesh-raycast check
    doesn't account for smokes, flashes, or dynamic props blocking sight —
    it answers "is there a clear geometric line" not "could the player
    actually see through what's currently there." Acceptable for TTD/
    reaction-time (both already anchored to "enemy becomes visible," and a
    smoke blocking a would-be sightline just correctly produces no
    visibility event, which is the right outcome) but worth remembering if
    it's ever used for something claiming smoke-awareness.
  - **Verdict: real, usable, low-risk dependency to add.** Unlocks Tier 2's
    TTD/reaction-time rebuild and Tier 5's raw/spray accuracy off one
    shared primitive, exactly as the Dependency Map in `NEXT_STEPS.md`
    predicted. Not yet installed/integrated — this entry is the research
    verdict, not a build confirmation.
- **"Valuing Player Actions in Counter-Strike: Global Offensive"**
  (Xenopoulos et al., IEEE Big Data 2020, arxiv.org/abs/2011.01324) —
  published, open framework valuing every in-game action by win-probability
  effect, validated on 70M+ real events. Same open-source lineage as `awpy`.
- **Optimal Spending Error (OSE)** — published metric scoring how closely
  economy spend matches the mathematically optimal decision. Extends
  RoundSync's `buy_decisions_against_team_economy` heuristic.
- **Plus/Minus player rating** (arxiv.org/pdf/2409.05052) — open,
  published, from basketball/hockey analytics adapted to CS:GO.
- **Legal**: academic publication + MIT-licensed code — the opposite of
  HLTV's trade-secret formula. Citing the paper and/or crediting `awpy`
  per its license is all that's required.

## Cheat detection — real methodology exists, but this is a different risk category

- **AntiCheatPT** (Loo, Lužkov, Burelli — IEEE Conference on Games 2025,
  arxiv.org/abs/2508.06348) — real, peer-reviewed transformer model
  classifying likely cheaters from recorded `.dem` files — exactly the
  input RoundSync already has. Trained on 256-tick windows around each
  kill, 44 features per tick, mostly relative positioning/distance and
  whether a kill happened with information the shooter shouldn't have had
  — not primarily aim-snap/angular-velocity features.
- **Reported performance**: 89.17% accuracy, 93.36% AUC, but only **63.13%
  recall** and 85.13% precision — misses over a third of actual cheaters,
  and ~1 in 7 flagged aren't cheating.
- **Dataset (CS2CD, 795 matches)**: CC BY 4.0. **Code/weights**: open-source
  at github.com/itubrainlab/AntiCheatPT. Both reusable with attribution.
- **The real consideration isn't legal, it's product risk.** A cheat flag
  accuses a real third-party opponent, based on a model with a meaningful
  false-positive rate. Valve's own VAC/Overwatch system is the actual
  authority with due process attached. If built: frame as a probabilistic
  "unusual patterns" signal for the user's own awareness, never a
  confident accusation naming a specific person.

## Predictive / trend analysis — real methodology exists, but naive trend-lines are the wrong tool

- **What the industry actually does**: benchmark-gap comparison
  (Leetify/SteamAnalyst compare current stats against higher-ranked
  players' typical numbers), not dynamic forecasting. No confirmed real
  precedent for genuine trend-forecasting found anywhere.
- **The real statistical methodology**: regression to the mean / Bayesian
  shrinkage (the James-Stein estimator pattern from baseball analytics) —
  pulls a small-sample estimate toward a population/rank-tier baseline
  rather than trusting the raw trend line. Naive linear extrapolation is
  exactly the mistake this exists to prevent.
- **Why this matters now**: the tracked player has ~8 matches of history —
  forecasting almost entirely off noise at that sample size. If built: (1)
  show a confidence range, not a single number, (2) shrink toward a
  rank-tier baseline, (3) gate behind a minimum match count.
- **Sources**: [leetify.com/blog/cs2-benchmarks](https://leetify.com/blog/cs2-benchmarks/), [steamanalyst.com/cs2-stats](https://www.steamanalyst.com/cs2-stats), [andrewgrenbemer.medium.com](https://andrewgrenbemer.medium.com/applying-regression-to-the-mean-and-final-adjustments-creating-a-college-baseball-projection-1213154cac85), [ncbi.nlm.nih.gov/pmc/articles/PMC8970347](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8970347/)

## Bracket comparison ("how do I compare to a higher/lower rank")

- **How Leetify does it**: z-scores against their whole playerbase,
  percentile-banded. **Not every stat gets rank-adjusted** — TTD, blind
  duration, spotted accuracy compare *within* your bracket (rank-dependent);
  ADR/K/D/composite Rating use the *same* benchmark regardless of rank
  (rank-independent) — a deliberate, non-obvious design choice.
- **Valve publishes none of this.** Even community "rank distribution"
  numbers (csdb.gg etc.) are themselves derived from Leetify's own
  aggregated data via a third-party republisher, not an independent or
  official source.
- **What this means for RoundSync**: bracket comparison needs population
  data across many users; RoundSync has ~3 total right now. No honest way
  to show "average ADR for your bracket" today.
- **What's already in place**: every fact table stores
  `player_rank_new`/`player_rank_type_id` per row — the right foundation
  for a `group by rank tier` once there's real population data.
- **Already built** (`RANK_BANDS`/`rankBand()` in `frontend/lib/rank.ts`,
  kept in sync with `services/api/server.js`'s `rankTierInstruction()`):
  labels a CS Rating number with its community-convention tier name/color
  (Grey 0-4,999 / Light Blue 5,000-9,999 / Blue 10,000-14,999 / Purple
  15,000-19,999 / Pink 20,000-24,999 / Red 25,000-29,999 / Gold 30,000+).
  `NEXT_STEPS.md` previously listed this as unbuilt — stale, corrected
  2026-08-30.
- **Sources**: [leetify.com/blog/cs2-benchmarks](https://leetify.com/blog/cs2-benchmarks/), [csdb.gg/rank-distribution](https://csdb.gg/rank-distribution/), [csdb.gg/premier-ranks](https://csdb.gg/premier-ranks/)

## Checked and confirmed real, but not rigorously standardized

- **Pistol-round-specific performance** — real tracked category, no single
  rigorous published methodology — likely just "the same stats, filtered
  to pistol rounds."
- **Post-plant win rate / retake success rate**, bomb-carrier hold time,
  plant/defuse-denial kills, site-hold duration — referenced in passing by
  some trackers but not confirmed as standardized, precisely-defined stats
  the way ADR or KAST are. Buildable from existing round-bounds + bomb-plant
  data, but RoundSync would be setting its own methodology.
- **Sources**: [steamanalyst.com/tools/cs2-stats](https://www.steamanalyst.com/tools/cs2-stats), [community.skin.club/en/articles/best-cs2-stats-trackers](https://community.skin.club/en/articles/best-cs2-stats-trackers)

## Checked and found no industry precedent — would be a genuine RoundSync original

- **Sound discipline / self-audibility** — real, widely-discussed coaching
  concept, but not a published or tracked stat on any platform researched.
  Confirmed real audible-range figures (running ≈20m, silent below ≈5m
  walking) closely match RoundSync's own existing constants
  (`RUNNING_AUDIBLE_RANGE_UNITS` ≈ 19.05m, `WALKING_AUDIBLE_RANGE_UNITS`
  ≈ 17.15m) — those constants were a good estimate, not a guess that needs
  fixing.
- **Sources**: [csgo-guides.com/gameplay/sound](https://csgo-guides.com/gameplay/sound), [steamcommunity.com/sharedfiles/filedetails/?id=3564697172](https://steamcommunity.com/sharedfiles/filedetails/?id=3564697172)

## HLTV Rating (2.0 / 3.0) — reference only, do not implement as-is

- **Calculation**: Rating 2.0's coefficients were only ever
  *reverse-engineered* by third parties, never officially confirmed.
  Rating 3.0's coefficients have **never been published in any form**.
- **RoundSync verdict**: **do not build a copy.** `extract_fact_engage_decision`'s
  docstring already gets this right — stores raw kill/death/damage
  components without inventing a weighted score. If RoundSync wants a
  composite score later, build an original, transparently-documented
  formula under RoundSync's own name.
- **Legal**: the general idea of a weighted composite rating isn't ownable,
  but the real 3.0 formula can't be copied (doesn't exist publicly), and
  using "Rating" alongside "HLTV" branding risks implying an affiliation
  RoundSync doesn't have.
- **Sources**: [medium.com/@ferahgothegreat](https://medium.com/@ferahgothegreat/approximating-hltv-s-cs-go-2-0-rating-in-valorant-54e1e7224759), [flashed.gg/posts/reverse-engineering-hltv-rating](https://flashed.gg/posts/reverse-engineering-hltv-rating/), [hltv.org/news/43047](https://www.hltv.org/news/43047/rating-30-adjustments-go-live)
