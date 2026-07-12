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
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-toolbar-geom.js', './lp-diagnostics.js', './lp-task-view.js', './lp-presets.js', './lp-skills.js', './lp-security-view.js', './lp-publish-view.js'];
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

// ── W2: the honest context-source chip — repo ✓ (Context Engine) · Notion n/d (Camada C not wired). ──
test('W2 CONTEXT CHIP: bridge ON → honest "repo ✓ · Notion n/d"; bridge OFF → hidden (never fakes context)', () => {
  const on = bootWebview(true); fireSelect(on); // bridge ON → agent reads the project
  const chipOn = on.env.doc.getElementById('lp-ctx-src');
  assert.ok(chipOn, 'the context-source chip element exists');
  assert.ok(/repo ✓/.test(chipOn.textContent || ''), 'bridge ON → repo ✓ (the Context Engine reads the repo)');
  assert.ok(/Notion n\/d/.test(chipOn.textContent || ''), 'honest: Notion n/d (Camada C not wired) — never faked');
  assert.notStrictEqual(chipOn.style.display, 'none', 'the chip is visible when the agent reads the project');
  const off = bootWebview(false); fireSelect(off); // bridge OFF → local $0, only this node
  const chipOff = off.env.doc.getElementById('lp-ctx-src');
  assert.strictEqual(chipOff.style.display, 'none', 'bridge OFF (local $0) → no context-source chip (honest: it edits only this node)');
});

test('W2 CONTEXT CHIP stays honest on TIER SWITCH: agent (repo ✓) → local $0 (hidden) → agent (repo ✓)', () => {
  const h = bootWebview(true); fireSelect(h); // bridge ON, default edit+auto → agent reads the repo
  const chip = h.env.doc.getElementById('lp-ctx-src');
  const tier = (mode) => { const c = h.env.doc.getElementById('lp-chip'); return c && c.querySelector('[data-mode="' + mode + '"]'); };
  assert.ok(/repo ✓/.test(chip.textContent || '') && chip.style.display !== 'none', 'auto → 📚 repo ✓ visible');
  // switch to the local $0 tier — the fenced local rewrite reads NOTHING from the repo
  const local = tier('local');
  assert.ok(local, 'the local tier chip exists');
  local.dispatchEvent(h.mkEvent('click'));
  assert.strictEqual(chip.style.display, 'none', 'local $0 → the chip HIDES (no stale "repo ✓" lie)');
  // back to the agent — the honest chip returns
  const auto = tier('auto');
  auto.dispatchEvent(h.mkEvent('click'));
  assert.ok(/repo ✓/.test(chip.textContent || '') && chip.style.display !== 'none', 'back to auto → 📚 repo ✓ returns (agent reads the repo)');
});

// ── F0.3/F0.4: the 🛡 Review and 🚀 Publish top-toolbar actions carry VISIBLE text labels. ──
test('F0.3/F0.4: 🛡 Review + 🚀 Publish show text labels (discoverable, not just tooltips)', () => {
  const html = loadModule().getLivePreviewHtml('tok');
  assert.ok(/id="lp-security-btn"[^>]*>🛡 Review</.test(html), 'the security action shows the label "🛡 Review"');
  assert.ok(/id="lp-publish-btn"[^>]*>🚀 Publish</.test(html), 'the publish action shows the label "🚀 Publish"');
});

// ── F0.1: prompt-first — the box is the star (autofocus on pin), tier picker under it, presets collapsed. ──
test('F0.1: after a pin, the prompt box is focused and sits above the tier picker + ▾ ajustes rápidos drawer', () => {
  const h = bootWebview(true); fireSelect(h);
  const bi = h.env.doc.getElementById('lp-box-in');
  assert.ok(bi, 'the prompt box rendered');
  assert.strictEqual(h.env.doc.activeElement, bi, 'the prompt box is autofocused on a fresh pin (ready to type)');
  const html = loadModule().getLivePreviewHtml('tok');
  const iBox = html.indexOf('id="lp-box-in"'), iChip = html.indexOf('id="lp-chip"');
  const iMore = html.indexOf('id="lp-more"'), iAdv = html.indexOf('id="lp-adv"'), iPresets = html.indexOf('id="lp-presets"');
  assert.ok(iBox < iChip && iChip < iMore, 'order: prompt box → tier picker → ▾ ajustes rápidos (prompt-first)');
  assert.ok(iPresets > iAdv, 'presets are collapsed inside the ▾ ajustes rápidos drawer');
  assert.ok(/▾ ajustes rápidos/.test(html), 'the drawer is labelled "▾ ajustes rápidos"');
});

