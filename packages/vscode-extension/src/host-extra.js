// host-extra.js — v0.2 host services: ollama, mode, sub-profile, statusline, slash.
// Pure node (no vscode import) → testable. Never throws, always resolves.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { httpJson } = require('./data.js');

const ROUTER = path.join(os.homedir(), '.claude', 'tools', 'router');
const MODE_FILE = path.join(ROUTER, '.mooter-mode.json');

// WCOCKPIT: mode-registry + cowork-waiting (aditivo — carregados lazy para evitar crash em ambientes sem src/)
let _modeRegistry = null, _coworkWaiting = null;
function modeRegistry() { if (!_modeRegistry) try { _modeRegistry = require('./mode-registry'); } catch { _modeRegistry = { decorate: (r) => r, byProject: (rows) => ({ Unassigned: rows }) }; } return _modeRegistry; }
function coworkWaiting() { if (!_coworkWaiting) try { _coworkWaiting = require('./cowork-waiting'); } catch { _coworkWaiting = { readCoworkPending: () => null, decorate: (r) => r }; } return _coworkWaiting; }
const SUB_PROFILE = path.join(ROUTER, 'subscription-profile.json');
const CLI_CANDIDATES = [
  path.join(os.homedir(), '.mooter', 'cli-v1', 'mooter.js'),
  path.join(os.homedir(), '.mooter', 'cli', 'mooter.js'),
];
const MOOTER_CLI = CLI_CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || CLI_CANDIDATES[1];

function execNode(script, args = [], timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(script)) return resolve({ ok: false, out: '' });
    execFile(process.execPath, [script, ...args], { timeout: timeoutMs, maxBuffer: 1024 * 512 },
      (err, stdout) => resolve({ ok: !err, out: String(stdout || '') }));
  });
}

// Run an arbitrary executable on PATH (git, gh) and capture stdout. Mirrors execNode's
// contract: never throws, always resolves { ok, out }. shell:false → no injection from
// the cwd path (args are passed as an array, not interpolated). Used only by the deep
// refresh, always with a timeout, so a hung/offline git/gh can never block the cockpit.
function execTool(cmd, args = [], timeoutMs = 6000, cwd) {
  return new Promise((resolve) => {
    try {
      const opts = { timeout: timeoutMs, maxBuffer: 1024 * 512, windowsHide: true };
      if (cwd) opts.cwd = cwd; // run git/gh INSIDE the session's repo → repo-correct results
      execFile(cmd, args, opts,
        (err, stdout) => resolve({ ok: !err, out: String(stdout || '').trim() }));
    } catch { resolve({ ok: false, out: '' }); }
  });
}

async function ollamaModels() {
  const r = await httpJson(11434, '/api/tags', 1500);
  if (!r || !Array.isArray(r.models)) return null; // null = ollama down
  return r.models.map((m) => ({ name: m.name, sizeGb: m.size ? +(m.size / 1e9).toFixed(1) : null }));
}

function readMode() {
  try {
    const j = JSON.parse(fs.readFileSync(MODE_FILE, 'utf8'));
    return j.mode || 'auto';
  } catch { return 'auto'; }
}
function setMode(mode) {
  if (!['beast', 'zen', 'auto'].includes(mode)) return Promise.resolve({ ok: false });
  return execNode(path.join(ROUTER, 'mooter-mode.js'), [mode]);
}

function readSubProfile() {
  try { return JSON.parse(fs.readFileSync(SUB_PROFILE, 'utf8')); } catch { return null; }
}

