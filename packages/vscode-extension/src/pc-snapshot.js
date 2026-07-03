'use strict';
// pc-snapshot.js — Delivery Cockpit · Frente B backend glue.
//
// Builds the ProjectCommandSnapshot the Project Command tab renders PURELY from. It:
//   1. reads the RUNTIME forecast.json (the CLI writes it, the UI only READS it — contract
//      forecast.js L18); never recomputes the Monte-Carlo cone in the extension host,
//   2. joins each forecast wave with the DECLARED roadmap (effort/type/worktree/goal the
//      forecast record omits), grouped by phase (NOW/NEXT/FRONTIER),
//   3. associates live CC sessions to waves — kind:intent naming the wave (Ledger), else an
//      honest keyword match (a W-id token or the wave's worktree slug in the branch),
//   4. derives an HONEST per-wave progress bar from the Ledger's kind:outcome gate events
//      (fases-que-passaram-o-gate / total) — NEVER decorative wall-time,
//   5. computes lock state from deps (a wave whose deps are not PROVEN done in the Ledger is
//      locked → play warns, never launches into the void — DC guard).
//
// Honesty rule: EVERY field is nullable. Missing → null (renders as n/d). Cold-start (empty
// Ledger) → every cone is calibrating/no_base and every progress is n/d — respected, never faked.
// Pure over its inputs where it can be; the thin fs layer never throws.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Frente A helpers (read-only). Resolve from the repo tree; absent in a packaged build →
// null (we degrade: waves still render from forecast.json, roadmap-only fields become n/d).
function _tryRequire(rel) {
  try { return require(rel); } catch { return null; }
}
const _roadmapMod = _tryRequire('../../../tools/router/forecast/roadmap.js');
const _forecastMod = _tryRequire('../../../tools/router/forecast/forecast.js');
const _ledgerMod = _tryRequire('../../../tools/router/forecast/ledger-read.js');
const parseRoadmap = _roadmapMod && _roadmapMod.parseRoadmap ? _roadmapMod.parseRoadmap : null;
const isStale = _forecastMod && _forecastMod.isStale ? _forecastMod.isStale : null;

const PHASE_ORDER = ['NOW', 'NEXT', 'FRONTIER'];
const PHASE_LABEL = { NOW: 'Agora', NEXT: 'A seguir', FRONTIER: 'Fronteira' };

function num(v) { return (typeof v === 'number' && Number.isFinite(v)) ? v : null; }

// Default Ledger dir — mirrors ledger-read.defaultLedgerDir so we read the SAME journals the
// accumulator writes (MOOTER_HOME/handoff, else ~/.mooter/handoff).
function defaultLedgerDir() {
  if (_ledgerMod && typeof _ledgerMod.defaultLedgerDir === 'function') {
    try { return _ledgerMod.defaultLedgerDir(); } catch { /* fall through */ }
  }
  const home = (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0)
    ? process.env.MOOTER_HOME : path.join(os.homedir(), '.mooter');
  return path.join(home, 'handoff');
}

// Read a JSON file, capped + fail-soft to null.
function readJsonCapped(file, maxBytes) {
  const cap = maxBytes || 4 * 1024 * 1024;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > cap) return null;
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (j && typeof j === 'object') ? j : null;
  } catch { return null; }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

// Load { sid: events[] } from the Ledger dir. Reuse ledger-read's loader when present.
function loadLedgerEvents(dir) {
  if (_ledgerMod && typeof _ledgerMod.loadEventsFromDir === 'function') {
    try { return _ledgerMod.loadEventsFromDir(dir) || {}; } catch { return {}; }
  }
  const bySid = {};
  try {
    for (const f of fs.readdirSync(dir).filter((x) => /\.jsonl$/.test(x))) {
      const sid = f.replace(/\.jsonl$/, '');
      try {
        bySid[sid] = readText(path.join(dir, f)).split('\n').filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      } catch { bySid[sid] = []; }
    }
  } catch { /* no dir → {} */ }
  return bySid;
}

