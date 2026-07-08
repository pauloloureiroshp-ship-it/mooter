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

function loadPanelClass() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  // The 4 scanners must be the REAL modules so _securityScan actually detects; everything else
  // (fs, child_process) is a Node builtin → real via realReq; other ./-relative modules are mocked.
  const REAL = ['./lp-secret-scan.js', './lp-xss-scan.js', './lp-csp-check.js', './lp-audit-summary.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
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

function runScan(root) {
  const Panel = loadPanelClass();
  assert.ok(Panel, 'LivePreviewPanel class loaded');
  let posted = null;
  const fakeThis = {
    token: 'HTOK',
    _wsRoot: () => root,
    panel: { webview: { postMessage: (mIn) => { posted = mIn; } } },
  };
  Panel.prototype._securityScan.call(fakeThis);
  return posted;
}

test('LP-5 _securityScan: finds shipped secrets/xss/csp; SKIPS test files + fixtures', () => {
  const root = mkWorkspace();
  try {
    const r = runScan(root);
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
