#!/usr/bin/env node
// SessionStart hook: guarantees every session reads (1) the "Always" tier of
// the ~/.claude memory folder in full, (2) the "Always" tier of RoundSync's
// required-reading project docs, and (3) the current .gitignore/.claudeignore
// rules, before doing anything else — plus surfaces a topic-tagged INDEX of
// everything else (both memory files and project docs), to be read
// selectively once the session's actual task is known.
//
// DESIGN, 2026-08-30 (fourth iteration — tiering extended to project docs):
// the third iteration tiered the memory folder but left RoundSync's own
// REQUIRED_FILES list untouched — every session force-read all 5 project
// docs regardless of topic, including two (CS2_ANALYTICS_STANDARDS.md,
// DEMOPARSER2_FIELDS.md) that are ONLY relevant to CS2-metric/demo-parsing
// work, the same class of unconditional over-reading the memory tiering was
// built to fix. Caught by the user directly. This version applies the same
// always/topic split to project docs. Project docs are plain markdown with
// no frontmatter (they're meant to read normally on GitHub too), so their
// tier/tags are declared in this script (PROJECT_DOCS_ALWAYS / _TOPIC)
// instead of being self-declared like memory files.
//
// Memory files still self-declare via `tier:`/`tags:` frontmatter (see the
// third-iteration comment history in engineering_standards.md for why: a
// memory file with no tier, or a topic file with zero tags, is treated as
// "always" — fail safe, not fail silent).

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MEMORY_DIR =
  "C:\\Users\\joaom\\.claude\\projects\\c--Users-joaom-OneDrive-Desktop-Projects-RoundSync\\memory";

// Orientation docs every session needs regardless of task — small, and the
// backlog/entry-point is relevant to almost all real RoundSync work.
const PROJECT_DOCS_ALWAYS = ["AI_CONTEXT.md", "NEXT_STEPS.md"];

// Narrower docs, only relevant when the session's task actually touches that
// area — same index-only treatment as topic-tier memory files.
const PROJECT_DOCS_TOPIC = {
  "IDEAS.md": {
    tags: ["ideas", "features", "brainstorm"],
    description: "Original feature/metric ideas not yet scoped into NEXT_STEPS.md — check before proposing a 'new' idea that might already be recorded.",
  },
  "services/watcher/CS2_ANALYTICS_STANDARDS.md": {
    tags: ["cs2-stats", "metrics", "analytics", "legal"],
    description: "~40 CS2 analytics metrics researched against real sources (Leetify/HLTV/FACEIT), what's legal to build, what's off-limits.",
  },
  "services/watcher/DEMOPARSER2_FIELDS.md": {
    tags: ["demoparser2", "watcher", "sync-pipeline", "data-extraction"],
    description: "Field/event reference for demoparser2, the library sync_pipeline.py is built on, plus researched engine-behavior findings.",
  },
};

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
const topicFiles = []; // { path, description, tags, kind }
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
      topicFiles.push({ path: fullPath, description: fm.description, tags: fm.tags, kind: "memory" });
    } else {
      alwaysFiles.push({ path: fullPath, description: fm.description });
    }
  }
} catch (err) {
  errors.push(`listing ${MEMORY_DIR}: ${err.message}`);
}

// --- 2. RoundSync's own required-reading docs, split the same way.
const projectDocsAlwaysPaths = PROJECT_DOCS_ALWAYS.map((rel) => {
  const fullPath = path.join(REPO_ROOT, rel);
  statOrError(fullPath, rel);
  return fullPath;
});
for (const [rel, meta] of Object.entries(PROJECT_DOCS_TOPIC)) {
  const fullPath = path.join(REPO_ROOT, rel);
  statOrError(fullPath, rel);
  topicFiles.push({ path: fullPath, description: meta.description, tags: meta.tags, kind: "project doc" });
}

// --- 3. Ignore files — unchanged, always-full-read.
const ignorePaths = IGNORE_FILES.map((rel) => {
  const fullPath = path.join(REPO_ROOT, rel);
  statOrError(fullPath, rel);
  return fullPath;
});

const totalAlwaysCount = alwaysFiles.length + 1 + projectDocsAlwaysPaths.length; // +1 = MEMORY.md

// --- Build the instruction.
const lines = [];
lines.push(
  "=== MANDATORY FIRST ACTION — READ THESE FILES BEFORE RESPONDING TO ANYTHING ===",
  "This list is generated fresh by a SessionStart hook, not hand-typed or recalled from",
  "memory. Before your first response, use the Read tool on every ALWAYS-tier path below —",
  "no exceptions, including ones that look like 'just memory'. These are independent reads;",
  "batch them into parallel tool calls rather than one at a time. 'Every path' means don't",
  "skip any, not 'read them strictly in sequence'.",
  "",
  `--- ALWAYS tier, memory (${alwaysFiles.length + 1} files: MEMORY.md + ${alwaysFiles.length} memory files) — read every one, in full, right now ---`,
  memoryMdPath,
  ...alwaysFiles.map((f) => f.path),
  "",
  `--- ALWAYS tier, RoundSync project docs (${projectDocsAlwaysPaths.length} files) — read every one, in full, right now ---`,
  ...projectDocsAlwaysPaths,
  "",
  "--- Ignore rules (check patterns here BEFORE reading or displaying any other file;",
  "never Read/cat/grep-display a file matching .claudeignore, even if asked directly) ---",
  ...ignorePaths,
  "",
  `--- TOPIC tier (${topicFiles.length} files, memory + project docs combined) — INDEX ONLY, do not Read these yet ---`,
  "These are narrower, area-specific files (not about how to respond generally, but about a",
  "specific part of the codebase/workflow). Do NOT read them now. Once you know what this",
  "session's actual task touches (from the user's first real message, or by asking), match",
  "its subject against the tags below and Read ONLY the matching files, in full, before",
  "touching that area. If you're genuinely unsure whether a tag applies, read the file",
  "anyway — 'unsure' defaults to reading, never to skipping.",
  ...topicFiles.map(
    (f) => `  [${f.kind}] [tags: ${f.tags.join(", ")}] ${f.path} — ${f.description}`
  ),
  "",
  "This does NOT replace skimming services/watcher/sync_pipeline.py per AI_CONTEXT.md's",
  "own instructions — do that too, when the task actually touches it. Once a file has been",
  "Read this session, don't re-Read it again later unless you have a specific reason to",
  "think it changed.",
  "",
  "=== VISIBLE CONFIRMATION — REQUIRED, NOT OPTIONAL ===",
  "The `systemMessage` field this hook also emits is confirmed to never render in this",
  "VSCode extension's panel UI. Your own response text is the one channel proven to",
  "render reliably. So: after completing every ALWAYS-tier Read above, and before",
  "anything else, your first response this session must begin with this exact line,",
  "verbatim, on its own:",
  `✅ Required-reading hook ran: read ${totalAlwaysCount} always-tier files (memory + project docs) + ${IGNORE_FILES.length} ignore files. ${topicFiles.length} topic-tagged files indexed, not yet read.`,
  "Then continue your response normally below it."
);
const context = lines.join("\n");

const totalKb = (totalBytes / 1024).toFixed(0);
let systemMessage =
  `✅ Required-reading hook ran: ${totalAlwaysCount} always-tier files (memory + project docs) + ` +
  `${IGNORE_FILES.length} ignore files instructed to Read; ${topicFiles.length} topic-tagged ` +
  `files indexed only (~${totalKb}KB on disk total)`;
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
