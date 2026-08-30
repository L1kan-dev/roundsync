# Local Multi-Agent Dev Team Experiment — SUPERSEDED, 2026-08-28

**This experiment is over. Do not resume it.** Everything below is kept only as a
historical record of what was learned. The user decided (2026-08-28, same night)
that mixing "make the agent framework work" with "RoundSync's own backlog items"
was slowing both down — the agent framework needs to be built and proven on its
own, in a completely separate project, before ever touching a RoundSync copy again.

`D:\RoundSync-AgentExperiment\` has been wiped back down to just `ollama\` (the
app) and `models\` (the downloaded Qwen3-Coder-Next weights) — every hand-written
script (`planner.py`, `run_agent_team.py`, `converse.py`, the CrewAI attempt, the
live viewer, etc.) and the sandboxed RoundSync copy itself were deleted. The real,
hard-won lessons from all of it (context isolation, mechanical validation instead
of trusting the model, the notebook/scratchpad pattern, CrewAI's guardrails) carry
forward into the new project's kickoff prompt instead of this file.

**Not part of RoundSync's required reading.** Safe to ignore. Kept in this repo
(not just chat memory) purely as a record of the research trail, in case the new
project's own docs ever need to reference why a particular approach was ruled out.

---

## The idea, in one sentence

Run a real, working local multi-agent "dev team" (Coder / Auditor / Researcher /
Logger agents, powered by a free local LLM) on an isolated copy of RoundSync, in
parallel with normal Claude-Code-driven RoundSync development — then compare what
the local team produces against real work, as an actual empirical test rather than
a theoretical one.

## How this idea got here (context, in order)

1. Earlier the same session: a **theoretical, math-only** exercise (explicitly
   scoped that way by the user — "I do not want you to actually build multiple
   agents, this is theoretical and mathematic") concluded that a *cloud/token-based*
   multi-agent team costs MORE tokens than one disciplined Claude Code session for
   routine work — matches Anthropic's own published guidance. That conclusion was
   specifically about paying per-token for multiple cloud agents, not about a free
   local setup — a genuinely different tradeoff.
2. The user shared a Gemini conversation (link inaccessible via WebFetch — Google's
   share pages render client-side, same class of problem as the earlier YouTube
   Shorts issue) proposing a **local, free, private** multi-agent team: Ollama +
   open-weight models + a framework like CrewAI/Roo Code, connected to real
   cloud services (Supabase/Railway/GitHub) via MCP servers.
3. Independent research (not just reviewing Gemini's answers) found:
   - Claude Code itself deliberately does NOT use RAG/codebase-indexing — it uses
     live grep + read + prompt caching, which is the better fit for a repo
     RoundSync's size. (Answers the user's original "how do I stop tanking my
     context" question — already solved this session via the NEXT_STEPS.md /
     CS2_ANALYTICS_STANDARDS.md doc-splitting work, not by any new tool.)
   - Local models genuinely never send prompt data anywhere — the privacy framing
     was accurate.
   - **Caught and corrected a fabricated benchmark claim mid-research**: a search
     summary claimed a Qwen model beats Claude Sonnet on SWE-bench. Verified
     directly against the primary source (arXiv paper, Table 3) instead of trusting
     the summary — the real numbers show Claude Sonnet 4.5 at 76.0% vs.
     Qwen3-Coder-Next at 70.6% on SWE-bench Verified. Local models have closed a
     lot of ground but are still behind, especially against the *current* Claude
     generation (the paper's comparison was to the previous one).
   - Checked "Meta's LLM" (Llama 4) as an alternative — real model, but a worse
     fit than Qwen3-Coder-Next for this specific job: independently confirmed to
     underperform its own predecessor (Llama 3) at coding tasks, and its
     17B-active-parameters-per-token (vs. Qwen3-Coder-Next's 3B) makes it both
     larger on disk AND slower to run on the same hardware.
4. Real hardware check (not assumed): AMD RX 7900 XT, confirmed **20GB VRAM** via
   `dxdiag` (Windows' own device-manager-style VRAM figure is capped at 4GB by a
   32-bit field — don't trust that number, always check dxdiag's real figure), 32GB
   system RAM, Ryzen 7 7700 (8-core/16-thread), 757GB free on C:, 1.3TB free on D:.
   This hardware is genuinely in the "sweet spot" tier for a 27B-32B class model.
5. User confirmed: build it for real, on a copy of RoundSync, as a genuine parallel
   A/B track — "This is a REAL scenario that we can test."

## Key decisions made (all confirmed directly by the user, not assumed)

| Decision | Choice | Why |
|---|---|---|
| Data/service isolation | **Fully offline/mocked** — no live Supabase, no live Steam bot, no real network calls beyond localhost | Zero cost, zero risk to real production data; user's explicit pick over "spin up a separate free Supabase project" |
| First target task | **Self-flash duration** (`NEXT_STEPS.md` Tier 5 — the data already exists in `blind_df` inside `extract_fact_utility_throw`, currently thrown away via `continue`) | Small, already-scoped, well-specified — a fair test task, independent of whatever real work happens in parallel |
| Model | **Qwen3-Coder-Next** (`qwen3-coder-next:q4_K_M`, 52GB) | The one model actually fact-checked against its own paper (70.6% SWE-bench Verified, primary source verified) — real MoE architecture, only 3B of 80B parameters active per token, better fit for this hardware than a dense model of similar quality |
| Framework | **CrewAI** (not yet installed) | Fastest path to a real working multi-agent prototype per current (2026) framework research; LangGraph and Microsoft's new Agent Framework are more "serious/robust" alternatives if CrewAI turns out limiting |
| Everything isolated to D: drive | `D:\RoundSync-AgentExperiment\` | User's explicit request — keep all installs/downloads off C: and out of OneDrive's sync scope |

## Infrastructure — exact current state, verified not assumed

- **Sandbox copy of RoundSync**: `D:\RoundSync-AgentExperiment\RoundSync-AgentTeam`
  - Copied from the real repo via `robocopy`, excluding `node_modules`, `venv`,
    `.next`, `__pycache__`, and every real secret file (`.env`, `.env.local`,
    `services/api/.env`, `*.pem`, `*.key`) — verified zero secrets landed in the
    copy.
  - Given its own **independent git history**, starting from one baseline commit:
    `8714789` — "Baseline: sandboxed snapshot of RoundSync, copied for the local
    multi-agent experiment." Anything after this commit in that repo is the local
    agent team's own work, cleanly diffable from this exact starting point.
  - Originally created under `C:\...\OneDrive\Desktop\Projects\RoundSync-AgentTeam`,
    then moved to the current D: path — the move hit a real snag (OneDrive file
    locks blocked deleting some now-empty source folders after the copy succeeded)
    but the data itself moved cleanly; verified via file count + git log after the
    fact, then cleaned up the leftover empty shell at the old path.
- **Ollama**: installed to `D:\RoundSync-AgentExperiment\ollama\ollama.exe`,
  version 0.33.1. Installed **silently** (no GUI interaction needed) after an
  earlier attempt left two conflicting installer processes running at once (one
  targeting the default C: path, one targeting D:) — both were found and stopped
  cleanly before the final, correct silent install ran to completion (exit code 0).
- **Model storage location**: `OLLAMA_MODELS` environment variable set persistently
  (User scope) to `D:\RoundSync-AgentExperiment\models` — confirmed models will
  land there, not the default C: user folder.
- **Model download**: `qwen3-coder-next:q4_K_M` — **DONE.** Completed cleanly
  (exit code 0), verified present via `ollama list` (51GB, ID `ca06e9e4087c`).
- **Python environment for the agent framework**: **not started yet.**
- **CrewAI**: **not installed yet.**
- **Agent definitions (Coder/Auditor/Researcher/Logger)**: **not written yet.**
- **Task handoff to the agent team**: **not started yet.**

## Standing rule for this experiment (learned the hard way this session)

The user explicitly corrected this twice: **check in and explain before every
real action that touches the actual system** (installs, downloads, launching
processes) — not just before starting a new phase of work. Agreeing to the
experiment's overall scope is not a standing green light for each individual step
inside it. Reversible/observational things (reading files, checking status,
researching) are fine to just do; anything that installs software, starts a
download, or launches a real process needs an explicit "here's what I'm about to
do, go ahead?" first. This is now saved as a standing memory rule
(`feedback_checkin_then_ask_to_continue.md`), not just noted here.

Also standing as of 2026-08-28 night: **do nothing on this experiment beyond
letting the current download finish** until the user is back — no Python/CrewAI
setup, no agent definitions, no kickoff — even though the plan for those steps is
fully written out above.

## BREAKTHROUGH (2026-08-28) — real, correct code written by the local model

After 6 straight failures, this worked: split into two small agent roles
instead of one large autonomous task.

- **Builder** (`ask_builder.py`, no tools at all, pure text generation):
  given a small, specific excerpt of the real function plus the exact
  change needed, asked to output only two labeled text blocks
  (`OLD_SNIPPET`/`NEW_SNIPPET`). Produced a correct, precisely-formatted
  answer on the first try, twice (once per sub-change).
- **Updater** (`converse.py`, has the new `replace_snippet` tool -- exact
  find/replace, no code understanding required, Claude's code is purely
  mechanical string substitution): given the Builder's two snippet pairs,
  called `replace_snippet` twice, correctly, using the exact text it was
  given. Confirmed via real `git diff` in the sandbox -- a clean, correct,
  minimal 2-line change to `extract_fact_utility_throw`, matching the file's
  existing style exactly.

**Root cause, confirmed rather than just theorized**: the model was never
unwilling or unable to write files -- it was avoiding a generation target
that was too large (regenerate an entire ~300-line file in one tool call).
Once the task was split into pieces small enough to output confidently, it
worked immediately, on the first attempt, both times.

**Coordination cost for this successful path**: ~13,700 characters total
across all prompts + responses (~3,400 tokens estimated) -- 4 separate local
model calls (2 Builder, 1 Updater handling both changes, plus the diagnostic
that found the pattern).

**Update — full pipeline now proven, including a real bug catch.** Ran the
same small-target Researcher role (this time genuinely locating the right
code itself, not using excerpts Claude pre-identified) against a second,
independent task: HLTV's 1.1s minimum flash-assist threshold. It correctly
found the exact right line out of the whole ~150-line function and produced
a correct fix — confirming the "keep output small" principle generalizes
beyond one lucky case.

Then ran an Auditor role against the real combined diff. **Real, honest
result**: Claude independently found a genuine bug first (`self_blind_duration`
missing from the per-throw reset block — either crashes with
`UnboundLocalError` on a match's first non-flashbang throw, or silently
leaks a stale value from an earlier throw into a later one's row). The
Auditor agent then independently caught the same bug on its own — correct
verdict, though its stated reasoning had a factual error (said the variable
"was declared as None earlier," which wasn't true). Right answer, not-quite-
right reasoning — worth being precise about rather than just calling it a
clean pass.

Fixed the bug the same way (Builder produces the 1-line reset fix, Updater
applies it via `replace_snippet`). Confirmed via `git diff` and
`py_compile` — the file is valid Python and all three real changes are
present and correct.

**Total coordination cost for the full successful run**: ~32,100 characters
across all prompts + responses (~8,000 tokens estimated) — 3 real code
changes (self-flash capture, flash-assist threshold, the bug fix), one
independently-caught real bug, roughly 9 local-model calls total.

**The actual, complete verdict**: a local model that cannot reliably write
a whole file in one shot can reliably plan AND apply AND get audited on
real, correct, multi-step code changes — when the architecture keeps every
individual generation target small. That's the real, working answer this
whole experiment was built to find.

## Parked idea, not implemented (2026-08-28) — Claude must not do the coding

Working theory after 6 straight failures (see "Real result, v2 first full
completion" below): the model never once attempted a `write_file` call with
the complete ~300-line file, but happily generated small code snippets
inside its commentary. Theory: writing the ENTIRE file in one shot is too
large/hard a generation target, so the model avoids committing to it,
defaulting to easier conversational text instead.

**Rejected approach**: Claude writes a Python tool that takes just the new
function body and does the file splice itself (find the function, replace
it, keep the rest byte-identical). **User's explicit correction**: this
counts as Claude doing the coding, which is against the whole point of the
experiment. Not implemented.

**Approved direction instead**: split into two agent roles, both still done
by the local model — a "Builder" that produces just the small changed
snippet (a short generation target), and an "Updater" that applies it to the
real file via a generic, domain-agnostic tool (e.g. exact-text find/replace,
where the AGENT supplies both the old and new text — Claude's only code is
the mechanical string substitution, not deciding what changes). Testing this
next.

## Fairness rule, stated directly by the user (2026-08-28)

"If they can't search, you can't either. It must be fair." If Claude Code
does the same task (self-flash duration, or anything else being compared
against the agent team's output) in the real repo for comparison purposes,
no WebSearch/WebFetch during that work — matching the agent team's own
offline-only tool access. Doesn't restrict unrelated research the user asks
for outside of a head-to-head comparison.

## Tooling additions after further live testing (2026-08-28)

- **`URLReadTool` added to the Researcher only** — a free, no-API-key tool
  (confirmed by calling it directly against a real URL before adding it),
  fetches a specific URL's real text content. No search engine — the model
  can't look something up by keyword, only fetch a URL it already knows.
  Added after the user first asked "is there real risk to giving it
  WebFetch," got a real risk assessment (low, since the write tool stays
  sandbox-locked either way), then said to just do what's best at $0 cost.
- **Fixed a real gap, not just a bug**: the Researcher tried to read
  `CS2_ANALYTICS_STANDARDS.md` at the sandbox root and got a clean "file not
  found" (the tool handled this correctly — this wasn't the earlier
  path-safety bug). Real cause: that file is genuinely relevant to self-flash
  duration (it documents the metric's real legal/definitional status) but was
  never named in the task at the correct path
  (`services/watcher/CS2_ANALYTICS_STANDARDS.md`). Added to the task
  description with the right path.

## Real result, v2 first full completion (2026-08-28) — diagnosed, not just noted

The crew ran end-to-end with all infrastructure bugs fixed and finished
"successfully" (Crew Execution Completed) -- but produced **zero real file
changes**. Confirmed via `git status`/`git diff` in the sandbox: no code
edit, no `AGENT_LOG.md`, no `NEXT_STEPS.md` update, despite every task being
marked complete and the Logger's final answer reading like a confident
project-status summary.

**Root cause, found by reading the Coder's actual response, not just its
completion status**: given a complex, open-ended task ("implement this
change matching existing style, handle edge cases"), the model defaulted to
its dominant training pattern -- a conversational **code review** of the
whole file (praise, suggestions, hypothetical example functions, "would you
like me to help with X?") -- instead of actually writing the change. It
never called its write tool once. The Auditor then built on that
disconnected context and drifted further off-task itself, eventually
producing a fully fictional "ship v1.1 / Pistol KAST / TTFS" product-roadmap
conversation with zero connection to the real task.

**Isolated diagnostic run** (`diagnose_write.py`, a single trivial task:
"write this exact text to this exact file, now, no explanation first")
confirmed the model CAN call its write tool correctly -- it's not a
fundamental incapacity. This is a task-complexity threshold problem: simple
+ explicit = acts; complex + open-ended = talks instead of acting.

**Fix applied**: `code_task` and `log_task` rewritten with the same forceful,
action-first framing that worked in the diagnostic ("CALL YOUR WRITE TOOL,
not to describe or review code... do this now"). Same rule added to the
shared `TOOL_USAGE` block for every agent. Retrying now.

## Live run — v2, in progress

First run (v1 agents) was stopped almost immediately after starting: the user
caught a real fairness gap — the agents only had the narrow task docs
(`NEXT_STEPS.md`, `DEMOPARSER2_FIELDS.md`, the source file), not RoundSync's
actual standing engineering rules (never assume/verify, comprehensive not
partial, no incomplete fallbacks, validate semantics not just math, precision
over rounding, the 6-lens audit framework, keep-docs-autosaved). That's not a
fair test of the architecture — it's just "team with the rulebook vs. team
without it." Fixed: `D:\RoundSync-AgentExperiment\run_agent_team.py` now bakes
a condensed version of those real rules (code-quality ones only — not the
human-teaching-style rules, since there's no human here to teach) into every
agent's backstory, and the Researcher now also reads the sandbox's own
`CLAUDE.md`/`AI_CONTEXT.md` first. Sandbox was confirmed clean (only a stray
log file, no real agent-made changes) before the restart.

**Currently running** (v2 agents), launched in a visible PowerShell window
that also mirrors output to `RoundSync-AgentTeam\run_log.txt` (note: that log
file's box-drawing/emoji characters get corrupted by a Windows console
encoding quirk when piped — cosmetic only, doesn't affect the actual run; the
live window renders normally, and the real deliverables — the code edit,
`AGENT_LOG.md`, the `NEXT_STEPS.md` update — get written directly as clean
files, not through that same corrupted path).

## The actual goal, clarified (2026-08-28) — important, don't misread this again

Claude initially answered "should this replace real RoundSync development"
and got corrected directly: the user never asked that, and never intends to
build RoundSync production features through this pipeline unsupervised.
**The real goal**: build a genuinely working local multi-agent capability,
mirroring what Anthropic's own paid multi-agent Workflows feature offers,
self-hosted and free because the user can't pay for the cloud version. The
user is still using Claude Code for real RoundSync work -- this is a
separate, parallel capability, not a replacement. Don't re-litigate "is this
good for production" -- that was never the actual question.

**Real verdict on the actual question**: yes, achievable, and proven working
tonight -- a free, private, local pipeline that plans, writes, and audits
real correct code (see the BREAKTHROUGH section above: 3 real changes, 1
real bug independently caught).

**The one real gap left**: Claude has been doing the task decomposition by
hand (breaking a task into small enough pieces) for every step tonight --
that part isn't automated yet. **Next real build, agreed with the user**: a
"Planner" agent role, running on the local model, whose job is to take a
bigger task and break it into the same kind of small, bounded steps Claude
has been hand-crafting -- so the loop stops needing Claude in the middle.

## Next steps, in order, once resumed (none of these start automatically)

1. Confirm the Qwen3-Coder-Next download finished cleanly (`ollama list` should
   show it).
2. Set up a Python virtual environment inside
   `D:\RoundSync-AgentExperiment\` (kept separate from RoundSync's own `venv`,
   same isolation principle used for `yt-dlp` earlier this session).
3. `pip install crewai` (and whatever else CrewAI needs) inside that venv.
4. Write the four agent definitions (Coder, Auditor, Researcher, Logger), grounded
   in the sandbox copy's own `AI_CONTEXT.md`/`CLAUDE.md` so they start from
   equivalent context to what a real Claude Code session gets, pointed at the local
   Qwen3-Coder-Next model via Ollama's local API (`http://localhost:11434`), with
   filesystem tools scoped ONLY to `D:\RoundSync-AgentExperiment\RoundSync-AgentTeam`
   — no real network, no Supabase, no GitHub, per the fully-offline decision above.
5. Hand the crew the self-flash-duration task, exactly as scoped in the real
   `NEXT_STEPS.md` Tier 5 entry.
6. Let it run; the Logger agent keeps its own record of what happened.
7. Whenever the user wants: check what the local team actually produced, compare
   against real judgment, decide if/how this experiment continues.
