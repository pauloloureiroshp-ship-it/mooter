'use strict';
// live-edit-cloud.test.js — LP-4 §2 contract: the subscription escalation bridge. Proven against
// the REAL runner process (spawned exactly like the host does) loading a FAKE Agent SDK planted in
// a temp workspace — so the whole chain (bridge discovery → spawn → stdin protocol → SDK import via
// its exports map → prompt privacy → one-line JSON verdict) runs end-to-end with zero cloud calls.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LEC = require('./live-edit-cloud.js');

const NODE = '<img src="/moo.png" alt="moo" />';

// Plant a fake @anthropic-ai/claude-agent-sdk in <root>/node_modules. `mode`:
//  'ok'   — real-looking exports map; query() records what it saw (spy.json) and answers.
//  'hang' — main-style entry; query() never yields (drives the host timeout path).
function plantFakeSdk(root, mode) {
  const dir = path.join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
  fs.mkdirSync(dir, { recursive: true });
  const pkg = (mode === 'ok')
    ? { name: '@anthropic-ai/claude-agent-sdk', version: '0.0.0-fake', type: 'module', exports: { '.': { import: './index.mjs' } } }
    : { name: '@anthropic-ai/claude-agent-sdk', version: '0.0.0-fake', type: 'module', main: 'index.mjs' };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg), 'utf8');
  const body = (mode === 'ok')
    ? [
      "import { writeFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      'export async function* query({ prompt, options }) {',
      "  const here = dirname(fileURLToPath(import.meta.url));",
      "  writeFileSync(join(here, 'spy.json'), JSON.stringify({ prompt, model: options && options.model, cwd: options && options.cwd, maxTurns: options && options.maxTurns, hasCanUseTool: typeof (options && options.canUseTool) === 'function' }));",
      "  yield { type: 'assistant', message: { content: [{ type: 'text', text: '<img className=\"rounded-xl border\" />' }] } };",
      "  yield { result: '<img className=\"rounded-xl border\" />' };",
      '}',
    ].join('\n')
    : [
      'export async function* query() {',
      '  // a live timer keeps the child alive (like a real SDK stuck on the network) — the host',
      '  // timeout must fire and kill us.',
      '  await new Promise((r) => setTimeout(r, 3600 * 1000));',
      '}',
    ].join('\n');
  fs.writeFileSync(path.join(dir, 'index.mjs'), body, 'utf8');
  return dir;
}

test('bridge discovery is honest: absent SDK → sdk-bridge-missing; planted SDK → available + dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lec-br-'));
  try {
    assert.deepStrictEqual(LEC.bridgeStatus(root), { available: false, reason: 'sdk-bridge-missing' });
    assert.deepStrictEqual(LEC.bridgeStatus(null), { available: false, reason: 'sdk-bridge-missing' });
    const dir = plantFakeSdk(root, 'ok');
    const st = LEC.bridgeStatus(root);
    assert.strictEqual(st.available, true);
    assert.strictEqual(st.dir, dir);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('review P1-A: an untrusted workspace disables the bridge and NEVER spawns the runner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lec-trust-'));
  try {
    plantFakeSdk(root, 'ok'); // SDK IS present — trust, not discovery, must be the blocker
    // bridgeStatus reports the honest reason.
    assert.deepStrictEqual(LEC.bridgeStatus(root, { trusted: false }), { available: false, reason: 'workspace-untrusted' });
    // and still available when trusted (or when no signal is passed — a unit harness).
    assert.strictEqual(LEC.bridgeStatus(root, { trusted: true }).available, true);
    assert.strictEqual(LEC.bridgeStatus(root).available, true);
    // rewriteElementCloud refuses on trusted:false BEFORE any spawn — inject a runner that would
    // throw if ever launched, to prove the runner path is never reached.
    const r = await LEC.rewriteElementCloud(
      { nodeSource: NODE, prompt: 'x', tier: 't2' },
      { wsRoot: root, trusted: false, runner: path.join(root, 'this-runner-must-never-launch.mjs') },
    );
    assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'workspace-untrusted' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('tier ladder: cloud tiers map to subscription ids; @fable exists but only via the explicit tier; junk tier refused', async () => {
  assert.strictEqual(LEC.TIER_MODEL.t2, 'claude-sonnet-4-6');
  assert.strictEqual(LEC.TIER_MODEL.t3, 'claude-opus-4-6');
  assert.strictEqual(LEC.TIER_MODEL.fable, 'claude-fable-5');
  const r = await LEC.rewriteElementCloud({ nodeSource: NODE, prompt: 'x', tier: 't9' }, { bridge: { available: true, dir: 'x' } });
  assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'bad-request' });
});

test('missing bridge short-circuits BEFORE any spawn — honest disabled state, no zombie processes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lec-none-'));
  try {
    const r = await LEC.rewriteElementCloud({ nodeSource: NODE, prompt: 'x', tier: 't2' }, { wsRoot: root });
    assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'sdk-bridge-missing' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('end-to-end via the REAL runner + fake SDK: verdict returned, prompt carries ONLY subtree+instruction, tools denied, cwd is a tmp dir', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lec-e2e-'));
  try {
    const sdkDir = plantFakeSdk(root, 'ok');
    const r = await LEC.rewriteElementCloud(
      { nodeSource: NODE, prompt: 'põe cantos redondos e borda fina', file: 'C:/ws/landing/app/page.tsx', line: 12, tier: 't2' },
      { wsRoot: root, timeoutMs: 20000 },
    );
    assert.strictEqual(r.ok, true, 'runner verdict ok: ' + JSON.stringify(r));
    assert.strictEqual(r.text, '<img className="rounded-xl border" />');
    const spy = JSON.parse(fs.readFileSync(path.join(sdkDir, 'spy.json'), 'utf8'));
    assert.strictEqual(spy.model, 'claude-sonnet-4-6', 'tier t2 → Sonnet');
    assert.ok(spy.prompt.includes(NODE), 'the model sees the subtree');
    assert.ok(spy.prompt.includes('põe cantos redondos'), 'the model sees the instruction');
    assert.ok(!spy.prompt.includes('export default'), 'NEVER the whole file — only the subtree');
    assert.strictEqual(spy.maxTurns, 1, 'one turn — a rewrite, not an agent');
    assert.strictEqual(spy.hasCanUseTool, true, 'every tool call is denied via canUseTool');
    const tmp = fs.realpathSync(os.tmpdir()).toLowerCase();
    assert.ok(fs.realpathSync(spy.cwd).toLowerCase().startsWith(tmp), 'session cwd is a temp dir, never the repo');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('hanging cloud model → host timeout kills the runner and reports cloud-model-timeout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lec-hang-'));
  try {
    plantFakeSdk(root, 'hang');
    const r = await LEC.rewriteElementCloud(
      { nodeSource: NODE, prompt: 'x', tier: 't3' },
      { wsRoot: root, timeoutMs: 1500 },
    );
    assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'cloud-model-timeout' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