// ANSI → safe HTML spans (covers the SGR codes statusline-multi emits:
// 38;2;r;g;b truecolor fg, 1 bold, 2 dim, 3x basic colors, 0 reset).
const BASIC = { 30:'#666',31:'#e06c75',32:'#4ec97a',33:'#e5c07b',34:'#61afef',35:'#c678dd',36:'#56b6c2',37:'#ddd',90:'#888' };
function ansiToHtml(text) {
  const esc = (x) => x.replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let html = '', open = 0;
  for (const part of String(text).split(/(\x1b\[[0-9;]*m)/)) {
    const m = part.match(/^\x1b\[([0-9;]*)m$/);
    if (!m) { html += esc(part); continue; }
    const codes = m[1].split(';').map(Number);
    if (codes[0] === 0 || m[1] === '') { html += '</span>'.repeat(open); open = 0; continue; }
    let style = '';
    if (codes[0] === 38 && codes[1] === 2) style = `color:rgb(${codes[2]},${codes[3]},${codes[4]})`;
    else if (codes[0] === 1) style = 'font-weight:700';
    else if (codes[0] === 2) style = 'opacity:.55';
    else if (BASIC[codes[0]]) style = `color:${BASIC[codes[0]]}`;
    html += `<span style="${style}">`; open++;
  }
  return html + '</span>'.repeat(open);
}

async function statuslineHtml() {
  const r = await execNode(path.join(ROUTER, 'statusline-multi.js'), [], 5000);
  if (!r.ok || !r.out.trim()) return null;
  return r.out.trimEnd().split('\n').map(ansiToHtml).join('<br>');
}

async function slashStatus() {
  const r = await execNode(MOOTER_CLI, ['slash-commands', 'status'], 8000);
  if (!r.out) return { installed: null, raw: '' };
  const t = r.out.toLowerCase();
  return { installed: t.includes('installed') && !t.includes('not installed'), raw: r.out.trim().slice(0, 300) };
}

// ── v0.3 services ───────────────────────────────────────────────────────
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

const MOOTER_HOME = path.join(os.homedir(), '.mooter');
function deviceProfile() { return readJson(path.join(ROUTER, 'device-profile.json')); }
function hwCapability() { return readJson(path.join(ROUTER, 'hw-capability.json')); }
function quantSnapshot() { return readJson(path.join(MOOTER_HOME, 'cache', 'quant-snapshot.json')); }
function preferences() { return readJson(path.join(MOOTER_HOME, 'preferences.json')); }
function installedPacks() { return readJson(path.join(MOOTER_HOME, 'installed_packs.json')); }

const BUDGET_PATHS = [path.join(MOOTER_HOME, 'budget-config.json')];// only ~/.mooter — legacy home path removed (migration is one-way; rebrand doctrine)
function readBudget() { for (const p of BUDGET_PATHS) { const j = readJson(p); if (j) return j; } return null; }
function writeBudget(usd) {
  const n = Math.max(0, Math.min(10000, Number(usd) || 0));
  const p = BUDGET_PATHS[0];
  try {
    const cur = readJson(p) || {};
    if (fs.existsSync(p)) fs.copyFileSync(p, p + '.bak');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    cur.monthly_budget_usd = n;
    cur.updated_at = new Date().toISOString();
    cur.updated_by = 'vscode-cockpit';
    fs.writeFileSync(p, JSON.stringify(cur, null, 2));
    return { ok: true, value: n };
  } catch { return { ok: false }; }
}

// W2: per-prompt "next prompt" model pin. The cockpit writes this file; the engine
// hook (inject_context.js) reads+consumes it on the next UserPromptSubmit — a local
// ollama id ("qwen2.5:3b") routes to T0+that model, a claude-* id to its tier.
// Empty/Auto clears any pending pin. Consume-once is enforced by the engine.
const PIN_NEXT_FILE = path.join(ROUTER, '.pin-next.json');
function readPinNext() { const j = readJson(PIN_NEXT_FILE); return j && j.model ? { model: j.model } : null; }
function writePinNext(model) {
  const m = String(model || '').trim();
  try {
    if (!m) { try { fs.unlinkSync(PIN_NEXT_FILE); } catch { /* already absent */ } return { ok: true, model: '' }; }
    if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(m)) return { ok: false };
    fs.mkdirSync(path.dirname(PIN_NEXT_FILE), { recursive: true });
    fs.writeFileSync(PIN_NEXT_FILE, JSON.stringify({ model: m, scope: 'once', set_by: 'vscode-cockpit', at: new Date().toISOString() }, null, 2));
    return { ok: true, model: m };
  } catch { return { ok: false }; }
}

// Live Routing descriptor for the cockpit "who handled this prompt" cow. Built from
// the tracker /last decision; maps the model to its canonical family emoji/colour
// (llm-emoji-map) so the plugin matches the terminal statusline. Returns null when
// there's no decision yet.
let _emojiMod;
function _emoji() {
  if (_emojiMod !== undefined) return _emojiMod;
  try { _emojiMod = require(path.join(ROUTER, 'llm-emoji-map.js')); } catch { _emojiMod = null; }
  return _emojiMod;
}
const FAMILY_HEX = { amber: '#E5C07B', tan: '#C9A876', blue: '#5A9BD4', green: '#4CAF6A', gold: '#F2C94C', pink: '#E8888A', gray: '#8A8076' };
function _fam(model) {
  const em = _emoji();
  const d = (em && em.emojiForModel) ? em.emojiForModel(model) : { emoji: '🤖', label: 'Model', color: 'gray' };
  return { emoji: d.emoji, label: d.label, color: FAMILY_HEX[d.color] || FAMILY_HEX.gray };
}
function _isLocalId(model) { return !/^claude-/i.test(model) && String(model).includes(':'); }

// The Live cow's coherence fix (honesty mandate): the tracker /last carries the
// router's RECOMMENDED model (an advisory tier decision), which is NOT proof of what
// answered. In a Claude Code session the HOST model answers every turn regardless;
// the recommendation only executes for real local dispatches (router-execute) or
// spawned subagents. So we separate two axes and never let the recommendation
// masquerade as execution:
//   • executor (cow identity)  — ground truth: opts.hostModel (this session's
//     answering model, from the token ledger) or a real local dispatch
//     (opts.lastExecution from /last-execution).
//   • recommended (advisory)   — what the classifier suggested, shown dimmed.
// Falls back to the recommendation flagged real:false only when no execution is
// known yet — so the UI can say "recommended (not confirmed)" instead of lying.
function liveRouting(last, opts) {
  opts = opts || {};
  let recommended = null;
  if (last && last.model_full) {
    const rm = String(last.model_full); const f = _fam(rm);
    recommended = {
      model: rm, tier: last.tier || '', emoji: f.emoji, label: f.label, color: f.color,
      provider: (f.label === 'Ollama' || _isLocalId(rm)) ? 'local' : 'cloud',
      why: last.user_override ? 'pinned' : (String(last.cascade_path || '').includes('→') ? 'cascade' : 'auto'),
      cascade: last.cascade_path || '', confidence: last.confidence != null ? last.confidence : null,
    };
  }
  let dispatch = null;
  const ex = opts.lastExecution;
  if (ex && ex.ok && (ex.model || ex.model_full)) {
    const dm = String(ex.model || ex.model_full); const f = _fam(dm);
    dispatch = { model: dm, emoji: f.emoji, label: f.label, color: f.color };
  }
  let host = null;
  if (opts.hostModel) {
    const hm = String(opts.hostModel); const f = _fam(hm);
    host = { model: hm, emoji: f.emoji, label: f.label, color: f.color };
  }
  let exec;
  if (host) exec = { ...host, provider: 'cloud', real: true, scope: 'session' };
  else if (dispatch) exec = { ...dispatch, provider: 'local', real: true, scope: 'dispatch' };
  else if (recommended) exec = { model: recommended.model, emoji: recommended.emoji, label: recommended.label, color: recommended.color, provider: recommended.provider, real: false, scope: 'recommended' };
  else return null;
  return {
    model: exec.model, emoji: exec.emoji, label: exec.label, color: exec.color,
    provider: exec.provider, real: exec.real, scope: exec.scope,
    recommended,
    // surface a real local dispatch as an extra chip when it isn't already the identity
    dispatch: (dispatch && exec.scope !== 'dispatch') ? dispatch : null,
    tier: (recommended && recommended.tier) || (last && last.tier) || '',
    why: recommended ? recommended.why : 'auto',
    cascade: recommended ? recommended.cascade : '',
    confidence: recommended ? recommended.confidence : null,
    ts: (last && last.ts) || '',
  };
}

// The 10 slash sub-commands from the canonical /mooter SKILL template.
const SLASH_CMDS = ['route', 'savings', 'explain', 'digest', 'local', 'why-not-fable', 'tier', 'mcp', 'vision', 'bench'];

// Mooter Score — 8 equally-weighted setup checks (explainable, req 12).
function mooterScore(ctx) {
  const checks = [
    { k: 'engine',  t: 'Routing engine installed',        ok: !!ctx.runtimeInstalled, fix: 'install' },
    { k: 'tracker', t: 'Savings tracker running',         ok: !!ctx.trackerUp,        fix: 'term:mooter doctor' },
    { k: 'ollama',  t: 'Ollama online (free T0 tier)',    ok: Array.isArray(ctx.ollama) && ctx.ollama.length > 0, fix: 'openUrl:https://ollama.com/download' },
    { k: 'reco',    t: 'Recommended model for your GPU',  ok: !!(ctx.hw && ctx.ollama && ctx.ollama.some((m) => m.name.startsWith(String(ctx.hw.recommended_t0 || '').split(':')[0]))), fix: (ctx.hw && ctx.hw.recommended_t0) ? 'pull:' + ctx.hw.recommended_t0 : 'openUrl:https://ollama.com/download' },
    // "Configured" = the profile file exists and setup ran. Supports both the legacy single
    // `profile` field and the current `profiles` map written by setup-profile.js/detect-subscriptions.js
    // (a provider detected — e.g. ollama:'installed' — or a budget strategy counts as configured).
    { k: 'sub',     t: 'Subscription profile configured', ok: !!(ctx.sub && ((ctx.sub.profile && ctx.sub.profile !== 'unknown') || (ctx.sub.profiles && Object.values(ctx.sub.profiles).some((v) => v && v !== 'unknown' && v !== 'none')) || ctx.sub.budget_strategy)), fix: 'term:node ~/.claude/tools/router/setup-profile.js --non-interactive' },
    { k: 'budget',  t: 'Monthly budget set',              ok: !!(ctx.budget && ctx.budget.monthly_budget_usd > 0), fix: 'tab:setup' },
    { k: 'slash',   t: '/mooter slash commands',          ok: !!(ctx.slash && ctx.slash.installed), fix: 'slashInstall' },
    { k: 'packs',   t: 'At least one Moo Pack installed', ok: !!(installedPacks() && Object.keys(installedPacks() || {}).length > 0), fix: 'term:mooter pack list' },
  ];
  const done = checks.filter((c) => c.ok).length;
  return { pct: Math.round((100 * done) / checks.length), done, total: checks.length, checks };
}

// ── v0.4 'Brand & Brain' services ───────────────────────────────────────
function cli(args, timeoutMs = 8000) { return execNode(MOOTER_CLI, args, timeoutMs); }

// Pure parsers (fixture-tested) — formats locked against real CLI output 2026-06-12.
function parseEffort(out) { const m = String(out).match(/effort:\s*(\w+)/); return m ? m[1] : null; }
function parseIntent(out) {
  const cmd = (String(out).match(/resolved to:\s*(.+)/) || [])[1];
  const conf = (String(out).match(/confidence\s*([0-9.]+)/) || [])[1];
  const rule = (String(out).match(/rule:\s*([\w-]+)/) || [])[1];
  return cmd ? { cmd: cmd.trim(), conf: conf ? Number(conf) : null, rule: rule || null } : null;
}
function parseSpanIds(out) {
  const map = [];
  for (const line of String(out).split('\n')) {
    const id = (line.match(/\b([a-f0-9]{8}[a-f0-9-]*)\b/) || [])[1];
    if (id) map.push({ id, line: line.trim().slice(0, 140) });
  }
  return map;
}

async function effortGet() { const r = await cli(['effort', 'show'], 6000); return parseEffort(r.out); }
function effortSet(level) {
  if (!['low', 'default', 'high', 'ultramoo'].includes(level)) return Promise.resolve({ ok: false });
  return cli(['effort', 'set', level], 8000);
}
async function whyNotFable() { const r = await cli(['why-not-fable', '--last', '5'], 9000); return (r.out || '').trim().slice(0, 900) || null; }
async function trailJson() { const r = await cli(['trail', '--json'], 9000); try { return JSON.parse(r.out); } catch { return null; } }
async function securitySummary() { const r = await cli(['security', 'summary'], 9000); return (r.out || '').trim().slice(0, 700) || null; }
async function feedbackSpans() { const r = await cli(['feedback', 'spans', '--last', '40'], 9000); return parseSpanIds(r.out || ''); }
function rateSpan(spanId, n) {
  const id = String(spanId).replace(/[^a-f0-9-]/g, '');
  const v = Math.max(1, Math.min(5, Number(n) || 0));
  if (!id || !v) return Promise.resolve({ ok: false });
  return cli(['feedback', 'span', id, String(v)], 8000);
}
async function intentResolve(text) {
  const t = String(text || '').slice(0, 200);
  if (!t.trim()) return null;
  const r = await cli(['intent', t], 9000);
  return parseIntent(r.out || '');
}


// ── v0.5 telemetry/insights ─────────────────────────────────────────────
function countLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length; } catch { return null; } }
function countFiles(dir) { try { return fs.readdirSync(dir).length; } catch { return null; } }
function mtime(p) { try { return fs.statSync(p).mtime.toISOString(); } catch { return null; } }

