'use strict';
// lp-context-wire.test.js — Context Engine Wave 2.2 WIRING. Proves runAnchoredTask (live-edit-task.js)
// computes the $0-local context pack from the real workspace + pins it into the runner's stdin payload,
// and that the opt-out works. Uses an INJECTED fake runner (opts.runner) that echoes what it received —
// no SDK, no network, no cloud.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LET = require('./live-edit-task.js');

function mkRepo(files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lecw-')));
  for (const rel of Object.keys(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel], 'utf8');
  }
  return root;
}

// A fake runner: reads the stdin JSON the host sends and emits ONE verdict line that echoes the
// contextPack back verbatim (as _cp). All assertions live in the test (clean escaping). This mirrors
// the exact contract live-edit-task.js expects from the real runner.
function mkFakeRunner() {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lecw-run-')), 'fake-runner.js');
  fs.writeFileSync(p, [
    "let b='';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', function (c) { b += c; });",
    "process.stdin.on('end', function () {",
    "  var j = {}; try { j = JSON.parse(b); } catch (e) {}",
    "  var cp = typeof j.contextPack === 'string' ? j.contextPack : '';",
    "  process.stdout.write(JSON.stringify({ ok: true, kind: 'answer', text: '', filesRead: [], edits: [], denied: [], model: j.model, _cp: cp }) + '\\n');",
    "});",
  ].join('\n'), 'utf8');
  return p;
}

const BASE = (root, runner, extra) => Object.assign({
  trusted: true, wsRoot: root, runner, bridge: { available: true, dir: root }, timeoutMs: 8000,
}, extra || {});

const hasAbsPath = (s) => /[A-Za-z]:[\\/]/.test(s) || /(^|[\s(])\/(Users|home)\//.test(s);

test('wiring: host computes the context pack from the workspace and pins it into the runner payload', async () => {
  const root = mkRepo({
    'app/page.tsx': "import Hero from './Hero';\nexport default function Page(){ return <Hero/>; }",
    'app/Hero.tsx': "export default function Hero(){ return null; }",
    'lib/util.ts': "export const U = 1;",
  });
  const r = await LET.runAnchoredTask({ instruction: 'valida os números', file: 'app/page.tsx', tag: 'section' }, BASE(root, mkFakeRunner()));
  assert.strictEqual(r.ok, true, 'verdict ok');
  assert.ok(typeof r._cp === 'string' && r._cp.length > 0, 'contextPack is non-empty for a real anchor');
  assert.ok(r._cp.includes('Ficheiros ligados'), 'the pack carries the import slice');
  assert.ok(r._cp.includes('Repo-map'), 'the pack carries the repo-map');
  assert.ok(r._cp.includes('app/page.tsx') && r._cp.includes('app/Hero.tsx'), 'slice names the anchor + its import');
  assert.ok(!hasAbsPath(r._cp), 'the pack contains NO absolute path (workspace-relative only — no leak)');
});

test('wiring: contextEngine.enabled=false → no pack computed (opt-out honoured)', async () => {
  const root = mkRepo({ 'app/page.tsx': "export default function P(){}" });
  const r = await LET.runAnchoredTask(
    { instruction: 'x', file: 'app/page.tsx' },
    BASE(root, mkFakeRunner(), { contextEngine: { enabled: false } }),
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r._cp, '', 'disabled → empty pack');
});

test('wiring: no anchor file → empty pack, task still runs (fail-soft)', async () => {
  const root = mkRepo({ 'app/page.tsx': "export default function P(){}" });
  const r = await LET.runAnchoredTask({ instruction: 'x' }, BASE(root, mkFakeRunner()));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r._cp, '', 'no anchor → empty pack, still runs');
});
