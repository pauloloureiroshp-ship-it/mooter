'use strict';
/**
 * graders.selftest.js — proves the grader stack BITES. A grader that can only ever return "pass" is
 * worthless (Demystifying-evals: "graders resistant to bypasses"). Each case below feeds a crafted
 * context that SHOULD fail and asserts the grader reports fail — and a matching one that should pass.
 * Run: node --test tools/eval/graders.selftest.js  (from repo root or with cwd on packages/vscode-extension)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const stateCheck = require('./graders/state-check');
const toolCalls = require('./graders/tool-calls');
const deterministic = require('./graders/deterministic-tests');
const staticAnalysis = require('./graders/static-analysis');

const SBX = path.join('C:', 'sbx-root');
const FILE = path.join(SBX, 'x.tsx');

test('state_check refuse: passes on a true refusal, FAILS if the engine actually wrote', () => {
  const task = { expect: { outcome: 'refuse', reason: 'dynamic-classname' } };
  const good = stateCheck.grade({ task, before: 'A', after: 'A', engineResult: { ok: false, reason: 'dynamic-classname' } });
  assert.strictEqual(good.status, 'pass');
  // wrote despite claiming refusal → must fail (this is the P0-1 class of bug)
  const wrote = stateCheck.grade({ task, before: 'A', after: 'B', engineResult: { ok: false, reason: 'dynamic-classname' } });
  assert.strictEqual(wrote.status, 'fail');
  // right refusal shape but wrong reason → must fail
  const wrongReason = stateCheck.grade({ task, before: 'A', after: 'A', engineResult: { ok: false, reason: 'not-found' } });
  assert.strictEqual(wrongReason.status, 'fail');
});

test('state_check apply: FAILS when the required change is absent from the final file', () => {
  const task = { expect: { outcome: 'apply', assert: [{ type: 'contains', value: 'NEW' }] } };
  const pass = stateCheck.grade({ task, before: 'old', after: 'NEW', engineResult: { ok: true, code: 'NEW' } });
  assert.strictEqual(pass.status, 'pass');
  const miss = stateCheck.grade({ task, before: 'old', after: 'still-old', engineResult: { ok: true, code: 'still-old' } });
  assert.strictEqual(miss.status, 'fail');
  // engine claims ok but produced nothing / no write → fail
  const noWrite = stateCheck.grade({ task, before: 'old', after: 'old', engineResult: { ok: true, code: 'old' } });
  assert.strictEqual(noWrite.status, 'fail');
});

test('state_check crlf_preserved: FAILS when a bare LF leaked (line endings normalized)', () => {
  const task = { expect: { outcome: 'apply', assert: [{ type: 'crlf_preserved' }] } };
  const ok = stateCheck.grade({ task, before: 'a\r\nb\r\n', after: 'a\r\nX\r\n', engineResult: { ok: true, code: 'x' } });
  assert.strictEqual(ok.status, 'pass');
  const leaked = stateCheck.grade({ task, before: 'a\r\nb\r\n', after: 'a\nX\n', engineResult: { ok: true, code: 'x' } });
  assert.strictEqual(leaked.status, 'fail');
});

test('tool_calls: FAILS when a write escapes the sandbox (P0-1 wrong-tree class)', () => {
  const task = { expect: { outcome: 'apply' } };
  const inside = toolCalls.grade({
    task, sandboxRoot: SBX, sandboxFile: FILE,
    toolCalls: [{ primitive: 'applyDeterministicEdit', writePath: FILE, wrote: true }],
  });
  assert.strictEqual(inside.status, 'pass');
  const escaped = toolCalls.grade({
    task, sandboxRoot: SBX, sandboxFile: FILE,
    toolCalls: [{ primitive: 'applyDeterministicEdit', writePath: path.join('C:', 'elsewhere', 'y.tsx'), wrote: true }],
  });
  assert.strictEqual(escaped.status, 'fail');
});

test('tool_calls: FAILS when a refusal nonetheless recorded a write', () => {
  const task = { expect: { outcome: 'refuse', reason: 'x' } };
  const bad = toolCalls.grade({
    task, sandboxRoot: SBX, sandboxFile: FILE,
    toolCalls: [{ primitive: 'deleteNode', writePath: FILE, wrote: true }],
  });
  assert.strictEqual(bad.status, 'fail');
  const good = toolCalls.grade({
    task, sandboxRoot: SBX, sandboxFile: FILE,
    toolCalls: [{ primitive: 'deleteNode', writePath: FILE, wrote: false }],
  });
  assert.strictEqual(good.status, 'pass');
});

test('deterministic_tests + static_analysis: FAIL when the final file no longer parses', () => {
  const task = { expect: { outcome: 'apply' } };
  const goodDet = deterministic.grade({ task, after: 'const a = <div>x</div>;\n' });
  assert.strictEqual(goodDet.status, 'pass');
  const badDet = deterministic.grade({ task, after: 'const a = <div className=;\n' });
  assert.strictEqual(badDet.status, 'fail');
  const goodStatic = staticAnalysis.grade({ task, after: 'const a = <div>x</div>;\n' });
  assert.strictEqual(goodStatic.status, 'pass');
  const badStatic = staticAnalysis.grade({ task, after: 'const a = <div className=;\n' });
  assert.strictEqual(badStatic.status, 'fail');
});
