// host-extra.js — v0.2 host services: ollama, mode, sub-profile, statusline, slash.
// Pure node (no vscode import) → testable. Never throws, always resolves.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { execFile, execFileSync } = require('child_process');
const { httpJson, isProbePrompt } = require('./data.js');

const ROUTER = path.join(os.homedir(), '.claude', 'tools', 'router');
const MODE_FILE = path.join(ROUTER, '.mooter-mode.json');
// Ollama port — 11434 in prod; overridable ONLY via env so runtime smoke tests can point the
// real ollamaDoing/ollamaRecap/_ollamaGenerate at a fake server (down/slow) without touching 11434.
const OLLAMA_PORT = Number(process.env.MOOTER_OLLAMA_PORT) || 11434;

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
  const r = await httpJson(OLLAMA_PORT, '/api/tags', 1500);
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
  const r = await execMooter(['slash-commands', 'status'], 9000);
  if (!r.out) return { installed: null, raw: '' };
  const t = r.out.toLowerCase();
  return { installed: t.includes('installed') && !t.includes('not installed'), raw: r.out.trim().slice(0, 300) };
}

// ── v0.3 services ───────────────────────────────────────────────────────
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } }

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

// WCOCKPIT-9 (Bloco E): descrições curtas REAIS dos /mooter <sub> (do template do skill /mooter).
const MOOTER_SUBCMD_DESC = {
  route: 'rota um prompt e mostra o tier escolhido',
  savings: 'poupança acumulada vs all-Opus',
  explain: 'explica um chip/tópico do statusline',
  digest: 'resumo do dia de routing',
  local: 'lista os modelos locais Ollama instalados',
  'why-not-fable': 'porque o Fable não foi auto-rotado',
  tier: 'escada de tiers (T0–T5)',
  mcp: 'estado dos servidores MCP ligados',
  vision: 'tier para tarefas de visão',
  bench: 'corre o mooter-bench',
};
// WCOCKPIT-9 (Bloco E): lê a `description:` (linha única) de um pack.yaml de um pack instalado.
// Procura nas localizações canónicas (MOOTER_PACKS_DIR override → ~/.mooter/packs → repo/packs).
// Parser leve por regex (sem dependência YAML); null se não encontrar. Nunca lança.
function _packDescription(name) {
  const cands = [];
  if (process.env.MOOTER_PACKS_DIR) cands.push(path.join(process.env.MOOTER_PACKS_DIR, name, 'pack.yaml'));
  cands.push(path.join(MOOTER_HOME, 'packs', name, 'pack.yaml'));
  // <repo>/packs/<name> — __dirname = <repo>/packages/vscode-extension/src
  cands.push(path.join(__dirname, '..', '..', '..', 'packs', name, 'pack.yaml'));
  for (const p of cands) {
    try {
      const txt = fs.readFileSync(p, 'utf8');
      const m = txt.match(/^description:\s*["']?(.+?)["']?\s*$/m);
      if (m && m[1]) return m[1].trim();
    } catch { /* try next */ }
  }
  return null;
}
// WCOCKPIT-9 (Bloco E): lista DETERMINÍSTICA e HONESTA dos slash commands disponíveis para o picker.
// Fontes 100% reais e locais (nunca inventa): (1) os /mooter <sub> do skill canónico, (2) cada
// Moo Pack REALMENTE instalado (installed_packs.json) como /<name> com a sua description do pack.yaml.
// Pura/síncrona (não depende do wrapper CLI, que é finicky — ver armadilhas do brief).
function slashCommands() {
  const out = []; const seen = new Set();
  const add = (cmd, desc) => {
    const c = String(cmd || '').trim(); if (!c || seen.has(c)) return;
    seen.add(c); out.push({ cmd: c, desc: desc ? String(desc).slice(0, 90) : '' });
  };
  for (const s of SLASH_CMDS) add('/mooter ' + s, MOOTER_SUBCMD_DESC[s] || '');
  try {
    const ip = installedPacks();
    const arr = ip && (Array.isArray(ip) ? ip : (ip.packs || ip.installed || ip.list || []));
    if (Array.isArray(arr)) for (const p of arr) {
      const name = typeof p === 'string' ? p : (p && (p.name || p.id));
      if (name) add('/' + name, _packDescription(name) || 'Moo Pack');
    }
  } catch { /* no packs → just the /mooter subcommands */ }
  return out;
}

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
    { k: 'packs',   t: 'At least one Moo Pack installed', ok: !!(installedPacks() && Object.keys(installedPacks() || {}).length > 0), fix: 'packInstall' },
  ];
  // Doctor & Self-Heal: append the 6 diagnostic checks (filesystem/git health) computed
  // during the deep refresh. They share the exact { k, t, ok, fix } shape the renderer reads,
  // so they slot into the same Doctor list. Pass-only (ok:true) checks still count toward the
  // score; warns (ok:null) and fails (ok:false) surface their 1-click fix button.
  const doctor = (ctx && Array.isArray(ctx.doctorChecks)) ? ctx.doctorChecks : [];
  const all = checks.concat(doctor);
  // Score counts only checks that explicitly passed (ok===true) — a warn (null) is neither
  // pass nor fail, so it neither boosts nor tanks the percentage unfairly.
  const done = all.filter((c) => c.ok === true).length;
  return { pct: Math.round((100 * done) / all.length), done, total: all.length, checks: all };
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

// ════════════════════════════════════════════════════════════════════════════
// WCOCKPIT-9 (Bloco C) — git Commit/Push por sessão. HOST-SIDE, seguro, reversível, gated.
// Princípios invioláveis: nunca `git add -A`, nunca `--force`, preview obrigatório, guarda da
// sha de classify.js ANTES de commitar, aviso de harmonia entre sessões no mesmo repo+branch,
// push só após confirmação explícita (modal), merge é acção separada (não exposta aqui).
// ════════════════════════════════════════════════════════════════════════════

// sha FROZEN de classify.js (CI-enforced). Usada como guarda anti-commit-acidental do engine.
const FROZEN_CLASSIFY_SHA = '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f';

// PURA (testável): parse de `git status --porcelain` → [{x,y,path}]. Trata renomeações (-> novo)
// e paths citados. Nunca lança.
function parsePorcelain(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (line.length < 4) continue;
    const x = line[0], y = line[1];
    let p = line.slice(3);
    const arrow = p.indexOf(' -> ');
    if (arrow >= 0) p = p.slice(arrow + 4); // rename → keep the new path
    p = p.replace(/^"(.*)"$/, '$1');
    if (p) out.push({ x, y, path: p });
  }
  return out;
}

// PURA (testável): mensagem de commit convencional por defeito (editável depois pelo Paulo).
function defaultCommitMessage(branch, files) {
  const n = (files || []).length;
  const first = n ? String(files[0].path).split('/').pop() : '';
  return 'wip(' + (branch || 'work') + '): ' + n + ' file' + (n === 1 ? '' : 's')
    + (first ? ' — ' + first + (n > 1 ? ' +' + (n - 1) : '') : '');
}

// PURA (testável): HARMONIA — quantas sessões partilham este repo (cwd) E branch (= mesmo
// trabalho). shared=true quando ≥2 sessões coabitam o par repo+branch → exige confirmação extra.
function gitHarmony(recent, cwd, branch) {
  const others = [];
  for (const r of recent || []) {
    if (!r || r.cwd !== cwd) continue;
    if (branch && r.branch && r.branch !== branch) continue;
    others.push(r.fullId || r.id);
  }
  return { shared: others.length > 1, count: others.length, others };
}

// Guarda da sha de classify.js do REPO a commitar. ok=false ABORTA o commit (engine alterado).
// checked=false quando o repo não tem o ficheiro frozen (não é o repo do Mooter) → não bloqueia.
function classifyShaGuard(cwd) {
  try {
    const p = path.join(cwd || '', 'tools', 'router', 'classify.js');
    if (!fs.existsSync(p)) return { ok: true, checked: false };
    const sha = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    return { ok: sha === FROZEN_CLASSIFY_SHA, checked: true, sha };
  } catch { return { ok: true, checked: false }; }
}

// READ-ONLY: preview de commit (ficheiros + branch + mensagem default). NUNCA stage/commit.
async function gitCommitPreview(cwd) {
  if (!cwd) return null;
  const sr = await execTool('git', ['-C', cwd, 'status', '--porcelain'], 4000);
  if (!sr.ok) return null;
  const files = parsePorcelain(sr.out);
  const branch = await gitBranch(cwd);
  return { cwd, branch, files, message: defaultCommitMessage(branch, files) };
}

// Exec git capturando stdout+stderr (git escreve erros/progresso no stderr) → resultado HONESTO.
function execGit(args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    try {
      execFile('git', ['-C', cwd].concat(args), { timeout: timeoutMs || 12000, maxBuffer: 1024 * 512, windowsHide: true },
        (err, stdout, stderr) => resolve({ ok: !err, out: (String(stdout || '') + String(stderr || '')).trim() }));
    } catch (e) { resolve({ ok: false, out: String((e && e.message) || e) }); }
  });
}

// Commit SELECTIVO (NUNCA `git add -A`): stage exactamente os paths dados, depois commit.
// Devolve o comando git exacto + resultado real (nunca "sucesso" presumido).
async function gitCommit(cwd, files, message) {
  if (!cwd || !Array.isArray(files) || !files.length || !message) return { ok: false, out: 'nothing to commit', cmd: '' };
  const ar = await execGit(['add', '--'].concat(files), cwd, 8000);
  if (!ar.ok) return { ok: false, out: 'git add failed: ' + ar.out, cmd: 'git add -- ' + files.join(' ') };
  const cr = await execGit(['commit', '-m', message, '--'].concat(files), cwd, 12000);
  return { ok: cr.ok, out: cr.out, cmd: 'git add -- <' + files.length + ' file' + (files.length === 1 ? '' : 's') + '> && git commit -m "' + message + '"' };
}

