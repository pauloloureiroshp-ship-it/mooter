#!/usr/bin/env node
/**
 * feedback-collector.js — CLI for rating router decisions after a session.
 *
 * Usage:
 *   node feedback-collector.js                    # interactive, last 10
 *   node feedback-collector.js --last 5           # last 5 decisions
 *   node feedback-collector.js --session <id>     # decisions from a session
 *
 * Reads decisions.log, optionally cross-references execution.log for
 * actual model used, then prompts for ratings.
 *
 * Ratings are written back to decisions.log (appended field) and to
 * .last-classified.json (explicit_rating field).
 *
 * PRIVACY: Never logs prompt text. Only metadata already in decisions.log.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const EXEC_LOG = path.join(ROUTER_DIR, 'execution.log');
const LAST_CLASSIFIED = path.join(ROUTER_DIR, '.last-classified.json');

// ─── Load decisions ─────────────────────────────────────────────────────
function loadDecisions() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs.readFileSync(LOG_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, idx) => {
      try {
        const d = JSON.parse(line);
        d._line_idx = idx;
        return d;
      } catch { return null; }
    })
    .filter(Boolean)
    .filter(d => d.event === 'classified');
}

// ─── Load execution.log for actual model lookup ─────────────────────────
function loadExecutionModels() {
  if (!fs.existsSync(EXEC_LOG)) return new Map();
  const models = new Map();
  for (const line of fs.readFileSync(EXEC_LOG, 'utf8').split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      // Format: timestamp\tmodel\ttool_name\t...
      const ts = parts[0];
      const model = parts[1];
      if (model && model !== 'unknown') {
        models.set(ts, model);
      }
    }
  }
  return models;
}

// ─── Find closest execution model for a decision ───────────────────────
function findActualModel(decision, execModels) {
  if (execModels.size === 0) return null;
  const dTs = decision.ts_ms || 0;
  let closest = null;
  let minDelta = Infinity;
  for (const [ts, model] of execModels) {
    const eTs = new Date(ts).getTime();
    const delta = Math.abs(eTs - dTs);
    if (delta < minDelta && delta < 60000) { // within 1 minute
      minDelta = delta;
      closest = model;
    }
  }
  return closest;
}

// ─── Write rating back to decisions.log ─────────────────────────────────
function writeRating(decision, rating) {
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n');
  const ratingTs = Date.now();

  // Find the matching line and update it
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    try {
      const d = JSON.parse(lines[i]);
      if (d.ts_ms === decision.ts_ms && d.session_id === decision.session_id && d.event === 'classified') {
        d.user_rating = rating;
        d.user_rating_ts = ratingTs;
        lines[i] = JSON.stringify(d);
        found = true;
        break;
      }
    } catch { /* skip */ }
  }

  if (found) {
    fs.writeFileSync(LOG_PATH, lines.join('\n'));
  }

  // Also update .last-classified.json if it matches
  if (fs.existsSync(LAST_CLASSIFIED)) {
    try {
      const lc = JSON.parse(fs.readFileSync(LAST_CLASSIFIED, 'utf8'));
      if (lc.ts_ms === decision.ts_ms) {
        lc.explicit_rating = rating;
        fs.writeFileSync(LAST_CLASSIFIED, JSON.stringify(lc, null, 2));
      }
    } catch { /* skip */ }
  }

  return found;
}

// ─── Rating labels ──────────────────────────────────────────────────────
const RATING_LABELS = {
  1: 'Correct',
  2: 'Should be higher tier',
  3: 'Should be lower tier',
  4: 'Skip',
};

// ─── Interactive mode ───────────────────────────────────────────────────
async function interactive(decisions) {
  const execModels = loadExecutionModels();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log('');
  console.log('frugal feedback collector — rate router decisions');
  console.log('─'.repeat(50));
  console.log(`${decisions.length} decisions to review`);
  console.log('');

  let rated = 0;
  let skipped = 0;

  for (const d of decisions) {
    if (d.user_rating) {
      console.log(`  (${d.prompt_preview?.slice(0, 50) || '?'}... already rated, skipping)`);
      skipped++;
      continue;
    }

    const actualModel = findActualModel(d, execModels);
    const preview = d.prompt_preview || '(no preview)';
    const wallClock = d.wall_clock_ms ? `${d.wall_clock_ms}ms` : '?';

    console.log(`┌─ Decision ─────────────────────────────────────`);
    console.log(`│ Tier: ${d.tier}  Confidence: ${d.confidence}  Category: ${d.task_category || '?'}`);
    console.log(`│ Preview: ${preview.slice(0, 70)}`);
    console.log(`│ Wall clock: ${wallClock}  Model: ${actualModel || d.recommended_model || '?'}`);
    console.log(`│`);
    console.log(`│ [1] Correct  [2] Should be T-higher  [3] Should be T-lower  [4] Skip`);

    const answer = await ask('└─ Rating: ');
    const rating = parseInt(answer, 10);

    if (rating >= 1 && rating <= 3) {
      writeRating(d, rating);
      console.log(`  ✓ Rated: ${RATING_LABELS[rating]}`);
      rated++;
    } else {
      console.log('  → Skipped');
      skipped++;
    }
    console.log('');
  }

  console.log('─'.repeat(50));
  console.log(`Done. Rated: ${rated}  Skipped: ${skipped}`);
  rl.close();
}

// ─── Main ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argi = (k) => args.indexOf(k);

const lastN = argi('--last') >= 0 ? parseInt(args[argi('--last') + 1], 10) : 10;
const sessionFilter = argi('--session') >= 0 ? args[argi('--session') + 1] : null;

const allDecisions = loadDecisions();

if (allDecisions.length === 0) {
  console.log('No decisions found in decisions.log');
  process.exit(0);
}

let filtered = allDecisions;
if (sessionFilter) {
  filtered = allDecisions.filter(d => d.session_id === sessionFilter);
  if (filtered.length === 0) {
    console.log(`No decisions found for session: ${sessionFilter}`);
    process.exit(0);
  }
}

// Take last N
filtered = filtered.slice(-lastN);

interactive(filtered).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
