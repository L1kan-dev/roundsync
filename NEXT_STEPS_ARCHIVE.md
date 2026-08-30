# NEXT_STEPS Archive — finished-work detail

**Not force-read every session.** This holds the full forensic writeups for
everything already marked DONE in `NEXT_STEPS.md` — what was checked, how it
was verified, exact before/after numbers. `NEXT_STEPS.md` itself keeps a
one-line pointer into this file for each item; this file is where the actual
detail lives now, moved verbatim (2026-08-28), not summarized away.

**Two reusable lessons that were buried in this detail got promoted out
before this split happened** — see memory `project_supabase_operations.md`
(RLS-scoping rule, weighted-average rule). Everything else here is
genuinely historical: the code is the current source of truth, not this
file, per the project's own "never trust a doc's claim, verify against real
current state" rule.

Open a section here when a task specifically needs the reasoning behind a
past fix (e.g. "why does the bomb_site resolver use elevation pairing") —
not as routine reading.

---

## Tier 13 — Precision-over-rounding sweep — DONE, 2026-08-27

New standing rule (see Claude's memory, `feedback_precision_over_rounding.md`,
corrected mid-session — read the correction, not just the first pass):
round to a stat's own natural finest grain, never coarser — don't throw
away real precision by rounding to a "clean" flat value. This does NOT mean
adding decimal places by default. Came from fixing the reaction-time/
Time-to-Damage ms display (`avg_reaction_time_ms`,
`avg_time_to_damage_ms_when_won`) — the real bug was a coincidentally-round
`200ms` in test data reading as "rounded to the nearest 100," not a lack of
decimals; both fields are correctly whole milliseconds (`Math.round(1000 *
seconds)`), matching ms's own natural grain, not `round1()`'s 1-decimal
style (that's the right precision for percentages elsewhere in the app,
not for ms).

A quick grep for every `Math.round(` in `server.js`, `page.tsx`, and
`InsightsDashboard.tsx` while fixing that bug already surfaced 2 real
candidates — both fixed below, along with a full deliberate pass over
everywhere else the same pattern could hide, not just these two:

- [x] `InsightsDashboard.tsx`'s "Team-flashes" `EmphasisBar` — fixed.
      `badValue`/the coach-prompt value now pass `team_flash_pct` straight
      through (backend already rounds it to 1 decimal, no re-rounding
      needed at all); `goodValue` (a derived `100 - x`) uses a new local
      `round1()` matching `server.js`'s own helper, since a raw JS
      subtraction can reintroduce floating-point noise. Verified live:
      **86.6% / 13.4%**, not 87%/13%.
- [x] `InsightsDashboard.tsx`'s reaction-rate bar chart (`reacted_pct`) —
      fixed the same way (`round1(100 - d.no_visible_reaction_within_3s_pct)`
      instead of `Math.round(...)`). Judgment call resolved: this value
      also feeds a real tooltip number (`"Reacted within 3s : X%"`) and the
      AI Coach prompt, not just bar width, so it needed the same fix as a
      standalone stat tile. Verified live via a headed Playwright run,
      hovering the bar: **"Reacted within 3s : 69.3%"**, not 69%.

**Full sweep completed, not just the 2 known candidates:** re-checked every
remaining `Math.round(` in `server.js`, `page.tsx`, and
`InsightsDashboard.tsx`, plus every `.toFixed(0)` in the frontend (none
found). Confirmed legitimate, not re-litigated: the sync-status `avgSeconds`
ETA (an estimate, not a measurement), the Performance Index (0-100
whole-number composite score, conventional for a score-out-of-100), CSS bar
widths that never render as visible text, and the new `hoursPlayed` field
on the Tier 11 lifetime-stats endpoint (whole hours matches Steam's own
"X hrs on record" display convention, not lost precision).

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
second session, same day — see the bomb_site resolver entry below.**

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

(Tier 1 — "wrong math, fix regardless of cost" — is empty as of 2026-08-25,
second session: both items above are the ones that used to live there.)

## Tier 11 — Lifetime stats via Steam Web API — DONE, 2026-08-27

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

**Re-verified live, 2026-08-27 (this session), against the real API, not just recalled from the earlier research:**
called `GetUserStatsForGame` for a real user already in the database —
**215 real stat fields come back**, confirmed via a live call, not assumed
from the summary above. Sample real values for this account: 64,359 career
kills, 57,268 deaths, 22,747 headshot kills, 3,094 bombs planted, 846
defused.

