#!/usr/bin/env node
// mooter-autopilot.js — closes the loop from advise to act.
//
// Reads current subscription usage + recommendation (from usage-estimator)
// and the current runtime mode (from .mooter-mode.json). If the
// recommendation differs from current mode AND enough time has passed
// since the last flip (hysteresis), flips the mode automatically.
//
// Invocation:
//   node tools/router/mooter-autopilot.js          → check & flip if needed
//   node tools/router/mooter-autopilot.js --dry    → show decision, don't act
//   node tools/router/mooter-autopilot.js --force  → ignore hysteresis
//
// Recommended wiring (manual, user opt-in — not patched automatically):
//   Add a Stop hook in ~/.claude/settings.json to run autopilot after
//   every turn. See README section "Enabling autopilot".

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_ROOT = path.join(os.homedir(), '.claude', 'tools', 'router');
const MODE_FILE = path.join(ROUTER_ROOT, '.mooter-mode.json');
const FLIP_LOG  = path.join(ROUTER_ROOT, '.autopilot-flips.log');

// Hysteresis: don't flip more often than this. Prevents whiplash when
// usage hovers around a boundary (e.g. 129% vs 131% projection).
const MIN_FLIP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function readMode() {
  try {
    return JSON.parse(fs.readFileSync(MODE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeMode(targetMode) {
  // targetMode is one of 'beast' | 'zen' | 'auto'
  let cur = readMode();
  if (!cur) {
    cur = {
      _description: 'Feature flags for the mooter router. Evolves with each sprint.',
      shadow_mode: false,
      similarity_lookup: false,
      ground_truth_oracle: false,
      implicit_signals: false,
    };
  }
  cur.mode         = targetMode;
  cur.beast_mode   = targetMode === 'beast';
  cur.zen_mode     = targetMode === 'zen';
  cur.active_since = new Date().toISOString();
  cur.version      = '1.1';
  fs.writeFileSync(MODE_FILE, JSON.stringify(cur, null, 2));
}

function currentMode() {
  const m = readMode();
  if (!m) return 'auto';
  if (typeof m.mode === 'string' && m.mode !== 'auto') return m.mode;
  if (m.beast_mode === true) return 'beast';
  if (m.zen_mode   === true) return 'zen';
  return 'auto';
}

function readLastFlipTs() {
  try {
    if (!fs.existsSync(FLIP_LOG)) return 0;
    const buf = fs.readFileSync(FLIP_LOG, 'utf8');
    const lines = buf.split('\n').filter(Boolean);
    if (!lines.length) return 0;
    const last = JSON.parse(lines[lines.length - 1]);
    const ts = Number(last.ts);
    return Number.isFinite(ts) ? ts : null;
  } catch (erro) {
    if (erro && erro.code === 'ENOENT') return 0;
    // Histórico ilegível não pode autorizar um flip como se nunca tivesse
    // havido outro. null fecha o autopilot até a medição voltar.
    try { process.stderr.write(`mooter-autopilot: flip history n/d — ${(erro && erro.message) || erro}\n`); } catch { /* stderr fechado */ }
    return null;
  }
}

function appendFlip(entry) {
  try {
    fs.appendFileSync(FLIP_LOG, JSON.stringify(entry) + '\n');
  } catch { /* non-fatal */ }
}

function decide(opts) {
  const force = !!(opts && opts.force);
  let est;
  try { est = require('./usage-estimator'); }
  catch (e) { return { ok: false, error: 'usage-estimator unavailable: ' + e.message }; }

  const usage = est.computeSubscriptionUsage();
  const rec = est.getRecommendation(usage);
  const current = currentMode();
  const target = rec ? rec.mode : null;
  const lastFlipTs = readLastFlipTs();
  if (lastFlipTs === null) {
    return { ok: false, action: 'error', error: 'flip history n/d — não consegui ler o último flip', current, target };
  }
  const sinceFlip = Date.now() - lastFlipTs;

  if (!target) {
    return { ok: true, action: 'noop', reason: 'no recommendation available', current };
  }
  if (target === current) {
    return { ok: true, action: 'noop', reason: 'already in recommended mode', current, target };
  }
  if (!force && sinceFlip < MIN_FLIP_INTERVAL_MS) {
    const mins = Math.round(sinceFlip / 60000);
    return {
      ok: true, action: 'hysteresis',
      reason: `flipped ${mins}m ago (hysteresis = 60m)`,
      current, target, recommendation_reason: rec.reason,
    };
  }
  return { ok: true, action: 'flip', current, target, reason: rec.reason };
}

function execute(decision) {
  if (decision.action !== 'flip') return decision;
  writeMode(decision.target);
  appendFlip({
    ts: Date.now(),
    iso: new Date().toISOString(),
    from: decision.current,
    to: decision.target,
    reason: decision.reason,
  });
  return { ...decision, applied: true };
}

function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const force = argv.includes('--force');

  const decision = decide({ force });
  if (dry) return decision;
  return execute(decision);
}

if (require.main === module) {
  const dry = process.argv.includes('--dry');
  const result = main();
  const ok = result.ok !== false;
  const action = result.action || 'error';
  const from = result.current || '?';
  const to = result.target || '?';
  const prefix = dry ? '[dry] ' : '';
  if (action === 'flip') {
    const verb = dry ? 'would flip' : 'flipped';
    console.log(`🔄 ${prefix}autopilot ${verb}  ${from} → ${to}`);
    console.log(`   reason: ${result.reason}`);
  } else if (action === 'hysteresis') {
    console.log(`⏳ ${prefix}autopilot held     ${from}  (would flip to ${to}, ${result.reason})`);
  } else if (action === 'noop') {
    console.log(`✓  ${prefix}autopilot noop     ${from}  (${result.reason})`);
  } else {
    console.log(`⚠  ${prefix}autopilot error    ${result.error || 'unknown'}`);
  }
  process.exit(ok ? 0 : 1);
}

module.exports = { decide, execute, main, currentMode, readMode, writeMode };
