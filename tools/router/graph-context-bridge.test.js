'use strict';
// Wave 61 Block 2 — graph-context-bridge breadcrumb tests. Hermetic: pure
// buildSnapshot with injected `now`; temp pointer path for set/read/clear; a
// broken/garbage pointer must never throw (best-effort contract).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mod = require('./graph-context-bridge.js');
const { buildSnapshot, setGraphContext, clearGraphContext, readGraphContext, pointerPath } = mod;

const NOW = 1_700_000_000_000;
const tmp = (sfx) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-graph-')), sfx);

// ── buildSnapshot (pure) ──────────────────────────────────────────────────────

test('buildSnapshot: valid context → normalised snapshot (counts only)', () => {
  const s = buildSnapshot({ repo: '  myrepo  ', nodes: '951', edges: 1800 }, NOW);
  assert.deepEqual(s, { repo: 'myrepo', nodes: 951, resolved: true, ts: NOW, edges: 1800 });
});

test('buildSnapshot: resolved defaults true; explicit false honoured', () => {
  assert.equal(buildSnapshot({ repo: 'r', nodes: 1 }, NOW).resolved, true);
  assert.equal(buildSnapshot({ repo: 'r', nodes: 1, resolved: false }, NOW).resolved, false);
});

test('buildSnapshot: missing repo or nodes → null (no honest signal)', () => {
  assert.equal(buildSnapshot({ nodes: 10 }, NOW), null);
  assert.equal(buildSnapshot({ repo: 'r' }, NOW), null);
  assert.equal(buildSnapshot({ repo: '   ', nodes: 10 }, NOW), null);
  assert.equal(buildSnapshot({ repo: 'r', nodes: -1 }, NOW), null);
  assert.equal(buildSnapshot({ repo: 'r', nodes: 'abc' }, NOW), null);
  assert.equal(buildSnapshot(null, NOW), null);
});

test('buildSnapshot: edges omitted when not a valid count', () => {
  const s = buildSnapshot({ repo: 'r', nodes: 5, edges: 'x' }, NOW);
  assert.equal('edges' in s, false);
});

// ── set / read / clear roundtrip (temp pointer) ───────────────────────────────

test('setGraphContext → readGraphContext roundtrip via temp pointer', () => {
  const p = tmp('active-graph.json');
  assert.equal(setGraphContext({ repo: 'myrepo', nodes: 951, edges: 1800 }, { pointerPath: p, now: NOW }), true);
  const got = readGraphContext({ pointerPath: p });
  assert.deepEqual(got, { repo: 'myrepo', nodes: 951, resolved: true, ts: NOW, edges: 1800 });
});

test('setGraphContext: nothing to record → false, writes no file', () => {
  const p = tmp('none.json');
  assert.equal(setGraphContext({ repo: 'r' }, { pointerPath: p, now: NOW }), false);
  assert.equal(fs.existsSync(p), false);
});

test('clearGraphContext: removes the breadcrumb; absent file → still true', () => {
  const p = tmp('clear.json');
  setGraphContext({ repo: 'r', nodes: 3 }, { pointerPath: p, now: NOW });
  assert.equal(fs.existsSync(p), true);
  assert.equal(clearGraphContext({ pointerPath: p }), true);
  assert.equal(fs.existsSync(p), false);
  assert.equal(clearGraphContext({ pointerPath: p }), true); // idempotent
});

// ── tolerance: a broken pointer never throws and never misleads ───────────────

test('readGraphContext: absent / garbage / partial pointer → null (never throws)', () => {
  assert.equal(readGraphContext({ pointerPath: tmp('absent.json') }), null);
  const g = tmp('garbage.json');
  fs.writeFileSync(g, '{not json');
  assert.equal(readGraphContext({ pointerPath: g }), null);
  const partial = tmp('partial.json');
  fs.writeFileSync(partial, JSON.stringify({ repo: 'r' })); // no nodes
  assert.equal(readGraphContext({ pointerPath: partial }), null);
});

test('setGraphContext on an unwritable path → false, swallowed (never throws)', () => {
  // A directory as the pointer path forces a write error; must be swallowed.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-graph-dir-'));
  assert.equal(setGraphContext({ repo: 'r', nodes: 1 }, { pointerPath: dir, now: NOW }), false);
});

// ── pointer path resolution ───────────────────────────────────────────────────

test('pointerPath: env override wins, else ~/.mooter/graph/active-graph.json', () => {
  const prev = process.env.MOOTER_GRAPH_ACTIVE;
  process.env.MOOTER_GRAPH_ACTIVE = '/tmp/custom-graph.json';
  try {
    assert.equal(pointerPath(), '/tmp/custom-graph.json');
  } finally {
    if (prev === undefined) delete process.env.MOOTER_GRAPH_ACTIVE; else process.env.MOOTER_GRAPH_ACTIVE = prev;
  }
  const def = pointerPath();
  assert.match(def, /[\\/]\.mooter[\\/]graph[\\/]active-graph\.json$/);
});