**Real bug caught before it shipped, same live-verification pass:**
`total_wins` (32,138 for this account) looks like the obvious field for a
lifetime win count, but it's actually **round wins**, not match wins — it's
roughly half of `total_rounds_played` (64,829), a sane career round-win
rate. Computing `total_wins ÷ total_matches_played` produced an impossible
**1028% "win rate."** The real match-win counter is a separate field,
`total_matches_won` (1,345 for this account) — paired with
`total_matches_played` (3,124), that gives a real **43.1%** win rate. Fixed
in `decodeLifetimeStats()` (`server.js`) before any frontend code was
written against it — caught by actually running the decode logic against
live data rather than trusting the field name.

**New finding from this live check, not in the original research:** Valve's
per-map stats (`total_wins_map_de_dust2`, `total_rounds_map_de_dust2`,
etc.) are frozen to an old CS:GO-era map pool. **Confirmed present:**
`de_dust2`, `de_inferno`, `de_nuke`, `de_train`, plus several retired maps
(`de_aztec`, `de_cbble`, `cs_assault`, `cs_italy`, `cs_office`, `de_lake`,
`de_safehouse`, `de_sugarcane`, `de_stmarc`, `de_bank`, `de_house`,
`de_vertigo`, `cs_militia`, the `ar_*` maps). **Confirmed absent: `de_mirage`,
`de_ancient`, `de_anubis`, `de_overpass`** — no stat field for any of them
exists anywhere in the 215-field response. This directly limits point 3
above (per-map lifetime comparison) — it has real data for some of
RoundSync's tracked maps and zero data for others, Mirage most notably
(likely one of the most-played active-duty maps). Any per-map lifetime
feature needs to handle "Valve has no lifetime data for this map" as a
real, expected case, not an error.

Also confirmed present and available beyond what the original research
listed: per-weapon `total_shots_X`/`total_hits_X` (not just
`total_kills_X`) for every CS:GO-era weapon — meaning **lifetime accuracy
per weapon** (hits ÷ shots) is directly computable, not just kill counts.
Also present: `total_shots_fired`/`total_shots_hit` (overall lifetime
accuracy), `total_rounds_played`, `total_matches_played`, `total_mvps`,
`total_dominations`, `total_revenges`, and assorted novelty stats
(`total_broken_windows`, `total_weapons_donated`). A large batch of
`GI.lesson.*` fields (in-game tutorial completion flags) are real but
irrelevant — noise to filter out, not a data source.

**Built and shipped, 2026-08-27.** Live-fetches from Steam on each request
rather than storing a `lifetime_stats` column/table — this data barely
changes match-to-match, a live call is cheap and fast, and it avoids any
Supabase storage growth or cache-staleness concern under the $0-cost
constraint. New endpoint: `GET /api/user/lifetime-stats` (`server.js`),
via `decodeLifetimeStats()` — returns career K/D, win rate, headshot %,
overall accuracy, hours played, MVPs, bomb plants/defuses, every tracked
weapon's kills+accuracy (not just a top few), and every Valve-tracked
map's raw wins/rounds. Displayed on the Home dashboard's "Scanning for
your matches" empty state as a 4-tile card (Career K/D, Win Rate,
Headshot %, Best Weapon + its accuracy) — each tile deliberately answers a
distinct real question (per the user's own standing rule: no headline
number without one), not picked at random. Verified live via a headed
Playwright run: 1.12 K/D, 43.1% win rate, 35.3% HS%, AK-47 at 20.6%
accuracy — real numbers, not placeholders.

**See also `IDEAS.md`'s new entry** for a bigger, separate future vision
(a full dedicated Lifetime Stats page using all of Valve's data, not just
this curated 4-tile summary) — the endpoint already returns the full
decoded weapon/map data, not just what today's card uses, so that future
page can reuse it directly rather than needing new backend work.

## Tier 14 — Production incident findings, 2026-08-27 (fixed items' full detail)

Found while bringing production back online for a planned showcase. All
diagnosed root causes, not guesses. See `NEXT_STEPS.md`'s Tier 14 for the
one item that's still open (gc-worker not self-recovering from a
`LoggedInElsewhere` kick) — this section only covers the two that are done.

