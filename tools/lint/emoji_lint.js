#!/usr/bin/env node
'use strict';

// emoji_lint.js — Wave 53 Phase D.2.
//
// Anti-hyperbole gate. Mooter uses 100+ legitimate emojis in its CLI/statusline
// output (see docs/EMOJI_GUIDE.md), so this is a DENYLIST, not an allow-list: it
// flags only the small forbidden (hype) set the V4 doctrine bans. It never tries
// to enforce an exhaustive allow-list — that would be brittle and would fight
// intentional brand/status glyphs.
//
// Scope: source code (.js/.ts under tools/router + packages/*/src) and the CLI
// slash skills (.md under .claude/skills). node_modules, build dirs and
// docs/archive are skipped. Default run is informational (exit 0); set
// MOOTER_EMOJI_STRICT=1 to fail (exit 1) when a forbidden emoji is present.
//
// 💎 is deliberately NOT forbidden — it is a real per-model brand glyph in
// tools/router/model-profile.json (a Day-0 refutation of the original brief).

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

const FORBIDDEN = [
  { ch: '🚀', why: 'rocket — hype' },
  { ch: '🎉', why: 'party — hype' },
  { ch: '💯', why: '"100" — quantify, do not celebrate' },
  { ch: '🤯', why: 'mind-blown — hype' },
  { ch: '🔝', why: 'top arrow — hype' },
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next', '.turbo']);
const ARCHIVE = path.join('docs', 'archive');

/** Local package src dirs: packages/<name>/src. */
function pkgSrcDirs() {
  const out = [];
  try {
    for (const d of fs.readdirSync(path.join(REPO, 'packages'))) {
      const s = path.join(REPO, 'packages', d, 'src');
      try { if (fs.statSync(s).isDirectory()) out.push(s); } catch { /* skip */ }
    }
  } catch { /* no packages dir */ }
  return out;
}

const CODE_ROOTS = [path.join(REPO, 'tools', 'router'), ...pkgSrcDirs()];
const SKILL_ROOTS = [path.join(REPO, '.claude', 'skills')];

/** Pure: find forbidden-emoji occurrences in a text blob. */
function scanText(text) {
  const hits = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const f of FORBIDDEN) {
      let idx = lines[i].indexOf(f.ch);
      while (idx !== -1) {
        hits.push({ emoji: f.ch, why: f.why, line: i + 1, col: idx + 1 });
        idx = lines[i].indexOf(f.ch, idx + f.ch.length);
      }
    }
  }
  return hits;
}

/** Collect files with one of `exts` under `root`, skipping junk + docs/archive. */
function walk(root, exts, acc) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || p.includes(ARCHIVE)) continue;
      walk(p, exts, acc);
    } else if (exts.some((x) => e.name.endsWith(x))) {
      // Test/spec files legitimately embed forbidden emojis as fixtures (e.g.
      // emoji_lint's own tests), and are not user-facing output — skip them.
      if (/\.(test|spec)\.[jt]s$/.test(e.name)) continue;
      acc.push(p);
    }
  }
  return acc;
}

function collectFiles() {
  const files = [];
  for (const r of CODE_ROOTS) walk(r, ['.js', '.ts'], files);
  for (const r of SKILL_ROOTS) walk(r, ['.md'], files);
  return files;
}

function main() {
  const files = collectFiles();
  const allHits = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const h of scanText(text)) allHits.push({ file: path.relative(REPO, f), ...h });
  }
  const strict = process.env.MOOTER_EMOJI_STRICT === '1';
  if (allHits.length === 0) {
    process.stdout.write(`✅ emoji-lint: ${files.length} files scanned, no forbidden (anti-hype) emoji.\n`);
    return 0;
  }
  process.stderr.write(`⚠️ emoji-lint: ${allHits.length} forbidden emoji occurrence(s):\n`);
  for (const h of allHits) {
    process.stderr.write(`  ${h.file}:${h.line}:${h.col}  ${h.emoji}  (${h.why})\n`);
  }
  process.stderr.write(`See docs/EMOJI_GUIDE.md. ${strict ? 'STRICT → failing.' : 'Set MOOTER_EMOJI_STRICT=1 to fail CI.'}\n`);
  return strict ? 1 : 0;
}

module.exports = { FORBIDDEN, scanText, walk, collectFiles, CODE_ROOTS, SKILL_ROOTS, main };

if (require.main === module) {
  process.exit(main());
}
