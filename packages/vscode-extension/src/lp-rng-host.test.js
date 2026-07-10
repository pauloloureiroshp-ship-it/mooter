'use strict';
// lp-rng-host.test.js — P1-3 (FIX-MP-3): the CSP nonces AND the host→webview auth token are minted with
// a CSPRNG (crypto.randomBytes), NOT Math.random. The token is the secret the webview checks on EVERY
// inbound message (m.__t === HOST_TOKEN) before honouring lp-goto / lp-edit / lp-delete — a guessable
// Math.random()-derived token let framed/hostile content forge those. These tests drive the REAL render
// functions and the REAL ctor (vm-loaded extension.js), and assert the CSPRNG shape + uniqueness +
// that the handshake (token embedded in the HTML) still works.
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
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-diagnostics.js', './lp-task-view.js', './lp-presets.js', './lp-skills.js', './lp-security-view.js', './lp-publish-view.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, crypto: require('crypto') };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch { /* tolerate top-level activate() errors; getters + class survive */ }
  return sandbox;
}

const HEX32 = /^[0-9a-f]{32}$/;              // crypto.randomBytes(16).toString('hex')
const nonceOf = (html) => { const m = html.match(/nonce-([0-9a-zA-Z]+)/); return m ? m[1] : null; };
const MATH_RANDOM_SHAPE = /^\d+$/;           // String(Math.random()).slice(2) — decimal digits only, never a–f

test('P1-3: getLivePreviewHtml CSP nonce is a 16-byte CSPRNG hex, unique per render, and stamped on the script tag', () => {
  const S = loadExtension();
  assert.strictEqual(typeof S.getLivePreviewHtml, 'function');
  const h1 = S.getLivePreviewHtml('tok'), h2 = S.getLivePreviewHtml('tok');
  const n1 = nonceOf(h1), n2 = nonceOf(h2);
  assert.ok(HEX32.test(n1), 'nonce is 32 lowercase hex chars (16 CSPRNG bytes), not a Math.random decimal: ' + n1);
  assert.ok(!MATH_RANDOM_SHAPE.test(n1), 'nonce is NOT the old digits-only Math.random shape');
  assert.notStrictEqual(n1, n2, 'a fresh nonce every render (no fixed/predictable value)');
  // The SAME nonce must appear on the actual <script nonce="…"> or the CSP would block the inline script.
  assert.ok(h1.indexOf('nonce="' + n1 + '"') !== -1 || h1.indexOf("nonce='" + n1 + "'") !== -1, 'nonce is bound to the script tag');
});

test('P1-3: getHtml (Cockpit) CSP nonce is a 16-byte CSPRNG hex, unique per render', () => {
  const S = loadExtension();
  assert.strictEqual(typeof S.getHtml, 'function');
  const n1 = nonceOf(S.getHtml()), n2 = nonceOf(S.getHtml());
  assert.ok(HEX32.test(n1), 'Cockpit nonce is CSPRNG hex: ' + n1);
  assert.notStrictEqual(n1, n2, 'fresh per render');
});

test('P1-3: the host→webview token is a CSPRNG hex secret, unique per panel (not guessable Math.random)', () => {
  const S = loadExtension();
  // class declarations are block-scoped — not a sandbox property like hoisted functions; read the binding IN-context.
  const Panel = vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', S);
  assert.strictEqual(typeof Panel, 'function', 'LivePreviewPanel resolvable');
  // The token is minted at the TOP of the ctor, before _wire() renders the (fs/skill-heavy) HTML; stub _wire
  // so the unit exercises exactly the token generation without the whole webview environment.
  Panel.prototype._wire = function () {};
  const mkPanel = () => { const p = () => p; return new Proxy(p, { get() { return mkPanel(); }, apply() { return mkPanel(); } }); };
  const a = new Panel(mkPanel());
  const b = new Panel(mkPanel());
  assert.ok(/^lp[0-9a-f]{48}$/.test(a.token), 'token = "lp" + 24 CSPRNG bytes as hex: ' + a.token);
  assert.ok(!MATH_RANDOM_SHAPE.test(String(a.token).slice(2)), 'token body is NOT digits-only Math.random');
  assert.notStrictEqual(a.token, b.token, 'each panel gets its own unguessable secret');
});

test('P1-3: handshake intact — the token passed to getLivePreviewHtml is embedded for the webview __t check', () => {
  const S = loadExtension();
  const TOKEN = 'lpdeadbeefcafe';
  const html = S.getLivePreviewHtml(TOKEN);
  assert.ok(html.indexOf(TOKEN) !== -1, 'the host token is stamped into the HTML so m.__t === HOST_TOKEN still validates');
});
