'use strict';

// cockpit-feed — the single view-model the First Magic cockpit + statusline render from
// (First Magic — FASE 4). It AGGREGATES real sources and never fabricates: any field with
// no real data is null and renders as "—".
//
// REAL sources (all already written by other parts of the system — we only read):
//   - ~/.mooter/workflows/active-run.json  → the live run pointer (the cockpit lights up
//                                            on it; reused Wave-28 contract).
//   - ~/.mooter/spawns/<id>/state.json     → real per-agent lanes (mode local|cloud, status).
//   - decisions.log                         → risk_blocked (FASE 1) + subagent_routed (FASE 3).
//   - ~/.mooter/verify-last.json            → the FASE 2 critic verdict.
//   - savings (injected, or the :7821 tracker /summary) → REAL mixed-run savings, NOT the
//                                            100%-local demo number.
//   - local-fleet.maxLocalMoos              → HW-aware Moo cap (≈2 on an 8GB M3).
//
// Pure + synchronous (the HTTP savings read is opt-in and wrapped best-effort). Zero paid LLM.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { maxLocalMoos, loadCapability } = require('./local-fleet');
const { DECISIONS_LOG } = require('./paths');

// MOOTER_HOME, when set, IS the .mooter dir (so spawns live at $MOOTER_HOME/spawns —
// the same resolved path spawns-status.js produces). Default: ~/.mooter.
const MOOTER = () => process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const STALE_MS = 5 * 60 * 1000; // a run pointer older than this is treated as inactive

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function readActiveRun(opts) {
  if (opts && 'activeRun' in opts) return opts.activeRun;
  return readJSON(path.join(MOOTER(), 'workflows', 'active-run.json'));
}

function readSpawns(opts) {
  if (opts && 'spawns' in opts) return opts.spawns || [];
  const root = path.join(MOOTER(), 'spawns');
  let ids = [];
  try { ids = fs.readdirSync(root); } catch { return []; }
  return ids.map((id) => readJSON(path.join(root, id, 'state.json'))).filter(Boolean);
}

function readVerify(opts) {
  if (opts && 'verify' in opts) return opts.verify;
  const v = readJSON(path.join(MOOTER(), 'verify-last.json'));
  if (!v) return null;
  return v.pass === true ? 'pass' : (v.pass === false ? 'fail' : null);
}

// The live moo-loop panel (FASE 4). moo-loop --cockpit writes loop-<id>.state.json
// each tick; we read it via the active run_id. Null when no loop is feeding — the
// cockpit renders "—", never a fabricated loop.
function readLoop(opts) {
  if (opts && 'loop' in opts) return opts.loop;
  const ar = readActiveRun(opts);
  const id = ar && (ar.run_id || ar.id);
  if (!id) return null;
  return readJSON(path.join(MOOTER(), `loop-${id}.state.json`));
}

function countRiskBlocked(opts) {
  if (opts && 'riskBlocked' in opts) return opts.riskBlocked;
  const logPath = opts && opts.decisionsLog ? opts.decisionsLog : DECISIONS_LOG;
  let raw = '';
  try { raw = fs.readFileSync(logPath, 'utf8'); } catch { return 0; }
  let n = 0;
  for (const line of raw.split('\n')) { if (line.includes('"event":"risk_blocked"')) n++; }
  return n;
}

// Map a spawn state.json record → a cockpit lane. Tokens/$ are only shown if the record
// actually carries them; spawn records don't, so they render "—" (honest).
function spawnToLane(s) {
  const local = s.mode === 'local';
  const statusMap = { running: 'run', done: 'done', queued: 'queued', failed: 'blocked', error: 'blocked' };
  return {
    badge: local ? '🦙' : '✨',
    kind: local ? 'local' : 'cloud',
    label: (s.task || s.id || '').toString().slice(0, 32),
    model: s.model || (local ? 'ollama' : null),
    status: statusMap[s.status] || (s.exitCode === 0 ? 'done' : 'run'),
    tokens: Number.isFinite(s.tokens) ? s.tokens : null,
    usd: Number.isFinite(s.cost_usd) ? s.cost_usd : null,
    risk: s.status === 'blocked' ? 'blocked' : 'ok',
  };
}

