# CS2 Analytics Standards — Research Process Archive

**Not force-read every session.** Holds the full research *process* behind
findings that are already summarized in `CS2_ANALYTICS_STANDARDS.md`'s
master categorization and per-metric entries — how something was verified,
not just what the verdict was. Split out 2026-08-28, same principle as
`NEXT_STEPS_ARCHIVE.md`: the verdict is reference material needed every
session; the process that produced it is historical.

Open this when a task specifically needs to know *how* a finding was
verified (e.g. "how confident are we the rank badge shape is right") — not
as routine reading.

---

## Premier rank badge — full research process

Visual-asset research pass for `RankBadge.tsx`, done because the user
flagged rank as emotionally high-stakes and asked for real research before
touching anything rank-related (see memory `feedback_rank_requires_extra_rigor.md`).
Two independent real sources used: a user-provided screenshot of a real
Gold-tier badge ("30,000"), and a real ~19s CS2 gameplay recording (2560x1440)
showing a real Light Blue-tier badge ("CS Rating 7,258").

**Shape, confirmed exact, not approximate:** path geometry pulled directly
from `github.com/Juknum/counter-strike-icons` (auto-updates from CS2's own
live game files — `premier_rating_bg.svg`), not eyeballed. Confirmed 3 left
accent bars (a dark shadow bar layered between two bright ones — easy to
undercount as 2 at a glance, confirmed by counting real pixels in the
recording), and 2 semi-transparent diagonal glare streaks across the main
face. `RankBadge.tsx`'s pre-existing shape already matched the box outline
closely, but was missing the 3rd bar and the glare streaks entirely.

**Color, confirmed for 2 of 7 bands, generalized for the rest:** the real
Gold badge has a bright, fairly uniform gold fill (not the near-black
gradient the component used to render) and light gold-cream text with a
bronze drop-shadow. The real Light Blue badge (measured from the recording)
showed the same pattern. **Only Gold and Light Blue were directly
verified.** The other 5 bands + Unranked use one consistent derived formula
(`bandTones()` — mix each band's existing base hue toward white/black at
fixed ratios) rather than 7 independently hand-picked colors. Flag if a
future session gets a real screenshot of another band and finds the
derived version off.

**Number formatting, measured precisely, not eyeballed:** real footage of
"7,258" (measured via pixel column-height analysis on the extracted video
frame) showed only a **subtle** size difference between the leading digits
and the rest — not the dramatic ~35% jump first assumed. The *shipped*
component ended up using a more pronounced ratio than the literal
measurement, per the user's explicit follow-up request ("increase the pre
comma digits") after seeing the subtle version — a deliberate stylization
choice on top of the real measurement, not a claim that this exact ratio
exists in the live game.

**Animation, confirmed real, not shipped:** frame-differencing the
recording (comparing frames ~0.4s apart, amplified) showed a real,
localized soft white shimmer over the bars — distinct from generic
video-compression noise. Built and shown as a live CSS animation in
review, then explicitly removed at the user's request — the shipped badge
is static. If revisited later, the confirmed real effect is a soft, slow
shimmer over the bars, not a dramatic one.

**Vertical text centering — methodology worth reusing:** the review's first
"big number" attempt read visually off-center. Rather than nudge by eye,
the actual rendered pixels were measured (isolate near-white text pixels
via a color threshold, exclude the bars by x-range, compare the glyphs'
vertical midpoint against the true image center) — found 8.5px off in a
151px-tall render, corrected, then re-measured to confirm within 1-2px.
Worth reusing this measure-don't-eyeball approach for any future
pixel-level UI positioning dispute.

**Separately confirmed, unrelated to the badge's visual design:**
`rank_at_match_start` (used on match cards) is the player's rank *before*
that match started, not after — traced directly to `rank_old` from the
demo's own `rank_update` event in `sync_pipeline.py`.

**Legal**: same reasoning as `feedback_prefer_real_extracted_assets.md` —
Valve's own game asset via an extraction repo, Fan Content Policy gray
area. `Juknum/counter-strike-icons` carries no explicit repo license, same
as the badge-shape source used previously.

**Sources**: `github.com/Juknum/counter-strike-icons` (raw SVG path data,
fetched live), a user-provided real in-game screenshot, a user-provided
real ~19s CS2 gameplay recording (frame-extracted and measured with ffmpeg
+ PIL/numpy).

## Found via cross-checking Google AI Mode's answer against real sources

A second research pass, prompted by comparing the standards doc against
what Google AI Mode claimed exists. Its answer mixed real, verifiable
metrics with at least one outright fabrication — treated exactly like any
other unverified source: checked before trusting.