// ── roadmap merge ──────────────────────────────────────────────────────────
// The forecast record omits effort/worktree/goal/type (roadmap's richer Modo string). Merge
// them in by wave_id. Pure. When the parser is unavailable → return waves untouched.
function mergeRoadmap(waves, roadmapMd) {
  // Squad + Estado come from our own content-driven parse (independent of roadmap.js, so they
  // survive even in a packaged build where roadmap.js is absent).
  const extras = parseWaveExtras(roadmapMd);
  const attach = (w, r) => Object.assign({}, w, {
    effort: w.effort != null ? w.effort : (r.effort != null ? r.effort : null),
    worktree: w.worktree != null ? w.worktree : (r.worktree != null ? r.worktree : null),
    goal: w.goal != null ? w.goal : (r.goal != null ? r.goal : null),
    type: r.mode != null ? r.mode : (w.mode != null ? w.mode : null),
    squad: (extras[String(w.wave_id).toUpperCase()] || {}).squad || null,
    estado: (extras[String(w.wave_id).toUpperCase()] || {}).estado || null,
  });
  if (!parseRoadmap || !roadmapMd) return waves.map((w) => attach(w, {}));
  let rm = [];
  try { rm = parseRoadmap(roadmapMd) || []; } catch { rm = []; }
  const byId = {};
  for (const r of rm) if (r && r.wave_id) byId[String(r.wave_id).toUpperCase()] = r;
  return waves.map((w) => attach(w, byId[String(w.wave_id).toUpperCase()] || {}));
}

// ── session ↔ wave association ───────────────────────────────────────────────
// A session belongs to a wave when: (a) its FIRST Ledger intent names the wave id (the
// masterprompt that launched it — the contract), or (b) an honest keyword match: a W-id
// token or the wave's worktree slug appears in the session's name/topic/branch/worktree.
// Never fabricate: no evidence → the session stays unassigned. Pure over its inputs.
function _sessionText(s) {
  const g = (s && s.git) || {};
  return [s && s.name, s && s.topic, s && s.cow, g.branch, s && s.worktree]
    .filter(Boolean).join(' ␟ ').toLowerCase();
}

// Extract the wave id a session's Ledger intent declares (W-id in the launching masterprompt).
function _waveFromIntent(events) {
  const evs = Array.isArray(events) ? events : [];
  const intent = evs.find((e) => e && e.kind === 'intent') || null;
  if (!intent) return null;
  const parts = [];
  const inp = intent.input;
  if (inp && typeof inp === 'object') { if (inp.q) parts.push(inp.q); if (inp.title) parts.push(inp.title); }
  if (intent.assistant_snippet) parts.push(String(intent.assistant_snippet));
  const m = parts.join(' ').match(/\bW(\d+(?:\.\d+)?)\b/i);
  return m ? ('W' + m[1]).toUpperCase() : null;
}