// ── F0.5.1: an empty window (no folder) → honest "open folder" screen + button, never a dead state. ──
test('F0.5.1: no folder → honest empty-window screen with an "Abrir a pasta" button that posts lp-open-folder', () => {
  const h = bootWebview(false);
  h.win.dispatchEvent(h.mkEvent('message', { data: { type: 'lp-snapshot', __t: 'tok', s: { stage: { ok: false, degraded: true, reason: 'sem pasta' }, leBridge: { available: false, reason: 'no-workspace' }, feed: { rev: 0, items: [] } } }, source: h.win, origin: null }));
  const deg = h.env.doc.getElementById('lp-degrade');
  assert.ok(/Nenhuma pasta aberta/.test(deg.innerHTML || ''), 'shows the honest empty-window screen, not the "start the dev server" lie');
  const btn = h.env.doc.getElementById('lp-open-folder');
  assert.ok(btn, 'the "Abrir a pasta" button is present (never a dead state)');
  const before = h.posted.length;
  btn.dispatchEvent(h.mkEvent('click'));
  const posted = h.posted.slice(before).filter(function (x) { return x.type === 'lp-open-folder'; });
  assert.strictEqual(posted.length, 1, 'clicking posts lp-open-folder → the host opens the folder in this window');
});

// ── F0.5.3: readiness semaphore — 4 honest lights + 1-click fix per unlit light (sticky-port visible). ──
test('F0.5.3: the semaphore shows port+source + tree state, and each fix button posts the right message', () => {
  const h = bootWebview(false);
  // sticky-port: folder ok, dev server up on :3000 (Docker), served tree MISMATCH, agent untrusted.
  h.win.dispatchEvent(h.mkEvent('message', { data: { type: 'lp-snapshot', __t: 'tok', s: { stage: { ok: true, url: 'http://localhost:3000/', port: 3000, source: 'probe' }, leBridge: { available: false, reason: 'workspace-untrusted' }, readiness: { workspace: true, devServer: true, port: '3000', source: 'probe', tree: 'mismatch', sdk: false, trust: false, reason: 'workspace-untrusted' }, feed: { rev: 0, items: [] } } }, source: h.win, origin: null }));
  const el = h.env.doc.getElementById('lp-ready');
  assert.ok(el, 'the semaphore element exists');
  assert.ok(/:3000 probe/.test(el.innerHTML || ''), 'shows the dev-server port + source — the sticky one is VISIBLE, not hidden');
  assert.ok(/outra árvore/.test(el.innerHTML || ''), 'the served-tree light is amber (mismatch) — the sticky-port/old-branch case');
  const restart = el.querySelector('[data-fix="restart"]');
  assert.ok(restart, 'the tree-mismatch light offers a "reiniciar dev server" fix');
  let before = h.posted.length;
  restart.dispatchEvent(h.mkEvent('click'));
  assert.ok(h.posted.slice(before).some(function (x) { return x.type === 'lp-restart-dev'; }), 'restart fix posts lp-restart-dev (gated host-side)');
  const trust = el.querySelector('[data-fix="trust"]');
  before = h.posted.length;
  trust.dispatchEvent(h.mkEvent('click'));
  assert.ok(h.posted.slice(before).some(function (x) { return x.type === 'lp-trust'; }), 'trust fix posts lp-trust (Manage Workspace Trust)');
});

