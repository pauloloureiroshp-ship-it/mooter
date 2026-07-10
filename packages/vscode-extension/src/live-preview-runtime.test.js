'use strict';
// live-preview-runtime.test.js — EXECUTES the Live Preview webview inline script against a
// hand-rolled DOM (no jsdom dep) and drives the real flow the user hit: arm select → lp-select →
// the toolbar renders → type a prompt → click send → a message is posted AND the in-canvas progress
// shows. This is the runtime proof the string-parse tests can't give: it catches a silently-broken
// wiring ("clico Editar e nada visível acontece"). Also proves the context line reflects the SDK
// bridge (agent ON reads the project; agent OFF edits only this node).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── a minimal-but-functional DOM ────────────────────────────────────────────────────────────────
function makeDom() {
  const byId = Object.create(null);
  const attrRe = /([\w-]+)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/g;
  function parseAttrs(s) {
    const a = {};
    let m;
    while ((m = attrRe.exec(s))) {
      let v = m[2];
      if (v == null) v = '';
      else if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) v = v.slice(1, -1);
      a[m[1].toLowerCase()] = v;
    }
    return a;
  }
  function Element(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.value = '';
    this.textContent = '';
    this.tabIndex = 0;
    this.inert = false;
    this._children = [];       // parsed descendants (flat) — enough for querySelectorAll
    this._listeners = {};
    this.parentNode = null;
    const self = this;
    this.classList = {
      add: (c) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
      remove: (c) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.delete(c); self.className = [...s].join(' '); },
      toggle: (c, on) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); const has = s.has(c); const want = (on == null) ? !has : !!on; if (want) s.add(c); else s.delete(c); self.className = [...s].join(' '); },
      contains: (c) => self.className.split(/\s+/).indexOf(c) !== -1,
    };
  }
  Element.prototype.setAttribute = function (k, v) { this.attributes[k.toLowerCase()] = String(v); if (k === 'id') { this.id = String(v); byId[v] = this; } if (k === 'class') this.className = String(v); };
  Element.prototype.getAttribute = function (k) { const v = this.attributes[k.toLowerCase()]; return v == null ? null : v; };
  Element.prototype.removeAttribute = function (k) { delete this.attributes[k.toLowerCase()]; };
  Element.prototype.addEventListener = function (t, fn) { (this._listeners[t] || (this._listeners[t] = [])).push(fn); };
  Element.prototype.removeEventListener = function (t, fn) { const l = this._listeners[t]; if (l) { const i = l.indexOf(fn); if (i !== -1) l.splice(i, 1); } };
  Element.prototype.dispatchEvent = function (ev) { ev.target = ev.target || this; const l = this._listeners[ev.type] || []; for (const fn of l.slice()) fn.call(this, ev); return true; };
  Element.prototype.click = function () { this.dispatchEvent(mkEvent('click')); };
  Element.prototype.focus = function () { doc.activeElement = this; };
  Element.prototype.blur = function () {};
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  Element.prototype.setSelectionRange = function () {};
  Element.prototype.getBoundingClientRect = function () { return { left: 10, top: 10, width: 120, height: 24, right: 130, bottom: 34, x: 10, y: 10 }; };
  Element.prototype.appendChild = function (c) { c.parentNode = this; this._children.push(c); return c; };
  Element.prototype.contains = function (n) { if (n === this) return true; for (const c of this._children) { if (c === n || (c.contains && c.contains(n))) return true; } return false; };
  Element.prototype.remove = function () { if (this.parentNode) { const i = this.parentNode._children.indexOf(this); if (i !== -1) this.parentNode._children.splice(i, 1); } };
  Object.defineProperty(Element.prototype, 'offsetWidth', { get() { return 260; } });
  Object.defineProperty(Element.prototype, 'offsetHeight', { get() { return 160; } });
  Object.defineProperty(Element.prototype, 'offsetLeft', { get() { return 0; } });
  Object.defineProperty(Element.prototype, 'offsetTop', { get() { return 0; } });
  Object.defineProperty(Element.prototype, 'clientWidth', { get() { return 900; } });
  Object.defineProperty(Element.prototype, 'clientHeight', { get() { return 600; } });
  function matchSel(el, sel) {
    sel = sel.trim();
    if (sel[0] === '#') return el.id === sel.slice(1);
    if (sel[0] === '.') return el.classList.contains(sel.slice(1));
    if (sel[0] === '[') { const mm = /^\[([\w-]+)(?:=("[^"]*"|'[^']*'|[^\]]+))?\]$/.exec(sel); if (!mm) return false; const has = Object.prototype.hasOwnProperty.call(el.attributes, mm[1].toLowerCase()); if (mm[2] == null) return has; let v = mm[2]; if ((v[0] === '"' || v[0] === "'")) v = v.slice(1, -1); return el.getAttribute(mm[1]) === v; }
    return el.tagName === sel.toUpperCase();
  }
  Element.prototype.querySelectorAll = function (sel) { const out = []; const walk = (n) => { for (const c of n._children) { if (matchSel(c, sel)) out.push(c); walk(c); } }; walk(this); return out; };
  Element.prototype.querySelector = function (sel) { const r = this.querySelectorAll(sel); return r.length ? r[0] : null; };
  Object.defineProperty(Element.prototype, 'innerHTML', {
    get() { return this._html || ''; },
    set(html) { this._html = String(html); this._children = []; parseInto(this, String(html)); },
  });
  Element.prototype.insertAdjacentHTML = function (_pos, html) { parseInto(this, String(html)); };

  function parseInto(container, html) {
    const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
    let m;
    while ((m = tagRe.exec(html))) {
      const tag = m[1];
      if (/^\//.test(tag)) continue;
      const el = new Element(tag);
      const attrs = parseAttrs(m[2] || '');
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      el.parentNode = container;
      container._children.push(el);
    }
  }

  function mkEvent(type, extra) {
    const ev = Object.assign({ type: type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} }, extra || {});
    return ev;
  }

  const doc = {
    activeElement: null,
    _listeners: {},
    getElementById: (id) => byId[id] || null,
    createElement: (t) => new Element(t),
    addEventListener: (t, fn) => { (doc._listeners[t] || (doc._listeners[t] = [])).push(fn); },
    dispatchEvent: (ev) => { const l = doc._listeners[ev.type] || []; for (const fn of l.slice()) fn.call(doc, ev); },
    querySelector: (s) => { for (const k in byId) { if (matchSel(byId[k], s)) return byId[k]; } return null; },
    querySelectorAll: () => [],
  };
  doc.documentElement = new Element('html');
  doc.body = new Element('body');
  return { doc, Element, parseInto, mkEvent, byId };
}

function loadModule() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-diagnostics.js', './lp-task-view.js', './lp-presets.js', './lp-skills.js', './lp-security-view.js', './lp-publish-view.js'];
  const req = (name) => { if (name === 'vscode') return mk(); if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate */ }
  return sandbox;
}

// Boot the webview: parse the static body into the DOM, then run the inline script against it.
function bootWebview(bridgeAvailable) {
  const modSandbox = loadModule();
  const html = modSandbox.getLivePreviewHtml('tok');
  const bodyHtml = html.slice(html.indexOf('<body>') + 6, html.indexOf('</script>'));
  const scriptSrc = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const env = makeDom();
  // Pre-register the static body elements so getElementById finds lp-frame/lp-ctb/lp-controls/etc.
  env.parseInto(env.doc.body, bodyHtml.slice(0, bodyHtml.indexOf('<script')));

  const posted = [];
  const winListeners = {};
  const win = {
    addEventListener: (t, fn) => { (winListeners[t] || (winListeners[t] = [])).push(fn); },
    removeEventListener: () => {},
    dispatchEvent: (ev) => { const l = winListeners[ev.type] || []; for (const fn of l.slice()) fn.call(win, ev); },
    postMessage: () => {},
    localStorage: (() => { const s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } }; })(),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    CSS: { escape: (x) => String(x) },
  };
  const ctx = {
    document: env.doc, window: win, globalThis: win,
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState: () => null, setState: () => {} }),
    localStorage: win.localStorage, CSS: win.CSS,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    URL, JSON, Math, Date, console: { log() {}, error() {}, warn() {}, info() {} },
    Array, Object, String, Number, Boolean, RegExp, Set, Map, Promise, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  };
  ctx.window = win; win.document = env.doc;
  vm.createContext(ctx);
  vm.runInContext('function acquireVsCodeApi(){return arguments.callee._api||(arguments.callee._api={postMessage(m){__posted.push(m)}})}\n', ctx); // placeholder, overwritten below
  ctx.__posted = posted;
  ctx.acquireVsCodeApi = () => ({ postMessage: (m) => posted.push(m), getState: () => null, setState: () => {} });
  vm.runInContext(scriptSrc, ctx);

  const frame = env.doc.getElementById('lp-frame');
  frame.contentWindow = { name: 'frame' };
  // 1) snapshot (trusted) → sets curOrigin from the stage url + the SDK-bridge status.
  win.dispatchEvent(env.mkEvent('message', { data: { type: 'lp-snapshot', __t: 'tok', s: { stage: { ok: true, url: 'http://localhost:7819/' }, leBridge: { available: !!bridgeAvailable, reason: bridgeAvailable ? '' : 'sdk-bridge-missing' }, feed: { rev: 0, items: [] } } }, source: win, origin: null }));
  return { env, win, posted, frame, mkEvent: env.mkEvent };
}

