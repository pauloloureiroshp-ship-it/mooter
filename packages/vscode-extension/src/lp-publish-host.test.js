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
const crypto = require('crypto');
const vm = require('vm');
const { spawnSync: realSpawnSync } = require('child_process');

function runGit(root, args, allowFailure) {
  const r = realSpawnSync('git', ['-C', root].concat(args), { encoding: 'utf8', windowsHide: true });
  if (!allowFailure) assert.strictEqual(r.status, 0, String(r.stderr || r.stdout || 'git failed'));
  return r;
}

function initGitWorkspace(prefix, files, attributes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  if (attributes) fs.writeFileSync(path.join(root, '.gitattributes'), attributes);
  for (const pair of Object.entries(files || {})) {
    const abs = path.join(root, ...pair[0].split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, pair[1]);
  }
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Mooter Test']);
  runGit(root, ['config', 'user.email', 'test@mooter.invalid']);
  const tracked = Object.keys(files || {});
  if (attributes) tracked.unshift('.gitattributes');
  runGit(root, ['add', '--'].concat(tracked));
  runGit(root, ['commit', '-q', '-m', 'base']);
  return root;
}

function gitOnlySpawn(cmd, args, opts) {
  const exe = String(cmd || '').toLowerCase();
  if (exe === 'git' || exe.endsWith('git.exe')) return realSpawnSync(cmd, args, opts);
  const error = new Error('blocked test process: ' + cmd); error.code = 'ENOENT';
  return { status: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error };
}

function sha(raw) { return crypto.createHash('sha256').update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))).digest('hex'); }

// Load LivePreviewPanel with child_process REPLACED by a spy that records spawnSync calls and
// NEVER runs a real process — so a happy-path deploy in a test cannot trigger a real Vercel deploy.
function loadPanelWithFakeSpawn(spawnImpl, hostExtraOverride) {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const fakeCp = { spawnSync: spawnImpl, spawn: () => ({ on() {}, stdout: { on() {} }, stderr: { on() {} }, stdin: { end() {} } }) };
  // host-extra.js is REAL by default; a focused commit test may inject a compatible spy object.
  // child_process is always FAKE here so a happy deploy can never escape the harness.
  const REAL = ['./host-extra.js'];
  const req = (name) => {
    if (name === 'vscode') return vscodeStub;
    if (name === 'child_process') return fakeCp;
    if (REAL.indexOf(name) !== -1) return hostExtraOverride || realReq(name);
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
  fs.writeFileSync(path.join(vdir, 'project.json'), JSON.stringify({ projectId: 'prj_x', orgId: 'team_x', projectName: projectName }), 'utf8');
  return root;
}

// D6 — the publish gate is now FAIL-CLOSED on security: it needs a VALID, FRESH, Critical-free scan.
// applyScan wires the pieces a unit needs to exercise the gate deterministically without a real git
// repo or a 30s npm audit: _lastSecurity (the recorded scan) + a stubbed _treeFingerprint (the "current"
// tree state the gate recomputes). Default = a clean scan whose fingerprint MATCHES the current tree
// (fresh + clear → publish allowed), so tests about the OTHER gates (name-match, not-linked) aren't
// blocked by security. Pass lastSecurity/fpNow to drive the required/failed/stale/critical branches.
const CLEAN_COVERAGE = { complete: true, secrets: true, xss: true, csp: true, npmAudit: true, truncated: false, skippedUnreadable: 0 };
const CLEAN_SCAN = { secrets: [], xss: [], csp: { hasCsp: true, findings: [] }, audit: { ok: true, counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }, prodCount: 0 }, fingerprint: 'FP', coverage: CLEAN_COVERAGE, scannedAt: Date.now() };
function applyScan(fakeThis, lastSecurity, fpNow) {
  const supplied = lastSecurity === undefined ? CLEAN_SCAN : lastSecurity;
  fakeThis._lastSecurity = supplied && !supplied.error
    ? Object.assign({}, CLEAN_SCAN, supplied, { audit: supplied.audit || CLEAN_SCAN.audit, coverage: supplied.coverage || CLEAN_COVERAGE, scannedAt: supplied.scannedAt || Date.now() })
    : supplied;
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
  const identity = fakeThis._vercelProject(root);
  fakeThis._publishDeploy({ projectName: typedName, vercelIdentityKey: identity.linked ? identity.identityKey : null });
  return posted;
}

