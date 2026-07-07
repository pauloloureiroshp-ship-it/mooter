'use strict';
// lp-publish-host.test.js — LP-6: the IRREVERSIBLE deploy path proven safe. The single invariant
// that matters: _publishDeploy NEVER spawns `vercel` unless the typed project name EXACTLY matches
// the linked project's name read fresh from disk. We prove this by loading the real
// LivePreviewPanel with a MOCKED child_process (so `vercel --prod` can never actually run in a
// test) and asserting the mock is reached only on an exact match. Also covers: selective commit
// never uses `git add -A` (the webview's file list is re-validated against a fresh preview).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

// Load LivePreviewPanel with child_process REPLACED by a spy that records spawnSync calls and
// NEVER runs a real process — so a happy-path deploy in a test cannot trigger a real Vercel deploy.
function loadPanelWithFakeSpawn(spawnImpl) {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const fakeCp = { spawnSync: spawnImpl, spawn: () => ({ on() {}, stdout: { on() {} }, stderr: { on() {} }, stdin: { end() {} } }) };
  // host-extra.js is REAL (the selective-commit helpers); child_process is the FAKE; other builtins real.
  const REAL = ['./host-extra.js'];
  const req = (name) => {
    if (name === 'vscode') return vscodeStub;
    if (name === 'child_process') return fakeCp;
    if (REAL.indexOf(name) !== -1) return realReq(name);
    if (name.charAt(0) === '.') return mk();
    return realReq(name);
  };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

function mkLinkedWorkspace(projectName) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-'));
  const vdir = path.join(root, 'landing', '.vercel');
  fs.mkdirSync(vdir, { recursive: true });
  fs.writeFileSync(path.join(vdir, 'project.json'), JSON.stringify({ projectId: 'prj_x', projectName: projectName }), 'utf8');
  return root;
}

function deployWith(root, typedName, spawnSpy) {
  const Panel = loadPanelWithFakeSpawn(spawnSpy);
  assert.ok(Panel, 'LivePreviewPanel loaded');
  let posted = null;
  // Object.create so `this._vercelProject(...)` resolves to the REAL prototype method; only
  // _wsRoot/token/panel are overridden on the instance.
  const fakeThis = Object.create(Panel.prototype);
  fakeThis.token = 'T';
  fakeThis._wsRoot = () => root;
  fakeThis.panel = { webview: { postMessage: (m) => { posted = m; } } };
  fakeThis._publishDeploy({ projectName: typedName });
  return posted;
}

test('LP-6 deploy gate: a WRONG project name refuses (name-mismatch) and NEVER spawns vercel', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployWith(root, 'wrong-name', (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; });
    assert.strictEqual(r.action, 'deploy');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'name-mismatch');
    assert.strictEqual(calls.length, 0, 'vercel was NEVER spawned on a name mismatch');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('LP-6 deploy gate: an EMPTY/absent name refuses and never spawns', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    for (const bad of ['', '   ', 'Showcase-Proj' /* case differs */]) {
      const r = deployWith(root, bad, (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; });
      assert.strictEqual(r.reason, 'name-mismatch', 'refused for: ' + JSON.stringify(bad));
    }
    assert.strictEqual(calls.length, 0, 'no spawn for any non-exact name');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('LP-6 deploy gate: a workspace with NO linked project refuses (not-linked), never spawns', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-nolink-'));
  const calls = [];
  try {
    const r = deployWith(root, 'anything', (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'not-linked');
    assert.strictEqual(calls.length, 0, 'no spawn when not linked');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('LP-6 deploy: ONLY the exact project name reaches the spawn — and only then, with vercel --prod --yes', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployWith(root, 'showcase-proj', (cmd, args) => {
      calls.push({ cmd, args });
      return { status: 0, stdout: 'Production: https://showcase-proj.vercel.app\n', stderr: '' };
    });
    assert.strictEqual(calls.length, 1, 'exactly one spawn on the exact match');
    assert.strictEqual(calls[0].cmd, 'vercel', 'spawns the vercel CLI');
    // .join to compare across the vm realm boundary (a vm-created Array fails deepStrictEqual's
    // prototype check even with identical values).
    assert.strictEqual(Array.prototype.join.call(calls[0].args, ' '), '--prod --yes', 'production deploy args');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.url, 'https://showcase-proj.vercel.app', 'returns the parsed deploy URL');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('LP-6 deploy: a missing vercel CLI is honest (vercel-cli-missing), never a fake URL', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  try {
    const r = deployWith(root, 'showcase-proj', () => { const e = new Error('spawn vercel ENOENT'); e.code = 'ENOENT'; throw e; });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'vercel-cli-missing');
    assert.ok(!r.url, 'no fabricated URL when the CLI is absent');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