function insights(decisions) {
  const ds = decisions || [];
  const cacheHits = ds.filter((d) => d.cache_hit === true).length;
  const confs = ds.map((d) => Number(d.confidence)).filter((n) => !isNaN(n));
  const half = Math.floor(confs.length / 2);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const confNow = avg(confs.slice(0, half || 1));   // newest half (list is newest-first)
  const confPrev = avg(confs.slice(half));
  return {
    cacheRate: ds.length ? Math.round((100 * cacheHits) / ds.length) : null,
    confNow: confNow != null ? +confNow.toFixed(2) : null,
    confPrev: confPrev != null ? +confPrev.toFixed(2) : null,
    fableObs: countFiles(path.join(MOOTER_HOME, 'fable-observations')),
    trainingLines: countLines(path.join(MOOTER_HOME, 'pastor', 'fable-training.jsonl')),
    lastHubPush: mtime(path.join(ROUTER, '.last-hub-push')),
    quantAll: (quantSnapshot() || {}).models || null,
  };
}


// ── v0.6 Herd: agents, workflow run, tokens by LLM × agent ──────────────
const V2_LOG = path.join(ROUTER, 'decisions_v2.jsonl');

function parseV2(text, maxN = 400) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j && j.llm) out.push(j); } catch { /* tolerate */ }
  }
  return out.slice(-maxN);
}

