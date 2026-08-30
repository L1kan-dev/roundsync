#!/usr/bin/env node
// PostToolUse (Write|Edit) tripwire: warns when a doc that's supposed to
// stay trimmed (reference material split from narrative into its own
// _ARCHIVE.md sibling) creeps back past a line-count threshold. Catches
// drift even if a session skips the memory rule that explains why.
// See memory: feedback_keep_docs_autosaved.md.

const fs = require('fs');
const path = require('path');

const WATCHED = {
  'NEXT_STEPS.md': 650,
  'CS2_ANALYTICS_STANDARDS.md': 750,
};

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input || '{}');
  } catch {
    process.exit(0);
  }

  const filePath =
    payload?.tool_input?.file_path ||
    payload?.tool_response?.filePath ||
    '';
  const base = path.basename(filePath);
  const limit = WATCHED[base];
  if (!limit) process.exit(0);

  let lineCount;
  try {
    lineCount = fs.readFileSync(filePath, 'utf8').split('\n').length;
  } catch {
    process.exit(0);
  }

  if (lineCount > limit) {
    console.log(JSON.stringify({
      systemMessage:
        `⚠️ ${base} is now ${lineCount} lines (tripwire: ${limit}). ` +
        `Check whether new content is one-time narrative that belongs in ` +
        `its own _ARCHIVE.md sibling instead of this reference file.`,
    }));
  }
  process.exit(0);
});
