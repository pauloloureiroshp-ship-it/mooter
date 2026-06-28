// hub-client.js — Frente F · background writer for the cross-machine "Remote device" lane.
//
// Runs OFF the render tick (its own timer, §3 of MISSION_CONTROL_BACKEND_INTEGRATION.md). Each
// cycle it (1) PUSHES this device's live-session snapshot + latest combined handoff to the hub's
// additive /v1/live-sessions endpoint, and (2) POLLS the owner's OTHER devices and writes
// ~/.mooter/cache/remote-snapshot.json. The mc-snapshot assembler then only ever READS that cache
// file (a cheap read), never the network — so a slow hub can NEVER blank the panel (WCOCKPIT-5).
//
// FAIL-SOFT everywhere: missing identity, offline hub, 5xx, bad JSON → the cache holds an empty
// fleet and the lane renders "n/d". METADATA ONLY crosses the wire (sid, topic, model, tier, branch,
// status) — never prompt/code/file content. Identity = two pseudonymous hashes (device_id +
// owner_hash); without an owner_hash cross-machine sync is simply not configured (honest no-op).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_HUB_URL = 'https://mooter-hub.frugal-hub.workers.dev';
const STALE_MIN = 5;          // a device silent longer than this → offline (honest)
const PUSH_SESSION_CAP = 64;  // hub schema max

function mooterHome() {
  return (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length)
    ? process.env.MOOTER_HOME : path.join(os.homedir(), '.mooter');
}
function cacheDir() { return path.join(mooterHome(), 'cache'); }
function remoteSnapshotPath() { return path.join(cacheDir(), 'remote-snapshot.json'); }
function identityPath() { return path.join(mooterHome(), 'identity.json'); }

function hubUrl() {
  const env = process.env.MOOTER_CF_BACKEND_URL;
  return (env && env.length ? env : DEFAULT_HUB_URL).replace(/\/$/, '');
}

// Map node platform → stable os_type for the wire.
function osType(platform) {
  const p = String(platform == null ? process.platform : platform).toLowerCase();
  if (p === 'win32' || p === 'windows') return 'windows';
  if (p === 'darwin' || p === 'macos') return 'macos';
  if (p === 'linux') return 'linux';
  return 'unknown';
}

// Read { device_id, owner_hash, device_label }. Mints + persists a device_id when absent so a
// machine has a stable pseudonym; owner_hash is NOT minted — it scopes to the user's own fleet and
// must be configured deliberately (absent → cross-machine sync off). FAIL-SOFT.
function readIdentity() {
  let obj = {};
  try { obj = JSON.parse(fs.readFileSync(identityPath(), 'utf8')) || {}; } catch { obj = {}; }
  let changed = false;
  if (typeof obj.device_id !== 'string' || !/^[a-f0-9]{8,128}$/.test(obj.device_id)) {
    obj.device_id = crypto.randomBytes(16).toString('hex'); changed = true;
  }
  if (changed) {
    try { fs.mkdirSync(mooterHome(), { recursive: true }); fs.writeFileSync(identityPath(), JSON.stringify(obj, null, 2) + '\n'); } catch { /* best-effort */ }
  }
  return {
    deviceId: obj.device_id,
    ownerHash: (typeof obj.owner_hash === 'string' && /^[a-f0-9]{8,128}$/.test(obj.owner_hash)) ? obj.owner_hash : null,
    deviceLabel: typeof obj.device_label === 'string' ? obj.device_label : null,
  };
}

// ── tiny fetch wrapper (global fetch on Node 18+; resolves null on any failure) ──
async function _fetch(url, init, timeoutMs) {
  const f = globalThis.fetch;
  if (typeof f !== 'function') return null;
  const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs || 4000) : null;
  try {
    const res = await f(url, Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {}));
    return res;
  } catch { return null; } finally { if (t) clearTimeout(t); }
}

// PURE: project a recentSessions() row → a wire row (METADATA only). Drops everything else.
function sessionToRow(r) {
  r = r || {};
  return {
    sid: String(r.fullId || r.id || r.sid || '').slice(0, 128) || String(r.id || 'sess'),
    name: r.coworkTitle || r.name || undefined,
    model: r.model != null ? r.model : null,
    tier: r.tier != null ? r.tier : null,
    branch: r.branch != null ? r.branch : null,
    status: r.working ? 'working' : (r.needsYou ? 'needsYou' : (r.waitingForCowork ? 'waiting' : 'idle')),
    ctxPct: (typeof r.ctxPct === 'number') ? r.ctxPct : null,
  };
}