// The literal ask: tokens per LLM per Moo agent. Pivot of decisions_v2.
function herdMatrix(rows) {
  const cells = {}; const llms = new Set(); const vias = new Set();
  for (const r of rows || []) {
    const via = String(r.via || 'inline'); const llm = String(r.llm || '?');
    vias.add(via); llms.add(llm);
    const k = via + '\u0000' + llm;
    if (!cells[k]) cells[k] = { n: 0, tok: 0 };
    cells[k].n++; cells[k].tok += (Number(r.tokens_in) || 0) + (Number(r.tokens_out) || 0);
  }
  const llmList = [...llms].slice(0, 4);
  const viaList = [...vias].sort((a, b) => {
    const sum = (v) => llmList.reduce((acc, l) => acc + ((cells[v + '\u0000' + l] || {}).tok || 0), 0);
    return sum(b) - sum(a);
  }).slice(0, 6);
  return { llms: llmList, vias: viaList, cell: (v, l) => cells[v + '\u0000' + l] || null };
}
function matrixForUi(rows) {
  const m = herdMatrix(rows);
  return { llms: m.llms, rows: m.vias.map((v) => ({ via: v, cells: m.llms.map((l) => m.cell(v, l)) })) };
}

function readSpawns(maxN = 8) {
  const root = path.join(MOOTER_HOME, 'spawns');
  try {
    return fs.readdirSync(root).map((id) => {
      const st = readJson(path.join(root, id, 'state.json')) || {};
      return { id, status: st.status || st.state || '?', task: String(st.task || st.prompt || id).slice(0, 60),
        model: st.model || st.llm || null, mode: st.mode || null, tier: st.tier || null,
        started: st.started_at || st.created_at || st.createdAtMs || null };
    }).sort((a, b) => String(b.started).localeCompare(String(a.started))).slice(0, maxN);
  } catch { return null; }
}
function readHeartbeats() {
  const dir = path.join(MOOTER_HOME, 'orchestration', 'heartbeats');
  try {
    const now = Date.now();
    return fs.readdirSync(dir).slice(0, 32).map((f) => readJson(path.join(dir, f))).filter(Boolean)
      .map((h) => ({ name: h.terminal_name || h.session_id, branch: h.branch, intent: h.intent,
        live: now - (h.last_heartbeat_ms || 0) < 30000 })).slice(0, 8);
  } catch { return null; }
}
function herd() {
  let v2 = [];
  try {
    const stat = fs.statSync(V2_LOG); const start = Math.max(0, stat.size - 128 * 1024);
    const fd = fs.openSync(V2_LOG, 'r'); const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd);
    v2 = parseV2(buf.toString('utf8'));
  } catch { /* absent */ }
  return {
    run: readJson(path.join(MOOTER_HOME, 'workflows', 'active-run.json')),
    current: readJson(path.join(ROUTER, 'last-subagent.json')),
    spawns: readSpawns(),
    sessions: readHeartbeats(),
    matrix: matrixForUi(v2),
    v2count: v2.length,
  };
}

