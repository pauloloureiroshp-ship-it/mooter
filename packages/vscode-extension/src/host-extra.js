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
const MOOTER_CLI = path.join(os.homedir(), '.mooter', 'cli', 'mooter.js');

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

module.exports = { execNode, ollamaModels, readMode, setMode, readSubProfile, ansiToHtml, statuslineHtml, slashStatus, ROUTER,
  deviceProfile, hwCapability, quantSnapshot, preferences, readBudget, writeBudget, SLASH_CMDS, mooterScore, installedPacks };
