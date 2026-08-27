#!/usr/bin/env node
// SessionStart hook: guarantees every session reads (1) every file in the
// ~/.claude memory folder, (2) RoundSync's required-reading docs, and (3) the
// current .gitignore/.claudeignore rules, before doing anything else.
//
// IMPORTANT DESIGN NOTE (2026-08-26, second iteration): the first version of
// this hook tried to embed all of that content directly into
// hookSpecificOutput.additionalContext (~167KB / ~42,800 tokens combined).
// That doesn't work reliably. Confirmed via raw session logs across multiple
// real sessions: once a hook's output exceeds some size threshold, the
// harness silently truncates additionalContext to roughly a 2KB preview and
// persists the rest to a tool-results/*-additionalContext.txt file — meaning
// the model only reliably sees a couple KB, not the full content, unless it
// separately chooses to go Read that persisted file itself (inconsistent —
// some sessions did, most didn't, and none were told to). Every symptom this
// was built to prevent (skipping memory files, re-reading AI_CONTEXT.md
// manually, no visible confirmation) traced back to this truncation, not to
// the model ignoring content it actually had.
//
// Fix: additionalContext now stays tiny — just an explicit, ordered list of
// absolute file paths plus an instruction to Read every one of them, as the
// first action of the session, via the real Read tool. Real Read calls are
// the one delivery mechanism that's actually proven reliable in every session
// checked. This hook's job is to make the instruction to do that
// unmissable and mechanically generated (never hand-typed, never stale), not
// to smuggle the content in itself.
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
  "IDEAS.md",
  "services/watcher/CS2_ANALYTICS_STANDARDS.md",
  "services/watcher/DEMOPARSER2_FIELDS.md",
];

// Both small, both safety-critical, both easy to forget to check — same failure
// class as the required-reading docs above, just for "don't touch/expose this"
// instead of "use this as context." See feedback_secrets_handling.
const IGNORE_FILES = [".gitignore", ".claudeignore"];

const errors = []; // human-readable, for the visible banner
let totalBytes = 0;

function statOrError(fullPath, label) {
  try {
    const size = fs.statSync(fullPath).size;
    totalBytes += size;
    return size;
  } catch (err) {
    errors.push(`${label}: ${err.message}`);
    return null;
  }
}

// --- 1. Memory folder — discover every .md file, MEMORY.md first.
const memoryPaths = [];
try {
  const entries = fs
    .readdirSync(MEMORY_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => (a === "MEMORY.md" ? -1 : b === "MEMORY.md" ? 1 : a.localeCompare(b)));
  for (const name of entries) {
    const fullPath = path.join(MEMORY_DIR, name);
    statOrError(fullPath, `memory/${name}`);
    memoryPaths.push(fullPath);
  }
} catch (err) {
  errors.push(`listing ${MEMORY_DIR}: ${err.message}`);
}

// --- 2. RoundSync's own required-reading docs + 3. ignore files — verify
// existence/size now (so the banner can report real errors), build absolute
// paths for the instruction list.
const requiredPaths = REQUIRED_FILES.map((rel) => {
  const fullPath = path.join(REPO_ROOT, rel);
  statOrError(fullPath, rel);
  return fullPath;
});
const ignorePaths = IGNORE_FILES.map((rel) => {
  const fullPath = path.join(REPO_ROOT, rel);
  statOrError(fullPath, rel);
  return fullPath;
});

// --- Build the small, guaranteed-to-survive instruction.
const lines = [];
lines.push(
  "=== MANDATORY FIRST ACTION — READ THESE FILES BEFORE RESPONDING TO ANYTHING ===",
  "This list is generated fresh by a SessionStart hook, not hand-typed or recalled from",
  "memory. Before your first response, use the Read tool on every path below, in order.",
  "Do not summarize this list back to the user unprompted; use it as grounding for real",
  "work. Do not skip any entry, including ones that look like they're 'just memory' —",
  "each one carries a standing instruction from a real past incident.",
  "",
  `--- ~/.claude memory folder (${memoryPaths.length} files, MEMORY.md first) ---`,
  ...memoryPaths,
  "",
  "--- RoundSync required-reading docs ---",
  ...requiredPaths,
  "",
  "--- Ignore rules (check patterns here BEFORE reading or displaying any other file;",
  "never Read/cat/grep-display a file matching .claudeignore, even if asked directly) ---",
  ...ignorePaths,
  "",
  "This does NOT replace skimming services/watcher/sync_pipeline.py per AI_CONTEXT.md's",
  "own instructions — do that too. Once a file above has been Read this session, don't",
  "re-Read it again later unless you have a specific reason to think it changed.",
  "",
  "=== VISIBLE CONFIRMATION — REQUIRED, NOT OPTIONAL ===",
  "The `systemMessage` field this hook also emits is confirmed (2026-08-26, by direct",
  "user report across multiple real sessions) to never render in this VSCode extension's",
  "panel UI, even though it's generated correctly — so the user has no way to see it.",
  "Your own response text is the one channel proven to render reliably. So: after",
  "completing every Read above, and before anything else, your first response this",
  "session must begin with this exact line, verbatim, on its own:",
  `✅ Required-reading hook ran: read ${memoryPaths.length} memory files + ${REQUIRED_FILES.length} project docs + ${IGNORE_FILES.length} ignore files.`,
  "Then continue your response normally below it."
);
const context = lines.join("\n");

// --- systemMessage kept for completeness/log-grepping (confirmed 2026-08-26 to
// not actually render in this VSCode extension's panel UI — see the in-context
// instruction above, which is the real, working substitute). Every number here
// is counted live by this script, right now.
const totalKb = (totalBytes / 1024).toFixed(0);
let systemMessage =
  `✅ Required-reading hook ran: instructed to Read ${memoryPaths.length} memory files + ` +
  `${REQUIRED_FILES.length} project docs + ${IGNORE_FILES.length} ignore files ` +
  `(~${totalKb}KB on disk)`;
if (errors.length > 0) {
  systemMessage += `\n⚠️ ${errors.length} file(s) failed to stat: ${errors.join("; ")}`;
}

console.log(
  JSON.stringify({
    systemMessage,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  })
);