function buildState(input, ident) {
  const rows = (Array.isArray(input.sessions) ? input.sessions : []).map(sessionToRow).slice(0, PUSH_SESSION_CAP);
  return {
    device_id: ident.deviceId,
    owner_hash: ident.ownerHash,
    os_type: osType(),
    device_label: ident.deviceLabel,
    sessions: rows,
    handoff: (typeof input.handoff === 'string' && input.handoff) ? input.handoff.slice(0, 8000) : null,
    totals: input.totals || null,
    at: new Date().toISOString(),
  };
}

// PUSH this device's snapshot. Returns true on 2xx, false otherwise (never throws).
async function pushLocal(input, ident) {
  if (!ident || !ident.ownerHash) return false; // sync not configured → no-op
  const res = await _fetch(hubUrl() + '/v1/live-sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildState(input || {}, ident)),
  }, 4000);
  return !!(res && res.ok);
}

// PURE: stamp honest online/offline from updatedAt vs now.
function _markOffline(d, nowMs) {
  const ms = d && d.updatedAt ? Date.parse(d.updatedAt) : NaN;
  if (!Number.isFinite(ms)) return Object.assign({}, d, { online: false, offlineForMin: null });
  const age = Math.max(0, nowMs - ms);
  return Object.assign({}, d, { online: age < STALE_MIN * 60000, offlineForMin: Math.floor(age / 60000) });
}

// POLL the owner's OTHER devices. Returns RemoteDevice[] (possibly empty). Never throws.
async function pollRemote(ident, nowMs) {
  if (!ident || !ident.ownerHash) return [];
  const url = hubUrl() + '/v1/live-sessions'
    + '?owner=' + encodeURIComponent(ident.ownerHash)
    + '&self=' + encodeURIComponent(ident.deviceId)
    + '&limit=20';
  const res = await _fetch(url, { method: 'GET' }, 4000);
  if (!res || !res.ok) return [];
  let body; try { body = await res.json(); } catch { return []; }
  const devices = (body && Array.isArray(body.devices)) ? body.devices : [];
  const now = nowMs || Date.now();
  return devices.map((d) => _markOffline({
    deviceId: String(d && d.device_id || ''),
    osType: osType(d && d.os_type),
    deviceLabel: (d && d.device_label) || null,
    updatedAt: (d && typeof d.updatedAt === 'string') ? d.updatedAt : null,
    sessions: (d && Array.isArray(d.sessions)) ? d.sessions : [],
    handoff: (d && typeof d.handoff === 'string') ? d.handoff : null,
  }, now)).filter((d) => d.deviceId);
}

function writeRemoteSnapshot(devices, extra) {
  const snap = Object.assign({
    at: new Date().toISOString(),
    stale_min: STALE_MIN,
    configured: !!(extra && extra.configured),
    devices: Array.isArray(devices) ? devices : [],
  }, extra && extra.note ? { note: extra.note } : {});
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const tmp = remoteSnapshotPath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snap));
    fs.renameSync(tmp, remoteSnapshotPath());
    return true;
  } catch { return false; }
}

// Read the cache file the render tick consumes. null on absence/corruption (lane → "n/d").
function readRemoteSnapshot() {
  try { return JSON.parse(fs.readFileSync(remoteSnapshotPath(), 'utf8')); } catch { return null; }
}

// One full cycle: push local, poll remote, write cache. `input` carries this device's sessions +
// optional combined handoff. Always resolves (never rejects); returns the snapshot written.
async function tick(input) {
  const ident = readIdentity();
  if (!ident.ownerHash) {
    writeRemoteSnapshot([], { configured: false, note: 'cross-machine sync não configurado (sem owner_hash em ~/.mooter/identity.json)' });
    return readRemoteSnapshot();
  }
  try { await pushLocal(input || {}, ident); } catch { /* fail-soft */ }
  let devices = [];
  try { devices = await pollRemote(ident, Date.now()); } catch { devices = []; }
  writeRemoteSnapshot(devices, { configured: true });
  return readRemoteSnapshot();
}

// Background loop. `getInput()` returns { sessions, handoff, totals } for the current device. Returns
// a stop() handle. Errors inside a cycle are swallowed — the writer must never crash the host.
function start(getInput, opts) {
  opts = opts || {};
  const intervalMs = Math.max(5000, Number(opts.intervalMs) || 12000);
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try { await tick(typeof getInput === 'function' ? (getInput() || {}) : {}); } catch { /* swallow */ }
  };
  run();
  const h = setInterval(run, intervalMs);
  if (h && typeof h.unref === 'function') h.unref();
  return { stop() { stopped = true; try { clearInterval(h); } catch {} } };
}

module.exports = {
  DEFAULT_HUB_URL, STALE_MIN,
  mooterHome, cacheDir, remoteSnapshotPath, identityPath, hubUrl, osType,
  readIdentity, sessionToRow, buildState, pushLocal, pollRemote,
  writeRemoteSnapshot, readRemoteSnapshot, tick, start,
};
