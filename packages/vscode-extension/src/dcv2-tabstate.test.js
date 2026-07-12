'use strict';
// dcv2-tabstate.test.js — Director's Cut v2 · F2 RUNTIME anti-break contract (adversarial
// verification). Unlike webview-syntax.test.js / dcv2-tabs.test.js — which only PARSE the inline
// <script> (vm.Script never executes it) — this file actually EXECUTES it inside a vm sandbox
// against a minimal but faithful DOM stub, proving at runtime that:
//   1. a snapshot NEVER resets the active tab back to stream
//   2. only the active pane re-renders; identical data is a signed no-op (no redundant
//      innerHTML reassignment)
//   3. the stream's scroll position survives a re-render with different events
//   4. the lenses HTML-escape hostile content (model name / pillar id) when driven through the
//      real render path
//   5. render()/setTab() never throw before any real snapshot has arrived (null-safe)
//
// Writes nothing under src/*.js — reads extension.js as text only (loadExtension() mirrors
// webview-syntax.test.js exactly) and evaluates the extracted inline script fresh per test (own
// vm context ⇒ own module vars lpDcTab/lpLastSnap/lpLensSig — no cross-test state leakage).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadExtension() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-toolbar-geom.js', './lp-diagnostics.js', './lp-task-view.js', './lp-presets.js', './lp-skills.js', './lp-security-view.js', './lp-publish-view.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; the getters are hoisted */ }
  return sandbox;
}

// Extract the inline <script>...</script> body from getLivePreviewHtml('tok') EXACTLY as
// webview-syntax.test.js does, so we execute the SAME text the real webview receives.
function extractScript() {
  const sandbox = loadExtension();
  assert.strictEqual(typeof sandbox.getLivePreviewHtml, 'function', 'getLivePreviewHtml defined after module eval');
  const html = sandbox.getLivePreviewHtml('tok');
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(m, 'inline <script> block found in getLivePreviewHtml output');
  return m[1];
}

const SCRIPT_TEXT = extractScript(); // pure/deterministic — computed once, re-evaluated fresh per test below

