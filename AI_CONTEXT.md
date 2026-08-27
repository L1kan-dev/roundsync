# AI_CONTEXT.md — Read This First

If a chat session is pointed at this file, treat it as a direct instruction:
**read every file listed below, in full, before responding to anything
else in that conversation.** This file exists so a fresh session starting
on RoundSync has the same context as the sessions that produced the
research below — the actual documents, not a summary of them, and not an
assumption about what they probably say.

## What's already automatic — you don't need this file for this part

Claude Code's own cross-session memory (stored outside this repo, under the
user's Claude settings, not in RoundSync's file tree) auto-loads a one-line
index (`MEMORY.md`) into every new session without being asked — you'll see
it as a system reminder at the start of the conversation. That mechanism is
already automatic and this file can't change it either way.

**What this file is actually for**: `MEMORY.md`'s entries are one-liners —
enough to know a topic was researched, not enough to actually answer a
question about it. This file's job is to force the *deep* research that
lives inside this repo to get read in full, since nothing auto-loads that
for you.

## Required reading, in this order

1. **`NEXT_STEPS.md`** (repo root) — what's been fixed and what's still
   open, tiered by priority and actual engineering lift (verified against
   real field availability, not estimated). Includes a full "Completed"
   record of every bug found and fixed in the 2026-08-25 data audit, so you
   don't need the external Claude artifact link to know that history — this
   file is self-contained.
2. **`services/watcher/CS2_ANALYTICS_STANDARDS.md`** — ~40 CS2 analytics
   metrics (ADR, KAST, Time to Damage, reaction time, trade kills, clutches,
   cheat detection, predictive/trend analysis, rank-bracket comparison, and
   more) researched against real sources — Leetify, HLTV, FACEIT, academic
   papers, open-source libraries — not assumed or taken from a single AI
   summary. Opens with a master index sorting everything into what
   RoundSync can legally adopt outright, what has no external standard and
   must be built from scratch, and what's off-limits (IP risk or product
   risk). This is the evidence behind every item in `NEXT_STEPS.md` — check
   it before re-researching any CS2 stat definition from scratch.
3. **`services/watcher/DEMOPARSER2_FIELDS.md`** — the field/event reference
   for `demoparser2`, the library RoundSync's data pipeline is built on,
   plus specific researched findings (e.g. sub-tick input timing vs. the
   64Hz world-simulation tick rate) that shouldn't need re-deriving.
4. **`services/watcher/sync_pipeline.py`** — skim this after the three docs
   above, since several fixes and findings reference specific line numbers
   and function names in this file directly (e.g. the `dmg_health`-summing
   sites at lines 281, 901, and 1288; the `parse_event()` wrapper added to
   fix a silent-data-loss bug).
5. **`IDEAS.md`** (repo root) — original feature/metric ideas not yet
   scoped into `NEXT_STEPS.md`. Check before proposing a "new" idea that
   might already be recorded here.

## If the task involves frontend work

Also read **`frontend/CLAUDE.md`** — separate conventions specific to that
part of the codebase, not covered by anything above.

## These files are autosaved, not periodically cleaned up

Every file listed above must be updated **in the same turn** as any research
finding or fix, not batched for later:

- New CS2 metric researched → add it to `CS2_ANALYTICS_STANDARDS.md`
  immediately, in the existing format, and re-slot the master
  Can-Do/Must-Build/Not-Allowed index.
- Bug found and fixed → update `NEXT_STEPS.md`'s "Completed" section with a
  real before/after, and correct (don't just append to) any existing item
  whose scope turns out to have been overstated.
- New field/event/engine behavior confirmed → add it to
  `DEMOPARSER2_FIELDS.md` immediately.
- New durable research/planning doc created → add it to the required-reading
  list above, in the same pass.

This file and everything it points to is only useful if a new session can
trust it completely without re-deriving anything. A stale doc is worse than
no doc, because it creates false confidence that "reading everything" was
done when it wasn't. Treat every update above like autosave — the user
should never have to ask for these files to be brought current.