**Confirmed real** (already folded into the main doc's "Full industry
inventory" and "Must build ourselves" sections — recorded here only for
the verification trail): eco-frags/equipment value diff (HLTV Rating 3.0's
eco-adjustment system), kill distance (reuses the `pos_df` pattern), and
self-flash duration (the self-blind rows already exist in `blind_df`,
currently discarded).

**Checked and rejected — presented confidently by AI Mode, no real
precedent found:**
- **"Surprise Score"** — searched specifically; zero results on any real
  CS2 stat platform. Appears to be AI Mode generating a plausible-sounding
  name rather than reporting an actual tracked metric.
- **"Footstep triggers" / self-audibility** — AI Mode presented this as
  pullable/tracked. Already researched directly and confirmed no platform
  publishes it — AI Mode conflated "computable from raw data" with "is an
  established stat."
- **"Space Created"**, **"Crossfire Coverage"** — no citations provided,
  not independently verified.

## Found by fetching AI Mode's actual cited sources directly

Checking the primary sources AI Mode linked to, not just its summary.

- **NextFrag — "What CS2 Demo Analysis Can and Cannot Measure"**
  (nextfrag.gg/cs2-demo-analysis-limitations) confirms the counter-strafing/
  spray-accuracy approach already planned, and adds "reconstructed duel
  context" (who saw whom first, peek order) as a distinct real category.
  Gives an explicit, useful "cannot measure" list: true click-to-photon
  latency, hardware latency, player fatigue/tilt, full network truth, and
  — directly relevant to the sub-tick research already on file — "perfect
  sub-tick certainty" is explicitly called out as unmeasurable from a demo,
  only approximable.
- **NextFrag's own product** breaks its aim score into first-shot accuracy,
  spray discipline, counter-strafe timing, and reaction time at the 25th
  percentile (not the median Leetify uses) — a third real, sourced example
  confirming different serious tools pick different percentiles/
  aggregations deliberately.
- **`cs2-analyser-tool`** (github.com/taua-almeida/cs2-analyser-tool, MIT
  licensed) — an independent open-source developer already built and
  published an "HLTV Rating 3.0-style approximation." Real-world precedent
  that an independently-derived approximation, openly released, is normal
  practice in this community. Also confirms CT vs. T side-split reporting
  as a real, simple, additional dimension.

## Other sources checked that didn't add new metrics

Recording the negative results so re-running these checks in a future
session doesn't waste time re-confirming the same dead end.

- **FACEIT** — searched specifically for a gameplay-analytics catalog
  comparable to Leetify's glossary. Found only ELO/skill-level/rank
  mechanics — FACEIT is a matchmaking layer, not a gameplay-analytics
  source, for this doc's purposes.
- **EgoCS-400K** (arxiv.org/abs/2606.18180) — a real, verified paper, cited
  by AI Mode as relevant to "how CS2 metrics are calculated." It isn't:
  a dataset for training AI world models, not a coaching-metrics resource.
  Real citation, wrong domain.
- **Source 2 Schema Explorer** (s2v.app/SchemaExplorer) — the true raw
  Source 2 engine schema. Checked one class-listing page; shows hierarchy
  only, not member fields. Since RoundSync's pipeline goes through
  `demoparser2` (which already abstracts this into `DEMOPARSER2_FIELDS.md`),
  this would mostly duplicate documentation that already exists.

### AI Mode's expanded citation list — verified source by source

Every entry checked individually rather than trusted as a batch, since one
item on an earlier AI Mode list ("Surprise Score") had already turned out
to be fabricated.

| Source | Real? | Actually useful for RoundSync's metrics? |
|---|---|---|
| AlliedModders event wiki | Yes | Legitimate supplementary event-name reference |
| `osztenkurden/cs2parser` | Yes — confirmed via direct code snippet | Different scope: live GOTV/broadcast-stream parsing, not recorded-.dem analysis — not a substitute for demoparser2 |
| `LaihoE/demoparser` (demoparser2) | Yes | Already RoundSync's actual dependency |
| Recoil Analytics (WASM in-browser parser) | Yes — confirmed via direct fetch | Raw extraction only, same category as demoparser2 itself, no new derived-metric definitions found |
| Leetify Stats Glossary | Yes | Already deeply used throughout the main doc |
| HLTV Rating 2.0/3.0 | Yes | Already deeply covered |
| EgoCS-400K | Yes, real paper | No — AI world-model research, not analytics |
| AntiCheatPT | Yes, real paper | Yes, but for cheat detection specifically |
| Valve GSI docs | Yes | Live-match JSON schema — RoundSync works from recorded demos, not live GSI, so describes a data source not currently used |

Net finding: every citation on the expanded list was real, but two of the
academic papers were framed by AI Mode as more relevant than they actually
are — a real citation is not the same guarantee as an accurate claim built
on it.