// ── v0.11 Token Ledger ──────────────────────────────────────────────────────
// Real per-model token usage from Claude Code's own session logs (the ground
// truth ccusage/ccost read): ~/.claude/projects/<proj>/<session>.jsonl, one line
// per turn with message.usage. Local (Ollama) calls do NOT appear here — they are
// free, shown separately by the webview from the routing decisions.
// Prices per 1M tokens [input, output] (May/Jun 2026 · advisory). cache_write =
// input×1.25, cache_read = input×0.1. Unknown model → cost null (honest).
const PRICES = {
  'claude-opus-4-8': [5, 25], 'claude-opus-4-7': [5, 25], 'claude-opus-4-6': [5, 25],
  'claude-sonnet-4-6': [3, 15], 'claude-sonnet-4-5': [3, 15],
  'claude-haiku-4-5': [1, 5], 'claude-haiku-4-5-20251001': [1, 5],
  'claude-fable-5': [10, 50],
};
function priceFor(model) {
  const m = String(model || '').toLowerCase();
  if (PRICES[m]) return PRICES[m];
  if (m.includes('fable')) return [10, 50];
  if (m.includes('opus')) return [5, 25];
  if (m.includes('sonnet')) return [3, 15];
  if (m.includes('haiku')) return [1, 5];
  return null; // unknown → cost not asserted
}
function costFor(model, u) {
  const p = priceFor(model); if (!p) return null;
  const [pin, pout] = p;
  return ((u.in || 0) * pin + (u.out || 0) * pout + (u.cw || 0) * pin * 1.25 + (u.cr || 0) * pin * 0.1) / 1e6;
}
function listSessionFiles() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  const out = [];
  try {
    for (const proj of fs.readdirSync(root)) {
      const pdir = path.join(root, proj);
      let st; try { st = fs.statSync(pdir); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const f of fs.readdirSync(pdir)) {
        if (f.endsWith('.jsonl')) { try { out.push({ file: path.join(pdir, f), mtime: fs.statSync(path.join(pdir, f)).mtimeMs }); } catch { /* skip */ } }
      }
    }
  } catch { /* no projects dir */ }
  return out.sort((a, b) => b.mtime - a.mtime);
}
// Aggregate one or more session files by model. Dedup turns by message.id.
// `lastModel` = the model of the most recent real usage line — the host model that
// actually answered this session (ground truth for the Live cow, not the router's
// advisory recommendation). Single-file scope ⇒ this is the true "who ran last".
function aggregateUsage(files) {
  const byModel = {}; const seen = new Set(); let turns = 0; let lastModel = null;
  for (const f of files) {
    let txt = ''; try { const st = fs.statSync(f); const start = Math.max(0, st.size - 8 * 1024 * 1024); const fd = fs.openSync(f, 'r'); const buf = Buffer.alloc(st.size - start); fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd); txt = buf.toString('utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.includes('"usage"')) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      const msg = d && d.message; const u = msg && msg.usage; if (!u || !msg.model) continue;
      // Skip Claude Code's own pseudo-models ('<synthetic>' = "No response requested."
      // with zero usage). They are harness placeholders, not real model spend — keeping
      // them would put a phantom row in the ledger (honesty: only real usage shows).
      if (String(msg.model).charAt(0) === '<') continue;
      const id = msg.id || d.uuid; if (id) { if (seen.has(id)) continue; seen.add(id); }
      const m = msg.model; const a = byModel[m] || (byModel[m] = { model: m, in: 0, out: 0, cw: 0, cr: 0, n: 0 });
      a.in += u.input_tokens || 0; a.out += u.output_tokens || 0;
      a.cw += u.cache_creation_input_tokens || 0; a.cr += u.cache_read_input_tokens || 0; a.n += 1; turns += 1;
      lastModel = m;
    }
  }
  const rows = Object.values(byModel).map((a) => ({ ...a, cost: costFor(a.model, a) }))
    .sort((x, y) => (y.cost || 0) - (x.cost || 0));
  return { rows, turns, lastModel };
}
// scope: 'session' (a specific sessionId, or the most-recent file when omitted) |
// 'all' (every file). Never throws. Passing sessionId scopes the cockpit to ONE
// Claude Code session so its numbers reflect exactly that tab's work.
function tokenLedger(sessionId, opts) {
  const files = listSessionFiles();
  let sessionFiles;
  if (sessionId) {
    const match = files.find((f) => path.basename(f.file).replace(/\.jsonl$/, '') === sessionId);
    sessionFiles = match ? [match.file] : [];
  } else {
    sessionFiles = files.length ? [files[0].file] : [];
  }
  const session = sessionFiles.length ? aggregateUsage(sessionFiles) : { rows: [], turns: 0, lastModel: null };
  // sessionOnly skips the all-time aggregate (every file) — used by the per-session
  // scope path that recomputes every refresh, so it stays cheap (one file).
  const all = (opts && opts.sessionOnly) ? { rows: [], turns: 0, lastModel: null } : aggregateUsage(files.map((f) => f.file));
  return { session, all, sessions: files.length };
}

// The currently ACTIVE session = the one whose prompt was classified most recently
// (inject_context.js writes .last-classified.json with the session_id on every
// UserPromptSubmit, across all terminals). This is the honest auto-follow signal: as
// soon as you send a prompt in a tab, that tab becomes the active session. Returns
// null when nothing has been routed yet.
function activeSession() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROUTER, '.last-classified.json'), 'utf8'));
    return j && j.session_id && j.session_id !== 'unknown' ? { id: j.session_id, ts: j.ts_ms || null } : null;
  } catch { return null; }
}

// Real LOCAL (Ollama/T0) tokens — the honest answer to "list local models like Opus,
// with tokens in/out, cost $0". Local calls are NOT in the Claude transcript, so the
// ledger above can't see them; token_tracker.js records them via the executor path
// (trackCall) into os.tmpdir()/mooter-tokens-<session>.json. We read the most-recent
// session cache and return its measured T0 aggregate. Returns null when nothing was
// metered (never a fabricated number). NOTE: token_tracker meters by TIER, so this is
// the T0 total, not a per-model split — the UI labels it honestly.
let _ttMod;
function _tt() { if (_ttMod !== undefined) return _ttMod; try { _ttMod = require(path.join(ROUTER, 'token_tracker.js')); } catch { _ttMod = null; } return _ttMod; }
function localTokens() {
  try {
    const dir = os.tmpdir();
    const cand = fs.readdirSync(dir)
      .filter((f) => /^mooter-tokens-.+\.json$/.test(f))
      .map((f) => { try { return { sid: f.slice('mooter-tokens-'.length, -'.json'.length), m: fs.statSync(path.join(dir, f)).mtimeMs }; } catch { return null; } })
      .filter(Boolean).sort((a, b) => b.m - a.m);
    if (!cand.length) return null;
    const tt = _tt(); if (!tt || typeof tt.snapshot !== 'function') return null;
    const snap = tt.snapshot(cand[0].sid);
    const t0 = snap && snap.T0;
    if (!t0 || (!t0.calls && !t0.tokens_in && !t0.tokens_out)) return null;
    return { calls: t0.calls || 0, in: t0.tokens_in || 0, out: t0.tokens_out || 0, real: true };
  } catch { return null; }
}

