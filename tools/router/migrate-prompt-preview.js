#!/usr/bin/env node
'use strict';
/**
 * migrate-prompt-preview.js — PROPOSED, run only with the owner's «sim».
 *
 * Lines written to decisions.log before 2026-09-23 carry `prompt_preview`
 * (up to 80 chars of the prompt; up to 200 for the synthetic tester events).
 * This rewrites each such USER line to drop the text and keep what readers
 * need, computed from the excerpt:
 *
 *   prompt_preview_sha256  sha256 of the excerpt — NOT of the full prompt,
 *                          which no longer exists anywhere to hash
 *   tuning_exclude, deliberate_high_tier, keyword_signals,
 *   has_file_refs, has_code_block        (prompt-traits.js, from the excerpt)
 *   migrated_from_preview: true
 *
 * Synthetic tester lines (`source: "mooter-tester"` or `event: "tester_*"`)
 * are left alone: they are machine-generated, not user text.
 *
 * Cost of saying yes: the text-only readers (confidence-calibrator,
 * ground-truth, similarity, validation-set-sample-historical, digest/trail in
 * the CLI) lose the legacy history too, and backtest groups old lines by exact
 * excerpt instead of by first 3 words. Irreversible except via the backup.
 *
 *   node migrate-prompt-preview.js [--log <path>]            dry-run (default)
 *   node migrate-prompt-preview.js [--log <path>] --apply    writes <log>.bak-pre-hash-<ts> first
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { promptTraits } = require('./prompt-traits');

/** @param {Record<string, any>} e */
function isSynthetic(e) {
  return e.source === 'mooter-tester' || (typeof e.event === 'string' && e.event.startsWith('tester_'));
}

/**
 * @param {string} text  whole decisions.log content
 * @returns {{ out: string, migrated: number, kept_synthetic: number, total: number }}
 */
function migrateText(text) {
  const lines = text.split('\n');
  let migrated = 0;
  let keptSynthetic = 0;
  let total = 0;
  const out = lines.map((line) => {
    if (!line.trim()) return line;
    total++;
    let e;
    try { e = JSON.parse(line); } catch { return line; }
    if (!e || typeof e !== 'object' || typeof e.prompt_preview !== 'string') return line;
    if (isSynthetic(e)) { keptSynthetic++; return line; }
    const { prompt_sha256: _drop, ...traits } = promptTraits(e.prompt_preview);
    const next = { ...e };
    delete next.prompt_preview;
    Object.assign(next, traits, {
      prompt_preview_sha256: crypto.createHash('sha256').update(e.prompt_preview, 'utf8').digest('hex'),
      migrated_from_preview: true,
    });
    migrated++;
    return JSON.stringify(next);
  });
  return { out: out.join('\n'), migrated, kept_synthetic: keptSynthetic, total };
}

function main(argv) {
  const i = argv.indexOf('--log');
  const logPath = i >= 0 ? argv[i + 1] : path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
  const apply = argv.includes('--apply');
  if (!fs.existsSync(logPath)) { console.error(`no such file: ${logPath}`); return 1; }
  const before = fs.readFileSync(logPath, 'utf8');
  const r = migrateText(before);
  console.log(JSON.stringify({ log: logPath, lines: r.total, migrated: r.migrated, kept_synthetic: r.kept_synthetic, apply }));
  if (!apply) { console.log('dry-run: nothing written. Re-run with --apply after the owner says yes.'); return 0; }
  const backup = `${logPath}.bak-pre-hash-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(logPath, backup);
  const tmp = `${logPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, r.out);
  fs.renameSync(tmp, logPath);
  console.log(`backup: ${backup}`);
  return 0;
}

module.exports = { migrateText, isSynthetic };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