// Push (NUNCA `--force`). Resultado real (stdout+stderr). Gated a montante por confirmação modal.
async function gitPush(cwd) {
  if (!cwd) return { ok: false, out: 'no cwd', cmd: '' };
  const r = await execGit(['push'], cwd, 30000);
  return { ok: r.ok, out: r.out, cmd: 'git push' };
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

// ════════════════════════════════════════════════════════════════════════════
// ⇄ HANDOFF v3 — deterministic git snapshot (verification-grade facts). SYNC, best-effort,
// NEVER throws. Runs on the handoff BUTTON (not the refresh hot path), so a few bounded sync
// git reads are acceptable. Every read is guarded; any failure flips factsComplete=false —
// the handoff footer says so and NEVER fabricates a fact.
// ════════════════════════════════════════════════════════════════════════════

// Sync git runner: { ok, out }. Bounded (2.5s), stderr discarded, never throws. Overridable
// via gitSnapshot/vaultFreshness opts.runGit so tests inject a deterministic mock (no real git).
function _gitSync(args, cwd) {
  try {
    if (!cwd) return { ok: false, out: '' };
    const out = execFileSync('git', ['-C', cwd].concat(args),
      { timeout: 2500, maxBuffer: 1024 * 256, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return { ok: true, out: String(out || '').trim() };
  } catch { return { ok: false, out: '' }; }
}

// gitSnapshot(cwd, opts) → { head:{sha7,subject}|null, baseAhead, baseBehind, pushed:bool|prNumber,
//   prStage:string|null, filesInHead:[≤8 basenames], filesCount, classifyFrozen:true|false|null,
//   mixedSessions:bool, factsComplete:bool }. opts (all injectable): { runGit, recent, branch, pr }.
function gitSnapshot(cwd, opts) {
  opts = opts || {};
  const run = opts.runGit || _gitSync;
  const snap = { head: null, baseAhead: 0, baseBehind: 0, pushed: false, prStage: null,
    filesInHead: [], filesCount: 0, isMerge: false, classifyFrozen: null, mixedSessions: false, factsComplete: true };
  if (!cwd || typeof cwd !== 'string') { snap.factsComplete = false; return snap; }
  try {
    // HEAD: sha7 + subject (tab-separated). "—" upstream when there is no commit.
    const h = run(['log', '-1', '--format=%h%x09%s'], cwd);
    if (h && h.ok && h.out) {
      const tab = h.out.indexOf('\t');
      const sha7 = (tab >= 0 ? h.out.slice(0, tab) : h.out).trim();
      const subject = (tab >= 0 ? h.out.slice(tab + 1) : '').trim();
      if (sha7) snap.head = { sha7: sha7.slice(0, 12), subject: subject.slice(0, 80) };
      else snap.factsComplete = false;
    } else snap.factsComplete = false;
    // position vs origin/main
    const ah = run(['rev-list', '--count', 'origin/main..HEAD'], cwd);
    if (ah && ah.ok && ah.out !== '') snap.baseAhead = parseInt(ah.out, 10) || 0; else snap.factsComplete = false;
    const bh = run(['rev-list', '--count', 'HEAD..origin/main'], cwd);
    if (bh && bh.ok && bh.out !== '') snap.baseBehind = parseInt(bh.out, 10) || 0; else snap.factsComplete = false;
    // 4c — merge-commit detection: a merge HEAD has ≥2 parents. "diff-tree HEAD" on a merge is EMPTY
    // ("HEAD toca 0 fich." era enganador) → for a merge, diff the first parent..HEAD = the files it
    // BROUGHT IN (the merged branch's changes). Non-merge → the commit's own files.
    const par = run(['show', '-s', '--format=%P', 'HEAD'], cwd);
    const parents = (par && par.ok && par.out) ? par.out.trim().split(/\s+/).filter(Boolean) : [];
    snap.isMerge = parents.length >= 2;
    const fr = (snap.isMerge && parents[0])
      ? run(['diff', '--name-only', parents[0], 'HEAD'], cwd)
      : run(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], cwd);
    if (fr && fr.ok) {
      const all = fr.out.split('\n').map((s) => s.trim()).filter(Boolean);
      snap.filesCount = all.length;
      snap.filesInHead = all.slice(0, 8).map((p) => p.split('/').pop());
    } else snap.factsComplete = false;
    // pushed / prNumber — reuse prStage on the session's PR object; else probe the upstream.
    if (opts.pr && opts.pr.number) { snap.pushed = opts.pr.number; snap.prStage = prStage(opts.pr); }
    else {
      const up = run(['rev-list', '--count', '@{u}..HEAD'], cwd);
      snap.pushed = !!(up && up.ok && up.out !== '' && parseInt(up.out, 10) === 0); // upstream set + nothing un-pushed
    }
    // classify.js frozen guard — tri-state: true (exact sha) | false (changed) | null (absent / non-Mooter repo).
    const g = classifyShaGuard(cwd);
    snap.classifyFrozen = g.checked ? g.ok : null;
    // 4b — mixed-sessions requires ≥2 ACTIVE sessions WITH OWN COMMITS on this cwd+branch (the real
    // shared-working-tree collision). 20 IDLE sessions cohabiting a clean/pushed main (baseAhead 0)
    // must NOT trigger it — that was false "review". A shared working tree has ONE HEAD, so baseAhead
    // is the branch's own-commit signal for all of them.
    const activeShared = (Array.isArray(opts.recent) ? opts.recent : []).filter((r) =>
      r && r.cwd === cwd && String(r.branch || '') === String(opts.branch || '') && (r.working || r.needsYou)).length;
    snap.mixedSessions = activeShared >= 2 && snap.baseAhead > 0;
  } catch { snap.factsComplete = false; }
  return snap;
}

// ⇄ Handoff v3 FRESH: best-effort ms-epoch of the vault repo's last commit (git log -1 --format=%ct
// on ~/Documents/paulo-vault). null when the vault is absent / not a repo / git slow. Never throws.
// opts injectable for tests: { dir, runGit }.
const VAULT_DIR = path.join(os.homedir(), 'Documents', 'paulo-vault');
function vaultFreshness(opts) {
  opts = opts || {};
  const dir = opts.dir || VAULT_DIR;
  const run = opts.runGit || _gitSync;
  try {
    const r = run(['log', '-1', '--format=%ct'], dir);
    if (r && r.ok && r.out) { const t = parseInt(r.out, 10); return Number.isFinite(t) && t > 0 ? t * 1000 : null; }
    return null;
  } catch { return null; }
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
  const _cwMap = modeRegistry().readCoworkMap();       // WCOCKPIT-9 (Bloco A): mapa Cowork persistente, uma leitura por refresh
  const branchCache = new Map(); // cwd → branch|null, resolved once per cwd this call
  const prCache = new Map();     // cwd → prs[] (repo-scoped gh pr list, once per cwd)
  const wtCache = new Map();     // WCOCKPIT-2: cwd → worktrees[], resolved once per cwd
  const gsCache = new Map();     // WCOCKPIT-4/5: cwd → gitStage result, once per cwd (async, non-blocking)
  const treeShaCache = new Map(); // PASSO 2: cwd → tree HEAD sha (cheap .git read, once per cwd)
  for (const f of listSessionFiles().slice(0, maxN + 8)) {
    if (out.length >= maxN) break; // WCOCKPIT-7: stop once we have maxN visible (archived are skipped below)
    let lastModel = null; let turns = 0; let lastCtx = 0;
    let tin = 0, tout = 0; const sm = {}; let firstTs = null, lastTs = null;
    let pendingForRow = null; // ⇄ Handoff: derived from the SAME tail (no second open)
    try {
      const st = fs.statSync(f.file); const start = Math.max(0, st.size - 1024 * 1024);
      const fd = fs.openSync(f.file, 'r'); const buf = Buffer.alloc(st.size - start);
      fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd);
      const _tailLines = buf.toString('utf8').split('\n');
      pendingForRow = extractPending(_tailLines); // ⇄ Handoff: last assistant turn + tool-calls
      for (const line of _tailLines) {
        if (!line) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        const ts = d.timestamp ? Date.parse(d.timestamp) : NaN;
        if (!isNaN(ts)) { if (firstTs == null || ts < firstTs) firstTs = ts; if (lastTs == null || ts > lastTs) lastTs = ts; }
        const m = d && d.message; if (!m || !m.model || String(m.model).charAt(0) === '<') continue;
        const u = m.usage; if (!u) continue;
        lastModel = m.model; turns += 1;
        tin += u.input_tokens || 0; tout += u.output_tokens || 0; lastCtx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
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
    const row = { id: sid.slice(0, 8), fullId: sid, name: names[sid] || _firstPrompt(f.file) || null, project: (proj || '?').slice(-34), model: lastModel, turns, ageMs: now - f.mtime, lastActiveTs: f.mtime, working, needsYou, cwd, branch, pr, worktree, tokIn: tin, tokOut: tout, ctxTokens: lastCtx, cost: scost, saved: ssaved, tokPerSec };
    row.repoFolder = cwd ? path.basename(cwd) : null; // WCOCKPIT-3: clean folder name for grouping
    row.pending = pendingForRow || { lastAssistantText: '—', lastToolActions: [], stopped: false }; // ⇄ Handoff source (no re-read)
    // WCOCKPIT-4/5: async git stage (non-blocking; cached per cwd to avoid redundant git calls)
    if (cwd) {
      if (!gsCache.has(cwd)) gsCache.set(cwd, gitStage(cwd)); // store Promise, start only once per cwd
      row.gitStage = await gsCache.get(cwd);
    } else { row.gitStage = null; }
    modeRegistry().decorate(row, _cwMap);  // WCOCKPIT: junta mode/model/auto/project/brainTitle + cowork mirror + integration fields
    coworkWaiting().decorate(row, _cwPend); // WCOCKPIT: junta waitingForCowork/coworkStatus/coworkTitle
    row.localMoo = localMooState(row.fullId); // B4: estado vivo do moo local (acumulador, read-only, $0)
    // PASSO 2 (Mac feedback): HONEST per-session git from the session's OWN journal (not the shared
    // tree HEAD). Reconciled vs the tree → uncertain (no journal) / diverged (tree moved under it).
    let _treeSha = null;
    if (cwd) { if (!treeShaCache.has(cwd)) treeShaCache.set(cwd, _treeHeadSha(cwd)); _treeSha = treeShaCache.get(cwd); }
    row.sessionGit = reconcileSessionGit(sessionGitFromJournal(row.fullId), branch, _treeSha);
    if (modeRegistry().isArchived(sid, f.mtime)) continue; // WCOCKPIT-7: hide sessions closed from the cockpit (until active again)
    // Drop throwaway probe sessions: a one-shot transcript whose only prompt is a
    // CLI management/status echo (e.g. `mooter slash-commands status` mis-routed
    // through the launcher). turns<=1 ensures a real multi-turn session that merely
    // starts with such a word is never hidden. Keeps the list showing real work.
    if (turns <= 1 && isProbePrompt(row.name)) continue;
    out.push(row);
  }
  // WCOCKPIT-2: sort needs-you first, then most recent
  out.sort((a, b) => {
    if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
    return (b.lastActiveTs || 0) - (a.lastActiveTs || 0);
  });
  return out;
}

// WCOCKPIT-8/8b: host-side CLI invocation. Runs the CLI as a direct child process (NEVER a
// terminal → can't be hijacked by a Claude Code session). Tries the resolved node script
// (MOOTER_CLI) first, then falls back to the GLOBAL `mooter` on PATH (npm bin), since many
// setups only have the global `mooter` and not ~/.mooter/cli*/mooter.js.
function execMooter(args, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  const optsBase = { timeout: timeoutMs, maxBuffer: 1024 * 512, windowsHide: true };
  return new Promise((resolve) => {
    const tryGlobal = () => {
      try {
        execFile('mooter', args, Object.assign({ shell: true }, optsBase),
          (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '') + String(stderr || '') }));
      } catch { resolve({ ok: false, out: '' }); }
    };
    if (MOOTER_CLI && fs.existsSync(MOOTER_CLI)) {
      execFile(process.execPath, [MOOTER_CLI, ...args], optsBase, (err, stdout, stderr) => {
        if (!err) return resolve({ ok: true, out: String(stdout || '') + String(stderr || '') });
        tryGlobal();
      });
    } else { tryGlobal(); }
  });
}
async function installSlashCommands() {
  const r = await execMooter(['slash-commands', 'install'], 18000);
  return { ok: !!r.ok, out: (r.out || '').trim().slice(0, 220) };
}
async function installPack(name) {
  let n = name && String(name).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!n) {
    const lr = await execMooter(['pack', 'list', '--json'], 10000);
    try {
      const j = JSON.parse(lr.out);
      const arr = Array.isArray(j) ? j : (j.packs || j.available || j.list || []);
      n = arr.map((p) => (typeof p === 'string' ? p : (p && (p.name || p.id)))).filter(Boolean)[0];
    } catch { /* fall through to text parse */ }
    if (!n) {
      const lr2 = await execMooter(['pack', 'list'], 10000);
      const m = String(lr2.out || '').match(/(^|\n)\s*[•*\-]?\s*([a-z][a-z0-9-]{2,})/i);
      n = m && m[2];
    }
  }
  if (!n) return { ok: false, name: null, out: 'no packs available to install' };
  const r = await execMooter(['pack', 'install', String(n)], 18000);
  return { ok: !!r.ok, name: n, out: (r.out || '').trim().slice(0, 220) };
}