// Recent Claude Code sessions by file activity (mtime) — the honest substitute for
// the old "Herd" facade (spawns/heartbeats/worktrees that don't exist on disk). We
// CANNOT know which VS Code tab is focused (the anthropic.claude-code extension
// exposes no such API, and VS Code gives no cross-extension focus signal), so this is
// labelled "recent", never "active". Each entry carries the real last host model +
// turn count from the transcript. `working` is a heuristic (mtime < 90s), never a claim.
// Human session names = what the user actually typed first (Claude Code's own session
// title is the first prompt). Read from ~/.claude/history.jsonl ({display, sessionId}).
// Skips "[Pasted text]" / "[Image]" placeholders so the name is meaningful. This is the
// same text shown on the session's tab — honest, not fabricated.
function sessionNames(maxBytes = 1024 * 1024) {
  const out = {};
  try {
    const hp = path.join(os.homedir(), '.claude', 'history.jsonl');
    const st = fs.statSync(hp); const start = Math.max(0, st.size - maxBytes);
    const fd = fs.openSync(hp, 'r'); const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd);
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      const sid = d.sessionId || d.session_id; if (!sid || out[sid]) continue;
      const disp = String(d.display || '').trim();
      if (!disp || disp.charAt(0) === '[') continue; // skip paste/image placeholders
      out[sid] = disp.replace(/\s+/g, ' ').slice(0, 52);
    }
  } catch { /* no history */ }
  return out;
}

// Read the first N bytes of a file (head) — used to find a session's first prompt
// (the transcript's first user message), which is the most reliable session name.
function _readHead(file, maxBytes) {
  try { const fd = fs.openSync(file, 'r'); const st = fs.fstatSync(fd); const len = Math.min(st.size, maxBytes); const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, 0); fs.closeSync(fd); return buf.toString('utf8'); } catch { return ''; }
}
// The session's first real user prompt = Claude Code's own session title. Reliable for
// every session (history.jsonl can miss sessions whose first prompt was a paste). Strips
// the leading markdown heading and collapses whitespace; skips tool/synthetic lines.
function _firstPrompt(file) {
  const head = _readHead(file, 96 * 1024);
  for (const line of head.split('\n')) {
    if (line.indexOf('"user"') < 0) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const msg = o && o.message; if (!msg || (o.type && o.type !== 'user')) continue;
    const c = msg.content; let t = '';
    if (Array.isArray(c)) { for (const b of c) if (b && b.type === 'text') t += b.text; }
    else if (typeof c === 'string') t = c;
    t = String(t).trim();
    if (!t || t.charAt(0) === '<') continue; // skip tool_result / synthetic blocks
    const firstLine = (t.split('\n').find((x) => x.trim()) || t).replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
    if (firstLine) return firstLine.slice(0, 52);
  }
  return null;
}

// ── Feature 1+2: session → cwd → branch → PR → stage ────────────────────────
// The transcript's head carries the working directory the session runs in (top-level
// `cwd` on every line). Reading it lets us resolve the session's git branch and any open
// PR — the honest chain "this session is working on branch X / PR #N (stage)". We read
// only the head (64KB) and return the first cwd we see, or null (never fabricated).
function _sessionCwd(file) {
  const head = _readHead(file, 64 * 1024);
  for (const line of head.split('\n')) {
    if (line.indexOf('"cwd"') < 0) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o && typeof o.cwd === 'string' && o.cwd.trim()) return o.cwd;
  }
  return null;
}

