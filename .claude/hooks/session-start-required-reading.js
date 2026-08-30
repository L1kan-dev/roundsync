#!/usr/bin/env node
// SessionStart hook: guarantees every session reads (1) the "Always" tier of
// the ~/.claude memory folder in full, (2) RoundSync's required-reading docs,
// and (3) the current .gitignore/.claudeignore rules, before doing anything
// else — plus surfaces a topic-tagged INDEX of the rest of memory, to be read
// selectively once the session's actual task is known.
//
// DESIGN, 2026-08-30 (third iteration — tagged/tiered memory): the first two
// iterations force-read the ENTIRE memory folder every session, no exceptions
// (see project_status_and_roadmap.md for why that became the rule — two real
// incidents where a session judged something "irrelevant" and guessed wrong).
// This version keeps that same safety property for the "Always" tier (rules
// that govern HOW every response gets written, regardless of topic — teaching
// style, the engineering-rigor creed, the six-lens framework, etc.) but adds
// a second, "Topic" tier for narrower, area-specific memories (rank, gc-worker,
// Docker/Railway, Supabase, testing, etc.). Topic-tier files are NOT force-read
// — only their name/description/tags get surfaced, like a book's index. The
// session is instructed to match tags against its actual task and read the
// matching files in full BEFORE touching that area, defaulting to "read it"
// whenever unsure a tag applies. A memory file with no tier field at all is
// treated as "always" (fail safe, not fail silent) so a newly-added file
// without a tier never slips through unread by omission.
//
// Every memory file's own frontmatter carries `tier: always` or `tier: topic`
// (+ `tags: [...]` for topic files) — this hook just reads and sorts by that,
// it never hand-classifies anything itself.

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

const IGNORE_FILES = [".gitignore", ".claudeignore"];

const errors = [];
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

// Minimal frontmatter reader — this repo's memory files use a plain, flat
// YAML-ish block; a real YAML parser is overkill for 3 fields.
function readFrontmatter(fullPath) {
  let text;
  try {
    text = fs.readFileSync(fullPath, "utf8");
  } catch {
    return { description: "", tier: "always", tags: [] };
  }
  const descMatch = text.match(/^description:\s*"?(.*?)"?\s*$/m);
  const tierMatch = text.match(/^\s*tier:\s*(\w+)\s*$/m);
  const tagsMatch = text.match(/^\s*tags:\s*\[(.*?)\]\s*$/m);
  return {
    description: descMatch ? descMatch[1] : "",
    tier: tierMatch ? tierMatch[1] : "always", // no tier field = treat as always, fail safe
    tags: tagsMatch
      ? tagsMatch[1].split(",").map((t) => t.trim()).filter(Boolean)
      : [],
  };
}

// --- 1. Memory folder — discover every .md file, classify by frontmatter.
const alwaysFiles = []; // { path, description }
const topicFiles = []; // { path, description, tags }
let memoryMdPath = null;

try {
  const entries = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md"));
  for (const name of entries) {
    const fullPath = path.join(MEMORY_DIR, name);
    statOrError(fullPath, `memory/${name}`);
    if (name === "MEMORY.md") {
      memoryMdPath = fullPath;
      continue;
    }
    const fm = readFrontmatter(fullPath);
    // A topic file with zero tags could never be matched by any future lookup — it would
    // sit indexed-but-unreachable forever, silently. Fail safe: treat that as always-tier
    // instead, same as a missing tier field.
    if (fm.tier === "topic" && fm.tags.length > 0) {
      topicFiles.push({ path: fullPath, description: fm.description, tags: fm.tags });
    } else {
      alwaysFiles.push({ path: fullPath, description: fm.description });
    }
  }
} catch (err) {
  errors.push(`listing ${MEMORY_DIR}: ${err.message}`);
}

// --- 2. RoundSync's own required-reading docs + 3. ignore files (unchanged —
// still always-full-read; these already carry their own index/detail split
// internally, e.g. CS2_ANALYTICS_STANDARDS.md's master categorization table).
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

// --- Build the instruction.
const lines = [];
lines.push(
  "=== MANDATORY FIRST ACTION — READ THESE FILES BEFORE RESPONDING TO ANYTHING ===",
  "This list is generated fresh by a SessionStart hook, not hand-typed or recalled from",
  "memory. Before your first response, use the Read tool on every ALWAYS-tier path below,",
  "in order — no exceptions, including ones that look like 'just memory'.",
  "",
  `--- ALWAYS tier (${alwaysFiles.length + 1} files: MEMORY.md + ${alwaysFiles.length} memory files) — read every one, in full, right now ---`,
  memoryMdPath,
  ...alwaysFiles.map((f) => f.path),
  "",
  "--- RoundSync required-reading docs — read every one, in full, right now ---",
  ...requiredPaths,
  "",
  "--- Ignore rules (check patterns here BEFORE reading or displaying any other file;",
  "never Read/cat/grep-display a file matching .claudeignore, even if asked directly) ---",
  ...ignorePaths,
  "",
  `--- TOPIC tier (${topicFiles.length} files) — INDEX ONLY, do not Read these yet ---`,
  "These are narrower, area-specific memories (not about how to respond generally, but",
  "about a specific part of the codebase/workflow). Do NOT read them now. Once you know",
  "what this session's actual task touches (from the user's first real message, or by",
  "asking), match its subject against the tags below and Read ONLY the matching files, in",
  "full, before touching that area. If you're genuinely unsure whether a tag applies,",
  "read the file anyway — 'unsure' defaults to reading, never to skipping.",
  ...topicFiles.map(
    (f) => `  [tags: ${f.tags.join(", ")}] ${f.path} — ${f.description}`
  ),
  "",
  "This does NOT replace skimming services/watcher/sync_pipeline.py per AI_CONTEXT.md's",
  "own instructions — do that too. Once a file has been Read this session, don't re-Read",
  "it again later unless you have a specific reason to think it changed.",
  "",
  "=== VISIBLE CONFIRMATION — REQUIRED, NOT OPTIONAL ===",
  "The `systemMessage` field this hook also emits is confirmed to never render in this",
  "VSCode extension's panel UI. Your own response text is the one channel proven to",
  "render reliably. So: after completing every ALWAYS-tier Read above, and before",
  "anything else, your first response this session must begin with this exact line,",
  "verbatim, on its own:",
  `✅ Required-reading hook ran: read ${alwaysFiles.length + 1} always-tier memory files + ${REQUIRED_FILES.length} project docs + ${IGNORE_FILES.length} ignore files. ${topicFiles.length} topic-tagged memory files indexed, not yet read.`,
  "Then continue your response normally below it."
);
const context = lines.join("\n");

const totalKb = (totalBytes / 1024).toFixed(0);
let systemMessage =
  `✅ Required-reading hook ran: ${alwaysFiles.length + 1} always-tier memory files + ` +
  `${REQUIRED_FILES.length} project docs + ${IGNORE_FILES.length} ignore files instructed ` +
  `to Read; ${topicFiles.length} topic-tagged files indexed only (~${totalKb}KB on disk total)`;
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