test('F9 (D8/#3): the "sem SDK" light offers a REAL SDK action (lp-sdk-help), not a mislabelled folder picker', () => {
  const h = bootWebview(false);
  // folder + trusted, but the Agent SDK is missing → the sdk light lights up.
  h.win.dispatchEvent(h.mkEvent('message', { data: { type: 'lp-snapshot', __t: 'tok', s: { stage: { ok: true, url: 'http://localhost:7819/' }, leBridge: { available: false, reason: 'sdk-bridge-missing' }, readiness: { workspace: true, devServer: true, port: '7819', source: 'tap', tree: 'ok', sdk: false, trust: true, reason: 'sdk-bridge-missing' }, feed: { rev: 0, items: [] } } }, source: h.win, origin: null }));
  const el = h.env.doc.getElementById('lp-ready');
  assert.ok(/sem SDK/.test(el.innerHTML || ''), 'the sdk light is lit');
  const sdk = el.querySelector('[data-fix="sdk"]');
  assert.ok(sdk, 'it offers an sdk fix (data-fix="sdk", not "folder")');
  assert.ok(/como instalar/.test(el.innerHTML || ''), 'the button reads "como instalar" (honest), not the old bare "instalar"');
  assert.strictEqual(el.querySelector('[data-fix="folder"]'), null, 'the "sem SDK" light does NOT wire a folder picker');
  const before = h.posted.length;
  sdk.dispatchEvent(h.mkEvent('click'));
  assert.ok(h.posted.slice(before).some(function (x) { return x.type === 'lp-sdk-help'; }), 'clicking posts lp-sdk-help (host shows the real install command) — never lp-open-folder');
  assert.ok(!h.posted.slice(before).some(function (x) { return x.type === 'lp-open-folder'; }), 'the "sem SDK" fix is NOT a folder picker');
});

test('F9 (#4): the applied toast tells the truth about HMR — promises a refresh only when hot-reload is UP', () => {
  const h = bootWebview(false);
  fireSelectWith(h, { file: 'landing/app/page.tsx', line: 5, col: 3, tag: 'h1', path: [ { file: 'landing/app/page.tsx', tag: 'section', label: 'section' }, { file: 'landing/app/page.tsx', tag: 'h1', label: 'h1' } ] });
  const msg = () => (h.env.doc.getElementById('lp-edit-msg') || {}).textContent || '';
  const fireApplied = () => h.win.dispatchEvent(h.mkEvent('message', { data: { type: 'lp-edit-result', __t: 'tok', ok: true, reason: 'applied' }, source: h.win, origin: null }));
  // HMR healthy → the toast may say the preview updates.
  fireApplied();
  assert.ok(/o HMR atualiza o preview/.test(msg()), 'with HMR up, the applied toast promises the refresh');
  // HMR goes down (tap banner) → the SAME applied result must NOT keep promising a refresh that will not happen.
  h.win.dispatchEvent(h.mkEvent('message', { data: { type: 'lp-hmr-down' }, source: h.frame.contentWindow, origin: 'http://localhost:7819' }));
  fireApplied();
  assert.ok(/hot-reload desligado/.test(msg()), 'with HMR down, the toast tells the user to reload — no false promise');
  assert.ok(!/o HMR atualiza o preview/.test(msg()), 'the unconditional "o HMR atualiza" promise is gone while HMR is down');
});

// ── F5 (P1-5): component-scope + multi-instance warnings are BEHAVIOURAL, not just string-present ──
// The audit found the shared-component warning (parentCrumb.file !== sel.file) was covered only by a
// string-presence assert on the raw HTML — neither the POSITIVE branch (a node whose usage site is a
// different file → warn) nor the NEGATIVE branch (a node in its OWN page → NO warn) was exercised. A
// silent regression here makes the UI lie: either scream on everything, or go quiet on real shared
// components. These drive the REAL renderSelection() via the runtime harness and read #lp-sel.
function fireSelectWith(h, over) {
  const base = { type: 'lp-select', file: 'landing/app/page.tsx', line: 5, col: 3, tag: 'h1', rect: { x: 10, y: 10, w: 120, h: 24 }, text: 'Old headline', className: 'title', path: [], repeated: 0 };
  h.win.dispatchEvent(h.mkEvent('message', { data: Object.assign(base, over), source: h.frame.contentWindow, origin: 'http://localhost:7819' }));
}
const SHARED_WARN = 'afeta todos os usos deste componente';
const selHtml = (h) => { const el = h.env.doc.getElementById('lp-sel'); return el ? el.innerHTML : ''; };