- [x] **Frontend returns 502 in production — FIXED, 2026-08-27, root cause confirmed via
      Railway's HTTP/network-flow logs.** `frontend/Dockerfile` explicitly
      sets `ENV HOSTNAME=0.0.0.0`, which binds Next.js's standalone server
      to IPv4 only. Railway's internal network path to this service uses
      IPv6 addresses (`fd12:...`). Confirmed via `railway logs --network`:
      connections register as "OK" at the raw TCP level (tiny byte counts,
      0ms latency) but the app's own console never logs a single incoming
      request — the connection never actually reaches an accepting socket.
      Compared directly against `services/api/server.js`'s `app.listen(PORT,
      ...)`, which has no host override (Node defaults to dual-stack) and
      which returns a real 200 through the same networking — confirming
      this is specifically the frontend's explicit IPv4-only override, not
      a project-wide networking problem. Fix: `HOSTNAME` changed from
      `0.0.0.0` to `::` in `frontend/Dockerfile` (dual-stack bind).
- [x] **`gc-worker` stuck in a tight retry loop on 2 real pending matches — FIXED, 2026-08-27.**
      Root cause: the code checked for a demo download URL under
      `matchurl`/`match_url`/`url`, none of which exist in Valve's real GC
      response. **The full research — what the real protobuf schema
      contains, and where the URL actually lives — is the single canonical
      entry in `CS2_ANALYTICS_STANDARDS.md`'s "Game Coordinator match
      resolution" section; not restated here.** This entry covers only the
      fix itself and its production-incident timeline.
      **Exact dated timeline, confirmed via real git history
      (`git log --follow -- services/gc-worker/index.js`):** the
      `roundstatsall` fallback was part of `gc-worker`'s code from the day
      the file was first written (2026-08-17) and worked correctly for 10
      straight days — matching the 10 real matches already sitting in the
      database as `fully_parsed`. It was removed in commit `291f722` at
      **2026-08-27, 02:18:27 +0200**, during that day's Tier 9.6 audit
      (Batch 2), on the mistaken belief that the field's name alone ("map")
      proved it could only ever hold a map name. **The 2 stuck matches were
      queued at 02:20 — two minutes later.** They are almost certainly the
      very first (and so far only) matches that ever needed fresh GC
      resolution after the fallback was deleted; every match before that
      moment used the exact same mechanism successfully. There is no real
      difference between the old and new `.dem` files or Valve's behavior
      at any point — the only thing that changed was RoundSync's own code
      losing, then regaining, a piece of logic that was correct the entire
      time.
      Fixed in `services/gc-worker/index.js`: restored the `roundstatsall`
      fallback, validated with `startsWith('http')` so a real map name can
      never again be mistaken for a URL. **Also added, same fix**:
      exponential backoff (`persistBackoff()`) so a match that genuinely
      can't resolve waits progressively longer between retries (10s → ... →
      capped at 5min) instead of hammering the GC every 5 seconds — cuts
      worst-case load on a permanently-stuck match from ~34,560 requests
      over 48h down to ~576.
      **Self-audit follow-up, same day:** the first version left
      `resolve_attempts`/`next_retry_at` sitting in a successfully-resolved
      match's telemetry as "harmless leftover data" — that assessment was
      wrong. `sync_pipeline.py`'s `process_and_parse_real_demo` spreads
      `existing_telemetry` forward at every stage, all the way into the
      final `fully_parsed` row — meaning these 2 dead keys would get
      permanently stored in every match that ever needed even one retry,
      across every user, forever. Fixed: the success path in
      `gc-worker/index.js` now strips both fields via destructuring before
      building the telemetry that gets saved.
      **Both fixes verified live, 2026-08-27, against the real 2 stuck
      matches.** Real result, queried directly from Supabase: both matches
      now carry genuine Valve CDN download links
      (`http://replay213.valve.net/730/...dem.bz2` shape) and both show
      `resolve_attempts`/`next_retry_at` as `null`. One of the two was
      already picked up and moved to `downloading` by production's
      still-online `watcher` service within seconds, entirely on its own.

