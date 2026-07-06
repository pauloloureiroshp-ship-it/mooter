'use strict';
// live-edit-packaging.test.js — WAVE LP-3.2 repro. In the dev worktree require('@babel/parser')
// resolves via a node_modules somewhere up the tree, so the whole suite stays green while the
// INSTALLED extension (~/.vscode/extensions, no node_modules shipped in the vsix) is broken:
// every deterministic edit dies as a fake "parse error". This test simulates the installed
// layout — the engine copied to a directory with NO reachable @babel/parser — and pins the
// fail-soft contract that layout must honour: require fails, the module still loads, and
// applyDeterministicEdit answers {ok:false, reason:'parse-error', detail:'parser-unavailable'}
// (the detail the honest UI keys on) instead of throwing.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

test('installed layout (no ancestral node_modules): require fails → honest parser-unavailable', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lea-pkg-'));
  try {
    fs.copyFileSync(path.join(__dirname, 'live-edit-ast.js'), path.join(dir, 'live-edit-ast.js'));
    const probe = [
      "let resolvable = true;",
      "try { require.resolve('@babel/parser'); } catch { resolvable = false; }",
      "const lea = require('./live-edit-ast.js');",
      "const r = lea.applyDeterministicEdit('<div>Hi</div>', { line: 1, tag: 'div' }, { kind: 'text', value: 'Yo' });",
      "process.stdout.write(JSON.stringify({ resolvable, r }));",
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'probe.js'), probe, 'utf8');
    // Fresh node process cwd'd at the temp dir — module resolution walks tmp's ancestors only,
    // exactly like ~/.vscode/extensions does. NODE_PATH could still leak a parser in; the probe
    // reports resolvability so that machine skips instead of green-washing the repro.
    const out = spawnSync(process.execPath, ['probe.js'], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(out.status, 0, 'engine must fail SOFT, never crash the host: ' + out.stderr);
    const { resolvable, r } = JSON.parse(out.stdout);
    if (resolvable) { t.skip('ambient @babel/parser reachable from tmpdir — cannot simulate a clean install here'); return; }
    assert.strictEqual(r.ok, false, 'no fabricated success without a parser');
    assert.strictEqual(r.reason, 'parse-error');
    assert.strictEqual(r.detail, 'parser-unavailable', 'the detail the UI needs to say "reinstall" instead of blaming the file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The fix itself, pinned so it cannot silently regress: declaring the dependency is not enough —
// .vscodeignore's `node_modules/**` used to strip it from the vsix anyway. Both halves must hold.
test('vsix packaging contract: runtime dependency declared AND .vscodeignore re-includes it', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies && pkg.dependencies['@babel/parser'],
    '@babel/parser must be a RUNTIME dependency — vsce only packs production deps');
  const lines = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  const ignoreAll = lines.indexOf('node_modules/**');
  const reinclude = lines.indexOf('!node_modules/@babel/parser/**');
  assert.notStrictEqual(reinclude, -1,
    '.vscodeignore must re-include node_modules/@babel/parser or the installed extension ships without its edit engine');
  assert.ok(ignoreAll === -1 || reinclude > ignoreAll, 'the negation must come AFTER node_modules/** to win');
});

// ── Honest UI: the host must FORWARD the missing-parser signal, not collapse it into a generic
// "parse error" that blames the user's file. Same vm harness as lp-delete-host.test.js, but the
// engine is a stub playing the broken-install role.
function loadPanelClassWithEngine(engineStub) {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return mk(); if (name === './live-edit-ast.js') return engineStub; if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; the class binding survives */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

function mkWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lea-ui-'));
  fs.writeFileSync(path.join(root, 'page.tsx'), '<div>Hi</div>', 'utf8');
  return root;
}

function mkInstance(Panel, root) {
  const inst = Object.create(Panel.prototype);
  const posts = [];
  inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
  inst.token = 'tok';
  inst._wsRoot = () => root;
  return { inst, posts };
}

test('missing parser is forwarded as parser-unavailable on edit AND delete — never blamed on the file', async () => {
  const broken = { ok: false, reason: 'parse-error', detail: 'parser-unavailable' };
  const Panel = loadPanelClassWithEngine({ applyDeterministicEdit: () => broken, deleteNode: () => broken });
  assert.ok(Panel, 'LivePreviewPanel resolvable from the vm-loaded module');
  const root = mkWorkspace();
  try {
    const { inst, posts } = mkInstance(Panel, root);
    await inst._applyEdit({ file: 'page.tsx', line: 1, tag: 'div', edit: { kind: 'text', value: 'x' } });
    await inst._deleteNode({ preview: false, file: 'page.tsx', line: 1, tag: 'div', h: 'stamp' });
    const results = posts.filter((p) => p.type === 'lp-edit-result');
    assert.strictEqual(results.length, 2);
    for (const r of results) {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.reason, 'parser-unavailable', 'the panel must be able to say "reinstall", not "unparseable file"');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a REAL file parse error still reports parse-error — the reinstall message must not overreach', async () => {
  const Panel = loadPanelClassWithEngine({
    applyDeterministicEdit: () => ({ ok: false, reason: 'parse-error', detail: 'Unexpected token (1:5)' }),
  });
  const root = mkWorkspace();
  try {
    const { inst, posts } = mkInstance(Panel, root);
    await inst._applyEdit({ file: 'page.tsx', line: 1, tag: 'div', edit: { kind: 'text', value: 'x' } });
    const r = posts.find((p) => p.type === 'lp-edit-result');
    assert.ok(r && r.ok === false && r.reason === 'parse-error');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('panel copy distinguishes the two failures (reinstall vs unparseable file)', () => {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  assert.ok(code.includes("'parser-unavailable':'motor de edição indisponível — reinstala o plugin (dependência em falta)'"),
    'webview map must carry the reinstall message');
  assert.ok(code.includes("'parse-error':'não consegui interpretar o ficheiro'"),
    'webview map must keep the honest file-parse message');
});