// ════════════════════════════════════════════════════════════════════════════
// ⇄ HANDOFF — session → Cowork context (clipboard + SYNC.md upsert). HOST-SIDE, pure,
// deterministic. Mata o screenshot-e-cola: um clique gera um texto estruturado (estado +
// última acção + pergunta pendente verbatim + próximo passo). Determinístico primeiro;
// Ollama local é OPCIONAL e nunca bloqueia. Campo sem dado → "—" (nunca inventado).
// ════════════════════════════════════════════════════════════════════════════

// PURA (testável): a partir de um tool_use.input, deriva um alvo curto e honesto (basename
// de um path, comando, pattern, url, …). '' quando não há nada útil. Nunca lança.
function _toolTarget(input) {
  if (!input || typeof input !== 'object') return '';
  const cand = input.file_path || input.path || input.notebook_path || input.command
    || input.pattern || input.url || input.query || input.description || input.prompt || '';
  let s = String(cand).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/[\\/]/.test(s) && !/\s/.test(s)) s = s.split(/[\\/]/).pop(); // path-like → basename
  return s.slice(0, 48);
}

// PURA (testável): extrai a "pergunta pendente" do tail JSONL que recentSessions já leu.
// Não reabre o ficheiro — recebe as linhas. Devolve o ÚLTIMO turno de texto do assistant
// (≤400 chars), as últimas 1–3 tool-calls (nome + alvo, ordem cronológica) e `stopped`
// (a última mensagem com significado foi do assistant → está à tua espera). Tail vazio → "—".
function extractPending(tailLines) {
  const lines = Array.isArray(tailLines) ? tailLines : [];
  let lastAssistantText = '';
  const allTools = [];
  let lastMeaningfulRole = null;
  for (const ln of lines) {
    if (!ln || !ln.trim()) continue;
    let d; try { d = JSON.parse(ln); } catch { continue; }
    const msg = d && d.message;
    const role = (msg && msg.role) || d.type;
    if (role !== 'assistant' && role !== 'user') continue;
    lastMeaningfulRole = role;
    if (role !== 'assistant') continue;
    const content = msg && msg.content;
    let textHere = '';
    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b) continue;
        if (b.type === 'text' && typeof b.text === 'string') textHere += b.text;
        else if (b.type === 'tool_use') allTools.push({ name: String(b.name || 'tool'), target: _toolTarget(b.input) });
      }
    } else if (typeof content === 'string') { textHere += content; }
    if (textHere.trim()) lastAssistantText = textHere.trim().replace(/\s+/g, ' ').slice(0, 400);
  }
  return {
    lastAssistantText: lastAssistantText || '—',
    lastToolActions: allTools.slice(-3),
    stopped: lastMeaningfulRole === 'assistant',
  };
}

function _two(n) { return (n < 10 ? '0' : '') + n; }
function _fmtTs(d) {
  try { return d.getFullYear() + '-' + _two(d.getMonth() + 1) + '-' + _two(d.getDate()) + ' ' + _two(d.getHours()) + ':' + _two(d.getMinutes()); }
  catch { return '—'; }
}
function _or(v) { const s = (v == null) ? '' : String(v).trim(); return s ? s : '—'; }

// Sessão "grande" (turns ≥ FULL_TURNS) → o handoff defaulta a 'full' (inclui RECAP). Abaixo
// disto, 'quick' (só DOING). O opts.mode explícito sobrepõe sempre.
const HANDOFF_FULL_TURNS = 12;
// Baseline honesto: um screenshot enviado a um modelo de visão custa ~1.2k tokens. O handoff é
// texto comprimido localmente; o "saved" é a diferença, sempre rotulado "(est.)". Nunca inventado.
const HANDOFF_SCREENSHOT_TOK = 1200;
function _fmtK(n) {
  const k = (Number(n) || 0) / 1000;
  return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10).toString().replace(/\.0$/, '') + 'k';
}