**Related lesson, confirmed:** during this session, a local `docker-compose
up` was started (for an unrelated "preview the frontend locally" request)
while production's `gc-worker` was also being brought back online — both
instances logged into the *same real Steam account* at the same time, and
the production bot got kicked with `LoggedInElsewhere`, then hung
indefinitely at a "Steam Guard App Code:" prompt with zero further log
output. See memory `feedback_no_local_gcworker_during_prod_login.md` for
the standing rule this produced.

## Tier 9.6 — Full-PROJECT audit using the 6-lens framework — COMPLETE, 2026-08-27

Broader than Tier 9 (which only covered source code): this pass covered
**every real file in the repo** — config, Docker, deployment, docs, package
management. Verified complete via an unrestricted `find` with no depth
limit, after an earlier `maxdepth 3` pass silently missed several nested
files.

Batches, in order run (reprioritized by risk: 1, 4, 2, 0 first as
security/infra-sensitive, then 3, 5, 6, 7):

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
  a real failure is no longer invisible.
- **Architectural**: the encrypt side (`cryptoUtils.js`) throws loudly on a
  misconfigured key; the decrypt side (`crypto_utils.py`) failed completely
  silently on the identical failure mode (bad/missing key) before the fix
  above — an inconsistent failure philosophy across the two ends of the
  same encrypt/decrypt pair, now at least partially closed by the added log.
- **Sanity Check**: the Steam OpenID login flow
  (`frontend/app/api/auth/steam/route.ts`) → HMAC-signed proof → verified
  server-side (`services/api/server.js`) chain was read end-to-end.
  Confirmed correct: `server.js` checks the steamId format, checks
  `expires` against `Date.now()`, and compares the signature with
  `crypto.timingSafeEqual` (constant-time, avoids a timing side-channel).
- **Legal & Licensing**: verified via live web search — `fernet` (npm, MIT),
  `jsonwebtoken` (npm, MIT), `cryptography` (PyPI/pyca, dual
  Apache-2.0/BSD) all real, commercial-safe licenses. Steam Web API Terms
  of Use (key confidentiality, no password interception, no
  false-affiliation claims) checked against actual usage: the key is only
  ever read server-side, never in a `NEXT_PUBLIC_`-prefixed frontend
  variable. The OpenID login flow never touches the user's Steam password
  at any point.
- **Proactive Ideas**: none specific to this batch.

### Batch 4 (`services/api/server.js`, the API surface) — DONE, 2026-08-26

- **Critical Issues — RESOLVED same day.** `POST /api/user/onboard` upserted
  into `matches` using `onConflict: 'match_id'` with `match_id` set
  directly from the client-supplied `recentShareCode`, and no check that
  this `match_id` doesn't already belong to a different `steam_id64`.
  Fixed via `claim_match_if_available()`, see the security-patterns and
  onboarding-fix detail below.
- **Architectural & Performance**: found and fixed a real redundant-query
  bug. `getPlayerRankInfo()` re-queried `fact_adaptation_event` from
  Supabase a second time in both `buildDashboardPayload` and
  `POST /api/coaching/ask`, even though both call sites already fetch the
  *entire* `fact_adaptation_event` table (via `fetchFactRows`) in the very
  same request. Extracted the matching logic into a pure
  `extractRankInfo(rows, matchIds)` function with no query of its own.
  Also removed `buildFactSummary()`, which became dead code once its one
  real caller (`/api/coaching/ask`) was rewritten to call
  `fetchFactRows`/`summarizeFactRows` directly.
  Separately (not fixed, just noted, per user decision to leave as-is
  permanently): `performanceIndexServer()` here and `performanceIndex()` in
  `frontend/app/page.tsx` are the same formula, intentionally duplicated
  per an existing comment.
- **Sanity Check**: `computeCategoryScores`'s `awareness` score re-verified
  as the already-fixed correct formula. `engage_iq` blends
  `round_win_pct_when_engaged` and `survived_pct_when_disengaged` at a flat
  50/50 weight regardless of sample size on either side — not a bug (two
  genuinely different skills on purpose), but worth knowing as a noise
  risk. Not changed.
- **Legal & Licensing**: `express`, `cors`, `dotenv`, `express-rate-limit`,
  `@supabase/supabase-js` (MIT/BSD-family) and `@google/genai` (Apache-2.0)
  all commercial-safe. RoundSync is on the Gemini **free** API tier (not
  paid, confirmed by the user) — on the free tier, Google's terms allow
  both submitted content and Gemini's response to be used to "provide,
  improve, and develop Google products," and allow human reviewers to read
  that traffic. Worth revisiting (paid tier) before scaling or advertising
  a privacy stance.
