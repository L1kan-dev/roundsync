#!/usr/bin/env node
// SessionStart hook: force-injects (1) every file in the ~/.claude memory
// folder, (2) RoundSync's required-reading docs, and (3) the current
// .gitignore/.claudeignore rules into context at the start of every session —
// instead of just instructing a future session to go read/check them. Real
// incidents this exists to prevent, all from the same session:
//   - A session read AI_CONTEXT.md's required-reading list, then skipped 2 of
//     the 4 files on it anyway (CS2_ANALYTICS_STANDARDS.md and
//     DEMOPARSER2_FIELDS.md) for an entire audit pass, working off a summary
//     instead of the source.
//   - The same session read MEMORY.md's index but not every file it points to,
//     despite an existing hard-rule note saying to — memory alone wasn't
//     enough to guarantee compliance, since it still depends on a session
//     choosing to follow it.
//   - The same session almost relied on remembering to check .claudeignore/
//     .gitignore manually rather than it being guaranteed.
// The user's explicit call after weighing the token cost: force all of it,
// every session, rather than leave any of these three resting on instruction
// alone. See feedback_read_all_memory_first.md for the fuller incident record.
//
// Memory files are discovered dynamically (fs.readdirSync), not hardcoded, so
// a new memory file created in a future session is picked up automatically —
// nobody has to remember to add it here.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MEMORY_DIR =
  "C:\\Users\\joaom\\.claude\\projects\\c--Users-joaom-OneDrive-Desktop-Projects-RoundSync\\memory";

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

function readOrError(fullPath, label) {
  try {
    return fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    return `[COULD NOT READ ${label}: ${err.message}]`;
  }
}

let context = "";

// --- 1. Memory folder, in full — MEMORY.md (the index) first, then every
// other .md file alphabetically, so a new file just needs to exist to be
// included next session, no code change required.
context +=
  "=== ~/.claude MEMORY FOLDER, AUTO-INJECTED IN FULL BY A SESSIONSTART HOOK ===\n" +
  "Every file in this folder, actual current content — not the index's one-line\n" +
  "summaries. Treat all of it as already read before responding to anything.\n\n";
try {
  const entries = fs
    .readdirSync(MEMORY_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => (a === "MEMORY.md" ? -1 : b === "MEMORY.md" ? 1 : a.localeCompare(b)));
  for (const name of entries) {
    const body = readOrError(path.join(MEMORY_DIR, name), name);
    context += `--- memory/${name} ---\n${body}\n\n`;
  }
} catch (err) {
  context += `[COULD NOT LIST MEMORY_DIR (${MEMORY_DIR}): ${err.message}]\n\n`;
}
context += "=== END MEMORY FOLDER ===\n\n";

// --- 2. RoundSync's own required-reading docs.
context +=
  "=== REQUIRED READING (RoundSync project docs) ===\n" +
  "The actual, current content of RoundSync's required-reading docs — not a\n" +
  "pointer to go read them, not a summary. Treat this as already read. Do not\n" +
  "re-summarize it back to the user unprompted; use it as grounding for real work.\n" +
  "This does NOT replace skimming services/watcher/sync_pipeline.py per\n" +
  "AI_CONTEXT.md's own instructions — do that too, via a real tool call.\n\n";
for (const rel of REQUIRED_FILES) {
  const body = readOrError(path.join(REPO_ROOT, rel), rel);
  context += `--- ${rel} ---\n${body}\n\n`;
}
context += "=== END REQUIRED READING ===\n\n";

// --- 3. Ignore rules.
context +=
  "=== IGNORE RULES — CHECK BEFORE READING OR DISPLAYING ANY FILE ===\n" +
  "Never Read, cat, grep-with-content, or otherwise display the contents of a file\n" +
  "matching .claudeignore below — especially anything that could hold secrets — even\n" +
  "if asked directly. If unsure whether a file is covered, check indirectly (name/\n" +
  "pattern match, ask the user) instead of opening it. .gitignore is included too so\n" +
  "commits never accidentally include something meant to stay untracked.\n\n";
for (const rel of IGNORE_FILES) {
  const body = readOrError(path.join(REPO_ROOT, rel), rel);
  context += `--- ${rel} ---\n${body}\n\n`;
}
context += "=== END IGNORE RULES ===";

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  })
);