function fireSelect(h) {
  h.win.dispatchEvent(h.mkEvent('message', {
    data: { type: 'lp-select', file: 'landing/app/page.tsx', line: 5, col: 3, tag: 'h1', rect: { x: 10, y: 10, w: 120, h: 24 }, text: 'Old headline', className: 'title', path: [], repeated: 0 },
    source: h.frame.contentWindow, origin: 'http://localhost:7819',
  }));
}

test('RUNTIME: arm → lp-select renders the in-canvas toolbar (one-box, send, context line all present)', () => {
  const h = bootWebview(false);
  fireSelect(h);
  const bi = h.env.doc.getElementById('lp-box-in');
  const bb = h.env.doc.getElementById('lp-box-b');
  const ctx = h.env.doc.getElementById('lp-ctx');
  assert.ok(bi, 'the one-box input rendered on select');
  assert.ok(bb, 'the send button rendered');
  assert.ok(ctx, 'the project-context line rendered');
});

test('RUNTIME: type + click send POSTS a message AND shows in-canvas progress (kills "nada visível")', () => {
  const h = bootWebview(false); // bridge OFF → local $0 path (lp-prompt)
  fireSelect(h);
  const bi = h.env.doc.getElementById('lp-box-in');
  const bb = h.env.doc.getElementById('lp-box-b');
  bi.value = 'encurta este texto';
  const before = h.posted.length;
  bb.dispatchEvent(h.mkEvent('click'));
  const sent = h.posted.slice(before);
  assert.ok(sent.length >= 1, 'clicking send POSTED a message to the host (not silent)');
  const t = sent[0].type;
  assert.ok(t === 'lp-prompt' || t === 'lp-task', 'posted a real edit request: ' + t);
  // In-canvas feedback: the progress region is shown (never mute on send).
  const prog = h.env.doc.getElementById('lp-progress');
  assert.strictEqual(prog.style.display, 'flex', 'the in-canvas progress is visible right after send');
});