// Variant that drives the security gate: pass lastSecurity (the recorded scan; null = "no scan") and,
// for the stale branch, an fpNow that differs from the scan's fingerprint.
function deployRaw(root, payload, spawnSpy, lastSecurity, fpNow, setup) {
  const Panel = loadPanelWithFakeSpawn(spawnSpy);
  assert.ok(Panel, 'LivePreviewPanel loaded');
  const fakeThis = Object.create(Panel.prototype);
  fakeThis.token = 'T';
  fakeThis._wsRoot = () => root;
  applyScan(fakeThis, lastSecurity, fpNow);
  const request = Object.assign({}, payload || {});
  if (!Object.prototype.hasOwnProperty.call(request, 'vercelIdentityKey')) {
    const identity = fakeThis._vercelProject(root);
    request.vercelIdentityKey = identity.linked ? identity.identityKey : null;
  }
  if (typeof setup === 'function') setup(fakeThis);
  let posted = null;
  fakeThis.panel = { webview: { postMessage: (m) => { posted = m; } } };
  fakeThis._publishDeploy(request);
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

async function commitWithHostExtra(root, payload, hostExtra, setup, spawnImpl) {
  const Panel = loadPanelWithFakeSpawn(spawnImpl || (() => ({ status: 0, stdout: '', stderr: '' })), hostExtra);
  assert.ok(Panel, 'LivePreviewPanel loaded');
  const fakeThis = Object.create(Panel.prototype);
  fakeThis.token = 'T';
  fakeThis._wsRoot = () => root;
  fakeThis._journeyApprovalGate = () => ({ cleared: true, reason: null });
  fakeThis._journeyPublishResult = () => {};
  fakeThis._emitLpEvent = () => {};
  fakeThis._markSecurityStale = () => {};
  let securityChecks = 0;
  fakeThis._securityGate = () => { securityChecks++; return { cleared: true, reason: null }; };
  let posted = null;
  fakeThis.panel = { webview: { postMessage: (m) => { posted = m; } } };
  if (typeof setup === 'function') setup(fakeThis);
  await fakeThis._publishCommit(payload);
  return { posted, securityChecks };
}

test('Publish approval gate is global: node A pending still vetoes while node B is selected', () => {
  const Panel = loadPanelWithFakeSpawn(() => ({ status: 0, stdout: '', stderr: '' }));
  const inst = Object.create(Panel.prototype);
  const A = { id: 'A', state: 'awaiting', codeAccepted: false, pendingWrite: true };
  const B = { id: 'B', state: 'selected', codeAccepted: false };
  inst._journeyEnsureLoaded = () => {};
  inst._journeyCurrent = () => B;
  inst._journeys = new Map([['A', A], ['B', B]]);
  inst._taskReg = new Map([['task-A', [{ file: 'a.tsx' }]]]);
  assert.strictEqual(inst._journeyApprovalGate().cleared, false, 'host-owned unsettled task A cannot be hidden by selecting B');
  inst._taskReg.clear();
  assert.strictEqual(inst._journeyApprovalGate().cleared, false, 'off-screen pendingWrite A keeps the veto even after its registry is inspected');
  A.codeAccepted = true; A.pendingWrite = false;
  assert.strictEqual(inst._journeyApprovalGate().cleared, true, 'only A own OK/revert settles the global gate');
});

test('Publish file scope exposes only byte-matching Live Preview approvals and excludes parallel dirt', () => {
  const approved = 'landing/app/lp-e2e/page.tsx';
  const parallel = 'landing/app/page.tsx';
  const before = 'approved before\n', after = 'approved\n';
  const root = initGitWorkspace('lp-pub-scope-', { [approved]: before, [parallel]: 'parallel before\n' });
  const Panel = loadPanelWithFakeSpawn(gitOnlySpawn);
  try {
    fs.writeFileSync(path.join(root, ...approved.split('/')), after);
    fs.writeFileSync(path.join(root, ...parallel.split('/')), 'parallel user work\n');
    const inst = Object.create(Panel.prototype);
    inst._livePublishScope = true;
    const approvedSha = crypto.createHash('sha256').update(after).digest('hex');
    assert.strictEqual(inst._publishSealRecord(root, approved, before, approvedSha).ok, true, 'tracked clean preimage is host-sealed');
    inst._feed = [{ kind: 'splice', status: 'live', files: [approved], entry: { shaAfter: approvedSha } }];
    const rows = [{ x: '?', y: '?', path: approved }, { x: ' ', y: 'M', path: parallel }];
    const scoped = inst._publishFileScope(root, rows);
    assert.deepStrictEqual(Array.from(scoped.files, (r) => r.path), [approved]);
    assert.strictEqual(scoped.excludedCount, 1, 'parallel user dirt remains visible locally but outside Publish');
    fs.writeFileSync(path.join(root, ...approved.split('/')), 'changed after OK\n');
    const stale = inst._publishFileScope(root, rows);
    assert.deepStrictEqual(Array.from(stale.files, (r) => r.path), []);
    assert.deepStrictEqual(Array.from(stale.stalePaths), [approved], 'post-OK byte drift fails closed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Publish blocks WIP that existed in the SAME tracked file before the first Live Preview edit', () => {
  const rel = 'page.tsx';
  const root = initGitWorkspace('lp-pub-same-file-wip-', { [rel]: 'title=base\nprivate=stable\n' });
  const Panel = loadPanelWithFakeSpawn(gitOnlySpawn);
  try {
    const preimage = 'title=base\nprivate=PRIVATE-WIP\n';
    const after = 'title=LP\nprivate=PRIVATE-WIP\n';
    fs.writeFileSync(path.join(root, rel), after);
    const inst = Object.create(Panel.prototype);
    inst._livePublishScope = true;
    const seal = inst._publishSealRecord(root, rel, preimage, sha(after));
    assert.strictEqual(seal.ok, false, 'the preimage is not the clean-filtered HEAD blob');
    inst._feed = [{ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(after) } }];
    const scope = inst._publishFileScope(root, [{ x: ' ', y: 'M', path: rel }]);
    assert.deepStrictEqual(Array.from(scope.files), []);
    assert.deepStrictEqual(Array.from(scope.blockedPaths), [rel]);
    assert.deepStrictEqual(Array.from(scope.stalePaths), [], 'current bytes match LP; provenance, not staleness, is the blocker');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Publish blocks an existing untracked file even when Live Preview changes only one line', () => {
  const rel = 'untracked-page.tsx';
  const root = initGitWorkspace('lp-pub-untracked-', { 'seed.txt': 'tracked\n' });
  const Panel = loadPanelWithFakeSpawn(gitOnlySpawn);
  try {
    const preimage = 'title=base\nprivate=PREEXISTING-UNTRACKED\n';
    const after = 'title=LP\nprivate=PREEXISTING-UNTRACKED\n';
    fs.writeFileSync(path.join(root, rel), after);
    const inst = Object.create(Panel.prototype);
    inst._livePublishScope = true;
    assert.strictEqual(inst._publishSealRecord(root, rel, preimage, sha(after)).ok, false);
    inst._feed = [{ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(after) } }];
    const scope = inst._publishFileScope(root, [{ x: '?', y: '?', path: rel }]);
    assert.deepStrictEqual(Array.from(scope.files), []);
    assert.deepStrictEqual(Array.from(scope.blockedPaths), [rel]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Two legitimate LP edits inherit one clean preimage; reverting the latest restores the prior publishable tail', () => {
  const rel = 'chain.tsx', base = 'heading=base\nbody=base\n';
  const one = 'heading=LP1\nbody=base\n', two = 'heading=LP1\nbody=LP2\n';
  const root = initGitWorkspace('lp-pub-chain-', { [rel]: base });
  const Panel = loadPanelWithFakeSpawn(gitOnlySpawn);
  try {
    const inst = Object.create(Panel.prototype);
    inst._livePublishScope = true;
    fs.writeFileSync(path.join(root, rel), one);
    assert.strictEqual(inst._publishSealRecord(root, rel, base, sha(one)).ok, true);
    const first = { kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(one) } };
    inst._feed = [first];
    fs.writeFileSync(path.join(root, rel), two);
    assert.strictEqual(inst._publishSealRecord(root, rel, one, sha(two)).ok, true, 'second edge inherits only from exact first shaAfter');
    const second = { kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(two) } };
    inst._feed.push(second);
    let scope = inst._publishFileScope(root, [{ x: ' ', y: 'M', path: rel }]);
    assert.deepStrictEqual(Array.from(scope.files, (r) => r.path), [rel]);

    fs.writeFileSync(path.join(root, rel), one);
    assert.strictEqual(inst._publishSealRewind(root, rel, sha(two), one), true);
    second.status = 'reverted';
    scope = inst._publishFileScope(root, [{ x: ' ', y: 'M', path: rel }]);
    assert.deepStrictEqual(Array.from(scope.files, (r) => r.path), [rel], 'a reverted later edge does not erase the earlier live approval');

    fs.writeFileSync(path.join(root, rel), base);
    assert.strictEqual(inst._publishSealRewind(root, rel, sha(one), base), true);
    first.status = 'reverted';
    scope = inst._publishFileScope(root, [{ x: ' ', y: 'M', path: rel }]);
    assert.deepStrictEqual(Array.from(scope.files), [], 'all-reverted chain publishes nothing');
    assert.deepStrictEqual(Array.from(scope.blockedPaths), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('After every unsafe edge is reverted, a genuinely clean next chain is re-proven without reloading the panel', () => {
  const rel = 'recover.tsx', base = 'title=base\nprivate=stable\n';
  const dirty = 'title=base\nprivate=PRIVATE-WIP\n';
  const unsafeAfter = 'title=LP\nprivate=PRIVATE-WIP\n';
  const cleanAfter = 'title=LP-CLEAN\nprivate=stable\n';
  const root = initGitWorkspace('lp-pub-reprove-', { [rel]: base });
  const Panel = loadPanelWithFakeSpawn(gitOnlySpawn);
  try {
    const inst = Object.create(Panel.prototype);
    inst._livePublishScope = true;
    fs.writeFileSync(path.join(root, rel), unsafeAfter);
    assert.strictEqual(inst._publishSealRecord(root, rel, dirty, sha(unsafeAfter)).ok, false);
    const old = { kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(unsafeAfter) } };
    inst._feed = [old];
    fs.writeFileSync(path.join(root, rel), dirty);
    inst._publishSealRewind(root, rel, sha(unsafeAfter), dirty);
    old.status = 'reverted';

    // User now resolves the old WIP exactly as the UI instructs, then applies a new LP edit.
    fs.writeFileSync(path.join(root, rel), cleanAfter);
    const fresh = inst._publishSealRecord(root, rel, base, sha(cleanAfter));
    assert.strictEqual(fresh.ok, true, 'no live/kept edge remains, so the clean preimage is proven anew');
    inst._feed.push({ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(cleanAfter) } });
    const scope = inst._publishFileScope(root, [{ x: ' ', y: 'M', path: rel }]);
    assert.deepStrictEqual(Array.from(scope.files, (r) => r.path), [rel]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Clean-filter proof accepts an honest CRLF preimage against the normalized HEAD blob', () => {
  const rel = 'page.tsx';
  const root = initGitWorkspace('lp-pub-crlf-', { [rel]: 'title=base\nbody=base\n' }, '*.tsx text\n');
  const Panel = loadPanelWithFakeSpawn(gitOnlySpawn);
  try {
    const before = Buffer.from('title=base\r\nbody=base\r\n');
    const after = Buffer.from('title=LP\r\nbody=base\r\n');
    fs.writeFileSync(path.join(root, rel), before);
    assert.strictEqual(runGit(root, ['diff', '--quiet', '--', rel], true).status, 0, 'Git clean filters consider the CRLF checkout equal to HEAD');
    fs.writeFileSync(path.join(root, rel), after);
    const inst = Object.create(Panel.prototype);
    inst._livePublishScope = true;
    assert.strictEqual(inst._publishSealRecord(root, rel, before, sha(after)).ok, true);
    inst._feed = [{ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(after) } }];
    const scope = inst._publishFileScope(root, [{ x: ' ', y: 'M', path: rel }]);
    assert.deepStrictEqual(Array.from(scope.files, (r) => r.path), [rel]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Production Publish prepares the canonical CRLF lease before the real isolated commit', async () => {
  const rel = 'page.tsx';
  const root = initGitWorkspace('lp-pub-crlf-commit-', { [rel]: 'title=base\nbody=base\n' }, '*.tsx text\n');
  const before = Buffer.from('title=base\r\nbody=base\r\n');
  const after = Buffer.from('title=LP\r\nbody=base\r\n');
  const realExtra = require('./host-extra.js');
  let preparedRows = null, pushedHead = null;
  const hostExtra = Object.assign({}, realExtra, {
    classifyShaGuard: () => ({ ok: true, checked: false }),
    gitRemoteInfo: async () => ({ available: true, name: 'origin', url: 'https://example.test/repo.git', targetBranch: 'main' }),
    gitCommitPreview: async () => ({ branch: 'main', files: [{ x: ' ', y: 'M', path: rel }], message: 'test' }),
    gitCommit: async (cwd, files, message, rows) => {
      preparedRows = rows;
      return realExtra.gitCommit(cwd, files, message, rows);
    },
    gitPush: async (cwd, head) => { pushedHead = head; return { ok: false, reason: 'test-stop-before-network', out: '', cmd: 'no network' }; },
  });
  try {
    fs.writeFileSync(path.join(root, rel), before);
    assert.strictEqual(runGit(root, ['diff', '--quiet', '--', rel], true).status, 0, 'CRLF preimage is Git-clean');
    fs.writeFileSync(path.join(root, rel), after);
    const run = await commitWithHostExtra(root, { files: [rel], message: 'approved CRLF' }, hostExtra, (inst) => {
      inst._livePublishScope = true;
      assert.strictEqual(inst._publishSealRecord(root, rel, before, sha(after)).ok, true);
      inst._feed = [{ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(after) } }];
    }, gitOnlySpawn);
    assert.ok(Array.isArray(preparedRows) && preparedRows.length === 1);
    assert.match(preparedRows[0].blobOid, /^[a-f0-9]{40,64}$/);
    assert.match(preparedRows[0].gitMode, /^100(644|755)$/);
    assert.strictEqual(preparedRows[0].raw.equals(after), true, 'raw SHA still binds the CRLF bytes shown to the user');
    assert.match(pushedHead || '', /^[a-f0-9]{40,64}$/, 'only the immutable candidate OID reaches the mocked push');
    const committed = runGit(root, ['show', 'HEAD:' + rel]).stdout;
    assert.strictEqual(committed, 'title=LP\nbody=base\n', 'the real commit contains Git canonical LF bytes');
    assert.strictEqual(run.posted.reason, 'test-stop-before-network');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Production Publish refuses a concurrent same-path HEAD advance after canonical preparation', async () => {
  const rel = 'page.tsx';
  const base = 'title=base\n';
  const approved = 'title=approved-by-live-preview\n';
  const concurrent = 'title=concurrent-commit\n';
  const root = initGitWorkspace('lp-pub-selected-base-race-', { [rel]: base });
  const realExtra = require('./host-extra.js');
  let pushed = false;
  let concurrentHead = null;
  let securityStale = null;
  const hostExtra = Object.assign({}, realExtra, {
    classifyShaGuard: () => ({ ok: true, checked: false }),
    gitRemoteInfo: async () => ({ available: true, name: 'origin', url: 'https://example.test/repo.git', targetBranch: 'main' }),
    gitCommitPreview: async () => ({ branch: 'main', files: [{ x: ' ', y: 'M', path: rel }], message: 'test' }),
    gitPush: async () => { pushed = true; return { ok: true, out: '', cmd: 'must not run' }; },
  });
  try {
    fs.writeFileSync(path.join(root, rel), approved);
    const run = await commitWithHostExtra(root, { files: [rel], message: 'approved LP bytes' }, hostExtra, (inst) => {
      inst._livePublishScope = true;
      assert.strictEqual(inst._publishSealRecord(root, rel, base, sha(approved)).ok, true);
      inst._feed = [{ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(approved) } }];
      inst._markSecurityStale = (reason) => { securityStale = reason; };
      let approvalChecks = 0;
      inst._journeyApprovalGate = () => {
        approvalChecks++;
        if (approvalChecks === 3) {
          const approvedRaw = fs.readFileSync(path.join(root, rel));
          fs.writeFileSync(path.join(root, rel), concurrent);
          runGit(root, ['add', '--', rel]);
          runGit(root, ['commit', '-q', '-m', 'concurrent same-path commit']);
          concurrentHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
          fs.writeFileSync(path.join(root, rel), approvedRaw);
        }
        return { cleared: true, reason: null };
      };
    }, gitOnlySpawn);
    assert.ok(concurrentHead, 'the adversarial same-path commit landed at the final host gate');
    assert.strictEqual(run.posted.ok, false);
    assert.strictEqual(run.posted.reason, 'git-selected-base-moved');
    assert.strictEqual(pushed, false, 'a selected-path base race can never reach the network');
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), concurrentHead, 'Publish leaves the concurrent HEAD untouched');
    assert.strictEqual(runGit(root, ['show', 'HEAD:' + rel]).stdout, concurrent, 'Publish never restores approved bytes over the concurrent parent');
    assert.strictEqual(fs.readFileSync(path.join(root, rel), 'utf8'), approved, 'the local LP proposal remains visible and recoverable');
    assert.strictEqual(securityStale, 'publish-selected-base-moved', 'the UI must require a fresh review against the new base');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Agent Keep scope uses the runner first-touch snapshot seal, never the webview payload', () => {
  const rel = 'agent.tsx', before = 'export const value = "base";\n', after = 'export const value = "agent";\n';
  const root = initGitWorkspace('lp-pub-agent-keep-', { [rel]: before });
  const Panel = loadPanelWithFakeSpawn(gitOnlySpawn);
  try {
    fs.writeFileSync(path.join(root, rel), after);
    const inst = Object.create(Panel.prototype);
    inst._livePublishScope = true;
    assert.strictEqual(inst._publishSealRecord(root, rel, Buffer.from(before), sha(after)).ok, true);
    inst._feed = [{ kind: 'agent', status: 'kept', files: [rel], approvedShas: [{ file: rel, sha256: sha(after) }] }];
    const scope = inst._publishFileScope(root, [{ x: ' ', y: 'M', path: rel }]);
    assert.deepStrictEqual(Array.from(scope.files, (r) => r.path), [rel]);
    inst._feed[0].approvedShas[0].sha256 = sha('forged');
    const forged = inst._publishFileScope(root, [{ x: ' ', y: 'M', path: rel }]);
    assert.deepStrictEqual(Array.from(forged.files), []);
    assert.deepStrictEqual(Array.from(forged.stalePaths), [rel]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Vercel resolver freezes canonical name/id/org plus the exact raw project.json bytes', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const Panel = loadPanelWithFakeSpawn(() => ({ status: 0, stdout: '', stderr: '' }));
  const inst = Object.create(Panel.prototype);
  try {
    const file = path.join(root, 'landing', '.vercel', 'project.json');
    const raw = fs.readFileSync(file);
    const first = inst._vercelProject(root);
    assert.strictEqual(first.linked, true);
    assert.strictEqual(first.projectName, 'showcase-proj');
    assert.strictEqual(first.projectId, 'prj_x');
    assert.strictEqual(first.orgId, 'team_x');
    assert.strictEqual(first.projectJsonSha256, crypto.createHash('sha256').update(raw).digest('hex'));
    assert.strictEqual(first.identityKey.length, 64);
    assert.strictEqual(Buffer.isBuffer(first.raw), true);
    assert.strictEqual(first.raw.equals(raw), true);

    // Same visible project name, different provider identity: the target lease must change.
    fs.writeFileSync(file, JSON.stringify({ projectId: 'prj_other', orgId: 'team_x', projectName: 'showcase-proj' }), 'utf8');
    const second = inst._vercelProject(root);
    assert.strictEqual(second.projectName, first.projectName);
    assert.notStrictEqual(second.projectJsonSha256, first.projectJsonSha256);
    assert.notStrictEqual(second.identityKey, first.identityKey);
    assert.strictEqual(inst._sameVercelIdentity(first, second), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Vercel resolver fails closed on an incomplete preferred link instead of falling through to another project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-vercel-invalid-'));
  const Panel = loadPanelWithFakeSpawn(() => ({ status: 0, stdout: '', stderr: '' }));
  const inst = Object.create(Panel.prototype);
  try {
    fs.mkdirSync(path.join(root, '.vercel'), { recursive: true });
    fs.writeFileSync(path.join(root, '.vercel', 'project.json'), JSON.stringify({ projectName: 'root-project', projectId: 'prj_root', orgId: 'team_root' }));
    fs.mkdirSync(path.join(root, 'landing', '.vercel'), { recursive: true });
    fs.writeFileSync(path.join(root, 'landing', '.vercel', 'project.json'), JSON.stringify({ projectName: 'landing-project', projectId: 'prj_landing' }));
    const info = inst._vercelProject(root);
    assert.strictEqual(info.linked, false);
    assert.strictEqual(info.reason, 'vercel-identity-invalid');
    assert.strictEqual(info.projectName, null, 'a valid fallback cannot silently replace an invalid preferred target');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Publish status exposes only redacted Vercel identity hints plus an opaque target lease', async () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const file = path.join(root, 'landing', '.vercel', 'project.json');
  fs.writeFileSync(file, JSON.stringify({ projectName: 'showcase-proj', projectId: 'prj_super_secret_full', orgId: 'team_super_secret_full' }));
  const realExtra = require('./host-extra.js');
  const hostExtra = Object.assign({}, realExtra, {
    gitCommitPreview: async () => ({ branch: 'main', files: [], message: 'test' }),
    gitRemoteInfo: async () => ({ available: false, reason: 'git-remote-required', name: null, url: null, webUrl: null }),
    gitStage: async () => ({ ahead: 0, behind: 0 }),
    defaultCommitMessage: () => 'test',
  });
  const Panel = loadPanelWithFakeSpawn(() => ({ status: 0, stdout: '', stderr: '' }), hostExtra);
  const inst = Object.create(Panel.prototype);
  let posted = null;
  try {
    inst.token = 'T';
    inst._wsRoot = () => root;
    inst._securityGate = () => ({ cleared: true, reason: null });
    inst._journeyApprovalGate = () => ({ cleared: true, reason: null });
    inst._journeySecurityVerdict = () => {};
    inst.panel = { webview: { postMessage: (m) => { posted = m; } } };
    await inst._publishStatus();
    assert.strictEqual(posted.vercelLinked, true);
    assert.strictEqual(posted.projectName, 'showcase-proj');
    assert.strictEqual(posted.vercelReason, null);
    assert.strictEqual(posted.vercelIdentity.projectIdHint, 'prj_su…full');
    assert.strictEqual(posted.vercelIdentity.orgIdHint, 'team_s…full');
    assert.strictEqual(posted.vercelIdentity.projectJsonSha256Hint.length, 12);
    assert.strictEqual(posted.vercelIdentity.key.length, 64, 'status→click lease is opaque and complete');
    const publicJson = JSON.stringify(posted);
    assert.ok(!publicJson.includes('prj_super_secret_full'));
    assert.ok(!publicJson.includes('team_super_secret_full'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Publish status names and disables a same-file pre-existing WIP provenance block', async () => {
  const rel = 'page.tsx';
  const base = 'title=base\nprivate=stable\n';
  const preimage = 'title=base\nprivate=PRIVATE-WIP\n';
  const after = 'title=LP\nprivate=PRIVATE-WIP\n';
  const root = initGitWorkspace('lp-pub-status-same-file-', {
    [rel]: base,
    'landing/.vercel/project.json': JSON.stringify({ projectName: 'showcase-proj', projectId: 'prj_x', orgId: 'team_x' }),
  });
  const realExtra = require('./host-extra.js');
  const hostExtra = Object.assign({}, realExtra, {
    gitCommitPreview: async () => ({ branch: 'main', files: [{ x: ' ', y: 'M', path: rel }], message: 'test' }),
    gitRemoteInfo: async () => ({ available: true, name: 'origin', url: 'https://example.test/repo.git', webUrl: 'https://example.test/repo', targetBranch: 'main' }),
    gitStage: async () => ({ ahead: 0, behind: 0 }),
    defaultCommitMessage: () => 'test',
  });
  const Panel = loadPanelWithFakeSpawn(gitOnlySpawn, hostExtra);
  const inst = Object.create(Panel.prototype);
  let posted = null, verdict = null;
  try {
    fs.writeFileSync(path.join(root, rel), after);
    inst.token = 'T';
    inst._wsRoot = () => root;
    inst._livePublishScope = true;
    assert.strictEqual(inst._publishSealRecord(root, rel, preimage, sha(after)).ok, false);
    inst._feed = [{ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(after) } }];
    inst._securityGate = () => ({ cleared: true, reason: null });
    inst._journeyApprovalGate = () => ({ cleared: true, reason: null });
    inst._journeySecurityVerdict = (gate) => { verdict = gate; };
    inst.panel = { webview: { postMessage: (m) => { posted = m; } } };
    await inst._publishStatus();
    assert.strictEqual(posted.hasOpenCritical, true, 'the shared Publish control is disabled');
    assert.strictEqual(posted.securityReason, 'preexisting-dirt-in-approved-file');
    assert.deepStrictEqual(Array.from(posted.touchedFiles), [], 'unsafe whole-file bytes are never advertised as publishable');
    assert.deepStrictEqual(Array.from(posted.local.blockedPaths), [rel], 'the UI receives the exact actionable path');
    assert.strictEqual(posted.local.publishableCount, 0);
    assert.strictEqual(verdict.cleared, false);
    assert.strictEqual(verdict.reason, 'preexisting-dirt-in-approved-file', 'the selected journey gets the same honest verdict');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Vercel deploy requires the status identity lease even when the visible project name matches', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    for (const key of [null, '0'.repeat(64)]) {
      const r = deployRaw(root, { projectName: 'showcase-proj', vercelIdentityKey: key },
        (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; });
      assert.strictEqual(r.reason, 'vercel-identity-changed');
    }
    assert.strictEqual(calls.length, 0, 'a missing/stale target lease never reaches Vercel');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Vercel identity race after the initial gate is caught by the pre-snapshot reread', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const link = path.join(root, 'landing', '.vercel', 'project.json');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; },
      CLEAN_SCAN, 'FP', (inst) => {
        const resolve = inst._vercelProject.bind(inst); let reads = 0;
        inst._vercelProject = (candidate) => {
          const info = resolve(candidate); reads++;
          if (reads === 1) fs.writeFileSync(link, JSON.stringify({ projectName: 'showcase-proj', projectId: 'prj_raced', orgId: 'team_x' }));
          return info;
        };
      });
    assert.strictEqual(r.reason, 'vercel-identity-changed');
    assert.strictEqual(calls.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Vercel identity race after the pre-snapshot fence is rejected when the copied target is checked', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const link = path.join(root, 'landing', '.vercel', 'project.json');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; },
      CLEAN_SCAN, 'FP', (inst) => {
        const resolve = inst._vercelProject.bind(inst); let reads = 0;
        inst._vercelProject = (candidate) => {
          const info = resolve(candidate); reads++;
          if (reads === 2) fs.writeFileSync(link, JSON.stringify({ projectName: 'showcase-proj', projectId: 'prj_after_fence', orgId: 'team_x' }));
          return info;
        };
      });
    assert.strictEqual(r.reason, 'vercel-identity-changed');
    assert.strictEqual(calls.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Vercel identity race after snapshot validation is caught by the final pre-spawn reread', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; },
      CLEAN_SCAN, 'FP', (inst) => {
        const resolve = inst._vercelProject.bind(inst); let reads = 0;
        inst._vercelProject = (candidate) => {
          const info = resolve(candidate); reads++;
          if (reads === 3 && candidate !== root) {
            fs.writeFileSync(path.join(candidate, '.vercel', 'project.json'), JSON.stringify({ projectName: 'showcase-proj', projectId: 'prj_snapshot_race', orgId: 'team_x' }));
          }
          return info;
        };
      });
    assert.strictEqual(r.reason, 'vercel-identity-changed');
    assert.strictEqual(calls.length, 0, 'final identity fence runs before the only process spawn');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Publish commit host ignores a forged request for parallel files outside Live Preview approval', async () => {
  const approved = 'approved.tsx', parallel = 'parallel.tsx';
  const before = 'approved before\n', after = 'approved\n';
  const root = initGitWorkspace('lp-pub-filter-', { [approved]: before, [parallel]: 'parallel before\n' });
  fs.writeFileSync(path.join(root, approved), after);
  fs.writeFileSync(path.join(root, parallel), 'parallel\n');
  const approvedSha = sha(after);
  let committedFiles = null;
  const realExtra = require('./host-extra.js');
  const hostExtra = Object.assign({}, realExtra, {
    classifyShaGuard: () => ({ ok: true, checked: false }),
    gitRemoteInfo: async () => ({ available: true, name: 'origin', url: 'https://example.test/repo.git', targetBranch: 'main' }),
    gitCommitPreview: async () => ({ branch: 'main', files: [{ x: ' ', y: 'M', path: approved }, { x: ' ', y: 'M', path: parallel }], message: 'test' }),
    gitCommit: async (cwd, files) => { committedFiles = files.slice(); return { ok: false, reason: 'commit-failed', out: 'stop', cmd: '' }; },
    gitPush: async () => { throw new Error('must not push'); },
  });
  try {
    const run = await commitWithHostExtra(root, { files: [approved, parallel], message: 'approved only' }, hostExtra, (inst) => {
      inst._livePublishScope = true;
      assert.strictEqual(inst._publishSealRecord(root, approved, before, approvedSha).ok, true);
      inst._feed = [{ kind: 'splice', status: 'live', files: [approved], entry: { shaAfter: approvedSha } }];
    }, gitOnlySpawn);
    assert.deepStrictEqual(Array.from(committedFiles || []), [approved], 'host intersects the untrusted payload with its own byte lease');
    assert.strictEqual(run.posted.reason, 'commit-failed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('A forged Publish payload cannot authorize pre-existing dirt in the exact same approved path', async () => {
  const rel = 'page.tsx', base = 'title=base\nprivate=stable\n';
  const preimage = 'title=base\nprivate=PRIVATE-WIP\n';
  const after = 'title=LP\nprivate=PRIVATE-WIP\n';
  const root = initGitWorkspace('lp-pub-forged-same-file-', { [rel]: base });
  fs.writeFileSync(path.join(root, rel), after);
  let commitCalled = false;
  const realExtra = require('./host-extra.js');
  const hostExtra = Object.assign({}, realExtra, {
    classifyShaGuard: () => ({ ok: true, checked: false }),
    gitRemoteInfo: async () => ({ available: true, name: 'origin', url: 'https://example.test/repo.git', targetBranch: 'main' }),
    gitCommitPreview: async () => ({ branch: 'main', files: [{ x: ' ', y: 'M', path: rel }], message: 'test' }),
    gitCommit: async () => { commitCalled = true; return { ok: true, head: 'a'.repeat(40), out: '', cmd: '' }; },
    gitPush: async () => { throw new Error('must not push'); },
  });
  try {
    const run = await commitWithHostExtra(root, { files: [rel], message: 'forged full file approval', approved: true }, hostExtra, (inst) => {
      inst._livePublishScope = true;
      assert.strictEqual(inst._publishSealRecord(root, rel, preimage, sha(after)).ok, false);
      inst._feed = [{ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(after) } }];
    }, gitOnlySpawn);
    assert.strictEqual(run.posted.ok, false);
    assert.strictEqual(run.posted.reason, 'preexisting-dirt-in-approved-file');
    assert.strictEqual(commitCalled, false, 'host provenance blocks before staging regardless of webview fields');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Production deploy refuses the mutable workspace until this panel has pushed an immutable commit', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: '', stderr: '' }; },
      CLEAN_SCAN, 'FP', (inst) => { inst._livePublishScope = true; inst._lastPublishCommit = null; });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'git-publish-required');
    assert.strictEqual(calls.length, 0, 'neither git archive nor Vercel can run before a successful push lease exists');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Production deploy archives the exact pushed commit and ignores newer HEAD plus parallel worktree dirt', () => {
  const projectJson = JSON.stringify({ projectId: 'prj_immutable', orgId: 'team_immutable', projectName: 'immutable-proof' });
  const root = initGitWorkspace('lp-pub-immutable-deploy-', {
    'landing/content.txt': 'content from approved commit A\n',
    'landing/parallel.txt': 'parallel from approved commit A\n',
    'root-only.txt': 'must stay outside the project snapshot\n',
  });
  let snapshotProject = null;
  const calls = [];
  try {
    const publishedHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    fs.writeFileSync(path.join(root, 'landing', 'content.txt'), 'content from newer commit B\n');
    fs.writeFileSync(path.join(root, 'landing', 'parallel.txt'), 'parallel from newer commit B\n');
    fs.writeFileSync(path.join(root, 'landing', 'newer-only.txt'), 'introduced after approval\n');
    runGit(root, ['add', '--', 'landing/content.txt', 'landing/parallel.txt', 'landing/newer-only.txt']);
    runGit(root, ['commit', '-q', '-m', 'newer parallel commit']);
    fs.writeFileSync(path.join(root, 'landing', 'content.txt'), 'uncommitted working-tree dirt\n');
    fs.writeFileSync(path.join(root, 'landing', 'working-only.txt'), 'untracked parallel dirt\n');
    fs.mkdirSync(path.join(root, 'landing', '.vercel'), { recursive: true });
    fs.writeFileSync(path.join(root, 'landing', '.vercel', 'project.json'), projectJson, 'utf8');

    const result = deployRaw(root, { projectName: 'immutable-proof' }, (cmd, args, opts) => {
      const exe = String(cmd || '').toLowerCase();
      calls.push({ cmd: String(cmd || ''), args: Array.isArray(args) ? Array.from(args) : [] });
      if (exe === 'git' || exe.endsWith('git.exe') || exe === 'tar' || exe.endsWith('tar.exe')) {
        return realSpawnSync(cmd, args, opts);
      }
      assert.strictEqual(exe, 'vercel', 'the harness permits only Git, tar, and the mocked Vercel boundary');
      snapshotProject = opts && opts.cwd;
      assert.ok(snapshotProject && fs.existsSync(snapshotProject), 'Vercel receives an owned project snapshot');
      assert.strictEqual(fs.readFileSync(path.join(snapshotProject, 'content.txt'), 'utf8'), 'content from approved commit A\n');
      assert.strictEqual(fs.readFileSync(path.join(snapshotProject, 'parallel.txt'), 'utf8'), 'parallel from approved commit A\n');
      assert.strictEqual(fs.existsSync(path.join(snapshotProject, 'newer-only.txt')), false, 'newer committed files cannot enter the deploy');
      assert.strictEqual(fs.existsSync(path.join(snapshotProject, 'working-only.txt')), false, 'untracked worktree files cannot enter the deploy');
      assert.strictEqual(fs.existsSync(path.join(path.dirname(snapshotProject), 'root-only.txt')), false, 'project-subdir deploy cannot absorb repository-root files');
      assert.strictEqual(fs.readFileSync(path.join(snapshotProject, '.vercel', 'project.json'), 'utf8'), projectJson, 'the frozen Vercel identity bytes are restored exactly');
      return { status: 0, stdout: 'https://immutable-proof.vercel.app\n', stderr: '' };
    }, CLEAN_SCAN, 'FP', (inst) => {
      inst._livePublishScope = true;
      inst._feed = [];
      inst._emitLpEvent = () => {};
      inst._journeyPublishResult = () => {};
      inst._lastPublishCommit = {
        root,
        head: publishedHead,
        files: ['landing/content.txt'],
        securityFingerprint: inst._lastSecurity.fingerprint,
        securityReportId: inst._lastSecurity.reportId || null,
      };
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.url, 'https://immutable-proof.vercel.app');
    const archive = calls.find((c) => c.args[2] === 'archive');
    assert.ok(archive, 'Git archive is the only source of deploy bytes');
    assert.deepStrictEqual(archive.args.slice(0, 6), ['-C', root, 'archive', '--format=tar', publishedHead, '--']);
    assert.strictEqual(archive.args[6], 'landing', 'only the linked project subdirectory is archived');
    assert.strictEqual(calls.filter((c) => c.cmd.toLowerCase() === 'vercel').length, 1);
    assert.ok(snapshotProject, 'the mocked irreversible boundary was reached once');
    assert.strictEqual(fs.existsSync(path.dirname(snapshotProject)), false, 'the owned deploy snapshot is removed in finally');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Production deploy refuses git-archive export-subst bytes that differ from the immutable commit', () => {
  const projectJson = JSON.stringify({ projectId: 'prj_subst', orgId: 'team_subst', projectName: 'subst-proof' });
  const root = initGitWorkspace('lp-pub-export-subst-', {
    'landing/template.txt': 'commit=$Format:%H$\n',
    'landing/index.html': '<main>immutable</main>\n',
  }, 'landing/template.txt export-subst\n');
  let vercelCalls = 0;
  try {
    fs.mkdirSync(path.join(root, 'landing', '.vercel'), { recursive: true });
    fs.writeFileSync(path.join(root, 'landing', '.vercel', 'project.json'), projectJson, 'utf8');
    const publishedHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    const result = deployRaw(root, { projectName: 'subst-proof' }, (cmd, args, opts) => {
      const exe = String(cmd || '').toLowerCase();
      if (exe === 'git' || exe.endsWith('git.exe') || exe === 'tar' || exe.endsWith('tar.exe')) return realSpawnSync(cmd, args, opts);
      if (exe === 'vercel') vercelCalls++;
      return { status: 0, stdout: 'https://must-not-deploy.vercel.app\n', stderr: '' };
    }, CLEAN_SCAN, 'FP', (inst) => {
      inst._livePublishScope = true;
      inst._feed = [];
      inst._journeyPublishResult = () => {};
      inst._lastPublishCommit = {
        root,
        head: publishedHead,
        files: ['landing/template.txt'],
        securityFingerprint: inst._lastSecurity.fingerprint,
        securityReportId: inst._lastSecurity.reportId || null,
      };
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'deploy-snapshot-mismatch');
    assert.strictEqual(vercelCalls, 0, 'archive-time substitutions can never cross the deploy boundary');
    assert.strictEqual(runGit(root, ['show', 'HEAD:landing/template.txt']).stdout, 'commit=$Format:%H$\n', 'the immutable commit itself remains the reviewed source of truth');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Production deploy blocks same-file pre-existing WIP even with a valid pushed-commit lease', () => {
  const rel = 'page.tsx';
  const base = 'title=base\nprivate=stable\n';
  const preimage = 'title=base\nprivate=PRIVATE-WIP\n';
  const after = 'title=LP\nprivate=PRIVATE-WIP\n';
  const root = initGitWorkspace('lp-pub-deploy-same-file-', {
    [rel]: base,
    'landing/.vercel/project.json': JSON.stringify({ projectName: 'showcase-proj', projectId: 'prj_x', orgId: 'team_x' }),
    'landing/index.html': '<main>base</main>\n',
  });
  const nonGitCalls = [];
  try {
    fs.writeFileSync(path.join(root, rel), after);
    const head = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    const r = deployRaw(root, { projectName: 'showcase-proj' }, (cmd, args, opts) => {
      const exe = String(cmd || '').toLowerCase();
      if (exe === 'git' || exe.endsWith('git.exe')) return realSpawnSync(cmd, args, opts);
      nonGitCalls.push({ cmd, args });
      return { status: 0, stdout: '', stderr: '' };
    }, CLEAN_SCAN, 'FP', (inst) => {
      inst._livePublishScope = true;
      assert.strictEqual(inst._publishSealRecord(root, rel, preimage, sha(after)).ok, false);
      inst._feed = [{ kind: 'splice', status: 'live', files: [rel], entry: { shaAfter: sha(after) } }];
      inst._lastPublishCommit = {
        root,
        head,
        securityFingerprint: inst._lastSecurity.fingerprint,
        securityReportId: inst._lastSecurity.reportId || null,
      };
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'preexisting-dirt-in-approved-file');
    assert.deepStrictEqual(nonGitCalls, [], 'neither archive/tar nor Vercel starts after the provenance veto');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

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

test('D6 coverage gate: an unavailable package audit blocks Publish instead of failing open', () => {
  const root = mkLinkedWorkspace('showcase-proj');
  const calls = [];
  try {
    const r = deployRaw(root, { projectName: 'showcase-proj' },
      (cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'x', stderr: '' }; },
      Object.assign({}, CLEAN_SCAN, { coverage: Object.assign({}, CLEAN_COVERAGE, { complete: false, npmAudit: false }), audit: { ok: false, reason: 'package-audit-failed' } }));
    assert.strictEqual(r.reason, 'security-coverage-incomplete');
    assert.strictEqual(calls.length, 0, 'incomplete scanner coverage can never reach Vercel');
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

test('Publish commit TOCTOU: host captures raw+SHA after the second gate and passes the lease to gitCommit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-content-lease-'));
  const rel = 'landing/app/page.tsx';
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const bytes = Buffer.from('export default function Page() { return <p>approved</p>; }\n');
  fs.writeFileSync(abs, bytes);
  let commitArgs = null;
  let pushCalled = false;
  const realExtra = require('./host-extra.js');
  const hostExtra = Object.assign({}, realExtra, {
    classifyShaGuard: () => ({ ok: true, checked: false }),
    gitRemoteInfo: async () => ({ available: true, name: 'origin', url: 'https://example.test/repo.git', targetBranch: 'main' }),
    gitCommitPreview: async () => ({ branch: 'main', files: [{ x: ' ', y: 'M', path: rel }], message: 'test' }),
    gitCommit: async function () {
      commitArgs = Array.prototype.slice.call(arguments);
      return { ok: false, reason: 'approved-content-changed', out: 'commit refused', cmd: 'isolated' };
    },
    gitPush: async () => { pushCalled = true; return { ok: true, out: '', cmd: 'must-not-run' }; },
  });
  try {
    const run = await commitWithHostExtra(root, { files: [rel], message: 'approved commit' }, hostExtra);
    assert.ok(commitArgs, 'gitCommit was reached only after all host gates');
    assert.strictEqual(commitArgs[0], root);
    assert.strictEqual(Array.prototype.join.call(commitArgs[1], ','), rel);
    assert.strictEqual(commitArgs[2], 'approved commit');
    const lease = commitArgs[3];
    assert.strictEqual(Array.isArray(lease), true);
    assert.strictEqual(lease.length, 1);
    assert.strictEqual(lease[0].path, rel);
    assert.strictEqual(lease[0].missing, false);
    assert.strictEqual(Buffer.isBuffer(lease[0].raw), true);
    assert.strictEqual(lease[0].raw.equals(bytes), true, 'raw approved bytes cross the host boundary unchanged');
    assert.strictEqual(lease[0].sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.ok(run.securityChecks >= 3, 'Security is checked before discovery, before snapshot, and after the multi-file snapshot');
    assert.strictEqual(run.posted.reason, 'approved-content-changed', 'the exact refusal reason reaches the user');
    assert.strictEqual(pushCalled, false, 'a snapshot mismatch can never reach push');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Publish rename selection expands the displayed NEW path into NEW bytes plus approved OLD deletion', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-rename-lease-'));
  const newPath = 'src/new name.ts';
  const oldPath = 'src/old name.ts';
  const bytes = Buffer.from('export const renamed = true;\n');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, ...newPath.split('/')), bytes);
  fs.writeFileSync(path.join(root, ...oldPath.split('/')), 'recreated after rename\n');
  let commitArgs = null;
  const realExtra = require('./host-extra.js');
  const hostExtra = Object.assign({}, realExtra, {
    classifyShaGuard: () => ({ ok: true, checked: false }),
    gitRemoteInfo: async () => ({ available: true, name: 'origin', url: 'https://example.test/repo.git', targetBranch: 'main' }),
    gitCommitPreview: async () => ({
      branch: 'main',
      files: [{ x: 'R', y: ' ', path: newPath, origPath: oldPath }],
      message: 'rename',
    }),
    gitCommit: async function () {
      commitArgs = Array.prototype.slice.call(arguments);
      return { ok: false, reason: 'commit-failed', out: 'test stop', cmd: 'isolated' };
    },
    gitPush: async () => { throw new Error('push must not run after test stop'); },
  });
  try {
    const run = await commitWithHostExtra(root, { files: [newPath], message: 'approved rename' }, hostExtra);
    assert.ok(commitArgs, 'the host reaches the content-bound commit after expanding the rename');
    assert.strictEqual(Array.prototype.join.call(commitArgs[1], '|'), newPath + '|' + oldPath, 'one displayed rename expands to both Git paths');
    const lease = commitArgs[3];
    assert.strictEqual(lease.length, 2);
    assert.strictEqual(lease[0].path, newPath);
    assert.strictEqual(lease[0].missing, false);
    assert.strictEqual(lease[0].raw.equals(bytes), true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(lease[1])), { path: oldPath, missing: true, sha256: null, raw: null });
    assert.strictEqual(fs.existsSync(path.join(root, ...oldPath.split('/'))), true, 'test proves the host never silently approved a recreated OLD path');
    assert.strictEqual(run.posted.reason, 'commit-failed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Publish push freezes both immutable commit id and the confirmed remote/branch/url', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-destination-lease-'));
  const rel = 'approved.txt';
  fs.writeFileSync(path.join(root, rel), 'approved\n');
  const head = 'a'.repeat(40);
  let pushArgs = null;
  const realExtra = require('./host-extra.js');
  const hostExtra = Object.assign({}, realExtra, {
    classifyShaGuard: () => ({ ok: true, checked: false }),
    gitRemoteInfo: async () => ({ available: true, name: 'upstream', url: 'https://example.test/upstream.git', targetBranch: 'release' }),
    gitCommitPreview: async () => ({ branch: 'local', files: [{ x: ' ', y: 'M', path: rel }], message: 'test' }),
    gitCommit: async () => ({ ok: true, head, out: 'ok', cmd: 'isolated commit' }),
    gitPush: async function () {
      pushArgs = Array.prototype.slice.call(arguments);
      return { ok: false, reason: 'git-destination-changed', out: 'push refused', cmd: '' };
    },
  });
  try {
    const run = await commitWithHostExtra(root, { files: [rel], message: 'approved' }, hostExtra);
    assert.ok(pushArgs);
    assert.strictEqual(pushArgs[0], root);
    assert.strictEqual(pushArgs[1], head);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(pushArgs[2])), {
      name: 'upstream', targetBranch: 'release', url: 'https://example.test/upstream.git',
    });
    assert.strictEqual(run.posted.ok, false);
    assert.strictEqual(run.posted.reason, 'git-destination-changed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Publish commit preserves the host Git destination refusal reason for actionable UX', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-pub-multi-remote-'));
  const realExtra = require('./host-extra.js');
  const hostExtra = Object.assign({}, realExtra, {
    classifyShaGuard: () => ({ ok: true, checked: false }),
    gitRemoteInfo: async () => ({ available: false, reason: 'git-multiple-push-destinations', destinationCount: 2, name: 'origin' }),
    gitCommitPreview: async () => { throw new Error('destination refusal must happen before preview/staging'); },
    gitCommit: async () => { throw new Error('must not commit'); },
    gitPush: async () => { throw new Error('must not push'); },
  });
  try {
    const run = await commitWithHostExtra(root, { files: ['approved.ts'], message: 'approved' }, hostExtra);
    assert.strictEqual(run.posted.ok, false);
    assert.strictEqual(run.posted.reason, 'git-multiple-push-destinations');
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
