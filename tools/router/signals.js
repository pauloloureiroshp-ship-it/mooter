#!/usr/bin/env node
/**
 * signals.js — implicit quality signal detector.
 *
 * Scans decisions.log for patterns that imply quality without explicit
 * human ratings. Per docs/METHODOLOGY.md §7.3:
 *
 *   - Followup <3min with correction words → negative (prompt N failed)
 *   - Retry of same question → negative
 *   - Gratitude ("obrigado", "thanks", "perfect") → positive
 *   - New topic + ≥5min gap → positive (user moved on, accepted)
 *   - Session end with no followup → positive (assumed acceptable)
 *
 * Writes `implicit_signal` events to decisions.log. Confidence 0.5
 * (used only as tie-breaker when no better signal exists).
 *
 * Usage:
 *   node signals.js                # scan last 24h
 *   node signals.js --all          # scan everything
 *   node signals.js --dry-run      # show signals without writing
 *   node signals.js --stats        # show distribution only
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');

const HORIZON_MS = 24 * 60 * 60 * 1000;
const FOLLOWUP_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
const TOPIC_CHANGE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const SIGNAL_CONFIDENCE = 0.5;

const CORRECTION_WORDS = /\b(actually|na verdade|não|no[,.]|nope|wrong|errado|incorrec|wait|espera|retry|tenta de novo|outra vez|again)\b/i;
const GRATITUDE_WORDS = /\b(obrigado|thanks|thank you|perfect|perfeito|exacto|exactly|great|ótimo|excelente|excellent|nice|bom trabalho|good job|well done)\b/i;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const statsOnly = args.includes('--stats');

function loadEvents() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const now = Date.now();
  const events = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (!all && typeof e.ts_ms === 'number' && now - e.ts_ms > HORIZON_MS) continue;
      events.push(e);
    } catch (_) { /* skip */ }
  }
  return events;
}

function alreadySignaled(events) {
  const signaled = new Set();
  for (const e of events) {
    if (e.event === 'implicit_signal' && e.target_decision_id) {
      signaled.add(e.target_decision_id);
    }
  }
  return signaled;
}

function buildSessionChains(events) {
  const sessions = new Map(); // session_id → classified[]
  for (const e of events) {
    if (e.event !== 'classified' || !e.session_id) continue;
    if (!sessions.has(e.session_id)) sessions.set(e.session_id, []);
    sessions.get(e.session_id).push(e);
  }
  // Sort each chain by ts_ms
  for (const chain of sessions.values()) {
    chain.sort((a, b) => (a.ts_ms || 0) - (b.ts_ms || 0));
  }
  return sessions;
}

function detectSignals(events) {
  const signaled = alreadySignaled(events);
  const sessions = buildSessionChains(events);
  const signals = [];

  for (const [sessionId, chain] of sessions) {
    for (let i = 0; i < chain.length; i++) {
      const current = chain[i];
      const decisionId = current.decision_id || `${sessionId}_${i}`;

      if (signaled.has(decisionId)) continue;

      const next = chain[i + 1] || null;
      const currentMs = current.ts_ms || 0;
      const nextMs = next ? (next.ts_ms || 0) : 0;
      const delta = next ? nextMs - currentMs : Infinity;
      const nextPreview = next ? (next.prompt_preview || '') : '';

      let signal = null;
      let reason = null;

      if (next && delta < FOLLOWUP_THRESHOLD_MS && CORRECTION_WORDS.test(nextPreview)) {
        signal = 'negative';
        reason = 'followup_with_correction';
      } else if (next && delta < FOLLOWUP_THRESHOLD_MS && nextPreview.length > 0) {
        // Check if retry (similar prefix)
        const curPre = (current.prompt_preview || '').slice(0, 40).toLowerCase();
        const nextPre = nextPreview.slice(0, 40).toLowerCase();
        if (curPre.length > 10 && curPre === nextPre) {
          signal = 'negative';
          reason = 'retry_same_prompt';
        }
      }

      if (!signal && next && delta < FOLLOWUP_THRESHOLD_MS && GRATITUDE_WORDS.test(nextPreview)) {
        signal = 'positive';
        reason = 'gratitude_followup';
      }

      if (!signal && next && delta >= TOPIC_CHANGE_THRESHOLD_MS) {
        signal = 'positive';
        reason = 'topic_change_after_gap';
      }

      if (!signal && !next) {
        // Last prompt in session — no followup
        signal = 'positive';
        reason = 'session_end_no_followup';
      }

      if (signal) {
        signals.push({
          ts: new Date().toISOString(),
          ts_ms: Date.now(),
          event: 'implicit_signal',
          target_decision_id: decisionId,
          session_id: sessionId,
          signal,
          reason,
          confidence: SIGNAL_CONFIDENCE,
          delta_ms: delta === Infinity ? null : delta,
          target_tier: current.tier,
          target_category: current.task_category,
        });
      }
    }
  }
  return signals;
}

function main() {
  const events = loadEvents();
  const signals = detectSignals(events);

  const positive = signals.filter(s => s.signal === 'positive').length;
  const negative = signals.filter(s => s.signal === 'negative').length;
  const byReason = {};
  for (const s of signals) {
    byReason[s.reason] = (byReason[s.reason] || 0) + 1;
  }

  console.log(`Implicit signals: ${signals.length} (${positive} positive, ${negative} negative)`);
  console.log('By reason:');
  for (const [r, c] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r.padEnd(30)} ${c}`);
  }

  if (statsOnly) return;

  if (!dryRun) {
    let written = 0;
    for (const s of signals) {
      try {
        fs.appendFileSync(LOG_PATH, JSON.stringify(s) + '\n');
        written++;
      } catch (_) { /* non-fatal */ }
    }
    console.log(`\nWrote ${written} implicit_signal events to decisions.log`);
  } else {
    console.log(`\n[DRY RUN] Would write ${signals.length} events`);
    signals.slice(0, 5).forEach(s => {
      console.log(`  ${s.signal} ${s.reason} tier=${s.target_tier} session=${s.session_id}`);
    });
  }
}

main();