/**
 * Build the cockpit view-model from real sources.
 * @param {object} [opts] inject sources for tests: {activeRun, spawns, verify, riskBlocked, savings, capability, nowMs}
 */
function buildFeed(opts = {}) {
  const now = Number.isFinite(opts.nowMs) ? opts.nowMs : null; // null → cannot compute elapsed honestly
  const activeRun = readActiveRun(opts);
  const spawns = readSpawns(opts);
  const cap = opts.capability || loadCapability();
  // HW-aware Moo cap: tests inject totalMemMB so the assertion is deterministic across
  // machines (without it, maxLocalMoos reads os.totalmem() of the host — correct in prod,
  // but a RAM-dependent test value). Only pass the arg when provided.
  const fleet = Number.isFinite(opts.totalMemMB) ? maxLocalMoos(cap, opts.totalMemMB) : maxLocalMoos(cap);

  const fresh = !!(activeRun && activeRun.ts && now != null && (now - Date.parse(activeRun.ts)) < STALE_MS);
  const active = !!activeRun && (fresh || now == null);

  const lanes = spawns.map(spawnToLane);
  const moosLive = lanes.filter((l) => l.kind === 'local' && l.status === 'run').length;

  const blocked = countRiskBlocked(opts);
  const verify = readVerify(opts);

  // savings: injected (run-savings for this run) or null. NEVER fabricated. A savings claim
  // requires a real dollar basis: finite actual_usd, a positive counterfactual, and a pct.
  const sIn = (opts && 'savings' in opts) ? opts.savings : null;
  const savings = (sIn && Number.isFinite(sIn.saved_pct) && Number.isFinite(sIn.actual_usd) && Number(sIn.counterfactual_usd) > 0) ? sIn : null;

  let runSecs = null;
  if (activeRun && activeRun.ts && now != null) runSecs = Math.max(0, Math.round((now - Date.parse(activeRun.ts)) / 1000));

  return {
    active,
    run_id: (activeRun && (activeRun.run_id || activeRun.id)) || null,
    run_secs: runSecs,
    maestro: activeRun && (activeRun.maestro_model || activeRun.maestro_provider)
      ? { provider: activeRun.maestro_provider || null, model: activeRun.maestro_model || null }
      : null,
    moos_live: moosLive,
    moos_cap: fleet.max_local_moos,
    lanes,
    risk: { blocked, ok: blocked === 0 },
    verify,
    savings,
    loop: readLoop(opts),
  };
}

// ── active-run pointer writer — the cockpit lights up on this ────────────────
// Writes a SUPERSET of the existing Wave-28 ActiveRunSnapshot ({status, agents_done,
// agents_total, tokens, ts}) so the existing readers keep working; adds run_id + maestro.
function activeRunPath() { return path.join(MOOTER(), 'workflows', 'active-run.json'); }

function writeActiveRun(snap = {}) {
  const p = activeRunPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const rec = {
    status: snap.status || 'running',
    run_id: snap.run_id || null,
    maestro_provider: snap.maestro_provider || null,
    maestro_model: snap.maestro_model || null,
    agents_done: Number.isFinite(snap.agents_done) ? snap.agents_done : 0,
    agents_total: Number.isFinite(snap.agents_total) ? snap.agents_total : 0,
    tokens: Number.isFinite(snap.tokens) ? snap.tokens : null,
    ts: snap.ts || new Date().toISOString(),
  };
  fs.writeFileSync(p, JSON.stringify(rec, null, 2) + '\n', 'utf8');
  return p;
}

function clearActiveRun() { try { fs.unlinkSync(activeRunPath()); } catch { /* none */ } }

module.exports = { buildFeed, spawnToLane, countRiskBlocked, readActiveRun, readLoop, writeActiveRun, clearActiveRun, activeRunPath };

if (require.main === module) {
  process.stdout.write(JSON.stringify(buildFeed({ nowMs: Date.parse(new Date().toISOString()) }), null, 2) + '\n');
}