// ── ⇄ Handoff v3 pure helpers ───────────────────────────────────────────────
// PURE: a short 3–5 word tag from the session's first prompt (row.name). '' when none.
function sessionTag(name) {
  const words = String(name || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return '';
  return words.slice(0, 5).join(' ').slice(0, 48);
}
const STALE_MS = 7 * 86400000; // freshness ⚠ threshold (7 days)
// PURE: human "ago" from a ms-epoch ts relative to nowMs. null/invalid → null (caller renders "—").
function _ago(tsMs, nowMs) {
  const n = Number(tsMs);
  if (!Number.isFinite(n) || n <= 0) return null;
  let d = (Number(nowMs) || 0) - n; if (d < 0) d = 0;
  if (d >= 86400000) return Math.floor(d / 86400000) + 'd ago';
  if (d >= 3600000) return Math.floor(d / 3600000) + 'h ago';
  if (d >= 60000) return Math.floor(d / 60000) + 'm ago';
  return 'agora';
}
// PURE: strip the qwen preamble labels from an on-demand narrative line/block (mirrors
// handoff-rollup.cleanSummary — NO cross-package require). Keeps the content, drops "Recap:/Topic:/…".
function _cleanNarrative(out) {
  if (!out) return '';
  const lines = String(out).split('\n').map((s) => s.trim())
    .map((s) => s.replace(/^(resumo actualizado|resumo actual|resumo|summary|preamble|topic|recap|output|doing)\s*[:\-]\s*/i, ''))
    .filter(Boolean);
  return lines.slice(0, 5).join('\n').slice(0, 600);
}
// PURE (testable): the action-first ASK verb for a session, derived from its deterministic git
// snapshot + the verbatim pending. SAFE — it never proposes a blind merge:
//   classify.js CHANGED        → review   (frozen invariant broken)
//   mixed-sessions             → review   (shared working tree — another session may have stacked commits)
//   stopped on a question      → answer
//   HEAD + ahead + !pushed + frozen + !mixed → verify+merge
//   ahead + pushed/PR          → push-ok  (merged PR → fyi)
//   otherwise                  → fyi
function deriveAsk(snapshot, pending, row) {
  const s = snapshot || {}; const p = pending || {};
  if (s.classifyFrozen === false) return 'review';
  if (s.mixedSessions) return 'review';
  const txt = (p.lastAssistantText && String(p.lastAssistantText).trim()) ? String(p.lastAssistantText).trim() : '';
  if (p.stopped && txt && txt !== '—' && /\?/.test(txt)) return 'answer';
  const ahead = Number(s.baseAhead) || 0;
  if (s.prStage === 'merged ✓') return 'fyi';
  if (ahead > 0 && !s.pushed && s.head) return 'verify+merge';
  if (ahead > 0 && s.pushed) return 'push-ok';
  return 'fyi';
}
// PURE (testável): is `cwd` OUTSIDE the `expected` worktree root? True only when both are present
// and cwd is neither equal to nor nested under expected (different drive on win32 → absolute rel →
// outside). Drives the worktree guard. Never throws (bad input → false = no false alarm).
function _outsideWorktree(cwd, expected) {
  if (!cwd || !expected) return false;
  let c, e;
  try { c = path.resolve(String(cwd)); e = path.resolve(String(expected)); } catch { return false; }
  if (c === e) return false;
  let rel;
  try { rel = path.relative(e, c); } catch { return false; }
  if (!rel) return false;
  return rel === '..' || rel.startsWith('..' + path.sep) || rel.startsWith('../') || path.isAbsolute(rel);
}

// PURE: the concrete one-line NEXT for the Cowork, keyed to the ASK.
function _nextForAsk(ask) {
  switch (ask) {
    case 'verify+merge': return 'correr o gate (final-reviewer) e mergear se verde';
    case 'review':       return 'rever antes de tocar — invariante/sessões mistas em jogo';
    case 'answer':       return 'responder à pergunta pendente acima';
    case 'push-ok':      return 'acompanhar o PR / push até verde';
    default:             return 'nada a fazer — contexto para alinhar';
  }
}

// PURA (testável): monta o texto de handoff v3 (PIRÂMIDE INVERTIDA — acção primeiro). ESQUELETO
// determinístico de `row` + `pending` + `opts.snapshot` (gitSnapshot, mock-injectável). A NARRATIVA
// local entra por opts: opts.doing → linha DOING (fallback: 1º prompt) · opts.recap → bloco RECAP
// (só mode 'full'). REGRA DURA: o PENDING é SEMPRE verbatim de pending.lastAssistantText — o LLM
// NUNCA lhe toca. opts.mode 'quick'|'full' (default por tamanho da sessão). opts.vaultMtime (ms) e
// row.notionSyncedAt/obsidianSyncedAt alimentam o FRESH; opts.deltaTurns (n_turn do journal) o DELTA.
// TOKEN-LEAN: quick = factos + FRESH + DELTA + PENDING + DOING + NEXT; RECAP, model/mode/saved$ e o
// footer (facts/savings) só em 'full'. opts.now fixa o timestamp (testes). Campo em falta → "—".
// Nunca lança (row/pending/snapshot null → tratados como {}).
function generateHandoff(row, pending, opts) {
  row = row || {}; pending = pending || {}; opts = opts || {};
  const now = opts.now || new Date();
  const nowMs = (now && now.getTime) ? now.getTime() : Date.now();
  const snap = opts.snapshot || {};
  const id = row.id || (row.fullId ? String(row.fullId).slice(0, 8) : '?');
  const proj = row.cwd ? path.basename(String(row.cwd)) : '—';
  const tag = sessionTag(row.name) || ('session ' + id);
  const hmode = (opts.mode === 'full' || opts.mode === 'quick')
    ? opts.mode
    : ((Number(row.turns) || 0) >= HANDOFF_FULL_TURNS ? 'full' : 'quick');

  // ── ASK (action-first, SAFE heuristic) ──
  const ask = deriveAsk(snap, pending, row);

  // ── HEAD ──
  const head = (snap.head && snap.head.sha7)
    ? (snap.head.sha7 + (snap.head.subject ? ' "' + snap.head.subject + '"' : '')) : '—';

  // ── BASE: branch · position vs origin/main · PR/local ──
  const ahead = Number(snap.baseAhead) || 0, behind = Number(snap.baseBehind) || 0;
  const pos = ahead > 0 ? ('main+' + ahead) : (behind > 0 ? ('behind ' + behind) : 'main±0');
  const pushSeg = (typeof snap.pushed === 'number' && snap.pushed > 0) ? ('PR #' + snap.pushed)
    : (snap.pushed === true ? 'pushed' : 'local (no push)');
  // PASSO 2 — HONEST per-session branch: prefer the session's OWN journal git (opts.sessionGit ||
  // row.sessionGit) over the shared tree branch. No journal → "incerto (tree partilhado)"; divergence
  // → ⚠ marker. Back-compat: no sessionGit → the tree branch as before.
  const _sg = opts.sessionGit || row.sessionGit || null;
  let branchSeg;
  if (_sg && _sg.source === 'journal' && (_sg.branch || _sg.sha)) {
    branchSeg = _or(_sg.branch) + (_sg.sha ? ' @' + String(_sg.sha).slice(0, 7) : '') + ' (journal)' + (_sg.diverged ? ' ⚠ diverge do tree' : '');
  } else if (_sg && _sg.uncertain) {
    branchSeg = _or(_sg.branch || row.branch) + ' (branch incerto · tree partilhado)';
  } else {
    branchSeg = _or(row.branch);
  }
  const base = branchSeg + ' · ' + pos + ' · ' + pushSeg;

  // ── GATE: classify.js freeze · files touched by HEAD (or brought in by a merge) · mixed-sessions ──
  const gateParts = [];
  if (snap.classifyFrozen === true) gateParts.push('classify.js ✓ frozen');
  else if (snap.classifyFrozen === false) gateParts.push('classify.js ⚠ CHANGED');
  const fhead = Array.isArray(snap.filesInHead) ? snap.filesInHead : [];
  const fc = Number(snap.filesCount) || fhead.length;
  const shownF = fhead.slice(0, 5);
  const moreF = fc - shownF.length;
  // 4c — honest GATE for a merge-commit: "merge-commit (PR #N) · N fich. trazidos" instead of the
  // misleading "HEAD toca 0 fich." (diff-tree on a merge is empty; we diff first-parent..HEAD instead).
  const filesLabel = snap.isMerge
    ? ((typeof snap.pushed === 'number' && snap.pushed > 0 ? 'merge-commit (PR #' + snap.pushed + ')' : 'merge-commit') + ' · ' + fc + ' fich. trazidos')
    : ('HEAD toca ' + fc + ' fich.');
  gateParts.push(filesLabel + (shownF.length ? ': ' + shownF.join(', ') + (moreF > 0 ? ' +' + moreF : '') : ''));
  if (snap.mixedSessions) gateParts.push('⚠ mixed-sessions');
  const gate = gateParts.join(' · ');

  // ── TREE: uncommitted working-tree changes (environment, NOT part of HEAD) ──
  const gs = row.gitStage || {};
  const unc = Number(gs.dirty) || 0;
  const tree = unc > 0 ? ('⚠ ' + unc + ' uncommitted fora do HEAD (ambiente)') : 'clean';

  // ── FRESH: vault (obsidianSyncedAt → vault repo mtime) · Notion · handoff agora ; ⚠ > 7d ──
  const vaultTs = (row.obsidianSyncedAt && Date.parse(row.obsidianSyncedAt))
    || (opts.vaultMtime != null ? Number(opts.vaultMtime) : null);
  const notionTs = (row.notionSyncedAt && Date.parse(row.notionSyncedAt)) || null;
  const vAgo = _ago(vaultTs, nowMs), nAgo = _ago(notionTs, nowMs);
  const vSeg = 'vault ' + (vAgo ? (vAgo + ((nowMs - vaultTs) > STALE_MS ? ' ⚠' : '')) : '—');
  const nSeg = 'Notion ' + (nAgo ? (nAgo + ((nowMs - notionTs) > STALE_MS ? ' ⚠' : '')) : '—');
  const fresh = vSeg + ' · ' + nSeg + ' · handoff agora';

  // ── DELTA: turns (journal n_turn || session turns) · commits ahead of main ──
  const dTurns = (opts.deltaTurns != null && Number.isFinite(Number(opts.deltaTurns)))
    ? Number(opts.deltaTurns) : ((Number(row.turns) || 0) || null);
  const delta = (dTurns == null && !ahead) ? '—'
    : ((dTurns != null ? dTurns : 0) + ' turnos · ' + ahead + ' commits desde o último handoff');

  // ── PENDING (verbatim ≤300c, ground-truth — the LLM never touches it) ──
  const stopRaw = pending.lastAssistantText && String(pending.lastAssistantText).trim();
  const stop = (stopRaw && stopRaw !== '—') ? stopRaw.slice(0, 300) : '—';

  // ── DOING (from the rolling summary's first line; fallback to the 1st prompt) ──
  const doing = (opts.doing && String(opts.doing).trim()) ? String(opts.doing).trim().slice(0, 160) : _or(row.name);

  // ── WORKTREE GUARD (opt-in): warn prominently when the session drifted OUT of its expected
  // worktree (cwd ≠ worktree root) — a commit here could land on the wrong tree. Fires only when an
  // expected root is known (opts.expectedCwd || row.worktreePath); absent → no line (back-compat).
  const expectedWt = opts.expectedCwd || row.worktreePath || null;
  const wtGuard = _outsideWorktree(row.cwd, expectedWt)
    ? '⚠ WORKTREE: sessão fora da worktree — cwd ' + (row.cwd ? path.basename(String(row.cwd)) : '—')
        + ' ≠ ' + path.basename(String(expectedWt)) + ' (commits podem ir para a árvore errada)'
    : null;
  const body = [
    '⇄ MOO HANDOFF · ' + proj + ' · ' + tag + '/' + id + ' · ' + _fmtTs(now),
  ];
  if (wtGuard) body.push(wtGuard);
  body.push(
    'ASK:    ' + ask,
    'HEAD:   ' + head,
    'BASE:   ' + base,
    'GATE:   ' + gate,
    'TREE:   ' + tree,
    'FRESH:  ' + fresh,
    'DELTA:  ' + delta,
    'PENDING:"' + stop + '"',
    'DOING:  ' + doing,
    'NEXT:   ' + _nextForAsk(ask),
  );
  // ── full only: LAST STEP (journal-backfilled) + RECAP + model/mode/saved$ + §SAVINGS + facts footer ──
  if (hmode === 'full') {
    // LAST STEP — the last 1–3 tool calls (name + honest target), from the transcript pending or
    // backfilled from the journal's last entry (PASSO 3). Quick mode omits it (token-lean).
    const lastStep = (Array.isArray(pending.lastToolActions) && pending.lastToolActions.length)
      ? pending.lastToolActions.map((t) => (String(t.name || 'tool') + (t.target ? ' ' + t.target : ''))).join(' · ') : null;
    if (lastStep) body.push('LAST:   ' + lastStep);
    const recap = (opts.recap && String(opts.recap).trim()) ? String(opts.recap).trim().slice(0, 600) : null;
    if (recap) { body.push('', 'RECAP:'); recap.split('\n').forEach((l) => body.push('  ' + l)); }
    const saved = (Number(row.saved) || 0).toFixed(2);
    body.push('', 'model ' + _or(row.model) + ' · mode ' + _or(row.mode) + ' · saved $' + saved + ' (sessão)');
    const engine = (opts.genModel && String(opts.genModel).trim())
      ? ('T0 · ' + String(opts.genModel).trim() + ' · $0' + (opts.bestEffort ? ' · local best-effort' : ''))
      : 'T0 · deterministic — no local gen model · $0';
    const estSaved = (opts.estTokensSaved != null)
      ? (Number(opts.estTokensSaved) || 0)
      : Math.max(0, HANDOFF_SCREENSHOT_TOK - Math.ceil(body.join('\n').length / 4));
    if (estSaved > 0) body.push('compressed locally (' + engine + ') · ~' + _fmtK(estSaved) + ' tok saved vs screenshot (est.)');
    body.push('facts: ' + (snap.factsComplete === false ? 'partial — git facts incompletos (não fabricados)' : 'complete'));
  }
  body.push('⇄ END HANDOFF');
  const out = body.join('\n');
  // ── NOTA header (opt-in, editable): the line Paulo fills in before pasting to the Cowork.
  // opts.note === true → placeholder '____'; a string → that text (≤200c). Absent → no line.
  if (opts.note) {
    const noteTxt = (typeof opts.note === 'string' && opts.note.trim()) ? opts.note.trim().slice(0, 200) : '____';
    return '▸ NOTA PARA O COWORK: ' + noteTxt + '\n' + out;
  }
  return out;
}

// PURA (testável): BOARD de handoff do PROJECTO (todas as sessões de um grupo → um texto). Uma
// linha determinística por sessão (estado + nome + branch + modelo) com flags:
//   DUP         → ≥2 sessões ACTIVAS (working||needsYou) partilham repo+branch = colisão real.
//                 Idle (✅) na mesma branch NÃO conta; a FLAGS conta GRUPOS contestados, não linhas
//                 (sem nenhum mas com co-habitação → informativo "N em <branch>").
//   UNCOMMITTED → gitStage.dirty > 0  (trabalho por guardar)
//   UNPUSHED    → gitStage.ahead > 0  (commits locais por enviar)
// OVERALL está SEMPRE presente (n>0): a síntese do LLM local entra por opts.synth (1 linha factual,
// re-injectada pelo enrichment de background); ausente (Ollama-down/timeout) → resumo DETERMINÍSTICO
// dos contadores reais, NUNCA o 1º prompt de uma sessão. opts.now fixa o timestamp (testes). Nunca
// lança (rows não-array → []). Reusa _fmtTs/_or — não duplica lógica.
// PURE (testable): the HONEST branch label for one session row (PASSO 2). Prefers the session's OWN
// journal git (branch [+ short sha]); when the journal is absent the tree branch is shown flagged
// "branch incerto (tree partilhado)"; divergence (journal vs tree HEAD) adds a ⚠ marker. Back-compat:
// no sessionGit → plain tree branch (_or(r.branch)). Never throws.
function _sessionBranchLabel(r) {
  const sg = (r && r.sessionGit) || null;
  if (sg && sg.source === 'journal' && (sg.branch || sg.sha)) {
    return _or(sg.branch) + (sg.sha ? ' @' + String(sg.sha).slice(0, 7) : '') + (sg.diverged ? ' ⚠ diverge do tree' : '');
  }
  if (sg && sg.uncertain) {
    return _or(sg.branch || (r && r.branch)) + ' · branch incerto (tree partilhado)';
  }
  return _or(r && r.branch);
}

function generateProjectHandoff(proj, rows, opts) {
  opts = opts || {};
  rows = Array.isArray(rows) ? rows : [];
  const now = opts.now || new Date();
  const n = rows.length;
  const head = [
    '⇄ MOO PROJECT HANDOFF → cola no Cowork',
    'project: ' + _or(proj) + ' · ' + n + ' sess' + (n === 1 ? 'ão' : 'ões') + ' · ' + _fmtTs(now),
  ];
  // PASSO 5 — action-first: a per-session ASK derived from row state (no per-row git snapshot needed;
  // a contested group = mixed-sessions → review). Counts feed the deterministic aggregate at the top.
  const askCounts = { 'verify+merge': 0, 'push-ok': 0, answer: 0, review: 0, fyi: 0 };
  const _rowAsk = (r, contested) => {
    if (contested) return 'review';
    const p = (r && r.pending) || {};
    const txt = p.lastAssistantText && String(p.lastAssistantText).trim();
    if (p.stopped && txt && txt !== '—' && /\?/.test(txt)) return 'answer';
    const gs2 = (r && r.gitStage) || {};
    const ahead2 = Number(gs2.ahead) || 0;
    const pr2 = r && r.pr;
    if (pr2 && pr2.stage === 'merged ✓') return 'fyi';
    if (ahead2 > 0 && pr2) return 'push-ok';
    if (ahead2 > 0 && !pr2) return 'verify+merge';
    return 'fyi';
  };
  // POLISH 2 — DUP só sinaliza COLISÃO REAL: ≥2 sessões ACTIVAS (working||needsYou) a partilhar
  // repo (cwd) + branch. Idle (✅) na mesma branch — sobretudo main — NÃO conta (era ruído). Pré-
  // computa por grupo cwd+branch: total de sessões e quantas estão activas. branchCt alimenta o
  // OVERALL determinístico (branch mais comum). Sem cwd → sem repo real → não pode colidir.
  const _active = (r) => !!(r && (r.working || r.needsYou));
  // 4a — a cwd shared by ≥2 sessions = ONE working tree → its dirt is AMBIENT (shared scratch), NOT
  // any one session's own work. cwdCount drives both the per-row UNCOMMITTED suppression and the
  // single ambient footer line. 4b — groups also track `ahead` (the branch's own commits; a shared
  // working tree has ONE HEAD so this is the same for every member) → a DUP needs own commits.
  const cwdCount = new Map(); // cwd -> nº de sessões (shared working tree when ≥2)
  const groups = new Map();   // 'cwd\x00branch' -> { total, active, ahead, branch }
  const branchCt = new Map(); // branch -> nº de sessões
  for (const r of rows) {
    if (r && r.branch) branchCt.set(r.branch, (branchCt.get(r.branch) || 0) + 1);
    if (!r || !r.cwd) continue;
    cwdCount.set(r.cwd, (cwdCount.get(r.cwd) || 0) + 1);
    const k = r.cwd + '\x00' + (r.branch || '');
    const g = groups.get(k) || { total: 0, active: 0, ahead: 0, branch: r.branch || '' };
    g.total++; if (_active(r)) g.active++;
    g.ahead = Math.max(g.ahead, Number((r.gitStage || {}).ahead) || 0);
    groups.set(k, g);
  }
  let unc = 0, unp = 0, activeN = 0;
  const ambient = new Map(); // cwd -> { dirty, sessions } (shared working-tree dirt, counted once)
  const board = [];
  for (const r of rows) {
    const id = (r && r.id) || (r && r.fullId ? String(r.fullId).slice(0, 8) : '?');
    const gs = (r && r.gitStage) || {};
    const flags = [];
    const g = (r && r.cwd) ? groups.get(r.cwd + '\x00' + ((r && r.branch) || '')) : null;
    // 4b — DUP only when ≥2 ACTIVE sessions share repo+branch AND the branch has own commits (ahead>0).
    const contested = !!(g && g.active >= 2 && g.ahead > 0 && _active(r));
    askCounts[_rowAsk(r, contested)]++; // action-first aggregate (review when contested)
    if (contested) flags.push('DUP');
    // 4a — UNCOMMITTED is OWN work only: a session that UNIQUELY owns its cwd. Shared-cwd dirt is
    // ambient → not flagged per-row; recorded once for the footer.
    const dirty = Number(gs.dirty) || 0;
    const sharedCwd = r && r.cwd && (cwdCount.get(r.cwd) || 0) >= 2;
    if (dirty > 0 && sharedCwd) {
      const cur = ambient.get(r.cwd);
      if (!cur || dirty > cur.dirty) ambient.set(r.cwd, { dirty, sessions: cwdCount.get(r.cwd) });
    } else if (dirty > 0) { flags.push('UNCOMMITTED'); unc++; }
    if ((gs.ahead || 0) > 0) { flags.push('UNPUSHED'); unp++; }
    if (_active(r)) activeN++;
    const st = (r && r.working) ? '🟢' : ((r && r.needsYou) ? '🟡' : ((r && r.waitingForCowork) ? '⏳' : '✅'));
    const fl = flags.length ? '  [' + flags.join(' ') + ']' : '';
    const nm = String((r && r.name) || ('session ' + id)).replace(/\s+/g, ' ').slice(0, 56);
    // PASSO 2 — HONEST per-session branch: prefer the session's OWN journal branch (+sha), not the
    // shared tree HEAD. No journal → the tree branch flagged "incerto (tree partilhado)". Divergence
    // (tree moved under the session) → ⚠ marker. Falls back to r.branch when no sessionGit (back-compat).
    board.push('  ' + st + ' ' + nm + ' (' + id + ') · ' + _sessionBranchLabel(r) + ' · ' + _or(r && r.model) + fl);
  }
  if (!board.length) board.push('  — (nenhuma sessão neste projecto)');
  // DUP tally = nº de GRUPOS com ≥2 activas E commits próprios. Sem nenhum, mas com co-habitação (≥2
  // na mesma branch sem colisão activa), mostra o maior grupo informativo "N em <branch>".
  let dupGroups = 0, coTop = null;
  for (const g of groups.values()) {
    if (g.active >= 2 && g.ahead > 0) dupGroups++;
    else if (g.total >= 2 && (!coTop || g.total > coTop.total)) coTop = g;
  }
  const dupSeg = dupGroups > 0 ? (dupGroups + ' DUP')
    : (coTop ? (coTop.total + ' em ' + (coTop.branch || '—')) : '0 DUP');
  // 4a — ambient working-tree dirt summarised ONCE (never per-row). One line, joins distinct shared cwds.
  let ambientLine = null, ambientTotal = 0;
  if (ambient.size) {
    const segs = [];
    for (const [cw, a] of ambient) { ambientTotal += a.dirty; segs.push(path.basename(cw) + ' ' + a.dirty + ' dirty (working-tree partilhado por ' + a.sessions + ' sess)'); }
    ambientLine = '▸ AMBIENTE: ' + segs.join(' · ');
  }
  const tail = [];
  // 4d — OVERALL: prefer the real per-session rolling-summary synth (opts.synth, fed by
  // projectSynthFromSummaries); else a DETERMINISTIC honest line (counts + branch + dirty), NEVER the
  // echo of a session's 1st prompt. unc here is OWN uncommitted (4a); ambient dirt is reported apart.
  const synthText = (opts.synth && String(opts.synth).trim()) ? String(opts.synth).trim().slice(0, 400) : null;
  if (synthText) {
    tail.push('', '▸ OVERALL (local summary): ' + synthText);
  } else if (n > 0) {
    let bTop = '—', bMax = 0;
    for (const [b, c] of branchCt) { if (c > bMax) { bMax = c; bTop = b; } }
    // B5 — AMBIENTE sem duplicar: o dirty ambiente vive SÓ na linha dedicada "▸ AMBIENTE:" (abaixo);
    // o OVERALL deixa de o repetir (era a mesma contagem em dois sítios).
    const overall = n + ' sess' + (n === 1 ? 'ão' : 'ões') + ' em ' + bTop + ' · '
      + activeN + ' activa' + (activeN === 1 ? '' : 's') + ' · ' + unc + ' por commitar · ' + unp + ' por push';
    tail.push('', '▸ OVERALL: ' + overall);
  }
  tail.push('', '▸ FLAGS: ' + dupSeg + ' · ' + unc + ' UNCOMMITTED · ' + unp + ' UNPUSHED');
  if (ambientLine) tail.push(ambientLine);
  // B5 — NEXT condicional às flags: nunca dizer "resolver DUP · commit · push" quando é 0/0/sem-DUP.
  const nextSegs = [];
  if (dupGroups > 0) nextSegs.push('resolver DUP (mesma branch)');
  if (unc > 0) nextSegs.push('commit UNCOMMITTED');
  if (unp > 0) nextSegs.push('push UNPUSHED');
  tail.push(nextSegs.length ? ('▸ NEXT FOR COWORK: ' + nextSegs.join(' · ')) : '▸ NEXT FOR COWORK: nada pendente — projecto limpo');
  tail.push('⇄ END PROJECT HANDOFF');
  // ASK aggregate at the TOP (action-first): "N sessões · a verify+merge · … · X review". review is
  // ALWAYS shown (safety), the rest only when > 0. Omitted entirely when there are no sessions.
  const askLine = [];
  if (n > 0) {
    const order = ['verify+merge', 'push-ok', 'answer', 'fyi'];
    const segs = order.filter((k) => askCounts[k] > 0).map((k) => askCounts[k] + ' ' + k);
    segs.push(askCounts.review + ' review');
    askLine.push('ASK:    ' + n + ' sess' + (n === 1 ? 'ão' : 'ões') + ' · ' + segs.join(' · '));
  }
  // PASSO 2 — PROMOTE risk to the TOP. Real collision (≥2 active sessions with own commits on the
  // same branch = dupGroups) OR per-session branch/SHA divergence from the shared tree → ⚠ HIGH (the
  // board must NOT read green when sessions genuinely conflict). Low risk adds no line (board byte-
  // identical to before → no false "verde" claim, no noise).
  const riskLine = [];
  if (n > 0) {
    let diverged = 0;
    for (const r of rows) { if (r && r.sessionGit && r.sessionGit.diverged) diverged++; }
    if (dupGroups > 0 || diverged > 0) {
      const reasons = [];
      if (dupGroups > 0) reasons.push(dupGroups + ' colisão' + (dupGroups === 1 ? '' : 'es') + ' real' + (dupGroups === 1 ? '' : 'is') + ' (mesma branch · commits próprios)');
      if (diverged > 0) reasons.push(diverged + ' sessã' + (diverged === 1 ? 'o' : 'es') + ' com branch/SHA divergente do tree');
      riskLine.push('⚠ RISCO: HIGH — ' + reasons.join(' · '));
    }
  }
  return head.concat(askLine).concat(riskLine).concat(['', '▸ BOARD:']).concat(board).concat(tail).join('\n');
}

// PURA (testável): HANDOFF COMBINADO — sessão + projecto num só texto para colar no Cowork (Frente F).
// Reusa generateHandoff (NOTA editável no topo + worktree-guard) e ANEXA o BOARD do projecto
// (generateProjectHandoff → estado das outras frentes/sessões, branch, gates pendentes). opts:
//   · note            → header editável (default true → '____'; string → texto)
//   · expectedCwd     → raiz da worktree esperada para o guard (senão row.worktreePath)
//   · project:{ proj, rows, synth } → alimenta o BOARD; sem rows → devolve só a parte da sessão
//   · now             → fixa o timestamp (testes)
// Nunca lança (row/pending/opts null → tratados como {}; rows não-array → só sessão).
function generateCombinedHandoff(row, pending, opts) {
  row = row || {}; pending = pending || {}; opts = opts || {};
  const note = (opts.note != null) ? opts.note : true; // combinado defaulta ao header editável
  const sessionText = generateHandoff(row, pending, Object.assign({}, opts, { note }));
  const projOpts = opts.project || {};
  const rows = Array.isArray(projOpts.rows) ? projOpts.rows : [];
  if (!rows.length) return sessionText; // sem outras frentes conhecidas → só a sessão (honesto)
  const proj = projOpts.proj || (row.cwd ? path.basename(String(row.cwd)) : '—');
  const board = generateProjectHandoff(proj, rows, { synth: projOpts.synth, now: opts.now || projOpts.now });
  return sessionText + '\n\n── PROJECTO (estado das outras frentes) ──\n' + board;
}

function _reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// UPSERT atómico no SYNC.md na raiz de `cwd`. Substitui a secção anterior do MESMO sid
// (marcadores HTML estáveis), nunca acumula lixo. Escrita temp+rename. cria o ficheiro se
// ausente (rota local: "o contexto nunca se perde"). { ok, path, created } | { ok:false }.
function writeHandoffToSync(cwd, sid, text, opts) {
  opts = opts || {};
  if (!cwd || typeof cwd !== 'string') return { ok: false };
  const sidS = String(sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!sidS) return { ok: false };
  try {
    const file = path.join(cwd, 'SYNC.md');
    let base = ''; let created = false;
    try { base = fs.readFileSync(file, 'utf8'); } catch { created = true; }
    const ts = _fmtTs(opts.now || new Date());
    const name = String(opts.name || sidS).replace(/[\r\n]+/g, ' ').slice(0, 60);
    const START = '<!-- mooter-handoff:' + sidS + ' -->';
    const END = '<!-- /mooter-handoff:' + sidS + ' -->';
    const FENCE = '```';
    const block = START + '\n### ⇄ Handoff · ' + name + ' · ' + ts + '\n\n'
      + FENCE + '\n' + String(text || '') + '\n' + FENCE + '\n' + END;
    const re = new RegExp(_reEsc(START) + '[\\s\\S]*?' + _reEsc(END));
    let next;
    if (re.test(base)) { next = base.replace(re, block); }
    else {
      if (!base.trim()) base = '# Mooter — Sync Snapshot\n';
      next = base.replace(/\s*$/, '') + '\n\n' + block + '\n';
    }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, next);
    fs.renameSync(tmp, file);
    return { ok: true, path: file, created };
  } catch { return { ok: false }; }
}

