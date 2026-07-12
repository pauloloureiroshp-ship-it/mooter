'use strict';
// dcv2-work.test.js — Director's Cut v2 · F3 (honest work animation) contract.
// (A) unit — deserialize renderWorkPill exactly the way the webview does (fn.toString() +
//     new Function('esc', ...)) and drive it with a FIXED nowMs for determinism. Proves the
//     state machine keys off the most-recent MEANINGFUL bus event (a work verb OR a Stop) and
//     that a crash never looks like eternal work: >=90s stale with no Stop reads "sem sinal há
//     Xs", never a pulsing "working" pill.
// (B) runtime — reuses the dcv2-tabstate.test.js vm + DOM-stub harness to execute the REAL
//     inline <script> from getLivePreviewHtml('tok'), proving render() actually wires the
//     signed work-mount update (no redundant innerHTML reassignment on identical data; a real
//     state change DOES reassign).
// (C) structural — the CSS/markup/serialisation anchors landed in extension.js.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LPV = require('./live-preview-view.js');

// ── (A) unit — webview-sim deserialisation (exact webview path) ───────────────────────────

const _wv_esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _wvRenderWorkPill = new Function('esc', 'return (' + LPV.renderWorkPill.toString() + ')')(_wv_esc);

const FIXED_NOW = 1720000000000; // arbitrary fixed epoch ms — determinism only, no real-clock coupling

function freshTs(offsetMs) {
  return new Date(FIXED_NOW - (offsetMs || 0)).toISOString();
}

test('F3 unit: fresh file event renders class=working + "a editar…"', () => {
  const html = _wvRenderWorkPill([{ ts: freshTs(0), kind: 'file' }], FIXED_NOW);
  assert.ok(html.includes('class="lp-work working"'), 'must carry the working class');
  assert.ok(html.includes('a editar…'), 'must show the file verb');
});

test('F3 unit: fresh task/route/reason events render their own verbs', () => {
  const taskHtml = _wvRenderWorkPill([{ ts: freshTs(0), kind: 'task' }], FIXED_NOW);
  assert.ok(taskHtml.includes('class="lp-work working"'));
  assert.ok(taskHtml.includes('a tarefar…'));

  const routeHtml = _wvRenderWorkPill([{ ts: freshTs(0), kind: 'route' }], FIXED_NOW);
  assert.ok(routeHtml.includes('class="lp-work working"'));
  assert.ok(routeHtml.includes('a rotear…'));

  const reasonHtml = _wvRenderWorkPill([{ ts: freshTs(0), kind: 'reason' }], FIXED_NOW);
  assert.ok(reasonHtml.includes('class="lp-work working"'));
  assert.ok(reasonHtml.includes('a pensar (local $0)'), 'reason verb (local $0 cost callout)');
});

test('F3 unit: most-recent server (Stop) renders class=done + checkmark, no working class/pulse', () => {
  const html = _wvRenderWorkPill([{ ts: freshTs(0), kind: 'server' }], FIXED_NOW);
  assert.ok(html.includes('class="lp-work done"'), 'must carry the done class');
  assert.ok(html.includes('pronto'), 'must show the pronto label');
  assert.ok(!html.includes('working'), 'a Stop must never carry the working/pulse class');
});

test('F3 unit: a 120s-old work event with no Stop reads stale "sem sinal há 2m"', () => {
  const html = _wvRenderWorkPill([{ ts: freshTs(120000), kind: 'file' }], FIXED_NOW);
  assert.ok(html.includes('class="lp-work stale"'), 'must carry the stale class');
  assert.ok(html.includes('sem sinal há 2m'), 'must show the honest age');
  assert.ok(!html.includes('working'), 'a stale pill must never carry the working/pulse class');
});

test('F3 unit: empty events render idle "sem sinal ainda"; never throws on null/garbage', () => {
  const html = _wvRenderWorkPill([], FIXED_NOW);
  assert.ok(html.includes('class="lp-work idle"'));
  assert.ok(html.includes('sem sinal ainda'));

  assert.doesNotThrow(() => _wvRenderWorkPill(null, FIXED_NOW), 'null events must not throw');
  assert.doesNotThrow(() => _wvRenderWorkPill(undefined, FIXED_NOW), 'undefined events must not throw');
  assert.doesNotThrow(() => _wvRenderWorkPill('garbage', FIXED_NOW), 'non-array events must not throw');
  assert.doesNotThrow(() => _wvRenderWorkPill([null, undefined, 42, { kind: 'file' }, { ts: 'not-a-date', kind: 'file' }], FIXED_NOW), 'garbage list entries must not throw');
});

test('F3 unit: ordering keys off the most-recent meaningful event, not event order', () => {
  // a server (Stop) AFTER a file → done (no work since the last Stop)
  const doneHtml = _wvRenderWorkPill([
    { ts: freshTs(5000), kind: 'file' },
    { ts: freshTs(0), kind: 'server' },
  ], FIXED_NOW);
  assert.ok(doneHtml.includes('class="lp-work done"'));

  // a file AFTER a server, fresh → working (new work started since the last Stop)
  const workingHtml = _wvRenderWorkPill([
    { ts: freshTs(5000), kind: 'server' },
    { ts: freshTs(0), kind: 'file' },
  ], FIXED_NOW);
  assert.ok(workingHtml.includes('class="lp-work working"'));
});

