// sync-collector.js — Frente F · background writer for the N/O (Notion · Obsidian) sync lane.
//
// Runs on its OWN slow timer (~30s, §3 of MISSION_CONTROL_BACKEND_INTEGRATION.md), OFF the render
// tick. Each cycle it records, per front, when Notion was last written, plus the Obsidian vault's
// git status (dirty / commits ahead / last commit), and writes ~/.mooter/cache/sync-snapshot.json.
// The mc-snapshot assembler only READS that cache (cheap) — Notion/git never touch the render path.
//
// FAIL-SOFT + HONEST: no config, no token, offline, or a non-repo vault → the field is null and the
// lane renders "n/d"/"⚪". Nothing is ever fabricated. Config is read (additively) from
// ~/.mooter/sync-config.json:
//   { "notion": { "token": "secret_…", "fronts": { "F": "<pageId>", … } },
//     "obsidian": { "vault": "/path/to/vault" } }
// (the same file the CLI uses for backend_url — we only READ the notion/obsidian keys, never write).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const NOTION_VERSION = '2022-06-28';
const STALE_DAYS = 7; // a front not written in > 7d is flagged ⚠ at the render layer

function mooterHome() {
  return (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length)
    ? process.env.MOOTER_HOME : path.join(os.homedir(), '.mooter');
}
function cacheDir() { return path.join(mooterHome(), 'cache'); }
function syncSnapshotPath() { return path.join(cacheDir(), 'sync-snapshot.json'); }
function syncConfigPath() { return path.join(mooterHome(), 'sync-config.json'); }

function readSyncConfig() {
  try {
    const o = JSON.parse(fs.readFileSync(syncConfigPath(), 'utf8')) || {};
    return {
      notion: (o.notion && typeof o.notion === 'object') ? o.notion : null,
      obsidian: (o.obsidian && typeof o.obsidian === 'object') ? o.obsidian : null,
    };
  } catch { return { notion: null, obsidian: null }; }
}

// PURE: human "ago" + staleness from an ISO timestamp vs now (ms). null in → null out.
function agoOf(iso, nowMs) {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return null;
  let d = Math.max(0, (nowMs || Date.now()) - ms);
  const stale = d > STALE_DAYS * 86400000;
  let label;
  if (d >= 86400000) label = Math.floor(d / 86400000) + 'd';
  else if (d >= 3600000) label = Math.floor(d / 3600000) + 'h';
  else if (d >= 60000) label = Math.floor(d / 60000) + 'm';
  else label = 'agora';
  return { lastWrite: new Date(ms).toISOString(), ago: label, stale };
}

function _git(args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      execFile('git', args, { cwd, timeout: timeoutMs || 4000, windowsHide: true, maxBuffer: 1 << 20 },
        (err, stdout) => fin(err ? null : String(stdout || '')));
    } catch { fin(null); }
  });
}

// Obsidian vault git status: { dirty, lastCommit, ago, stale } or null when not a usable repo.
async function collectObsidian(obsCfg) {
  const vault = obsCfg && typeof obsCfg.vault === 'string' ? obsCfg.vault : null;
  if (!vault) return null;
  try { if (!fs.existsSync(vault)) return null; } catch { return null; }
  const inside = await _git(['rev-parse', '--is-inside-work-tree'], vault, 3000);
  if (!inside || inside.trim() !== 'true') return null;
  const porcelain = await _git(['status', '--porcelain'], vault, 4000);
  const lastC = await _git(['log', '-1', '--format=%cI'], vault, 3000);
  const dirty = porcelain == null ? null : porcelain.split('\n').filter((l) => l.trim()).length;
  const a = agoOf(lastC ? lastC.trim() : null, Date.now());
  return {
    dirty,
    lastCommit: a ? a.lastWrite : null,
    ago: a ? a.ago : null,
    stale: a ? a.stale : false,
  };
}

async function _notionPageEdited(pageId, token, timeoutMs) {
  const f = globalThis.fetch;
  if (typeof f !== 'function' || !token || !pageId) return null;
  const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs || 5000) : null;
  try {
    const res = await f('https://api.notion.com/v1/pages/' + encodeURIComponent(pageId), Object.assign({
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Notion-Version': NOTION_VERSION },
    }, ctrl ? { signal: ctrl.signal } : {}));
    if (!res || !res.ok) return null;
    const body = await res.json();
    return (body && typeof body.last_edited_time === 'string') ? body.last_edited_time : null;
  } catch { return null; } finally { if (t) clearTimeout(t); }
}

// Notion last-write per front: { <front>: { lastWrite, ago, stale } | null }. null per front on any
// failure (no token, bad id, offline) — never fabricated.
async function collectNotion(notionCfg) {
  const token = notionCfg && typeof notionCfg.token === 'string' ? notionCfg.token : null;
  const fronts = (notionCfg && notionCfg.fronts && typeof notionCfg.fronts === 'object') ? notionCfg.fronts : null;
  if (!token || !fronts) return null;
  const names = Object.keys(fronts).slice(0, 24);
  const now = Date.now();
  const out = {};
  await Promise.all(names.map(async (name) => {
    const edited = await _notionPageEdited(fronts[name], token, 5000);
    out[name] = edited ? agoOf(edited, now) : null;
  }));
  return out;
}

function writeSyncSnapshot(data) {
  const snap = Object.assign({ at: new Date().toISOString(), stale_days: STALE_DAYS }, data);
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const tmp = syncSnapshotPath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snap));
    fs.renameSync(tmp, syncSnapshotPath());
    return true;
  } catch { return false; }
}

function readSyncSnapshot() {
  try { return JSON.parse(fs.readFileSync(syncSnapshotPath(), 'utf8')); } catch { return null; }
}

// One full cycle. Always resolves; writes { notion, obsidian, configured } (each nullable). When no
// config is present at all, writes a configured:false marker so the lane can say so honestly.
async function tick() {
  const cfg = readSyncConfig();
  if (!cfg.notion && !cfg.obsidian) {
    writeSyncSnapshot({ configured: false, notion: null, obsidian: null, note: 'N/O sync não configurado (~/.mooter/sync-config.json)' });
    return readSyncSnapshot();
  }
  let notion = null, obsidian = null;
  try { notion = await collectNotion(cfg.notion); } catch { notion = null; }
  try { obsidian = await collectObsidian(cfg.obsidian); } catch { obsidian = null; }
  writeSyncSnapshot({ configured: true, notion, obsidian });
  return readSyncSnapshot();
}

// Background loop (slow cadence — sync moves on the order of minutes). Returns a stop() handle.
// Errors inside a cycle are swallowed; the writer must never crash the host.
function start(opts) {
  opts = opts || {};
  const intervalMs = Math.max(15000, Number(opts.intervalMs) || 30000);
  let stopped = false;
  const run = async () => { if (stopped) return; try { await tick(); } catch { /* swallow */ } };
  run();
  const h = setInterval(run, intervalMs);
  if (h && typeof h.unref === 'function') h.unref();
  return { stop() { stopped = true; try { clearInterval(h); } catch {} } };
}

module.exports = {
  STALE_DAYS, NOTION_VERSION,
  mooterHome, cacheDir, syncSnapshotPath, syncConfigPath,
  readSyncConfig, agoOf, collectObsidian, collectNotion,
  writeSyncSnapshot, readSyncSnapshot, tick, start,
};
