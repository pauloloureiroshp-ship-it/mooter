'use strict';
// lp-p1a-w2.test.js — P1-A regression AFTER Wave W2. The LP-4 review found an RCE: the cloud
// bridge import()ed the Agent SDK from a WORKSPACE-CONTROLLED path, so a malicious workspace in
// Restricted Mode could run code with the user's plan credentials. Fix = gate every SDK-import
// path behind vscode.workspace.isTrusted. W2 moved @anthropic-ai/claude-agent-sdk into the ROOT
// package.json devDependency and the runner resolves it from the workspace — so this re-pins the
// three invariants that must survive that move (adversarially re-verified: 3 attackers, BLOCKED,
// 0 exploitable): (1) an untrusted workspace NEVER resolves/imports the SDK; (2) the SDK dir is
// ONLY ever wsRoot-derived (never an arbitrary/injected path); (3) the extension never bundles the
// SDK and the manifest is honest about the trust requirement.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const LEC = require('./live-edit-cloud.js');

test('P1-A/W2: an untrusted workspace NEVER resolves the SDK — bridgeStatus refuses before any fs probe', () => {
  const r = LEC.bridgeStatus('C:/anything', { trusted: false });
  assert.strictEqual(r.available, false, 'untrusted → bridge unavailable');
  // 'workspace-untrusted' (not 'sdk-bridge-missing') proves it short-circuited BEFORE probing the fs.
  assert.strictEqual(r.reason, 'workspace-untrusted', 'refused on trust, never on a filesystem probe');
});

test('P1-A/W2: the SDK dir is ONLY ever wsRoot-derived — no arbitrary/injected path can reach import()', () => {
  const ws = process.platform === 'win32' ? 'C:\\ws' : '/ws';
  const cands = LEC.sdkDirCandidates(ws);
  assert.ok(Array.isArray(cands) && cands.length > 0, 'a real wsRoot yields candidates');
  for (const c of cands) {
    assert.strictEqual(c.indexOf(ws), 0, 'every candidate is under wsRoot: ' + c);
    assert.ok(c.indexOf('@anthropic-ai') !== -1 && c.indexOf('claude-agent-sdk') !== -1, 'resolves the SDK package, nothing else');
  }
  assert.deepStrictEqual(LEC.sdkDirCandidates(''), [], 'empty wsRoot → no candidates (never a bare/relative path)');
  assert.deepStrictEqual(LEC.sdkDirCandidates(null), [], 'null wsRoot → no candidates');
});

test('P1-A/W2: the extension never BUNDLES the SDK, and the manifest is honest about the trust requirement', () => {
  const extRoot = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(extRoot, 'package.json'), 'utf8'));
  assert.ok(!(pkg.dependencies && pkg.dependencies['@anthropic-ai/claude-agent-sdk']),
    'the Agent SDK is NOT a bundled extension dependency — it is resolved from the workspace at edit time');
  const cap = pkg.capabilities && pkg.capabilities.untrustedWorkspaces;
  assert.ok(cap && typeof cap.description === 'string', 'manifest declares the untrustedWorkspaces capability');
  assert.ok(/trust the workspace/i.test(cap.description), 'manifest is honest: the Agent SDK runs only when you trust the workspace');
});