- **Proactive Ideas**: `/api/coaching/ask` shares the same generic
  60-req/min-per-IP limit as every other endpoint, with no tighter cap —
  free-tier Gemini quotas are strict, so one user hammering this endpoint
  could exhaust the whole day's quota for every RoundSync user. **User
  decision: deliberately left uncapped for now**, revisit before public
  launch.

### Self-audit of Batches 1 + 4's own fixes, plus the KAST/stats work — DONE, 2026-08-27

- **Residual gap, left as-is**: the onboarding ownership fix (Batch 4)
  checks "does this share code belong to someone else?" then saves — two
  separate steps at the application level. A precisely-timed concurrent
  request could theoretically still slip through. Far narrower than the
  original bug. **User decision: leave as-is**, low priority.
- **Pre-existing pattern, not a new bug**: the new KAST/HS-accuracy Home
  dashboard tiles averaged each match's own percentage equally, same as 3
  existing tiles already did — the exact pattern now covered by the
  weighted-average standing rule in `project_supabase_security_patterns.md`.

### Batch 2 (background workers: `watcher.py`, `gc-worker/index.js`, map-callout tools) — DONE, 2026-08-27

- **Critical Issues**: `gc-worker/index.js` logs into a real Steam account
  and automates it. Steam's Subscriber Agreement literally prohibits
  "bots"/automation software — but this is the same gray area already
  documented for extracted game assets: every third-party CS2 stats site
  resolves a match share-code the same way, no official public API exists,
  and Valve has never enforced against this specific use. Documented in
  `CS2_ANALYTICS_STANDARDS.md`'s legal summary, not treated as urgent.
- **Architectural & Performance**: `watcher.py`'s `prune_old_matches()`
  only deleted matches that reached a terminal status — a match stuck
  permanently in `pending_url`/`pending_download`/`downloading` never got
  cleaned up. Also found the same missing `.order()`/`.limit()` pattern
  already fixed in `server.js`. Both fixed same day (see below).
- **Sanity Check**: `watcher.py`'s multi-argument `.select()` call checked
  against the actual installed `postgrest` library source, confirmed valid
  — not a bug. `gc-worker`'s overlapping-run guard (fixed in an earlier
  session) still holds.
- **Legal & Licensing**: `steam-user`, `node-cs2`, `steam-totp`, and
  `ValveResourceFormat`/Source2Viewer-CLI all MIT-licensed, verified fresh.
- **Proactive Ideas**: none new — infrastructure, not a metrics surface.

**Follow-up, same day**: CS2 map updates are a real recurring risk for the
callout data going stale — `sync_pipeline.py` now reads the current match's
own client version from `parse_header()` and compares it against the stored
callout data's version every time a bomb plant needs resolving, printing a
`⚠️ STALE CALLOUT DATA` warning if the map was updated since. Doesn't block
anything, just makes a real map update visible in the logs.

**Batch 2's 3 remaining findings, all fixed same day per "a bug is a bug,
small or big":**
1. `watcher.py`'s `prune_old_matches()` now also prunes any non-terminal
   match older than `STUCK_MATCH_TIMEOUT_HOURS` (48h).
2. Same missing `.order()`/`.limit()` pattern fixed here too — orders by
   `parsed_at` descending, caps at 1,000 rows.
3. Steam login failures now get classified via real EResult error codes
   (researched from `node-steam-user`'s actual source): fatal (wrong
   password, banned/disabled/locked account, broken 2FA secret) stops
   retrying with a distinct message; transient keeps the existing 15s retry.

### Batch 3 (`services/watcher/sync_pipeline.py`, the core pipeline) — DONE, 2026-08-27

- **Critical Issues**: none found — substantial prior attention already
  paid off.
- **Architectural & Performance**: the already-known Tier 9 duplicate-
  parsing item is still open (see `NEXT_STEPS.md` Tier 9). Also fixed:
  `get_single_match_info`'s retry loop treated a rejected/revoked
  `VALVE_API_KEY` (401/403) the same as a transient network issue — now
  returns immediately.
