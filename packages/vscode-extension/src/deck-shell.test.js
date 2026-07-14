// deck-shell.test.js — Deck Phase 1 (a espinha). Asserts the header spine ships with
// its structure + WCAG roles, and that the inbox is wired to REAL session/git fields
// (honest-copy: no fabricated numbers, no budget% until W6). Renders getHtml() FOR REAL
// via the same vm harness as webview-syntax.test.js (what the browser receives).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function renderHtml() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (name === './cowork-waiting' || name === './mode-registry' || name === './row-renderer' || name === './arch-tree' || name === './mission-control-view' || name === './project-command-view' || name === './guardian-chip') return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; getHtml is hoisted */ }
  if (typeof sandbox.getHtml !== 'function') throw new Error('getHtml not defined after module eval');
  return sandbox.getHtml();
}

function scriptOf(html) { const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/); assert.ok(m, 'inline script found'); return m[1]; }

test('project switcher ships with radiogroup semantics + a haspopup summary', () => {
  const html = renderHtml();
  assert.match(html, /id="pswitch"/, 'switcher container present');
  assert.match(html, /id="pswitchMenu"[^>]*role="radiogroup"/, 'switcher menu is a radiogroup');
  assert.match(html, /<summary[^>]*aria-haspopup="true"[^>]*aria-label="switch project/, 'switcher summary announces itself');
  assert.match(html, /id="proj"/, 'current-project label kept (host handler depends on #proj)');
});

test('+New menu: CC works now; Loop/Schedule are honest W5 placeholders (disabled)', () => {
  const html = renderHtml();
  assert.match(html, /id="pnew"[\s\S]*?role="menu"/, '+New is a menu');
  assert.match(html, /role="menuitem"[^>]*data-new="cc"/, 'CC is a live menuitem');
  assert.match(html, /data-new="loop"[^>]*disabled[\s\S]*?🌊 W5/, 'Loop is a disabled W5 placeholder');
  assert.match(html, /data-new="schedule"[^>]*disabled[\s\S]*?🌊 W5/, 'Schedule is a disabled W5 placeholder');
  // CC routes to the existing new-session command via the client 'launch' message.
  assert.match(scriptOf(html), /dataset\.new==='cc'\)send\('launch'\)/, 'CC dispatches the launch command');
});

test('inbox is a live region and binds to REAL fields (honest-copy, no fabrication)', () => {
  const html = renderHtml();
  assert.match(html, /id="inbox"[^>]*role="status"[^>]*aria-live="polite"/, 'inbox is a polite status live region');
  const s = scriptOf(html);
  // your-turn / merge-gate / unsaved each read a documented real field — not a literal.
  assert.match(s, /needsYou/, 'your-turn counts r.needsYou');
  assert.match(s, /sessionGit[\s\S]*?aheadOfMain/, 'merge-gate counts commits ahead of main');
  assert.match(s, /gitStage[\s\S]*?dirty/, 'unsaved counts a dirty working tree');
});

test('no fabricated budget percentage in the inbox (deferred to W6)', () => {
  // The inbox must not invent a budget % — there is no spend source until W6.
  const s = scriptOf(renderHtml());
  const inbox = s.slice(s.indexOf('function renderInbox'), s.indexOf('function renderInbox') + 1400);
  assert.doesNotMatch(inbox, /budget/i, 'renderInbox never references budget (no spend source yet)');
});

test('sticky header + reduced-motion kill switch survive Phase 1', () => {
  const html = renderHtml();
  assert.match(html, /\.chrome\{position:sticky/, 'header stays sticky');
  assert.match(html, /prefers-reduced-motion:reduce\)\{\*,\*::before/, 'global reduced-motion kill present');
  assert.match(html, /@keyframes inboxpulse/, 'your-turn pulse defined (disabled under reduced-motion)');
});

test('Cockpit exposes the symmetric animated bridge to Live Preview', () => {
  const html = renderHtml();
  const script = scriptOf(html);
  assert.match(html, /class="surfacebridge"[^>]*aria-label="Alternar superfície do Mooter"/, 'surface switch belongs to the sticky cockpit chrome');
  assert.match(html, /aria-current="page"[^>]*>🧭 Cockpit/, 'Cockpit is announced as the active surface');
  assert.match(html, /id="openLivePreviewSurface"[^>]*>⚡ Live Preview/, 'Live Preview is the symmetric destination');
  assert.match(script, /openLivePreviewSurface[\s\S]*?send\('openLivePreview'\)/, 'the client emits only the command intent');
  const source = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  assert.match(source, /m\.cmd === 'openLivePreview'\) await vscode\.commands\.executeCommand\('mooter\.openLivePreview'\)/, 'the host resolves the intent through the canonical command');
});
