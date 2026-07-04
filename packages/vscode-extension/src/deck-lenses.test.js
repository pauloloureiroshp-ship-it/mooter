// deck-lenses.test.js — Deck Phase 3 (Lentes ligadas). Gate: every lens reads a REAL data-source
// or renders n/d — no hardcoded/fabricated numbers. Guards the four lenses (Flow · Economics · Brain
// · Foundations) against the exact accessors the mappers confirmed, and against the three honesty
// traps found: there is no P85, no differential-privacy datum, and no budget spend figure.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function renderHtml() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return mk(); if (name === './cowork-waiting' || name === './mode-registry' || name === './row-renderer' || name === './arch-tree' || name === './mission-control-view' || name === './project-command-view' || name === './guardian-chip') return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* getHtml is hoisted */ }
  return sandbox.getHtml();
}
function scriptOf(html) { const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/); assert.ok(m, 'inline script found'); return m[1]; }
const S = scriptOf(renderHtml());
// Comment-stripped view: the "must-not-render" guards below check delivered CODE/STRINGS, not the
// honest `//` notes that explain WHY a datum (P85/DP) is deliberately absent.
const Sc = S.replace(/\/\/[^\n]*/g, '');

test('all four lenses ship as collapsible cards', () => {
  ['lens-flow', 'lens-econ', 'lens-brain', 'lens-found'].forEach((id) => {
    assert.ok(S.indexOf('data-collap="' + id + '"') >= 0, id + ' card present');
  });
  assert.match(S, /function lNd\(\)\{return '<span class="nd">n\/d<\/span>'/, 'shared n/d helper present');
});

test('Flow reads s.pc.flow.wip + per-wave P50/P90 wall — and never fabricates a P85', () => {
  assert.match(S, /function renderFlowLens/, 'Flow lens defined');
  assert.match(S, /pc\.flow&&pc\.flow\.wip/, 'WIP from s.pc.flow.wip');
  assert.match(S, /forecast_missing/, 'guards the forecast-missing state');
  assert.match(S, /p50_wall[\s\S]{0,40}p90_wall/, 'forecast shows P50/P90 wall');
  assert.ok(!/P85|p85/.test(Sc), 'no P85 rendered — it does not exist in the engine');
});

test('Economics is honest: advisory savings + real $ + router mix by COUNTS + budget spend = n/d', () => {
  assert.match(S, /M\.saved[\s\S]{0,60}saved_pct[\s\S]{0,40}advisory/, 'saved is labelled advisory');
  assert.match(S, /guaranteed_saved[\s\S]{0,80}option_a_hits/, 'real executed $ + real dispatch count');
  assert.match(S, /contagens, não \$/, 'router mix stated as counts, not per-tier dollars');
  assert.match(S, /gasto n\/d/, 'budget spend is n/d (only the ceiling is real)');
  assert.match(S, /não de trade-off de qualidade/, 'authored AI-attribution copy present');
});

test('Brain: Pastor(TF-IDF)+Guardian(ctxFull)+Ledger real; wave-handoff + W7/W9/W10 are honest 🌊', () => {
  assert.match(S, /s\.insights/, 'Pastor from s.insights');
  assert.match(S, /TF-IDF, não neural/, 'honest: not neural');
  assert.match(S, /s\.mc\.totals\.ctxFull/, 'Guardian deck signal = ctxFull');
  assert.match(S, /s\.ledger/, 'Ledger real');
  assert.match(S, /🌊 W7[\s\S]{0,80}🌊 W9[\s\S]{0,80}🌊 W10/, 'Adapters/Insights-TTL/Graph are 🌊 placeholders');
  assert.match(S, /wave <span class="lsoon">🌊/, 'wave-level handoff is honestly not-yet-built');
});

test('Foundations: Arch-frozen + Doctor from s.score.checks; NO fabricated differential-privacy metric', () => {
  assert.match(S, /classifysha/, 'Arch reads the classify-sha doctor check');
  assert.match(S, /classify frozen ✓/, 'frozen state copy');
  assert.match(S, /c\.ok===true|checks\[j\]\.ok===true/, 'Doctor counts real passing checks');
  assert.match(S, /Object\.keys\(\(s&&s\.packs\)\|\|\{\}\)/, 'Setup packs from s.packs');
  assert.ok(!/differential|epsilon|\bDP\b/.test(Sc), 'no differential-privacy datum is invented (it does not exist)');
});
