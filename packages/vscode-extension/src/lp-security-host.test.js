'use strict';
// lp-security-host.test.js — LP-5 §B: the host-side _securityScan() proven against the REAL
// LivePreviewPanel (vm-loaded extension.js with the real 4 scanners) and a real temp workspace.
// Guards the properties a review that touches secrets MUST hold: (1) it finds real secrets/xss/csp
// in shipped code, (2) it NEVER walks node_modules/test/fixture dirs or *.test.* files (a showcase
// can't flood with false criticals from the scanners' own fixtures), (3) the result carries
// workspace-RELATIVE paths + REDACTED previews only — never an absolute host path or a full secret,
// (4) it is fail-soft (a broken workspace degrades, never throws).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

function loadPanelClass(opts) {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  // The 4 scanners must be the REAL modules so _securityScan actually detects; everything else
  // (fs, child_process) is a Node builtin → real via realReq; other ./-relative modules are mocked.
  const REAL = ['./lp-secret-scan.js', './lp-xss-scan.js', './lp-csp-check.js', './lp-audit-summary.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (name === 'child_process' && opts && opts.childProcess) return opts.childProcess; if (name === './host-extra.js' && opts && opts.hostExtra) return opts.hostExtra; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; the class binding survives */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

// A real AWS-key-SHAPED string (not a real credential) — the exact shape scanSecrets flags.
const FAKE_AWS = 'AKIA' + 'IOSFODNN7EXAMPLE';

function mkWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-'));
  const mk = (rel, content) => { const abs = path.join(root, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content, 'utf8'); };
  mk('app/leak.tsx', 'export const k = "' + FAKE_AWS + '";\n');                 // shipped secret → critical
  mk('public/config.js', 'window.KEY = "' + FAKE_AWS + '";\n');                 // secret under public/ → critical
  mk('next.config.js', "module.exports = { headers: async () => [{ source: '/', headers: [{ key: 'Content-Security-Policy', value: \"script-src 'unsafe-inline'\" }] }] };\n");
  mk('app/danger.tsx', 'export default () => <div dangerouslySetInnerHTML={{ __html: x }} />;\n'); // xss heuristic
  mk('app/clean.tsx', 'export default () => <p>hello</p>;\n');                   // no findings
  // The trap: a TEST file with the same shaped secret — must be SKIPPED (not shipped product).
  mk('app/leak.test.tsx', 'it("x", () => { const k = "' + FAKE_AWS + '"; });\n');
  // And a fixtures dir — must be skipped wholesale.
  mk('fixtures/seed.tsx', 'export const k = "' + FAKE_AWS + '";\n');
  return root;
}

function runScanDetailed(root) {
  const Panel = loadPanelClass();
  assert.ok(Panel, 'LivePreviewPanel class loaded');
  const posts = [];
  // Object.create so prototype methods (_treeFingerprint, called by _securityScan to bind the scan to
  // the tree state) resolve; only the three collaborators are overridden on the instance.
  const fakeThis = Object.create(Panel.prototype);
  fakeThis.token = 'HTOK';
  fakeThis._wsRoot = () => root;
  fakeThis.panel = { webview: { postMessage: (mIn) => { posts.push(mIn); } } };
  Panel.prototype._securityScan.call(fakeThis);
  return { result: posts.filter((m) => m && m.type === 'lp-security-result').pop() || null, posts, instance: fakeThis };
}
function runScan(root) { return runScanDetailed(root).result; }

test('LP-5 _securityScan: finds shipped secrets/xss/csp; SKIPS test files + fixtures', () => {
  const root = mkWorkspace();
  try {
    const detail = runScanDetailed(root);
    const r = detail.result;
    assert.ok(r && r.type === 'lp-security-result', 'posts a security result: ' + JSON.stringify(r && r.type));
    assert.ok(!r.error, 'no scan error on a valid workspace');
    const secretPaths = (r.secrets || []).map((s) => s.path);
    assert.ok(secretPaths.includes('app/leak.tsx'), 'flags the shipped secret');
    assert.ok(secretPaths.some((p) => p.indexOf('public/config.js') !== -1), 'flags the public/ secret');
    // The test file and the fixtures dir MUST NOT appear — no false criticals from non-shipped code.
    assert.ok(!secretPaths.some((p) => /\.test\./.test(p)), 'a *.test.* file is NOT scanned: ' + JSON.stringify(secretPaths));
    assert.ok(!secretPaths.some((p) => p.indexOf('fixtures/') !== -1), 'a fixtures/ dir is NOT scanned');
    // xss + csp fired on the shipped files.
    assert.ok((r.xss || []).some((x) => x.path === 'app/danger.tsx'), 'flags dangerouslySetInnerHTML');
    assert.ok(r.csp && Array.isArray(r.csp.findings) && r.csp.findings.some((f) => f.type === 'unsafe-inline'), 'flags unsafe-inline CSP');
    assert.ok(r.counts && r.counts.total >= 4 && r.counts.critical >= 2, 'host emits badge-ready severity counts');
    assert.match(r.reportId || '', /^sec-[a-f0-9]+$/, 'final report is bound to the scanned tree fingerprint');
    assert.ok(r.coverage && r.coverage.secrets && r.coverage.xss && r.coverage.csp, 'report states the scanners that actually ran');
    const phases = detail.posts.filter((m) => m.type === 'lp-security-status').map((m) => m.security && m.security.phase);
    assert.deepStrictEqual(phases.slice(0, 3), ['scope', 'static', 'dependencies'], 'progress is honest and ordered before the result');
    assert.strictEqual(detail.posts[detail.posts.length - 1].type, 'lp-security-result', 'atomic final result is the last scan message');

    // Remediation authority remains host-side. Secrets are manual-only; the indexed XSS row may
    // launch a task, but only by findingId from this exact scan.
    let launched = null;
    detail.instance._taskRun = (m) => { launched = m; };
    const secret = r.secrets[0];
    detail.instance._securityFix({ findingId: secret.findingId });
    assert.strictEqual(launched, null, 'a secret is never auto-fixed');
    assert.ok(detail.posts.some((m) => m.type === 'lp-task-result' && m.reason === 'security-fix-unavailable'), 'manual-only refusal is visible in the review thread');
    const xss = r.xss.find((x) => x.fixable);
    // This temp directory is intentionally not a Git repo, so the real scan is correctly marked
    // incomplete. Exercise the separate remediation-authority contract under a fresh/complete lease.
    detail.instance._securityRun.state = 'complete';
    detail.instance._scanFingerprint = () => detail.instance._lastSecurity.fingerprint;
    detail.instance._securityFix({ findingId: xss.findingId });
    assert.ok(launched && launched.securityFindingId === xss.findingId && launched.mode === 'auto' && launched.intent === 'edit', 'only the host-indexed safe finding reaches the agent');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('LP-5 _securityScan: NEVER leaks a full secret or an absolute host path to the webview', () => {
  const root = mkWorkspace();
  try {
    const r = runScan(root);
    const blob = JSON.stringify(r);
    assert.ok(blob.indexOf(FAKE_AWS) === -1, 'the FULL secret never appears in the posted result (previews are redacted)');
    assert.ok(blob.indexOf(root) === -1, 'the absolute workspace path never appears (paths are workspace-relative)');
    // every secret preview is short (redacted) — never the full 20-char key.
    for (const s of (r.secrets || [])) assert.ok(String(s.preview || '').length <= 6, 'preview is redacted: ' + s.preview);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('LP-5 _securityScan: fail-soft — a non-existent workspace posts a result, never throws', () => {
  const bogus = path.join(os.tmpdir(), 'lp-sec-does-not-exist-' + Date.now());
  assert.doesNotThrow(() => {
    const r = runScan(bogus);
    assert.ok(r && r.type === 'lp-security-result', 'still posts a (possibly empty) result');
    assert.strictEqual((r.secrets || []).length, 0, 'no secrets from an empty/missing tree');
  });
});

test('Security dependency scope audits the served standalone app with --omit=dev, not the workspace anchor', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-packages-'));
  const landing = path.join(root, 'landing');
  fs.mkdirSync(path.join(landing, 'app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"anchor","private":true}', 'utf8');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"name":"anchor","lockfileVersion":3,"packages":{}}', 'utf8');
  fs.writeFileSync(path.join(landing, 'package.json'), '{"name":"site","private":true}', 'utf8');
  fs.writeFileSync(path.join(landing, 'package-lock.json'), '{"name":"site","lockfileVersion":3,"packages":{}}', 'utf8');
  fs.writeFileSync(path.join(landing, 'app', 'page.tsx'), 'export default () => <p>moo</p>;\n', 'utf8');
  const calls = [];
  const auditJson = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 } } });
  const cp = { spawnSync: (cmd, args, options) => {
    calls.push({ cmd, args: Array.from(args || []), cwd: options && options.cwd });
    if (Array.isArray(args) && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
    return { status: 0, stdout: auditJson, stderr: '' };
  } };
  try {
    const Panel = loadPanelClass({ childProcess: cp });
    const posts = [];
    const inst = Object.create(Panel.prototype);
    inst.token = 'T'; inst._wsRoot = () => root; inst._servedRoot = landing;
    inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
    inst._securityScan();
    const npmCall = calls.find((c) => c.args[0] === 'audit');
    assert.ok(npmCall, 'npm audit was invoked');
    assert.strictEqual(path.resolve(npmCall.cwd), path.resolve(landing), 'the served landing package is the audit cwd');
    assert.ok(npmCall.args.includes('--omit=dev'), 'only production dependencies are audited');
    const result = posts.filter((m) => m.type === 'lp-security-result').pop();
    assert.strictEqual(result.coverage.complete, true);
    assert.deepStrictEqual(Array.from(result.coverage.packageRoots, (p) => p.root), ['landing']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Security dependency audit canonicalises aliases so one physical package cannot double badge/findings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-package-alias-'));
  const landing = path.join(root, 'landing');
  const alias = path.join(root, 'landing-alias');
  fs.mkdirSync(landing, { recursive: true });
  fs.writeFileSync(path.join(landing, 'package.json'), '{"name":"site","private":true}', 'utf8');
  fs.writeFileSync(path.join(landing, 'package-lock.json'), '{"name":"site","lockfileVersion":3,"packages":{}}', 'utf8');
  fs.symlinkSync(landing, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const auditJson = JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      next: { name: 'next', severity: 'high', via: [{ title: 'Next advisory' }], range: '<15.5.18', fixAvailable: true },
      'fast-uri': { name: 'fast-uri', severity: 'high', via: [{ title: 'fast-uri advisory' }], range: '<=3.1.1', fixAvailable: true },
    },
    metadata: { vulnerabilities: { critical: 0, high: 2, moderate: 0, low: 0, info: 0, total: 2 } },
  });
  const auditCalls = [];
  const cp = { spawnSync: (_cmd, args, options) => {
    if (Array.isArray(args) && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
    if (Array.isArray(args) && args[0] === 'audit') auditCalls.push(options && options.cwd);
    return { status: 1, stdout: auditJson, stderr: '' };
  } };
  try {
    const Panel = loadPanelClass({ childProcess: cp });
    const inst = Object.create(Panel.prototype);
    inst._servedRoot = landing;
    inst._selection = { file: 'landing-alias/page.tsx' };
    inst._resolveContainedFile = () => path.join(alias, 'page.tsx');
    const discovered = inst._securityPackageRoots(root);
    assert.strictEqual(discovered.roots.length, 1, 'realpath/junction aliases collapse during scope discovery');

    const result = inst._auditProductionPackages(root, { roots: [landing, alias], overflow: false });
    assert.strictEqual(auditCalls.length, 1, 'defense-in-depth de-duplication runs npm audit once per physical package');
    assert.strictEqual(result.counts.high, 2, 'metadata is not doubled to four highs');
    assert.deepStrictEqual(Array.from(result.top, (row) => row.name), ['next', 'fast-uri'], 'each npm finding appears exactly once');
    assert.strictEqual(result.packages.length, 1, 'coverage reports one physical package root');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Security package canonicalisation never follows an in-workspace alias to a package outside the workspace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-package-contained-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-package-outside-'));
  const alias = path.join(root, 'outside-alias');
  fs.writeFileSync(path.join(outside, 'package.json'), '{"name":"outside","private":true}', 'utf8');
  fs.symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const cp = { spawnSync: (_cmd, args) => Array.isArray(args) && args[0] === 'status'
    ? { status: 0, stdout: '', stderr: '' }
    : { status: 0, stdout: '', stderr: '' } };
  try {
    const Panel = loadPanelClass({ childProcess: cp, hostExtra: { parsePorcelain: () => [] } });
    const inst = Object.create(Panel.prototype);
    inst._servedRoot = alias;
    const scope = inst._securityPackageRoots(root);
    assert.deepStrictEqual(Array.from(scope.roots), [], 'realpath containment rejects the external package before npm can run');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('Security dirty scope includes both NEW and OLD paths of a porcelain rename', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-rename-scope-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"site","private":true}', 'utf8');
  const rawStatus = 'R  src/new name.ts\0src/old name.ts\0';
  const cp = { spawnSync: (_cmd, args) => Array.isArray(args) && args[0] === 'status'
    ? { status: 0, stdout: rawStatus, stderr: '' }
    : { status: 0, stdout: '', stderr: '' } };
  try {
    const Panel = loadPanelClass({ childProcess: cp, hostExtra: { parsePorcelain: require('./host-extra.js').parsePorcelain } });
    const inst = Object.create(Panel.prototype);
    inst._servedRoot = root;
    const scope = inst._securityPackageRoots(root);
    const dirty = Array.from(scope.dirtyFiles, (abs) => path.relative(root, abs).split(path.sep).join('/'));
    assert.deepStrictEqual(dirty, ['src/new name.ts', 'src/old name.ts']);
    assert.strictEqual(scope.gitScopeOk, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Security fingerprint includes package locks, so a dependency change makes the scan stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-lock-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}', 'utf8');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}', 'utf8');
    const Panel = loadPanelClass();
    const inst = Object.create(Panel.prototype);
    const before = inst._fingerprintOf(inst._walkScanFiles(root).files);
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"node_modules/x":{"version":"1.0.0"}}}', 'utf8');
    const after = inst._fingerprintOf(inst._walkScanFiles(root).files);
    assert.notStrictEqual(after, before, 'package-lock bytes are part of freshness');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Security lease fingerprints and scans dirty JSON/YAML/hidden workflow paths accepted by Publish', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-config-'));
  try {
    const files = [
      ['landing/vercel.json', '{"API_KEY":"literal-production-secret-123"}\n'],
      ['.github/workflows/deploy.yml', 'env:\n  API_KEY: literal-workflow-secret-456\n'],
    ];
    for (const [rel, content] of files) {
      const abs = path.join(root, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content, 'utf8');
    }
    const Panel = loadPanelClass();
    const inst = Object.create(Panel.prototype);
    const explicit = files.map(([rel]) => path.join(root, rel));
    const walked = inst._walkScanFiles(root, [path.join(root, 'landing')], explicit);
    const paths = walked.files.map((f) => f.path);
    assert.ok(paths.includes('landing/vercel.json'), 'vercel.json is part of the leased bytes');
    assert.ok(paths.includes('.github/workflows/deploy.yml'), 'a dirty hidden workflow is force-included');
    const findings = require('./lp-secret-scan.js').scanSecrets(walked.files);
    assert.ok(findings.some((f) => f.path === 'landing/vercel.json'), 'dirty JSON is statically scanned, not fingerprint-only');
    assert.ok(findings.some((f) => f.path === '.github/workflows/deploy.yml'), 'dirty YAML is statically scanned too');

    const before = inst._fingerprintOf(walked.files);
    fs.writeFileSync(path.join(root, 'landing/vercel.json'), '{"API_KEY":"changed-production-secret-999"}\n', 'utf8');
    const after = inst._fingerprintOf(inst._walkScanFiles(root, [path.join(root, 'landing')], explicit).files);
    assert.notStrictEqual(after, before, 'a config byte change invalidates the Security lease');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Security lease fingerprints dirty test fixtures without reporting their deliberate fake credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-test-fixture-'));
  try {
    const rel = 'src/scanner.test.js';
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'const fake = "' + FAKE_AWS + '";\n', 'utf8');
    const Panel = loadPanelClass();
    const inst = Object.create(Panel.prototype);
    const walked = inst._walkScanFiles(root, [root], [abs]);
    const fixture = walked.files.find((f) => f.path === rel);
    assert.ok(fixture, 'a dirty test remains in the publish freshness lease');
    assert.strictEqual(fixture.scannedText, false, 'test fixture text is not treated as shipped production code');
    assert.strictEqual(require('./lp-secret-scan.js').scanSecrets(walked.files).length, 0, 'deliberate fake scanner credentials do not create false Criticals');
    const before = inst._fingerprintOf(walked.files);
    fs.appendFileSync(abs, '// changed\n', 'utf8');
    const after = inst._fingerprintOf(inst._walkScanFiles(root, [root], [abs]).files);
    assert.notStrictEqual(after, before, 'test fixture bytes still invalidate a prior Security lease');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Security lease fails closed when the CURRENT re-walk is truncated or unreadable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-current-'));
  try {
    const Panel = loadPanelClass();
    const inst = Object.create(Panel.prototype);
    inst._wsRoot = () => root;
    inst._securityPackageRoots = () => ({ roots: [root], dirtyFiles: [], overflow: false, gitScopeOk: true });
    inst._walkScanFiles = () => ({ files: [{ path: 'a.js', content: 'ok' }], truncated: true, skippedUnreadable: 0 });
    assert.strictEqual(inst._scanFingerprint(), null, 'a newly truncated walk can never preserve a green fingerprint');
    inst._walkScanFiles = () => ({ files: [{ path: 'a.js', content: 'ok' }], truncated: false, skippedUnreadable: 1 });
    assert.strictEqual(inst._scanFingerprint(), null, 'a newly unreadable path can never preserve a green fingerprint');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Security Review reports incomplete instead of false-green when Git scope discovery fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-git-scope-'));
  const landing = path.join(root, 'landing'); fs.mkdirSync(landing, { recursive: true });
  fs.writeFileSync(path.join(landing, 'package.json'), '{"name":"site","private":true}', 'utf8');
  fs.writeFileSync(path.join(landing, 'package-lock.json'), '{"name":"site","lockfileVersion":3,"packages":{}}', 'utf8');
  const auditJson = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 } } });
  const cp = { spawnSync: (_cmd, args) => Array.isArray(args) && args[0] === 'status'
    ? { status: 128, stdout: '', stderr: 'not a git repository' }
    : { status: 0, stdout: auditJson, stderr: '' } };
  try {
    const Panel = loadPanelClass({ childProcess: cp });
    const posts = [];
    const inst = Object.create(Panel.prototype);
    inst.token = 'T'; inst._wsRoot = () => root; inst._servedRoot = landing;
    inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
    inst._securityScan();
    const result = posts.filter((m) => m.type === 'lp-security-result').pop();
    assert.strictEqual(result.coverage.gitScope, false);
    assert.strictEqual(result.coverage.complete, false, 'missing dirty-path discovery is fail-closed');
    assert.strictEqual(inst._securityRun.state, 'incomplete');
    assert.match(inst._securityRun.label, /Publish bloqueado/);
    assert.ok(!result.thread.some((t) => /concluído sem findings/i.test(t.text)), 'partial coverage never says clean');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Security dependency remediation applies only a compatible temp-solved lock proposal, then stales Review', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sec-npm-fix-'));
  const manifest = path.join(root, 'package.json');
  const lock = path.join(root, 'package-lock.json');
  fs.writeFileSync(manifest, '{"name":"site","private":true}', 'utf8');
  fs.writeFileSync(lock, '{"name":"site","lockfileVersion":3,"packages":{}}', 'utf8');
  try {
    const Panel = loadPanelClass();
    const posts = [], undo = [];
    const inst = Object.create(Panel.prototype);
    inst.token = 'T'; inst._wsRoot = () => root; inst._treeGateBlocked = () => false;
    inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
    inst._indexSecurityFindings({
      secrets: [], xss: [], csp: { hasCsp: true, findings: [] },
      audit: { ok: true, top: [{ name: 'next', severity: 'high', fixAvailable: true, packageRoot: '.' }] },
    }, root, null);
    const findingId = Array.from(inst._securityFindings.keys())[0];
    inst._lastSecurity = { fingerprint: 'FP' }; inst._securityRun = { state: 'complete', counts: { critical: 1, warning: 0, info: 0, total: 1 } };
    inst._scanFingerprint = () => 'FP';
    inst._pushUndo = (...args) => undo.push(args);
    inst._securityNpmFixRunner = async (temp) => {
      assert.strictEqual(fs.readFileSync(lock, 'utf8'), '{"name":"site","lockfileVersion":3,"packages":{}}', 'the real lock stays untouched while npm solves in temp');
      fs.writeFileSync(path.join(temp, 'package-lock.json'), '{"name":"site","lockfileVersion":3,"packages":{"node_modules/next":{"version":"15.5.8"}}}', 'utf8');
      return { error: null, stdout: '{}', stderr: '' };
    };
    await inst._securityFix({ findingId });
    assert.match(fs.readFileSync(lock, 'utf8'), /15\.5\.8/, 'only the reviewed compatible proposal is copied back');
    assert.strictEqual(fs.readFileSync(manifest, 'utf8'), '{"name":"site","private":true}', 'package.json remains byte-identical when npm proposed no change');
    assert.strictEqual(undo.length, 1, 'the lock change is reversible through the existing sha-guarded feed');
    assert.strictEqual(inst._securityRun.state, 'stale', 'any dependency write invalidates the prior Review');
    assert.ok(inst._securityThread.some((t) => /Review Security novamente/.test(t.text)), 'the Review thread explains the mandatory next step');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
