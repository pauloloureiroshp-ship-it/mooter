'use strict';
// lp-publish-dest-host.test.js — C4 · Publish destination + honest controls:
//   COH-10 — _productionUrl resolves the prod target with honest precedence (deploy > setting >
//            manifest > project env NEXT_PUBLIC_SITE_URL > n/d), HTTPS-validated, never from projectName.
//   COH-19 — lp-open-external opens a validated HTTPS (or localhost) URL host-side; refuses other schemes.
//   COH-11/12 — Back/Fwd disabled-with-reason + inline publish errors (webview; source-verified).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const EXT_SRC = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
const openedExternal = [];

function loadPanelClass() {
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = new Proxy(function () { return mk(); }, {
    get(t, k) {
      if (k === 'env') return { openExternal: (uri) => { openedExternal.push(uri && uri.__u); return Promise.resolve(true); } };
      if (k === 'Uri') return { parse: (u) => ({ __u: u }), file: (p) => ({ fsPath: p }) };
      if (k === 'workspace') return new Proxy({}, { get(_t, _k) { if (_k === 'getConfiguration') return () => ({ get: () => undefined }); return mk(); } });
      return mk();
    },
    apply() { return mk(); },
  });
  const realReq = require;
  const REAL = ['./lp-stage.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(EXT_SRC, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}
const Panel = loadPanelClass();
function mkInst(root) { const inst = Object.create(Panel.prototype); inst._wsRoot = () => root; return inst; }
function tmp(prefix) { return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); }

// ── COH-10 — HTTPS validation ──────────────────────────────────────────────────────────────────────
test('COH-10: _validHttpsUrl accepts https only, strips trailing slash, rejects http/other schemes', () => {
  const inst = mkInst(tmp('lp-dest-v-'));
  assert.strictEqual(inst._validHttpsUrl('https://mooter.ai/'), 'https://mooter.ai');
  assert.strictEqual(inst._validHttpsUrl('https://mooter.ai/app/'), 'https://mooter.ai/app');
  assert.strictEqual(inst._validHttpsUrl('http://mooter.ai'), null, 'http is not a production destination');
  assert.strictEqual(inst._validHttpsUrl('javascript:alert(1)'), null);
  assert.strictEqual(inst._validHttpsUrl('mooter.ai'), null, 'a bare host is not a URL');
  assert.strictEqual(inst._validHttpsUrl(''), null);
});

// ── COH-10 — precedence ──────────────────────────────────────────────────────────────────────────
test('COH-10: the current deploy URL wins over everything', () => {
  const root = tmp('lp-dest-dep-');
  fs.mkdirSync(path.join(root, 'landing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'landing', '.env.local.example'), 'NEXT_PUBLIC_SITE_URL=https://mooter.ai\n', 'utf8');
  const inst = mkInst(root);
  inst._lastDeployUrl = 'https://frugal-abc123.vercel.app';
  const d = inst._productionUrl();
  assert.strictEqual(d.url, 'https://frugal-abc123.vercel.app');
  assert.strictEqual(d.source, 'deploy atual');
});

test('COH-10: with no deploy, the project env NEXT_PUBLIC_SITE_URL is the destination (this repo → mooter.ai)', () => {
  const root = tmp('lp-dest-env-');
  fs.mkdirSync(path.join(root, 'landing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'landing', '.env.local.example'), '# comment\nNEXT_PUBLIC_SITE_URL=https://mooter.ai\nOTHER=1\n', 'utf8');
  const inst = mkInst(root);
  inst._lastDeployUrl = null;
  const d = inst._productionUrl();
  assert.strictEqual(d.url, 'https://mooter.ai', 'read from the project env — NEVER derived from the project name');
  assert.ok(/config do projeto/.test(d.source));
});

test('COH-10: a project manifest .mooter/live-preview.json beats the env', () => {
  const root = tmp('lp-dest-man-');
  fs.mkdirSync(path.join(root, 'landing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'landing', '.env.local.example'), 'NEXT_PUBLIC_SITE_URL=https://mooter.ai\n', 'utf8');
  fs.mkdirSync(path.join(root, '.mooter'), { recursive: true });
  fs.writeFileSync(path.join(root, '.mooter', 'live-preview.json'), JSON.stringify({ productionUrl: 'https://staging.mooter.ai' }), 'utf8');
  const d = mkInst(root)._productionUrl();
  assert.strictEqual(d.url, 'https://staging.mooter.ai');
  assert.strictEqual(d.source, 'manifest do projeto');
});

test('COH-10: no deploy, no config, no env → n/d (never a generic hardcode, never projectName)', () => {
  const d = mkInst(tmp('lp-dest-nd-'))._productionUrl();
  assert.strictEqual(d.url, null);
  assert.strictEqual(d.source, null);
});

test('COH-10: an http-only NEXT_PUBLIC_SITE_URL is rejected → n/d (never a non-HTTPS prod target)', () => {
  const root = tmp('lp-dest-http-');
  fs.mkdirSync(path.join(root, 'landing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'landing', '.env'), 'NEXT_PUBLIC_SITE_URL=http://localhost:7819\n', 'utf8');
  assert.strictEqual(mkInst(root)._productionUrl().url, null, 'http is refused as a production destination');
});

// ── COH-19 — lp-open-external opens a validated URL, refuses others ─────────────────────────────────
test('COH-19: lp-open-external opens a validated HTTPS URL host-side', () => {
  openedExternal.length = 0;
  mkInst(tmp('lp-ext-'))._onMessage({ type: 'lp-open-external', url: 'https://mooter.ai' });
  assert.deepStrictEqual(openedExternal, ['https://mooter.ai']);
});

test('COH-19: lp-open-external REFUSES a non-http(s) scheme (no javascript:/file:)', () => {
  openedExternal.length = 0;
  const inst = mkInst(tmp('lp-ext2-'));
  inst._onMessage({ type: 'lp-open-external', url: 'javascript:alert(1)' });
  inst._onMessage({ type: 'lp-open-external', url: 'file:///etc/passwd' });
  assert.strictEqual(openedExternal.length, 0, 'only localhost or validated https ever opens');
});

// ── COH-11 / COH-12 — webview honest controls (source-verified) ─────────────────────────────────────
test('COH-11: Back/Forward are disabled with a reason until a tap handshake (no dead controls)', () => {
  assert.ok(/function applyNavCapability/.test(EXT_SRC));
  const body = EXT_SRC.slice(EXT_SRC.indexOf('function applyNavCapability'), EXT_SRC.indexOf('function applyNavCapability') + 700);
  assert.ok(/lpHasTap/.test(body) && /b\.disabled=true/.test(body) && /navegação indispon/.test(body), 'disabled + honest reason');
  assert.ok(/lpHasTap=true; applyNavCapability\(\)/.test(EXT_SRC), 'a tap handshake (lp-ready/lp-nav) proves the capability');
  assert.ok(/if\(!lpHasTap\) return; frameHistory/.test(EXT_SRC), 'the click is also guarded');
});

test('COH-12: publish empty-commit / wrong-two-factor show an INLINE error (never a silent return)', () => {
  assert.ok(/function pubInlineError/.test(EXT_SRC), 'an inline-error helper exists');
  assert.ok(/escreve uma mensagem de commit primeiro/.test(EXT_SRC), 'empty commit message → inline reason');
  assert.ok(/nome do projeto não coincide/.test(EXT_SRC), 'wrong two-factor → inline reason');
  assert.ok(/nada por commitar — não há ficheiros/.test(EXT_SRC), 'empty change set → inline reason');
});

test('COH-19: the publish view renders the deploy/destination URL as a real anchor (data-ext), not a div', () => {
  const view = fs.readFileSync(path.join(__dirname, 'lp-publish-view.js'), 'utf8');
  assert.ok(/function anchor\(url\)/.test(view), 'a real anchor builder');
  assert.ok(/data-ext="/.test(view) && /<a href="/.test(view), 'anchors carry data-ext + href');
  assert.ok(/destino: /.test(view), 'the destination is shown before the two-factor');
});
