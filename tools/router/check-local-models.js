#!/usr/bin/env node
/**
 * check-local-models.js — install guard for the T0 sub-tier specialists.
 *
 * Runs `ollama list`, compares against the local-specialist entries in
 * pricing.js, and prints a table of what's installed and what to pull.
 * NEVER auto-installs — disk + VRAM are the user's call.
 *
 * Usage:
 *   node check-local-models.js            # pretty report
 *   node check-local-models.js --json     # machine-readable
 *   node check-local-models.js --quiet    # exit 0 if all installed, 2 otherwise
 */

'use strict';

const { spawnSync } = require('child_process');
const pricing = require('./pricing');

// Specialists the router routes to in T0. `qwen2.5:3b` is already the
// general fallback, so it's included but not flagged as optional.
const LOCAL_SPECIALISTS = Object.entries(pricing.PRICES)
  .filter(([_, v]) => v && v.subtier) // only those with subtier marker
  .map(([name, v]) => ({
    name,
    subtier: v.subtier,
    strengths: v.strengths || [],
    required: v.subtier === 'general', // general is the Option A fallback
  }));

function runOllamaList() {
  const r = spawnSync('ollama', ['list'], { encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0 || !r.stdout) return null;
  // Parse table: first column is NAME:TAG
  const lines = r.stdout.split('\n').slice(1); // skip header
  const installed = new Set();
  for (const line of lines) {
    const name = line.trim().split(/\s+/)[0];
    if (name) installed.add(name);
  }
  return installed;
}

function main() {
  const jsonMode = process.argv.includes('--json');
  const quiet = process.argv.includes('--quiet');
  const installed = runOllamaList();

  if (installed === null) {
    if (quiet) process.exit(3);
    if (jsonMode) {
      process.stdout.write(JSON.stringify({ ok: false, reason: 'ollama_unavailable' }) + '\n');
      process.exit(3);
    }
    console.error('✗ Ollama CLI not found or not running. Install from https://ollama.com');
    process.exit(3);
  }

  const report = LOCAL_SPECIALISTS.map((s) => ({
    ...s,
    installed: installed.has(s.name),
  }));

  const missing = report.filter((r) => !r.installed);
  const ok = missing.length === 0;
  const missingRequired = missing.filter((r) => r.required);

  if (jsonMode) {
    process.stdout.write(JSON.stringify({ ok, report, missing_required: missingRequired.map((m) => m.name) }, null, 2) + '\n');
    process.exit(ok ? 0 : (missingRequired.length > 0 ? 2 : 1));
  }

  if (quiet) process.exit(ok ? 0 : 2);

  console.log('mooter — local model specialists');
  console.log('');
  for (const r of report) {
    const mark = r.installed ? '✓' : '○';
    const tag  = r.required  ? '[required]' : '[optional]';
    console.log(`  ${mark}  ${r.name.padEnd(36)}  ${tag}  ${r.strengths.join(', ')}`);
  }

  if (missing.length) {
    console.log('');
    console.log('Not installed — pull with:');
    for (const m of missing) {
      console.log(`  ollama pull ${m.name}`);
    }
    console.log('');
    console.log('Note: 14b specialists need ~9GB VRAM each. Start with qwen2.5-coder');
    console.log('if you mostly do code work, or deepseek-r1-distill if math/reasoning.');
    console.log('The router will fall back to qwen2.5:3b when a specialist is missing.');
  } else {
    console.log('');
    console.log('All specialists installed. Router sub-tier routing is fully active.');
  }

  process.exit(missingRequired.length > 0 ? 2 : 0);
}

if (require.main === module) main();
module.exports = { LOCAL_SPECIALISTS, runOllamaList };
