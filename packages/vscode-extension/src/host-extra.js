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

const BUDGET_PATHS = [path.join(MOOTER_HOME, 'budget-config.json'), path.join(os.homedir(), '.frugal', 'budget-config.json')];
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

// The 10 slash sub-commands from the canonical /mooter SKILL template.
const SLASH_CMDS = ['route', 'savings', 'explain', 'digest', 'local', 'why-not-fable', 'tier', 'mcp', 'vision', 'bench'];

// Mooter Score — 8 equally-weighted setup checks (explainable, req 12).
function mooterScore(ctx) {
  const checks = [
    { k: 'engine',  t: 'Routing engine installed',        ok: !!ctx.runtimeInstalled, fix: 'install' },
    { k: 'tracker', t: 'Savings tracker running',         ok: !!ctx.trackerUp,        fix: 'term:mooter doctor' },
    { k: 'ollama',  t: 'Ollama online (free T0 tier)',    ok: Array.isArray(ctx.ollama) && ctx.ollama.length > 0, fix: 'term:open https://ollama.com/download' },
    { k: 'reco',    t: 'Recommended model for your GPU',  ok: !!(ctx.hw && ctx.ollama && ctx.ollama.some((m) => m.name.startsWith(String(ctx.hw.recommended_t0 || '').split(':')[0]))), fix: 'pull-reco' },
    { k: 'sub',     t: 'Subscription profile configured', ok: !!(ctx.sub && ctx.sub.profile && ctx.sub.profile !== 'unknown'), fix: 'term:mooter init' },
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
        model: st.model || st.llm || null, started: st.started_at || st.created_at || null };
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

module.exports = { herd, parseV2, herdMatrix, matrixForUi, insights, execNode, ollamaModels, readMode, setMode, readSubProfile, ansiToHtml, statuslineHtml, slashStatus, ROUTER,
  parseEffort, parseIntent, parseSpanIds, effortGet, effortSet, whyNotFable, trailJson, securitySummary, feedbackSpans, rateSpan, intentResolve, MOOTER_CLI,
  deviceProfile, hwCapability, quantSnapshot, preferences, readBudget, writeBudget, SLASH_CMDS, mooterScore, installedPacks };
