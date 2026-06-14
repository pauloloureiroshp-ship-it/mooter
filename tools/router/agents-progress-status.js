#!/usr/bin/env node
/**
 * agents-progress-status.js — Wave 58 batch 2 (A.1): the 🤖 agents-progress chip.
 *
 * OPT-IN line-3 chip summarising the live multi-agent workflow run, e.g.
 *   `🤖 3/7 done · 1m 12s · ↓42.3k tok · current: model-reasoner`
 * Off unless `statusline_chips.agents_progress: true` in ~/.mooter/preferences.json
 * OR env `MOOTER_STATUSLINE_AGENTS_PROGRESS=1`. Default OFF — it is NOT wired into
 * the displayed statusline here (that is deferred to A.5); this module only ships
 * the chip + its pure render fn.
 *
 * Two REAL sources (no fabrication, Doctrine V4 #5):
 *   1. ~/.mooter/workflows/active-run.json — the Wave 28 live pointer
 *      (ActiveRunSnapshot) carrying { status, agents_done, agents_total, tokens, ts }.
 *      This mirrors readActiveWorkflow()/progressDots()/WorkflowProgress from
 *      packages/sessions-orchestrator/src/workflow-chip.ts, re-read here in
 *      zero-dep CommonJS because the statusline runtime cannot import the TS
 *      package (same constraint conductor-status.js + workflow-status.js document).
 *      The pointer carries no token count today, so `tokens` is rendered only when
 *      present — never invented.
 *   2. subagent_tracker.snapshot({session_id}).active — the live herd state, used
 *      ONLY to name the current in-flight agent (`current: <task>`) and its elapsed
 *      time. Each active record carries the REAL { agent_name, started_at } written
 *      by trackSpawn.
 *
 * Anti-fabrication: when no run is active (or the pointer is stale/garbage) AND no
 * subagent is in flight, the chip is the honest `🤖 ?` — never a remembered number
 * (see cca-f-status.js for the `?` convention). Each piece (elapsed / tokens /
 * current) is omitted gracefully when its source is absent.
 *
 * Budget: one readFileSync of the small pointer JSON + one snapshot() read of the
 * per-session tmp JSON. Any failure → '' (silent). `hidden_chips:
 * ["agents_progress"]` also drops it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let tracker;
try { tracker = require('./subagent_tracker.js'); } catch { tracker = null; }

// A pointer not refreshed within this long is treated as a dead run and ignored
// (matches the run-pointer staleness window in workflow-status.js).
const STALE_MS = 6 * 60 * 60 * 1000;

function mooterHome() {
  return process.env.MOOTER_HOME || os.homedir();
}

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Opt-IN gate: env MOOTER_STATUSLINE_AGENTS_PROGRESS=1 OR statusline_chips.agents_progress === true. */
function optedIn(p) {
  if (process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS === '1') return true;
  if (!(p && p.statusline_chips && p.statusline_chips.agents_progress === true)) return false;
  // Respect an explicit hide override even when opted in.
  if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('agents_progress')) return false;
  return true;
}

function activePointerPath() {
  return (
    process.env.MOOTER_WORKFLOW_ACTIVE ||
    path.join(mooterHome(), '.mooter', 'workflows', 'active-run.json')
  );
}

/**
 * Read + normalise the active-run pointer into a WorkflowProgress-shaped object,
 * or null when absent / not running / stale. CommonJS mirror of
 * readActiveWorkflow() (workflow-chip.ts). `now` injectable for tests.
 */
function readActiveWorkflow(p, now = Date.now()) {
  let snap;
  try {
    snap = JSON.parse(fs.readFileSync(p || activePointerPath(), 'utf8'));
  } catch {
    return null;
  }
  if (!snap || typeof snap !== 'object' || snap.status !== 'running') return null;
  if (typeof snap.ts === 'number' && now - snap.ts > STALE_MS) return null;
  const done = Math.max(0, Number(snap.agents_done) || 0);
  const total = Math.max(done, Number(snap.agents_total) || 0);
  return {
    id: String(snap.run_id || snap.workflow_name || 'wf'),
    done,
    total,
    tokens: Number.isFinite(Number(snap.tokens)) ? Number(snap.tokens) : 0,
    status: String(snap.status),
    ts: typeof snap.ts === 'number' ? snap.ts : null,
  };
}