test('F5/P1-5: node whose USAGE site (parent crumb) is a DIFFERENT file → shared-component warning FIRES', () => {
  const h = bootWebview(false);
  // leaf lives in Card.tsx (a component definition); the crumb above it is the page that USES it.
  fireSelectWith(h, {
    file: 'landing/components/Card.tsx', tag: 'h2',
    path: [ { file: 'landing/app/page.tsx', tag: 'section', label: 'section' }, { file: 'landing/components/Card.tsx', tag: 'h2', label: 'h2' } ],
  });
  assert.ok(selHtml(h).indexOf(SHARED_WARN) !== -1, 'edit lands on the definition → all-usages warning must show');
});

test('F5/P1-5: node in its OWN page (parent crumb SAME file) → shared-component warning is SILENT (no false alarm)', () => {
  const h = bootWebview(false);
  fireSelectWith(h, {
    file: 'landing/app/page.tsx', tag: 'h1', repeated: 0,
    path: [ { file: 'landing/app/page.tsx', tag: 'section', label: 'section' }, { file: 'landing/app/page.tsx', tag: 'h1', label: 'h1' } ],
  });
  assert.strictEqual(selHtml(h).indexOf(SHARED_WARN), -1, 'a plain page node must NOT scream the shared-component warning (the layout.tsx false-positive fix)');
});

test('F5/P1-5: repeated>1 → multi-instance (.map()) warning fires with the exact count', () => {
  const h = bootWebview(false);
  fireSelectWith(h, { file: 'landing/app/page.tsx', tag: 'li', repeated: 3, path: [ { file: 'landing/app/page.tsx', tag: 'ul', label: 'ul' }, { file: 'landing/app/page.tsx', tag: 'li', label: 'li' } ] });
  const html = selHtml(h);
  assert.ok(html.indexOf('×3') !== -1 && html.indexOf('TODOS os itens') !== -1, 'repeated node → honest template-wide warning with the live count');
  assert.strictEqual(html.indexOf(SHARED_WARN), -1, 'same-file repeated node does not ALSO fire the shared-component warning');
});

// ── F6 (P1-6): the 5.2a limitations must be VISIBLE to the user, not buried in a comment ───────────
// The "frame is pinned to the FIRST instance" fact lived only in a source comment; the user editing a
// .map()'d node had no way to know the highlight box tracks instance #1 while the write hits the whole
// template. Surface it in the multi-instance warning copy.
test('F6/P1-6: the multi-instance warning states the frame is pinned to the FIRST instance (limitation surfaced, not just commented)', () => {
  const h = bootWebview(false);
  fireSelectWith(h, { file: 'landing/app/page.tsx', tag: 'li', repeated: 4, path: [ { file: 'landing/app/page.tsx', tag: 'ul', label: 'ul' }, { file: 'landing/app/page.tsx', tag: 'li', label: 'li' } ] });
  const html = selHtml(h);
  assert.ok(/presa à 1ª instância/.test(html), 'the user must SEE that the highlight tracks instance #1 while the edit hits the template');
  assert.ok(html.indexOf('TODOS os itens') !== -1, 'and still that the edit affects every rendered item');
});

// ── F2 (P1-7): honest hot-reload-down banner — the preview must never silently fake freshness ──────
// When the tap's HMR socket drops (dev server down / hot-reload dead), edits stop reflecting while the
// frame still LOOKS fresh. The tap posts lp-hmr-down (origin-locked); the webview must SHOW it, and
// clear it on lp-hmr-up (reconnect). Driven through the same origin-locked iframe channel as lp-select.
function fireTap(h, data) {
  h.win.dispatchEvent(h.mkEvent('message', { data: data, source: h.frame.contentWindow, origin: 'http://localhost:7819' }));
}
test('F2/P1-7: lp-hmr-down shows the honest stale banner; lp-hmr-up clears it', () => {
  const h = bootWebview(false);
  const hmr = () => h.env.doc.getElementById('lp-hmr');
  assert.ok(hmr(), '#lp-hmr mount is present in the body');
  // (The static default is display:none in the shipped HTML — asserted in webview-syntax.test.js. The
  // hand-rolled DOM does not reflect a static style attribute into .style, so here we assert behaviour.)
  fireTap(h, { type: 'lp-hmr-down' });
  assert.strictEqual(hmr().style.display, 'block', 'down → the banner is shown');
  assert.ok(/hot-reload desligado/.test(hmr().textContent || ''), 'honest copy: the preview may be stale');
  fireTap(h, { type: 'lp-hmr-up' });
  assert.strictEqual(hmr().style.display, 'none', 'up (reconnected) → banner cleared');
  assert.strictEqual(hmr().textContent, '', 'no stale copy left behind');
});
test('F2/P1-7: an lp-hmr-down that is NOT from the origin-locked frame is ignored (no spoofed banner)', () => {
  const h = bootWebview(false);
  // Wrong source (not the frame) — the origin lock must drop it, exactly like every other tap message.
  h.win.dispatchEvent(h.mkEvent('message', { data: { type: 'lp-hmr-down' }, source: { name: 'evil' }, origin: 'http://localhost:7819' }));
  assert.notStrictEqual(h.env.doc.getElementById('lp-hmr').style.display, 'block', 'a non-frame sender cannot fake the stale banner');
});