- **Sanity Check**: confirmed temp `.dem`/`.dem.bz2` files always get
  deleted via a `finally` block, even on failure. Confirmed
  `process_single_demo` is only ever called behind an "already exists?"
  check first.
- **Legal & Licensing**: `requests` (Apache-2.0), `pandas` (BSD 3-Clause)
  both commercial-safe.
- **Proactive Ideas**: none new beyond Tier 5.

### Batch 0 (config & meta layer) — DONE, 2026-08-27

- **Critical Issues**: none.
- **Architectural & Performance**: `NEXT_PUBLIC_*` variables compile into
  the frontend's client bundle at build time, not container-start time —
  `docker-compose.yml`'s `environment:` block had zero effect on them
  locally (confirmed a non-issue in production, since Railway passes
  matching env vars as Docker build args automatically). Fixed: added an
  explicit `args:` block to `docker-compose.yml`'s frontend service. Also
  fixed: an obsolete `version: '3.8'` line, and a stale "Node.js 20"
  comment in `gc-worker/Dockerfile` (actual image is `node:22-slim`).
- **Sanity Check**: confirmed `services/api` and `services/gc-worker`'s
  `npm ci --only=production` skips nothing needed, since neither has any
  `devDependencies`.
- **Legal & Licensing**: nothing new — no dependencies added.
- **Proactive Ideas / other small fixes**: `frontend/.dockerignore` didn't
  exclude `.env`/`.env.local` — fixed. The `run-frontend` skill's mock test
  data was updated to include the new KAST/headshot-accuracy/multi-kill
  fields.

### Batch 5 (small/medium frontend components) — DONE, 2026-08-27

- **Critical Issues**: none.
- **Architectural & Performance**: found and deleted real dead code —
  `components/Operator.tsx` (an original SVG operator silhouette) had zero
  imports anywhere; `app/layout.tsx` renders the real operator PNGs
  globally instead, superseding it.
- **Sanity Check**: none of the math/logic in this batch needed checking —
  UI/presentation only. `RankBadge.tsx`'s per-band color table correctly
  matches `lib/rank.ts`'s 7 real bands plus a distinct "Unranked" grey.
- **Legal & Licensing**: two corrections — the CT/T operator background
  figures are AI-generated artwork, not real extracted CS2 assets (a wrong
  code comment fixed); and the Valve disclaimer only rendered inside the
  Home tab's own JSX, not globally — moved into `layout.tsx` as a
  persistent footer.
- **Proactive Ideas**: none new.

### Batch 6 (`frontend/components/InsightsDashboard.tsx`) — DONE, 2026-08-27

- **Critical Issues**: none.
- **Architectural & Performance**: found a dormant circular-import risk
  (this file imports helpers from `@/app/page`, which is the file that
  renders it) — not actively crashing, but fragile. Flagged for Batch 7
  rather than fixed piecemeal.
- **Sanity Check**: nothing new — math already audited in Batch 4.
- **Legal & Licensing**: `recharts` (MIT), `lucide-react` (ISC) verified.
- **Proactive Ideas**: none new.

### Batch 7 (`frontend/app/page.tsx`, 2,032 lines) — DONE, 2026-08-27

**Tier 9.6 (the 8-batch audit) fully complete as of this batch.**

- **Critical Issues**: none.
- **Architectural & Performance — 2 real fixes**: closed the Batch 6
  circular-import risk by creating `frontend/lib/mapDisplay.ts`. Also: the
  match/sync-status poll ran every 10s forever even with nothing syncing —
  changed to back off to every 60s when idle, using a self-adjusting
  `setTimeout` chain and `Promise.all` for concurrent fetches.
- **Sanity Check — 1 real fix**: `fetchProfile`/`fetchChatHistory`/
  `fetchSyncStatus` silently did nothing on a 401/403 — only `fetchMatches`
  actually logged the user out. All 4 now call `handleLogout()`
  consistently. Confirmed `avgKd`/`avgAdr`/`avgHs` already use a true
  pooled rate, not an average of ratios — correct as-is.
- **Legal & Licensing**: `react-markdown` (MIT) — last unchecked dependency,
  now every third-party library in the project has been checked at least
  once.
- **Proactive Ideas — both fixed same day**: extracted the duplicated
  onboarding form into a shared `OnboardingForm` component. Replaced all 3
  native `alert()` calls with the app's own `Toast` component (added a
  proper `error` variant with a 6s auto-dismiss instead of reusing the
  success styling/timing).