/** Compact elapsed: `9s` · `1m 12s` · `1h 4m`. */
function fmtElapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs ? `${m}m ${rs}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Compact token count: `42.3k tok` (≥1000) or `812 tok`. */
function fmtTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k tok` : `${Math.round(n)} tok`;
}

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/** The named active subagent records (filters out nameless / garbage entries). */
function activeNamed(snap) {
  return (snap && Array.isArray(snap.active) ? snap.active : []).filter((a) => a && clean(a.agent_name));
}

/** The longest-running active subagent (oldest started_at), or null. */
function currentAgent(snap) {
  const active = activeNamed(snap);
  if (active.length === 0) return null;
  return active.slice().sort((a, b) => (a.started_at || 0) - (b.started_at || 0))[0];
}

/**
 * Pure renderer — both sources injected → chip string. `wf` is a WorkflowProgress
 * (or null), `snap` a subagent_tracker snapshot (or null), `now` injectable.
 *
 *   🤖 X/Y done · Nm Ys · ↓ZZ.Zk tok · current: <task>
 *
 * Honest `🤖 ?` when there is no active run AND no in-flight subagent. Each
 * trailing piece is omitted when its source is unknown — never fabricated.
 */
function buildAgentsProgressChip(wf, snap, now = Date.now()) {
  const cur = currentAgent(snap);

  // No run and no live agent → we genuinely know nothing. Honest '?'.
  if (!wf && !cur) return '🤖 ?';

  const parts = [];

  if (wf && wf.total > 0) {
    parts.push(`${wf.done}/${wf.total} done`);
  } else if (wf) {
    // Running but no agent counts published yet — show the run without a count.
    parts.push('running');
  }

  // Wave 58.4 Block C — how many subagents are in flight RIGHT NOW (real count
  // from subagent_tracker.active). Shown only when ≥2: a single in-flight agent
  // is already named by the trailing `current:` segment, so a "1 running" badge
  // would be noise. Honest: 0/1 → omitted, never fabricated.
  const running = activeNamed(snap).length;
  if (running >= 2) parts.push(`${running} running`);

  // Elapsed comes from the run pointer's ts; if absent, fall back to the current
  // agent's started_at. Only rendered when we have a real start instant.
  const startTs = wf && typeof wf.ts === 'number' ? wf.ts
    : cur && typeof cur.started_at === 'number' ? cur.started_at
      : null;
  if (startTs != null) {
    const el = fmtElapsed(now - startTs);
    if (el) parts.push(el);
  }

  // Tokens: only from a real pointer field (Wave 28 doesn't write it yet → omitted).
  if (wf) {
    const tok = fmtTokens(wf.tokens);
    if (tok) parts.push(`↓${tok}`);
  }

  if (cur) parts.push(`current: ${clean(cur.agent_name)}`);

  // Run exists but produced no renderable piece (e.g. running, no counts, no ts,
  // no live agent) → still honest about not knowing specifics.
  if (parts.length === 0) return '🤖 ?';

  return `🤖 ${parts.join(' · ')}`;
}

function resolveSelf(selfSessionId) {
  return selfSessionId || process.env.CLAUDE_SESSION_ID || process.env.MOOTER_SESSION_ID || null;
}

/** Line-3 entry: '' unless opted in, else the live chip (or honest `🤖 ?`). */
function statusLine(selfSessionId) {
  try {
    if (!optedIn(prefs())) return ''; // opt-IN: silent unless explicitly enabled
    const wf = readActiveWorkflow(null, Date.now());
    let snap = null;
    if (tracker && typeof tracker.snapshot === 'function') {
      snap = tracker.snapshot({ session_id: resolveSelf(selfSessionId) });
    }
    return buildAgentsProgressChip(wf, snap, Date.now());
  } catch {
    return '';
  }
}

module.exports = {
  buildAgentsProgressChip,
  readActiveWorkflow,
  currentAgent,
  activeNamed,
  fmtElapsed,
  fmtTokens,
  optedIn,
  statusLine,
  activePointerPath,
  STALE_MS,
};

if (require.main === module) {
  const out = statusLine(process.argv[2]);
  if (out) process.stdout.write(out + '\n');
}