test('F3 unit: honest-crash — a 5-minute-old file event with no later Stop is stale, never working', () => {
  const html = _wvRenderWorkPill([{ ts: freshTs(5 * 60 * 1000), kind: 'file' }], FIXED_NOW);
  assert.ok(html.includes('class="lp-work stale"'), 'a stalled process must read stale, not working');
  assert.ok(html.includes('sem sinal há 5m'), 'must show the honest 5-minute age');
  assert.ok(!html.includes('working'), 'a crash must never look like eternal work');
});

test('F3 unit: concat-only guard — renderWorkPill source has no backticks or ${} interpolation', () => {
  const src = LPV.renderWorkPill.toString();
  assert.ok(src.indexOf('`') === -1, 'renderWorkPill source has no backticks');
  assert.ok(src.indexOf('${') === -1, 'renderWorkPill source has no ${ interpolation');
});

// ── (B) runtime — signed webview wiring (mirrors dcv2-tabstate.test.js's harness) ──────────

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

function extractScript() {
  const sandbox = loadExtension();
  assert.strictEqual(typeof sandbox.getLivePreviewHtml, 'function', 'getLivePreviewHtml defined after module eval');
  const html = sandbox.getLivePreviewHtml('tok');
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(m, 'inline <script> block found in getLivePreviewHtml output');
  return m[1];
}

const SCRIPT_TEXT = extractScript();
const FULL_HTML = loadExtension().getLivePreviewHtml('tok'); // reused by the (C) structural block below

function makeElement(id) {
  let html = '';
  let setCount = 0;
  let streamChild = null;
  const classes = new Set();
  const attrs = {};
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
        else streamChild.scrollTop = 0;
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
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) { return sel === '.lpdc-stream' ? streamChild : null; },
    querySelectorAll() { return []; },
    closest(sel) { return (sel && sel.charAt(0) === '.' && classes.has(sel.slice(1))) ? el : null; },
    contentWindow: null,
  };
  return el;
}

function makeDocument() {
  const map = new Map();
  const PRESET = ['lp-tabs', 'lp-brain', 'lp-work-mount', 'lp-pane-stream', 'lp-pane-day', 'lp-pane-model', 'lp-pane-fleet', 'lp-tab-stream', 'lp-tab-day', 'lp-tab-model', 'lp-tab-fleet'];
  for (const id of PRESET) map.set(id, makeElement(id));
  return {
    getElementById(id) { if (!map.has(id)) map.set(id, makeElement(id)); return map.get(id); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    activeElement: null,
  };
}

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
  return { context, doc };
}

test('F3 runtime: render() sets the work-mount pill to working for a fresh file event', () => {
  const { context, doc } = evalWebview();
  const mount = doc.getElementById('lp-work-mount');
  context.render({ events: [{ ts: new Date().toISOString(), kind: 'file', path: 'a.ts' }] });
  assert.ok(mount.innerHTML.includes('lp-work working'), 'work-mount must carry the working pill');
  assert.ok(mount.innerHTML.includes('a editar'), 'work-mount must show the file verb');
});

test('F3 runtime: signed no-op — identical events never reassign the work-mount innerHTML twice', () => {
  const { context, doc } = evalWebview();
  const mount = doc.getElementById('lp-work-mount');
  const snap = { events: [{ ts: new Date().toISOString(), kind: 'file', path: 'a.ts' }] };
  context.render(snap);
  const countAfterFirst = mount.__setCount;
  context.render(snap); // same data, second call
  assert.strictEqual(mount.__setCount, countAfterFirst, 'a second render() with identical events must not reassign the work-mount innerHTML again (pulse must not restart)');
});

test('F3 runtime: a real state change (fresh file → then a Stop) DOES reassign the work-mount', () => {
  const { context, doc } = evalWebview();
  const mount = doc.getElementById('lp-work-mount');
  context.render({ events: [{ ts: new Date().toISOString(), kind: 'file', path: 'a.ts' }] });
  const countAfterFirst = mount.__setCount;
  context.render({ events: [{ ts: new Date().toISOString(), kind: 'server', path: 'stop' }] });
  assert.ok(mount.__setCount > countAfterFirst, 'a Stop following a file event must reassign the work-mount pill');
  assert.ok(mount.innerHTML.includes('lp-work done'), 'the reassigned pill must be the done pill');
});

// ── (C) structural — CSS/markup/serialisation anchors ──────────────────────────────────────

test('F3 structural: getLivePreviewHtml carries the animation CSS, reduced-motion guard, serialised fn, and mount', () => {
  assert.ok(FULL_HTML.includes('@keyframes lpworkpulse'), 'must define the pulse keyframes');
  assert.ok(FULL_HTML.includes('.lp-work.working .lpw-cow{animation:'), 'only the working cow must animate');
  assert.ok(FULL_HTML.includes('prefers-reduced-motion:reduce'), 'the global reduced-motion guard must be present');
  assert.ok(FULL_HTML.includes('const renderWorkPill='), 'renderWorkPill must be serialised into the inline script');
  assert.ok(FULL_HTML.includes('<div id="lp-work-mount">'), 'the stable work-mount anchor must be present');
});