// The current branch of a git repo at `cwd`. null when cwd is missing, not a repo, in a
// detached HEAD ("HEAD"), or git is absent/slow (2s timeout). Async — callers await it.
async function gitBranch(cwd) {
  if (!cwd || typeof cwd !== 'string') return null;
  const r = await execTool('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], 2000);
  if (!r.ok) return null;
  const b = r.out.split('\n')[0].trim();
  return (!b || b === 'HEAD') ? null : b; // 'HEAD' = detached → no branch to show
}

// WCOCKPIT-4 (fixed in WCOCKPIT-5): READ-ONLY git stage snapshot for a session's working dir.
// ASYNC — uses execTool (execFile under the hood) so the event loop is NEVER blocked.
// WCOCKPIT-4 used spawnSync which stalled the extension host → blank cockpit panel.
// Returns { state, dirty, staged, ahead, behind } with state ∈ clean|uncommitted|staged|ahead.
// state priority: uncommitted (dirty) > staged > ahead > clean.
// null when cwd is invalid, not a git repo, or git times out (3s).
async function gitStage(cwd) {
  if (!cwd || typeof cwd !== 'string') return null;
  try {
    const sr = await execTool('git', ['-C', cwd, 'status', '--porcelain'], 3000);
    if (!sr.ok) return null;
    const lines = (sr.out || '').split('\n').filter(function(l) { return l.length >= 2; });
    let dirty = 0, staged = 0;
    for (const line of lines) {
      const x = line[0], y = line[1];
      if (x !== ' ' && x !== '?') staged++;   // col1 ≠ space = staged change
      if (y !== ' ' || x === '?') dirty++;     // col2 ≠ space or untracked = dirty
    }
    let ahead = 0, behind = 0;
    try {
      const rr = await execTool('git', ['-C', cwd, 'rev-list', '--count', '--left-right', '@{u}...HEAD'], 3000);
      if (rr.ok) {
        const parts = (rr.out || '').trim().split(/\s+/);
        behind = parseInt(parts[0] || '0', 10) || 0;
        ahead  = parseInt(parts[1] || '0', 10) || 0;
      }
    } catch { /* no upstream configured — not an error */ }
    let state = 'clean';
    if      (dirty  > 0) state = 'uncommitted';
    else if (staged > 0) state = 'staged';
    else if (ahead  > 0) state = 'ahead';
    return { state, dirty, staged, ahead, behind };
  } catch { return null; }
}

// Open/recent PRs from gh, scoped to the repo at `cwd` (gh runs in that dir → the PRs
// genuinely belong to that session's repo, never another repo that happens to share a
// branch name). [] when gh is absent, unauthenticated, offline, or cwd is not a GitHub
// repo — degrades gracefully, never throws. 6s timeout. Each PR carries the fields
// prStage() needs (state, isDraft, statusCheckRollup) plus number/title/headRefName.
async function prList(cwd) {
  const r = await execTool('gh', ['pr', 'list', '--json', 'number,title,headRefName,state,isDraft,statusCheckRollup', '--limit', '50'], 6000, cwd);
  if (!r.ok || !r.out) return [];
  let arr; try { arr = JSON.parse(r.out); } catch { return []; }
  return Array.isArray(arr) ? arr : [];
}

// Pure (testable): derive the human stage of a PR from its gh JSON. Order of precedence:
//   MERGED → 'merged ✓'   ·   draft → 'draft'   ·   any check FAILED → 'CI ❌'
//   a check still running/queued → 'CI ⏳'   ·   open + all checks passed → 'ready ✅'
//   open with no checks → 'open'.   No PR / bad input → null (never fabricated).
// statusCheckRollup entries are CheckRun {status,conclusion} or StatusContext {state}.
function prStage(pr) {
  if (!pr || typeof pr !== 'object') return null;
  if (String(pr.state).toUpperCase() === 'MERGED') return 'merged ✓';
  if (pr.isDraft) return 'draft';
  const checks = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
  let any = false, anyFail = false, anyPending = false, allPass = true;
  for (const c of checks) {
    any = true;
    const concl = String(c.conclusion || '').toUpperCase();
    const status = String(c.status || '').toUpperCase();
    const ctxState = String(c.state || '').toUpperCase(); // StatusContext (non-CheckRun)
    const failed = concl === 'FAILURE' || concl === 'TIMED_OUT' || concl === 'CANCELLED' || concl === 'ACTION_REQUIRED' || ctxState === 'FAILURE' || ctxState === 'ERROR';
    // COMPLETED with no conclusion (e.g. a cancelled/expired run that logged none) is
    // ambiguous → treat as still-pending rather than silently reporting the PR as "open".
    const pending = (status && status !== 'COMPLETED') || ctxState === 'PENDING' || (status === 'COMPLETED' && !concl && !ctxState);
    const passed = concl === 'SUCCESS' || concl === 'NEUTRAL' || concl === 'SKIPPED' || ctxState === 'SUCCESS';
    if (failed) anyFail = true;
    if (pending) anyPending = true;
    if (!passed) allPass = false;
  }
  if (anyFail) return 'CI ❌';
  if (anyPending) return 'CI ⏳';
  if (any && allPass) return 'ready ✅';
  return 'open';
}

// Per-session live state from decisions.log: pairs `classified` (prompt entered) with
// `turn_end` (Stop hook → turn finished). Last event per session tells us:
//   classified (no turn_end after) → Claude is WORKING (generating now)
//   turn_end                       → Claude finished, WAITING FOR THE USER (your turn)
// This is the honest "needs your action" signal — derived from real hook telemetry, not
// a guess. It is NOT specifically "permission required" (that needs a Notification hook).
function sessionActivity(maxBytes = 256 * 1024) {
  const out = {};
  try {
    const lp = path.join(ROUTER, 'decisions.log');
    const st = fs.statSync(lp); const start = Math.max(0, st.size - maxBytes);
    const fd = fs.openSync(lp, 'r'); const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd);
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.event !== 'classified' && e.event !== 'turn_end') continue;
      const sid = e.session_id; if (!sid || sid === 'unknown') continue;
      const ts = e.ts_ms || (e.ts ? Date.parse(e.ts) : 0);
      if (!out[sid] || ts >= out[sid].ts) out[sid] = { event: e.event, ts };
    }
  } catch { /* no log */ }
  return out;
}

