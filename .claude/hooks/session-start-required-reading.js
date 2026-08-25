#!/usr/bin/env node
// SessionStart hook: force-injects the content of RoundSync's required-reading
// docs into context at the start of every session, instead of just instructing
// a future session to go read them. This exists because a real session read
// AI_CONTEXT.md's required-reading list, then skipped 2 of the 4 files on it
// anyway (services/watcher/CS2_ANALYTICS_STANDARDS.md and DEMOPARSER2_FIELDS.md)
// for an entire audit pass, working off a summary instead of the source — a
// written instruction alone was proven insufficient. See the memory file
// feedback_read_all_memory_first.md for the full incident.
//
// Deliberately scoped to these 4 docs, not the whole ~/.claude memory folder or
// sync_pipeline.py: those are already covered by other mechanisms (memory's own
// auto-load + the hard-rule note at the top of MEMORY.md; AI_CONTEXT.md itself
// only asks to "skim" sync_pipeline.py, not read it whole), and injecting
// everything every session would add real, ongoing token cost for content that
// mostly doesn't change turn to turn. This hook targets exactly the files that
// were proven to get skipped.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const REQUIRED_FILES = [
  "AI_CONTEXT.md",
  "NEXT_STEPS.md",
  "services/watcher/CS2_ANALYTICS_STANDARDS.md",
  "services/watcher/DEMOPARSER2_FIELDS.md",
];

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

context += "=== END REQUIRED READING ===";

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  })
);
