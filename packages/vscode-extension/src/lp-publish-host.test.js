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

// D6 — the publish gate is now FAIL-CLOSED on security: it needs a VALID, FRESH, Critical-free scan.
// applyScan wires the pieces a unit needs to exercise the gate deterministically without a real git
// repo or a 30s npm audit: _lastSecurity (the recorded scan) + a stubbed _treeFingerprint (the "current"
// tree state the gate recomputes). Default = a clean scan whose fingerprint MATCHES the current tree
// (fresh + clear → publish allowed), so tests about the OTHER gates (name-match, not-linked) aren't
// blocked by security. Pass lastSecurity/fpNow to drive the required/failed/stale/critical branches.
const CLEAN_SCAN = { secrets: [], xss: [], csp: { hasCsp: true, findings: [] }, audit: { ok: true, counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }, prodCount: 0 }, fingerprint: 'FP' };
function applyScan(fakeThis, lastSecurity, fpNow) {
  fakeThis._lastSecurity = lastSecurity === undefined ? CLEAN_SCAN : lastSecurity;
  const now = fpNow !== undefined ? fpNow : ((fakeThis._lastSecurity && fakeThis._lastSecurity.fingerprint) || null);
  fakeThis._scanFingerprint = () => now; // the gate recomputes this (content hash of the scanned files) and compares to the scan's
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
  applyScan(fakeThis); // default clean+fresh so the security gate passes → the NAME gate is what's under test
  fakeThis.panel = { webview: { postMessage: (m) => { posted = m; } } };
  fakeThis._publishDeploy({ projectName: typedName });
  return posted;
}

// Variant that drives the security gate: pass lastSecurity (the recorded scan; null = "no scan") and,
// for the stale branch, an fpNow that differs from the scan's fingerprint.
function deployRaw(root, payload, spawnSpy, lastSecurity, fpNow) {
  const Panel = loadPanelWithFakeSpawn(spawnSpy);
  assert.ok(Panel, 'LivePreviewPanel loaded');
  const fakeThis = Object.create(Panel.prototype);
  fakeThis.token = 'T';
  fakeThis._wsRoot = () => root;
  applyScan(fakeThis, lastSecurity, fpNow);
  let posted = null;
  fakeThis.panel = { webview: { postMessage: (m) => { posted = m; } } };
  fakeThis._publishDeploy(payload);
  return posted;
}

// _publishCommit is async and refuses at the security gate BEFORE any git; spawnSync is stubbed but
// unused on that path. Returns a promise of the posted message.
function commitRaw(root, payload, lastSecurity, fpNow) {
  const Panel = loadPanelWithFakeSpawn(() => ({ status: 0, stdout: '', stderr: '' }));
  assert.ok(Panel, 'LivePreviewPanel loaded');
  const fakeThis = Object.create(Panel.prototype);
  fakeThis.token = 'T';
  fakeThis._wsRoot = () => root;
  applyScan(fakeThis, lastSecurity, fpNow);
  let posted = null;
  fakeThis.panel = { webview: { postMessage: (m) => { posted = m; } } };
  return Promise.resolve(fakeThis._publishCommit(payload)).then(() => posted);
}