// POST a 127.0.0.1:11434/api/generate (Ollama). Best-effort, bounded, nunca lança.
function _ollamaGenerate(model, prompt, timeoutMs, numPredict) {
  return new Promise((resolve) => {
    try {
      // keep_alive '30m' KEEP-WARM: cada /api/generate renova a janela de retenção do modelo em RAM
      // (esqueleto+enriquecimento futuros já vêm quentes, sem cold-load do disco). Renova a cada uso.
      const payload = JSON.stringify({ model, prompt, stream: false, keep_alive: '30m', options: { num_predict: numPredict || 40 } });
      const req = http.request({ host: '127.0.0.1', port: OLLAMA_PORT, path: '/api/generate', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: timeoutMs || 2000 },
        (res) => { let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => { try { const j = JSON.parse(body); resolve(j && typeof j.response === 'string' ? j.response : null); } catch { resolve(null); } }); });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(payload); req.end();
    } catch { resolve(null); }
  });
}

// ⇄ Handoff F2 (live streaming): STREAMING variant of _ollamaGenerate. POSTs with stream:true and
// parses the NDJSON token stream from Ollama, invoking opts.onChunk(token) for EACH token as it
// arrives → the cockpit panel shows the narrative building live. Best-effort, bounded, NEVER throws:
// on socket error / timeout it resolves { ok, text } with whatever accumulated so far (partial text
// is still usable). keep_alive '30m' renews the keep-warm window like _ollamaGenerate. opts:
// { onChunk, timeoutMs, numPredict, port } (port overridable so a smoke/test can point at a fake server).
function _ollamaGenerateStream(model, prompt, opts) {
  opts = opts || {};
  const onChunk = (typeof opts.onChunk === 'function') ? opts.onChunk : function () {};
  const port = opts.port || OLLAMA_PORT;
  const timeoutMs = opts.timeoutMs || 11000;
  return new Promise((resolve) => {
    let text = ''; let buf = '';
    const consume = (line) => {
      const s = String(line || '').trim(); if (!s) return;
      try { const j = JSON.parse(s); if (j && typeof j.response === 'string' && j.response) { text += j.response; onChunk(j.response); } } catch { /* tolerate a partial/non-JSON line */ }
    };
    try {
      const payload = JSON.stringify({ model, prompt, stream: true, keep_alive: '30m', options: { num_predict: opts.numPredict || 40 } });
      const req = http.request({ host: '127.0.0.1', port, path: '/api/generate', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: timeoutMs },
        (res) => {
          res.on('data', (c) => {
            buf += c.toString();
            let nl;
            while ((nl = buf.indexOf('\n')) >= 0) { consume(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
          });
          res.on('end', () => { consume(buf); resolve({ ok: true, text }); });
        });
      req.on('error', () => resolve({ ok: !!text, text }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: !!text, text }); });
      req.write(payload); req.end();
    } catch { resolve({ ok: false, text: '' }); }
  });
}

