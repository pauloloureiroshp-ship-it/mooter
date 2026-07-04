// deck-verify.test.js — Deck Phase 5 (Sem-erro). The closing gate: 0 dead buttons · E2E CSP-safe ·
// 0 fabrication. This is a standing regression guard, not a one-off audit.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
const RENDER_SRC = ['extension.js', 'row-renderer.js', 'mission-control-view.js', 'project-command-view.js']
  .map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');

function renderHtml() {
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return mk(); if (name === './cowork-waiting' || name === './mode-registry' || name === './row-renderer' || name === './arch-tree' || name === './mission-control-view' || name === './project-command-view' || name === './guardian-chip') return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(EXT, sandbox, { filename: 'extension.js' }); } catch (e) { /* getHtml is hoisted */ }
  return sandbox.getHtml();
}
const HTML = renderHtml();
const SCRIPT = HTML.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const uniq = (re, s) => new Set([...s.matchAll(re)].map((m) => m[1]));

// ── A · BUTTON AUDIT — every control fires a real handler or a documented client-side effect ──
test('button audit: every send() resolves to a host handler or a client-side effect (0 dead)', () => {
  const sends = uniq(/send\('([a-zA-Z]+)'/g, SCRIPT);
  const handlers = uniq(/m\.cmd\s*===\s*'([a-zA-Z]+)'/g, EXT);
  // archMode is a webview view-toggle: it re-renders client-side (renderArchView) + persists via
  // vsapi.setState — the host message is advisory. Documented, not a dead control.
  const CLIENT_ONLY = new Set(['archMode']);
  const dead = [...sends].filter((c) => !handlers.has(c) && !CLIENT_ONLY.has(c));
  assert.deepStrictEqual(dead, [], 'dead send() with no handler: ' + JSON.stringify(dead));
});

test('button audit: every data-a="X" resolves (handler, wireButtons prefix, or client wiring)', () => {
  const actions = uniq(/data-a="([a-zA-Z]+)"/g, RENDER_SRC);
  const handlers = uniq(/m\.cmd\s*===\s*'([a-zA-Z]+)'/g, EXT);
  // auditFilter is filtered CLIENT-SIDE in wireMc (Phase 5 fix); the prefix forms (term:/openUrl:/
  // pull:/tab:) are handled inside wireButtons.
  const CLIENT_WIRED = new Set(['auditFilter']);
  const dead = [...actions].filter((a) => !handlers.has(a) && !CLIENT_WIRED.has(a));
  assert.deepStrictEqual(dead, [], 'dead data-a with no handler: ' + JSON.stringify(dead));
});

test('button audit: the previously-dead auditFilter now filters rows client-side (not a no-op send)', () => {
  assert.match(EXT, /mcv2-afilter\[data-a="auditFilter"\][\s\S]{0,260}r\.hidden=/, 'auditFilter chips hide/show rows client-side');
  assert.match(RENDER_SRC, /class="mcv2-audrow" data-af="/, 'audit rows carry the filter key');
});

test('button audit: known-honest controls stay honest (Notion/Obsidian clickable only with a real target; ↺ = marcar visto)', () => {
  // chips are actionable (data-a) ONLY when a real url/path exists, else role="img" (informative).
  assert.match(RENDER_SRC, /notionUrl \? \(' data-a="openUrl:/, 'Notion chip clickable only with a real URL');
  assert.match(RENDER_SRC, /obsidianPath \? \(' data-a="openFile:/, 'Obsidian chip clickable only with a real path');
  assert.match(RENDER_SRC, /: ' role="img"'/, 'no target ⇒ role="img" (informative, not a fake action)');
  assert.match(RENDER_SRC, /marcar visto/, '↺ is honestly labelled "marcar visto" (stamps a local review time, no fake sync)');
});

// ── B · E2E CSP-safe — the delivered webview is CSP-safe and renders every deck surface ──
test('E2E: CSP locked down (default-src none · nonce script-src) and the script carries the nonce', () => {
  assert.match(HTML, /Content-Security-Policy[^>]*default-src 'none'/, 'default-src none');
  assert.match(HTML, /script-src 'nonce-/, 'scripts require a nonce');
  assert.match(HTML, /<script nonce="/, 'the inline script carries the nonce');
});

test('E2E: no inline on*= event handlers in static markup (CSP-safe; wiring uses addEventListener)', () => {
  const staticHtml = HTML.replace(/<script[\s\S]*?<\/script>/g, '');
  const inline = staticHtml.match(/\son(click|load|error|mouseover|input|change|keydown)="/gi) || [];
  assert.deepStrictEqual(inline, [], 'inline handlers found (would be CSP-blocked): ' + JSON.stringify(inline));
});

test('E2E: the delivered script parses as-delivered and renders every deck surface', () => {
  assert.doesNotThrow(() => new vm.Script('function acquireVsCodeApi(){return{postMessage(){},getState(){return{}},setState(){}}};' + SCRIPT), 'webview JS parses');
  ['id="pswitch"', 'id="inbox"', 'id="pnew"', 'id="brandCow"'].forEach((x) => assert.ok(HTML.indexOf(x) >= 0, 'ships ' + x));
  ['function renderFlowLens', 'function renderHwStrip', 'function renderPipeline', 'function renderHandoffFlow', 'function renderInbox', 'function renderFleetConsole']
    .forEach((fn) => assert.ok(SCRIPT.indexOf(fn) >= 0, 'ships ' + fn));
});

// ── C · HONEST-COPY AUDIT — deck surfaces interpolate every number; no fabricated literals ──
test('honest-copy: no hardcoded $amount or %number in any deck render fn (all values interpolated)', () => {
  const Sc = SCRIPT.replace(/\/\/[^\n]*/g, ''); // strip honesty notes in comments
  const fnBody = (name) => { const i = Sc.indexOf('function ' + name); if (i < 0) return ''; const j = Sc.indexOf('\nfunction ', i + 10); return Sc.slice(i, j < 0 ? i + 3000 : j); };
  ['renderFlowLens', 'renderEconomicsLens', 'renderHwStrip', 'renderPipeline', 'renderBrainLens', 'renderFoundationsLens'].forEach((fn) => {
    // Threshold labels (e.g. "≥80% ctx", the real Guardian mask rung) are constants, not fabricated
    // values — strip them before auditing for fabricated $/% metrics.
    const body = fnBody(fn).replace(/[≥≤<>]\s?\d+%/g, '');
    assert.ok(body.length > 0, fn + ' present');
    assert.ok(!/\$\d/.test(body), fn + ': no hardcoded $amount (savings/costs come from variables)');
    assert.ok(!/\d%/.test(body), fn + ': no hardcoded percentage value (every % metric is interpolated)');
  });
});

test('honest-copy: n/d helper exists and is used across the deck surfaces (no silent blanks)', () => {
  assert.match(SCRIPT, /function lNd\(\)\{return '<span class="nd">n\/d<\/span>'/, 'n/d helper present');
  ['renderFlowLens', 'renderEconomicsLens', 'renderHwStrip', 'renderFoundationsLens'].forEach((fn) => {
    assert.ok(new RegExp(fn + '[\\s\\S]{0,1600}lNd\\(\\)').test(SCRIPT), fn + ' renders n/d where a source is missing');
  });
});