// ── minimal but faithful DOM stub ───────────────────────────────────────────────────────────
// One stub element type covers every id the script touches (create-on-demand). innerHTML
// re-scans for the '.lpdc-stream' marker on every assignment and, when present, RESETS its
// scrollTop to 0 — this mirrors a real browser destroying/recreating child nodes on innerHTML
// replacement. That reset is deliberate: a stub that just left scrollTop untouched forever would
// make the "stream scroll preserved" assertion pass trivially even if the source dropped its own
// manual restore line (`nS.scrollTop=sc` in renderLens) — resetting forces the test to actually
// exercise that line.
function makeElement(id) {
  let html = '';
  let setCount = 0;
  let streamChild = null;
  const classes = new Set();
  const attrs = {};
  const listeners = {};
  if (id && id.indexOf('lp-tab-') === 0) {
    attrs['aria-selected'] = (id === 'lp-tab-stream') ? 'true' : 'false';
    classes.add('lp-tab');
    if (id === 'lp-tab-stream') classes.add('on');
  }
  if (id && id.indexOf('lp-pane-') === 0 && id !== 'lp-pane-stream') attrs.hidden = 'hidden';

  const el = {
    id: id,
    tabIndex: (id === 'lp-tab-stream') ? 0 : ((id && id.indexOf('lp-tab-') === 0) ? -1 : 0),
    style: {},
    get innerHTML() { return html; },
    set innerHTML(v) {
      setCount++;
      html = String(v == null ? '' : v);
      if (html.indexOf('class="lpdc-stream"') !== -1) {
        if (!streamChild) streamChild = { scrollTop: 0 };
        else streamChild.scrollTop = 0; // fresh node on every re-render, like a real browser
      } else {
        streamChild = null;
      }
    },
    get __setCount() { return setCount; },
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      contains(c) { return classes.has(c); },
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    focus() { this._focused = true; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector(sel) { return sel === '.lpdc-stream' ? streamChild : null; },
    querySelectorAll() { return []; },
    // Simplified on purpose: our tests drive setTab()/render() directly instead of dispatching
    // synthetic clicks (that IS the code path the real click handler ends up calling), so this
    // only needs to satisfy the '#lp-tabs' IIFE's own truthy guard — no assertion below exercises
    // a real click.
    closest(sel) { return (sel && sel.charAt(0) === '.' && classes.has(sel.slice(1))) ? el : null; },
    contentWindow: null,
  };
  return el;
}

function makeDocument() {
  const map = new Map();
  const PRESET = ['lp-tabs', 'lp-brain', 'lp-pane-stream', 'lp-pane-day', 'lp-pane-model', 'lp-pane-fleet', 'lp-tab-stream', 'lp-tab-day', 'lp-tab-model', 'lp-tab-fleet'];
  for (const id of PRESET) map.set(id, makeElement(id));
  return {
    getElementById(id) { if (!map.has(id)) map.set(id, makeElement(id)); return map.get(id); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    activeElement: null,
  };
}

// Evaluates the extracted script text FRESH — own vm context ⇒ own module vars (lpDcTab/
// lpLastSnap/lpLensSig never leak between tests). Function DECLARATIONS at the script's top
// level become real properties of the vm's global object once it has run (same mechanism
// loadExtension() already relies on for sandbox.getHtml/getLivePreviewHtml), so render/setTab/
// renderLens/lpPane are read directly off `context` — no extra exposure line needed.
function evalWebview() {
  const doc = makeDocument();
  const win = { addEventListener() {}, removeEventListener() {}, postMessage() {}, scrollY: 0 };
  const context = {
    document: doc,
    window: win,
    acquireVsCodeApi: () => ({ postMessage() {}, getState() { return {}; }, setState() {} }),
    console: { log() {}, error() {}, warn() {}, info() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    URL,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(SCRIPT_TEXT, context, { filename: 'lp-webview-runtime.js' });
  assert.strictEqual(typeof context.render, 'function', 'render() must be live in the sandbox');
  assert.strictEqual(typeof context.setTab, 'function', 'setTab() must be live in the sandbox');
  assert.strictEqual(typeof context.renderLens, 'function', 'renderLens() must be live in the sandbox');
  assert.strictEqual(typeof context.lpPane, 'function', 'lpPane() must be live in the sandbox');
  return { context, doc };
}

// ── 1. a snapshot never resets the active tab ───────────────────────────────────────────────
test('F2 anti-break: a snapshot never resets the active tab back to stream', () => {
  const { context, doc } = evalWebview();
  context.setTab('day');
  const snap1 = { events: [], sidKnown: true, byDay: { days: [{ day: '2026-07-08', events: { total: 3 }, decisions: { total: 2, tiers: { T0: 2 }, pctLocal: 100 } }], window: { events: 3, decisions: 2 } } };
  context.render(snap1);
  assert.strictEqual(doc.getElementById('lp-tab-day').getAttribute('aria-selected'), 'true', 'day tab must stay selected after render()');
  assert.strictEqual(doc.getElementById('lp-pane-day').getAttribute('hidden'), null, 'day pane must stay visible after render()');
  assert.notStrictEqual(doc.getElementById('lp-pane-stream').getAttribute('hidden'), null, 'stream pane must stay hidden — render() must not bounce the tab back');
});

// ── 2. active pane gets content; inactive panes are left alone ─────────────────────────────
test('F2 anti-break: the active pane renders lens content, inactive panes are untouched', () => {
  const { context, doc } = evalWebview();
  const streamBefore = doc.getElementById('lp-pane-stream').innerHTML;
  context.setTab('model');
  context.render({ byModel: { models: [{ model: 'gpt-4o', tier: 'T2', ops: { total: 5 }, routes: 3 }], totals: {}, window: {} } });
  assert.ok(doc.getElementById('lp-pane-model').innerHTML.includes('ops reais'), 'model pane must carry the model-lens marker');
  assert.strictEqual(doc.getElementById('lp-pane-stream').innerHTML, streamBefore, 'inactive stream pane must not be re-rendered');
});

// ── 3. signed no-op: identical data never reassigns the active pane twice ──────────────────
test('F2 anti-break: identical snapshot data is a signed no-op (no redundant innerHTML reassignment)', () => {
  const { context, doc } = evalWebview();
  context.setTab('fleet');
  const snap = { fleet: { resting: false, heartbeat: { ts: new Date().toISOString(), dryRun: false }, pillars: [{ id: 'p1', status: 'ok', round: 1, running: true }] } };
  const pane = doc.getElementById('lp-pane-fleet');
  context.render(snap);
  const countAfterFirst = pane.__setCount;
  context.render(snap); // same data, second call
  assert.strictEqual(pane.__setCount, countAfterFirst, 'a second render() with identical data must not reassign the active pane innerHTML again');
});

// ── 4. stream scroll position survives a re-render with different events ──────────────────
test('F2 anti-break: the stream scroll position is preserved across a snapshot with different events', () => {
  const { context, doc } = evalWebview();
  context.render({ events: [{ ts: Date.now(), kind: 'file', path: 'a.ts' }], sidKnown: true });
  const pane = doc.getElementById('lp-pane-stream');
  const child1 = pane.querySelector('.lpdc-stream');
  assert.ok(child1, 'stream child must be present after the first render');
  child1.scrollTop = 120;
  context.render({ events: [{ ts: Date.now(), kind: 'file', path: 'b.ts', summary: 'a different event' }], sidKnown: true });
  const child2 = pane.querySelector('.lpdc-stream');
  assert.strictEqual(child2.scrollTop, 120, 'scrollTop must be restored after the events changed');
});

// ── 5. lenses escape hostile content when driven through the real render path ─────────────
test('F2 anti-break: lenses escape hostile model names / pillar ids (no raw <script> reaches the DOM)', () => {
  const { context, doc } = evalWebview();
  context.setTab('model');
  context.render({ byModel: { models: [{ model: '<script>alert(1)</script>', tier: 'T2', ops: { total: 1 }, routes: 1 }], totals: {}, window: {} } });
  const modelHtml = doc.getElementById('lp-pane-model').innerHTML;
  assert.ok(modelHtml.includes('&lt;script&gt;'), 'the model name must be HTML-escaped');
  assert.ok(!modelHtml.includes('<script>alert(1)</script>'), 'the raw <script> tag must never reach the pane innerHTML');

  context.setTab('fleet');
  context.render({ fleet: { resting: false, heartbeat: null, pillars: [{ id: '<script>evil()</script>', status: 'ok', running: true }] } });
  const fleetHtml = doc.getElementById('lp-pane-fleet').innerHTML;
  assert.ok(fleetHtml.includes('&lt;script&gt;'), 'the pillar id must be HTML-escaped');
  assert.ok(!fleetHtml.includes('<script>evil()</script>'), 'the raw <script> tag must never reach the pane innerHTML');
});

// ── 6. no throw before init / null snapshot ────────────────────────────────────────────────
test('F2 anti-break: render(null) and setTab() before any real snapshot never throw', () => {
  const { context } = evalWebview();
  assert.doesNotThrow(() => context.render(null), 'render(null) must not throw');
  assert.doesNotThrow(() => { context.setTab('fleet'); context.render(null); }, 'setTab + render(null) must not throw');
});