// Escolhe um modelo de GERAÇÃO (texto) do /api/tags do Ollama — NUNCA um modelo de embedding.
// Modelos de embedding (nomic-embed-text, bge, gte, e5, *-minilm, ou qualquer /embed/i) devolvem
// vectores, não texto: passar-lhes o prompt da narrativa do handoff dá lixo (era o bug). Filtra-os
// FORA primeiro, e só DEPOIS ordena por tamanho (o mais pequeno = cold-start mais rápido). Devolve
// o NOME do modelo, ou null quando só há modelos de embedding instalados (fallback honesto → o
// esqueleto determinístico fica sozinho). Puro/sync — não toca na rede.
function pickLocalGenModel(models) {
  const list = Array.isArray(models) ? models : [];
  const gen = list.filter((m) => {
    const n = String((m && m.name) || '');
    if (!n) return false;
    if (/embed/i.test(n)) return false;
    if (/(^|[-_/])(nomic|bge|gte|e5|minilm|all-minilm)/i.test(n)) return false;
    return true;
  });
  if (!gen.length) return null;
  const best = gen.slice().sort((a, b) => (a.size || 0) - (b.size || 0))[0];
  return (best && best.name) ? String(best.name) : null;
}

// OPCIONAL: 1 linha "DOING" via Ollama local (modelo de geração mais pequeno = arranque mais rápido).
// `model` (opcional) fixa o modelo já resolvido por composeHandoff — sem ele, resolve-o aqui via
// /api/tags. Bounded a `timeoutMs` e NUNCA bloqueia/lança — null faz o handler cair para o 1º prompt.
async function ollamaDoing(row, timeoutMs, model) {
  timeoutMs = timeoutMs || 2000;
  try {
    let name = model || null;
    if (!name) {
      const tags = await httpJson(OLLAMA_PORT, '/api/tags', Math.min(1200, timeoutMs));
      name = pickLocalGenModel(tags && tags.models);
    }
    if (!name) return null;
    // 4e — tight anti-hallucination prompt: anchor to the topic, forbid invention/translation.
    const prompt = 'Summarise what a coding session is doing in ONE short line (max 12 words, no preamble). '
      + 'Use ONLY the topic below — do NOT invent, translate, or add anything not in it; if unsure, repeat the topic.\n'
      + 'Topic: "' + String((row && row.name) || '').slice(0, 120) + '"\nAnswer:';
    const out = await _ollamaGenerate(name, prompt, timeoutMs);
    if (!out) return null;
    const line = String(out).split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
    return line ? line.slice(0, 120) : null;
  } catch { return null; }
}

// OPCIONAL (mode 'full'): RECAP de 3–5 linhas via Ollama local. Lê APENAS o contexto já extraído
// do transcript (1º prompt + últimas tool-calls); o prompt manda "resume só o que está aqui; não
// inventes; se não souberes, escreve —". NUNCA toca no PENDING (esse é verbatim no gerador).
// Timeout DURO (~4s) e NUNCA bloqueia/lança — null faz o gerador omitir o RECAP (fallback honesto).
async function ollamaRecap(row, pending, timeoutMs, model) {
  timeoutMs = timeoutMs || 4000;
  try {
    let name = model || null;
    if (!name) {
      const tags = await httpJson(OLLAMA_PORT, '/api/tags', Math.min(1500, timeoutMs));
      name = pickLocalGenModel(tags && tags.models);
    }
    if (!name) return null;
    const acts = (pending && Array.isArray(pending.lastToolActions))
      ? pending.lastToolActions.map((t) => (String(t.name || 'tool') + (t.target ? ' ' + t.target : ''))).join(', ') : '';
    const ctx = [
      'Topic: ' + String((row && row.name) || '').slice(0, 160),
      acts ? 'Recent actions: ' + acts.slice(0, 220) : '',
    ].filter(Boolean).join('\n');
    // 4e — tight anti-hallucination prompt: only the context below, never translate/invent.
    const prompt = 'You are writing a short handoff recap for a coding session. Use ONLY the context below; '
      + 'do NOT translate, invent, or add anything not present; if unsure, write "-". 3 to 5 short lines, no preamble.\n\n'
      + ctx + '\n\nRecap:';
    const out = await _ollamaGenerate(name, prompt, timeoutMs, 160);
    if (!out) return null;
    const lines = String(out).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    return lines.length ? lines.join('\n').slice(0, 600) : null;
  } catch { return null; }
}

// ⇄ Handoff F2 (live streaming): the SESSION narrative, generated LIVE token-by-token so the cockpit
// panel shows the handoff being written. Resolves the local GEN model once (excludes embeddings),
// streams DOING (always) and — in 'full' mode — RECAP, calling opts.onChunk(token) for every token of
// both. Returns { ok, model, doing, recap }: ok=false (→ caller falls back to the deterministic
// skeleton / composeHandoff) when no gen model is available or nothing was produced. NEVER blocks
// beyond the per-piece timeouts and NEVER throws. Mirrors the anti-hallucination prompts of
// ollamaDoing/ollamaRecap (anchor to the topic; never invent/translate). The PENDING is never touched
// here — it stays verbatim in generateHandoff. Injectable for tests: opts.model fixes the model,
// opts.tagsModels feeds pickLocalGenModel, opts.streamGen overrides _ollamaGenerateStream, opts.port
// the HTTP port. opts.doingMs/recapMs bound each stream; opts.mode 'quick'|'full' (default by size).
async function streamHandoffNarrative(row, opts) {
  opts = opts || {};
  row = row || {};
  const onChunk = (typeof opts.onChunk === 'function') ? opts.onChunk : function () {};
  const mode = (opts.mode === 'full' || opts.mode === 'quick')
    ? opts.mode
    : ((Number(row.turns) || 0) >= HANDOFF_FULL_TURNS ? 'full' : 'quick');
  try {
    // resolve the gen model — injectable (opts.model fixes it; opts.tagsModels feeds the picker).
    let model = opts.model || null;
    if (!model) {
      let tags = null;
      try { tags = opts.tagsModels ? { models: opts.tagsModels } : await httpJson(OLLAMA_PORT, '/api/tags', Math.min(1500, opts.deadlineMs || 12000)); } catch { tags = null; }
      model = pickLocalGenModel(tags && tags.models);
    }
    if (!model) return { ok: false, model: null, doing: null, recap: null };
    const streamGen = opts.streamGen || _ollamaGenerateStream;
    // DOING (short, ≤12 words) — same anchor as ollamaDoing.
    const doingPrompt = 'Summarise what a coding session is doing in ONE short line (max 12 words, no preamble). '
      + 'Use ONLY the topic below — do NOT invent, translate, or add anything not in it; if unsure, repeat the topic.\n'
      + 'Topic: "' + String(row.name || '').slice(0, 120) + '"\nAnswer:';
    let dBuf = '';
    const dres = await streamGen(model, doingPrompt, { onChunk: (c) => { dBuf += c; onChunk(c); }, timeoutMs: opts.doingMs || 8000, numPredict: 40, port: opts.port }).catch(() => ({ ok: false, text: '' }));
    const doing = _cleanNarrative((dres && dres.text) || dBuf).split('\n').map((s) => s.trim()).filter(Boolean)[0] || null;
    // RECAP (3–5 lines) only in full mode — same anchor/context as ollamaRecap.
    let recap = null;
    if (mode === 'full') {
      const acts = (Array.isArray(opts.lastToolActions) && opts.lastToolActions.length)
        ? opts.lastToolActions.map((t) => (String(t.name || 'tool') + (t.target ? ' ' + t.target : ''))).join(', ') : '';
      const ctx = ['Topic: ' + String(row.name || '').slice(0, 160), acts ? 'Recent actions: ' + acts.slice(0, 220) : ''].filter(Boolean).join('\n');
      const recapPrompt = 'You are writing a short handoff recap for a coding session. Use ONLY the context below; '
        + 'do NOT translate, invent, or add anything not present; if unsure, write "-". 3 to 5 short lines, no preamble.\n\n'
        + ctx + '\n\nRecap:';
      let rBuf = '';
      const rres = await streamGen(model, recapPrompt, { onChunk: (c) => { rBuf += c; onChunk(c); }, timeoutMs: opts.recapMs || 10000, numPredict: 160, port: opts.port }).catch(() => ({ ok: false, text: '' }));
      recap = _cleanNarrative((rres && rres.text) || rBuf) || null;
    }
    return { ok: !!(doing || recap), model, doing, recap };
  } catch { return { ok: false, model: null, doing: null, recap: null }; }
}