function associateSessions(waves, sessions, ledgerBySid) {
  const byWave = {};
  const unassigned = [];
  const ids = waves.map((w) => String(w.wave_id).toUpperCase());
  const idSet = {};
  for (const id of ids) idSet[id] = true;
  const slugs = waves.map((w) => ({
    id: String(w.wave_id).toUpperCase(),
    slug: (w.worktree ? String(w.worktree).replace(/[`]/g, '').trim().toLowerCase() : null),
  }));
  for (const s of (sessions || [])) {
    if (!s) continue;
    let waveId = null;
    // (a) Ledger intent
    const evs = (ledgerBySid && s.sid && ledgerBySid[s.sid]) ? ledgerBySid[s.sid] : null;
    const fromIntent = _waveFromIntent(evs);
    if (fromIntent && idSet[fromIntent]) waveId = fromIntent;
    // (b) keyword match
    if (!waveId) {
      const txt = _sessionText(s);
      const tok = txt.match(/\bw(\d+(?:\.\d+)?)\b/);
      if (tok && idSet['W' + tok[1]]) waveId = 'W' + tok[1];
    }
    if (!waveId) {
      const txt = _sessionText(s);
      for (const sg of slugs) { if (sg.slug && sg.slug.length > 3 && txt.indexOf(sg.slug) >= 0) { waveId = sg.id; break; } }
    }
    if (waveId) { (byWave[waveId] = byWave[waveId] || []).push(s); }
    else unassigned.push(s);
  }
  return { byWave, unassigned };
}

// ── honest progress from Ledger kind:outcome ────────────────────────────────
// % = masterprompt phases that PASSED the gate / total. Never decorative time. Reads the
// concatenated events of the sessions associated to a wave. Pure. No outcomes → null (n/d).
function _outcomePassed(ev) {
  if (!ev || ev.kind !== 'outcome') return false;
  const o = ev.output || ev.out || {};
  if (o.gate === 'pass' || o.passed === true || o.ok === true) return true;
  const st = String(o.status || o.result || ev.status || '').toLowerCase();
  return /\b(pass|passed|green|verde|ship|ok|✓)\b/.test(st);
}
function _phaseNum(ev) {
  const o = (ev && (ev.output || ev.out)) || {};
  const cand = [o.phase, o.phase_num, o.step, ev && ev.phase];
  for (const c of cand) { const n = num(typeof c === 'string' ? parseInt(c, 10) : c); if (n != null) return n; }
  return null;
}
function _phaseTotal(ev) {
  const o = (ev && (ev.output || ev.out)) || {};
  const cand = [o.phase_total, o.phases, o.total, o.of, ev && ev.phase_total];
  for (const c of cand) { const n = num(typeof c === 'string' ? parseInt(c, 10) : c); if (n != null && n > 0) return n; }
  return null;
}
function waveProgressFromEvents(events) {
  const evs = (Array.isArray(events) ? events : []).filter((e) => e && e.kind === 'outcome');
  if (!evs.length) return null;
  let passed = 0, total = null, curPhase = null, maxPhase = 0;
  for (const ev of evs) {
    if (_outcomePassed(ev)) passed++;
    const pt = _phaseTotal(ev); if (pt != null) total = Math.max(total || 0, pt);
    const pn = _phaseNum(ev); if (pn != null) { maxPhase = Math.max(maxPhase, pn); curPhase = pn; }
  }
  const pct = (total != null && total > 0) ? Math.max(0, Math.min(100, Math.round((passed / total) * 100))) : null;
  return { passed, total, pct, currentPhase: curPhase, phasesSeen: maxPhase || null };
}

// A dep is MET only when that wave is PROVEN complete in the Ledger (progress pct === 100).
// No proof → not met (locked). This is the honest floor of the DC guard: never launch into
// the void; downstream waves unlock as the Ledger records their upstreams closing.
function depsWithMet(deps, progressByWave) {
  return (deps || []).map((id) => {
    const up = progressByWave[String(id).toUpperCase()];
    const met = !!(up && up.pct === 100);
    return { id: String(id).toUpperCase(), met };
  });
}

// ══ v2 · EIXO SQUAD + FLUXO/WIP ═══════════════════════════════════════════════
// Everything below derives from REAL signals only (roadmap columns · live Ledger
// sessions · git worktree list · recent git log). No signal → 💤 dormant / n/d,
// NEVER a painted-green dot. Pure over its inputs; the git signals are gathered by
// the host (extension.js) and passed in (opts.gitSignals) so this stays testable.

const WIP_HEALTHY_LIMIT = 3; // roadmap principle #5: "baixar WIP — a régua nº1".
                             // 3 concurrent in-flight streams is the kanban-ish ceiling;
                             // above it, context-switching tax > throughput. Alert, don't block.

// -- roadmap table parsing (Squad + Estado columns; content-driven, never throws) --
function _clean(cell) { return String(cell == null ? '' : cell).replace(/`/g, '').replace(/\*\*/g, '').replace(/^\s+|\s+$/g, ''); }
function _cells(line) {
  const raw = String(line);
  if (raw.indexOf('|') < 0) return null;
  let parts = raw.split('|');
  if (parts.length && parts[0].trim() === '') parts = parts.slice(1);
  if (parts.length && parts[parts.length - 1].trim() === '') parts = parts.slice(0, -1);
  return parts.map((c) => c.trim());
}
function _isSep(cells) { return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, ''))); }
const _WAVE_ID_RE = /^W\d+(?:\.\d+)?$/i;

// The leading emoji/symbol cluster of a squad label (the stable join key: wave rows and the
// squad-def table share the emoji even when the text differs, e.g. "Obs" vs "Observability").
function squadEmoji(raw) {
  const s = String(raw || '');
  const m = s.match(/^([^A-Za-z0-9]+)/);
  return m ? m[1].replace(/\s+/g, '').trim() : '';
}
function squadLabel(raw) {
  const s = String(raw || '');
  const m = s.match(/[A-Za-z0-9].*$/);
  return m ? m[0].trim() : s.trim();
}
function squadKey(raw) { const e = squadEmoji(raw); return (e || squadLabel(raw).slice(0, 3).toLowerCase()) || 'squad'; }

// Per-wave Squad + Estado from the roadmap wave tables (header-driven column indices).
function parseWaveExtras(md) {
  const out = {};
  const lines = String(md == null ? '' : md).split(/\r?\n/);
  let hdr = null;
  for (const line of lines) {
    const cells = _cells(line);
    if (!cells) continue;
    if (_isSep(cells)) continue;
    const lower = cells.map((c) => _clean(c).toLowerCase());
    if (lower.some((c) => /\bwave\b/.test(c)) && lower.some((c) => /squad/.test(c))) {
      hdr = {};
      lower.forEach((c, i) => {
        if (/squad/.test(c) && hdr.squad == null) hdr.squad = i;
        else if (/estado|state|status/.test(c) && hdr.estado == null) hdr.estado = i;
      });
      continue;
    }
    const idIdx = cells.findIndex((c) => _WAVE_ID_RE.test(_clean(c)));
    if (idIdx < 0 || !hdr) continue;
    const id = _clean(cells[idIdx]).toUpperCase();
    if (out[id]) continue;
    out[id] = {
      squad: (hdr.squad != null && hdr.squad < cells.length) ? _clean(cells[hdr.squad]) : null,
      estado: (hdr.estado != null && hdr.estado < cells.length) ? _clean(cells[hdr.estado]) : null,
    };
  }
  return out;
}

// The Squads definition table (Squad | Tipo | Frente) → keyed by emoji.
function parseSquadDefs(md) {
  const defs = {};
  const lines = String(md == null ? '' : md).split(/\r?\n/);
  let hdr = null;
  for (const line of lines) {
    const cells = _cells(line);
    if (!cells) continue;
    if (_isSep(cells)) continue;
    const lower = cells.map((c) => _clean(c).toLowerCase());
    if (lower[0] === 'squad' && lower.some((c) => /tipo|type/.test(c)) && lower.some((c) => /frente|front|remit/.test(c))) {
      hdr = { squad: 0, tipo: lower.findIndex((c) => /tipo|type/.test(c)), frente: lower.findIndex((c) => /frente|front|remit/.test(c)) };
      continue;
    }
    if (!hdr) continue;
    const raw = _clean(cells[0] || '');
    if (!raw || /^phase|^fase|^#$/i.test(raw)) continue;
    const emoji = squadEmoji(raw);
    if (!emoji) continue; // squad rows all carry an emoji; skips stray tables
    defs[emoji] = {
      label: squadLabel(raw), emoji,
      type: (hdr.tipo >= 0 && hdr.tipo < cells.length) ? _clean(cells[hdr.tipo]) : null,
      frente: (hdr.frente >= 0 && hdr.frente < cells.length) ? _clean(cells[hdr.frente]) : null,
    };
  }
  return defs;
}

// -- git signals (worktree list + recent log). parseWorktrees is pure over the porcelain
// string so the host can shell out and this stays testable. --
function parseWorktrees(porcelain) {
  const out = [];
  let cur = null;
  for (const raw of String(porcelain || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.indexOf('worktree ') === 0) { if (cur) out.push(cur); cur = { path: line.slice(9), branch: null, sha: null, bare: false, detached: false }; }
    else if (!cur) continue;
    else if (line.indexOf('HEAD ') === 0) cur.sha = line.slice(5);
    else if (line.indexOf('branch ') === 0) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === 'bare') cur.bare = true;
    else if (line === 'detached') cur.detached = true;
  }
  if (cur) out.push(cur);
  return out;
}

// Health of a squad — DERIVED, with its evidence attached (auditable, never a bare dot).
//   active 🟢  = ≥1 live session (working/needs-you) on the squad's waves  (Ledger)
//   warm   🟡  = no live session but a live worktree OR a recent commit in the area (git)
//   dormant 💤 = no real signal at all — honest, NEVER painted green
function deriveSquadHealth(squadWaveRecs, gitSignals) {
  const worktrees = (gitSignals && Array.isArray(gitSignals.worktrees)) ? gitSignals.worktrees : [];
  const commits = (gitSignals && Array.isArray(gitSignals.commits)) ? gitSignals.commits : [];
  const recentShas = new Set(commits.map((c) => String(c.sha)));
  let live = 0, wt = 0, recent = 0;
  const slugs = [], ids = [];
  for (const w of squadWaveRecs) {
    ids.push(String(w.wave_id).toUpperCase());
    if (w.worktree) slugs.push(String(w.worktree).replace(/[`]/g, '').trim().toLowerCase());
    for (const s of (w.sessions || [])) { if (s && (s.status === 'working' || s.status === 'needs-you')) live++; }
  }
  const matchesArea = (txt) => {
    const t = String(txt || '').toLowerCase();
    for (const sl of slugs) { if (sl && sl.length > 3 && t.indexOf(sl) >= 0) return true; }
    for (const id of ids) { const e = id.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (new RegExp('\\b' + e + '\\b').test(t)) return true; }
    return false;
  };
  for (const w of worktrees) { if (matchesArea(w.path) || matchesArea(w.branch)) { wt++; if (recentShas.has(String(w.sha))) recent++; } }
  for (const c of commits) { if (matchesArea(c.subject)) recent++; }
  const level = live > 0 ? 'active' : ((wt > 0 || recent > 0) ? 'warm' : 'dormant');
  return { level, evidence: { live, worktrees: wt, recentCommits: recent } };
}

// Flow/WIP — DORA-flavoured, from real signals. WIP = non-main worktrees; "active WIP" =
// those recently committed to or holding a live session (the real in-flight streams). Alert
// fires on active WIP above the healthy ceiling — the honest "you're spread too thin" signal.
function buildFlow(waveRecs, allSessions, gitSignals, now) {
  const worktrees = (gitSignals && Array.isArray(gitSignals.worktrees)) ? gitSignals.worktrees : [];
  const commits = (gitSignals && Array.isArray(gitSignals.commits)) ? gitSignals.commits : [];
  const _now = num(now) != null ? now : Date.now();
  const WEEK = 7 * 24 * 3600 * 1000;
  const recent7 = new Set(commits.filter((c) => num(c.ts) != null && (_now - c.ts * 1000) <= WEEK).map((c) => String(c.sha)));
  const liveBranches = new Set((allSessions || []).filter((s) => s && (s.status === 'working' || s.status === 'needs-you') && s.git && s.git.branch).map((s) => String(s.git.branch)));

  // WIP is worktree-derived. A live repo ALWAYS lists ≥1 worktree (main), so an empty list means
  // git could not be read (missing/timeout/not-a-repo) → WIP is UNKNOWN, render n/d. Never 0-as-fact
  // (honesty: "0 because we looked and found none" ≠ "n/d because we couldn't look"). A legit 0
  // in-flight streams (only main checked out) still reports total 0 — we DID look. (DC honesty rule.)
  const nonMain = worktrees.filter((w) => !w.bare && w.branch && !/^(main|master)$/.test(w.branch));
  const active = nonMain.filter((w) => recent7.has(String(w.sha)) || liveBranches.has(String(w.branch)));
  const wip = (worktrees.length === 0)
    ? { total: null, active: null, stale: null, limit: WIP_HEALTHY_LIMIT, over: false, sample: [], no_signal: true }
    : {
      total: nonMain.length,
      active: active.length,
      stale: Math.max(0, nonMain.length - active.length),
      limit: WIP_HEALTHY_LIMIT,
      over: active.length > WIP_HEALTHY_LIMIT,
      sample: active.slice(0, 6).map((w) => (w.branch || (w.path ? w.path.split(/[\\/]/).pop() : '?'))),
    };

  // deploy frequency: merges in the last 30d → per week (real, from git).
  const MONTH = 30 * 24 * 3600 * 1000;
  const merges30 = commits.filter((c) => c.isMerge && num(c.ts) != null && (_now - c.ts * 1000) <= MONTH).length;
  const deployFreqPerWeek = (worktrees.length || commits.length) ? Number((merges30 / (30 / 7)).toFixed(1)) : null;

  // waves shipped: declared ✅ in the roadmap Estado column (real, human-authored).
  const wavesDone = waveRecs.filter((w) => /✅|done|shipped|aterr/i.test(String(w.estado || ''))).length;

  const needYou = (allSessions || []).filter((s) => s && s.status === 'needs-you').map(mapWaveSession);

  return {
    need_you: needYou,
    wip,
    deploy_freq_per_week: deployFreqPerWeek,
    merges_30d: (worktrees.length || commits.length) ? merges30 : null,
    waves_done: wavesDone,
    cycle_time: null, // n/d until the Ledger carries intent→outcome spans (honest cold-start)
  };
}

// ── main assembler ───────────────────────────────────────────────────────────
function buildProjectCommand(opts) {
  const o = opts || {};
  const repoRoot = o.repoRoot || process.cwd();
  const forecastPath = o.forecastPath || path.join(repoRoot, 'tools', 'router', 'forecast', 'forecast.json');
  const roadmapPath = o.roadmapPath || path.join(repoRoot, 'docs', 'strategy', 'MOOTER_ROADMAP.md');
  const ledgerDir = o.ledgerDir || defaultLedgerDir();
  const sessions = Array.isArray(o.sessions) ? o.sessions.filter(Boolean) : [];

  const fc = (o.forecast && typeof o.forecast === 'object') ? o.forecast : readJsonCapped(forecastPath);
  const roadmapMd = o.roadmapMd != null ? o.roadmapMd : readText(roadmapPath);

  if (!fc || !Array.isArray(fc.waves)) {
    // No forecast.json yet → honest "run the CLI" state (never fabricate a cone).
    return {
      schema: 'mooter.projectcommand/2',
      forecast_missing: true,
      generated_ts: null, scope_hash: null, injection_rate: null, k: null, window: null,
      stale: null, phases: [], squads: [], flow: buildFlow([], sessions, o.gitSignals || null, o.now),
      unassigned_sessions: sessions.map(mapWaveSession), counts: { total: 0, cone: 0, calibrating: 0, no_base: 0 },
      cli_hint: 'node tools/router/forecast/forecast.js --out tools/router/forecast/forecast.json',
    };
  }

  const merged = mergeRoadmap(fc.waves, roadmapMd);
  const ledgerBySid = loadLedgerEvents(ledgerDir);
  const assoc = associateSessions(merged, sessions, ledgerBySid);

  // Per-wave progress (from the associated sessions' Ledger outcomes), computed first so deps
  // can read upstream completion.
  const progressByWave = {};
  for (const w of merged) {
    const id = String(w.wave_id).toUpperCase();
    const sess = assoc.byWave[id] || [];
    let evs = [];
    for (const s of sess) { const e = s.sid && ledgerBySid[s.sid]; if (Array.isArray(e)) evs = evs.concat(e); }
    progressByWave[id] = waveProgressFromEvents(evs);
  }

  let stale = null;
  if (typeof isStale === 'function') { try { stale = !!isStale(fc, roadmapMd); } catch { stale = null; } }

  const counts = { total: merged.length, cone: 0, calibrating: 0, no_base: 0 };
  const recordFor = (w) => {
    const id = String(w.wave_id).toUpperCase();
    const state = w.no_base ? 'no_base' : (w.calibrating ? 'calibrating' : (w.p50_wall != null ? 'cone' : 'no_base'));
    if (state === 'cone') counts.cone++; else if (state === 'calibrating') counts.calibrating++; else counts.no_base++;
    const deps = depsWithMet(w.deps, progressByWave);
    const unmet = deps.filter((d) => !d.met).map((d) => d.id);
    const prog = progressByWave[id] || null;
    const running = (assoc.byWave[id] || []).some((s) => s && s.status === 'working');
    return {
      wave_id: id,
      name: w.name || null,
      goal: w.goal || null,
      phase: w.phase || null,
      squad: w.squad || null,
      squad_key: w.squad ? squadKey(w.squad) : null,
      squad_emoji: w.squad ? squadEmoji(w.squad) : null,
      estado: w.estado || null,
      type: w.type || w.mode || null,
      mode: w.mode || null,
      class: w.class || null,
      effort: w.effort || null,
      worktree: w.worktree || null,
      deps,
      locked: unmet.length > 0,
      lock_reason: unmet.length ? ('espera ' + unmet.join(', ') + ' — sem prova de conclusão no Ledger') : null,
      running,
      forecast: {
        state,
        p50_work: num(w.p50_work), p90_work: num(w.p90_work),
        p50_wall: num(w.p50_wall), p90_wall: num(w.p90_wall),
        human: w.human || null,
        premises: w.premises || null,
        calibrating_progress: w.calibrating_progress || null,
        samples_n: num(w.samples_n),
        reliability: w.reliability != null ? w.reliability : null,
        drivers: Array.isArray(w.drivers) ? w.drivers : [],
        note: w.note || null,
        half_life: w.half_life || null,
      },
      progress: prog,
      sessions: (assoc.byWave[id] || []).map(mapWaveSession),
    };
  };

  // Materialise every wave record ONCE, then group two ways (Fase and Squad) over the same set.
  const allRecs = merged.map(recordFor);
  const recById = {};
  for (const r of allRecs) recById[r.wave_id] = r;

  const phases = PHASE_ORDER.map((key) => ({
    key,
    label: PHASE_LABEL[key] || key,
    waves: allRecs.filter((r) => String(r.phase || '').toUpperCase() === key),
  })).filter((p) => p.waves.length);

  // ── EIXO SQUAD: lanes per declared squad, health DERIVED from real signals ──
  const gitSignals = o.gitSignals || null;
  const squadDefs = parseSquadDefs(roadmapMd);
  const squadOrder = [];
  const squadMap = {};
  for (const r of allRecs) {
    if (!r.squad) { (squadMap.__none = squadMap.__none || { key: '__none', emoji: '🗂️', label: 'Sem squad', waves: [] }); squadMap.__none.waves.push(r); if (squadOrder.indexOf('__none') < 0) squadOrder.push('__none'); continue; }
    const em = r.squad_emoji || squadEmoji(r.squad);
    const key = em || squadKey(r.squad);
    if (!squadMap[key]) {
      const def = squadDefs[em] || {};
      squadMap[key] = { key, emoji: em || '🗂️', label: squadLabel(r.squad), type: def.type || null, frente: def.frente || null, waves: [] };
      squadOrder.push(key);
    }
    squadMap[key].waves.push(r);
  }
  const squads = squadOrder.map((k) => {
    const sq = squadMap[k];
    sq.health = (k === '__none') ? { level: 'dormant', evidence: { live: 0, worktrees: 0, recentCommits: 0 } } : deriveSquadHealth(sq.waves, gitSignals);
    return sq;
  });

  const flow = buildFlow(allRecs, sessions, gitSignals, o.now);

  return {
    schema: 'mooter.projectcommand/2',
    forecast_missing: false,
    generated_ts: fc.generated_ts || null,
    scope_hash: fc.scope_hash || null,
    injection_rate: num(fc.injection_rate),
    k: num(fc.k), window: num(fc.window),
    stale,
    phases,
    squads,
    flow,
    unassigned_sessions: assoc.unassigned.map(mapWaveSession),
    counts,
  };
}

// Trim a mapped session to the fields the sub-session row needs (branch@sha + git chips +
// click-to-tab). Honest git state from the session's OWN provenance (never invented).
function mapWaveSession(s) {
  const g = (s && s.git) || {};
  const dirty = num(g.dirty);
  const ahead = num(g.ahead);
  return {
    sid: (s && s.sid) || null,
    name: (s && (s.name || s.topic)) || null,
    topic: (s && s.topic) || null,
    branch: g.branch || null,
    sha: g.sha ? String(g.sha).slice(0, 7) : null,
    dirty, ahead,
    uncommitted: dirty != null ? dirty > 0 : null,
    pushNeeded: (g.pushNeeded === true) || (ahead != null && ahead > 0),
    status: (s && s.status) || null,
    model: (s && s.model) || null,
    mode: (s && s.mode) || null,
  };
}

module.exports = {
  buildProjectCommand,
  mergeRoadmap,
  associateSessions,
  waveProgressFromEvents,
  depsWithMet,
  mapWaveSession,
  loadLedgerEvents,
  defaultLedgerDir,
  PHASE_ORDER,
  // v2 · squad axis + flow/WIP (pure; testable)
  parseWaveExtras,
  parseSquadDefs,
  parseWorktrees,
  deriveSquadHealth,
  buildFlow,
  squadEmoji,
  squadLabel,
  squadKey,
  WIP_HEALTHY_LIMIT,
};
