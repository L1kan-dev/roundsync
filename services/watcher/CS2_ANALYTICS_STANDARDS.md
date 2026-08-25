# CS2 Analytics Standards Reference

Research log for every stat RoundSync computes (or is considering computing),
checked against how the wider CS2 analytics community (HLTV, Leetify, FACEIT,
Scope.gg, csstats.gg) actually defines and measures it. Built during the
2026-08-25 data audit session — see the "RoundSync Data Audit" artifact for
the full bug list this research fed into. Check here before re-researching
any of these terms.

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
- **Trade kill %** (align window to 4s) → §Trade kill %
- **Entry/opening duel success** (already correct) → §Entry / opening duel success
- **Flash assist** (add HLTV's 1.1s minimum) → §Flash assist
- **Clutch won** (add "fake clutch" exclusion) → §Clutch won
- **Utility damage per round** (already correct) → §Utility damage per round
- **Headshot accuracy** (% of hits, not kills) → §Full industry inventory
- **Weapon-segmented stats** (AWP/rifle/pistol splits) → §Full industry inventory
- **Raw accuracy (enemy spotted) / spray accuracy** → §Full industry inventory
- **Counter-strafing quality** → §Full industry inventory
- **Multi-kill rounds (2K/3K/4K/Ace)** → §Full industry inventory
- **Kills/damage in round wins vs. losses** → §Full industry inventory
- **Trade-kill funnel** (opportunity/attempt/success) → §Full industry inventory
- **Per-scenario clutch win rate** (1v1..1v5) → §Full industry inventory
- **Eco-frags / equipment value diff** → §Found via cross-checking Google AI Mode's answer
- **Kill distance** → §Found via cross-checking Google AI Mode's answer
- **CT/T side splits** → §Found by fetching AI Mode's actual cited sources
- **Reconstructed duel context** (peek order) → §Found by fetching AI Mode's actual cited sources
- **Heatmap / map control visualization** (data exists, frontend work) → §Full industry inventory
- **Rank-tier label** (color band for a CS Rating number) → §Bracket comparison
- **`awpy` as reference or dependency** (MIT) → §Academic / open-source layer
- **Win-probability action-valuation methodology, Optimal Spending Error, Plus/Minus rating** — open academic foundations, legal to build from → §Academic / open-source layer
- **Cheat-detection model itself** (CC BY 4.0 + open-source) — legal to use; see Not Allowed below for how it must be *presented* → §Cheat detection

### 🔧 Must build ourselves — no real external standard exists, or the data doesn't exist yet

Nobody else publishes a definition or dataset to align to; RoundSync would
be setting its own methodology, not matching one.

- **Self-flash duration** — no published external definition; simple to
  build (data already captured then discarded) but the metric itself is a
  RoundSync original → §Found via cross-checking Google AI Mode's answer
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
  is capped at 100 damage** (a target's max HP) before summing — an AWP hit
  that calculates to 400 raw damage still only contributes 100, since you
  can't remove more than one life's worth of health from one person.
- **Purpose**: consistency measure, less swingy than K/D since it counts
  near-misses (damage without a kill) too.
- **Measurement**: integer/float, per round, capped per hit at 100.
- **RoundSync verdict**: **fixed, 2026-08-25 (second session).** Was
  summing raw uncapped `dmg_health`; now capped at all 3 confirmed sites
  via a shared `capped_damage_sum()` helper in `sync_pipeline.py`. Only
  affects matches synced from this fix onward — historical matches keep
  their old uncapped value (CDN links expire, can't re-parse). See
  `NEXT_STEPS.md`'s Completed section for the full before/after.
- **Legal**: open, generic term. Safe.
- **Sources**: [esports.net](https://www.esports.net/wiki/guides/cs2-adr-explained/), [thunderpick.io](https://thunderpick.io/blog/adr-in-cs2-everything-you-need-to-know), [daddyskins.com](https://daddyskins.com/blog/counterpedia/cs2-stats-explained-adr-kda-kast/)

## KAST — % of rounds with a Kill, Assist, Survival, or Traded death

- **Calculation**: per round, did the player get at least one of: a kill, an
  assist, survive to round end, or die but get traded (teammate kills their
  killer within a short window)? Count of qualifying rounds ÷ total rounds.
- **Purpose**: "how often did you contribute something," a floor-level
  consistency stat — the idea it was built to fix is that raw K/D can look
  bad for a player who dies a lot but almost always dies *usefully* (already
  traded, already got the trade kill, etc).
- **Measurement**: percentage, per-round boolean OR'd across 4 conditions.
- **RoundSync verdict**: **don't have it, should add it.** All four raw
  ingredients already exist: kills/deaths (`player_death`), trades (the
  existing `TRADE_KILL_WINDOW_TICKS` logic in `extract_match_secondary_metrics`),
  survival (`fact_positioning_risk`/`fact_engage_decision`'s alive-tracking).
  This is assembly of existing data, not new extraction.
- **Legal**: introduced by HLTV in 2017 as part of Rating 2.0, but the KAST
  metric itself (unlike the overall Rating formula) is not proprietary —
  it's now published independently by FACEIT, Leetify, Vandal, and others.
  Safe to compute and display under its own name.
- **Sources**: [daddyskins.com](https://daddyskins.com/blog/counterpedia/cs2-stats-explained-adr-kda-kast/), [cs2bet.io](https://www.cs2bet.io/cs2-stats/)

## Time to Damage (TTD)

- **Calculation**: time from the moment an enemy becomes *visible* to you, to
  the moment you deal damage to them. Leetify explicitly excludes any
  instance ≥1 second (treated as "trigger discipline," not a real quick-draw
  duel) and reports the **median** of the sample, not the mean, specifically
  to resist outlier skew.
- **Purpose**: pure aim-speed/target-acquisition metric — how fast your
  crosshair-to-kill process is once an enemy is in view.
- **Measurement**: **milliseconds**. Elite players: 100-200ms.
- **RoundSync verdict**: **have a field with this name, but it measures
  something else.** Current `time_to_damage_seconds` runs from *your own
  first shot* to your first hit — skips the visibility/reaction phase
  entirely, stored in seconds, mean-aggregated, no outlier exclusion. To
  become real TTD needs line-of-sight/visibility detection between the two
  players each tick — a real feature, not a patch. Cheaper interim option:
  rename to something honest like "burst-to-hit time" until rebuilt.
- **Legal**: the concept (reaction-to-damage timing) is generic. Leetify's
  specific branded stat name and their exact enemy-visibility algorithm are
  theirs — don't call RoundSync's version "Leetify Time to Damage."
- **Sources**: [leetify.com/blog/enemy-actually-spotted](https://leetify.com/blog/enemy-actually-spotted/), [leetify.com/blog/aim-stat-calculation-hitboxes-improved](https://leetify.com/blog/aim-stat-calculation-hitboxes-improved/)

## Reaction time (to sound/sight cues)

- **Calculation**: time from a specific stimulus (enemy sound cue — e.g.
  bomb-plant beep, footsteps — or an enemy becoming visible) to the first
  measurable response (view-angle change, movement).
- **Purpose**: situational-awareness/game-sense proxy, distinct from raw
  click-reflex tests.
- **Measurement**: **milliseconds**. Typical range 190-300ms depending on
  skill/hardware; sub-150ms considered elite.
- **RoundSync verdict**: **have a comparable concept, wrong scale.** Current
  `reaction_time_seconds` samples in fixed 0.5s steps across a 0-3s window —
  10-20x coarser than the real metric. To align: sample every tick after the
  trigger (not every 0.5s), define "reacted" as first tick crossing a
  yaw/movement threshold, store in ms.
- **Legal**: generic concept, safe.
- **Sources**: [insider-gaming.com](https://insider-gaming.com/what-is-reaction-time-and-does-it-make-you-better-at-cs2-or-valorant/)

## Trade kill %

- **Calculation**: of a player's kills, what % avenged a teammate's death
  within a short window (the enemy they killed had just killed a teammate).
  Leetify's kill-chain grouping uses a **4-second** window.
- **Purpose**: measures whether a player capitalizes on the moment an enemy
  is most vulnerable (reloading/repositioning after a kill).
- **Measurement**: percentage; window is the key design parameter (community
  range observed: 3-5 seconds depending on the tool).
- **RoundSync verdict**: **already have it**, window is 3s vs Leetify's 4s —
  close enough to be defensible, but changing `TRADE_KILL_WINDOW_TICKS` to
  4s would make the number directly comparable to Leetify's published figure.
- **Legal**: generic concept, safe. The specific 4-second constant isn't
  ownable, just Leetify's calibration choice.
- **Sources**: [blog.scope.gg/trade-kills-en](https://blog.scope.gg/trade-kills-en/), [csgo-guides.com/gameplay/trading](https://csgo-guides.com/gameplay/trading), [leetify.com/blog/what-is-leetify-rating](https://leetify.com/blog/what-is-leetify-rating/) (the actual source of the 4-second kill-chain figure)

## Entry / opening duel success

- **Calculation**: first death of the round. Win if you're the attacker,
  loss if you're the victim. Rounds you weren't involved in are excluded
  entirely (not counted as a loss).
- **Purpose**: single most predictive individual stat for round outcome —
  the team that wins the opening duel wins the round 70-80% of the time.
- **Measurement**: percentage.
- **RoundSync verdict**: **already have it, confirmed correct** — exact
  match to the standard definition, verified line-by-line against
  `extract_match_secondary_metrics`. No change needed.
- **Legal**: generic concept, safe.
- **Sources**: [recoilanalytics.com](https://recoilanalytics.com/blog/cs2-opening-duels-guide), [cs2bet.io/glossary/opening-duel](https://www.cs2bet.io/glossary/opening-duel/)

## Flash assist

- **Calculation**: a teammate (not you) kills an enemy while that enemy is
  actively blinded by your flash — window scales to the real blind duration,
  not a fixed window. HLTV's stricter published version additionally
  excludes "half-blind" cases under ~1.1 seconds as too weak to have
  meaningfully helped.
- **Purpose**: credits utility usage that leads to a kill, even when someone
  else gets it.
- **Measurement**: count / percentage of flashes.
- **RoundSync verdict**: **already have it, matches Valve's own looser
  definition** (correctly excludes the thrower's own kills, correctly scales
  to real blind duration). Doesn't have HLTV's 1.1s minimum — add it if the
  goal is to match HLTV's stricter, more meaningful published number.
- **Legal**: generic concept, safe.
- **Sources**: [hltv.org/news/34796](https://www.hltv.org/news/34796/using-flashbang-statistics-effectively)

## Clutch won

- **Calculation**: last player alive on their team, 1+ enemies still alive,
  round won. HLTV's 2024 "adjusted clutch requirements" additionally exclude
  "fake" clutches (round was already unwinnable for the other side before
  the last-alive moment, e.g. mopping up survivors after the bomb already
  exploded) and add detection for clutches where the clutcher didn't
  personally get the final kill (teammates finished via defusal, etc — not
  applicable to RoundSync's solo-tracked-player design anyway).
- **Purpose**: identifies late-round, high-pressure performers.
- **Measurement**: count, sometimes broken down by 1v1/1v2/.../1v5 (win rate
  drops sharply per additional enemy: 1v1≈50%, 1v2≈15-22%, 1v3≈5-8%,
  1v4≈1-2%).
- **RoundSync verdict**: **already have it, baseline definition only.**
  Doesn't implement HLTV's "fake clutch" exclusion. Low priority — affects a
  small number of edge-case rounds.
- **Legal**: generic concept, safe.
- **Sources**: [hltv.org/news/40818](https://www.hltv.org/news/40818/introducing-adjusted-clutch-requirements), [hltv.org/stats/players/13514/clutch](https://www.hltv.org/stats/players/13514/clutch)

## Utility damage per round

- **Calculation**: total grenade damage (HE + molotov/incendiary) ÷ rounds
  played.
- **Purpose**: measures utility usage effectiveness beyond just flashes.
- **Measurement**: damage points per round. Community benchmark: a dedicated
  support player averages 5-10/round; 200 total utility damage across a map
  is roughly "worth" two extra kills.
- **RoundSync verdict**: **already have it, confirmed in realistic range**
  (0.7-8.4 observed across 8 matches). No change needed.
- **Legal**: generic concept, safe.
- **Sources**: [profilerr.net/cs2-damage-dealt-explained](https://profilerr.net/cs2-damage-dealt-explained/), [leetify.com/blog/utility-ratings](https://leetify.com/blog/utility-ratings/)

## Full industry inventory — what exists that RoundSync doesn't have at all

The metrics above are the ones RoundSync already computes (checked for
correctness). This section is the other half of the question: a survey of
Leetify's, HLTV's, and Scope.gg's published stat catalogs, checked against
what RoundSync has *zero* coverage of. Not yet individually legal-checked —
same general pattern applies (mechanical stats over public data = open), but
verify before shipping anything using another tool's specific branded name.

Each entry below now includes **how it's actually obtained** — the specific
demoparser2 event/field it comes from, and whether that event is already
being parsed every sync (cheap: capture + aggregate) or not (real new
extraction work). Corrects a couple of lift estimates from the first pass.

**Aim/mechanics:**
- **Headshot accuracy** (% of *hits*, not kills, landing on the head) —
  **cheaper than first estimated.** `player_hurt` already carries a
  `hitgroup` field, and `player_hurt` is already parsed every sync (used
  today for utility damage in `extract_fact_utility_throw`). This is
  capture-and-aggregate, not new extraction: filter `player_hurt` to
  `attacker_steamid == target`, group by `hitgroup`. Different from the
  existing `headshot_pct`, which is % of *kills* headshotted, a distinct and
  already-correct scoreboard stat.
- **Weapon-segmented stats** (AWP kills, AWP opening kills, rifle vs. pistol
  performance) — **cheaper than first estimated.** Both `player_death` and
  `player_hurt` already carry a `weapon` field; both events are already
  parsed every sync. Capture-and-aggregate, group existing kill/duel logic
  by `weapon` instead of ignoring it.
- **Accuracy (enemy spotted)** and **spray accuracy** — genuinely new
  extraction. Needs `weapon_fire` (shots, already parsed in
  `extract_fact_duel_placement`) matched against `player_hurt` (hits) *and*
  a determination of whether an enemy was actually visible at fire time.
  Visibility is the hard, currently-missing primitive — same one blocking
  the true Time-to-Damage rebuild (Tier 2). Spray accuracy reuses the
  existing `BURST_GAP_TICKS` burst-grouping logic already written for
  duel-placement bursts.
- **Counter-strafing quality** — needs the player's own velocity at each
  `weapon_fire` tick. No raw velocity field is reliably available in bulk
  `parse_ticks()` calls (already documented in the codebase's own comments
  on `RUN_SPEED_THRESHOLD_UPS`) — but the workaround already exists and is
  proven: compute speed from position deltas between consecutive tick
  samples, exactly the technique `_find_enemy_audible_triggers` already
  uses for enemy footstep detection. Same pattern, applied to the shooter
  instead of the target.

**Utility:**
- **[CT] Smokes that stopped a push** — real new extraction. Needs smoke
  landing position/timing (`fact_utility_throw`, already have) correlated
  against enemy movement in the following seconds (did an enemy approach
  the smoke then stop/reroute) — genuinely nontrivial correlation logic.
- **Unused utility value on death** — needs current grenade inventory
  reconstructed at the death tick: `item_equip` (already parsed, tells you
  what was bought) minus what's already in `fact_utility_throw` (already
  thrown) at that point in the round. Buildable by combining two already-
  parsed sources, moderate lift.

**Team play — the funnel needs one new signal, not a full rebuild:**
- **Trade-kill funnel** (opportunity → attempt → success). *Opportunity*
  (`teammate_within_trade_range_at_death`) and *success* (`was_traded`)
  already exist in `fact_positioning_risk` — pure aggregation. *Attempt*
  (did a teammate actually engage the killer, whether or not they landed
  it) is genuinely missing — needs cross-referencing teammates'
  `weapon_fire`/`player_hurt` against the killer within the trade window,
  which nothing currently captures.

**Round-outcome:**
- **Multi-kill rounds (2K/3K/4K/Ace)** — pure aggregation. `player_death` is
  already parsed every sync; group by `(match_id, round_number,
  attacker_steamid)`, count, bucket.
- **Kills/damage in round wins vs. losses** — `fact_engage_decision` already
  stores `round_won` per row, and the round-bounds + round-winner pattern
  (`round_end`'s `winner` field) is already computed in multiple extraction
  functions. Reuses an existing pattern, doesn't need a new one.
- **Round Swing / win-probability-added** — fundamentally different in
  kind from everything else on this list: it needs a *trained* win-
  probability model over round state (score, side, economy, rounds
  remaining), not just data already sitting in one demo. Either adapt the
  open academic methodology below, or accumulate enough of RoundSync's own
  match history to train a simple one. Correctly the biggest lift here.

**Clutch — needs one new field captured, not a rebuild:**
- **Per-scenario clutch win rate** (1v1/1v2/.../1v5 tracked separately, not
  lumped into one `clutches_won` count) — **more than pure aggregation, as
  first stated.** `extract_match_secondary_metrics`'s clutch-detection block
  currently only increments a counter when `was_clutch` flips true; it
  doesn't persist `enemies_alive` at that moment anywhere. Needs a small
  extraction change (store the scenario, not just the boolean), not a
  `group by` on data that doesn't exist yet.

**Positioning — genuinely zero new extraction needed:**
- **Heatmaps / map control visualization** — X/Y/Z already exists in
  `fact_positioning_risk` and `fact_duel_placement`. Nothing to extract;
  this is pure frontend work.

**Sources**: [leetify.com/blog/leetify-stats-glossary](https://leetify.com/blog/leetify-stats-glossary/), [hltv.org/news/42485 — Introducing Rating 3.0](https://www.hltv.org/news/42485/introducing-rating-30), [blog.scope.gg — mistake identification](https://esports.gg/news/counter-strike-2/scope-gg-review/)

## Academic / open-source layer — the safest tier for anything HLTV-Impact-like

Checked beyond the commercial trackers: there's a peer-reviewed academic
research line for CS:GO/CS2 analytics, with an actual open-source reference
implementation — this is the legally cleanest possible foundation for
anything resembling HLTV's undisclosed "Impact" component, because unlike
HLTV's formula, this one was deliberately published for others to build on.

- **`awpy`** ([github.com/pnxenopoulos/awpy](https://github.com/pnxenopoulos/awpy)) — Python library by Peter
  Xenopoulos (NYU), ~100k installs, actively maintained. **MIT licensed** —
  free to use, adapt, or learn from commercially, attribution required.
  Computes ADR, KAST%, and its own open Rating (not HLTV's). Exposes
  **player visibility in microseconds** as a primitive — this is exactly the
  missing piece for a real Time-to-Damage fix (Tier 2 above). Also does
  navigation-mesh parsing/distance calculations, which could be a far more
  reliable path to resolving bombsite A/B than the manual callout-centroid
  approach used in this session's backfill.
- **"Valuing Player Actions in Counter-Strike: Global Offensive"**
  (Xenopoulos, Doraiswamy, Silva — IEEE Big Data 2020,
  [arxiv.org/abs/2011.01324](https://arxiv.org/abs/2011.01324)) — a
  published, open framework that values *every* in-game action (not just
  kills) by its effect on the team's win probability, validated on 70M+
  real events. Same open-source lineage as `awpy`. This is a legitimate,
  citable, IP-clean alternative to guessing at HLTV's Impact component.
- **Optimal Spending Error (OSE)** — a published metric (from the win-
  probability research line above) scoring how closely a team's economy
  spend matches the mathematically optimal decision. Directly extends
  RoundSync's existing `buy_decisions_against_team_economy` heuristic into
  something rigorously grounded and citable.
- **Plus/Minus player rating** ([arxiv.org/pdf/2409.05052](https://arxiv.org/pdf/2409.05052)) — another open,
  published rating methodology, borrowed from basketball/hockey analytics
  and adapted to CS:GO. A second legally-clean reference point if RoundSync
  ever builds its own composite score.
- **Legal**: all of the above is academic publication + MIT-licensed code —
  the opposite of HLTV's trade-secret formula. This is explicitly meant to
  be built upon; citing the paper and/or crediting `awpy` per its MIT
  license is all that's required.

## Found via cross-checking Google AI Mode's answer against real sources

A second pass, prompted by comparing this doc against what Google AI Mode
claimed exists. Its answer mixed real, verifiable metrics with at least one
outright fabrication — treated exactly like any other unverified source:
checked before trusting, not accepted because an AI said it confidently.

**Confirmed real, adding:**
- **Eco-frags / equipment value diff** — confirmed via HLTV Rating 3.0's
  eco-adjustment system: a kill against a low-equipment-value opponent is
  discounted, and a low-equipment kill against a full-buy opponent is
  boosted. `fact_economy` already has `round_start_equip_value` per player-
  round for the tracked player; the enemy side of this would need the
  killer/victim's equipment value at death, not currently captured anywhere
  — real new extraction, but the raw ingredient (an equip-value field) is
  already proven to exist and be parseable. Source:
  [hltv.org/news/42485 — Introducing Rating 3.0](https://www.hltv.org/news/42485/introducing-rating-30).
- **Kill distance** — average map distance between the player and their
  kills. `player_death` gives the tick; position data for both parties at
  that tick is already fetched elsewhere in the pipeline (e.g.
  `extract_fact_duel_placement`'s `pos_df` pattern) — cheap addition reusing
  an existing pattern.
- **Self-flash duration** — distinct from the self-flash *bug* fixed this
  session (which correctly stopped counting self-blinds as teammate
  flashes). This is different: tracking how often/how long a player blinds
  *themselves* as its own coaching signal, not folded into anyone else's
  stat. Not yet in RoundSync. `blind_df` (already parsed in
  `extract_fact_utility_throw`) already contains the self-blind rows — they
  are currently discarded (`continue`) rather than captured separately.

**Checked and rejected — presented confidently by AI Mode, no real precedent found:**
- **"Surprise Score"** — searched specifically; zero results on any real
  CS2 stat platform. Appears to be AI Mode generating a plausible-sounding
  name rather than reporting an actual tracked metric. Do not implement
  this as if matching an industry standard — if RoundSync builds "were you
  killed without looking at your killer," it's an original metric.
- **"Footstep triggers" / self-audibility** — AI Mode presented this as
  pullable/tracked. Already researched directly in the previous pass
  (see "no industry precedent" section below) and confirmed no platform
  publishes it. AI Mode conflated "computable from raw data" with
  "is an established stat" — those are not the same claim.
- **"Space Created"**, **"Crossfire Coverage"** — no citations provided,
  not independently verified. Not added to the roadmap until confirmed
  against a real source.

## Found by fetching AI Mode's actual cited sources directly

Checking the primary sources AI Mode linked to, not just its summary of them.

- **NextFrag — "What CS2 Demo Analysis Can and Cannot Measure"**
  ([nextfrag.gg/cs2-demo-analysis-limitations](https://nextfrag.gg/cs2-demo-analysis-limitations))
  confirms the counter-strafing/spray-accuracy approach already planned in
  Tier 5 (`clean shot percentage` = shots × velocity-at-fire-tick, same
  concept), and adds **"reconstructed duel context" (who saw whom first,
  peek order)** as a distinct, real derived-metric category not yet in this
  doc. Also gives an explicit, useful **"cannot measure" list**: true
  click-to-photon latency, monitor/mouse hardware latency, player
  fatigue/tilt, full network truth (lag comp/interpolation smoothing), and
  — directly relevant to last session's sub-tick research — **"perfect
  sub-tick certainty" is explicitly called out as unmeasurable from a demo,
  only approximable**, since demo playback reconstructs a per-tick model.
  Worth stating plainly in RoundSync's own docs/UI: these are honest limits
  of *any* demo-based tool, not a RoundSync gap.
- **NextFrag's own product** ([nextfrag.gg/cs2-demo-analyzer](https://nextfrag.gg/cs2-demo-analyzer))
  breaks its aim score into first-shot accuracy, spray discipline,
  counter-strafe timing, and **reaction time at the 25th percentile**
  (not the median Leetify uses) — a third real, sourced example of the
  aggregation-method question already flagged for RoundSync's own TTD fix:
  different serious tools pick different percentiles/aggregations
  deliberately, it's not a solved "one true answer." Also segments
  engagements by **type** (flick / tracking / static hold) and by
  **range** (long vs. close) — two more real dimensions not yet in
  RoundSync's duel data.
- **`cs2-analyser-tool`** (github.com/taua-almeida/cs2-analyser-tool,
  **MIT licensed**) — an independent open-source developer already built
  and published an *"HLTV Rating 3.0-style approximation."* Concrete,
  real-world precedent that an independently-derived approximation,
  openly released, is normal practice in this community — reinforces the
  legal read already in this doc, not just RoundSync's own reasoning about
  it. Also confirms **CT vs. T side-split reporting** as a real, simple,
  additional dimension — cheap to add across most existing RoundSync stats
  since `fact_economy.team` already carries this.

## Other sources checked that didn't add new metrics — recorded so they aren't re-checked

Not every research thread produced something to add. Recording the negative
results too, since re-running these same checks in a future session would
waste time re-confirming the same dead end.

- **FACEIT** — searched
  ([fctracker.org](https://fctracker.org/),
  [support.faceit.com/hc/en-us/articles/10525200579740](https://support.faceit.com/hc/en-us/articles/10525200579740-FACEIT-CS2-Elo-and-skill-levels),
  and several ELO-guide sites) specifically for FACEIT's own gameplay
  analytics catalog, expecting something comparable to Leetify's glossary.
  Found only ELO/skill-level/rank mechanics (10 levels, 100–2000+ range,
  ~25 Elo swing per balanced match) — no deep per-match gameplay metrics
  the way Leetify/HLTV/Scope.gg publish. FACEIT is a matchmaking/ranking
  layer, not a gameplay-analytics source, for this doc's purposes.
- **EgoCS-400K** (Xenopoulos, [arxiv.org/abs/2606.18180](https://arxiv.org/abs/2606.18180),
  submitted 16 Jun 2026) — a real, verified paper, cited by AI Mode's
  expanded source list as relevant to "how CS2 metrics are calculated." It
  isn't: this is a dataset for training AI *world models* (400K+ egocentric
  gameplay videos paired with actions/camera/state for next-frame
  prediction research), not a coaching-metrics resource. Real citation,
  wrong domain — recorded so it isn't mistaken for relevant later.
- **Source 2 Schema Explorer** ([s2v.app/SchemaExplorer](https://s2v.app/SchemaExplorer/))
  — the true raw Source 2 engine schema (`CCSPlayerController`,
  `CCSPlayer_WeaponServices`, etc). Checked one class-listing page; it shows
  hierarchy only, not member fields, and reaching actual field names would
  mean crawling many individual class pages. Since RoundSync's pipeline
  goes through `demoparser2` (which already abstracts this exact schema
  into the friendly names in `DEMOPARSER2_FIELDS.md`), this would mostly
  duplicate documentation that already exists. Not pursued further — flag
  if a future need specifically requires raw engine field names
  `demoparser2` doesn't expose.

### AI Mode's expanded citation list — verified source by source

The user separately supplied AI Mode's full "expanded reference list" for
its CS2-metrics answer. Every entry was checked individually rather than
trusted as a batch, since one item on an earlier AI Mode list ("Surprise
Score," above) had already turned out to be fabricated.

| Source | Real? | Actually useful for RoundSync's metrics? |
|---|---|---|
| AlliedModders event wiki | Yes, well-established in the SourceMod/plugin community | Legitimate supplementary event-name reference; not individually re-verified since it's widely known to be real |
| [`osztenkurden/cs2parser`](https://github.com/osztenkurden/cs2parser) | Yes — confirmed real via direct code snippet (`HttpBroadcastReader`, `EntityMode.ALL`) | Different scope: live GOTV/broadcast-stream parsing, not recorded-`.dem` analysis like RoundSync does — not a substitute for `demoparser2` |
| [`LaihoE/demoparser`](https://github.com/LaihoE/demoparser) (demoparser2) | Yes | Already RoundSync's actual dependency |
| [Recoil Analytics](https://recoilanalytics.com/) (WASM in-browser demo parser) | Yes — confirmed via direct fetch of its "how it works" page | Raw extraction only (kills/damage/flash/grenade/bomb/economy/position events, ~40K events/match) — same category as `demoparser2` itself, no new derived-metric definitions found |
| Leetify Stats Glossary | Yes | Already deeply used throughout this doc |
| HLTV Rating 2.0/3.0 | Yes | Already deeply covered — see §HLTV Rating |
| EgoCS-400K ([arxiv:2606.18180](https://arxiv.org/abs/2606.18180)) | Yes, real paper | **No** — AI world-model/video-generation research, not analytics (see above) |
| AntiCheatPT ([arxiv:2508.06348](https://arxiv.org/abs/2508.06348)) | Yes, real paper | **Yes, but for cheat detection specifically**, not general coaching metrics — see §Cheat detection below |
| Valve GSI docs ([developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration)) | Yes | Live-match JSON schema (health/money/round-phase/etc) — RoundSync works from recorded demos, not live GSI, so this describes a data source RoundSync doesn't currently use, not a metrics catalog |

Net finding: every citation on the expanded list was real (nothing else
fabricated), but two of the academic papers were framed by AI Mode as more
relevant to "how CS2 metrics are calculated" than they actually are — a
real citation is not the same guarantee as an accurate claim built on it.

## Cheat detection — real methodology exists, but this is a different risk category

Checked directly against the actual paper (not just the abstract), since the
user asked specifically whether RoundSync could detect a likely cheater in a
match.

- **AntiCheatPT** (Loo, Lužkov, Burelli — IEEE Conference on Games 2025,
  [arxiv.org/abs/2508.06348](https://arxiv.org/abs/2508.06348)) — a real,
  peer-reviewed transformer model that classifies likely cheaters from
  **recorded `.dem` files** (not live/server-only data — exactly the input
  RoundSync already has). Trained on 256-tick (4-second) windows around
  each kill (224 ticks before, 32 after), 44 features per tick: attacker
  state + weapon one-hot, victim state, a "noise" signal for detecting
  wallbang/smoke kills that shouldn't have had visual confirmation, and map
  one-hot. Notably, it does **not** primarily use aim-snap/angular-velocity
  features the way I first assumed — it's mostly about relative
  positioning and distance, and whether a kill happened with information
  the shooter shouldn't have had.
- **Reported performance**: 89.17% accuracy, 93.36% AUC, but only **63.13%
  recall** and 85.13% precision. In plain terms: it misses more than a
  third of actual cheaters, and about 1 in 7 of the people it *does* flag
  aren't cheating.
- **Dataset (CS2CD, 795 matches)**: CC BY 4.0 license. **Code and model
  weights**: open-source at
  [github.com/itubrainlab/AntiCheatPT](https://github.com/itubrainlab/AntiCheatPT).
  Both genuinely reusable with attribution — no IP blocker.
- **The real consideration isn't legal, it's product risk.** Everything
  else in this doc is about RoundSync's own numbers describing the tracked
  user's own play. A cheat flag is different in kind: it's an accusation
  about a real third-party opponent, based on a model with a meaningful
  false-positive rate (~15%) and a worse false-negative rate (~37% of real
  cheaters missed). Valve's own VAC/Overwatch system is the actual
  authority with due process attached; an unofficial per-match "possible
  cheater" flag with no appeal path is a materially higher-risk feature
  than any stat on this page, regardless of how technically sound the
  underlying model is. If this gets built, it should be framed as a
  probabilistic signal for the user's own awareness ("this game had unusual
  patterns"), never as a confident accusation naming a specific person.

## Predictive / trend analysis — real methodology exists, but naive trend-lines are the wrong tool

Checked whether "here's where you're headed if you keep playing like this"
is something the industry already does, and what the statistically honest
way to build it would be.

- **What the industry actually does**: benchmark-gap comparison, not
  forecasting. Leetify and SteamAnalyst compare a player's current stats
  against higher-ranked players' typical numbers ("here's the gap to
  close"), which is a *static* comparison, not a *dynamic* projection.
  Searched specifically for genuine trend-forecasting/"projected rank"
  features and found no confirmed real precedent on any major platform.
- **The real statistical methodology, from sports-analytics research**:
  small-sample performance metrics are dominated by noise, not signal —
  the standard, well-established fix is **regression to the mean /
  Bayesian shrinkage** (the classic James-Stein estimator pattern from
  baseball analytics), which pulls a small-sample estimate toward a
  population or rank-tier baseline rather than trusting the raw trend
  line. **Naive linear extrapolation of a trend ("ADR went 80→90→100, so
  next month you'll be at 150") is exactly the mistake this methodology
  exists to prevent.**
- **Why this matters concretely for RoundSync right now**: the tracked
  player has **8 matches** of history. That is a very small sample by the
  standard this research uses to talk about "stabilization" — any
  predictive feature built today would be forecasting almost entirely off
  noise. If this ships, it needs to (1) show a confidence range, not a
  single confident number, (2) shrink toward a rank-tier baseline rather
  than extrapolate the raw trend, and (3) probably gate itself behind a
  minimum match count before showing anything at all, rather than project
  from 8 data points.
- **Connects directly to the Tier 6 academic line already in this doc** —
  the "Round Swing / win-probability-added" research is the real,
  rigorous foundation for genuine predictive modeling here, not a
  from-scratch trend-line.
- **Sources**: [leetify.com/blog/cs2-benchmarks](https://leetify.com/blog/cs2-benchmarks/) and [steamanalyst.com/cs2-stats](https://www.steamanalyst.com/cs2-stats) (both confirm benchmark-gap comparison, not forecasting) · [andrewgrenbemer.medium.com — regression to the mean in baseball projections](https://andrewgrenbemer.medium.com/applying-regression-to-the-mean-and-final-adjustments-creating-a-college-baseball-projection-1213154cac85) · [ncbi.nlm.nih.gov/pmc/articles/PMC8970347 — Bayesian analysis with informative priors in elite sports](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8970347/) (the small-sample-size methodology this section's recommendation is built on)

## Bracket comparison ("how do I compare to a higher/lower rank") — real methodology, but a real data blocker for RoundSync specifically

- **How Leetify actually does it**: z-scores against their whole tracked
  playerbase, colour-coded by percentile (bottom 10% = Poor, 10-30% =
  Subpar, 30-70% = Average, 70-90% = Good, 90-100% = Great). Genuinely
  useful methodological detail: **not every stat gets rank-adjusted.**
  Stats like Time to Damage, average blind duration, and spotted accuracy
  are compared *within your own skill bracket* (rank-dependent), while ADR,
  K/D, and the composite Rating use the *same* benchmark regardless of
  rank (rank-independent) — a deliberate, non-obvious design choice worth
  copying the reasoning behind, not just the output.
- **Valve does not publish any of this.** Checked directly: there's no
  official rank-distribution or per-bracket benchmark data from Valve.
  Even the community "rank distribution" numbers/colour names circulating
  on sites like csdb.gg are themselves derived from Leetify's own
  aggregated match data via a third-party republisher (Esports Tales) —
  not an independent or official source.
- **What this means concretely for RoundSync**: bracket comparison needs
  *population* data — many players' stats, grouped by rank — and
  RoundSync currently has ~3 users total. There is no honest way to show
  "here's the average ADR for your bracket" today; there isn't enough of
  RoundSync's own data to compute it, and using someone else's compiled
  benchmark table (even indirectly, via a republisher) means presenting
  numbers with an unknown/unverifiable methodology as if they were
  RoundSync's own.
- **What's already in place for when this becomes viable**: every fact
  table already stores `player_rank_new`/`player_rank_type_id` per row —
  RoundSync already tags every single stat with the exact rank it was
  earned at. That's the right foundation; once enough users are synced,
  building genuine population benchmarks is a `group by rank tier`
  aggregation over data RoundSync already collects, not new extraction.
- **Cheap and available right now, distinct from the blocked part**:
  *labeling* a given CS Rating number with its community-convention tier
  name/color (Grey 0-4,999 / Light Blue 5,000-9,999 / Blue 10,000-14,999 /
  Purple 15,000-19,999 / Pink 20,000-24,999 / Red 25,000-29,999 / Gold
  30,000+) is safe to build today — it's just labeling a numeric range
  RoundSync already stores, not claiming a population comparison RoundSync
  can't back up yet.
- **Sources**: [leetify.com/blog/cs2-benchmarks](https://leetify.com/blog/cs2-benchmarks/) (z-score/percentile methodology, fetched directly) · [csdb.gg/rank-distribution](https://csdb.gg/rank-distribution/) and [csdb.gg/premier-ranks](https://csdb.gg/premier-ranks/) (the community tier names/cutoffs, sourced from Esports Tales' aggregation of Leetify data — confirmed this is not an independent or Valve source)

## Checked and confirmed real, but not rigorously standardized

- **Pistol-round-specific performance** — confirmed as a real tracked
  category (SteamAnalyst and others segment stats by pistol round), but no
  single rigorous published methodology found — likely just "the same
  stats, filtered to pistol rounds."
- **Post-plant win rate / retake success rate**, and the wider **objective
  category** AI Mode raised (bomb plants/defuses as a raw count, bomb-
  carrier hold time, plant/defuse-denial kills, site-hold duration) —
  referenced in passing by some trackers ("retakes with success rate and
  decision-making speed") but not confirmed as standardized, precisely-
  defined stats the way ADR or KAST are. Buildable from existing round-
  bounds + bomb-plant data (RoundSync already has `bomb_plant` trigger data
  and `round_win_reason`), but there's no external definition to hold it
  to — RoundSync would be setting its own methodology here, not matching an
  industry standard.
- **Sources**: [steamanalyst.com/tools/cs2-stats](https://www.steamanalyst.com/tools/cs2-stats) and [community.skin.club/en/articles/best-cs2-stats-trackers](https://community.skin.club/en/articles/best-cs2-stats-trackers) (pistol-round segmentation and "retakes with success rate and decision-making speed" both referenced only in passing, no rigorous methodology given by either)

## Checked and found no industry precedent — would be a genuine RoundSync original

- **Sound discipline / self-audibility** (how often the tracked player gives
  away their own position by running instead of walking) — searched
  specifically for this; it's a real, widely-discussed *coaching concept*,
  but not a published or tracked stat on any platform researched. Confirmed
  real audible-range figures from community sources (running ≈20m, silent
  below ≈5m when deliberately walking) closely match RoundSync's own
  existing constants (`RUNNING_AUDIBLE_RANGE_UNITS` ≈ 19.05m,
  `WALKING_AUDIBLE_RANGE_UNITS` ≈ 17.15m, with sub-walk-speed movement
  correctly classified as silent) — those constants were a good estimate,
  not a guess that needs fixing. Building a "self-audibility" score would be
  a legitimate net-new RoundSync feature, not something to hold to an
  external standard, since none exists.
- **Sources**: searched specifically for a tracked "sound discipline"/self-audibility stat and found none — [csgo-guides.com/gameplay/sound](https://csgo-guides.com/gameplay/sound) and [steamcommunity.com/sharedfiles/filedetails/?id=3564697172](https://steamcommunity.com/sharedfiles/filedetails/?id=3564697172) confirm the real audible-range figures (running ≈20m, silent below ≈5m walking) used to validate RoundSync's existing constants, but neither describes a tracked stat, only game mechanics.

## HLTV Rating (2.0 / 3.0) — reference only, do not implement as-is

- **Calculation**: Rating 2.0's coefficients were only ever *reverse-engineered*
  by third parties (`0.0073·KAST + 0.3591·KPR − 0.5329·DPR + 0.2372·Impact +
  0.0032·ADR + 0.1587`), never officially confirmed by HLTV. Rating 3.0's
  coefficients have **never been published in any form**.
- **Purpose**: single-number overall performance score.
- **RoundSync verdict**: **do not build a copy.** The existing
  `extract_fact_engage_decision` docstring already gets this right — it
  deliberately stores raw kill/death/damage components without inventing a
  weighted score, specifically citing that HLTV's coefficients are
  undisclosed. If RoundSync wants a composite score later, build an
  original, transparently-documented formula under RoundSync's own name.
- **Legal**: the general *idea* of a weighted composite rating isn't
  ownable, but (a) we can't copy the real 3.0 formula because it doesn't
  exist publicly to copy, and (b) using the name "Rating" alongside "HLTV"
  branding, or claiming equivalence to their number, risks implying an
  affiliation RoundSync doesn't have.
- **Sources**: [medium.com/@ferahgothegreat](https://medium.com/@ferahgothegreat/approximating-hltv-s-cs-go-2-0-rating-in-valorant-54e1e7224759), [flashed.gg/posts/reverse-engineering-hltv-rating](https://flashed.gg/posts/reverse-engineering-hltv-rating/), [hltv.org/news/43047](https://www.hltv.org/news/43047/rating-30-adjustments-go-live)