// ⇄ Handoff F2 (live streaming, per-project): the OVERALL synth line for a project board, generated
// LIVE token-by-token (same visual pattern as streamHandoffNarrative). Reads ONLY the deterministic
// per-session state (name + branch + dirty/ahead) — never invents. Returns { ok, model, synth }; ok=false
// (→ caller falls back to projectSynthFromSummaries / ollamaProjectSynth / deterministic counts) when no
// model or nothing produced. NEVER blocks/throws. Injectable like streamHandoffNarrative.
async function streamProjectSynth(rows, opts) {
  opts = opts || {};
  rows = Array.isArray(rows) ? rows : [];
  const onChunk = (typeof opts.onChunk === 'function') ? opts.onChunk : function () {};
  if (!rows.length) return { ok: false, model: null, synth: null };
  try {
    let model = opts.model || null;
    if (!model) {
      let tags = null;
      try { tags = opts.tagsModels ? { models: opts.tagsModels } : await httpJson(OLLAMA_PORT, '/api/tags', Math.min(1500, opts.deadlineMs || 11500)); } catch { tags = null; }
      model = pickLocalGenModel(tags && tags.models);
    }
    if (!model) return { ok: false, model: null, synth: null };
    const streamGen = opts.streamGen || _ollamaGenerateStream;
    const ctx = rows.slice(0, 12).map((r) => {
      const id = (r && r.id) || (r && r.fullId ? String(r.fullId).slice(0, 8) : '?');
      const gs = (r && r.gitStage) || {};
      return '- ' + String((r && r.name) || ('session ' + id)).slice(0, 60)
        + ' (branch ' + ((r && r.branch) || '-') + ', dirty ' + (gs.dirty || 0) + ', ahead ' + (gs.ahead || 0) + ')';
    }).join('\n');
    const prompt = 'You are writing ONE short overall line for a multi-session project handoff. '
      + 'Resume SO o que esta no contexto abaixo; nao inventes. 1 to 2 short lines, no preamble.\n\nSessions:\n'
      + ctx + '\n\nOverall:';
    let buf = '';
    const res = await streamGen(model, prompt, { onChunk: (c) => { buf += c; onChunk(c); }, timeoutMs: opts.timeoutMs || 10000, numPredict: 80, port: opts.port }).catch(() => ({ ok: false, text: '' }));
    const synth = (String((res && res.text) || buf).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' ') || '').slice(0, 300) || null;
    return { ok: !!synth, model, synth };
  } catch { return { ok: false, model: null, synth: null }; }
}

// ── Live Context Accumulator readers (PASSO 4/5) ───────────────────────────────────────────────
// The turn-end hook (handoff-journal.js + handoff-rollup.js, in tools/router) accumulates a
// per-session journal + a rolling local-LLM summary in the handoff/ dir. The handoff READS those
// READY artifacts instead of resuming on-demand at copy time (no cold-start, no echo). The file
// FORMAT is the only interface — no cross-package require. Path contract MIRRORS the writer:
// MOOTER_HOME/handoff (tests) else <ROUTER>/handoff (prod: ~/.claude/tools/router/handoff). Every
// reader is best-effort and never throws.
function _handoffDir() {
  return (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0)
    ? path.join(process.env.MOOTER_HOME, 'handoff')
    : path.join(ROUTER, 'handoff');
}
function _handoffSafeId(id) { return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80); }

// The rolling summary for a session: { text, model } or null. `model` (from <sid>.rollup-ts) is the
// qwen model that produced it — used HONESTLY in the §SAVINGS engine label. Never throws.
function readRollingSummary(sid) {
  try {
    const id = _handoffSafeId(sid); if (!id) return null;
    const txt = fs.readFileSync(path.join(_handoffDir(), id + '.summary.txt'), 'utf8').trim();
    if (!txt) return null;
    let model = null;
    try { model = (JSON.parse(fs.readFileSync(path.join(_handoffDir(), id + '.rollup-ts'), 'utf8')) || {}).model || null; } catch { /* optional */ }
    return { text: txt.slice(0, 1200), model };
  } catch { return null; }
}

// The last journal entry for a session (parsed), or null. Used to backfill LAST STEP when the live
// transcript pending is thin. Never throws.
function readJournalLast(sid) {
  try {
    const id = _handoffSafeId(sid); if (!id) return null;
    const lines = fs.readFileSync(path.join(_handoffDir(), id + '.jsonl'), 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch { /* skip */ } }
    return null;
  } catch { return null; }
}

// ── PASSO 2 (Mac feedback): HONEST per-session branch/SHA, read from the session's OWN journal ──
// The Mac gap: many sessions share ONE working tree, so gitBranch(cwd) reports the tree's CURRENT
// HEAD — which another session may have moved under this one. The honest per-session provenance is
// the git the session itself recorded on its LAST turn (handoff-journal writes git:{head,branch}
// per entry). We read the most-recent journal entry that carries git facts. null when the session
// has no journal yet (→ caller marks the branch "incerto (tree partilhado)", never the wrong one).
// Read-only; never throws.
function sessionGitFromJournal(sid) {
  try {
    const id = _handoffSafeId(sid); if (!id) return null;
    const lines = fs.readFileSync(path.join(_handoffDir(), id + '.jsonl'), 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      let e; try { e = JSON.parse(lines[i]); } catch { continue; }
      const g = e && e.git;
      if (g && (g.head != null || g.branch != null)) {
        return {
          head: g.head != null ? String(g.head).slice(0, 12) : null,
          branch: g.branch != null ? String(g.branch).slice(0, 80) : null,
          source: 'journal',
        };
      }
    }
    return null;
  } catch { return null; }
}

// Cheap, NON-blocking tree HEAD sha for a cwd: read straight from .git (no subprocess), mirroring
// handoff-journal.gitInfo's head logic. Used only to detect DIVERGENCE (the session's journal sha
// differs from the tree's current HEAD = the shared tree moved under it). null on any failure.
function _treeHeadSha(cwd) {
  try {
    if (!cwd || typeof cwd !== 'string') return null;
    let gitDir = path.join(cwd, '.git');
    let st; try { st = fs.statSync(gitDir); } catch { return null; }
    if (st.isFile()) {
      const m = fs.readFileSync(gitDir, 'utf8').match(/gitdir:\s*(.+)\s*$/m);
      if (m && m[1]) gitDir = path.resolve(cwd, m[1].trim()); else return null;
    }
    const headRaw = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const refM = headRaw.match(/^ref:\s*(.+)$/);
    if (!refM) return headRaw.slice(0, 12); // detached HEAD
    const ref = refM[1].trim();
    try { return fs.readFileSync(path.join(gitDir, ref), 'utf8').trim().slice(0, 12); }
    catch {
      try {
        const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8').split('\n');
        for (const l of packed) { const mm = l.match(/^([0-9a-f]{40})\s+(.+)$/); if (mm && mm[2] === ref) return mm[1].slice(0, 12); }
      } catch { /* none */ }
      return null;
    }
  } catch { return null; }
}

// PURE (testable): reconcile a session's branch/SHA HONESTLY against the shared tree.
//   • journal present → the session's OWN branch+sha (source 'journal'); `diverged` true when its
//     branch OR sha differs from the current tree HEAD (the tree moved under it = collision signal).
//   • journal absent  → the tree branch is returned but flagged `uncertain` ("incerto (tree
//     partilhado)") — NEVER asserted as the session's own branch.
// Returns { branch, sha, source:'journal'|'tree', uncertain:bool, diverged:bool }. Never throws.
function reconcileSessionGit(journalGit, treeBranch, treeSha) {
  const tb = treeBranch != null ? String(treeBranch) : null;
  const ts = treeSha != null ? String(treeSha).slice(0, 12) : null;
  const jg = journalGit || null;
  if (jg && (jg.branch != null || jg.head != null)) {
    const jb = jg.branch != null ? String(jg.branch) : null;
    const jh = jg.head != null ? String(jg.head).slice(0, 12) : null;
    const diverged = !!((jb && tb && jb !== tb) || (jh && ts && jh !== ts));
    return { branch: jb || tb, sha: jh, source: 'journal', uncertain: false, diverged };
  }
  return { branch: tb, sha: ts, source: 'tree', uncertain: true, diverged: false };
}

// ── B4: estado vivo do "moo local" por sessão (read-only, $0) ──────────────────────────────────
// O que o moo LOCAL fez/está a fazer SEM abrir terminal: último rolling summary + nº de entradas do
// journal + flag HONESTA "a actualizar…" (o journal está à frente do último rollup → a próxima
// sumarização local apanha-o). NUNCA lança; null quando não há actividade local ainda (sem journal
// nem summary). Só LÊ os artefactos do acumulador (não escreve, não toca nos hooks).
function localMooState(sid) {
  try {
    const id = _handoffSafeId(sid); if (!id) return null;
    const dir = _handoffDir();
    let journalN = 0, lastSnippet = '', lastTools = [];
    try {
      const lines = fs.readFileSync(path.join(dir, id + '.jsonl'), 'utf8').split('\n').filter(Boolean);
      journalN = lines.length;
      for (let i = lines.length - 1; i >= 0; i--) {
        try { const e = JSON.parse(lines[i]); lastSnippet = String(e.assistant_snippet || '').slice(0, 160); lastTools = Array.isArray(e.tools) ? e.tools.slice(-3) : []; break; } catch { /* skip bad line */ }
      }
    } catch { /* no journal yet */ }
    const summ = readRollingSummary(sid); // { text, model } | null
    let rollupTurns = null, rollupModel = null, rollupAt = null;
    try {
      const ts = JSON.parse(fs.readFileSync(path.join(dir, id + '.rollup-ts'), 'utf8')) || {};
      rollupTurns = Number.isFinite(ts.turns) ? ts.turns : null; rollupModel = ts.model || null; rollupAt = ts.updated_at || null;
    } catch { /* rollup-ts optional */ }
    if (!journalN && !(summ && summ.text)) return null; // sem actividade local ainda
    const updating = journalN > 0 && (rollupTurns == null || journalN > rollupTurns);
    return {
      journalN,
      summary: summ && summ.text ? String(summ.text).slice(0, 400) : null,
      model: (summ && summ.model) || rollupModel || null,
      updating,
      lastSnippet,
      lastTools: lastTools.map((t) => ({ name: String((t && t.name) || 'tool').slice(0, 24), target: String((t && t.target) || '').slice(0, 48) })),
      rollupAt,
    };
  } catch { return null; }
}

// ── WS3: Local speed snapshot (reads WS1's speed-meter readings, read-only) ────────────────────
// Reads the append-only speed-metrics.jsonl written by tools/router/speed-meter.js (TTFT/TPOT/
// throughput, batch=1, temp=0, median of warm runs). The file FORMAT is the only interface — no
// cross-package require. Returns the latest measured WARM throughput per model so the Local Moo
// Fleet header can show REAL local tok/s ($0, GPU-local). Never throws; null when nothing measured.
function localSpeed() {
  try {
    // Same env override as speed-meter.js metricsPath() so reader and writer agree.
    const p = process.env.MOOTER_SPEED_METRICS_LOG || path.join(ROUTER, 'speed-metrics.jsonl');
    const raw = fs.readFileSync(p, 'utf8');
    const byModel = {};
    for (const line of raw.split('\n')) {
      const t = line.trim(); if (!t) continue;
      let r; try { r = JSON.parse(t); } catch { continue; }
      if (!r || !r.model) continue;
      const warm = r.warm || {};
      const tps = Number(warm.tps);
      const ttft = Number(warm.ttft_ms);
      byModel[r.model] = {
        model: String(r.model).slice(0, 40),
        tps: Number.isFinite(tps) ? tps : null,
        ttft_ms: Number.isFinite(ttft) ? ttft : null,
        cold_ttft_ms: (r.cold && Number.isFinite(Number(r.cold.ttft_ms))) ? Number(r.cold.ttft_ms) : null,
        ts: r.ts || null,
      };
    }
    const models = Object.values(byModel);
    if (!models.length) return null;
    let latest = null;
    for (const m of models) {
      if (m.tps == null) continue;
      if (!latest || String(m.ts || '') > String(latest.ts || '')) latest = m;
    }
    return { models, latest, count: models.length };
  } catch { return null; }
}