**Self-audit, same day**: found and fixed one issue in the polling fix
itself (sequential awaits reintroducing drift — changed to `Promise.all`).
Second pass found nothing further.

## Post-audit fixes, on request (2026-08-27)

**Radar icon centering** — user visually spotted the "Scanning for your
matches" empty-state radar icon not centered in its rings. Root cause,
found via real Playwright measurement: `.radar-backdrop`'s rings centered
at a *percentage* of card height (`50% 42%`), which only lines up for one
specific text-content length; the icon's real position is a *fixed*
distance from the top. Fixed both `::before`/`::after` to center on
`50% 121px`.

**Onboarding race condition, now genuinely closed** — replaced the
check-then-upsert with `claim_match_if_available()`, a Postgres function
doing the check-and-write as one atomic `INSERT ... ON CONFLICT ... WHERE`.
Real bug caught while verifying: a foreign-key constraint
(`matches.steam_id64 → users.steam_id64`) requires the `users` upsert to
run before the match claim — preserved deliberately with a comment.
Verified against real data: a genuine new claim, a blocked cross-account
claim, and a same-owner re-claim all behaved correctly.

**Dashboard averaging, now weighted** — see the weighted-average standing
rule in `project_supabase_security_patterns.md` for the rule; this is
where `avgWeighted()` was first added, in `frontend/app/page.tsx`, applied
to `avgKastPct`, `avgHeadshotAccuracyPct`, `avgEntrySuccessPct`,
`avgUtilityDmgPerRound`, `avgTradeKillPct`, and `avgAdr`/`avgHs`'s fallback
paths. Removed the now-dead `avgOptionalField()`.

## Self-audit of the 2 post-audit fixes above — found the RLS security gap, 2026-08-27

Re-auditing the atomic-claim fix turned up the real RLS finding — full
detail now lives in memory `project_supabase_security_patterns.md`
(the reusable rule) since that's what a future session actually needs;
the original incident summary:

Checking whether `claim_match_if_available()` was safely restricted to the
server's own service-role connection revealed it defaulted to `PUBLIC`
EXECUTE, which led to discovering every single table's RLS policy was
`{public}`-scoped with `USING (true)` — RLS "on" but never actually
restricting anything, project-wide. **Confirmed not currently exploitable**
(the frontend never uses the public key — verified via grep), but the
security model rested entirely on that key never leaking.

**Fixed, user-approved given the blast radius (all 11 tables)**: every
table's RLS policy restricted to `service_role` only; redundant
`anon`/`authenticated` grants revoked on all 11 tables; the function's own
EXECUTE grant restricted to `service_role`; its `search_path` pinned
(Supabase's security advisor flagged this immediately). Verified:
`claim_match_if_available()` re-tested after every change to confirm the
server's own access still works. Security advisor run before and after — 1
real warning found and fixed, 0 remaining. Also fixed in passing: a missing
index on `matches.steam_id64` for the earlier-discovered foreign key.

## Tier 10 — DONE items' full detail (2026-08-27)

See `NEXT_STEPS.md` Tier 10 for the still-open items from this same
live-testing batch. These are the ones already fixed:

- **"Positioning Decisions Over Time" chart tooltip** — added a caption
  explaining "Judges the decision, not just the death." **Follow-up:**
  even with the caption, the label "Survived or tradeable" still read like
  a condition, not a rate, and "Survived or Traded" would have been
  factually wrong. Renamed to **"Good Push Rate"** (matches the code's own
  `good_decision_pct` field name); the underlying field name is unchanged.
- **Reaction times in ms, not seconds** — renamed fields, converted with
  `Math.round(1000 * seconds)` (whole ms, went through 2 wrong passes
  first — see `feedback_precision_over_rounding.md`). Fixed both the UI
  tile and the AI Coach's prompt context.
- **Raw field names in tooltips/labels** — fixed with a pattern-based
  prompt instruction (`_pct`→%, `_ms`→ms, `_deg`→°) instead of a hardcoded
  per-field list. Found and fixed a related precision inconsistency (the
  Home dashboard's secondary KPI row was truncating percentages other
  tiles show with 1 decimal). **Follow-up:** the 4 Home dashboard
  trend-chart tooltips were *also* showing raw lowercase keys — fixed with
  a shared `formatter`.
- **"Syncing your matches" progress counts not matching reality** — the
  panel compared `fully_parsed` count against the player's *entire* match
  history, not just the current sync batch. Fixed with a client-side
  `syncBatchBaseline` snapshot.
- **Real map images** — pulled real in-game screenshots from
  `github.com/MurkyYT/cs2-map-icons` for all 9 recent-rotation active-duty
  maps, each verified visually before adding. Resized to 800px/JPEG
  (~50-80KB each). Legal basis: Valve's Fan Content Policy (already-covered
  gray area), not the extraction repo's own license.
