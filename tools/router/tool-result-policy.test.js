'use strict';

// Wave 63 GAP 6 — deterministic tool-result compression policy. node:test.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toolResultPolicy, isDiscardable, POLICY } = require('./tool-result-policy.js');

test('mutation confirmations + ephemeral state are droppable', () => {
  for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'TodoWrite']) {
    assert.equal(toolResultPolicy(t).strategy, 'drop', `${t} → drop`);
    assert.equal(isDiscardable(t), true);
  }
});

test('re-derivable readers summarize (high compressibility)', () => {
  for (const t of ['Read', 'Glob', 'Grep', 'NotebookRead']) {
    const p = toolResultPolicy(t);
    assert.equal(p.strategy, 'summarize');
    assert.equal(p.compressibility, 'high');
  }
});

test('verbose exec + external snapshots summarize (medium)', () => {
  for (const t of ['Bash', 'PowerShell', 'WebFetch', 'WebSearch']) {
    const p = toolResultPolicy(t);
    assert.equal(p.strategy, 'summarize');
    assert.equal(p.compressibility, 'medium');
  }
});

test('synthesized conclusions are kept (low compressibility)', () => {
  for (const t of ['Task', 'Agent']) {
    const p = toolResultPolicy(t);
    assert.equal(p.strategy, 'keep');
    assert.equal(p.compressibility, 'low');
    assert.equal(isDiscardable(t), false);
  }
});

test('unknown / MCP tools are conservative — keep, never drop', () => {
  for (const t of ['mcp__claude_ai_Notion__notion-fetch', 'SomeFutureTool', '', null, undefined]) {
    const p = toolResultPolicy(t);
    assert.equal(p.strategy, 'keep', `${t} → keep`);
    assert.equal(isDiscardable(t), false);
  }
  assert.equal(toolResultPolicy(undefined).tool, 'unknown');
});

test('case-insensitive; every result is advisory and well-formed', () => {
  assert.deepEqual(toolResultPolicy('rEaD'), toolResultPolicy('read'));
  for (const t of [...Object.keys(POLICY), 'unknown']) {
    const p = toolResultPolicy(t);
    assert.equal(p.advisory, true);
    assert.ok(['high', 'medium', 'low'].includes(p.compressibility));
    assert.ok(['drop', 'summarize', 'keep'].includes(p.strategy));
    assert.ok(typeof p.reason === 'string' && p.reason.length > 0);
  }
});

test('never drops a result it cannot re-derive (drop ⊂ {mutation, ephemeral})', () => {
  // Safety invariant: only confirmations / superseded state are droppable.
  const droppable = Object.keys(POLICY).filter((t) => POLICY[t].strategy === 'drop');
  assert.deepEqual(droppable.sort(), ['edit', 'multiedit', 'notebookedit', 'todowrite', 'write'].sort());
});
