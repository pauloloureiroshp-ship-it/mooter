'use strict';
// Wave 61 Block 6 — 🕸 graph chip tests. Hermetic: pure buildGraphChip with an
// injected snapshot + `now`; the opt-in gate is driven through the env half
// (MOOTER_STATUSLINE_GRAPH) which is cross-platform, exactly like the
// agents-progress chip tests. Default OFF is verified via optedIn({}).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mod = require('./graph-status.js');
const { buildGraphChip, fmtNodes, optedIn, statusLine, STALE_MS } = mod;

const NOW = 1_700_000_000_000;

// ── buildGraphChip (pure) ─────────────────────────────────────────────────────

test('no snapshot → honest 🕸 ?', () => {
  assert.equal(buildGraphChip(null, NOW), '🕸 ?');
  assert.equal(buildGraphChip({}, NOW), '🕸 ?');
  assert.equal(buildGraphChip({ repo: 'r', nodes: 'x' }, NOW), '🕸 ?');
});

test('resolved & fresh → 🕸 N nós', () => {
  assert.equal(buildGraphChip({ repo: 'myrepo', nodes: 951, resolved: true, ts: NOW }, NOW), '🕸 951 nós');
  assert.equal(buildGraphChip({ repo: 'big', nodes: 1234, resolved: true, ts: NOW }, NOW), '🕸 1.2k nós');
});

test('resolved=false → · stale', () => {
  assert.equal(buildGraphChip({ repo: 'r', nodes: 10, resolved: false, ts: NOW }, NOW), '🕸 10 nós · stale');
});

test('old ts (> STALE_MS) → · stale even when resolved', () => {
  const old = NOW - STALE_MS - 1;
  assert.equal(buildGraphChip({ repo: 'r', nodes: 10, resolved: true, ts: old }, NOW), '🕸 10 nós · stale');
});

test('ts absent/zero → not treated as stale (only resolved flag matters)', () => {
  assert.equal(buildGraphChip({ repo: 'r', nodes: 10, resolved: true, ts: 0 }, NOW), '🕸 10 nós');
});

// ── fmtNodes ──────────────────────────────────────────────────────────────────

test('fmtNodes: thresholds and empty on garbage', () => {
  assert.equal(fmtNodes(951), '951 nós');
  assert.equal(fmtNodes(1234), '1.2k nós');
  assert.equal(fmtNodes(0), '0 nós');
  assert.equal(fmtNodes(-1), '');
  assert.equal(fmtNodes(NaN), '');
});

// ── optedIn gate ──────────────────────────────────────────────────────────────

test('optedIn: default OFF; env or pref turns it ON; hidden_chips wins', () => {
  delete process.env.MOOTER_STATUSLINE_GRAPH;
  assert.equal(optedIn({}), false);
  assert.equal(optedIn({ statusline_chips: { graph: true } }), true);
  assert.equal(optedIn({ statusline_chips: { graph: true }, hidden_chips: ['graph'] }), false);
  process.env.MOOTER_STATUSLINE_GRAPH = '1';
  try {
    assert.equal(optedIn({}), true);
  } finally {
    delete process.env.MOOTER_STATUSLINE_GRAPH;
  }
});

// ── statusLine integration (env-gated, breadcrumb via MOOTER_GRAPH_ACTIVE) ─────

function restore(key, val) {
  if (val === undefined) delete process.env[key]; else process.env[key] = val;
}

test('statusLine: silent when the env gate is OFF, even with a live breadcrumb', () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-graph-off-')), 'active-graph.json');
  fs.writeFileSync(p, JSON.stringify({ repo: 'myrepo', nodes: 951, resolved: true, ts: Date.now() }));
  const prevGate = process.env.MOOTER_STATUSLINE_GRAPH;
  const prevPtr = process.env.MOOTER_GRAPH_ACTIVE;
  delete process.env.MOOTER_STATUSLINE_GRAPH;
  process.env.MOOTER_GRAPH_ACTIVE = p;
  try {
    assert.equal(statusLine(), '');
  } finally {
    restore('MOOTER_STATUSLINE_GRAPH', prevGate); restore('MOOTER_GRAPH_ACTIVE', prevPtr);
  }
});

test('statusLine: env-gated ON renders 🕸 N nós from the breadcrumb', () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-graph-on-')), 'active-graph.json');
  fs.writeFileSync(p, JSON.stringify({ repo: 'myrepo', nodes: 951, resolved: true, ts: Date.now() }));
  const prevGate = process.env.MOOTER_STATUSLINE_GRAPH;
  const prevPtr = process.env.MOOTER_GRAPH_ACTIVE;
  process.env.MOOTER_STATUSLINE_GRAPH = '1';
  process.env.MOOTER_GRAPH_ACTIVE = p;
  try {
    assert.equal(statusLine(), '🕸 951 nós');
  } finally {
    restore('MOOTER_STATUSLINE_GRAPH', prevGate); restore('MOOTER_GRAPH_ACTIVE', prevPtr);
  }
});

test('statusLine: env-gated ON but no breadcrumb → honest 🕸 ?', () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-graph-none-')), 'nope.json');
  const prevGate = process.env.MOOTER_STATUSLINE_GRAPH;
  const prevPtr = process.env.MOOTER_GRAPH_ACTIVE;
  process.env.MOOTER_STATUSLINE_GRAPH = '1';
  process.env.MOOTER_GRAPH_ACTIVE = p;
  try {
    assert.equal(statusLine(), '🕸 ?');
  } finally {
    restore('MOOTER_STATUSLINE_GRAPH', prevGate); restore('MOOTER_GRAPH_ACTIVE', prevPtr);
  }
});