test('D1: a device preset that cannot fit shows the honest EFFECTIVE width (never a silent "768" lie)', () => {
  const h = bootWebview(false);
  const btn768 = h.env.doc.getElementById('lp-dev-768');
  const note = () => h.env.doc.getElementById('lp-dev-note');
  assert.ok(btn768 && note(), 'device button + effective-width note mount present');
  btn768.dispatchEvent(h.mkEvent('click'));
  assert.strictEqual(note().style.display, 'inline', 'the note shows when the panel caps the preset below the requested width');
  assert.ok(/768px pedido/.test(note().textContent || '') && /efetivo/.test(note().textContent || ''), 'states requested vs effective honestly: ' + note().textContent);
  h.env.doc.getElementById('lp-dev-full').dispatchEvent(h.mkEvent('click'));
  assert.strictEqual(note().style.display, 'none', 'full width clears the note (nothing to warn about)');
});

// ── F0.2: clicking a node shows ITS history (per-node feed by nodeKey; prior-session items labelled) ──
function pushFeed(h, items) {
  h.win.dispatchEvent(h.mkEvent('message', { data: { type: 'lp-snapshot', __t: 'tok', s: { stage: { ok: true, url: 'http://localhost:7819/' }, leBridge: { available: false }, feed: { rev: 99, items: items } } }, source: h.win, origin: null }));
}
test('F0.2: selecting a node shows ITS history; a prior-session item is read-only "histórico"', () => {
  const h = bootWebview(false);
  pushFeed(h, [
    { id: 'h1', ts: 1000, via: 'texto · $0', files: ['landing/app/page.tsx'], status: 'live', nodeKey: { file: 'landing/app/page.tsx', line: 5, col: 3, tag: 'h1' }, persisted: true },
    { id: 'f1', ts: 2000, via: 'classe · $0', files: ['landing/app/page.tsx'], status: 'live', nodeKey: { file: 'landing/app/page.tsx', line: 5, col: 3, tag: 'h1' }, persisted: false },
    { id: 'x1', ts: 3000, via: 'texto · $0', files: ['landing/app/other.tsx'], status: 'live', nodeKey: { file: 'landing/app/other.tsx', line: 9, col: 1, tag: 'p' }, persisted: false },
  ]);
  fireSelectWith(h, { file: 'landing/app/page.tsx', line: 5, col: 3, tag: 'h1', path: [ { file: 'landing/app/page.tsx', tag: 'section', label: 'section' }, { file: 'landing/app/page.tsx', tag: 'h1', label: 'h1' } ] });
  const html = (h.env.doc.getElementById('lp-sel') || {}).innerHTML || '';
  assert.ok(/histórico deste nó · 2/.test(html), 'the h1 node shows its 2 edits (not the other node): ' + html.slice(0, 200));
  assert.ok(html.indexOf('histórico') !== -1, 'the prior-session item is labelled histórico (read-only)');
  // A DIFFERENT node shows only its own single history item.
  fireSelectWith(h, { file: 'landing/app/other.tsx', line: 9, col: 1, tag: 'p', path: [ { file: 'landing/app/other.tsx', tag: 'div', label: 'div' }, { file: 'landing/app/other.tsx', tag: 'p', label: 'p' } ] });
  const html2 = (h.env.doc.getElementById('lp-sel') || {}).innerHTML || '';
  assert.ok(/histórico deste nó · 1/.test(html2), 'the other node has its OWN single-item history (nodeKey isolation)');
});