test('RUNTIME: the context line is HONEST about project context (agent OFF → only this node)', () => {
  const off = bootWebview(false); fireSelect(off);
  assert.ok(/agente OFF/.test(off.env.doc.getElementById('lp-ctx').textContent), 'agent OFF → warns it edits only this node, no project context');
  const on = bootWebview(true); fireSelect(on);
  assert.ok(/projeto TODO/.test(on.env.doc.getElementById('lp-ctx').textContent), 'agent ON → says it reads the whole project');
});

test('RUNTIME: bridge OFF routes Editar to the local $0 path (lp-prompt), not a dead agent call', () => {
  const h = bootWebview(false); fireSelect(h);
  const bi = h.env.doc.getElementById('lp-box-in');
  bi.value = 'muda o título';
  h.env.doc.getElementById('lp-box-b').dispatchEvent(h.mkEvent('click'));
  const sent = h.posted[h.posted.length - 1];
  assert.strictEqual(sent.type, 'lp-prompt', 'bridge off → local fenced rewrite (lp-prompt), never a doomed lp-task');
  assert.strictEqual(sent.tier, 'local', 'runs on the local $0 tier');
});

// ── F3 (W1): every prompt path carries the anchor envelope, no path talks to the LLM before an
//    element is pinned, and the anchor chip is honest ('sem seleção' → '📍 file:line · <tag>'). ──
function sendWith(h, text) {
  const bi = h.env.doc.getElementById('lp-box-in');
  bi.value = text;
  const before = h.posted.length;
  h.env.doc.getElementById('lp-box-b').dispatchEvent(h.mkEvent('click'));
  return h.posted.slice(before);
}
function assertEnvelope(msg) {
  assert.ok(msg, 'a message was posted on send');
  assert.strictEqual(msg.file, 'landing/app/page.tsx', 'the envelope carries the pinned file');
  assert.strictEqual(msg.line, 5, 'the envelope carries the pinned line');
  assert.strictEqual(msg.tag, 'h1', 'the envelope carries the pinned tag');
}

