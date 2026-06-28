'use strict';
// mc-snapshot.js — Frente 0 · Foundation (Mission Control backend integration).
//
// THE single source of truth. Assembles one `MissionControlSnapshot` (schema §6 of
// docs/strategy/MISSION_CONTROL_BACKEND_INTEGRATION.md) that all 4 views
// (🌳 Árvore · 📊 CEO · 🔌 Working-tree · 🎛️ Mission Control) render PURELY from.
// Zero fetch inside the webview; zero divergence between views.
//
// We DON'T reinvent the pipeline: the heavy collectors (sessions/git/tokens/fleet) already
// exist in host-extra. `buildSnapshot` reuses already-computed results when the caller
// passes them (extension.js refresh() does — so the render tick stays <50ms), and only
// adds CHEAP work: pure field mapping + three small cache-file reads (gpu/remote/sync).
//
// Honesty rule (§6): EVERY field is nullable. Missing data → null (renders as n/d / ⚪).
// NEVER fabricate. Slow sources (GPU/remote/sync) are read from background-written cache
// files; this assembler never calls nvidia-smi / hub / Notion on the render path.

const os = require('os');
const fs = require('fs');
const path = require('path');

// Same cache-dir convention as gpu-monitor.js / host-extra `_handoffDir` (MOOTER_HOME
// override for test isolation; defaults to ~/.mooter/cache).
function mooterCacheDir() {
  const home = (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0)
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
  return path.join(home, 'cache');
}

// Number-or-null: keeps real zeros, drops undefined/NaN/strings (honesty, never coerce).
function n(v) { return (typeof v === 'number' && Number.isFinite(v)) ? v : null; }

// Read a small JSON cache file, fail-soft to null. fs.stat guard caps pathological files
// (anti-WCOCKPIT-5) — a cache snapshot is tiny; anything huge is treated as absent.
function _readJsonCapped(file, maxBytes) {
  const cap = maxBytes || 512 * 1024;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > cap) return null;
    const txt = fs.readFileSync(file, 'utf8');
    const j = JSON.parse(txt);
    return j == null ? null : j;
  } catch { return null; }
}

function readCache(name, cacheDir) {
  const dir = cacheDir || mooterCacheDir();
  return _readJsonCapped(path.join(dir, name + '-snapshot.json'));
}

// Map a model id → tier label (honest: unknown → null). Mirrors the tier ladder.
function modelTier(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return null;
  if (m.includes('fable')) return 'T5';
  if (m.includes('opus')) return 'T3';
  if (m.includes('sonnet')) return 'T2';
  if (m.includes('haiku')) return 'T1';
  if (/qwen|gemma|deepseek|llama|mistral|phi|local|ollama/.test(m)) return 'T0';
  return null;
}

// Context window for a model: [1m] variants get 1M, otherwise the 200k default. ctx% is
// an estimate derived from a known window — null when we have no token count.
function ctxPct(ctxTokens, model) {
  const t = n(ctxTokens);
  if (t == null) return null;
  const win = /\[1m\]|\b1m\b/.test(String(model || '').toLowerCase()) ? 1000000 : 200000;
  return Math.max(0, Math.min(100, Math.round((t / win) * 100)));
}

function sessionStatus(row) {
  if (row && row.working) return 'working';
  if (row && row.needsYou) return 'needs-you';
  return 'idle';
}

// Map one recentSessions() row → the snapshot's per-session shape (schema §6). Prefers the
// HONEST per-session git provenance (sessionGit, read from the session's OWN journal) over
// the shared working-tree branch.
function mapSession(row) {
  if (!row) return null;
  const g = row.sessionGit || {};
  const gs = row.gitStage || {};
  return {
    sid: row.fullId || row.id || null,
    name: row.name || null,
    topic: row.coworkTitle || row.brainTitle || null,
    model: row.model || null,
    tier: modelTier(row.model),
    tokIn: n(row.tokIn),
    tokOut: n(row.tokOut),
    ctxPct: ctxPct(row.ctxTokens, row.model),
    mode: row.mode || null,
    cow: row.coworkTitle || null,
    auto: !!row.auto,
    loop: !!row.loop,
    status: sessionStatus(row),
    needsYou: !!row.needsYou,
    tokPerSec: n(row.tokPerSec),
    cost: n(row.cost),
    saved: n(row.saved),
    git: {
      branch: g.branch || row.branch || null,
      dirty: n(gs.dirty),
      ahead: n(gs.ahead),
      pushNeeded: (gs && typeof gs.ahead === 'number') ? gs.ahead > 0 : null,
      sha: g.sha || null,
    },
    sync: {
      notion: row.notionSyncedAt ? { pageId: row.notionPageId || null, at: row.notionSyncedAt } : null,
      obsidian: row.obsidianSyncedAt ? { path: row.obsidianPath || null, at: row.obsidianSyncedAt } : null,
    },
    device: row.device || null, // null = this machine; Frente F fills remote sessions
    worktree: row.worktree || null,
  };
}

