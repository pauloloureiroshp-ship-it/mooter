#!/usr/bin/env node
'use strict';

// Moo card — Stop hook (Wave 2.6 Day 3). Prints a compact per-turn summary of
// which Moo the Mooter pastored the turn to. OPT-IN: silent unless the user has
// run `mooter quiet --moo-card` (preferences.json `moo_card_enabled === true`).
//
// Honesty: decisions.log carries tier / model / backend / confidence / prompt_len
// per classified event — but NOT per-turn tokens / latency / cost. So the card
// reports only those real fields plus the session tier-mix; the turn cost line
// appears ONLY if the savings-tracker is reachable (best-effort, short timeout),
// never fabricated. Like every hook, it must NEVER throw — all paths exit 0.

const fs = require('fs');
const path = require('path');
const os = require('os');

function routerDir() {
  // Mirror paths.js resolution; fall back to ~/.claude/tools/router.
  try {
    return require('./paths').ROUTER_DIR || path.join(os.homedir(), '.claude', 'tools', 'router');
  } catch {
    const claude = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || path.join(os.homedir(), '.claude');
    return path.join(claude, 'tools', 'router');
  }
}

/** Read ~/.mooter/preferences.json (or override path). Missing/bad → {}. */
function readPrefs(prefsPath) {
  try {
    const p = prefsPath || path.join(os.homedir(), '.mooter', 'preferences.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch {
    return {};
  }
}

/** True only when the user explicitly enabled the card (default OFF). */
function mooCardEnabled(prefs) {
  return !!(prefs && prefs.moo_card_enabled === true);
}

/**
 * Last classified event for this session + the session tier-mix, read straight
 * from decisions.log. Returns null when there is nothing to report.
 * @param {string|undefined} sessionId
 * @param {string} [logPath]
 */
function aggregateLastTurn(sessionId, logPath) {
  const p = logPath || path.join(routerDir(), 'decisions.log');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
  const events = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || e.event !== 'classified') continue;
    if (e.source === 'mooter-tester') continue;
    if (sessionId && e.session_id && e.session_id !== 'unknown' && e.session_id !== sessionId) continue;
    events.push(e);
  }
  if (!events.length) return null;
  const last = events[events.length - 1];
  const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const e of events.slice(-10)) if (e.tier && e.tier in counts) counts[e.tier]++;
  return {
    tier: last.tier || 'T?',
    model: last.recommended_model || 'unknown',
    backend: last.recommended_backend,
    confidence: typeof last.confidence === 'number' ? last.confidence : null,
    promptLen: typeof last.prompt_len === 'number' ? last.prompt_len : null,
    tierMix: `T0:${counts.T0} T1:${counts.T1} T2:${counts.T2} T3:${counts.T3}`,
  };
}

function shortModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('gpt')) return 'gpt';
  if (m.includes('gemini')) return 'gemini';
  if (/qwen|llama|deepseek|gemma|mistral|phi/.test(m)) return 'ollama';
  return m || 'unknown';
}

/**
 * Render the Moo card. `turnCost` is an optional `{ turn, saved }` object from
 * the tracker — omitted entirely when null (never faked). Pure given its input.
 * @param {object} s  aggregateLastTurn result
 * @param {{turn:number, saved:number}|null} [turnCost]
 */
function buildMooCard(s, turnCost) {
  let glyph;
  try {
    const { glyphFor, providerBucket } = require('./glyphs.js');
    glyph = glyphFor({ tier: s.tier, provider: providerBucket(s.backend) });
  } catch {
    glyph = '🐮';
  }
  const conf = s.confidence === null ? '—' : s.confidence.toFixed(2);
  const lines = [
    '',
    '─────── 🐮 Moo card ───────',
    ` moo       ${glyph} ${shortModel(s.model)} (${s.tier})`,
    ` confidence ${conf}`,
  ];
  if (s.promptLen !== null) lines.push(` prompt    ${s.promptLen} chars`);
  if (turnCost && typeof turnCost.turn === 'number') {
    const saved = typeof turnCost.saved === 'number' ? ` · saved $${turnCost.saved.toFixed(4)} vs T3` : '';
    lines.push(` cost      $${turnCost.turn.toFixed(4)} turn${saved}`);
  }
  lines.push(` last10    ${s.tierMix}`);
  lines.push('───────────────────────────');
  lines.push('');
  return lines.join('\n');
}

/** Best-effort tracker read (short timeout). Returns null on any failure. */
async function fetchTurnCost(sessionId) {
  try {
    const base = 'http://127.0.0.1:7821/metrics';
    const url = sessionId ? `${base}?session_id=${encodeURIComponent(sessionId)}` : base;
    const res = await fetch(url, { signal: AbortSignal.timeout(300) });
    if (!res.ok) return null;
    const m = await res.json();
    const turn = Number(m && m.last_turn_cost_usd);
    if (!Number.isFinite(turn)) return null;
    return { turn, saved: Number(m.saved) || 0 };
  } catch {
    return null;
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    try {
      process.stdin.on('data', (c) => { buf += c.toString(); });
      process.stdin.on('end', () => resolve(buf));
    } catch { resolve(buf); }
    setTimeout(() => resolve(buf), 200); // non-blocking for non-TTY
  });
}

async function main() {
  const prefs = readPrefs();
  if (!mooCardEnabled(prefs)) return; // opt-in; silent by default

  const stdinJson = await readStdin();
  let sessionId;
  try { sessionId = JSON.parse(stdinJson || '{}').session_id; } catch { /* ignore */ }
  sessionId = sessionId || process.env.CLAUDE_SESSION_ID;

  const stats = aggregateLastTurn(sessionId);
  if (!stats) return; // nothing to report

  const turnCost = await fetchTurnCost(sessionId);
  process.stdout.write(buildMooCard(stats, turnCost));
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(() => process.exit(0)); // hooks never throw
}

module.exports = { readPrefs, mooCardEnabled, aggregateLastTurn, buildMooCard, shortModel };