- **KAST/headshot accuracy/multi-kill rounds in Insights** — new
  "Consistency & Impact" card in the Aim & Reaction subtab, backed by
  `avgWeightedServer()`/`sumOptionalFieldServer()` deliberately kept in
  sync with the frontend's own helpers.
- **Rank badge visual redesign** — real 3-bar/glare geometry (exact path
  data from `Juknum/counter-strike-icons`), `bandTones()` formula replacing
  an 8-entry hand-tuned color table, pixel-measured vertical text
  centering. Also fixed: match cards previously showed a plain colored dot,
  not the real badge — now render the actual `RankBadge` component.
  **Follow-up, caught on the deployed site:** rank number was hard to read
  against the fill — lowered `bandTones()`'s brightness mix ratios.
- **`de_cache` map thumbnail gap** — caught on the deployed site (not every
  current Premier map was in the original 9-map batch). Same
  verify-before-adding process. Also corrected an overclaiming doc comment.

## Tier 9 — DONE items' full detail (2026-08-25, third session same day)

See `NEXT_STEPS.md` Tier 9 for the 2 still-open items (the 8x-duplicate-parse
refactor, the Gemini model-upgrade note). These are the ones already fixed:

- **3 duplicated helper functions in `sync_pipeline.py` consolidated** — a
  round-lookup calculator, a team lookup, and a round-bounds builder were
  each copy-pasted 3-4 times. Extracted into `_round_for`, `_team_for`,
  `_build_round_bounds`. Verified against a real match (de_cache) — output
  identical to what was already stored, confirming a pure dedup.
- **`watcher.py`: 2 real fixes.** A silently-swallowed exception in
  `update_heartbeat()` now logs a warning. `process_pending_downloads()`
  fetched 10 pending matches every 5s but only ever processed 1 — reduced
  to `.limit(1)`.
- **`server.js`: the "awareness" score bug** — `computeCategoryScores()`
  averaged 3 adaptation-trigger types' own reaction-rate percentages
  equally instead of computing the true combined rate. Verified with a
  concrete example: 80 audible-enemy triggers at 75% + 4 bomb plants at 25%
  gave 50 under the old method vs. the mathematically correct 72.6. Also
  fixed a stale comment claiming "6 real bands, not 7" (there are 7).
- **`gc-worker/index.js`: 2 real fixes.** `processPendingMatches()` had no
  overlap guard on its 5-second interval — added `isProcessingMatches`.
  Also removed a `roundstatsall[i].map` fallback based on a schema-audit
  misreading — **corrected 2026-08-27**, see Tier 14's fixed-item detail
  above; this fallback was actually correct and had to be restored.
- **`server.js`: `buildFactSummary()`/`buildDashboardPayload()` duplicate
  fetch** — both independently fetched the same 6 fact tables. Split into
  `fetchFactRows()` + `summarizeFactRows()`.
- **`TopNav.tsx`: 4 copy-pasted nav-button blocks** collapsed into one
  array + `.map()`.
- **`frontend/app/api/auth/steam/route.ts`: `postMessage(..., '*')`** —
  delivered to any origin `window.opener` happened to be. Tightened to use
  the app's own real origin (`realm`).
- **`InsightsDashboard.tsx`: real crash bug** — the dashboard-data fetch
  never checked `response.ok`, so a server error's `{error: "..."}` body
  (still a truthy object) skipped the existing `!data` fallback and crashed
  instead. Fixed by throwing on a non-ok response.
- **`InsightsDashboard.tsx`: 6-card `InsightCard` wrapper** — user-approved
  after seeing the explanation. Wraps only the genuinely-identical parts;
  each card's different content stays as children.