// DETERMINISTIC project OVERALL from the per-session rolling summaries already on disk (PASSO 5):
// joins each session's first summary line. Instant, no on-demand call, no echo. null when no
// session has a summary yet (caller falls back to ollamaProjectSynth → deterministic counts).
function projectSynthFromSummaries(rows) {
  rows = Array.isArray(rows) ? rows : [];
  const parts = [];
  for (const r of rows) {
    const s = readRollingSummary(r && (r.fullId || r.id));
    if (s && s.text) {
      const first = String(s.text).split('\n').map((x) => x.trim()).filter(Boolean)[0];
      if (first) parts.push(first.slice(0, 80));
    }
    if (parts.length >= 6) break;
  }
  if (!parts.length) return null;
  return parts.join(' · ').slice(0, 300);
}

// ⇄ Handoff orchestration — the SINGLE source of truth shared by the cockpit handler and the
// runtime smoke. Builds the hybrid handoff: deterministic skeleton (git/branch/files + PENDING
// verbatim, never touched by the LLM) decorated with an OPTIONAL local narrative (DOING + RECAP).
//
// Why this exists: the optional Ollama narrative must NEVER make the clipboard wait. Two guards:
//   1) DOING and RECAP run in PARALLEL (was sequential 2s→4s ≈ 6s; now ≈ max(2s,4s) = 4s worst case).
//   2) A HARD overall deadline (default 4500ms) wins the race no matter what — so even if a socket
//      timeout misfires or Ollama hangs, generateHandoff still ships the deterministic text < 5s.
// Best-effort throughout: any failure → that narrative piece is null and the skeleton stands alone.
async function composeHandoff(row, pending, opts) {
  opts = opts || {};
  const mode = opts.mode || ((Number(row && row.turns) || 0) >= 12 ? 'full' : 'quick');
  const sid = (row && (row.fullId || row.id)) || null;
  // ⇄ v3 deterministic facts — computed ONCE here (or injected by the handler/tests so a single git
  // read feeds both the skeleton and the enriched text). snapshot is best-effort (cwd null → empty,
  // never blocks). deltaTurns comes from the journal's last entry (n_turn); vaultMtime from the handler.
  const snapshot = (opts.snapshot !== undefined) ? opts.snapshot
    : gitSnapshot(row && row.cwd, { recent: opts.recent, branch: row && row.branch, pr: row && row.pr });
  const vaultMtime = (opts.vaultMtime !== undefined) ? opts.vaultMtime : null;
  let deltaTurns = (opts.deltaTurns !== undefined) ? opts.deltaTurns : null;
  if (deltaTurns == null && sid) { const jl = readJournalLast(sid); if (jl && Number.isFinite(jl.n_turn)) deltaTurns = jl.n_turn; }
  const baseOpts = { mode, now: opts.now, snapshot, vaultMtime, deltaTurns };
  // ⇄ Live Context Accumulator (PASSO 4): if the turn-end hook already built a rolling summary in
  // the background, USE IT — instant, no cold-start, no on-demand Ollama call. PENDING stays
  // verbatim from the transcript; the journal backfills LAST STEP only when the live pending is thin.
  // opts.noSummary forces the on-demand path (the runtime smoke proves the Ollama-down/hung guards).
  if (!opts.noSummary) {
    const summ = sid ? readRollingSummary(sid) : null;
    if (summ && summ.text) {
      let pend = pending || {};
      if (!(Array.isArray(pend.lastToolActions) && pend.lastToolActions.length)) {
        const jl = readJournalLast(sid);
        if (jl && Array.isArray(jl.tools) && jl.tools.length) pend = Object.assign({}, pend, { lastToolActions: jl.tools.slice(-3) });
      }
      const doing = String(summ.text).split('\n').map((s) => s.trim()).filter(Boolean)[0] || summ.text;
      const recap = mode === 'full' ? summ.text : null;
      const genModel = summ.model || 'local rolling summary';
      const text = generateHandoff(row, pend, Object.assign({}, baseOpts, { doing, recap, genModel }));
      return { text, mode, doing, recap, timedOut: false, model: summ.model || 'local', fromSummary: true };
    }
  }
  const doingMs = opts.doingMs || 2000;
  const recapMs = opts.recapMs || 4000;
  const deadlineMs = opts.deadlineMs || 4500;
  let timer = null;
  const narrative = (async () => {
    // Resolve o modelo de GERAÇÃO local UMA vez (exclui embeddings) — partilhado por DOING+RECAP e
    // exposto no rodapé (#3b). null → sem modelo de geração → o esqueleto determinístico fica sozinho.
    let genModel = null;
    try {
      const tags = await httpJson(OLLAMA_PORT, '/api/tags', Math.min(1500, deadlineMs));
      genModel = pickLocalGenModel(tags && tags.models);
    } catch { genModel = null; }
    if (!genModel) return { doing: null, recap: null, deadline: false, genModel: null };
    const doingP = ollamaDoing(row, doingMs, genModel).catch(() => null);
    const recapP = mode === 'full' ? ollamaRecap(row, pending, recapMs, genModel).catch(() => null) : Promise.resolve(null);
    const [doing, recap] = await Promise.all([doingP, recapP]);
    return { doing, recap, deadline: false, genModel };
  })();
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ doing: null, recap: null, deadline: true, genModel: null }), deadlineMs);
    if (timer && timer.unref) timer.unref(); // never hold the event loop open on the narrative
  });
  let got;
  try { got = await Promise.race([narrative, deadline]); }
  catch { got = { doing: null, recap: null, deadline: false, genModel: null }; }
  finally { if (timer) clearTimeout(timer); }
  // Modelo no rodapé só quando a narrativa local PRODUZIU texto (honesto — um modelo escolhido que
  // expirou/devolveu nada cai no rótulo determinístico, nunca um motor fabricado).
  const ranModel = (got.genModel && (got.doing || got.recap)) ? got.genModel : null;
  // PASSO 3: even the on-demand fallback narrative passes through _cleanNarrative → the handoff never
  // leaks "Recap:/Preamble:/Topic:" labels even when the qwen summary was generated live here.
  const doingC = got.doing ? (_cleanNarrative(got.doing).split('\n')[0] || null) : null;
  const recapC = got.recap ? (_cleanNarrative(got.recap) || null) : null;
  // 4e — the on-demand narrative is lower-confidence than the accumulated rolling summary; label it
  // "(local best-effort)" so a hallucination is never read as ground truth.
  const text = generateHandoff(row, pending, Object.assign({}, baseOpts, { doing: doingC, recap: recapC, genModel: ranModel, bestEffort: true }));
  return { text, mode, doing: doingC, recap: recapC, timedOut: !!got.deadline, model: ranModel };
}

// OPCIONAL (handoff de PROJECTO): 1–2 linhas de síntese OVERALL via Ollama local. Lê APENAS o
// estado determinístico de cada sessão (nome + branch + dirty/ahead) — não inventa. Timeout DURO
// (~4.5s) e NUNCA bloqueia/lança — null faz o gerador omitir a linha OVERALL (fallback honesto).
async function ollamaProjectSynth(rows, timeoutMs) {
  timeoutMs = timeoutMs || 4500;
  try {
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) return null;
    const tags = await httpJson(OLLAMA_PORT, '/api/tags', Math.min(1500, timeoutMs));
    const name = pickLocalGenModel(tags && tags.models);
    if (!name) return null;
    const ctx = rows.slice(0, 12).map((r) => {
      const id = (r && r.id) || (r && r.fullId ? String(r.fullId).slice(0, 8) : '?');
      const gs = (r && r.gitStage) || {};
      return '- ' + String((r && r.name) || ('session ' + id)).slice(0, 60)
        + ' (branch ' + ((r && r.branch) || '-') + ', dirty ' + (gs.dirty || 0) + ', ahead ' + (gs.ahead || 0) + ')';
    }).join('\n');
    const prompt = 'You are writing ONE short overall line for a multi-session project handoff. '
      + 'Resume SO o que esta no contexto abaixo; nao inventes. 1 to 2 short lines, no preamble.\n\nSessions:\n'
      + ctx + '\n\nOverall:';
    const out = await _ollamaGenerate(name, prompt, timeoutMs, 80);
    if (!out) return null;
    const r = String(out).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' ');
    return r ? r.slice(0, 300) : null;
  } catch { return null; }
}

// OPCIONAL (#3b): pré-aquece o modelo de geração local no arranque do cockpit. Best-effort,
// fire-and-forget: um /api/generate minúsculo (num_predict 1) tira o modelo do disco para a RAM,
// para o 1º handoff já vir do LLM em vez do fallback determinístico por cold-start. NUNCA bloqueia
// nem lança — devolve já (a promessa interna corre em background e nunca é aguardada pelo caller).
function warmLocalGenModel(timeoutMs) {
  timeoutMs = timeoutMs || 1500;
  (async () => {
    try {
      const tags = await httpJson(OLLAMA_PORT, '/api/tags', Math.min(1200, timeoutMs));
      const name = pickLocalGenModel(tags && tags.models);
      if (!name) return;
      await _ollamaGenerate(name, 'ok', 8000, 1); // budget longo OK — destacado, nunca aguardado
    } catch { /* best-effort */ }
  })();
  return true;
}

module.exports = { herd, parseV2, herdMatrix, matrixForUi, insights, execNode, ollamaModels, readMode, setMode, readSubProfile, ansiToHtml, statuslineHtml, slashStatus, installSlashCommands, installPack, ROUTER,
  parseEffort, parseIntent, parseSpanIds, effortGet, effortSet, whyNotFable, trailJson, securitySummary, feedbackSpans, rateSpan, intentResolve, MOOTER_CLI,
  deviceProfile, hwCapability, quantSnapshot, preferences, readBudget, writeBudget, readPinNext, writePinNext, liveRouting, SLASH_CMDS, mooterScore, installedPacks,
  slashCommands, _packDescription,
  PRICES, priceFor, costFor, tokenLedger, aggregateUsage, localTokens, recentSessions, activeSession,
  execTool, _sessionCwd, gitBranch, gitStage, prList, prStage,
  parsePorcelain, defaultCommitMessage, gitHarmony, classifyShaGuard, gitCommitPreview, gitCommit, gitPush, FROZEN_CLASSIFY_SHA,
  gitSnapshot, vaultFreshness, sessionTag, deriveAsk,
  extractPending, generateHandoff, generateCombinedHandoff, _outsideWorktree, writeHandoffToSync, ollamaDoing, ollamaRecap, composeHandoff,
  generateProjectHandoff, ollamaProjectSynth, pickLocalGenModel, warmLocalGenModel,
  _ollamaGenerateStream, streamHandoffNarrative, streamProjectSynth,
  readRollingSummary, readJournalLast, projectSynthFromSummaries, localMooState, localSpeed,
  sessionGitFromJournal, reconcileSessionGit, _treeHeadSha, _sessionBranchLabel };
