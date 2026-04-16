#!/usr/bin/env node
/**
 * auto-feedback.js — automatic outcome capture from decisions.log.
 *
 * Infers outcome_score for each classified event using temporal heuristics:
 *   - implicit positive (0.8): classified event followed by next prompt >30s
 *     and <180s later (user moved on, implicit satisfaction)
 *   - implicit negative (0.2): classified event followed by very similar
 *     prompt within 30s (retry/correction signal)
 *   - explicit (1.0/0.0): quality_feedback events map directly
 *   - unlabeled: no successor found within 180s window
 *
 * Writes ~/.claude/tools/router/outcomes.jsonl (append-safe, idempotent).
 *
 * CLI:
 *   node auto-feedback.js --process   run analysis on full decisions.log
 *   node auto-feedback.js --stats     print labeling coverage summary
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const DECISIONS_LOG = path.join(ROUTER_DIR, 'decisions.log');
const OUTCOMES_JSONL = path.join(ROUTER_DIR, 'outcomes.jsonl');

const IMPLICIT_POSITIVE_WINDOW_MS = 180 * 1000;
const IMPLICIT_NEGATIVE_WINDOW_MS = 30 * 1000;
const SIMILARITY_THRESHOLD = 0.7; // jaccard on trigrams

// ─── Helpers ──────────────────────────────────────────────────────────────

function decisionId(entry) {
  const raw = (entry.prompt_preview || '') + '|' + (entry.ts || entry.ts_ms || '');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function trigrams(str) {
  if (!str || str.length < 3) return new Set();
  const s = str.toLowerCase().replace(/\s+/g, ' ').trim();
  const out = new Set();
  for (let i = 0; i <= s.length - 3; i++) out.add(s.slice(i, i + 3));
  return out;
}

function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function parseDecisionsLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').split('\n');
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') entries.push(obj);
    } catch { /* skip malformed */ }
  }
  return entries;
}

function loadExistingOutcomes(outPath) {
  const seen = new Set();
  if (!fs.existsSync(outPath)) return seen;
  const lines = fs.readFileSync(outPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && obj.decision_id) seen.add(obj.decision_id);
    } catch { /* skip */ }
  }
  return seen;
}

// ─── Core analysis ────────────────────────────────────────────────────────

function processLog() {
  const entries = parseDecisionsLog(DECISIONS_LOG);
  const alreadyLabeled = loadExistingOutcomes(OUTCOMES_JSONL);

  // Filter to classified events only; sort by ts_ms ascending.
  const classified = entries
    .filter(e => e.event === 'classified' && e.ts_ms)
    .sort((a, b) => a.ts_ms - b.ts_ms);

  // Build a quick lookup of explicit quality_feedback events.
  const feedbackMap = new Map();
  for (const e of entries) {
    if (e.event === 'quality_feedback' && e.decision_id) {
      feedbackMap.set(e.decision_id, e);
    }
  }

  const newOutcomes = [];

  for (let i = 0; i < classified.length; i++) {
    const current = classified[i];
    const did = decisionId(current);

    if (alreadyLabeled.has(did)) continue;

    // Check explicit feedback first.
    if (feedbackMap.has(did)) {
      const fb = feedbackMap.get(did);
      const score = fb.rating === 1 ? 1.0 : fb.rating === -1 ? 0.0 : 0.5;
      newOutcomes.push({
        decision_id: did,
        outcome_score: score,
        outcome_source: 'explicit',
        ts: new Date().toISOString(),
      });
      continue;
    }

    // Find next classified event in the same session (or any if session absent).
    const next = classified.slice(i + 1).find(e =>
      (!current.session_id || !e.session_id || e.session_id === current.session_id) &&
      e.ts_ms > current.ts_ms
    );

    if (!next) continue; // no successor — unlabeled

    const gap = next.ts_ms - current.ts_ms;

    if (gap <= IMPLICIT_NEGATIVE_WINDOW_MS) {
      // Within 30s — check similarity for retry signal.
      const simA = trigrams(current.prompt_preview || '');
      const simB = trigrams(next.prompt_preview || '');
      const similarity = jaccardSimilarity(simA, simB);
      if (similarity >= SIMILARITY_THRESHOLD) {
        newOutcomes.push({
          decision_id: did,
          outcome_score: 0.2,
          outcome_source: 'implicit',
          ts: new Date().toISOString(),
        });
        continue;
      }
    }

    if (gap > IMPLICIT_NEGATIVE_WINDOW_MS && gap <= IMPLICIT_POSITIVE_WINDOW_MS) {
      // 30s–180s gap: user moved on — implicit positive.
      newOutcomes.push({
        decision_id: did,
        outcome_score: 0.8,
        outcome_source: 'implicit',
        ts: new Date().toISOString(),
      });
    }
    // gap > 180s or gap <= 30s without similarity match → unlabeled, skip
  }

  if (newOutcomes.length === 0) {
    process.stdout.write('auto-feedback: no new outcomes to write\n');
    return { total: classified.length, newLabeled: 0 };
  }

  const lines = newOutcomes.map(o => JSON.stringify(o)).join('\n') + '\n';
  fs.appendFileSync(OUTCOMES_JSONL, lines, 'utf8');
  process.stdout.write(`auto-feedback: wrote ${newOutcomes.length} new outcomes to ${OUTCOMES_JSONL}\n`);
  return { total: classified.length, newLabeled: newOutcomes.length };
}

// ─── Stats mode ───────────────────────────────────────────────────────────

function printStats() {
  const entries = parseDecisionsLog(DECISIONS_LOG);
  const classified = entries.filter(e => e.event === 'classified');
  const total = classified.length;

  if (!fs.existsSync(OUTCOMES_JSONL)) {
    process.stdout.write(`total decisions : ${total}\nlabeled count   : 0\n(run --process first)\n`);
    return;
  }

  const outcomes = fs.readFileSync(OUTCOMES_JSONL, 'utf8')
    .split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  const labeled = outcomes.length;
  const positive = outcomes.filter(o => o.outcome_score >= 0.5).length;
  const negative = outcomes.filter(o => o.outcome_score < 0.5).length;
  const unlabeled = Math.max(0, total - labeled);
  const pct = n => total > 0 ? ((n / total) * 100).toFixed(1) + '%' : 'n/a';

  process.stdout.write([
    `total decisions : ${total}`,
    `labeled count   : ${labeled} (${pct(labeled)})`,
    `  positive      : ${positive} (${pct(positive)})`,
    `  negative      : ${negative} (${pct(negative)})`,
    `unlabeled       : ${unlabeled} (${pct(unlabeled)})`,
  ].join('\n') + '\n');
}

// ─── CLI ──────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--process')) {
    processLog();
  } else if (args.includes('--stats')) {
    printStats();
  } else {
    process.stdout.write('auto-feedback.js — usage:\n  node auto-feedback.js --process\n  node auto-feedback.js --stats\n');
  }
}

module.exports = { processLog, printStats, decisionId };