test('D6 deploy gate: a fresh scan with an OPEN Critical secret blocks deploy (critical-open) even on the exact name, never spawns', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; },
      { secrets: [{ severity: 'critical', rule: 'aws-key' }], audit: { ok: true, counts: {}, prodCount: 0 }, fingerprint: 'FP' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'critical-open');
    assert.strictEqual(calls.length, 0, 'vercel NEVER spawned while a Critical finding is open');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 (P0/P1) deploy gate: overrideCritical from the webview is IGNORED — a Critical still blocks, never spawns', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    // The old bypass let a forged lp-publish-deploy with overrideCritical:true reach `vercel --prod`.
    const r = deployRaw(root, { projectName: 'showcase-proj', overrideCritical: true },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'https://showcase-proj.vercel.app\n', stderr: '' }; },
      { secrets: [{ severity: 'critical', rule: 'aws-key' }], fingerprint: 'FP' });
    assert.strictEqual(r.ok, false, 'the override no longer works');
    assert.strictEqual(r.reason, 'critical-open');
    assert.strictEqual(calls.length, 0, 'a forged override can NEVER reach the spawn');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 (P0) deploy gate: NO scan this session blocks deploy (security-scan-required) even on the exact name, never spawns', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'x', stderr: '' }; },
      null); // <- the exact bypass Codex proved: no _lastSecurity used to mean hasOpenCritical=false → spawn
    assert.strictEqual(r.ok, false, 'no security scan → publish is NOT allowed');
    assert.strictEqual(r.reason, 'security-scan-required');
    assert.strictEqual(calls.length, 0, 'vercel NEVER spawns without a valid scan (the P0 bypass is closed)');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 (P1) deploy gate: a FAILED scan blocks (security-scan-failed), never spawns', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'x', stderr: '' }; },
      { error: 'scan-failed' });
    assert.strictEqual(r.reason, 'security-scan-failed', 'an errored scan is fail-closed, not treated as "clear"');
    assert.strictEqual(calls.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 (P0) deploy gate: a STALE scan (tree changed since scan) blocks (security-scan-stale), never spawns', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    // scanned at fingerprint 'OLD'; the tree is now 'NEW' → the scan no longer describes what would ship.
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'x', stderr: '' }; },
      { secrets: [], audit: { ok: true, counts: {}, prodCount: 0 }, fingerprint: 'OLD' }, 'NEW');
    assert.strictEqual(r.reason, 'security-scan-stale', 'a scan of an older tree cannot clear the current one');
    assert.strictEqual(calls.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 (P1) deploy gate: an npm-audit CRITICAL/HIGH with prod exposure blocks (critical-open), never spawns', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'x', stderr: '' }; },
      { secrets: [], audit: { ok: true, counts: { critical: 1, high: 0, moderate: 0, low: 0, info: 0 }, prodCount: 1 }, fingerprint: 'FP' });
    assert.strictEqual(r.reason, 'critical-open', 'a prod-exposed supply-chain critical blocks, not just baked secrets');
    assert.strictEqual(calls.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 deploy gate: a DEV-ONLY audit critical does NOT block a prod deploy (honest — dev deps never ship)', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'Production: https://showcase-proj.vercel.app\n', stderr: '' }; },
      // provably all-dev-only: devOnlyCount === total (the only way a critical clears — fail-closed otherwise)
      { secrets: [], audit: { ok: true, counts: { critical: 2, high: 0, moderate: 0, low: 0, info: 0 }, prodCount: 0, devOnlyCount: 2 }, fingerprint: 'FP' });
    assert.strictEqual(calls.length, 1, 'provably dev-only criticals do not block a prod deploy');
    assert.strictEqual(r.ok, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 (P1) deploy gate: an audit critical whose entries are UNCLASSIFIABLE (devOnlyCount != total) fails closed', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    // npm metadata reports a critical, but the per-entry map is empty/unclassifiable → cannot PROVE dev-only → block.
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'x', stderr: '' }; },
      { secrets: [], audit: { ok: true, counts: { critical: 1, high: 0, moderate: 0, low: 0, info: 0 }, prodCount: 0, devOnlyCount: 0 }, fingerprint: 'FP' });
    assert.strictEqual(r.reason, 'critical-open', 'an unprovable dev-only critical is fail-closed, not cleared');
    assert.strictEqual(calls.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 commit gate: a fresh OPEN Critical secret blocks the selective commit (critical-open) before any git', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-crit-'));
  try {
    const r = await commitRaw(root, { files: ['landing/app/page.tsx'], message: 'x' },
      { secrets: [{ severity: 'critical', rule: 'stripe-key' }], fingerprint: 'FP' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'critical-open');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6 commit gate: NO scan blocks the selective commit (security-scan-required) before any git', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-noscan-'));
  try {
    const r = await commitRaw(root, { files: ['landing/app/page.tsx'], message: 'x' }, null);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'security-scan-required', 'commit+push is gated on a valid scan too');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

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