// Loops slice. We only have an honest liveness signal (loopActive, from heartbeat <90s) and
// an optional STATE.json (round/maxRounds/model). No state → empty list. Never invent rounds.
function mapLoops(loopActive, loopState) {
  if (loopState && typeof loopState === 'object') {
    return [{
      id: loopState.id || 'loop',
      kind: loopState.kind || 'loop',
      round: n(loopState.round),
      maxRounds: n(loopState.maxRounds != null ? loopState.maxRounds : loopState.max_rounds),
      model: loopState.model || null,
      nextInMs: n(loopState.nextInMs != null ? loopState.nextInMs : loopState.next_in_ms),
      active: !!loopActive,
    }];
  }
  if (loopActive) {
    return [{ id: 'loop', kind: 'loop', round: null, maxRounds: null, model: null, nextInMs: null, active: true }];
  }
  return [];
}

// Group mapped sessions into the project tree (scope.projects). status: active if any
// session is working/needs-you, else idle. architecture (pillars) has no source yet → [].
function buildScope(sessions, rawRows) {
  const byProj = new Map();
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const name = (raw && raw.project) || '?';
    if (!byProj.has(name)) byProj.set(name, []);
    byProj.get(name).push(sessions[i]);
  }
  const projects = [];
  for (const [name, sess] of byProj) {
    const active = sess.some((s) => s && (s.status === 'working' || s.needsYou));
    projects.push({
      id: name,
      name,
      status: active ? 'active' : 'idle',
      sessions: sess.length,
    });
  }
  return { projects, architecture: [] };
}

// Sum that stays honest: null when there is no numeric contribution at all (n/d), the real
// total otherwise (including a legitimate 0).
function sumOrNull(arr) {
  let any = false;
  let total = 0;
  for (const v of arr) { if (v != null) { any = true; total += v; } }
  return any ? total : null;
}

function buildTotals(sessions, opts) {
  let commitsPending = 0;
  let pushPending = 0;
  let needYou = 0;
  let ctxFull = 0;
  for (const s of sessions) {
    if (s.git && ((s.git.dirty != null && s.git.dirty > 0))) commitsPending++;
    if (s.git && s.git.pushNeeded === true) pushPending++;
    if (s.needsYou) needYou++;
    if (s.ctxPct != null && s.ctxPct >= 80) ctxFull++;
  }
  return {
    savedToday: sumOrNull(sessions.map((s) => s.saved)),
    pctLocal: n(opts.pctLocal),
    tokensToday: sumOrNull(sessions.map((s) => (s.tokIn != null || s.tokOut != null) ? ((s.tokIn || 0) + (s.tokOut || 0)) : null)),
    commitsPending,
    pushPending,
    needYou,
    ctxFull,
  };
}

// Assemble the MissionControlSnapshot. opts may pass already-computed collectors (the
// render-tick path does, so this stays a pure transform + 3 cheap cache reads). When
// absent, we compute them (standalone / tests). Everything is fail-soft.
async function buildSnapshot(cwd, opts) {
  opts = opts || {};
  const extra = opts.extra || require('./host-extra.js');
  const cacheDir = opts.cacheDir || mooterCacheDir();

  let recent = opts.recent;
  if (!Array.isArray(recent)) {
    try { recent = await extra.recentSessions(); } catch { recent = []; }
  }
  recent = Array.isArray(recent) ? recent : [];

  const sessions = recent.map(mapSession).filter(Boolean);

  let device = null;
  try {
    const dp = (typeof extra.deviceProfile === 'function') ? extra.deviceProfile() : null;
    device = { os: (dp && (dp.os || dp.platform)) || process.platform || null, id: (dp && dp.id) || null };
  } catch { device = { os: process.platform || null, id: null }; }

  const project = opts.project || (cwd ? path.basename(cwd) : null);

  return {
    at: opts.now != null ? opts.now : Date.now(),
    project,
    device,
    scope: buildScope(sessions, recent),
    sessions,
    loops: mapLoops(opts.loopActive, opts.loopState),
    gpu: readCache('gpu', cacheDir),
    remote: readCache('remote', cacheDir),
    sync: readCache('sync', cacheDir), // top-level vault sync (Frente F bg writer); per-session sync lives on each session
    totals: buildTotals(sessions, opts),
  };
}

module.exports = {
  buildSnapshot,
  mapSession,
  mapLoops,
  buildScope,
  buildTotals,
  modelTier,
  ctxPct,
  sessionStatus,
  readCache,
  mooterCacheDir,
};
