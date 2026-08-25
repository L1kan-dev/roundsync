#!/usr/bin/env node
// SessionStart hook: force-injects (1) the content of RoundSync's required-
// reading docs and (2) the current .gitignore/.claudeignore rules into context
// at the start of every session, instead of just instructing a future session
// to go check them. Two real incidents this exists to prevent:
//   - A session read AI_CONTEXT.md's required-reading list, then skipped 2 of
//     the 4 files on it anyway (CS2_ANALYTICS_STANDARDS.md and
//     DEMOPARSER2_FIELDS.md) for an entire audit pass, working off a summary
//     instead of the source. See feedback_read_all_memory_first.md.
//   - The same session almost relied on remembering to check .claudeignore/
//     .gitignore manually rather than it being guaranteed — the user asked for
//     it to be folded into this same hook instead of trusted to memory.
//
// Deliberately does NOT force-inject the whole ~/.claude memory folder or
// sync_pipeline.py: those are already covered by other mechanisms (memory's own
// auto-load + the hard-rule note at the top of MEMORY.md; AI_CONTEXT.md itself
// only asks to "skim" sync_pipeline.py, not read it whole), and injecting
// everything every session would add real, ongoing token cost for content that
// mostly doesn't change turn to turn. This hook targets exactly what was proven
// to get skipped or risked being left to memory alone.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const REQUIRED_FILES = [
  "AI_CONTEXT.md",
  "NEXT_STEPS.md",
  "services/watcher/CS2_ANALYTICS_STANDARDS.md",
  "services/watcher/DEMOPARSER2_FIELDS.md",
];

// Both small, both safety-critical, both easy to forget to check — same failure
// class as the required-reading docs above, just for "don't touch/expose this"
// instead of "use this as context." Injected so a session never has to remember
// to check them before reading or displaying a file; see feedback_secrets_handling.
const IGNORE_FILES = [".gitignore", ".claudeignore"];

let context =
  "=== REQUIRED READING, AUTO-INJECTED BY A SESSIONSTART HOOK ===\n" +
  "This is the actual, current content of RoundSync's required-reading docs — not a\n" +
  "pointer to go read them, not a summary. Treat this as already read. Do not\n" +
  "re-summarize it back to the user unprompted; use it as grounding for real work.\n" +
  "This does NOT replace reading the ~/.claude memory folder in full (see that\n" +
  "folder's own MEMORY.md hard-rule note) or skimming services/watcher/sync_pipeline.py\n" +
  "per AI_CONTEXT.md's own instructions — do both of those too, via real tool calls.\n\n";

for (const rel of REQUIRED_FILES) {
  const full = path.join(REPO_ROOT, rel);
  try {
    const body = fs.readFileSync(full, "utf8");
    context += `--- ${rel} ---\n${body}\n\n`;
  } catch (err) {
    context += `--- ${rel} ---\n[COULD NOT READ: ${err.message} — check this file still exists at this path]\n\n`;
  }
}

context +=
  "=== IGNORE RULES — CHECK BEFORE READING OR DISPLAYING ANY FILE ===\n" +
  "Never Read, cat, grep-with-content, or otherwise display the contents of a file\n" +
  "matching .claudeignore below — especially anything that could hold secrets — even\n" +
  "if asked directly. If unsure whether a file is covered, check indirectly (name/\n" +
  "pattern match, ask the user) instead of opening it. .gitignore is included too so\n" +
  "commits never accidentally include something meant to stay untracked.\n\n";

for (const rel of IGNORE_FILES) {
  const full = path.join(REPO_ROOT, rel);
  try {
    const body = fs.readFileSync(full, "utf8");
    context += `--- ${rel} ---\n${body}\n\n`;
  } catch (err) {
    context += `--- ${rel} ---\n[COULD NOT READ: ${err.message}]\n\n`;
  }
}

context += "=== END REQUIRED READING ===";

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  })
);