// Async (Feature 1+2): each session also carries its working dir (`cwd`, from the
// transcript head) and git `branch`. git is resolved at most ONCE per distinct cwd
// (dedupe — many sessions share a cwd) and only when a branchCache map is supplied; the
// `null`-safe default keeps the function cheap when callers don't want git. Returns the
// same honest fields as before plus { cwd, branch } (both null when unknown — never faked).
async function recentSessions(maxN = 8) {
  const out = []; const now = Date.now(); const names = sessionNames(); const act = sessionActivity();
  const _cwPend = coworkWaiting().readCoworkPending(); // WCOCKPIT: lê uma vez para todo o loop
  const branchCache = new Map(); // cwd → branch|null, resolved once per cwd this call
  const prCache = new Map();     // cwd → prs[] (repo-scoped gh pr list, once per cwd)
  const wtCache = new Map();     // WCOCKPIT-2: cwd → worktrees[], resolved once per cwd
  const gsCache = new Map();     // WCOCKPIT-4/5: cwd → gitStage result, once per cwd (async, non-blocking)
  for (const f of listSessionFiles().slice(0, maxN)) {
    let lastModel = null; let turns = 0;
    let tin = 0, tout = 0; const sm = {}; let firstTs = null, lastTs = null;
    try {
      const st = fs.statSync(f.file); const start = Math.max(0, st.size - 1024 * 1024);
      const fd = fs.openSync(f.file, 'r'); const buf = Buffer.alloc(st.size - start);
      fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd);
      for (const line of buf.toString('utf8').split('\n')) {
        if (!line) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        const ts = d.timestamp ? Date.parse(d.timestamp) : NaN;
        if (!isNaN(ts)) { if (firstTs == null || ts < firstTs) firstTs = ts; if (lastTs == null || ts > lastTs) lastTs = ts; }
        const m = d && d.message; if (!m || !m.model || String(m.model).charAt(0) === '<') continue;
        const u = m.usage; if (!u) continue;
        lastModel = m.model; turns += 1;
        tin += u.input_tokens || 0; tout += u.output_tokens || 0;
        const a = sm[m.model] || (sm[m.model] = { model: m.model, in: 0, out: 0, cw: 0, cr: 0 });
        a.in += u.input_tokens || 0; a.out += u.output_tokens || 0; a.cw += u.cache_creation_input_tokens || 0; a.cr += u.cache_read_input_tokens || 0;
      }
    } catch { /* skip unreadable */ }
    // Per-session cost + counterfactual saved vs all-Opus + throughput — same formulas as the
    // Token Ledger (coherent). saved = (in*5+out*25)/1M [Opus 4.8] − actual cost; tok/s over the
    // session's active span (first↔last timestamp). Null when not derivable (never faked).
    let scost = 0, ssaved = 0;
    for (const a of Object.values(sm)) { const c = costFor(a.model, a) || 0; scost += c; ssaved += (a.in * 5 + a.out * 25) / 1e6 - c; }
    const durSec = (firstTs != null && lastTs != null && lastTs > firstTs) ? (lastTs - firstTs) / 1000 : null;
    const tokPerSec = (durSec && durSec > 0) ? Math.round((tin + tout) / durSec) : null;
    const proj = path.basename(path.dirname(f.file)).replace(/^[A-Za-z]--+/, '').replace(/-/g, ' ').trim();
    const sid = path.basename(f.file).replace(/\.jsonl$/, '');
    // State (honest): "working" only when a prompt is in flight AND the transcript is
    // actively being written (fresh). A stalled prompt (classified, no turn_end, gone
    // quiet) or a finished turn (turn_end) within the last 30 min = "your turn" (Claude
    // is waiting for you — could be done or blocked on a permission/question).
    const a = act[sid];
    const fresh = (now - f.mtime) < 120000;          // transcript touched in last 2 min
    const recent = (now - f.mtime) < 30 * 60 * 1000; // session active in last 30 min
    let working = false; let needsYou = false;
    if (a) {
      if (a.event === 'classified' && fresh) working = true;
      else if (recent) needsYou = true;
    } else { working = fresh; }
    const cwd = _sessionCwd(f.file);
    let branch = null;
    if (cwd) {
      if (branchCache.has(cwd)) branch = branchCache.get(cwd);
      else { branch = await gitBranch(cwd); branchCache.set(cwd, branch); }
    }
    // PR is resolved against THIS session's own repo (gh runs in `cwd`) and matched by
    // branch within that repo only — never a same-named branch from another repo (honesty).
    let pr = null;
    if (cwd && branch) {
      let prs;
      if (prCache.has(cwd)) prs = prCache.get(cwd);
      else { prs = await prList(cwd); prCache.set(cwd, prs); }
      const match = prs.find((p) => p && p.headRefName === branch);
      if (match) pr = { number: match.number, title: String(match.title || '').slice(0, 80), state: match.state, isDraft: match.isDraft, stage: prStage(match) };
    }
    // WCOCKPIT-2: worktree detection (per cwd, cached; shows chip only for linked worktrees)
    let worktree = null;
    if (cwd) {
      if (!wtCache.has(cwd)) wtCache.set(cwd, modeRegistry().worktrees(cwd));
      const wts = wtCache.get(cwd);
      const thisWt = wts.find(wt => wt.linked && path.resolve(wt.path) === path.resolve(cwd));
      if (thisWt) worktree = path.basename(thisWt.path);
    }
    const row = { id: sid.slice(0, 8), fullId: sid, name: names[sid] || _firstPrompt(f.file) || null, project: (proj || '?').slice(-34), model: lastModel, turns, ageMs: now - f.mtime, lastActiveTs: f.mtime, working, needsYou, cwd, branch, pr, worktree, tokIn: tin, tokOut: tout, cost: scost, saved: ssaved, tokPerSec };
    row.repoFolder = cwd ? path.basename(cwd) : null; // WCOCKPIT-3: clean folder name for grouping
    // WCOCKPIT-4/5: async git stage (non-blocking; cached per cwd to avoid redundant git calls)
    if (cwd) {
      if (!gsCache.has(cwd)) gsCache.set(cwd, gitStage(cwd)); // store Promise, start only once per cwd
      row.gitStage = await gsCache.get(cwd);
    } else { row.gitStage = null; }
    modeRegistry().decorate(row);          // WCOCKPIT: junta mode/model/auto/project/brainTitle + integration fields
    coworkWaiting().decorate(row, _cwPend); // WCOCKPIT: junta waitingForCowork/coworkStatus/coworkTitle
    out.push(row);
  }
  // WCOCKPIT-2: sort needs-you first, then most recent
  out.sort((a, b) => {
    if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
    return (b.lastActiveTs || 0) - (a.lastActiveTs || 0);
  });
  return out;
}

module.exports = { herd, parseV2, herdMatrix, matrixForUi, insights, execNode, ollamaModels, readMode, setMode, readSubProfile, ansiToHtml, statuslineHtml, slashStatus, ROUTER,
  parseEffort, parseIntent, parseSpanIds, effortGet, effortSet, whyNotFable, trailJson, securitySummary, feedbackSpans, rateSpan, intentResolve, MOOTER_CLI,
  deviceProfile, hwCapability, quantSnapshot, preferences, readBudget, writeBudget, readPinNext, writePinNext, liveRouting, SLASH_CMDS, mooterScore, installedPacks,
  PRICES, priceFor, costFor, tokenLedger, aggregateUsage, localTokens, recentSessions, activeSession,
  execTool, _sessionCwd, gitBranch, gitStage, prList, prStage };