test('F3 ENVELOPE: the local $0 path (lp-prompt) carries the pinned selection', () => {
  const h = bootWebview(false); // bridge OFF → local $0
  fireSelect(h);
  const sent = sendWith(h, 'encurta este texto').filter((x) => x.type === 'lp-prompt');
  assert.strictEqual(sent.length, 1, 'exactly one lp-prompt posted');
  assertEnvelope(sent[0]);
  assert.strictEqual(sent[0].tier, 'local', 'local $0 tier');
});

test('F3 ENVELOPE: the agent edit path (lp-task/edit) carries the pinned selection', () => {
  const h = bootWebview(true); // bridge ON → the anchored agent
  fireSelect(h);
  const sent = sendWith(h, 'muda o título').filter((x) => x.type === 'lp-task');
  assert.strictEqual(sent.length, 1, 'exactly one lp-task posted');
  assert.strictEqual(sent[0].intent, 'edit', 'edit intent');
  assertEnvelope(sent[0]);
});

test('F3 ENVELOPE: the ask path (lp-task/ask) carries the pinned selection', () => {
  const h = bootWebview(true); // ask needs the bridge ON
  fireSelect(h);
  h.env.doc.getElementById('lp-mode-ask').dispatchEvent(h.mkEvent('click')); // flip intent → Perguntar
  const sent = sendWith(h, 'os números batem com o projeto?').filter((x) => x.type === 'lp-task');
  assert.strictEqual(sent.length, 1, 'exactly one lp-task posted');
  assert.strictEqual(sent[0].intent, 'ask', 'ask intent');
  assertEnvelope(sent[0]);
});

test('F3 FAIL-CLOSED: no selection → no one-box, ZERO write/LLM messages can be posted', () => {
  const h = bootWebview(false); // NO fireSelect → nothing pinned
  assert.strictEqual(h.env.doc.getElementById('lp-box-in'), null, 'no one-box exists without a pinned selection');
  assert.strictEqual(h.env.doc.getElementById('lp-box-b'), null, 'no send button exists without a pinned selection');
  const WRITE = ['lp-prompt', 'lp-task', 'lp-prompt-apply', 'lp-edit', 'lp-delete'];
  const writes = h.posted.filter((x) => WRITE.indexOf(x.type) !== -1);
  assert.strictEqual(writes.length, 0, 'no prompt/write path can talk to the LLM without a pinned selection');
});

test('F3 STORE + CHIP: selecting relays exactly one lp-pin to the host SelectionStore and the anchor chip goes honest', () => {
  const h = bootWebview(false);
  const chip = h.env.doc.getElementById('lp-anchor');
  assert.ok(chip, 'the persistent anchor chip exists in the toolbar (the always-visible affordance)');
  const before = h.posted.length;
  fireSelect(h);
  const pins = h.posted.slice(before).filter((x) => x.type === 'lp-pin');
  assert.strictEqual(pins.length, 1, 'exactly one lp-pin relayed to the host store on select');
  assert.strictEqual(pins[0].file, 'landing/app/page.tsx', 'the lp-pin carries the anchor file');
  assert.strictEqual(pins[0].tag, 'h1', 'the lp-pin carries the anchor tag');
  assert.ok(/page\.tsx/.test(chip.innerHTML || ''), 'pinned → the chip names the file');
  assert.ok(/h1/.test(chip.innerHTML || ''), 'pinned → the chip names the tag');
});
